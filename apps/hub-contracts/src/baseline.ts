import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';
// 类型only导入：pm-core.ts 反向 import 本文件的 TaskInvestmentSchema（真运行时依赖），
// 这里用 `import type` 避免真循环——verbatimModuleSyntax 下类型导入编译期整句擦除，
// 产物 baseline.js 不 import pm-core.js，运行时零循环。
import type { Task } from './pm-core.js';

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

// ---------------------------------------------------------------------------
// 派生（S5，baseline-design.md §4）：drift 红黄绿 + 组归因 + 投资示警。
// 纯函数、无 IO，落位照 deriveInventoryLedger（inventory.ts）/ derivePresenceSchedule
// （schedule.ts）先例——与其挂接的 schema 同文件。**不做加权算法**：规则简单到人人能心算。
// ---------------------------------------------------------------------------

/** 里程碑临近判定窗口（周）：距 `plannedAt` ≤N 周且挂接任务完成度不足 → 黄（§4）。 */
export const BASELINE_DRIFT_LOOKAHEAD_WEEKS = 2;
/** 挂接任务完成度阈值：低于此值才计入黄档判定（§4 常量起步，非加权）。 */
export const BASELINE_DRIFT_ATTACHED_DONE_THRESHOLD = 0.5;
/** 投资示警"连续零进展"周数阈值（§4："future×high 被连续 2 周零进展"）。 */
export const INVESTMENT_STALL_WEEKS = 2;
/** timeAccumulation:'high' 标注文案（§4 原文口径，直接复用不改写）。 */
export const TIME_ACCUMULATION_LABEL = '早开始摊、突击无效';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export type MilestoneDriftLevel = 'red' | 'yellow' | 'green';

/**
 * 单个里程碑的 drift 判定结果。字段故意最小——不带 title/plannedAt 等展示字段，
 * 调用方已持有 `SeasonBaseline.milestones` 可自行 join，避免两处真相漂移。
 */
export interface MilestoneDrift {
  milestoneId: string;
  level: MilestoneDriftLevel;
  /** 挂接任务（`Task.milestoneId` 指向该里程碑）中 status==='done' 的数量。 */
  attachedDone: number;
  /** 挂接任务总数（含未完成）。 */
  attachedTotal: number;
}

/**
 * 里程碑周粒度红黄绿（baseline-design.md §4，人人能心算的规则）：
 * - **红**：`plannedAt` 已过且 `status !== 'passed'`（不管有没有挂接任务——"过门"是硬事实）。
 * - **黄**：未到红档，且距 `plannedAt` ≤ `BASELINE_DRIFT_LOOKAHEAD_WEEKS` 周，
 *   且挂接任务数 > 0 且完成度（done / total）< `BASELINE_DRIFT_ATTACHED_DONE_THRESHOLD`。
 *   **挂接任务数 = 0 时不判黄**（无数据不示警，宁可漏报也不空口扣帽子——不在设计稿字面
 *   规则内，属实现期最小化决策，随本步 deviations 回写）。
 * - **绿**：其余情况，含已 `passed` 的里程碑（不管时间）。
 *
 * 输入 `baseline` 接受 `SeasonBaseline` 或其读视图 `SeasonBaselinePublic`（`passedBy` 是否
 * 剥离与 drift 判定无关，`milestones` 元素结构兼容、可直接传入两者之一）。
 */
export function deriveBaselineDrift(
  baseline: Pick<SeasonBaseline, 'milestones'>,
  tasks: Task[],
  now: Date,
): MilestoneDrift[] {
  const nowMs = now.getTime();
  const lookaheadMs = BASELINE_DRIFT_LOOKAHEAD_WEEKS * MS_PER_WEEK;

  return baseline.milestones.map((milestone) => {
    const attached = tasks.filter((t) => t.milestoneId === milestone.id);
    const attachedTotal = attached.length;
    const attachedDone = attached.filter((t) => t.status === 'done').length;
    const plannedAtMs = new Date(milestone.plannedAt).getTime();
    const isPassed = milestone.status === 'passed';

    let level: MilestoneDriftLevel;
    if (!isPassed && plannedAtMs < nowMs) {
      level = 'red';
    } else if (
      !isPassed &&
      plannedAtMs - nowMs <= lookaheadMs &&
      attachedTotal > 0 &&
      attachedDone / attachedTotal < BASELINE_DRIFT_ATTACHED_DONE_THRESHOLD
    ) {
      level = 'yellow';
    } else {
      level = 'green';
    }

    return { milestoneId: milestone.id, level, attachedDone, attachedTotal };
  });
}

/** "哪个组慢了"：红/黄里程碑挂接任务按 `Task.groupId` 聚合出的单组条目。 */
export interface GroupBehindSummary {
  groupId: string;
  /** 该组名下所有挂接任务里，命中的最严重档位（红 > 黄；绿档里程碑不产生条目）。 */
  level: 'red' | 'yellow';
  /** 该组在红/黄里程碑下的挂接任务数（单位=组的任务计数，不是人数/工时）。 */
  attachedTaskCount: number;
}

/**
 * "哪个组慢了"派生（baseline-design.md §1 细节1 + §4）：红/黄里程碑的挂接任务按
 * `groupId` 聚合——**单位=组，结构上不出现 memberId/人名**（红线2）。
 * 输入 `drift` = `deriveBaselineDrift` 的输出（调用方先算 drift，避免本函数重复扫 baseline）。
 */
export function deriveGroupsBehind(
  drift: MilestoneDrift[],
  tasks: Task[],
): GroupBehindSummary[] {
  const driftByMilestoneId = new Map(drift.map((d) => [d.milestoneId, d]));
  const worstLevel = new Map<string, 'red' | 'yellow'>();
  const attachedTaskCount = new Map<string, number>();

  for (const task of tasks) {
    if (!task.milestoneId) continue;
    const milestoneDrift = driftByMilestoneId.get(task.milestoneId);
    if (!milestoneDrift || milestoneDrift.level === 'green') continue;

    const current = worstLevel.get(task.groupId);
    if (current !== 'red') {
      worstLevel.set(task.groupId, milestoneDrift.level);
    }
    attachedTaskCount.set(task.groupId, (attachedTaskCount.get(task.groupId) ?? 0) + 1);
  }

  return Array.from(worstLevel.entries()).map(([groupId, level]) => ({
    groupId,
    level,
    attachedTaskCount: attachedTaskCount.get(groupId) ?? 0,
  }));
}

/** future×high 投资任务的零进展示警条目（"正在砍未来"，§4）。 */
export interface InvestmentWarning {
  taskId: string;
  groupId: string;
  investment: TaskInvestment;
  /** 距最近进展信号的整周数（向下取整，>= INVESTMENT_STALL_WEEKS 才会出现在此列表）。 */
  weeksSinceProgress: number;
}

/**
 * 投资类任务"正在砍未来"示警（baseline-design.md §4）：`horizon:'future'` 且
 * `value:'high'`（如 sim2real）且连续 `INVESTMENT_STALL_WEEKS` 周零进展 → 进入示警列表。
 *
 * **"零进展"参照时间点的最简可行口径**（读 `pm-core.ts:TaskSchema` 实际字段后选定，非
 * 设计稿字面规定，记入本步 deviations）：优先用 `Task.lastProgressAt`（"最近推进信号，
 * commit/check-in 派生"——字段本就是为此场景存在）；若为 `null`（从未有过推进信号，比
 * "有过推进但停了"更彻底地零进展）退化用 `Task.createdAt`。`status==='done'` 的任务不算
 * "正在砍"（已完成，非投资被砍的场景）而排除；`shelved`（已被搁置）刻意**不**排除——
 * 那正是"正在砍未来"的实锤信号，理应出现在示警里。
 */
export function deriveInvestmentWarnings(tasks: Task[], now: Date): InvestmentWarning[] {
  const nowMs = now.getTime();
  const stallMs = INVESTMENT_STALL_WEEKS * MS_PER_WEEK;
  const warnings: InvestmentWarning[] = [];

  for (const task of tasks) {
    if (!task.investment) continue;
    if (task.investment.horizon !== 'future' || task.investment.value !== 'high') continue;
    if (task.status === 'done') continue;

    const referenceIso = task.lastProgressAt ?? task.createdAt;
    const idleMs = nowMs - new Date(referenceIso).getTime();
    if (idleMs < stallMs) continue;

    warnings.push({
      taskId: task.id,
      groupId: task.groupId,
      investment: task.investment,
      weeksSinceProgress: Math.floor(idleMs / MS_PER_WEEK),
    });
  }

  return warnings;
}

/** `timeAccumulation:'high'` 标注位（"早开始摊、突击无效"，§4）。 */
export interface TimeAccumulationFlag {
  taskId: string;
  groupId: string;
  label: typeof TIME_ACCUMULATION_LABEL;
}

/**
 * `timeAccumulation:'high'` 标注派生（baseline-design.md §4）：与"零进展示警"独立——
 * 覆盖**所有**打了 `timeAccumulation:'high'` 标签的投资任务（不限 `horizon`/`value`，
 * 例如调参任务多半是 `season×high×timeAccumulation:high`，不落在
 * `deriveInvestmentWarnings` 的 future×high 过滤里，仍需要这条"早开始摊"标注）。
 * 只出数据、不做复杂象限策略（§4 原文）：纯过滤+贴标签，不判定"是否已晚"。
 */
export function deriveTimeAccumulationFlags(tasks: Task[]): TimeAccumulationFlag[] {
  return tasks
    .filter((t) => t.investment?.timeAccumulation === 'high')
    .map((t) => ({ taskId: t.id, groupId: t.groupId, label: TIME_ACCUMULATION_LABEL }));
}
