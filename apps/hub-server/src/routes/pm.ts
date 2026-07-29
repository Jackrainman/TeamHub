import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
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
  ClaimTaskRequestSchema,
  ClaimTaskResponseSchema,
  AssignTaskRequestSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerRequestSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimRequestSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskRequestSchema,
  CompleteTaskResponseSchema,
  ReviewTaskRequestSchema,
  ReviewTaskResponseSchema,
  ChecklistQuerySchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
  ChecklistTemplatesResponseSchema,
  deriveDirectionGaps,
  deriveLeafGroups,
  toDepGraphView,
  wouldCreateCycle,
  isBigTask,
} from '../contracts.js';
import {
  MembersResponseSchema,
  MemberPublicSchema,
  SetPinRequestSchema,
  SetPinResponseSchema,
  ClearPinResponseSchema,
  MemberPinResponseSchema,
  SetGateReviewerRequestSchema,
  SetGateReviewerResponseSchema,
  SetMemberRoleRequestSchema,
  SetMemberRoleResponseSchema,
  SetProjectManagerRequestSchema,
  SetProjectManagerResponseSchema,
  SetupSuperAdminRequestSchema,
  SetupSuperAdminResponseSchema,
  GATE_REVIEWER_DEFAULT_GRADES,
  buildRosterTemplateCsv,
  decodeRosterBytes,
  parseRosterCsv,
  RosterImportReportSchema,
  RosterImportRowsRequestSchema,
  RosterPreviewResponseSchema,
} from '@teamhub/hub-contracts';
import type {
  ActorRef,
  IdentityMode,
  SessionIdentity,
  RosterImportFailure,
  RosterImportRow,
} from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { ChecklistItemDraft, ChecklistStore } from '../store/checklist-store.js';
import type { Clock } from '../clock.js';
import type { SessionManager } from '../identity/session-store.js';
import { isGateReviewer, isGroupLeadOf, isSuperAdmin, memberHasPmFlag } from '../authz.js';
import { hashPin } from '../identity/pin.js';
import { sendLarkMessage } from '../lark-client.js';
import { registerBaselineRoutes } from './baseline.js';
import { firstZodMsg, parseBody, sessionActor, readCsvUpload, isLoopbackOperator, buildSessionCookie } from './helpers.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';

const ROSTER_MAX_BYTES = 1024 * 1024;

export interface PmCoreRouteDeps {
  store: GovStore;
  clock: Clock;
  baselineStore: BaselineStore;
  checklistStore: ChecklistStore;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
  larkStore?: LarkIntegrationStore;
}

export function registerPmCoreRoutes(app: FastifyInstance, deps: PmCoreRouteDeps): void {
  const { store, clock, baselineStore, checklistStore, identityMode } = deps;

  app.get('/api/members', async () => {
    const snapshot = await store.getSnapshot();
    return MembersResponseSchema.parse({ members: snapshot.members });
  });

  app.put<{ Params: { id: string } }>('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const { id } = request.params;
    const pinData = parseBody(SetPinRequestSchema, request, reply);
    if (!pinData) return;
    const snapshot = await store.getSnapshot();
    const target = snapshot.members.find((m) => m.id === id);
    if (!target) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    const isSelf = request.identity?.memberId === id;
    const firstSetup = !target.pinHash;
    if (!isSelf && !firstSetup) {
      void reply.code(403).send({ detail: '只能设置本人 PIN' });
      return;
    }
    const updated = await store.setMemberPin(id, hashPin(pinData.pin), pinData.pin);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return SetPinResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  app.get<{ Params: { id: string } }>('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const { id } = request.params;
    const snapshot = await store.getSnapshot();
    const target = snapshot.members.find((m) => m.id === id);
    if (!target) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    const isSelf = request.identity?.memberId === id;
    if (!isSelf && !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
      void reply.code(403).send({ detail: '只能查看本人 PIN' });
      return;
    }
    if (!target.pinPlaintext) {
      void reply.code(404).send({ detail: '未设置 PIN' });
      return;
    }
    return MemberPinResponseSchema.parse({ pin: target.pinPlaintext });
  });

  app.delete<{ Params: { id: string } }>('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const { id } = request.params;
    const snapshot = await store.getSnapshot();
    if (
      !isLoopbackOperator(request, deps.trustProxy) &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
    const target = snapshot.members.find((m) => m.id === id);
    if (!target) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    const updated = await store.setMemberPin(id, null);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return ClearPinResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  app.post('/api/setup/super-admin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const parsed = parseBody(SetupSuperAdminRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    if (snapshot.members.some((m) => memberHasPmFlag(m))) {
      void reply.code(409).send({ detail: '已存在管理员（项目管理旗标）' });
      return;
    }
    let memberId: string;
    if (parsed.displayName) {
      const existing = snapshot.members.find(
        (m) => m.displayName === parsed.displayName,
      );
      if (existing) {
        memberId = existing.id;
      } else {
        if (!parsed.groupName) {
          void reply.code(400).send({ detail: '新建成员需提供所在组' });
          return;
        }
        const grade = parsed.grade ?? 'freshman';
        const reviewer = GATE_REVIEWER_DEFAULT_GRADES.has(grade);
        const importOutcome = await store.importRoster([
          {
            displayName: parsed.displayName,
            grade,
            groupName: parsed.groupName,
            gateReviewer: reviewer,
            gateReviewerAuto: reviewer,
          },
        ]);
        if (importOutcome.failed.length > 0) {
          void reply.code(400).send({ detail: importOutcome.failed[0].reason });
          return;
        }
        const after = await store.getSnapshot();
        const created = after.members.find(
          (m) => m.displayName === parsed.displayName,
        );
        if (!created) {
          void reply.code(500).send({ detail: 'bootstrap 建成员失败' });
          return;
        }
        memberId = created.id;
        if (parsed.asGroupLead) {
          await store.setMemberRole(memberId, 'groupAdmin');
        }
      }
    } else {
      const selfId = request.identity?.memberId;
      if (!selfId) {
        void reply.code(401).send({ detail: 'login required' });
        return;
      }
      memberId = selfId;
    }
    const pinned = await store.setMemberPin(memberId, hashPin(parsed.pin), parsed.pin);
    if (!pinned) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    if (parsed.projectManager !== false) {
      await store.setProjectManager(memberId, true);
    }
    const finalSnap = await store.getSnapshot();
    const member = finalSnap.members.find((m) => m.id === memberId);
    if (!member) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    if (deps.sessions) {
      const identity: SessionIdentity = {
        memberId: member.id,
        displayName: member.displayName,
        groupId: member.groupId,
        role: member.role,
        gateReviewer: member.gateReviewer,
        projectManager: member.projectManager,
      };
      const token = deps.sessions.create(identity);
      void reply.header('set-cookie', buildSessionCookie(token));
    }
    return SetupSuperAdminResponseSchema.parse({
      member: MemberPublicSchema.parse(member),
    });
  });

  // ── 名册批量导入 ──

  app.get('/api/roster/template', async (_request, reply) => {
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('名册模板.csv')}`,
    );
    void reply.type('text/csv; charset=utf-8');
    return buildRosterTemplateCsv();
  });

  const rosterWriteAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const snapshot = await store.getSnapshot();
    const emptyRoster = snapshot.members.length === 0;
    if (identityMode === 'identity' && !emptyRoster) {
      if (!request.identity) {
        void reply.code(401).send({ detail: 'login required' });
        return false;
      }
      if (!isSuperAdmin(snapshot.members, request.identity.memberId)) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return false;
      }
    }
    return true;
  };

  const readRosterCsvText = (request: FastifyRequest, reply: FastifyReply) =>
    readCsvUpload(request, reply, { maxBytes: ROSTER_MAX_BYTES, decode: decodeRosterBytes });

  app.post('/api/roster/preview', async (request, reply) => {
    if (!(await rosterWriteAuth(request, reply))) return;
    const text = await readRosterCsvText(request, reply);
    if (text === null) return;
    const { rows, errors } = parseRosterCsv(text);
    return RosterPreviewResponseSchema.parse({ rows, failed: errors });
  });

  app.post('/api/roster/import', async (request, reply) => {
    if (!(await rosterWriteAuth(request, reply))) return;
    let rows: RosterImportRow[];
    let parseErrors: RosterImportFailure[] = [];
    if ((request.headers['content-type'] ?? '').includes('application/json')) {
      const parsed = parseBody(RosterImportRowsRequestSchema, request, reply);
      if (!parsed) return;
      rows = parsed.rows;
    } else {
      const text = await readRosterCsvText(request, reply);
      if (text === null) return;
      const parsedCsv = parseRosterCsv(text);
      rows = parsedCsv.rows;
      parseErrors = parsedCsv.errors;
    }
    const outcome = await store.importRoster(rows);
    return RosterImportReportSchema.parse({
      created: outcome.created,
      updated: outcome.updated,
      failed: [...parseErrors, ...outcome.failed],
      missingFromSheet: outcome.missingFromSheet,
      createdGroups: outcome.createdGroups,
      autoReviewers: outcome.autoReviewers,
    });
  });

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
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
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
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
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
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
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
    const snapshot = await store.getSnapshot();
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
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

  // ── 倒排基准线（同域挂载） ──
  registerBaselineRoutes(app, { store, baselineStore, checklistStore });

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
    const parsed = TasksQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'invalid query') });
      return;
    }
    const snapshot = await store.getSnapshot();
    const q = parsed.data.q?.toLowerCase();
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

  // ── 挂单认领制 ──

  app.post('/api/tasks/:taskId/claim', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ClaimTaskRequestSchema, request, reply);
    if (!parsed) return;
    const memberId = request.identity?.memberId ?? parsed.memberId;
    if (!memberId) {
      void reply.code(400).send({ detail: '认领必须留名（memberId）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!snapshot.members.some((m) => m.id === memberId)) {
      void reply.code(400).send({ detail: '认领人不在名册' });
      return;
    }
    if (task.ownerId !== null) {
      void reply.code(409).send({ detail: '任务已有负责人（挂单已被认领）' });
      return;
    }
    const claimed = await store.claimTask(taskId, memberId, clock.now().toISOString());
    if (!claimed) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (deps.larkStore) {
      const cfg = deps.larkStore.getConfig();
      if (cfg?.status === 'connected') {
        const claimer = snapshot.members.find((m) => m.id === memberId);
        const name = claimer?.displayName ?? memberId;
        void sendLarkMessage(cfg.appId, cfg.appSecret, cfg.chatId,
          `[认领] ${claimed.title} ← ${name}`,
        ).catch(() => {});
      }
    }
    return ClaimTaskResponseSchema.parse({ task: claimed });
  });

  app.post('/api/tasks/:taskId/assign', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(AssignTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.assignedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '指派必须留名（assignedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void reply.code(403).send({ detail: '指派权属该组组长' });
      return;
    }
    if (!snapshot.members.some((m) => m.id === parsed.ownerId)) {
      void reply.code(400).send({ detail: '指派对象不在名册' });
      return;
    }
    const assigned = await store.assignTask(
      taskId,
      parsed.ownerId,
      parsed.reason,
      actor,
      clock.now().toISOString(),
    );
    if (!assigned) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return AssignTaskResponseSchema.parse({ task: assigned });
  });

  app.post('/api/tasks/:taskId/partner', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(SetTaskPartnerRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    const partner = snapshot.members.find((m) => m.id === parsed.partnerMemberId);
    if (!partner) {
      void reply.code(400).send({ detail: '搭档不在名册' });
      return;
    }
    if (partner.groupId !== task.groupId) {
      void reply.code(400).send({ detail: '搭档须为本组成员（跨组是学习通道，不是甩锅通道）' });
      return;
    }
    const updated = await store.setTaskPartner(
      taskId,
      parsed.partnerMemberId,
      clock.now().toISOString(),
    );
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return SetTaskPartnerResponseSchema.parse({ task: updated });
  });

  app.post('/api/tasks/:taskId/confirm-cross-claim', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ConfirmCrossClaimRequestSchema, request, reply);
    if (!parsed) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.confirmedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '确认必须留名（confirmedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void reply.code(403).send({ detail: '跨组确认权属该组组长' });
      return;
    }
    const updated = await store.confirmCrossClaim(taskId, actor, clock.now().toISOString());
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return ConfirmCrossClaimResponseSchema.parse({ task: updated });
  });

  app.post('/api/tasks/:taskId/complete', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(CompleteTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.completedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '完成必须留名（completedBy）' });
      return;
    }
    const updated = await store.completeTask(taskId, actor, clock.now().toISOString());
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return CompleteTaskResponseSchema.parse({ task: updated });
  });

  app.post('/api/tasks/:taskId/review', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ReviewTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.reviewedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '验收必须留名（reviewedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    if (!isGateReviewer(snapshot.members, actor.id)) {
      void reply.code(403).send({ detail: '验收权属验收人名单（大三）' });
      return;
    }
    const target = snapshot.tasks.find((t) => t.id === taskId);
    if (!target) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (target.status !== 'done') {
      void reply.code(409).send({ detail: '任务尚未标完成，无法验收/打回（先 complete）' });
      return;
    }
    const updated = await store.reviewTask(
      taskId,
      actor,
      parsed.outcome,
      parsed.note,
      clock.now().toISOString(),
    );
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return ReviewTaskResponseSchema.parse({ task: updated });
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

  // ── 门检查单 / 欠条 ──

  const replyClearWaiveNotApplied = async (
    reply: FastifyReply,
    itemId: string,
    seasonId: string,
    action: string,
  ): Promise<void> => {
    const baseline = await baselineStore.getBaseline(seasonId);
    const exists = baseline
      ? (await checklistStore.listItems(baseline.id)).some((it) => it.id === itemId)
      : false;
    if (exists) {
      void reply.code(409).send({ detail: `检查项已非 pending（已清偿 / 已豁免），无法${action}` });
    } else {
      void reply.code(404).send({ detail: '检查项不存在' });
    }
  };

  app.get('/api/checklist', async (request, reply) => {
    const parsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'seasonId required') });
      return;
    }
    const baseline = await baselineStore.getBaseline(parsed.data.seasonId);
    if (!baseline) return ChecklistItemsResponseSchema.parse({ items: [] });
    const items = await checklistStore.listItems(baseline.id);
    return ChecklistItemsResponseSchema.parse({ items });
  });

  app.post('/api/checklist', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyData = parseBody(CreateChecklistItemRequestSchema, request, reply);
    if (!bodyData) return;

    const baseline = await baselineStore.getBaseline(queryParsed.data.seasonId);
    if (!baseline) {
      void reply.code(404).send({ detail: '该赛季无基准线，无法挂检查项 / 欠条' });
      return;
    }
    const { anchorMilestoneId } = bodyData;
    if (anchorMilestoneId !== undefined) {
      const knownMilestoneIds = new Set(baseline.milestones.map((m) => m.id));
      if (!knownMilestoneIds.has(anchorMilestoneId)) {
        void reply.code(400).send({ detail: `挂接的门 / 里程碑不存在：${anchorMilestoneId}` });
        return;
      }
    }
    const draft: ChecklistItemDraft = {
      seasonBaselineId: baseline.id,
      title: bodyData.title,
      anchorMilestoneId: bodyData.anchorMilestoneId,
      anchorDueAt: bodyData.anchorDueAt,
      origin: bodyData.origin,
      note: bodyData.note,
      createdAt: clock.now().toISOString(),
    };
    try {
      const item = await checklistStore.createItem(draft);
      void reply.code(201);
      return CreateChecklistItemResponseSchema.parse({ item });
    } catch (err) {
      if (err instanceof ZodError) {
        void reply.code(400).send({ detail: firstZodMsg(err) });
        return;
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>('/api/checklist/:id/clear', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const clearData = parseBody(ClearChecklistItemRequestSchema, request, reply);
    if (!clearData) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : clearData.clearedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '清偿必须留名（clearedBy）' });
      return;
    }
    const { id } = request.params;
    const result = await checklistStore.clearItem(id, actor);
    if (result) {
      return ClearChecklistItemResponseSchema.parse({ item: result });
    }
    await replyClearWaiveNotApplied(reply, id, queryParsed.data.seasonId, '清偿');
  });

  app.post<{ Params: { id: string } }>('/api/checklist/:id/waive', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const waiveData = parseBody(WaiveChecklistItemRequestSchema, request, reply);
    if (!waiveData) return;
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : waiveData.waivedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '豁免必须留名（waivedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    if (!isGateReviewer(snapshot.members, actor.id)) {
      void reply.code(403).send({ detail: '豁免权属验收人名单（大三）' });
      return;
    }
    const { id } = request.params;
    const result = await checklistStore.waiveItem(id, actor, waiveData.waiveReason);
    if (result) {
      return WaiveChecklistItemResponseSchema.parse({ item: result });
    }
    await replyClearWaiveNotApplied(reply, id, queryParsed.data.seasonId, '豁免');
  });

  app.get('/api/checklist/templates', async () => {
    const templates = await checklistStore.listTemplates();
    return ChecklistTemplatesResponseSchema.parse({ templates });
  });

  // ── 成员管理写口 ──

  app.put<{ Params: { id: string } }>('/api/members/:id/gate-reviewer', async (request, reply) => {
    const { id } = request.params;
    const parsed = parseBody(SetGateReviewerRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
    const updated = await store.setMemberGateReviewer(id, parsed.gateReviewer);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return SetGateReviewerResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  app.put<{ Params: { id: string } }>('/api/members/:id/role', async (request, reply) => {
    const { id } = request.params;
    const parsed = parseBody(SetMemberRoleRequestSchema, request, reply);
    if (!parsed) return;
    const snapshot = await store.getSnapshot();
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
      return;
    }
    const updated = await store.setMemberRole(id, parsed.role);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return SetMemberRoleResponseSchema.parse({
      member: MemberPublicSchema.parse(updated),
    });
  });

  app.put<{ Params: { id: string } }>(
    '/api/members/:id/project-manager',
    async (request, reply) => {
      const { id } = request.params;
      const parsed = parseBody(SetProjectManagerRequestSchema, request, reply);
      if (!parsed) return;
      const snapshot = await store.getSnapshot();
      if (
        identityMode === 'identity' &&
        !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
      ) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
      const result = await store.setProjectManager(id, parsed.projectManager, {
        guardLastProjectManager: true,
      });
      if (!result.ok) {
        if (result.reason === 'last-projectmanager') {
          void reply.code(409).send({ detail: '不能撤销最后一个项目管理成员' });
        } else {
          void reply.code(404).send({ detail: 'member not found' });
        }
        return;
      }
      return SetProjectManagerResponseSchema.parse({
        member: MemberPublicSchema.parse(result.member),
      });
    },
  );
}
