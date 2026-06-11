import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';

/**
 * 治理数据真相层（D-026 第①层）+ 阻塞归因派生输出 + DepGraph 前端视图契约。
 *
 * 红线（AGENTS.md §5）落在 schema 形状上：
 * - 反排名（C2/A1）：阻塞归因/负载/DepGraph 视图的主键全是 task/group/dependency/need，
 *   **没有 memberId 维度、没有对人计数/时长聚合**，结构上无法 groupBy 出"谁慢了"。
 * - 派生优先（C1/C5）：Member/Task 的状态带 `statusSource`/`updatedBy` 标 derived/git/lark。
 * - AI 不替人拍板（C4）：Dependency/Need 的 aiSuggested 必须人 `confirmedBy` 后才生效。
 */

// ---------------------------------------------------------------------------
// 公共枚举
// ---------------------------------------------------------------------------

/** 状态来源：'derived' = 系统派生（C5 优先于 console 录入）。 */
export const GovActorSourceSchema = z.enum(['lark', 'git', 'console', 'derived']);

export const RobotTargetSchema = z.enum(['R1', 'R2', 'shared']);

// ---------------------------------------------------------------------------
// Season / Project（按赛季分项目）
// ---------------------------------------------------------------------------

export const SeasonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  status: z.enum(['active', 'archived']),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  name: z.string().min(1),
  // R1/R2 用标签，不为每台车割裂出 Project（保留跨车共享散件依赖）。
  robotTargets: z.array(RobotTargetSchema).min(1),
  status: z.enum(['active', 'archived']),
  createdAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Group（可配置组织树，自引用）
// ---------------------------------------------------------------------------

export const GroupKindSchema = z.enum([
  'mechanical',
  'electrical',
  'program',
  'custom',
]);

export const GroupSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  // 自引用：null = 顶层组；电控/视觉可并入程序，由配置决定，不写死（C3）。
  parentGroupId: z.string().min(1).nullable(),
  name: z.string().min(1),
  kind: GroupKindSchema,
});

// ---------------------------------------------------------------------------
// Member（+role+资历）
// ---------------------------------------------------------------------------

export const MemberRoleSchema = z.enum(['superAdmin', 'groupAdmin', 'member']);

/** 资历维度，仅服务 G5（对低资历更主动兜底）；绝不用于产能对比。 */
export const MemberGradeSchema = z.enum([
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'graduate',
]);

export const MemberStatusSchema = z.enum([
  'idle',
  'working',
  'blocked',
  'offline',
]);

export const MemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  role: MemberRoleSchema,
  grade: MemberGradeSchema,
  groupId: z.string().min(1),
  status: MemberStatusSchema,
  // 旧 BridgeMemberState.currentTask(free-text) → FK 外键。
  currentTaskId: z.string().min(1).nullable(),
  // 故意不放 blockedOn：被谁卡是 Task/Dependency 的结构事实，不是人的属性（反排名核心）。
  updatedBy: GovActorSourceSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Task（一等公民）
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum([
  'pending', // 待启动
  'inProgress', // 进行中
  'blocked', // 卡住
  'done', // 已完成
  'shelved', // 已搁置
]);

/** 任务自身难度（非工期估算、不进 CPM）；让"本来简单却被卡"可见。 */
export const TaskComplexitySchema = z.enum(['trivial', 'normal', 'hard']);

export const TaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  groupId: z.string().min(1),
  title: z.string().min(1),
  rawSummary: z.string().min(1), // 人原话（C4 双存）
  polishedSummary: z.string().min(1).optional(), // AI 润色（C4 双存）
  status: TaskStatusSchema,
  statusSource: GovActorSourceSchema, // C5：git/lark/derived 优先于 console
  ownerId: z.string().min(1).nullable(),
  collaboratorIds: z.array(z.string().min(1)),
  robotTarget: RobotTargetSchema,
  intrinsicComplexity: TaskComplexitySchema,
  lastProgressAt: isoDateTimeSchema.nullable(), // 最近推进信号（commit/check-in 派生）
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Dependency（有向边，DAG）
// ---------------------------------------------------------------------------

export const DependencyTypeSchema = z.enum([
  'blocks', // from 阻塞 to
  'requires', // to 需要 from 的产出
  'sharesResource', // 共享稀缺资源（实车），互斥（出车撞车）
]);

export const DependencyStatusSchema = z.enum([
  'active', // 上游未满足 → 下游被卡
  'satisfied', // 上游已完成 / Need 已提供 → 解封
  'waived', // 人工判定作废（AI 建议不判定，本人/组长 waive）
]);

export const DependencySourceSchema = z.enum(['human', 'aiSuggested', 'derived']);

export const DependencySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  fromTaskId: z.string().min(1), // 上游
  toTaskId: z.string().min(1), // 下游（被卡的）
  type: DependencyTypeSchema,
  status: DependencyStatusSchema,
  source: DependencySourceSchema,
  // aiSuggested 边 confirmedBy=null 时只进"建议视图"，不参与归因传播（C4）。
  confirmedBy: ActorRefSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Need（前置需求，一等公民）
// ---------------------------------------------------------------------------

export const NeedStatusSchema = z.enum([
  'open', // 已暴露，未认领
  'claimed', // 有提供方认领
  'satisfied', // 已提供
  'escalated', // 持续无人认领 → 升级缺口级可见（A4：升级的是事不是人）
]);

export const NeedSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  onTaskId: z.string().min(1),
  description: z.string().min(1),
  // 缺口归组（"任务缺懂 RTOS 的人"），不归人（A1）。
  providerGroupId: z.string().min(1).nullable(),
  claimedByMemberId: z.string().min(1).nullable(), // 本人主动认领才填，非派单
  status: NeedStatusSchema,
  neededSkills: z.array(z.string().min(1)),
  source: z.enum(['human', 'aiSuggested']),
  confirmedBy: ActorRefSchema.nullable(),
  openedAt: isoDateTimeSchema,
  escalatedAt: isoDateTimeSchema.nullable(),
});

// ---------------------------------------------------------------------------
// TaskProgressSignal（派生信号薄载体）
// ---------------------------------------------------------------------------

export const ProgressSignalKindSchema = z.enum([
  'gitCommit', // 派生（C5 上游：Git）
  'larkCheckIn', // 派生（C5 上游：飞书一键 check-in）
  'manualNote', // 兜底录入（C1：录入是兜底）
]);

export const TaskProgressSignalSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  actor: ActorRefSchema, // 规范层约束只能本人；schema 不强制
  kind: ProgressSignalKindSchema,
  rawText: z.string().min(1),
  polishedText: z.string().min(1).optional(),
  at: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 阻塞归因输出（派生算法产物；任务键，无 memberId 维度）
// ---------------------------------------------------------------------------

export const BlockAttributionReasonSchema = z.enum([
  'upstreamBlocked',
  'upstreamInProgress',
  'unmetNeed',
  'sharedResourceBusy',
]);

export const BlockAttributionSchema = z.object({
  id: z.string().min(1),
  idleTaskId: z.string().min(1), // 被卡而空闲的任务
  idleGroupId: z.string().min(1), // 缺口归组（A1）
  rootBlockerTaskId: z.string().min(1), // 根因瓶颈任务
  rootBlockerGroupId: z.string().min(1),
  blockingDependencyIds: z.array(z.string().min(1)),
  unmetNeedIds: z.array(z.string().min(1)),
  reason: BlockAttributionReasonSchema,
  // 中性事实陈述：模板只填任务/组/Need 名，永不含人名或"谁慢"。
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

/** 负载信号：组键"联调链负载偏高"，不说"AB 慢"（A2 私聊本人 + 组长看组级缺口）。 */
export const OverloadSignalSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  criticalChainTaskIds: z.array(z.string().min(1)),
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'),
  detectedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// DepGraph 前端视图（toDepGraphView 投影产物；同样任务键，无人效字段）
// ---------------------------------------------------------------------------

export const DepNodeStatusSchema = z.enum([
  'working', // 进行中
  'blockedIdle', // 被卡而空闲（正当）
  'freeIdle', // 自由空闲（真闲）
  'done', // 完成
  'gap', // 缺口 / 卡点源（自身挂未满足 Need）
]);

export const DepNodeKnowledgeSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(['code', 'doc', 'person']),
  uri: z.string().min(1).nullable(),
});

export const DepNodeSchema = z.object({
  id: z.string().min(1), // taskId
  label: z.string().min(1),
  groupId: z.string().min(1),
  groupName: z.string().min(1),
  robotTarget: RobotTargetSchema,
  ownerLabel: z.string().min(1).nullable(), // 仅显示名，无效率/完成量
  status: DepNodeStatusSchema,
  blockedByTaskId: z.string().min(1).nullable(),
  blockedByLabel: z.string().min(1).nullable(), // "R1 底盘调试"（任务名，非人名）
  isCritical: z.boolean(),
  intrinsicComplexity: TaskComplexitySchema,
  unmetNeedLabels: z.array(z.string().min(1)),
  // "被卡去学"挂接：被卡节点关联的知识/资料（中性给予，A3/D-027）。
  relatedKnowledge: z.array(DepNodeKnowledgeSchema),
});

export const DepEdgeKindSchema = z.enum([
  'normal',
  'critical',
  'blocking',
  'need',
]);

export const DepEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1), // from taskId
  target: z.string().min(1), // to taskId
  kind: DepEdgeKindSchema,
});

export const DepGraphSummarySchema = z.object({
  criticalCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(), // 缺口/卡点源（gap）
  blockedIdleCount: z.number().int().nonnegative(), // 空闲(被卡)
  freeIdleCount: z.number().int().nonnegative(), // 空闲(自由)
});

export const DepGraphSchema = z.object({
  seasonId: z.string().min(1),
  projectId: z.string().min(1),
  stage: z.string().min(1),
  nodes: z.array(DepNodeSchema),
  edges: z.array(DepEdgeSchema),
  summary: DepGraphSummarySchema,
  generatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 共享物理资源 + 差异化在场排班（D-029）
//
// 通用 PM 调度任务、假设人可并行 / 资源抽象；本场景有「单一共享物理资源（实车）」
// 做硬串行点 + 物理共处要求 → "今晚 / 明天你这角色要不要在场"不是排班表，是从
// DAG + 车可用性派生。差异化（程序熬夜调车 / 机械电路 on-call / 被卡的今晚去学）
// 由依赖位置 + 资源状态自动落出，不手排。
//
// 反监视（C2/A1）：派生输出 PresenceRecommendation 的主键是 group/resource/task，
// **无 memberId 维度**；ResourceSession.invitedMemberIds 仅是"单窗操作名单"，
// 绝不跨窗按人累计（否则即出勤排名）——护栏落在"输出无人维度 + 不做按人聚合视图"。
// ---------------------------------------------------------------------------

export const ResourceKindSchema = z.enum(['robot', 'testRig', 'instrument']);

/** 资源自身状态：down/upgrading 时整片下游 require 它的任务无法上车（车撞坏全卡）。 */
export const ResourceStatusSchema = z.enum([
  'available', // 空闲可用
  'inUse', // 某窗口被占用（调试中）
  'down', // 损坏 / 不可用（撞坏维修）
  'upgrading', // 升级改造中
]);

export const SharedResourceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1), // "R1 比赛车"
  kind: ResourceKindSchema,
  robotTarget: RobotTargetSchema, // 与 Task.robotTarget 对齐
  status: ResourceStatusSchema,
  statusReason: z.string().min(1).nullable(), // "撞坏维修中"——中性事实，非归咎于人
  statusSource: GovActorSourceSchema, // 派生优先，console 兜底
  updatedAt: isoDateTimeSchema,
});

/**
 * 占用窗口：粗粒度（"今晚" / "明天上午"），队长一拍即录（低录入 C1）。
 * 同一 windowLabel + 同一 resource 可有多条（orderInWindow 表"先程序后机械"的接力）。
 * 精确钟点语义（startsAt/endsAt）留 open（见 D-029 open_for_decision）。
 */
export const ResourceSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  resourceId: z.string().min(1),
  windowLabel: z.string().min(1), // 粗粒度标签，不锁 enum（"今晚" / "明天上午" / "周末"）
  orderInWindow: z.number().int().nonnegative(), // 窗口内接力顺序（0,1,2…）
  holderGroupId: z.string().min(1), // 该段车归哪个组
  holderTaskId: z.string().min(1).nullable(), // 关联任务（"R1 总联调"）
  // 队长一次可选多组多人——仅本窗操作名单，绝不跨窗按人累计（反排名护栏）。
  invitedMemberIds: z.array(z.string().min(1)),
  note: z.string().min(1).nullable(),
  source: z.enum(['human', 'aiSuggested', 'derived']),
  // aiSuggested 未确认不参与派生（C4：AI 建议不判定）。
  confirmedBy: ActorRefSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const PresenceModeSchema = z.enum([
  'present', // 在场（持有车 / 接力持有）
  'onCall', // 随叫（上游链上仍在推进，可能临时被叫）
  'free', // 今晚不用来（被卡 → 去歇 / 去学；或车 down）
]);

export const PresenceReasonSchema = z.enum([
  'holdsResource', // 持有车做这段工作
  'upstreamOnCall', // 上游链上还在推进，可能被叫
  'blockedFree', // 被卡而空闲，本窗无法推进
  'resourceDown', // 车不可用，整片下游今晚作罢
]);

/** 派生输出：在场建议（组键，无人维度）。 */
export const PresenceRecommendationSchema = z.object({
  id: z.string().min(1),
  windowLabel: z.string().min(1),
  groupId: z.string().min(1), // 组键（反排名核心）
  mode: PresenceModeSchema,
  resourceId: z.string().min(1).nullable(),
  holderTaskLabel: z.string().min(1).nullable(), // "R1 总联调"（任务名，非人名）
  orderInWindow: z.number().int().nonnegative().nullable(), // present 时显示接力顺序
  reason: PresenceReasonSchema,
  factStatement: z.string().min(1), // 中性：只填组 / 任务 / 资源名
  // free 模式挂"这段时间可以看的资料"（A3/D-027 正面给予）。
  relatedKnowledge: z.array(DepNodeKnowledgeSchema),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 列表响应包装（继承 { xxx: [] } 风格）
// ---------------------------------------------------------------------------

export const SeasonsResponseSchema = z.object({
  seasons: z.array(SeasonSchema),
});
export const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});
export const GroupsResponseSchema = z.object({ groups: z.array(GroupSchema) });
export const MembersResponseSchema = z.object({
  members: z.array(MemberSchema),
});
export const TasksResponseSchema = z.object({ tasks: z.array(TaskSchema) });
export const DependenciesResponseSchema = z.object({
  dependencies: z.array(DependencySchema),
});
export const NeedsResponseSchema = z.object({ needs: z.array(NeedSchema) });
export const BlockAttributionsResponseSchema = z.object({
  attributions: z.array(BlockAttributionSchema),
});
export const SharedResourcesResponseSchema = z.object({
  resources: z.array(SharedResourceSchema),
});
export const ResourceSessionsResponseSchema = z.object({
  sessions: z.array(ResourceSessionSchema),
});
export const PresenceScheduleResponseSchema = z.object({
  windowLabel: z.string().min(1),
  recommendations: z.array(PresenceRecommendationSchema),
});

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type GovActorSource = z.infer<typeof GovActorSourceSchema>;
export type RobotTarget = z.infer<typeof RobotTargetSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type GroupKind = z.infer<typeof GroupKindSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type MemberGrade = z.infer<typeof MemberGradeSchema>;
export type MemberStatus = z.infer<typeof MemberStatusSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type DependencyType = z.infer<typeof DependencyTypeSchema>;
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;
export type DependencySource = z.infer<typeof DependencySourceSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type NeedStatus = z.infer<typeof NeedStatusSchema>;
export type Need = z.infer<typeof NeedSchema>;
export type ProgressSignalKind = z.infer<typeof ProgressSignalKindSchema>;
export type TaskProgressSignal = z.infer<typeof TaskProgressSignalSchema>;
export type BlockAttributionReason = z.infer<
  typeof BlockAttributionReasonSchema
>;
export type BlockAttribution = z.infer<typeof BlockAttributionSchema>;
export type OverloadSignal = z.infer<typeof OverloadSignalSchema>;
export type DepNodeStatus = z.infer<typeof DepNodeStatusSchema>;
export type DepNodeKnowledge = z.infer<typeof DepNodeKnowledgeSchema>;
export type DepNode = z.infer<typeof DepNodeSchema>;
export type DepEdgeKind = z.infer<typeof DepEdgeKindSchema>;
export type DepEdge = z.infer<typeof DepEdgeSchema>;
export type DepGraphSummary = z.infer<typeof DepGraphSummarySchema>;
export type DepGraph = z.infer<typeof DepGraphSchema>;
export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;
export type SharedResource = z.infer<typeof SharedResourceSchema>;
export type ResourceSession = z.infer<typeof ResourceSessionSchema>;
export type PresenceMode = z.infer<typeof PresenceModeSchema>;
export type PresenceReason = z.infer<typeof PresenceReasonSchema>;
export type PresenceRecommendation = z.infer<
  typeof PresenceRecommendationSchema
>;
