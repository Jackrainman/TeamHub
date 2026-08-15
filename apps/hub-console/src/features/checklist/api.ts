import {
  ChecklistItemsResponseSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemResponseSchema,
  type ChecklistItemsResponse,
  type CreateChecklistItemRequest,
  type CreateChecklistItemResponse,
  type ClearChecklistItemRequest,
  type ClearChecklistItemResponse,
  type WaiveChecklistItemRequest,
  type WaiveChecklistItemResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson } from '../../api/http';

export interface ChecklistSegment {
  getChecklist(seasonId: string): Promise<ChecklistItemsResponse>;
  createChecklistItem(
    seasonId: string,
    req: CreateChecklistItemRequest,
  ): Promise<CreateChecklistItemResponse>;
  clearChecklistItem(
    id: string,
    seasonId: string,
    req: ClearChecklistItemRequest,
  ): Promise<ClearChecklistItemResponse>;
  waiveChecklistItem(
    id: string,
    seasonId: string,
    req: WaiveChecklistItemRequest,
  ): Promise<WaiveChecklistItemResponse>;
}

export function createChecklistSegment(ctx: HttpContext): ChecklistSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getChecklist(seasonId) {
      return fetchJson(
        `${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`,
        ChecklistItemsResponseSchema,
        fetcher,
      );
    },
    async createChecklistItem(seasonId, req) {
      return postJson(
        `${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        CreateChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async clearChecklistItem(id, seasonId, req) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/clear?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        ClearChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async waiveChecklistItem(id, seasonId, req) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/waive?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        WaiveChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
  };
}
