import type { FastifyInstance } from 'fastify';
import {
  DepGraphSchema,
  GroupGapsResponseSchema,
  GroupsResponseSchema,
  SeasonsResponseSchema,
  CreateGroupRequestSchema,
  RenameGroupRequestSchema,
  GroupResponseSchema,
  CreateSeasonRequestSchema,
  CreateSeasonResponseSchema,
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  TasksResponseSchema,
  TasksQuerySchema,
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  WaiveDependencyResponseSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  deriveDirectionGaps,
  deriveLeafGroups,
  toDepGraphView,
  wouldCreateCycle,
  isBigTask,
} from '@teamhub/hub-contracts';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { Clock } from '../clock.js';
import { parseBody, parseQuery, requireSuperAdmin, sessionActor } from './helpers.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';

export interface TaskRouteDeps {
  store: GovStore;
  clock: Clock;
  identityMode: IdentityMode;
  larkStore?: LarkIntegrationStore;
}

export function registerTaskRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  const { store, clock, identityMode } = deps;

  // ── 组管理 ──

  app.get('/api/groups', async () => {
    const snapshot = await store.getSnapshot();
    return GroupsResponseSchema.parse({
      groups: snapshot.groups,
      assignableGroupIds: deriveLeafGroups(snapshot.groups),
    });
  });

  app.post('/api/groups', async (request, reply) => {
    const groupData = parseBody(CreateGroupRequestSchema, request, reply);
    if (!groupData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    const result = await store.createGroup({ name: groupData.name.trim() });
    if (!result.ok) {
      void reply.code(409).send({ detail: `组「${groupData.name}」已存在` });
      return;
    }
    void reply.code(201);
    return GroupResponseSchema.parse({ group: result.group });
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    const renameData = parseBody(RenameGroupRequestSchema, request, reply);
    if (!renameData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    const result = await store.renameGroup(id, renameData.name.trim());
    if (!result.ok) {
      if (result.reason === 'not-found') {
        void reply.code(404).send({ detail: 'group not found' });
      } else if (result.reason === 'not-leaf') {
        void reply.code(409).send({ detail: '汇报视角组（含子组或是联调哨兵组）不可改名' });
      } else {
        void reply.code(409).send({ detail: `组「${renameData.name}」已存在` });
      }
      return;
    }
    return GroupResponseSchema.parse({ group: result.group });
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    const result = await store.deleteGroup(id);
    if (!result.ok) {
      if (result.reason === 'not-found') {
        void reply.code(404).send({ detail: 'group not found' });
      } else {
        const detail =
          result.reason === 'not-leaf'
            ? '汇报视角组（含子组或是联调哨兵组）不可删除'
            : result.reason === 'has-children'
              ? '该组下有子组，不能删除'
              : result.reason === 'has-members'
                ? '该组下还有成员，先迁走成员再删'
                : '该组下还有任务，先迁走任务再删';
        void reply.code(409).send({ detail });
      }
      return;
    }
    return GroupResponseSchema.parse({ group: result.group });
  });

  // ── 赛季 ──

  app.get('/api/seasons', async () => {
    const snapshot = await store.getSnapshot();
    return SeasonsResponseSchema.parse({ seasons: snapshot.seasons });
  });

  app.post('/api/seasons', async (request, reply) => {
    const seasonData = parseBody(CreateSeasonRequestSchema, request, reply);
    if (!seasonData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply))) return;
    }
    const snapshot = await store.getSnapshot();
    const { name, startsAt, endsAt } = seasonData;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      void reply.code(400).send({ detail: 'endsAt must be after startsAt' });
      return;
    }
    if (snapshot.seasons.some((s) => s.name === name)) {
      void reply.code(400).send({ detail: `season name already exists: ${name}` });
      return;
    }
    const season = await store.createSeason({ name, startsAt, endsAt: endsAt ?? null });
    void reply.code(201);
    return CreateSeasonResponseSchema.parse({ season });
  });

  // ── 依赖链 / 方向缺口 ──

  app.get('/api/dep-graph', async () => {
    const snapshot = await store.getSnapshot();
    return DepGraphSchema.parse(toDepGraphView(snapshot, clock.now().toISOString()));
  });

  app.get('/api/group-gaps', async () => {
    const snapshot = await store.getSnapshot();
    const now = clock.now().toISOString();
    return GroupGapsResponseSchema.parse({
      gaps: deriveDirectionGaps(snapshot, now),
      generatedAt: now,
    });
  });

  // ── 任务 ──

  app.post('/api/tasks', async (request, reply) => {
    const parsed = parseBody(CreateTaskRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    const knownGroup = snapshot.groups.find((g) => g.id === parsed.groupId);
    if (knownGroup && !deriveLeafGroups(snapshot.groups).includes(knownGroup.id)) {
      void reply
        .code(400)
        .send({ detail: `组「${knownGroup.name}」是汇报视角（含子组或是联调哨兵组），任务请挂到其下的具体小组` });
      return;
    }
    const task = await store.createTask(parsed);
    void reply.code(201);
    return CreateTaskResponseSchema.parse({ task });
  });

  app.get('/api/tasks', async (request, reply) => {
    const query = parseQuery(TasksQuerySchema, request, reply);
    if (!query) return;
    const snapshot = await store.getSnapshot();
    const q = query.q?.toLowerCase();
    const matched = q
      ? snapshot.tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.rawSummary.toLowerCase().includes(q),
        )
      : snapshot.tasks;
    const tasks = matched.map((task) => ({
      ...task,
      isBig: isBigTask(task, snapshot.dependencies),
    }));
    return TasksResponseSchema.parse({ tasks });
  });

  app.post('/api/tasks/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(TransitionTaskStatusRequestSchema, request, reply);
    if (!parsed) return;
    const task = await store.updateTaskStatus(taskId, parsed.status);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return TransitionTaskStatusResponseSchema.parse({ task });
  });

  // ── 依赖 / 前置需求 ──

  app.post('/api/dependencies', async (request, reply) => {
    const parsed = parseBody(CreateDependencyRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    const { fromTaskId, toTaskId } = parsed;
    if (
      wouldCreateCycle(
        snapshot.dependencies.filter((d) => d.status !== 'waived'),
        fromTaskId,
        toTaskId,
      )
    ) {
      void reply.code(400).send({
        detail:
          fromTaskId === toTaskId
            ? 'self dependency not allowed'
            : 'dependency would create a cycle',
      });
      return;
    }
    const draft = request.identity
      ? { ...parsed, confirmedBy: sessionActor(request.identity) }
      : parsed;
    const dependency = await store.createDependency(draft);
    void reply.code(201);
    return CreateDependencyResponseSchema.parse({ dependency });
  });

  app.post('/api/dependencies/:depId/waive', async (request, reply) => {
    const { depId } = request.params as { depId: string };
    const dependency = await store.waiveDependency(depId);
    if (!dependency) {
      void reply.code(404).send({ detail: 'dependency not found' });
      return;
    }
    return WaiveDependencyResponseSchema.parse({ dependency });
  });

  app.post('/api/needs', async (request, reply) => {
    const parsed = parseBody(CreateNeedRequestSchema, request, reply);
    if (!parsed) return;
    const draft = request.identity
      ? { ...parsed, confirmedBy: sessionActor(request.identity) }
      : parsed;
    const need = await store.createNeed(draft);
    void reply.code(201);
    return CreateNeedResponseSchema.parse({ need });
  });
}
