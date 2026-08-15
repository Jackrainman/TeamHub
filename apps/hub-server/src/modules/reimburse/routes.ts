import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateReimburseBatchRequestSchema,
  CreateReimburseEntryRequestSchema,
  CreateReimburseEntryResponseSchema,
  GetReimburseProfileResponseSchema,
  ReimburseBatchResponseSchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntriesResponseSchema,
  StockInContextResponseSchema,
  StockInRequestSchema,
  StockInResponseSchema,
  UpdateReimburseBatchRequestSchema,
  UpdateReimburseEntryRequestSchema,
  UpdateReimburseEntryResponseSchema,
  UpdateReimburseProfileRequestSchema,
  UpdateReimburseProfileResponseSchema,
} from '@teamhub/hub-contracts';
import { parseBody, requireActor, sendApplicationError } from '../../routes/helpers.js';
import type { ReimburseService } from './service.js';

export interface ReimburseRouteDeps {
  service: ReimburseService;
}

async function present<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (sendApplicationError(error, reply)) return reply;
    throw error;
  }
}

export function registerReimburseRoutes(app: FastifyInstance, { service }: ReimburseRouteDeps): void {
  app.get('/api/reimburse/entries', async (request, reply) =>
    present(reply, async () => ReimburseEntriesResponseSchema.parse({
      entries: await service.listEntries(request.identity),
    })),
  );

  app.post('/api/reimburse/entries', async (request, reply) => {
    const body = parseBody(CreateReimburseEntryRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '报账录入须先登录');
    if (!actor) return;
    return present(reply, () => {
      const entry = service.createEntry({ ...body, memberId: actor.id, batchId: null });
      void reply.code(201);
      return CreateReimburseEntryResponseSchema.parse({ entry });
    });
  });

  app.patch('/api/reimburse/entries/:id', async (request, reply) => {
    const body = parseBody(UpdateReimburseEntryRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '改报账条目须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => UpdateReimburseEntryResponseSchema.parse({
      entry: await service.updateEntry(id, body, actor),
    }));
  });

  app.get('/api/reimburse/profile', async (_request, reply) =>
    present(reply, () => GetReimburseProfileResponseSchema.parse({ profile: service.getProfile() })),
  );

  app.put('/api/reimburse/profile', async (request, reply) => {
    const body = parseBody(UpdateReimburseProfileRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => UpdateReimburseProfileResponseSchema.parse({
      profile: await service.updateProfile(body, request.identity),
    }));
  });

  app.get('/api/reimburse/batches', async (request, reply) =>
    present(reply, async () => ReimburseBatchesResponseSchema.parse(
      await service.listBatches(request.identity),
    )),
  );

  app.post('/api/reimburse/batches', async (request, reply) => {
    const body = parseBody(CreateReimburseBatchRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => {
      const batch = await service.createBatch(body, request.identity);
      void reply.code(201);
      return ReimburseBatchResponseSchema.parse({ batch });
    });
  });

  app.patch('/api/reimburse/batches/:id', async (request, reply) => {
    const body = parseBody(UpdateReimburseBatchRequestSchema, request, reply);
    if (!body) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseBatchResponseSchema.parse({
      batch: await service.updateBatch(id, body, request.identity),
    }));
  });

  app.get('/api/reimburse/stock-in-context', async (request, reply) => {
    return present(reply, async () => StockInContextResponseSchema.parse(
      await service.getStockInContext(request.identity),
    ));
  });

  app.post('/api/reimburse/entries/:id/stock-in', async (request, reply) => {
    const body = parseBody(StockInRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '入库确认须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => {
      const result = service.stockIn({
        entryId: id,
        lines: body.lines,
        actor,
        canManageAll: await service.canManageAll(actor.id),
      });
      void reply.code(201);
      return StockInResponseSchema.parse(result);
    });
  });
}
