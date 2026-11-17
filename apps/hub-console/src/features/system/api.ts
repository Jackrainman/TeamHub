import {
  SetupConfigResponseSchema, SetupGraduateResponseSchema, SetupInitResponseSchema,
  SetupStateResponseSchema, SystemStatusResponseSchema,
  type SetupConfigRequest, type SetupConfigResponse, type SetupGraduateResponse,
  type SetupInitRequest, type SetupInitResponse, type SetupStateResponse, type SystemStatusResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, sendJson } from '../../api/http';

export interface SystemSegment {
  getSystemStatus(): Promise<SystemStatusResponse>;
  getSetupState(): Promise<SetupStateResponse>;
  initSetup(req: SetupInitRequest): Promise<SetupInitResponse>;
  setConfig(req: SetupConfigRequest): Promise<SetupConfigResponse>;
  graduate(): Promise<SetupGraduateResponse>;
}
export function createSystemSegment(ctx: HttpContext): SystemSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getSystemStatus() { return fetchJson(`${baseUrl}/api/system/status`, SystemStatusResponseSchema, fetcher); },
    async getSetupState() { return fetchJson(`${baseUrl}/api/setup/state`, SetupStateResponseSchema, fetcher); },
    async initSetup(req) { return postJson(`${baseUrl}/api/setup/init`, req, SetupInitResponseSchema, fetcher, writeToken); },
    async setConfig(req) { return sendJson('PUT', `${baseUrl}/api/setup/config`, req, SetupConfigResponseSchema, fetcher, writeToken); },
    async graduate() { return sendJson('POST', `${baseUrl}/api/setup/graduate`, undefined, SetupGraduateResponseSchema, fetcher, writeToken); },
  };
}
