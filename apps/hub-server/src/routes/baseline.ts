import type { FastifyInstance } from 'fastify';
import {
  BaselineResponseSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
} from '@teamhub/hub-contracts';
import { BaselineQuerySchema } from '../route-schemas.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { GateChecklistPort } from '../modules/checklist/repository.js';
import type { GovStore } from '../store/gov-store.js';
import { parseBody, parseQuery, sessionActor } from './helpers.js';

export interface BaselineRouteDeps {
  store: GovStore;
  baselineStore: BaselineStore;
  gateChecklist: GateChecklistPort;
}

export function registerBaselineRoutes(app: FastifyInstance, deps: BaselineRouteDeps): void {
  const { store, baselineStore, gateChecklist } = deps;

  app.get('/api/baseline', async (request, reply) => {
    const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const baseline = await baselineStore.getBaseline(query.seasonId);
    return BaselineResponseSchema.parse({ baseline });
  });

  app.patch('/api/baseline', async (request, reply) => {
    const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const bodyParsed = parseBody(UpdateBaselineRequestSchema, request, reply);
    if (!bodyParsed) return;
    const baseline = await baselineStore.upsertBaseline(query.seasonId, bodyParsed);
    return UpdateBaselineResponseSchema.parse({ baseline });
  });

  app.post<{ Params: { milestoneId: string } }>(
    '/api/baseline/milestones/:milestoneId/pass',
    async (request, reply) => {
      const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
      if (!query) return;
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
        const baseline = await baselineStore.getBaseline(query.seasonId);
        if (baseline) {
          const blocking = await gateChecklist.listBlockingItems(baseline.id, milestoneId);
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
        query.seasonId,
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
