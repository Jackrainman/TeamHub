import { z } from 'zod';
import {
  SimilarIssueMatchSchema,
  IssueCardSchema,
  InvestigationRecordSchema,
  ArchiveDocumentSchema,
  ArchiveGeneratedBySchema,
  ErrorEntrySchema,
  KnowledgeNodeSchema,
} from '@teamhub/hub-contracts';
export {
  AdapterCapabilitiesResponseSchema,
  AdapterDescriptorSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  AdaptersResponseSchema,
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
  TasksResponseSchema,
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
  // 图纸档案 v2（HUB-ARTIFACT-ARCHIVE-V2）：路由 owns 派生（C5）——版本号自增 + kind 派生纯函数。
  nextArtifactVersionNo,
  deriveArtifactKind,
} from '@teamhub/hub-contracts';
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
  WaiveDependencyResponse,
  CreateArtifactRequest,
  CreateArtifactResponse,
  ArtifactVersionKey,
} from '@teamhub/hub-contracts';

// ──────────────────────────────────────────────────────────────────────────
// 以下为 hub-server **专有**路由契约（KB 检索 / 结案）——非跨端重复、不下沉，留在 server。
// ──────────────────────────────────────────────────────────────────────────

/**
 * KB-CORE `GET /api/kb/similar` 路由契约。querystring 全为字符串：tags 逗号分隔、limit/minScore coerce 成数。
 * 响应固定带 `note` 把 **A4 护栏措辞**焊进 API——「以下为候选，按 reasons 自行判断，系统不断言同因、由人选用」。
 */
export const KB_SIMILAR_NOTE =
  '下面是几条相似的历史记录，按匹配程度排序。系统只给候选、不断言「就是同一个原因」，每条的 reasons 写了为什么像，合不合用你自己判断。';

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

export const KbSimilarResponseSchema = z.object({
  query: z.object({
    symptom: z.string(),
    tags: z.array(z.string()),
  }),
  items: z.array(SimilarIssueMatchSchema),
  note: z.string(),
});

export type KbSimilarResponse = z.infer<typeof KbSimilarResponseSchema>;

/**
 * KB-CORE `POST /api/kb/closeout` 路由契约。结案输入（issue + 时间线 + 根因/处理）→ 归档 + 错误表 +
 * 已归档卡 + 结案派生知识节点。`rootCause/resolution` 仍需手填（可行性 §2）；server 用 clock + issue.id
 * 派生 errorCode/errorEntryId（确定性、可测）。**I0**：generatedBy 是 ai/manual/hybrid，不记结案人。
 */
export const KbCloseoutRequestSchema = z.object({
  issue: IssueCardSchema,
  records: z.array(InvestigationRecordSchema).default([]),
  category: z.string().default(''),
  rootCause: z.string(),
  resolution: z.string(),
  prevention: z.string().default(''),
  generatedBy: ArchiveGeneratedBySchema.default('hybrid'),
});

export const KbCloseoutResponseSchema = z.object({
  archiveDocument: ArchiveDocumentSchema,
  errorEntry: ErrorEntrySchema,
  updatedIssueCard: IssueCardSchema,
  knowledgeNode: KnowledgeNodeSchema,
});

export type KbCloseoutRequest = z.infer<typeof KbCloseoutRequestSchema>;
export type KbCloseoutResponse = z.infer<typeof KbCloseoutResponseSchema>;
