import type { FastifyInstance } from 'fastify';
import {
  MemberPublicSchema,
  MembersResponseSchema,
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
} from '@teamhub/hub-contracts';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { PmRepository } from './repository.js';
import type { SessionManager } from '../../identity/session-store.js';
import { isSuperAdmin, memberHasPmFlag } from '../../authz.js';
import { hashPin } from '../../identity/pin.js';
import { parseBody, isLoopbackOperator, buildSessionCookie } from '../../http/helpers.js';

export interface MemberRouteDeps {
  store: PmRepository;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
}

export function registerMemberRoutes(app: FastifyInstance, deps: MemberRouteDeps): void {
  const { store, identityMode } = deps;

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
