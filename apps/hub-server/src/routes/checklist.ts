import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import {
  ChecklistQuerySchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
  ChecklistTemplatesResponseSchema,
} from '../contracts.js';
import type { ActorRef } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { ChecklistItemDraft, ChecklistStore } from '../store/checklist-store.js';
import type { Clock } from '../clock.js';
import { isGateReviewer } from '../authz.js';
import { firstZodMsg, parseBody, sessionActor } from './helpers.js';

export interface ChecklistRouteDeps {
  store: GovStore;
  clock: Clock;
  baselineStore: BaselineStore;
  checklistStore: ChecklistStore;
}

export function registerChecklistRoutes(app: FastifyInstance, deps: ChecklistRouteDeps): void {
  const { store, clock, baselineStore, checklistStore } = deps;

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
}
