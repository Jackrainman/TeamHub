import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CreateRelayHandoffRequestSchema,
  CreateResourceRequestSchema,
  CreateResourceResponseSchema,
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  CreateResourceSessionsBatchRequestSchema,
  CreateResourceSessionsBatchResponseSchema,
  CreateResourcesBatchRequestSchema,
  CreateResourcesBatchResponseSchema,
  FleetPreviewResponseSchema,
  PresenceScheduleResponseSchema,
  RelayBoardResponseSchema,
  RelayHandoffResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  UpdateResourceDefaultPresetRequestSchema,
  UpdateResourceDefaultPresetResponseSchema,
  UpdateResourceResponseSchema,
  UpdateResourceSessionRequestSchema,
  UpdateResourceSessionResponseSchema,
  UpdateResourceStatusRequestSchema,
  buildFleetTemplateCsv,
  decodeCsvBytes,
} from '@teamhub/hub-contracts';
import type { SessionIdentity } from '@teamhub/hub-contracts';
import {
  firstZodMsg,
  parseBody,
  parseQuery,
  readCsvUpload,
  sessionActor,
} from '../../routes/helpers.js';
import { ScheduleService, ScheduleValidationError } from './service.js';

const FLEET_IMPORT_MAX_BYTES = 1024 * 1024;

/** 排班 querystring（server 专用）。 */
const ScheduleQuerySchema = z.object({
  windowLabel: z.string().min(1),
});

export interface ScheduleRouteDeps {
  service: ScheduleService;
}

/**
 * 排班域路由（ARCH-UNIFY A4；前身 routes/schedule.ts）。只做 parse/身份合入/调 service/错误映射；
 * 业务校验（批量窗口冲突、接力成环）在 ScheduleService，抛 ScheduleValidationError → 400。
 */
export function registerScheduleRoutes(app: FastifyInstance, deps: ScheduleRouteDeps): void {
  const { service } = deps;

  const identityOf = (request: FastifyRequest) =>
    (request as FastifyRequest & { identity: SessionIdentity | null }).identity;

  app.get('/api/schedule', async (request, reply) => {
    const query = parseQuery(ScheduleQuerySchema, request, reply, 'windowLabel required');
    if (!query) return;
    return PresenceScheduleResponseSchema.parse(await service.getPresenceSchedule(query.windowLabel));
  });

  app.get('/api/resource-sessions', async () => {
    return ResourceSessionsResponseSchema.parse({ sessions: await service.listResourceSessions() });
  });

  app.get('/api/resources', async () => {
    return SharedResourcesResponseSchema.parse({ resources: await service.listResources() });
  });

  app.post('/api/resources', async (request, reply) => {
    const parsed = parseBody(CreateResourceRequestSchema, request, reply);
    if (!parsed) return;
    const { projectId, name, kind, robotTarget, season, version } = parsed;
    const resource = await service.createResource({ projectId, name, kind, robotTarget, season, version });
    void reply.code(201);
    return CreateResourceResponseSchema.parse({ resource });
  });

  app.get('/api/resources/template', async (_request, reply) => {
    void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('车队模板.csv')}`);
    void reply.type('text/csv; charset=utf-8');
    return buildFleetTemplateCsv();
  });

  const readFleetCsvText = (request: FastifyRequest, reply: FastifyReply) =>
    readCsvUpload(request, reply, { maxBytes: FLEET_IMPORT_MAX_BYTES, decode: decodeCsvBytes });

  app.post('/api/resources/preview', async (request, reply) => {
    const text = await readFleetCsvText(request, reply);
    if (text === null) return;
    const { rows, errors } = service.previewFleetCsv(text);
    return FleetPreviewResponseSchema.parse({ rows, failed: errors });
  });

  app.post('/api/resources/batch', async (request, reply) => {
    const parsed = CreateResourcesBatchRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rowIdx = typeof issue?.path[1] === 'number' ? issue.path[1] : null;
      const detail = rowIdx !== null ? `第 ${rowIdx + 1} 台：${issue?.message ?? 'invalid body'}` : firstZodMsg(parsed.error);
      void reply.code(400).send({ detail });
      return;
    }
    const created = await service.createResourcesBatch(parsed.data);
    void reply.code(201);
    return CreateResourcesBatchResponseSchema.parse({ resources: created });
  });

  app.patch('/api/resources/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceStatusRequestSchema, request, reply);
    if (!parsed) return;
    const resource = await service.updateResourceStatus(id, parsed);
    if (!resource) { void reply.code(404).send({ detail: 'resource not found' }); return; }
    return UpdateResourceResponseSchema.parse({ resource });
  });

  app.patch('/api/resources/:id/preset', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceDefaultPresetRequestSchema, request, reply);
    if (!parsed) return;
    const resource = await service.setResourceDefaultPreset(id, parsed.defaultPreset);
    if (!resource) { void reply.code(404).send({ detail: 'resource not found' }); return; }
    return UpdateResourceDefaultPresetResponseSchema.parse({ resource });
  });

  app.post('/api/resource-sessions', async (request, reply) => {
    const parsed = parseBody(CreateResourceSessionRequestSchema, request, reply);
    if (!parsed) return;
    const identity = identityOf(request);
    const draft = identity ? { ...parsed, confirmedBy: sessionActor(identity) } : parsed;
    const session = await service.createResourceSession(draft);
    void reply.code(201);
    return CreateResourceSessionResponseSchema.parse({ session });
  });

  app.post('/api/resource-sessions/batch', async (request, reply) => {
    const parsed = parseBody(CreateResourceSessionsBatchRequestSchema, request, reply);
    if (!parsed) return;
    const identity = identityOf(request);
    const confirmedBy = identity ? sessionActor(identity) : parsed.confirmedBy;
    try {
      const created = await service.createResourceSessionsBatch(parsed, confirmedBy);
      void reply.code(201);
      return CreateResourceSessionsBatchResponseSchema.parse({ sessions: created });
    } catch (err) {
      if (err instanceof ScheduleValidationError) {
        void reply.code(400).send({ detail: err.detail });
        return;
      }
      throw err;
    }
  });

  app.patch('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceSessionRequestSchema, request, reply);
    if (!parsed) return;
    const session = await service.updateResourceSession(id, parsed);
    if (!session) { void reply.code(404).send({ detail: 'resource session not found' }); return; }
    return UpdateResourceSessionResponseSchema.parse({ session });
  });

  app.delete('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await service.deleteResourceSession(id);
    if (!ok) { void reply.code(404).send({ detail: 'resource session not found' }); return; }
    return { deleted: id };
  });

  app.get('/api/relay', async (request, reply) => {
    const query = parseQuery(ScheduleQuerySchema, request, reply, 'windowLabel required');
    if (!query) return;
    return RelayBoardResponseSchema.parse(await service.getRelayBoard(query.windowLabel));
  });

  app.post('/api/relay-handoffs', async (request, reply) => {
    const parsed = parseBody(CreateRelayHandoffRequestSchema, request, reply);
    if (!parsed) return;
    const identity = identityOf(request);
    const confirmedBy = identity ? sessionActor(identity) : undefined;
    try {
      const handoff = await service.createRelayHandoff(parsed, confirmedBy);
      void reply.code(201);
      return RelayHandoffResponseSchema.parse({ handoff });
    } catch (err) {
      if (err instanceof ScheduleValidationError) {
        void reply.code(400).send({ detail: err.detail });
        return;
      }
      throw err;
    }
  });

  app.delete('/api/relay-handoffs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await service.deleteRelayHandoff(id);
    if (!ok) { void reply.code(404).send({ detail: 'relay handoff not found' }); return; }
    return { deleted: id };
  });
}
