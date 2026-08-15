import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ChecklistItemsResponseSchema,
  ChecklistQuerySchema,
  ChecklistTemplatesResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
} from '@teamhub/hub-contracts';
import { parseBody, parseQuery, requireActor, sendApplicationError } from '../../routes/helpers.js';
import type { ChecklistService } from './service.js';

async function present<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (sendApplicationError(error, reply)) return reply;
    throw error;
  }
}

export function registerChecklistRoutes(app: FastifyInstance, service: ChecklistService): void {
  app.get('/api/checklist', async (request, reply) => {
    const query = parseQuery(ChecklistQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    return present(reply, async () => ChecklistItemsResponseSchema.parse({
      items: await service.listItems(query.seasonId),
    }));
  });

  app.post('/api/checklist', async (request, reply) => {
    const query = parseQuery(ChecklistQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const body = parseBody(CreateChecklistItemRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => {
      const item = await service.createItem(query.seasonId, body);
      void reply.code(201);
      return CreateChecklistItemResponseSchema.parse({ item });
    });
  });

  app.post<{ Params: { id: string } }>('/api/checklist/:id/clear', async (request, reply) => {
    const query = parseQuery(ChecklistQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const body = parseBody(ClearChecklistItemRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, body.clearedBy, '清偿必须留名（clearedBy）');
    if (!actor) return;
    return present(reply, async () => ClearChecklistItemResponseSchema.parse({
      item: await service.clearItem(request.params.id, query.seasonId, actor),
    }));
  });

  app.post<{ Params: { id: string } }>('/api/checklist/:id/waive', async (request, reply) => {
    const query = parseQuery(ChecklistQuerySchema, request, reply, 'seasonId required');
    if (!query) return;
    const body = parseBody(WaiveChecklistItemRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, body.waivedBy, '豁免必须留名（waivedBy）');
    if (!actor) return;
    return present(reply, async () => WaiveChecklistItemResponseSchema.parse({
      item: await service.waiveItem(
        request.params.id,
        query.seasonId,
        actor,
        body.waiveReason,
      ),
    }));
  });

  app.get('/api/checklist/templates', async (_request, reply) =>
    present(reply, async () => ChecklistTemplatesResponseSchema.parse({
      templates: await service.listTemplates(),
    })),
  );
}
