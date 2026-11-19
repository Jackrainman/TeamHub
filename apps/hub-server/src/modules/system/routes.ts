import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  buildCsv, buildRosterTemplateCsv, ClearPinResponseSchema, CreateGroupRequestSchema, decodeRosterBytes,
  GroupResponseSchema, GroupsResponseSchema, HealthResponseSchema, lookupMemberByDisplayName, MemberPublicSchema,
  MembersResponseSchema, parseRosterCsv, RenameGroupRequestSchema, RosterImportRowsRequestSchema,
  RosterPreviewResponseSchema, SessionRequestSchema, SessionResponseSchema, SetGateReviewerRequestSchema,
  SetGateReviewerResponseSchema, SetMemberRoleRequestSchema, SetMemberRoleResponseSchema,
  SetPinRequestSchema, SetPinResponseSchema, SetProjectManagerRequestSchema, SetProjectManagerResponseSchema,
  SetupConfigRequestSchema, SetupStateResponseSchema, SetupSuperAdminRequestSchema, SetupSuperAdminResponseSchema,
  SystemStatusResponseSchema,
} from '@teamhub/hub-contracts';
import type { AppSettings, IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import { hashPin, verifyPin } from '../../identity/pin.js';
import type { SessionManager } from '../../identity/session-store.js';
import {
  buildSessionCookie, clearSessionCookie, isLoopbackOperator, parseBody, readCsvUpload, readSessionCookie,
} from '../../http/helpers.js';
import { fail } from '../../lib/fail.js';
import { isSuperAdmin } from '../../authz.js';
import { buildHealthResponse, buildSystemStatusResponse } from '../../status.js';
import type { SettingsRepository } from './repository.js';
import type { V1Database } from '../../store/v1-database.js';
import type { SystemTasksPort } from './public.js';

export const RESTART_EXIT_CODE = 42;
export interface SystemRouteDeps {
  repository: SettingsRepository;
  settings: AppSettings;
  tasks: SystemTasksPort;
  identityMode: IdentityMode;
  sessions: SessionManager | null;
  trustProxy: boolean | string;
  cookieSecure?: boolean;
  setupControl?: { database: V1Database; now?: () => Date; exit?: (code: number) => void; restartDelayMs?: number };
}
export function registerSystemRoutes(app: FastifyInstance, deps: SystemRouteDeps): void {
  const { repository, identityMode, sessions } = deps;
  const admin = (request: FastifyRequest): boolean =>
    identityMode !== 'identity' || isSuperAdmin(repository.listMembers(), request.identity?.memberId ?? '');
  const requireAdmin = (request: FastifyRequest, reply: Parameters<typeof fail>[0]): boolean => {
    if (admin(request)) return true;
    void fail(reply, 'FORBIDDEN', { status: 403, detail: '该操作需管理员权限' });
    return false;
  };

  app.get('/health', async () => HealthResponseSchema.parse(buildHealthResponse()));
  app.get('/api/system/status', async () => SystemStatusResponseSchema.parse(buildSystemStatusResponse()));
  app.get('/api/setup/state', async () => {
    const settings = deps.settings;
    return SetupStateResponseSchema.parse({ initialized: true, settings,
      hasPmMember: repository.listMembers().some((member) => member.projectManager) });
  });
  app.post('/api/setup/init', async (_request, reply) => fail(reply, 'CONFLICT', { status: 409, detail: 'TeamHub 已初始化' }));
  app.put('/api/setup/config', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(SetupConfigRequestSchema, request, reply);
    if (!input) return;
    if (!deps.setupControl) return fail(reply, 'NOT_FOUND', { status: 404, detail: 'setup control unavailable' });
    const now = deps.setupControl.now ?? (() => new Date());
    deps.setupControl.database.updateIdentityMode(input.identityMode, now());
    const exit = deps.setupControl.exit ?? ((code: number) => process.exit(code));
    setTimeout(() => exit(RESTART_EXIT_CODE), deps.setupControl.restartDelayMs ?? 500);
    return { restarting: true };
  });
  app.post('/api/setup/graduate', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!deps.setupControl) return fail(reply, 'NOT_FOUND', { status: 404, detail: 'setup control unavailable' });
    try {
      const now = deps.setupControl.now ?? (() => new Date());
      deps.setupControl.database.graduateToReal(now());
      const exit = deps.setupControl.exit ?? ((code: number) => process.exit(code));
      setTimeout(() => exit(RESTART_EXIT_CODE), deps.setupControl.restartDelayMs ?? 500);
      return { restarting: true };
    } catch {
      return fail(reply, 'CONFLICT', { status: 409, detail: '当前已是正式部署' });
    }
  });

  app.get('/api/groups', async () => GroupsResponseSchema.parse({
    groups: repository.listGroups(), assignableGroupIds: repository.listGroups().map((group) => group.id),
  }));
  app.post('/api/groups', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(CreateGroupRequestSchema, request, reply);
    if (!input) return;
    const result = repository.createGroup(input.name);
    if (!result.ok) return fail(reply, 'CONFLICT', { status: 409, detail: `组「${input.name}」已存在` });
    void reply.code(201);
    return GroupResponseSchema.parse({ group: result.group });
  });
  app.put('/api/groups/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(RenameGroupRequestSchema, request, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const result = repository.renameGroup(id, input.name);
    if (!result.ok) return fail(reply, result.reason === 'not-found' ? 'NOT_FOUND' : 'CONFLICT',
      { status: result.reason === 'not-found' ? 404 : 409, detail: result.reason === 'not-found' ? 'group not found' : '组名已存在' });
    return GroupResponseSchema.parse({ group: result.group });
  });
  app.delete('/api/groups/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const result = repository.deleteGroup(id, deps.tasks);
    if (!result.ok) return fail(reply, result.reason === 'not-found' ? 'NOT_FOUND' : 'CONFLICT', {
      status: result.reason === 'not-found' ? 404 : 409,
      detail: result.reason === 'has-members' ? '该组下还有成员' : result.reason === 'has-tasks' ? '该组下还有任务' : 'group not found',
    });
    return GroupResponseSchema.parse({ group: result.group });
  });
  app.get('/api/members', async () => MembersResponseSchema.parse({ members: repository.listMembers() }));

  app.put('/api/members/:id/role', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(SetMemberRoleRequestSchema, request, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const member = repository.setMemberRole(id, input.role);
    return member ? SetMemberRoleResponseSchema.parse({ member }) : fail(reply, 'NOT_FOUND', { status: 404, detail: 'member not found' });
  });
  app.put('/api/members/:id/gate-reviewer', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(SetGateReviewerRequestSchema, request, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const member = repository.setGateReviewer(id, input.gateReviewer);
    return member ? SetGateReviewerResponseSchema.parse({ member }) : fail(reply, 'NOT_FOUND', { status: 404, detail: 'member not found' });
  });
  app.put('/api/members/:id/project-manager', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = parseBody(SetProjectManagerRequestSchema, request, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    const result = repository.setProjectManager(id, input.projectManager);
    if (!result.ok) return fail(reply, result.reason === 'not-found' ? 'NOT_FOUND' : 'CONFLICT', {
      status: result.reason === 'not-found' ? 404 : 409,
      detail: result.reason === 'last-project-manager' ? '不能撤销最后一个管理员' : 'member not found',
    });
    return SetProjectManagerResponseSchema.parse({ member: result.member });
  });
  app.put('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') return fail(reply, 'NOT_FOUND', { status: 404, detail: '身份模式未启用' });
    const input = parseBody(SetPinRequestSchema, request, reply);
    if (!input) return;
    const { id } = request.params as { id: string };
    if (request.identity?.memberId !== id && !isLoopbackOperator(request, deps.trustProxy)) {
      return fail(reply, 'FORBIDDEN', { status: 403, detail: '只能设置本人 PIN' });
    }
    const member = repository.setMemberPin(id, hashPin(input.pin));
    if (!member) return fail(reply, 'NOT_FOUND', { status: 404, detail: 'member not found' });
    sessions?.clearPinUpgrade(id);
    return SetPinResponseSchema.parse({ member: MemberPublicSchema.parse(member) });
  });
  app.delete('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') return fail(reply, 'NOT_FOUND', { status: 404, detail: '身份模式未启用' });
    if (!isLoopbackOperator(request, deps.trustProxy) && !admin(request)) {
      return fail(reply, 'FORBIDDEN', { status: 403, detail: '该操作需管理员权限' });
    }
    const { id } = request.params as { id: string };
    const member = repository.setMemberPin(id, null);
    return member ? ClearPinResponseSchema.parse({ member }) : fail(reply, 'NOT_FOUND', { status: 404, detail: 'member not found' });
  });

  app.post('/api/setup/super-admin', async (request, reply) => {
    if (identityMode !== 'identity') return fail(reply, 'NOT_FOUND', { status: 404, detail: '身份模式未启用' });
    const input = parseBody(SetupSuperAdminRequestSchema, request, reply);
    if (!input) return;
    if (repository.listMembers().some((member) => member.projectManager)) {
      return fail(reply, 'CONFLICT', { status: 409, detail: '已存在管理员' });
    }
    const displayName = input.displayName ?? request.identity?.displayName;
    if (!displayName) return fail(reply, 'UNAUTHENTICATED', { status: 401, detail: 'login required' });
    let member;
    try {
      member = repository.bootstrapAdministrator({
        displayName, groupName: input.groupName, asGroupLead: input.asGroupLead,
        grade: input.grade, pinHash: hashPin(input.pin), currentMemberId: input.displayName ? undefined : request.identity?.memberId,
      });
    } catch (error) {
      return fail(reply, 'VALIDATION_FAILED', { status: 400, detail: (error as Error).message });
    }
    if (sessions) {
      const identity: SessionIdentity = {
        memberId: member.id, displayName: member.displayName, groupId: member.groupId,
        role: member.role, gateReviewer: member.gateReviewer, projectManager: true,
      };
      const token = sessions.create(identity);
      reply.removeHeader('set-cookie');
      void reply.header('set-cookie', buildSessionCookie(token, { secure: deps.cookieSecure }));
    }
    return SetupSuperAdminResponseSchema.parse({ member: MemberPublicSchema.parse(member) });
  });

  app.get('/api/roster/template', async (_request, reply) => {
    void reply.type('text/csv; charset=utf-8');
    return buildRosterTemplateCsv();
  });
  app.post('/api/roster/preview', async (request, reply) => {
    const text = await readCsvUpload(request, reply, { maxBytes: 1024 * 1024, decode: decodeRosterBytes });
    if (text === null) return;
    const result = parseRosterCsv(text);
    return RosterPreviewResponseSchema.parse({ rows: result.rows, failed: result.errors });
  });
  app.post('/api/roster/import', async (request, reply) => {
    if (repository.listMembers().length > 0 && !requireAdmin(request, reply)) return;
    if (request.isMultipart()) {
      const text = await readCsvUpload(request, reply, { maxBytes: 1024 * 1024, decode: decodeRosterBytes });
      if (text === null) return;
      const result = parseRosterCsv(text);
      const report = repository.importRoster(result.rows);
      return { ...report, failed: [...result.errors, ...report.failed] };
    }
    const input = parseBody(RosterImportRowsRequestSchema, request, reply);
    if (!input) return;
    return repository.importRoster(input.rows);
  });

  app.get('/api/export/roster', async (_request, reply) => {
    void reply.type('text/csv; charset=utf-8');
    return buildCsv(['id', '姓名', '年级', '组', '角色'], repository.listMembers().map((member) => [
      member.id, member.displayName, member.grade,
      repository.listGroups().find((group) => group.id === member.groupId)?.name ?? member.groupId, member.role,
    ]));
  });
  app.get('/api/export/tasks', async (_request, reply) => {
    void reply.type('text/csv; charset=utf-8');
    return buildCsv(['id', '标题', '组', '状态', '开始', '结束', '摘要'], deps.tasks.listForExport().map((task) => [
      task.id, task.title, task.groupId, task.status, task.plannedStart ?? '', task.plannedEnd ?? '', task.rawSummary,
    ]));
  });

  app.get('/api/session', async (request) => {
    const token = readSessionCookie(request);
    const member = request.identity ? repository.getMember(request.identity.memberId) : undefined;
    return SessionResponseSchema.parse({ mode: identityMode, session: request.identity,
      mustSetPin: request.identity ? !member?.pinHash || Boolean(token && sessions?.isPinUpgradeRequired(token)) : undefined });
  });
  app.post('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) return fail(reply, 'NOT_FOUND', { status: 404, detail: '身份模式未启用' });
    const input = parseBody(SessionRequestSchema, request, reply);
    if (!input) return;
    const lookup = lookupMemberByDisplayName(repository.listMembers(), input.username);
    if (lookup.kind === 'duplicate') return fail(reply, 'CONFLICT', { status: 409, detail: '姓名重名，需先修复名册' });
    const member = lookup.kind === 'ok' ? lookup.member : undefined;
    const valid = member ? member.pinHash ? input.pin !== undefined && verifyPin(input.pin, member.pinHash) : true : false;
    if (!valid || !member) return fail(reply, 'UNAUTHENTICATED', { status: 401, detail: '登录失败' });
    const identity: SessionIdentity = {
      memberId: member.id, displayName: member.displayName, groupId: member.groupId,
      role: member.role, gateReviewer: member.gateReviewer, projectManager: member.projectManager,
    };
    const upgrade = Boolean(member.pinHash && input.pin !== undefined && input.pin.length < 8);
    const token = sessions.create(identity, { pinUpgradeRequired: upgrade });
    reply.removeHeader('set-cookie');
    void reply.header('set-cookie', buildSessionCookie(token, { secure: deps.cookieSecure }));
    return SessionResponseSchema.parse({ mode: 'identity', session: identity, mustSetPin: !member.pinHash || upgrade });
  });
  app.delete('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) return fail(reply, 'NOT_FOUND', { status: 404, detail: '身份模式未启用' });
    const token = readSessionCookie(request);
    if (token) sessions.destroy(token);
    reply.removeHeader('set-cookie');
    void reply.header('set-cookie', clearSessionCookie({ secure: deps.cookieSecure }));
    return SessionResponseSchema.parse({ mode: 'identity', session: null });
  });
}
