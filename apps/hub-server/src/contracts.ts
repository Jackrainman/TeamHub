import { z } from 'zod';
import {
  SimilarIssueMatchSchema,
  IssueCardSchema,
  InvestigationRecordSchema,
  ArchiveDocumentSchema,
  ArchiveGeneratedBySchema,
  ErrorEntrySchema,
  KnowledgeNodeSchema,
  TaskSchema,
  TaskStatusSchema,
  GovActorSourceSchema,
  DependencySchema,
  NeedSchema,
  TasksResponseSchema,
} from '@teamhub/hub-contracts';
export {
  AdapterCapabilitiesResponseSchema,
  AdapterDescriptorSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  AdaptersResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  HubEventSchema,
  DepGraphSchema,
  toDepGraphView,
  GOVERNANCE_SCENARIO_NOW,
  apiContractFixtures,
  SimilarIssueMatchSchema,
  rankSimilarIssues,
  buildCloseoutFromIssue,
  TasksResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  AdapterCapabilitiesResponse,
  AdapterDescriptor,
  AdapterHealthResponse,
  AdapterInvokeRequest,
  AdapterInvokeResponse,
  AdaptersResponse,
  ArtifactRef,
  ArtifactsResponse,
  BridgeMemberState,
  BridgeMembersResponse,
  GitRepoRef,
  GitReposResponse,
  HubEvent,
  HubEventsResponse,
} from '@teamhub/hub-contracts';

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('teamhub-hub-server'),
  checkedAt: isoDateTimeSchema,
});

export const SystemStatusResponseSchema = z.object({
  service: z.literal('teamhub-hub-server'),
  version: z.string().min(1),
  mode: z.literal('mock-first'),
  generatedAt: isoDateTimeSchema,
  uptimeSeconds: z.number().nonnegative(),
  adapters: z.object({
    total: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    unconfigured: z.number().int().nonnegative(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;

/**
 * KB-CORE `GET /api/kb/similar` 路由契约。querystring 全为字符串：tags 逗号分隔、limit/minScore coerce 成数。
 * 响应固定带 `note` 把 **A4 护栏措辞**焊进 API——「以下为候选，按 reasons 自行判断，系统不断言同因、由人选用」。
 */
export const KB_SIMILAR_NOTE =
  '以下为候选相似记录（按 reasons 词重合排序）；系统只列候选、不断言「同因」，请按 reasons 自行判断后选用。';

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

/**
 * PM 项目计划表 `POST /api/tasks` 路由契约（单条任务录入）。请求 = TaskDraft 的人本字段
 * （server 补 id/时间戳/派生默认）；`status/statusSource` 可省略（默认 pending/console）。
 * **D-042**：必填 projectId/groupId/title/rawSummary/robotTarget/intrinsicComplexity（Zod 强制，「title+groupId」过不了）；
 * **不引入 `dueDate`**（G4 无硬截止 / 甘特暂缓）。Task 无 confirmedBy 字段，本路由不触 I0 确认语义。
 */
export const CreateTaskRequestSchema = TaskSchema.omit({
  id: true,
  status: true,
  statusSource: true,
  lastProgressAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: TaskStatusSchema.optional(),
  statusSource: GovActorSourceSchema.optional(),
});

export const CreateTaskResponseSchema = z.object({ task: TaskSchema });

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

/**
 * PM `POST /api/dependencies` 路由契约（人手建依赖边）。请求 = 人本字段；server clamp status=`active`（D-042 初始态）、
 * 补 id/时间戳。`confirmedBy`（用户 Q1=ActorRef 内部凭证）随请求传入、仅内部归因——**读视图不回此对象**（创建响应回给
 * 建边本人非第三方，不构成 I0 暴露）。`fromTaskId`=上游、`toTaskId`=被卡的下游。
 */
export const CreateDependencyRequestSchema = DependencySchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const CreateDependencyResponseSchema = z.object({
  dependency: DependencySchema,
});

/**
 * PM `POST /api/needs` 路由契约（前置需求一等公民 G3）。server clamp status=`open`、openedAt=now、escalatedAt=null、
 * **claimedByMemberId=null**（A2 反派单：新缺口必未认领，认领是本人后续动作；故请求 omit 之，不给队长创建即指派的口子）。
 * **A1**：providerGroupId 归组不归人。
 */
export const CreateNeedRequestSchema = NeedSchema.omit({
  id: true,
  status: true,
  openedAt: true,
  escalatedAt: true,
  claimedByMemberId: true,
});
export const CreateNeedResponseSchema = z.object({ need: NeedSchema });

export type CreateDependencyRequest = z.infer<
  typeof CreateDependencyRequestSchema
>;
export type CreateNeedRequest = z.infer<typeof CreateNeedRequestSchema>;
