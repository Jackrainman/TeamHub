import { z } from 'zod';
import {
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  HealthResponseSchema,
  SystemStatusResponseSchema,
} from '@teamhub/hub-contracts';

// D-052 重复真相收口：Health / SystemStatus 契约下沉 hub-contracts（与 hub-server 共用同一源），
// 此前本文件与 hub-server/contracts.ts 各声明一份、字段逐字重复。OverviewSnapshot 是 console 专有聚合视图，留此。
export const OverviewSnapshotSchema = z.object({
  health: HealthResponseSchema,
  system: SystemStatusResponseSchema,
  // 集成三分（地基重建）：扁平 adapters 拆成 BOT 渠道 / Agent 后端 / 数据源三块。
  botChannels: BotChannelsResponseSchema,
  agentBackends: AgentBackendsResponseSchema,
  dataSources: DataSourcesResponseSchema,
  events: HubEventsResponseSchema,
  bridgeMembers: BridgeMembersResponseSchema,
  gitRepos: GitReposResponseSchema,
  artifacts: ArtifactsResponseSchema,
});

// re-export 维持既有 import 路径（client.ts / overview.ts 仍 from './schemas/system'）。
export {
  HealthResponseSchema,
  SystemStatusResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  HealthResponse,
  SystemStatusResponse,
} from '@teamhub/hub-contracts';
export type OverviewSnapshot = z.infer<typeof OverviewSnapshotSchema>;
