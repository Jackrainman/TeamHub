import { z } from 'zod';
import {
  AdaptersResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
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
  adapters: AdaptersResponseSchema,
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
