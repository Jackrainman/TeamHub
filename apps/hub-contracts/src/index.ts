export {
  AdapterCapabilitiesResponseSchema,
  AdapterDescriptorSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  AdaptersResponseSchema,
  AgentBackendSchema,
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeRequestSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BotChannelSchema,
  BotChannelsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  DataSourceSchema,
  DataSourcesResponseSchema,
  ErrorResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventSchema,
  HubEventSourceSchema,
  HubEventTypeSchema,
  HubEventsResponseSchema,
} from './schemas.js';
export type {
  AdapterCapabilitiesResponse,
  AdapterDescriptor,
  AdapterHealthResponse,
  AdapterInvokeRequest,
  AdapterInvokeResponse,
  AdaptersResponse,
  AgentBackend,
  AgentBackendCapabilitiesResponse,
  AgentBackendHealthResponse,
  AgentBackendInvokeRequest,
  AgentBackendInvokeResponse,
  AgentBackendsResponse,
  ArtifactRef,
  ArtifactsResponse,
  BotChannel,
  BotChannelsResponse,
  BridgeMemberState,
  BridgeMembersResponse,
  DataSource,
  DataSourcesResponse,
  ErrorResponse,
  GitRepoRef,
  GitReposResponse,
  HubEvent,
  HubEventSource,
  HubEventType,
  HubEventsResponse,
} from './schemas.js';
export {
  CONTRACT_FIXTURE_TIME,
  agentBackendCapabilitiesFixture,
  agentBackendFixtures,
  agentBackendHealthFixture,
  agentBackendInvokeResponseFixture,
  botChannelFixtures,
  dataSourceFixtures,
  apiContractFixtures,
  artifactRefFixtures,
  bridgeMemberStateFixtures,
  gitRepoRefFixtures,
  hubEventFixtures,
  governanceScenarioFixture,
  baselineScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
  memberKnowledgeFixtures,
  scheduleScenarioFixture,
  scheduleResourceDownFixture,
  SCENARIO_WINDOW_WEEKDAY,
  SCENARIO_WINDOW_CONVERGENCE,
  GOVERNANCE_SCENARIO_TIME,
  GOVERNANCE_SCENARIO_NOW,
  // per-module seed builder（模块化第5步·§5）：无机器人租户可只调 buildPmSeed()+buildKbSeed()
  buildPmSeed,
  buildKbSeed,
  buildLedgerSeed,
  buildArchiveSeed,
  buildGovernanceSeed,
  buildScheduleSeed,
  buildScheduleResourceDownVariant,
} from './fixtures.js';
export type {
  PmSeedFixture,
  KbGrowthSeedFixture,
  LedgerAllocationRefs,
} from './fixtures.js';

// 共享基元（ActorRef / isoDateTime）+ 治理主轴域（D-028，拆 pm-core/schedule-infra 两文件）
// + 成长轴 + 派生算法 + 在场排班（D-029）+ 知识库（KB-CORE）
export * from './common.js';
// 倒排基准线（BASELINE-CORE，D-083 §4.1）：独立域文件，先于 pm-core 导出——
// pm-core.ts:TaskSchema.investment 复用本文件 TaskInvestmentSchema（红线3：不塞 pm-core 本体形状）。
export * from './baseline.js';
export * from './pm-core.js';
export * from './schedule-infra.js';
export * from './growth.js';
export * from './attribution.js';
export * from './direction-gaps.js';
export * from './study-suggestions.js';
export * from './artifact-version.js';
export * from './schedule.js';
export * from './relay.js';
export * from './kb.js';
export * from './kb-similar.js';
export * from './kb-closeout.js';
export * from './inventory.js';
// 跨端单一源（D-052 重复真相收口）：errorCode 派生 / 系统状态契约 / PM 写请求契约
export * from './error-code.js';
export * from './system-status.js';
export * from './pm-requests.js';
// 装配契约（HUB-MODULARIZATION 第2步）：ModuleDescriptor / TenantConfig / VocabularyRegistry，只接口不实现。
export * from './assembly.js';
// robotics 垂直包（HUB-MODULARIZATION 第6步）：词汇 + 词汇相关派生函数，只此一个已注册垂直包。
export * from './verticals/robotics.js';
