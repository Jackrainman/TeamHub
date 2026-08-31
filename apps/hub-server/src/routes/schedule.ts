import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  wouldCreateCycle,
  derivePresenceSchedule,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  deriveRelayBoard,
  UpdateResourceSessionRequestSchema,
  UpdateResourceSessionResponseSchema,
  CreateRelayHandoffRequestSchema,
  RelayHandoffResponseSchema,
  RelayBoardResponseSchema,
  CreateResourceRequestSchema,
  CreateResourceResponseSchema,
  CreateResourcesBatchRequestSchema,
  CreateResourcesBatchResponseSchema,
  UpdateResourceStatusRequestSchema,
  UpdateResourceResponseSchema,
  UpdateResourceDefaultPresetRequestSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchRequestSchema,
  CreateResourceSessionsBatchResponseSchema,

  buildFleetTemplateCsv,
  decodeCsvBytes,
  parseFleetCsv,
  FleetPreviewResponseSchema,
} from '@teamhub/hub-contracts';
import { z } from 'zod';

/** 排班 querystring（server 专用）。 */
const ScheduleQuerySchema = z.object({
  windowLabel: z.string().min(1),
});
import type { SessionIdentity } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { Clock } from '../clock.js';
import { firstZodMsg, parseBody, parseQuery, readCsvUpload, sessionActor, buildScheduleSnapshot } from './helpers.js';

const FLEET_IMPORT_MAX_BYTES = 1024 * 1024;

export interface ScheduleRouteDeps {
  store: GovStore;
  clock: Clock;
}

export function registerPresenceScheduleRoutes(app: FastifyInstance, deps: ScheduleRouteDeps): void {
  const { store, clock } = deps;

  app.get('/api/schedule', async (request, reply) => {
    const query = parseQuery(ScheduleQuerySchema, request, reply, 'windowLabel required');
    if (!query) return;
    const { windowLabel } = query;
    const scheduleSnapshot = await buildScheduleSnapshot(store);
    const recommendations = derivePresenceSchedule(scheduleSnapshot, clock.now().toISOString(), windowLabel);
    return PresenceScheduleResponseSchema.parse({ windowLabel, recommendations });
  });

  app.get('/api/resource-sessions', async () => {
    const sessions = await store.listResourceSessions();
    return ResourceSessionsResponseSchema.parse({ sessions });
  });

  app.get('/api/resources', async () => {
    const resources = await store.listResources();
    return SharedResourcesResponseSchema.parse({ resources });
  });

  app.post('/api/resources', async (request, reply) => {
    const parsed = parseBody(CreateResourceRequestSchema, request, reply);
    if (!parsed) return;
    const { projectId, name, kind, robotTarget, season, version } = parsed;
    const resource = await store.createResource({ projectId, name, kind, robotTarget, season, version });
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
    const { rows, errors } = parseFleetCsv(text);
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
    const created = [];
    for (const row of parsed.data.resources) {
      const resource = await store.createResource({ projectId: 'prj-robots', name: row.name, kind: row.kind, robotTarget: row.robotTarget, season: row.season, version: row.version });
      if (row.status && row.status !== 'available') {
        const migrated = await store.updateResourceStatus(resource.id, { status: row.status, statusReason: row.statusReason ?? null });
        created.push(migrated ?? resource);
      } else {
        created.push(resource);
      }
    }
    void reply.code(201);
    return CreateResourcesBatchResponseSchema.parse({ resources: created });
  });

  app.patch('/api/resources/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceStatusRequestSchema, request, reply);
    if (!parsed) return;
    const resource = await store.updateResourceStatus(id, parsed);
    if (!resource) { void reply.code(404).send({ detail: 'resource not found' }); return; }
    return UpdateResourceResponseSchema.parse({ resource });
  });

  app.patch('/api/resources/:id/preset', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceDefaultPresetRequestSchema, request, reply);
    if (!parsed) return;
    const resource = await store.setResourceDefaultPreset(id, parsed.defaultPreset);
    if (!resource) { void reply.code(404).send({ detail: 'resource not found' }); return; }
    return UpdateResourceDefaultPresetResponseSchema.parse({ resource });
  });

  app.post('/api/resource-sessions', async (request, reply) => {
    const parsed = parseBody(CreateResourceSessionRequestSchema, request, reply);
    if (!parsed) return;
    const identity = (request as FastifyRequest & { identity: SessionIdentity | null }).identity;
    const draft = identity ? { ...parsed, confirmedBy: sessionActor(identity) } : parsed;
    const session = await store.createResourceSession(draft);
    void reply.code(201);
    return CreateResourceSessionResponseSchema.parse({ session });
  });

  app.post('/api/resource-sessions/batch', async (request, reply) => {
    const parsed = parseBody(CreateResourceSessionsBatchRequestSchema, request, reply);
    if (!parsed) return;
    const { windowLabel, sessions } = parsed;
    const identity = (request as FastifyRequest & { identity: SessionIdentity | null }).identity;
    const confirmedBy = identity ? sessionActor(identity) : parsed.confirmedBy;
    const [snapshot, resources, existingSessions] = await Promise.all([store.getSnapshot(), store.listResources(), store.listResourceSessions()]);
    const resourceIds = new Set(resources.map((r) => r.id));
    const groupIds = new Set(snapshot.groups.map((g) => g.id));
    const taskIds = new Set(snapshot.tasks.map((t) => t.id));
    const orderKeys = new Set(existingSessions.map((s) => `${s.resourceId}|${s.windowLabel}|${s.orderInWindow}`));
    for (const [index, draft] of sessions.entries()) {
      if (draft.windowLabel !== windowLabel) { void reply.code(400).send({ detail: `sessions[${index}].windowLabel 须与请求 windowLabel 一致` }); return; }
      if (!resourceIds.has(draft.resourceId)) { void reply.code(400).send({ detail: `sessions[${index}]: 未知 resourceId ${draft.resourceId}` }); return; }
      if (!groupIds.has(draft.holderGroupId)) { void reply.code(400).send({ detail: `sessions[${index}]: 未知 holderGroupId ${draft.holderGroupId}` }); return; }
      if (draft.holderTaskId !== null && !taskIds.has(draft.holderTaskId)) { void reply.code(400).send({ detail: `sessions[${index}]: 未知 holderTaskId ${draft.holderTaskId}` }); return; }
      const orderKey = `${draft.resourceId}|${draft.windowLabel}|${draft.orderInWindow}`;
      if (orderKeys.has(orderKey)) { void reply.code(400).send({ detail: `sessions[${index}]: 该车该窗口 orderInWindow=${draft.orderInWindow} 已被占用` }); return; }
      orderKeys.add(orderKey);
    }
    const drafts = sessions.map((draft) => ({ projectId: draft.projectId, resourceId: draft.resourceId, windowLabel: draft.windowLabel, orderInWindow: draft.orderInWindow, holderGroupId: draft.holderGroupId, holderTaskId: draft.holderTaskId, invitedMemberIds: [] as string[], note: draft.note, eta: draft.eta, confirmedBy }));
    const created = await store.createResourceSessionsBatch(drafts);
    void reply.code(201);
    return CreateResourceSessionsBatchResponseSchema.parse({ sessions: created });
  });

  app.patch('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateResourceSessionRequestSchema, request, reply);
    if (!parsed) return;
    const session = await store.updateResourceSession(id, parsed);
    if (!session) { void reply.code(404).send({ detail: 'resource session not found' }); return; }
    return UpdateResourceSessionResponseSchema.parse({ session });
  });

  app.delete('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await store.deleteResourceSession(id);
    if (!ok) { void reply.code(404).send({ detail: 'resource session not found' }); return; }
    return { deleted: id };
  });

  app.get('/api/relay', async (request, reply) => {
    const query = parseQuery(ScheduleQuerySchema, request, reply, 'windowLabel required');
    if (!query) return;
    const { windowLabel } = query;
    const scheduleSnapshot = await buildScheduleSnapshot(store);
    const board = deriveRelayBoard(scheduleSnapshot, windowLabel);
    return RelayBoardResponseSchema.parse(board);
  });

  app.post('/api/relay-handoffs', async (request, reply) => {
    const parsed = parseBody(CreateRelayHandoffRequestSchema, request, reply);
    if (!parsed) return;
    const { fromSessionId, toSessionId, windowLabel } = parsed;
    const sessionsById = new Map((await store.listResourceSessions()).map((s) => [s.id, s] as const));
    const fromSession = sessionsById.get(fromSessionId);
    const toSession = sessionsById.get(toSessionId);
    if (!fromSession || !toSession) { void reply.code(400).send({ detail: 'from/to session not found' }); return; }
    if (fromSession.windowLabel !== windowLabel || toSession.windowLabel !== windowLabel) { void reply.code(400).send({ detail: 'from/to sessions must belong to the same windowLabel as the handoff' }); return; }
    const existingEdges = (await store.listRelayHandoffs()).map((h) => ({ fromTaskId: h.fromSessionId, toTaskId: h.toSessionId }));
    if (wouldCreateCycle(existingEdges, fromSessionId, toSessionId)) {
      void reply.code(400).send({ detail: fromSessionId === toSessionId ? 'self handoff not allowed' : 'relay handoff would create a cycle' });
      return;
    }
    const identity = (request as FastifyRequest & { identity: SessionIdentity | null }).identity;
    const handoffDraft = identity ? { ...parsed, confirmedBy: sessionActor(identity) } : parsed;
    const handoff = await store.createRelayHandoff(handoffDraft);
    void reply.code(201);
    return RelayHandoffResponseSchema.parse({ handoff });
  });

  app.delete('/api/relay-handoffs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await store.deleteRelayHandoff(id);
    if (!ok) { void reply.code(404).send({ detail: 'relay handoff not found' }); return; }
    return { deleted: id };
  });
}
