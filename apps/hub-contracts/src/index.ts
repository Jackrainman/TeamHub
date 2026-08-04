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
// 归档物实体契约（治理域，CONTRACTS-SCHEMAS 自 schemas.ts 析出）。
export { ArtifactRefSchema, ArtifactsResponseSchema } from './artifact.js';
export type { ArtifactRef, ArtifactsResponse } from './artifact.js';
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
  checklistScenarioFixture,
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
  // 打磨轮刀⑤：空板默认组树（GovStore.ensureDefaultGroups 消费）
  buildDefaultGroupTree,
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
// 轻身份登录契约（IDENTITY-LITE，D-083 §4.2）：session / setPin，依赖 pm-core 的 MemberPublicSchema，故其后导出。
export * from './identity.js';
export * from './schedule-infra.js';
export * from './growth.js';
export * from './attribution.js';
export * from './artifact-version.js';
export * from './schedule.js';
export * from './kb.js';
export * from './kb-similar.js';
export * from './kb-closeout.js';
export * from './inventory.js';
// 采购-报账-入库联动（REIMBURSE-PROC）：报账条目/批次契约 + 发票 XML/PDF 文本解析纯函数（本地解析、
// 文件本体永不上传）+ 写契约。依赖 inventory.js（PartAcquisitionSchema/PartType/PartAction），故其后导出。
export * from './reimbursement.js';
// 门检查单与欠条（GATE-CHECKLIST-IOU，D-087）：独立轻量域，复用 baseline 的 drift 常量 / 档位类型，
// 不进 GovernanceSnapshot、独立 store / 落盘（照 baseline / inventory 先例）。
export * from './checklist.js';
// 跨端单一源（D-052 重复真相收口）：系统状态契约 / PM 写请求契约（errorCode 派生已并入 kb-closeout.ts）
export * from './system-status.js';
// 部署配置落盘层（SETUP-WIZARD 刀①，setup-wizard.md §2/§3）：config.json 契约 + setup 三端点请求/响应契约。
export * from './deploy-config.js';
export * from './pm-requests.js';
// 写侧请求契约按域拆分（自 pm-requests.ts 析出 artifact/schedule/resource 三域，照 relay.ts 先例）；
// 包入口 export * 保证 server/console 既有具名 import 零改动。
export * from './artifact-requests.js';
export * from './schedule-requests.js';
export * from './resource-requests.js';
// 名册导入（ROSTER-IMPORT，K8）：CSV 模板生成 + 编码探测 + 手写零依赖解析器 + 导入报告契约（纯，无状态）。
export * from './roster-import.js';
export * from './inventory-import.js';
// 车队批量导入（FLEET-CSV-IMPORT）：CSV 模板生成 + 手写零依赖解析器 + 预览契约（纯，无状态；落库走既有批量端点）。
export * from './fleet-import.js';
export * from './csv-core.js';
// 装配契约（HUB-MODULARIZATION 第2步）：ModuleDescriptor / TenantConfig / VocabularyRegistry，只接口不实现。
export * from './assembly.js';
// robotics 垂直包（HUB-MODULARIZATION 第6步）：词汇 + 词汇相关派生函数，只此一个已注册垂直包。
export * from './verticals/robotics.js';
// Hermes 入站命令契约（HUB-HERMES-ADAPTER 最小链路）：命令枚举 + 参数 schema + 原始文本规则匹配（纯，无 I/O）。
export * from './hermes.js';
// 飞书集成配置（LARK-INTEG-CONFIG）：配置 CRUD 契约 + Hermes credential 端点契约。
export * from './lark-integration.js';
