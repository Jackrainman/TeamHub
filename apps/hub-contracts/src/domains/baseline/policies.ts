import type { Task } from '../pm/model.js';
import type { TaskInvestment } from '../pm/model.js';
import { STAGE_PIPELINE_STAGES } from './model.js';
import type {
  BaselineAnchors,
  BaselineMilestone,
  BaselinePhase,
  BaselinePhaseType,
  BaselineSegment,
  MilestoneRobotVersion,
  MilestoneStage,
  SeasonBaseline,
} from './model.js';

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

// ---------------------------------------------------------------------------
// Robocon 三版车节奏模板 v1（baseline-design.md §2）：两锚点 → 相对周展开。
// 纯函数、无 IO；产物直接喂 `PATCH /api/baseline`（返回体 = UpdateBaselineRequest 的四字段，
// 不含 id/seasonId——那两个由 store 按 seasonId 派生/钉死）。
// ---------------------------------------------------------------------------

/** `generateRoboconBaselineTemplate` 的产物形状 = SeasonBaseline 去掉 id/seasonId 的四字段。 */
export interface RoboconBaselineTemplate {
  anchors: BaselineAnchors;
  segments: BaselineSegment[];
  phases: BaselinePhase[];
  milestones: BaselineMilestone[];
}

function addWeeks(iso: string, w: number): string {
  return new Date(new Date(iso).getTime() + w * MS_PER_WEEK).toISOString();
}

/** 模板内置教训注记（baseline-design.md §2 原文口径，供前端直接展示，不改写）。 */
export const TEMPLATE_NOTE_G1 = '第一学期内必须完成：V1 上电控去找极限、视觉做技术实验，找齐所有问题才拍板 V2 设计。';
export const TEMPLATE_NOTE_M1 = '假期双链：电控在仿真里先摔明白再上车；前置=需有人提前研究 sim2real（现状缺口，进「学习方向」）。';
export const TEMPLATE_NOTE_M2 = '调参入场默认挂在 G4 整车试跑之后（堵「车没跑通就调参」）。上届备馆才开始调参，结论=过晚。';

/**
 * 生成 Robocon 三版车节奏基准线模板（baseline-design.md §2）。
 *
 * 布局口径（相对周占位，赛后回填真实时间线）：
 * - **第一学期从「秋季开学日」正向展开**（研发→迭代→期末真空），G1 问题清单收敛门落在学期中后段；
 * - **竞赛尾段从「赛日」倒推**（倒排：G3 出车 / G4 整车试跑 / M2 调参入场靠比赛日排布），
 *   契合「从比赛日倒推」的产品心脏（§4.1）；
 * - 中段寒假（假期双链，M1 sim2real 环境可用）在两锚点之间正向落位。
 *
 * **期末前 4 周 + 考试 = 6 周真空段**：`kind:'vacuum'` 段 + `type:'vacuum'` 阶段（计划恒为零），
 * 研发/迭代/调参阶段一律绕开它（倒排排任务时此窗口不放事）。
 *
 * 版次裁剪（红线5）不在模板里做——模板恒生成三版；队长若只做两版，走 `PATCH` 把 V3 门的
 * `robotVersion` 改挂 'V2' + 填 `mergedFromVersion:'V3'`，门本身不删。
 *
 * **锚点间隔假设**：模板正向段（G2 落在第二学期第 1–2 周 ≈ 开学 +25 周）与倒推段（G3 ≈ 赛日 −8 周）
 * 需两锚点至少相隔约 34 周才不互相穿插；间隔过短时里程碑顺序可能错乱，属需队长手写覆盖修正的边界情形
 * （v1 相对周占位的已知约束，记入实现 deviations）。
 *
 * **stage 挂载（STAGE-PIPELINE Step2）**：G1→moduleDesign（V2 设计拍板门）、M1→moduleTest
 * （sim2real 模块级验证基建）、G2/G3→integratedAssembly（V2 拼装/V3 出车）、G4→integratedTest、
 * M2→convergence；moduleAssembly 不挂标签（塌缩零长区间自动跳过）。队长可按实际经 PATCH 改挂。
 */
export function generateRoboconBaselineTemplate(anchors: {
  semesterStart: string;
  competitionDate: string;
}): RoboconBaselineTemplate {
  const { semesterStart: s, competitionDate: c } = anchors;

  // 第一学期正向锚点（开学 = 第 0 周）
  const fallTeachEnd = addWeeks(s, 12); // 授课段结束（期末真空前）
  const vacuumEnd = addWeeks(s, 18); // 期末真空结束 = 寒假开始（6 周真空）
  const winterEnd = addWeeks(s, 24); // 寒假结束 = 第二学期开始

  // 竞赛尾段倒推锚点（赛日 = 第 0 周往回数）
  const tuningStart = addWeeks(c, -4); // G4 整车试跑 → 进入调参期

  const segments: BaselineSegment[] = [
    { kind: 'semester', startsAt: s, endsAt: fallTeachEnd, label: '第一学期' },
    { kind: 'vacuum', startsAt: fallTeachEnd, endsAt: vacuumEnd, label: '期末前 4 周 + 考试（真空段·计划恒为零）' },
    { kind: 'vacation', startsAt: vacuumEnd, endsAt: winterEnd, label: '寒假（假期双链）' },
    { kind: 'semester', startsAt: winterEnd, endsAt: c, label: '第二学期' },
  ];

  const phases: BaselinePhase[] = [
    { type: 'rd', startsAt: s, endsAt: addWeeks(s, 4) }, // V1 实验车研发
    { type: 'iterate', startsAt: addWeeks(s, 4), endsAt: fallTeachEnd }, // V1 找极限 · 收敛问题清单
    { type: 'vacuum', startsAt: fallTeachEnd, endsAt: vacuumEnd }, // 真空段：绕开，不放事
    { type: 'iterate', startsAt: vacuumEnd, endsAt: winterEnd }, // 寒假 sim2real ∥ 画 V2 图
    { type: 'iterate', startsAt: winterEnd, endsAt: tuningStart }, // V2 拼装 → V3 出车 → 联调
    { type: 'tuning', startsAt: tuningStart, endsAt: c }, // 调参 → 赛
  ];

  const milestones: BaselineMilestone[] = [
    {
      id: 'm-g1',
      title: 'G1：问题清单收敛（V2 设计拍板）',
      kind: 'gate',
      plannedAt: addWeeks(s, 11),
      stage: 'moduleDesign',
      robotVersion: 'V1',
      status: 'pending',
      note: TEMPLATE_NOTE_G1,
    },
    {
      id: 'm-m1',
      title: 'M1：sim2real 环境可用',
      kind: 'milestone',
      plannedAt: addWeeks(s, 21),
      stage: 'moduleTest',
      status: 'pending',
      note: TEMPLATE_NOTE_M1,
    },
    {
      id: 'm-g2',
      title: 'G2：V2 拼装完成',
      kind: 'gate',
      plannedAt: addWeeks(s, 25), // 第二学期第 1–2 周
      stage: 'integratedAssembly',
      robotVersion: 'V2',
      status: 'pending',
    },
    {
      id: 'm-g3',
      title: 'G3：V3 出车（冲奖、能完整闭环）',
      kind: 'gate',
      plannedAt: addWeeks(c, -8), // 期中前
      stage: 'integratedAssembly',
      robotVersion: 'V3',
      status: 'pending',
    },
    {
      id: 'm-g4',
      title: 'G4：整车试跑（含破坏性 / 极限工况）',
      kind: 'gate',
      plannedAt: tuningStart, // 赛日 −4 周
      stage: 'integratedTest',
      robotVersion: 'V3',
      status: 'pending',
    },
    {
      id: 'm-m2',
      title: 'M2：调参入场',
      kind: 'milestone',
      plannedAt: addWeeks(c, -3), // 挂在 G4 之后
      stage: 'convergence',
      status: 'pending',
      note: TEMPLATE_NOTE_M2,
    },
  ];

  return {
    anchors: { semesterStart: s, competitionDate: c },
    segments,
    phases,
    milestones,
  };
}

// ---------------------------------------------------------------------------
// 整车六阶段 stepper（STAGE-PIPELINE，IA-RESTRUCTURE）：阶段只做视图投影、不建实体。
// Step1 零 schema 变更：phases（rd/iterate/tuning）时间窗近似映射六阶段（deriveStagePipeline）。
// Step2（本版）：milestone 可选 stage 字段 + deriveStageProgress 精确派生——任意里程碑带
// stage 标签即进精确模式，存量零标签板回退 Step1 近似映射，组件 props 不变。
// ---------------------------------------------------------------------------

export { STAGE_PIPELINE_STAGES } from './model.js';
export type StagePipelineStage = MilestoneStage;
export type StagePipelineStatus = 'done' | 'current' | 'upcoming';
export interface StageProgress {
  stage: StagePipelineStage;
  status: StagePipelineStatus;
  startsAt: string;
  endsAt: string;
}

const STAGE_CONVERGENCE_FALLBACK_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 六阶段精确派生（STAGE-PIPELINE Step2）：milestone 可选 `stage` 字段驱动。
 * 任一里程碑带 stage 标签 → 精确模式：
 * - **时间窗** = 该阶段里程碑 plannedAt 的 [min, max]，按阶段序单调钳制（乱序/倒挂数据不炸）；
 *   无标签阶段塌缩为零长区间（位于 current 之前判 done、之后判 upcoming，不阻断传递，
 *   与 Step1 缺失 phase 塌缩口径一致）；末段 endsAt 不早于比赛日（若配置且更晚）。
 * - **状态** = 里程碑结论投影（不再由时钟驱动）：阶段内里程碑全部完结（passed/missed，
 *   无 pending）→ done；第一个未完结阶段 → current；其余 upcoming；全过则全 done 无
 *   current（与 deriveRobotStageMarkers 的 allPassed 口径一致）。
 * 存量板（零 stage 标签）→ 回退 Step1 phases 近似映射 deriveStagePipeline，行为不变。
 * 未挂 stage 的里程碑不参与窗口/状态（仅 deriveRobotStageMarkers 的车标定位仍用它）。
 */
export function deriveStageProgress(
  milestones: readonly BaselineMilestone[],
  phases: readonly BaselinePhase[],
  competitionDate: string | undefined,
  now: string,
): StageProgress[] | null {
  const byStage = STAGE_PIPELINE_STAGES.map((stage) =>
    milestones.filter((m) => m.stage === stage),
  );
  if (byStage.every((list) => list.length === 0)) {
    return deriveStagePipeline(phases, competitionDate, now);
  }

  const msOf = (iso: string) => new Date(iso).getTime();
  const toIso = (ms: number) => new Date(ms).toISOString();
  // 游标起点 = 全部挂标里程碑的最早 plannedAt：前导无标签阶段塌缩到该点。
  let cursor = Math.min(...byStage.flatMap((list) => list.map((m) => msOf(m.plannedAt))));

  const ranges = byStage.map((list, i) => {
    if (list.length === 0) return { startsAt: cursor, endsAt: cursor, empty: true };
    let start = Math.min(...list.map((m) => msOf(m.plannedAt)));
    let end = Math.max(...list.map((m) => msOf(m.plannedAt)));
    if (start < cursor) start = cursor;
    if (end < start) end = start;
    if (i === byStage.length - 1 && competitionDate && msOf(competitionDate) > end) {
      end = msOf(competitionDate);
    }
    cursor = end;
    return { startsAt: start, endsAt: end, empty: false };
  });

  let currentUsed = false;
  return ranges.map((range, i) => {
    const list = byStage[i];
    let status: StagePipelineStatus;
    if (range.empty) status = currentUsed ? 'upcoming' : 'done';
    else if (list.every((m) => m.status !== 'pending')) status = 'done';
    else if (!currentUsed) {
      status = 'current';
      currentUsed = true;
    } else status = 'upcoming';
    return {
      stage: STAGE_PIPELINE_STAGES[i],
      status,
      startsAt: toIso(range.startsAt),
      endsAt: toIso(range.endsAt),
    };
  });
}

/**
 * 六阶段近似投影：状态语义 = 已结束的 done、**第一个未结束的 current**、其余 upcoming
 * （间隙期/未开赛都有明确的「当前要推进的阶段」，不出现无 current 断头）。
 * 无 rd phase（空板/未编排）→ null（前端空态）。缺失的 iterate/tuning 塌缩为零长区间
 * （自动判 done 跳过），不炸。
 */
export function deriveStagePipeline(
  phases: readonly BaselinePhase[],
  competitionDate: string | undefined,
  now: string,
): StageProgress[] | null {
  const windowOf = (type: BaselinePhaseType) => {
    const ps = phases.filter((p) => p.type === type);
    if (ps.length === 0) return null;
    const starts = ps.map((p) => p.startsAt).sort();
    const ends = ps.map((p) => p.endsAt).sort();
    return { startsAt: starts[0], endsAt: ends[ends.length - 1] };
  };
  const rd = windowOf('rd');
  if (!rd) return null;
  const iterate = windowOf('iterate');
  const tuning = windowOf('tuning');

  const rdStartMs = new Date(rd.startsAt).getTime();
  const rdThird = (new Date(rd.endsAt).getTime() - rdStartMs) / 3;
  const iso = (ms: number) => new Date(ms).toISOString();
  const asmStart = iterate?.startsAt ?? rd.endsAt;
  const asmEnd = iterate?.endsAt ?? asmStart;
  const testStart = tuning?.startsAt ?? asmEnd;
  const testEnd = tuning?.endsAt ?? testStart;
  const convEnd =
    competitionDate ?? iso(new Date(testEnd).getTime() + STAGE_CONVERGENCE_FALLBACK_MS);

  const ranges: Array<[StagePipelineStage, string, string]> = [
    ['moduleDesign', rd.startsAt, iso(rdStartMs + rdThird)],
    ['moduleAssembly', iso(rdStartMs + rdThird), iso(rdStartMs + 2 * rdThird)],
    ['moduleTest', iso(rdStartMs + 2 * rdThird), rd.endsAt],
    ['integratedAssembly', asmStart, asmEnd],
    ['integratedTest', testStart, testEnd],
    ['convergence', testEnd, convEnd],
  ];

  const nowMs = new Date(now).getTime();
  let currentUsed = false;
  return ranges.map(([stage, startsAt, endsAt]) => {
    let status: StagePipelineStatus;
    if (nowMs >= new Date(endsAt).getTime()) status = 'done';
    else if (!currentUsed) {
      status = 'current';
      currentUsed = true;
    } else status = 'upcoming';
    return { stage, status, startsAt, endsAt };
  });
}

/**
 * 车标位置派生（STAGE-PIPELINE Step1.5，「当前 V1 车状态在这里」）：每辆整车版本（V1/V2/V3）
 * 当前所处阶段 = 该车**最早 pending 里程碑**的 plannedAt 落入的阶段区间；plannedAt 早于所有区间
 * → 首段，晚于所有 → 末段。该车里程碑全通过（无 pending）→ 落在末段（待联调/冲刺）；
 * 该车没有任何挂版里程碑 → 不出标记（而非猜）。
 * **纯派生零手工状态**——阶段是里程碑/任务进度的投影，不是 robot 实体的成员变量（见 todo
 * STAGE-PIPELINE 产品定案：阶段只做视图投影、不建实体）。
 */
export interface RobotStageMarker {
  robotVersion: MilestoneRobotVersion;
  stageIndex: number;
  /** 定位依据里程碑标题（悬停说明用）。 */
  milestoneTitle: string;
  /** true = 该车里程碑已全部通过，标记在末段是「全过冲线」而非「还有节点」。 */
  allPassed: boolean;
}

export function deriveRobotStageMarkers(
  milestones: readonly BaselineMilestone[],
  stages: readonly StageProgress[],
): RobotStageMarker[] {
  if (stages.length === 0) return [];
  const byRobot = new Map<MilestoneRobotVersion, BaselineMilestone[]>();
  for (const m of milestones) {
    if (!m.robotVersion) continue;
    const list = byRobot.get(m.robotVersion) ?? [];
    list.push(m);
    byRobot.set(m.robotVersion, list);
  }
  const locate = (plannedAt: string): number => {
    const ms = new Date(plannedAt).getTime();
    // <=：精确模式（Step2）下单里程碑阶段是零长点窗口（startsAt==endsAt），严格 < 会漏掉
    // 恰好落在阶段末的里程碑；边界归属早段（「该阶段截止节点」口径）。
    for (let i = 0; i < stages.length; i++) {
      if (ms <= new Date(stages[i].endsAt).getTime()) return i;
    }
    return stages.length - 1;
  };
  const markers: RobotStageMarker[] = [];
  for (const [robotVersion, list] of [...byRobot.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const pending = list
      .filter((m) => m.status === 'pending')
      .sort((a, b) => (a.plannedAt < b.plannedAt ? -1 : 1));
    if (pending.length > 0) {
      markers.push({
        robotVersion,
        stageIndex: locate(pending[0].plannedAt),
        milestoneTitle: pending[0].title,
        allPassed: false,
      });
    } else {
      const last = list.slice().sort((a, b) => (a.plannedAt < b.plannedAt ? -1 : 1)).at(-1)!;
      markers.push({
        robotVersion,
        stageIndex: stages.length - 1,
        milestoneTitle: last.title,
        allPassed: true,
      });
    }
  }
  return markers;
}
