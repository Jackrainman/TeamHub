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
// 倒排基准线标准纵切：显式导出正式 domain API；投资值对象仍由共享 investment 单源提供。
export {
  BASELINE_DRIFT_ATTACHED_DONE_THRESHOLD,
  BASELINE_DRIFT_LOOKAHEAD_WEEKS,
  BaselineAnchorsSchema,
  BaselineMilestonePublicSchema,
  BaselineMilestoneSchema,
  BaselinePhaseSchema,
  BaselinePhaseTypeSchema,
  BaselineResponseSchema,
  BaselineSegmentKindSchema,
  BaselineSegmentSchema,
  INVESTMENT_STALL_WEEKS,
  InvestmentHorizonSchema,
  InvestmentTimeAccumulationSchema,
  InvestmentValueSchema,
  MilestoneKindSchema,
  MilestoneRobotVersionSchema,
  MilestoneStatusSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
  SeasonBaselinePublicSchema,
  SeasonBaselineSchema,
  TEMPLATE_NOTE_G1,
  TEMPLATE_NOTE_M1,
  TEMPLATE_NOTE_M2,
  TIME_ACCUMULATION_LABEL,
  TaskInvestmentSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
  deriveBaselineDrift,
  deriveGroupsBehind,
  deriveInvestmentWarnings,
  deriveRobotStageMarkers,
  deriveStagePipeline,
  deriveStageProgress,
  deriveTimeAccumulationFlags,
  generateRoboconBaselineTemplate,
  MilestoneStageSchema,
  STAGE_PIPELINE_STAGES,
} from './domains/baseline/index.js';
export type {
  BaselineAnchors,
  BaselineMilestone,
  BaselineMilestonePublic,
  BaselinePhase,
  BaselinePhaseType,
  BaselineResponse,
  BaselineSegment,
  BaselineSegmentKind,
  GroupBehindSummary,
  InvestmentHorizon,
  InvestmentTimeAccumulation,
  InvestmentValue,
  InvestmentWarning,
  MilestoneDrift,
  MilestoneDriftLevel,
  MilestoneKind,
  MilestoneRobotVersion,
  MilestoneStage,
  MilestoneStatus,
  PassMilestoneRequest,
  PassMilestoneResponse,
  RoboconBaselineTemplate,
  RobotStageMarker,
  SeasonBaseline,
  SeasonBaselinePublic,
  StagePipelineStage,
  StagePipelineStatus,
  StageProgress,
  TaskInvestment,
  TimeAccumulationFlag,
  UpdateBaselineRequest,
  UpdateBaselineResponse,
} from './domains/baseline/index.js';
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
export * from './gov-report.js';
// 报账标准纵切模块：只从正式 domain public API 显式导出，不保留旧根文件转发层。
export {
  DEFAULT_REIMBURSE_PROFILE,
  CreateReimburseBatchRequestSchema,
  CreateReimburseEntryRequestSchema,
  CreateReimburseEntryResponseSchema,
  GetReimburseProfileResponseSchema,
  InvoiceRecognitionSourceSchema,
  PurchaserCheckStatusSchema,
  ReimburseAmountBucketSchema,
  ReimburseBatchResponseSchema,
  ReimburseBatchSchema,
  ReimburseBatchStatusSchema,
  ReimburseBatchSummarySchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntriesResponseSchema,
  ReimburseEntryKindSchema,
  ReimburseEntrySchema,
  ReimburseEntryStatusSchema,
  ReimburseFinancialSummarySchema,
  ReimburseItemSchema,
  ReimburseMaterialsSchema,
  ReimburseProfileSchema,
  ReimburseReviewReasonSchema,
  StockInLineSchema,
  StockInContextResponseSchema,
  StockInEntryContextSchema,
  StockInPartTypeCandidateSchema,
  StockInRequestSchema,
  StockInResponseSchema,
  StockedLineSchema,
  UpdateReimburseBatchRequestSchema,
  UpdateReimburseEntryRequestSchema,
  UpdateReimburseEntryResponseSchema,
  UpdateReimburseProfileRequestSchema,
  UpdateReimburseProfileResponseSchema,
  cleanInvoiceItemName,
  deriveBatchSummary,
  derivePurchaserCheckStatus,
  deriveReimburseFinancialSummary,
  deriveReimburseReviewReasons,
  deriveReimburseStatus,
  isReimburseEntryBlocked,
  parseInvoicePdfText,
  parseInvoiceXmlText,
  suggestReimburseFilename,
} from './domains/reimburse/index.js';
export type {
  CreateReimburseBatchRequest,
  CreateReimburseEntryRequest,
  CreateReimburseEntryResponse,
  GetReimburseProfileResponse,
  InvoiceRecognitionSource,
  ParsedInvoice,
  PurchaserCheckStatus,
  ReimburseAmountBucket,
  ReimburseBatch,
  ReimburseBatchResponse,
  ReimburseBatchStatus,
  ReimburseBatchSummary,
  ReimburseBatchesResponse,
  ReimburseEntriesResponse,
  ReimburseEntry,
  ReimburseEntryKind,
  ReimburseEntryStatus,
  ReimburseFinancialSummary,
  ReimburseItem,
  ReimburseMaterials,
  ReimburseProfile,
  ReimburseReviewReason,
  StockInLine,
  StockInContextResponse,
  StockInEntryContext,
  StockInPartTypeCandidate,
  StockInRequest,
  StockInResponse,
  StockedLine,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
  UpdateReimburseEntryResponse,
  UpdateReimburseProfileRequest,
  UpdateReimburseProfileResponse,
} from './domains/reimburse/index.js';
// 门检查单标准纵切：显式导出正式 domain API；checklist 不再反向 import baseline 整域。
export {
  CHECKLIST_DRIFT_LOOKAHEAD_WEEKS,
  ChecklistDriftLevelSchema,
  ChecklistItemDriftSchema,
  ChecklistItemStatusSchema,
  ChecklistItemsResponseSchema,
  ChecklistOriginSchema,
  ChecklistQuerySchema,
  ChecklistTemplateSchema,
  ChecklistTemplatesResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  GateChecklistItemSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
  deriveChecklistDrift,
  listBlockingChecklistItems,
} from './domains/checklist/index.js';
export type {
  ChecklistDriftLevel,
  ChecklistItemDrift,
  ChecklistItemStatus,
  ChecklistItemsResponse,
  ChecklistOrigin,
  ChecklistQuery,
  ChecklistTemplate,
  ChecklistTemplatesResponse,
  ClearChecklistItemRequest,
  ClearChecklistItemResponse,
  CreateChecklistItemRequest,
  CreateChecklistItemResponse,
  GateChecklistItem,
  WaiveChecklistItemRequest,
  WaiveChecklistItemResponse,
} from './domains/checklist/index.js';
// 跨端单一源（D-052 重复真相收口）：系统状态契约 / PM 写请求契约（errorCode 派生已并入 kb-closeout.ts）
export * from './system-status.js';
// SQLite app_settings + setup 端点契约：显式列出公共 API，禁止旧 DeployConfig 兼容出口回流。
export {
  AppSettingsSchema,
  ConfigIdentityModeSchema,
  DataModeSchema,
  SetupConfigRequestSchema,
  SetupConfigResponseSchema,
  SetupGraduateResponseSchema,
  SetupInitRequestSchema,
  SetupInitResponseSchema,
  SetupStateResponseSchema,
  VerticalIdSchema,
  parseAppSettings,
} from './app-settings.js';
export type {
  AppSettings,
  ConfigIdentityMode,
  DataMode,
  SetupConfigRequest,
  SetupConfigResponse,
  SetupGraduateResponse,
  SetupInitRequest,
  SetupInitResponse,
  SetupStateResponse,
  VerticalId,
} from './app-settings.js';
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
