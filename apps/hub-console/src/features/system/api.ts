import {
  SetupConfigResponseSchema,
  SetupGraduateResponseSchema,
  SetupInitResponseSchema,
  SetupStateResponseSchema,
  SystemStatusResponseSchema,
  AgentBackendsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  ArtifactsResponseSchema,
  HealthResponseSchema,
  type SetupConfigRequest,
  type SetupConfigResponse,
  type SetupGraduateResponse,
  type SetupInitRequest,
  type SetupInitResponse,
  type SetupStateResponse,
  type SystemStatusResponse,
} from '@teamhub/hub-contracts';
import { z } from 'zod';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, sendJson } from '../../api/http';

/** OverviewSnapshot 是 console 专有聚合视图（9 端点并发聚合），非后端契约，留本文件本地定义。 */
export const OverviewSnapshotSchema = z.object({
  health: HealthResponseSchema,
  system: SystemStatusResponseSchema,
  botChannels: BotChannelsResponseSchema,
  agentBackends: AgentBackendsResponseSchema,
  dataSources: DataSourcesResponseSchema,
  events: HubEventsResponseSchema,
  bridgeMembers: BridgeMembersResponseSchema,
  gitRepos: GitReposResponseSchema,
  artifacts: ArtifactsResponseSchema,
});
export type OverviewSnapshot = z.infer<typeof OverviewSnapshotSchema>;

/**
 * system 域 API 分段（ARCH-UNIFY A4；前身 segments/members.ts 的 setup 半 + segments/system-pm.ts 的
 * overview/status 半 + schemas/system.ts 转发层）。getOverview 是 console 侧聚合读（9 端点并发），
 * 端点对照 server modules/system。
 */
export interface SystemSegment {
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getSetupState(): Promise<SetupStateResponse>;
  initSetup(req: SetupInitRequest): Promise<SetupInitResponse>;
  setConfig(req: SetupConfigRequest): Promise<SetupConfigResponse>;
  graduate(): Promise<SetupGraduateResponse>;
}

export function createSystemSegment(ctx: HttpContext): SystemSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getOverview() {
      const [
        health,
        system,
        botChannels,
        agentBackends,
        dataSources,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      ] = await Promise.all([
        fetchJson(`${baseUrl}/health`, HealthResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/system/status`, SystemStatusResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/bot-channels`, BotChannelsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/agent-backends`, AgentBackendsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/data-sources`, DataSourcesResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/events`, HubEventsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/bridge/members`, BridgeMembersResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/git/repos`, GitReposResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher),
      ]);
      return OverviewSnapshotSchema.parse({
        health, system, botChannels, agentBackends, dataSources, events, bridgeMembers, gitRepos, artifacts,
      });
    },
    async getSystemStatus() {
      return fetchJson(`${baseUrl}/api/system/status`, SystemStatusResponseSchema, fetcher);
    },
    async getSetupState() {
      return fetchJson(`${baseUrl}/api/setup/state`, SetupStateResponseSchema, fetcher);
    },
    async initSetup(req: SetupInitRequest) {
      return postJson(`${baseUrl}/api/setup/init`, req, SetupInitResponseSchema, fetcher, writeToken);
    },
    async setConfig(req: SetupConfigRequest) {
      return sendJson('PUT', `${baseUrl}/api/setup/config`, req, SetupConfigResponseSchema, fetcher, writeToken);
    },
    async graduate() {
      return sendJson('POST', `${baseUrl}/api/setup/graduate`, undefined, SetupGraduateResponseSchema, fetcher, writeToken);
    },
  };
}
