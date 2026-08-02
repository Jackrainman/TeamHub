import {
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  type PresenceScheduleResponse,
  type ResourceSessionsResponse,
  type SharedResourcesResponse,
} from '@teamhub/hub-contracts';
import {
  RelayBoardResponseSchema,
  UpdateResourceSessionResponseSchema,
  RelayHandoffResponseSchema,
  CreateResourceSessionResponseSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchResponseSchema,
  type RelayBoardResponse,
  type UpdateResourceSessionRequest,
  type UpdateResourceSessionResponse,
  type CreateRelayHandoffRequest,
  type RelayHandoffResponse,
  type CreateResourceSessionRequest,
  type CreateResourceSessionResponse,
  type UpdateResourceDefaultPresetRequest,
  type UpdateResourceDefaultPresetResponse,
  type CreateResourceSessionsBatchRequest,
  type CreateResourceSessionsBatchResponse,
} from '../schemas/schedule';
import {
  CreateResourceResponseSchema,
  CreateResourcesBatchResponseSchema,
  UpdateResourceResponseSchema,
  type CreateResourceRequest,
  type CreateResourceResponse,
  type CreateResourcesBatchRequest,
  type CreateResourcesBatchResponse,
  type UpdateResourceStatusRequest,
  type UpdateResourceResponse,
} from '../schemas/resources';
import type { HttpContext } from '../http';
import { fetchJson, postJson, sendJson, DeletedResponseSchema } from '../http';

export interface ScheduleSegment {
  getSchedule(windowLabel: string): Promise<PresenceScheduleResponse>;
  getResourceSessions(): Promise<ResourceSessionsResponse>;
  getResources(): Promise<SharedResourcesResponse>;
  createResource(req: CreateResourceRequest): Promise<CreateResourceResponse>;
  createResourcesBatch(req: CreateResourcesBatchRequest): Promise<CreateResourcesBatchResponse>;
  updateResourceStatus(id: string, patch: UpdateResourceStatusRequest): Promise<UpdateResourceResponse>;
  getRelay(windowLabel: string): Promise<RelayBoardResponse>;
  updateResourceSession(id: string, patch: UpdateResourceSessionRequest): Promise<UpdateResourceSessionResponse>;
  createResourceSession(req: CreateResourceSessionRequest): Promise<CreateResourceSessionResponse>;
  createRelayHandoff(req: CreateRelayHandoffRequest): Promise<RelayHandoffResponse>;
  deleteRelayHandoff(id: string): Promise<{ deleted: string }>;
  deleteResourceSession(id: string): Promise<{ deleted: string }>;
  updateResourceDefaultPreset(id: string, patch: UpdateResourceDefaultPresetRequest): Promise<UpdateResourceDefaultPresetResponse>;
  createResourceSessionsBatch(req: CreateResourceSessionsBatchRequest): Promise<CreateResourceSessionsBatchResponse>;
}

export function createScheduleSegment(ctx: HttpContext): ScheduleSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getSchedule(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/schedule?windowLabel=${encodeURIComponent(windowLabel)}`,
        PresenceScheduleResponseSchema,
        fetcher,
      );
    },
    async getResourceSessions() {
      return fetchJson(`${baseUrl}/api/resource-sessions`, ResourceSessionsResponseSchema, fetcher);
    },
    async getResources() {
      return fetchJson(`${baseUrl}/api/resources`, SharedResourcesResponseSchema, fetcher);
    },
    async createResource(req: CreateResourceRequest) {
      return postJson(`${baseUrl}/api/resources`, req, CreateResourceResponseSchema, fetcher, writeToken);
    },
    async createResourcesBatch(req: CreateResourcesBatchRequest) {
      return postJson(`${baseUrl}/api/resources/batch`, req, CreateResourcesBatchResponseSchema, fetcher, writeToken);
    },
    async updateResourceStatus(id: string, patch: UpdateResourceStatusRequest) {
      return sendJson('PATCH', `${baseUrl}/api/resources/${encodeURIComponent(id)}/status`, patch, UpdateResourceResponseSchema, fetcher, writeToken);
    },
    async getRelay(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/relay?windowLabel=${encodeURIComponent(windowLabel)}`,
        RelayBoardResponseSchema,
        fetcher,
      );
    },
    async updateResourceSession(id: string, patch: UpdateResourceSessionRequest) {
      return sendJson('PATCH', `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`, patch, UpdateResourceSessionResponseSchema, fetcher, writeToken);
    },
    async createResourceSession(req: CreateResourceSessionRequest) {
      return postJson(`${baseUrl}/api/resource-sessions`, req, CreateResourceSessionResponseSchema, fetcher, writeToken);
    },
    async createRelayHandoff(req: CreateRelayHandoffRequest) {
      return postJson(`${baseUrl}/api/relay-handoffs`, req, RelayHandoffResponseSchema, fetcher, writeToken);
    },
    async deleteRelayHandoff(id: string) {
      return sendJson('DELETE', `${baseUrl}/api/relay-handoffs/${encodeURIComponent(id)}`, undefined, DeletedResponseSchema, fetcher, writeToken);
    },
    async deleteResourceSession(id: string) {
      return sendJson('DELETE', `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`, undefined, DeletedResponseSchema, fetcher, writeToken);
    },
    async updateResourceDefaultPreset(id: string, patch: UpdateResourceDefaultPresetRequest) {
      return sendJson('PATCH', `${baseUrl}/api/resources/${encodeURIComponent(id)}/preset`, patch, UpdateResourceDefaultPresetResponseSchema, fetcher, writeToken);
    },
    async createResourceSessionsBatch(req: CreateResourceSessionsBatchRequest) {
      return postJson(`${baseUrl}/api/resource-sessions/batch`, req, CreateResourceSessionsBatchResponseSchema, fetcher, writeToken);
    },
  };
}
