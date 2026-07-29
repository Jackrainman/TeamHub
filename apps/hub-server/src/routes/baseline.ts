import type { FastifyInstance } from 'fastify';
import {
  BaselineQuerySchema,
  BaselineResponseSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
  listBlockingChecklistItems,
} from '../contracts.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { ChecklistStore } from '../store/checklist-store.js';
import type { GovStore } from '../store/gov-store.js';
import type { SessionIdentity, ActorRef } from '@teamhub/hub-contracts';
import { firstZodMsg, parseBody, sessionActor } from './helpers.js';

export interface BaselineRouteDeps {
  store: GovStore;
  baselineStore: BaselineStore;
  checklistStore: ChecklistStore;
}

export function registerBaselineRoutes(app: FastifyInstance, deps: BaselineRouteDeps): void {
  const { store, baselineStore, checklistStore } = deps;

  app.get('/api/baseline', async (request, reply) => {
    const parsed = BaselineQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'seasonId required') });
      return;
    }
    const baseline = await baselineStore.getBaseline(parsed.data.seasonId);
    return BaselineResponseSchema.parse({ baseline });
  });

  app.patch('/api/baseline', async (request, reply) => {
    const queryParsed = BaselineQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyParsed = parseBody(UpdateBaselineRequestSchema, request, reply);
    if (!bodyParsed) return;
    const baseline = await baselineStore.upsertBaseline(queryParsed.data.seasonId, bodyParsed);
    return UpdateBaselineResponseSchema.parse({ baseline });
  });

  app.post<{ Params: { milestoneId: string } }>(
    '/api/baseline/milestones/:milestoneId/pass',
    async (request, reply) => {
      const queryParsed = BaselineQuerySchema.safeParse(request.query ?? {});
      if (!queryParsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
        return;
      }
      const bodyParsed = parseBody(PassMilestoneRequestSchema, request, reply);
      if (!bodyParsed) return;
      const { evidenceRefs } = bodyParsed;
      if (evidenceRefs && evidenceRefs.length > 0) {
        const snapshot = await store.getSnapshot();
        const knownArtifactIds = new Set(snapshot.artifacts.map((a) => a.id));
        const orphan = evidenceRefs.find((id) => !knownArtifactIds.has(id));
        if (orphan) {
          void reply.code(400).send({ detail: `证据引用的归档物不存在：${orphan}` });
          return;
        }
      }
      const { milestoneId } = request.params;
      if (bodyParsed.status === 'passed') {
        const baseline = await baselineStore.getBaseline(queryParsed.data.seasonId);
        if (baseline) {
          const items = await checklistStore.listItems(baseline.id);
          const blocking = listBlockingChecklistItems(items, milestoneId);
          if (blocking.length > 0) {
            const titles = blocking.map((it) => it.title).join('、');
            void reply.code(400).send({ detail: `检查项未清：${titles}` });
            return;
          }
        }
      }
      const passData = request.identity
        ? { ...bodyParsed, passedBy: sessionActor(request.identity) }
        : bodyParsed;
      const baseline = await baselineStore.passMilestone(
        queryParsed.data.seasonId,
        milestoneId,
        passData,
      );
      if (!baseline) {
        void reply.code(404).send({ detail: '基准线或里程碑不存在' });
        return;
      }
      return PassMilestoneResponseSchema.parse({ baseline });
    },
  );
}
