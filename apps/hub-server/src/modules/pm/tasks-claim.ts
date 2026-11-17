import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  AssignTaskRequestSchema,
  AssignTaskResponseSchema,
  ClaimTaskRequestSchema,
  ClaimTaskResponseSchema,
  CompleteTaskRequestSchema,
  CompleteTaskResponseSchema,
  ConfirmCrossClaimRequestSchema,
  ConfirmCrossClaimResponseSchema,
  ReviewTaskRequestSchema,
  ReviewTaskResponseSchema,
  ReleaseTaskRequestSchema,
  ReleaseTaskResponseSchema,
  SetTaskPartnerRequestSchema,
  SetTaskPartnerResponseSchema,
} from '@teamhub/hub-contracts';
import { isGroupLeadOf } from '../../authz.js';
import { sendLarkMessage } from '../integrations/lark-client.js';
import { parseBody, requireActor } from '../../http/helpers.js';
import type { PmOutcome } from './service.js';
import type { TaskRouteDeps } from './tasks.js';
import { LEGACY_CODE_MAP } from '@teamhub/hub-contracts';
import { fail } from '../../lib/fail.js';

function sendOutcome<T>(
  reply: FastifyReply,
  outcome: PmOutcome<T>,
  render: (value: T) => unknown,
): unknown {
  if (!outcome.ok) {
    void reply.code(outcome.status).send({ ...(outcome.code ? { code: outcome.code } : {}), detail: outcome.detail });
    return undefined;
  }
  return render(outcome.value);
}

/**
 * 挂单认领制路由（ARCH-UNIFY A4；前身 routes/tasks-claim.ts）。
 * 名册/权属/状态前置校验在 PmService；authz 纯函数（isGroupLeadOf/isGateReviewer）与留名注入、
 * 飞书通知副作用留本层。
 */
export function registerTaskClaimRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  const { store, service } = deps;

  app.post('/api/tasks/:taskId/claim', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ClaimTaskRequestSchema, request, reply);
    if (!parsed) return;
    const memberId = request.identity?.memberId ?? parsed.memberId;
    if (!memberId) {
      void fail(reply, 'VALIDATION_FAILED', { status: 400, detail: '认领必须留名（memberId）' });
      return;
    }
    if (parsed.weekKey && !request.identity) return fail(reply, LEGACY_CODE_MAP.PM_SESSION_REQUIRED, { status: 403, detail: '请先登录后认领周任务', fields: { reason: 'PM_SESSION_REQUIRED' } });
    const outcome = await service.claimTask(taskId, memberId, parsed.weekKey);
    if (!outcome.ok) {
      void reply.code(outcome.status).send({ detail: outcome.detail });
      return;
    }
    const { task: claimed, claimer } = outcome.value;
    if (deps.larkStore) {
      const cfg = deps.larkStore.getConfig();
      if (cfg?.status === 'connected') {
        void sendLarkMessage(cfg.appId, cfg.appSecret, cfg.chatId,
          `[认领] ${claimed.title} ← ${claimer.displayName}`,
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
      void fail(reply, 'NOT_FOUND', { status: 404, detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void fail(reply, 'FORBIDDEN', { status: 403, detail: '指派权属该组组长' });
      return;
    }
    return sendOutcome(
      reply,
      await service.assignTask(taskId, parsed.ownerId, parsed.reason, actor),
      (assigned) => AssignTaskResponseSchema.parse({ task: assigned }),
    );
  });

  app.post('/api/tasks/:taskId/release', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ReleaseTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor = requireActor(request, reply, parsed.releasedBy, '退池必须留名（releasedBy）');
    if (!actor) return;
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void fail(reply, 'NOT_FOUND', { status: 404, detail: 'task not found' });
      return;
    }
    if (task.ownerId !== actor.id && !isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void fail(reply, 'FORBIDDEN', { status: 403, detail: '退池权属当前完成人或本组组长' });
      return;
    }
    return sendOutcome(
      reply,
      await service.releaseTask(taskId, actor, parsed.reason),
      (released) => ReleaseTaskResponseSchema.parse({ task: released }),
    );
  });

  app.post('/api/tasks/:taskId/partner', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(SetTaskPartnerRequestSchema, request, reply);
    if (!parsed) return;
    return sendOutcome(
      reply,
      await service.setTaskPartner(taskId, parsed.partnerMemberId),
      (updated) => SetTaskPartnerResponseSchema.parse({ task: updated }),
    );
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
      void fail(reply, 'NOT_FOUND', { status: 404, detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void fail(reply, 'FORBIDDEN', { status: 403, detail: '跨组确认权属该组组长' });
      return;
    }
    return sendOutcome(
      reply,
      await service.confirmCrossClaim(taskId, actor),
      (updated) => ConfirmCrossClaimResponseSchema.parse({ task: updated }),
    );
  });

  app.post('/api/tasks/:taskId/complete', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(CompleteTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor = requireActor(request, reply, parsed.completedBy, '完成必须留名（completedBy）');
    if (!actor) return;
    return sendOutcome(
      reply,
      await service.completeTask(taskId, actor, !!request.identity),
      (updated) => CompleteTaskResponseSchema.parse({ task: updated }),
    );
  });

  app.post('/api/tasks/:taskId/review', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = parseBody(ReviewTaskRequestSchema, request, reply);
    if (!parsed) return;
    const actor = requireActor(request, reply, parsed.reviewedBy, '验收必须留名（reviewedBy）');
    if (!actor) return;
    return sendOutcome(
      reply,
      await service.reviewTask(taskId, actor, parsed.outcome, parsed.note, !!request.identity, parsed.expectedRevision, parsed.delivery),
      (updated) => ReviewTaskResponseSchema.parse({ task: updated }),
    );
  });
}
