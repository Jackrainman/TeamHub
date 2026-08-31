import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  BaselineResponseSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
} from '@teamhub/hub-contracts';
import { z } from 'zod';

/** 基准线 querystring（server 专用）。 */
const BaselineQuerySchema = z.object({
  seasonId: z.string().min(1),
});
import {
  parseBody,
  parseQuery,
  sendApplicationError,
  sessionActor,
} from '../../http/helpers.js';
import type { BaselineService } from './service.js';

async function present<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (sendApplicationError(error, reply)) return reply;
    throw error;
  }
}

export function registerBaselineRoutes(app: FastifyInstance, service: BaselineService): void {
  app.get('/api/baseline', async (request, reply) => {
    const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    return present(reply, async () => BaselineResponseSchema.parse({
      baseline: await service.getBaseline(query.seasonId),
    }));
  });

  app.patch('/api/baseline', async (request, reply) => {
    const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const body = parseBody(UpdateBaselineRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => UpdateBaselineResponseSchema.parse({
      baseline: await service.upsertBaseline(query.seasonId, body),
    }));
  });

  app.post<{ Params: { milestoneId: string } }>(
    '/api/baseline/milestones/:milestoneId/pass',
    async (request, reply) => {
      const query = parseQuery(BaselineQuerySchema, request, reply, 'seasonId required');
      if (!query) return;
      const body = parseBody(PassMilestoneRequestSchema, request, reply);
      if (!body) return;
      return present(reply, async () => PassMilestoneResponseSchema.parse({
        baseline: await service.passMilestone(
          query.seasonId,
          request.params.milestoneId,
          body,
          request.identity ? sessionActor(request.identity) : body.passedBy,
        ),
      }));
    },
  );
}
