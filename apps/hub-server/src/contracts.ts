import { z } from 'zod';
export {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeRequestSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  HubEventSchema,
  DepGraphSchema,
  toDepGraphView,
  wouldCreateCycle,
  GroupGapsResponseSchema,
  deriveDirectionGaps,
  GOVERNANCE_SCENARIO_NOW,
  apiContractFixtures,
  SimilarIssueMatchSchema,
  rankSimilarIssues,
  buildCloseoutFromIssue,
  // D-052 重复真相收口（续）：KB 检索响应 + 结案写侧契约下沉 hub-contracts 单一源，server 仅 re-export，
  // 不再本地重声明 → 不会与 console 漂移。注意 KbSimilarQuerySchema（含 querystring transform）仍是
  // server 专用、留在本文件下方。
  KbSimilarResponseSchema,
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
  TasksResponseSchema,
  // 大任务结构尺（TASK-POST-CLAIM，体检 D5）：GET /api/tasks 逐任务算 isBig 下沉后端。
  isBigTask,
  // 组只读端点（PHASE2-CONSOLE-ASSEMBLY）：GroupsResponseSchema 早有契约（pm-core.ts），此前零消费方。
  GroupsResponseSchema,
  // 赛季只读端点（S1 接线，product-redefine-2026-07 §4.1/§9-①）：SeasonsResponseSchema 早有契约
  // （pm-core.ts），此前零消费方；随 GET /api/seasons 一并接线。
  SeasonsResponseSchema,
  // 赛季写端点（SEASON-CREATE 补链路）：POST /api/seasons——设置页「赛季」分区消费。
  CreateSeasonRequestSchema,
  CreateSeasonResponseSchema,
  // D-052 重复真相收口：以下契约下沉 hub-contracts 单一源，此处仅 re-export 维持既有 import 路径
  // （server.ts / index.ts / 测试 仍 from './contracts.js'），不再本地重声明 → 不会与 console 漂移。
  isoDateTimeSchema,
  deriveErrorCode,
  HealthResponseSchema,
  SystemStatusResponseSchema,
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  // 图纸档案 v2（HUB-ARTIFACT-ARCHIVE-V2）：路由 owns 派生（C5）——版本号自增 + kind 派生纯函数。
  nextArtifactVersionNo,
  deriveArtifactKind,
  // 差异化在场排班（D-029，SCHED-WIRE-EXISTING）：纯派生函数 + 读/写契约。
  derivePresenceSchedule,
  // 演示锚点窗口日期（种子 = 数据库；接力画布首屏默认按今天日期查时命中——见 fixtures.ts）。
  SCENARIO_WINDOW_WEEKDAY,
  SCENARIO_WINDOW_CONVERGENCE,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  // 接力交接画布（R1，队长可编辑）：纯派生函数 + PATCH/relay 读/拉线写契约。
  deriveRelayBoard,
  UpdateResourceSessionRequestSchema,
  UpdateResourceSessionResponseSchema,
  CreateRelayHandoffRequestSchema,
  RelayHandoffResponseSchema,
  RelayBoardResponseSchema,
  // R3 车管理（D-072 §3.2/§3.3）：车编号派生（禁手写）+ 建车/改状态读写契约。
  deriveDisplayCode,
  CreateResourceRequestSchema,
  CreateResourceResponseSchema,
  UpdateResourceStatusRequestSchema,
  UpdateResourceResponseSchema,
  // 今日计划：每车预设写回 + 表格页批量确认落盘（D-082 daily-plan-presets）。
  UpdateResourceDefaultPresetRequestSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchRequestSchema,
  CreateResourceSessionsBatchResponseSchema,
  // 库存 / BOM 第三支柱（INV-BOM-CORE，D-042 决策 4）：派生函数 + 动作语义错误类 + 读/写契约。
  deriveInventoryLedger,
  deriveShortfalls,
  InvalidPartActionError,
  IDLE_HOLDER,
  InventoryResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
  // 倒排基准线（BASELINE-CORE，S4 路由）：读/写契约 + I0 剥 passedBy 的读视图变体。
  BaselineResponseSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
  // 门检查单 / 欠条（GATE-CHECKLIST-IOU，C3 路由；docs/design/gate-checklist-iou.md）：读/写契约 +
  // querystring 契约 + 过门硬闸判定核。**读契约带名不剥**（clearedBy/waivedBy = D-085 事实层，与 baseline
  // 剥 passedBy 刻意不同，见 checklist.ts 头部注释）。listBlockingChecklistItems 是过门拦截纯函数。
  ChecklistQuerySchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
  ChecklistTemplatesResponseSchema,
  listBlockingChecklistItems,
  // 挂单认领制窄写动作契约（TASK-POST-CLAIM，D-088；docs/design/task-post-claim.md）：认领/指派/搭档/
  // 跨组确认/完成/验收六条 POST 子资源的读写契约 + q= 子串搜历史任务的 querystring 契约。全部写 Task
  // 本体留名字段簇（pm-core.ts），无新实体、无 dueDate（红线）。
  ClaimTaskRequestSchema,
  ClaimTaskResponseSchema,
  AssignTaskRequestSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerRequestSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimRequestSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskRequestSchema,
  CompleteTaskResponseSchema,
  ReviewTaskRequestSchema,
  ReviewTaskResponseSchema,
  TasksQuerySchema,
} from '@teamhub/hub-contracts';
export type {
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
  GitRepoRef,
  GitReposResponse,
  HubEvent,
  HubEventsResponse,
  HealthResponse,
  SystemStatusResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  CreateDependencyRequest,
  CreateDependencyResponse,
  CreateNeedRequest,
  CreateNeedResponse,
  TransitionTaskStatusRequest,
  TransitionTaskStatusResponse,
  // 挂单认领制窄写动作契约类型（TASK-POST-CLAIM，D-088）。
  ClaimTaskRequest,
  ClaimTaskResponse,
  AssignTaskRequest,
  AssignTaskResponse,
  SetTaskPartnerRequest,
  SetTaskPartnerResponse,
  ConfirmCrossClaimRequest,
  ConfirmCrossClaimResponse,
  CompleteTaskRequest,
  CompleteTaskResponse,
  ReviewTaskRequest,
  ReviewTaskResponse,
  TasksQuery,
  WaiveDependencyResponse,
  CreateArtifactRequest,
  CreateArtifactResponse,
  KbSimilarResponse,
  KbCloseoutRequest,
  KbCloseoutResponse,
  // 差异化在场排班（D-029）派生入参 + 读/写响应类型。
  ScheduleSnapshot,
  SharedResource,
  ResourceSession,
  PresenceRecommendation,
  PresenceScheduleResponse,
  ResourceSessionsResponse,
  SharedResourcesResponse,
  CreateResourceSessionRequest,
  CreateResourceSessionResponse,
  // 接力交接画布（R1）读/写响应类型。
  RelayBoard,
  RelayStage,
  RelayHandoff,
  UpdateResourceSessionRequest,
  UpdateResourceSessionResponse,
  CreateRelayHandoffRequest,
  RelayHandoffResponse,
  RelayBoardResponse,
  // R3 车管理读/写响应类型。
  CreateResourceRequest,
  CreateResourceResponse,
  UpdateResourceStatusRequest,
  UpdateResourceResponse,
  UpdateResourceDefaultPresetRequest,
  UpdateResourceDefaultPresetResponse,
  CreateResourceSessionsBatchRequest,
  CreateResourceSessionsBatchResponse,
  DefaultPreset,
  // 库存 / BOM 读/写响应类型 + 派生行类型。
  InventorySnapshot,
  PartType,
  PartAction,
  TrackedPart,
  InventoryResponse,
  CreatePartTypeRequest,
  CreatePartTypeResponse,
  CreatePartActionRequest,
  CreatePartActionResponse,
  // 倒排基准线（BASELINE-CORE，S4 路由）类型。
  SeasonBaseline,
  BaselineResponse,
  UpdateBaselineRequest,
  UpdateBaselineResponse,
  PassMilestoneRequest,
  PassMilestoneResponse,
} from '@teamhub/hub-contracts';

// ──────────────────────────────────────────────────────────────────────────
// 以下为 hub-server **专有**路由契约（KB 检索 / 结案）——非跨端重复、不下沉，留在 server。
// ──────────────────────────────────────────────────────────────────────────

/**
 * KB-CORE `GET /api/kb/similar` 路由契约。querystring 全为字符串：tags 逗号分隔、limit/minScore coerce 成数。
 * 响应固定带 `note` 把 **A4 护栏措辞**焊进 API——「以下为候选，按 reasons 自行判断，系统不断言同因、由人选用」。
 */
export const KB_SIMILAR_NOTE =
  '下面是几条相似的历史记录，按匹配程度排序。系统只给候选、不断言是同一个原因，每条附了相似依据，合不合用你自己判断。';

export const KbSimilarQuerySchema = z.object({
  symptom: z.string().min(1),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [],
    ),
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).optional(),
  minScore: z.coerce.number().int().nonnegative().optional(),
});

// KbSimilarResponseSchema / KbCloseoutRequestSchema / KbCloseoutResponseSchema（含类型）已下沉
// hub-contracts（kb-similar.ts / kb-closeout.ts），见上方 re-export 块——此处不再本地重声明。

/**
 * 差异化在场排班 `GET /api/schedule` 路由的 querystring 契约（server 专用，镜像 KbSimilarQuerySchema 范式）。
 * windowLabel 必填、非空（粗粒度窗口标签 "今晚" / "明天上午"）；缺/空 → safeParse 失败 → 路由 400。
 * 无 coerce/transform（仅一个必填 string）。下沉 hub-contracts 无必要（非跨端、纯 server 路由入参）。
 */
export const ScheduleQuerySchema = z.object({
  windowLabel: z.string().min(1),
});

/**
 * 倒排基准线路由的 querystring 契约（server 专用，镜像 ScheduleQuerySchema 范式）：`seasonId`
 * 必填非空。GET/PATCH/POST-pass 三条路由统一从 query 取赛季（S3 `BaselineStore` 方法签名把
 * seasonId 当独立入参、非嵌进 path——`/api/baseline?seasonId=xxx` 与既有 `GET /api/schedule?windowLabel=`
 * 同一风格，见 baseline.ts 契约注释）。非跨端、纯 server 路由入参，无需下沉 hub-contracts。
 */
export const BaselineQuerySchema = z.object({
  seasonId: z.string().min(1),
});
