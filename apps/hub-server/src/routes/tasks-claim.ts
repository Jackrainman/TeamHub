import type { FastifyInstance } from 'fastify';
import {
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
} from '@teamhub/hub-contracts';
import { isGateReviewer, isGroupLeadOf } from '../authz.js';
import { sendLarkMessage } from '../lark-client.js';
import { parseBody, requireActor } from './helpers.js';
import type { TaskRouteDeps } from './tasks.js';

export function registerTaskClaimRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  const { store, clock } = deps;

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
    const actor = requireActor(request, reply, parsed.assignedBy, '指派必须留名（assignedBy）');
    if (!actor) return;
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
    const actor = requireActor(request, reply, parsed.confirmedBy, '确认必须留名（confirmedBy）');
    if (!actor) return;
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
    const actor = requireActor(request, reply, parsed.completedBy, '完成必须留名（completedBy）');
    if (!actor) return;
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
    const actor = requireActor(request, reply, parsed.reviewedBy, '验收必须留名（reviewedBy）');
    if (!actor) return;
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
}
