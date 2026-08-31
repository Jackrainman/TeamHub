import type { FastifyInstance } from 'fastify';
import {
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  CreateGroupRequestSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  CreateSeasonRequestSchema,
  CreateSeasonResponseSchema,
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  DepGraphSchema,
  GroupGapsResponseSchema,
  GroupResponseSchema,
  GroupsResponseSchema,
  RenameGroupRequestSchema,
  SeasonsResponseSchema,
  TasksQuerySchema,
  TasksResponseSchema,
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { PmRepository } from './repository.js';
import { parseBody, parseQuery, requireSuperAdmin, sessionActor } from '../../routes/helpers.js';
import type { LarkIntegrationStore } from '../../store/lark-integration-store.js';
import { PmService } from './service.js';
import type { PmOutcome } from './service.js';
import type { FastifyReply } from 'fastify';

export interface TaskRouteDeps {
  store: PmRepository;
  service: PmService;
  identityMode: IdentityMode;
  larkStore?: LarkIntegrationStore;
}

/** PmOutcome → HTTP：service 已带 status/detail，route 只映射。 */
function sendOutcome<T>(
  reply: FastifyReply,
  outcome: PmOutcome<T>,
  render: (value: T) => unknown,
  created = false,
): unknown {
  if (!outcome.ok) {
    void reply.code(outcome.status).send({ detail: outcome.detail });
    return undefined;
  }
  if (created) void reply.code(201);
  return render(outcome.value);
}

/**
 * pm 域任务/组/赛季/依赖/需求路由（ARCH-UNIFY A4；前身 routes/tasks.ts）。
 * 业务校验全在 PmService；本文件只剩 parse/超管鉴权/留名注入/HTTP 映射。
 */
export function registerTaskRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  const { store, service, identityMode } = deps;

  // ── 组管理 ──

  app.get('/api/groups', async () => {
    return GroupsResponseSchema.parse(await service.listGroups());
  });

  app.post('/api/groups', async (request, reply) => {
    const groupData = parseBody(CreateGroupRequestSchema, request, reply);
    if (!groupData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    return sendOutcome(reply, await service.createGroup(groupData.name.trim()), (group) =>
      GroupResponseSchema.parse({ group }),
      true,
    );
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    const renameData = parseBody(RenameGroupRequestSchema, request, reply);
    if (!renameData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    return sendOutcome(reply, await service.renameGroup(id, renameData.name.trim()), (group) =>
      GroupResponseSchema.parse({ group }),
    );
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    return sendOutcome(reply, await service.deleteGroup(id), (group) =>
      GroupResponseSchema.parse({ group }),
    );
  });

  // ── 赛季 ──

  app.get('/api/seasons', async () => {
    return SeasonsResponseSchema.parse({ seasons: await service.listSeasons() });
  });

  app.post('/api/seasons', async (request, reply) => {
    const seasonData = parseBody(CreateSeasonRequestSchema, request, reply);
    if (!seasonData) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply))) return;
    }
    return sendOutcome(
      reply,
      await service.createSeason(seasonData),
      (season) => CreateSeasonResponseSchema.parse({ season }),
      true,
    );
  });

  // ── 依赖链 / 方向缺口 ──

  app.get('/api/dep-graph', async () => {
    return DepGraphSchema.parse(await service.getDepGraph());
  });

  app.get('/api/group-gaps', async () => {
    return GroupGapsResponseSchema.parse(await service.getGroupGaps());
  });

  // ── 任务 ──

  app.post('/api/tasks', async (request, reply) => {
    const parsed = parseBody(CreateTaskRequestSchema, request, reply);
    if (!parsed) return;
    return sendOutcome(
      reply,
      await service.createTask(parsed),
      (task) => CreateTaskResponseSchema.parse({ task }),
      true,
    );
  });

  app.get('/api/tasks', async (request, reply) => {
    const query = parseQuery(TasksQuerySchema, request, reply);
    if (!query) return;
    return TasksResponseSchema.parse({ tasks: await service.listTasks(query.q) });
  });

  app.post('/api/tasks/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(TransitionTaskStatusRequestSchema, request, reply);
    if (!parsed) return;
    // TASK-TIMELINE 留名：身份模式服务端注入 sessionActor（防冒充）、匿名模式 body 供名、皆无则记无 by
    const by = request.identity ? sessionActor(request.identity) : parsed.by;
    return sendOutcome(reply, await service.transitionTaskStatus(taskId, parsed.status, by), (task) =>
      TransitionTaskStatusResponseSchema.parse({ task }),
    );
  });

  // ── 依赖 / 前置需求 ──

  app.post('/api/dependencies', async (request, reply) => {
    const parsed = parseBody(CreateDependencyRequestSchema, request, reply);
    if (!parsed) return;
    const draft = request.identity
      ? { ...parsed, confirmedBy: sessionActor(request.identity) }
      : parsed;
    return sendOutcome(
      reply,
      await service.createDependency(draft),
      (dependency) => CreateDependencyResponseSchema.parse({ dependency }),
      true,
    );
  });

  app.post('/api/dependencies/:depId/waive', async (request, reply) => {
    const { depId } = request.params as { depId: string };
    return sendOutcome(reply, await service.waiveDependency(depId), (dependency) =>
      WaiveDependencyResponseSchema.parse({ dependency }),
    );
  });

  app.post('/api/needs', async (request, reply) => {
    const parsed = parseBody(CreateNeedRequestSchema, request, reply);
    if (!parsed) return;
    const draft = request.identity
      ? { ...parsed, confirmedBy: sessionActor(request.identity) }
      : parsed;
    const need = await service.createNeed(draft);
    void reply.code(201);
    return CreateNeedResponseSchema.parse({ need });
  });
}
