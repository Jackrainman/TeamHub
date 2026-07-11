import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';

/**
 * 倒排基准线（BASELINE-CORE，D-083 §4.1 / `docs/design/baseline-design.md` §3）。
 *
 * **独立域文件**：不塞 `pm-core.ts` / `attribution.ts` / `GovernanceSnapshot`（红线3，
 * baseline-design.md §5）——`GovernanceSnapshot` 三处手写同步已是既有雷区
 * （attribution.ts:46/69/90），基准线本体走独立 `baselineStore` + 独立落盘 `baseline.json`
 * （照 kbStore/invStore 先例；store 实现属后续步骤，本文件只落契约）。
 *
 * 红线（baseline-design.md §5，本文件把它们落到 schema 形状上）：
 * 1. **Task 永不新增 `dueDate`**（G4 修正案）：`pm-core.ts:TaskSchema` 只加 `milestoneId?`
 *    （挂接，多对一）+ `investment?`（三维分类，本文件 `TaskInvestmentSchema`）——快慢从里程碑
 *    派生，不在 Task 本体存日期。
 * 2. **落后展示单位=里程碑/模块/组，永不点人名**：`passedBy` 是写侧收集的验收留名（大三验收人），
 *    不是"谁慢了"标签；读视图处理沿既有 `confirmedBy` 的 I0 先例（第三方读视图不外露）。
 * 3. **基准线本体=独立 store + 独立落盘**，不进 `GovernanceSnapshot`。
 * 4. **证据二进制不进 store/SQLite/git**（D-025）：`evidenceRefs` 只存 `ArtifactRef.id`
 *    字符串引用，字节走既有 `POST /api/artifacts/:id/upload` 本地卷链路（D-078 先例）。
 * 5. **版次裁剪=显式人操作+留痕，门不随裁版消失**：`BaselineMilestone.mergedFromVersion?`
 *    记录裁剪前的原始版次——裁剪只改 `robotVersion` 挂靠、不删里程碑、不降验证要求。
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

export const BaselineSegmentKindSchema = z.enum(['semester', 'vacation', 'vacuum']);
export const BaselinePhaseTypeSchema = z.enum(['rd', 'iterate', 'tuning', 'vacuum']);
export const MilestoneKindSchema = z.enum(['milestone', 'gate']);
export const MilestoneStatusSchema = z.enum(['pending', 'passed', 'missed']);

/**
 * 三版车节奏（baseline-design.md §2：V1 实验车/V2 拼装/V3 冲奖）。与 `pm-core.ts:RobotTargetSchema`
 * （R1/R2/shared，"哪台机器人"）是不同语义轴，故不复用——本枚举是"第几版车"。
 */
export const MilestoneRobotVersionSchema = z.enum(['V1', 'V2', 'V3']);

// ---------------------------------------------------------------------------
// 投资类任务三维分类（baseline-design.md §1 细节4 / §3）：Task.investment 的形状定义
// 留在本文件（基准线域概念的自然位置，供未来"正在砍未来"示警派生复用）；
// pm-core.ts:TaskSchema 只 import 复用，不复制形状（避免两处定义漂移）。
// ---------------------------------------------------------------------------

/** 高时间积累=需要"感觉"的技术（调参手感/装配经验），突击无效、只能早开始摊。 */
export const InvestmentTimeAccumulationSchema = z.enum(['high', 'low']);
/** 未来赛季×高价值（如 sim2real）=最容易被砍、重点保护对象。 */
export const InvestmentHorizonSchema = z.enum(['season', 'future']);
export const InvestmentValueSchema = z.enum(['high', 'low']);

export const TaskInvestmentSchema = z.object({
  horizon: InvestmentHorizonSchema,
  value: InvestmentValueSchema,
  timeAccumulation: InvestmentTimeAccumulationSchema,
});

// ---------------------------------------------------------------------------
// SeasonBaseline（战队级：赛季一条链，不按组各建一条——baseline-design.md §1 细节1）
// ---------------------------------------------------------------------------

export const BaselineAnchorsSchema = z.object({
  semesterStart: isoDateTimeSchema.optional(),
  competitionDate: isoDateTimeSchema.optional(),
});

export const BaselineSegmentSchema = z.object({
  kind: BaselineSegmentKindSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  label: z.string().min(1),
});

export const BaselinePhaseSchema = z.object({
  type: BaselinePhaseTypeSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});

export const BaselineMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: MilestoneKindSchema,
  plannedAt: isoDateTimeSchema, // 内置模板默认 + 手写覆盖（baseline-design.md §1 细节2）
  robotVersion: MilestoneRobotVersionSchema.optional(),
  // 版次裁剪留痕（红线5）：仅当该里程碑被合并进另一版次时填写裁剪前的原始版次——
  // 例如 V3 门并入 V2：robotVersion 由 'V3' 改 'V2'，mergedFromVersion 记 'V3'；
  // 门本身不删、验证要求不降低，前端可渲染"原 V3 门，已并入 V2"不失真。
  mergedFromVersion: MilestoneRobotVersionSchema.optional(),
  status: MilestoneStatusSchema,
  // 大三验收留名（写侧收集）；读视图沿既有 confirmedBy 的 I0 处理先例，不做"谁慢了"展示（红线2）。
  passedBy: ActorRefSchema.optional(),
  // 大二提交的视频/图片证据：只存 ArtifactRef.id 字符串引用，字节不进本 store（D-025，红线4）。
  evidenceRefs: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});

export const SeasonBaselineSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1), // 引用 pm-core.ts:Season.id（S1 已接线，GET /api/seasons）
  anchors: BaselineAnchorsSchema,
  segments: z.array(BaselineSegmentSchema),
  phases: z.array(BaselinePhaseSchema),
  milestones: z.array(BaselineMilestoneSchema),
});

// ---------------------------------------------------------------------------
// 读视图（I0）：passedBy 剥离变体（S4 路由层引入）
// ---------------------------------------------------------------------------

/**
 * 读视图用里程碑：剥 `passedBy`（红线2 / baseline-design.md §5："passedBy 读视图处理沿既有
 * confirmedBy 的 I0 处理先例"）——照 `pm-requests.ts` 的 `DependencySchema.omit({ confirmedBy: true })`
 * 范式：`passedBy` 只是写侧收集的验收留名，任何读视图（含刚过门那次响应）永不回传。
 */
export const BaselineMilestonePublicSchema = BaselineMilestoneSchema.omit({ passedBy: true });

/** 读视图用赛季基准线：milestones 换成剥 passedBy 的变体，其余字段透传。 */
export const SeasonBaselinePublicSchema = SeasonBaselineSchema.extend({
  milestones: z.array(BaselineMilestonePublicSchema),
});

// ---------------------------------------------------------------------------
// API 读 / 写契约（跨端单一源，server + console 共用；照 inventory.ts 范式）
// ---------------------------------------------------------------------------

/** GET /api/baseline?seasonId=xxx → 该赛季基准线；尚未生成模板时为 null（前端引导"生成模板"）。 */
export const BaselineResponseSchema = z.object({
  baseline: SeasonBaselinePublicSchema.nullable(),
});

/**
 * PATCH /api/baseline：队长手写覆盖（baseline-design.md §1 细节2："模板生成后队长可逐条改
 * 日期/增删里程碑"）。v1 整段替换 anchors/segments/phases/milestones（小团队不做逐字段 diff
 * patch，覆盖即最小实现，C3）；id/seasonId 不可经此改。请求体仍走完整 `SeasonBaselineSchema`
 * （队长手写覆盖可能顺带带上 passedBy，写侧收集不设限——红线2「写侧收集」）；响应剥 passedBy。
 */
export const UpdateBaselineRequestSchema = SeasonBaselineSchema.omit({
  id: true,
  seasonId: true,
}).partial();
export const UpdateBaselineResponseSchema = z.object({ baseline: SeasonBaselinePublicSchema });

/**
 * POST /api/baseline/milestones/:milestoneId/pass：验证门过门写口
 * （baseline-design.md §1 细节3："大二提交证据→大三验收留名过门"）。status 只允许
 * passed/missed（pending 是初始态，不经此写口回退）；passedBy 由验收人（大三）填，
 * evidenceRefs 是大二已上传证据的 artifactId 引用（D-025，红线4；路由层校验引用的 artifactId
 * 确实存在，避孤儿引用）。响应剥 passedBy（同上，读视图不回，即便是刚过门那次响应）。
 */
export const PassMilestoneRequestSchema = z.object({
  status: z.enum(['passed', 'missed']),
  passedBy: ActorRefSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});
export const PassMilestoneResponseSchema = z.object({ baseline: SeasonBaselinePublicSchema });

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type BaselineSegmentKind = z.infer<typeof BaselineSegmentKindSchema>;
export type BaselinePhaseType = z.infer<typeof BaselinePhaseTypeSchema>;
export type MilestoneKind = z.infer<typeof MilestoneKindSchema>;
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type MilestoneRobotVersion = z.infer<typeof MilestoneRobotVersionSchema>;
export type InvestmentTimeAccumulation = z.infer<typeof InvestmentTimeAccumulationSchema>;
export type InvestmentHorizon = z.infer<typeof InvestmentHorizonSchema>;
export type InvestmentValue = z.infer<typeof InvestmentValueSchema>;
export type TaskInvestment = z.infer<typeof TaskInvestmentSchema>;
export type BaselineAnchors = z.infer<typeof BaselineAnchorsSchema>;
export type BaselineSegment = z.infer<typeof BaselineSegmentSchema>;
export type BaselinePhase = z.infer<typeof BaselinePhaseSchema>;
export type BaselineMilestone = z.infer<typeof BaselineMilestoneSchema>;
export type SeasonBaseline = z.infer<typeof SeasonBaselineSchema>;
export type BaselineMilestonePublic = z.infer<typeof BaselineMilestonePublicSchema>;
export type SeasonBaselinePublic = z.infer<typeof SeasonBaselinePublicSchema>;
export type BaselineResponse = z.infer<typeof BaselineResponseSchema>;
export type UpdateBaselineRequest = z.infer<typeof UpdateBaselineRequestSchema>;
export type UpdateBaselineResponse = z.infer<typeof UpdateBaselineResponseSchema>;
export type PassMilestoneRequest = z.infer<typeof PassMilestoneRequestSchema>;
export type PassMilestoneResponse = z.infer<typeof PassMilestoneResponseSchema>;
