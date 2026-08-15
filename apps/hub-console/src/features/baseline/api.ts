import {
  BaselineResponseSchema,
  UpdateBaselineResponseSchema,
  type BaselineResponse,
  type UpdateBaselineRequest,
  type UpdateBaselineResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, sendJson } from '../../api/http';

export interface BaselineSegment {
  getBaseline(seasonId: string): Promise<BaselineResponse>;
  updateBaseline(
    seasonId: string,
    req: UpdateBaselineRequest,
  ): Promise<UpdateBaselineResponse>;
}

export function createBaselineSegment(ctx: HttpContext): BaselineSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getBaseline(seasonId) {
      return fetchJson(
        `${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`,
        BaselineResponseSchema,
        fetcher,
      );
    },
    async updateBaseline(seasonId, req) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        UpdateBaselineResponseSchema,
        fetcher,
        writeToken,
      );
    },
  };
}
