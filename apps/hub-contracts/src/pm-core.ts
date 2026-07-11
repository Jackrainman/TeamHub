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
 *
 * 本文件 = PM 通用 CASE 层实体（HUB-MODULARIZATION 第3步，从 governance.ts 纯搬移）：
 * Season/Project/Group/Member/Task/Dependency/Need + 其枚举 + 派生归因/DepGraph 视图契约。
 * 机器人在场层（SharedResource/ResourceSession/RelayHandoff/Presence*）已迁至 `schedule-infra.ts`。
 *
 * **HUB-MODULARIZATION 第4步（RobotTarget 去渗透）**：`Task.robotTarget` / `Project.robotTargets`
 * 由必填改 `.optional()`——核心（无机器人租户）不再强制填写机器人枚举；新增中性泛化槽
 * `Task.targetLabel?: string` 承载"目标标签"这一更通用的语义（robotics 垂直仍显示 R1/R2/shared，
 * 由 step6 词汇注入层把 `targetLabel` 收紧回 `RobotTargetSchema` 三值枚举；本步 UI/表单暂留
 * `robotTarget` 硬编码下拉作为 fallback，不等 step6）。**放弃的编译期保证**：`robotTarget` 曾是
 * `z.enum` 强校验，非法值在 schema parse 阶段就被拒；改 optional 后，闭集校验下沉到"路由层
 * VocabularyRegistry 校验器"（尚未实现，见 docs/design/modularization-feasibility.md §3.4 A①），
 * 在该校验器补齐前，服务器对 `targetLabel` 自由字符串**不做闭集校验**，只能靠测试兜底。
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

/**
 * S1 接线（product-redefine-2026-07 §4.1/§9-①）：曾是死脚手架（`SeasonsResponseSchema` 从未消费、
 * fixtures 里 seasonId 只是字面量）；现已接入真相层——`GovernanceSnapshot.seasons: Season[]`
 * （attribution.ts）+ `GET /api/seasons`（server.ts）+ fixtures 种一条 active season。
 * 是倒排基准线（BASELINE-DESIGN）`SeasonBaseline.seasonId` 未来引用的实体真相源。
 */
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
  // R1/R2 用标签，不为每台机器人割裂出 Project（保留跨机器人共享散件依赖）。
  // HUB-MODULARIZATION 第4步：改 optional——无机器人租户的 Project 不必填此机器人枚举数组
  // （Project 目前未进 GovernanceSnapshot/落盘，属尚未接线的 scaffolding 类型，改动零消费点回归面）。
  robotTargets: z.array(RobotTargetSchema).min(1).optional(),
  // 中性泛化槽，与 Task.targetLabel 对称（数组形态承接 robotTargets 复数）；同样尚无消费点，
  // 迁移脚本 scripts/migrate-robottarget.mjs 预留回填逻辑，供未来 Project 真正接入落盘时使用。
  targetLabels: z.array(z.string().min(1)).optional(),
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
  // HUB-MODULARIZATION 第4步：改 optional——无机器人租户建任务不必填机器人枚举。
  robotTarget: RobotTargetSchema.optional(),
  // 中性泛化槽：无机器人租户填"目标平台/特性域"等自由标签；robotics 垂直暂仍走 robotTarget
  // 三值枚举（表单/卡片 fallback，step6 收口）。派生投影（toDepGraphView）读 targetLabel ?? robotTarget。
  targetLabel: z.string().min(1).optional(),
  intrinsicComplexity: TaskComplexitySchema,
  // 收敛任务标记（optional，仅总联调类型）：'allLeafGroups' = 所有叶子组各到至少一人在场
  // （全组各一人，D-072 决定 L）。未填 = 普通任务（普通 groupId 持有语义，行为完全不变）。
  // 纯增量 optional：既有 fixture / 落盘 JSON 不填 → parse 为 undefined，向后兼容。
  convergenceScope: z.enum(['allLeafGroups']).optional(),
  lastProgressAt: isoDateTimeSchema.nullable(), // 最近推进信号（commit/check-in 派生）
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Dependency（有向边，DAG）
// ---------------------------------------------------------------------------

export const DependencyTypeSchema = z.enum([
  'blocks', // from 阻塞 to
  'sharesResource', // 共享稀缺资源（机器人），互斥（同时用会撞）
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

/**
 * 方向缺口（S2，D-069）：组键"某组缺懂 X 的方向"，逐字对齐 OverloadSignalSchema 范式
 * ——组键 + factStatement + detectedBy:'derived'，**无人维度字段（成员 / 分数 / 百分比）**。
 * A1：缺口归组不归人；`neededSkills` 描述能力方向，**不得用于反推或排序具体人**。
 * 由 `deriveDirectionGaps` 按 `Need.providerGroupId` 聚合 open+escalated 缺口派生。
 */
export const DirectionGapSeveritySchema = z.enum([
  'emerging', // 仅有 open 未认领缺口
  'pressing', // 有 escalated 缺口，或该组正卡住下游（出现在阻塞归因 rootBlocker）
]);

export const DirectionGapSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1), // 缺口归组（A1），永不归人
  neededSkills: z.array(z.string().min(1)), // 能力方向并集（去重、排序）
  evidenceTaskIds: z.array(z.string().min(1)),
  evidenceNeedIds: z.array(z.string().min(1)),
  severity: DirectionGapSeveritySchema,
  // 中性事实陈述：只填组名 + 缺口数 + 方向，永不含人名 / "谁慢" / "谁该来"。
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

export const GroupGapsResponseSchema = z.object({
  gaps: z.array(DirectionGapSchema),
  generatedAt: isoDateTimeSchema,
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
  // HUB-MODULARIZATION 第4步：由必填 RobotTargetSchema 三值枚举放宽为自由字符串（可空）——
  // toDepGraphView 投影读 task.targetLabel ?? task.robotTarget，无机器人租户两者皆缺时填 null。
  robotTarget: z.string().min(1).nullable(),
  ownerLabel: z.string().min(1).nullable(), // 仅显示名，无效率/完成量
  status: DepNodeStatusSchema,
  blockedByTaskId: z.string().min(1).nullable(),
  blockedByLabel: z.string().min(1).nullable(), // "R1 底盘调试"（任务名，非人名）
  isCritical: z.boolean(),
  // 收敛任务（总联调，convergenceScope='allLeafGroups'）标记：前端 DAG 渲染「全组」徽章。
  // 由 toDepGraphView 从 task.convergenceScope 投影，非人维度（仍是任务结构属性）。
  isConvergenceTask: z.boolean(),
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
export type TaskConvergenceScope = NonNullable<Task['convergenceScope']>;
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
export type DirectionGapSeverity = z.infer<typeof DirectionGapSeveritySchema>;
export type DirectionGap = z.infer<typeof DirectionGapSchema>;
export type GroupGapsResponse = z.infer<typeof GroupGapsResponseSchema>;
export type DepNodeStatus = z.infer<typeof DepNodeStatusSchema>;
export type DepNodeKnowledge = z.infer<typeof DepNodeKnowledgeSchema>;
export type DepNode = z.infer<typeof DepNodeSchema>;
export type DepEdgeKind = z.infer<typeof DepEdgeKindSchema>;
export type DepEdge = z.infer<typeof DepEdgeSchema>;
export type DepGraphSummary = z.infer<typeof DepGraphSummarySchema>;
export type DepGraph = z.infer<typeof DepGraphSchema>;
