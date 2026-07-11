import { describe, expect, test } from 'vitest';
import {
  BASELINE_DRIFT_LOOKAHEAD_WEEKS,
  TIME_ACCUMULATION_LABEL,
  deriveBaselineDrift,
  deriveGroupsBehind,
  deriveInvestmentWarnings,
  deriveTimeAccumulationFlags,
} from '../src/index.js';
import type {
  BaselineMilestone,
  SeasonBaseline,
  Task,
  TaskInvestment,
} from '../src/index.js';

/** S5 drift 派生单测（baseline-design.md §4）：红/黄/绿/无挂接/空 baseline/投资示警触发与不触发。 */

const NOW = new Date('2026-07-11T00:00:00.000Z');

function milestone(overrides: Partial<BaselineMilestone> & Pick<BaselineMilestone, 'id'>): BaselineMilestone {
  return {
    title: overrides.id,
    kind: 'milestone',
    plannedAt: '2026-07-11T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

function baselineOf(milestones: BaselineMilestone[]): SeasonBaseline {
  return {
    id: 'baseline-1',
    seasonId: 'season-2026',
    anchors: {},
    segments: [],
    phases: [],
    milestones,
  };
}

let taskSeq = 0;
function task(overrides: Partial<Task> = {}): Task {
  taskSeq += 1;
  return {
    id: `t-${taskSeq}`,
    projectId: 'proj-1',
    groupId: 'grp-ec',
    title: `任务 ${taskSeq}`,
    rawSummary: '原话',
    status: 'inProgress',
    statusSource: 'derived',
    ownerId: null,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function investment(overrides: Partial<TaskInvestment> = {}): TaskInvestment {
  return {
    horizon: 'future',
    value: 'high',
    timeAccumulation: 'low',
    ...overrides,
  };
}

describe('deriveBaselineDrift — 周粒度红黄绿', () => {
  test('红：plannedAt 已过且未 passed', () => {
    const baseline = baselineOf([
      milestone({ id: 'm-g4', plannedAt: '2026-07-01T00:00:00.000Z', status: 'pending' }),
    ]);
    const [drift] = deriveBaselineDrift(baseline, [], NOW);
    expect(drift.level).toBe('red');
  });

  test('黄：距 plannedAt ≤N 周且挂接任务完成度 < 阈值', () => {
    const plannedAt = new Date(NOW.getTime() + (BASELINE_DRIFT_LOOKAHEAD_WEEKS - 1) * 7 * 24 * 3600 * 1000).toISOString();
    const baseline = baselineOf([milestone({ id: 'm-g3', plannedAt, status: 'pending' })]);
    const tasks = [
      task({ milestoneId: 'm-g3', status: 'done' }),
      task({ milestoneId: 'm-g3', status: 'inProgress' }),
      task({ milestoneId: 'm-g3', status: 'blocked' }),
    ]; // 完成度 1/3 < 0.5
    const [drift] = deriveBaselineDrift(baseline, tasks, NOW);
    expect(drift.level).toBe('yellow');
    expect(drift.attachedDone).toBe(1);
    expect(drift.attachedTotal).toBe(3);
  });

  test('绿：远期里程碑，或临近但完成度已达标', () => {
    const farAway = new Date(NOW.getTime() + 20 * 7 * 24 * 3600 * 1000).toISOString();
    const baselineFar = baselineOf([milestone({ id: 'm-far', plannedAt: farAway, status: 'pending' })]);
    expect(deriveBaselineDrift(baselineFar, [], NOW)[0].level).toBe('green');

    const soon = new Date(NOW.getTime() + 1 * 7 * 24 * 3600 * 1000).toISOString();
    const baselineSoon = baselineOf([milestone({ id: 'm-soon', plannedAt: soon, status: 'pending' })]);
    const tasks = [task({ milestoneId: 'm-soon', status: 'done' }), task({ milestoneId: 'm-soon', status: 'done' })];
    expect(deriveBaselineDrift(baselineSoon, tasks, NOW)[0].level).toBe('green');

    // 已 passed 的里程碑恒绿，不管时间早已过去。
    const overdueButPassed = baselineOf([
      milestone({ id: 'm-passed', plannedAt: '2026-01-01T00:00:00.000Z', status: 'passed' }),
    ]);
    expect(deriveBaselineDrift(overdueButPassed, [], NOW)[0].level).toBe('green');
  });

  test('无 milestoneId 挂接：临近里程碑但零挂接任务 → 不判黄（数据不足不示警），判绿', () => {
    const soon = new Date(NOW.getTime() + 1 * 7 * 24 * 3600 * 1000).toISOString();
    const baseline = baselineOf([milestone({ id: 'm-empty', plannedAt: soon, status: 'pending' })]);
    const [drift] = deriveBaselineDrift(baseline, [], NOW);
    expect(drift.level).toBe('green');
    expect(drift.attachedTotal).toBe(0);
  });

  test('空 baseline：milestones 为空数组 → 输出空数组，不抛异常', () => {
    const baseline = baselineOf([]);
    expect(deriveBaselineDrift(baseline, [], NOW)).toEqual([]);
  });
});

describe('deriveGroupsBehind — 红/黄里程碑挂接任务按组聚合（单位=组，无 memberId）', () => {
  test('聚合出组条目，同组多里程碑取最严重档位', () => {
    const overdue = milestone({ id: 'm-red', plannedAt: '2026-07-01T00:00:00.000Z', status: 'pending' });
    const soon = milestone({
      id: 'm-yellow',
      plannedAt: new Date(NOW.getTime() + 1 * 7 * 24 * 3600 * 1000).toISOString(),
      status: 'pending',
    });
    const baseline = baselineOf([overdue, soon]);
    const tasks = [
      task({ groupId: 'grp-ec', milestoneId: 'm-red', status: 'inProgress' }),
      task({ groupId: 'grp-ec', milestoneId: 'm-yellow', status: 'inProgress' }),
      task({ groupId: 'grp-vision', milestoneId: 'm-yellow', status: 'inProgress' }),
      task({ groupId: 'grp-vision', milestoneId: 'm-yellow', status: 'done' }), // 拉低完成度使 m-yellow 判黄
    ];
    const drift = deriveBaselineDrift(baseline, tasks, NOW);
    const behind = deriveGroupsBehind(drift, tasks);
    const byGroup = new Map(behind.map((b) => [b.groupId, b]));

    expect(byGroup.get('grp-ec')?.level).toBe('red'); // 挂了红档 m-red，取最严重
    expect(byGroup.get('grp-ec')?.attachedTaskCount).toBe(2);
    expect(byGroup.get('grp-vision')?.level).toBe('yellow');
    expect(byGroup.get('grp-vision')?.attachedTaskCount).toBe(2);
    // 结构上不出现 memberId 字段（红线2）。
    for (const b of behind) expect(Object.keys(b).sort()).toEqual(['attachedTaskCount', 'groupId', 'level']);
  });

  test('绿档里程碑的挂接任务不产生组条目', () => {
    const baseline = baselineOf([
      milestone({
        id: 'm-green',
        plannedAt: new Date(NOW.getTime() + 30 * 7 * 24 * 3600 * 1000).toISOString(),
        status: 'pending',
      }),
    ]);
    const tasks = [task({ groupId: 'grp-mech', milestoneId: 'm-green' })];
    const drift = deriveBaselineDrift(baseline, tasks, NOW);
    expect(deriveGroupsBehind(drift, tasks)).toEqual([]);
  });
});

describe('deriveInvestmentWarnings — future×high 连续零进展示警', () => {
  test('触发：future×high 且 lastProgressAt 距今 ≥ 阈值周', () => {
    const staleAt = new Date(NOW.getTime() - 3 * 7 * 24 * 3600 * 1000).toISOString();
    const t = task({ investment: investment(), lastProgressAt: staleAt });
    const warnings = deriveInvestmentWarnings([t], NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].taskId).toBe(t.id);
    expect(warnings[0].weeksSinceProgress).toBeGreaterThanOrEqual(2);
  });

  test('触发：lastProgressAt 为 null（从未有过推进信号）时退化用 createdAt', () => {
    const t = task({
      investment: investment(),
      lastProgressAt: null,
      createdAt: new Date(NOW.getTime() - 5 * 7 * 24 * 3600 * 1000).toISOString(),
    });
    expect(deriveInvestmentWarnings([t], NOW)).toHaveLength(1);
  });

  test('不触发：进展新鲜（< 阈值周）', () => {
    const fresh = new Date(NOW.getTime() - 3 * 24 * 3600 * 1000).toISOString();
    const t = task({ investment: investment(), lastProgressAt: fresh });
    expect(deriveInvestmentWarnings([t], NOW)).toEqual([]);
  });

  test('不触发：horizon 非 future，或 value 非 high，或已 done，或无 investment', () => {
    const stale = new Date(NOW.getTime() - 4 * 7 * 24 * 3600 * 1000).toISOString();
    const seasonHigh = task({ investment: investment({ horizon: 'season' }), lastProgressAt: stale });
    const futureLow = task({ investment: investment({ value: 'low' }), lastProgressAt: stale });
    const doneTask = task({ investment: investment(), lastProgressAt: stale, status: 'done' });
    const noInvestment = task({ lastProgressAt: stale });
    expect(deriveInvestmentWarnings([seasonHigh, futureLow, doneTask, noInvestment], NOW)).toEqual([]);
  });
});

describe('deriveTimeAccumulationFlags — timeAccumulation:high 标注位', () => {
  test('触发：timeAccumulation high 的任务出现标注，不要求 horizon/value', () => {
    const t = task({ investment: investment({ horizon: 'season', value: 'low', timeAccumulation: 'high' }) });
    const flags = deriveTimeAccumulationFlags([t]);
    expect(flags).toEqual([{ taskId: t.id, groupId: t.groupId, label: TIME_ACCUMULATION_LABEL }]);
  });

  test('不触发：timeAccumulation low 或无 investment', () => {
    const low = task({ investment: investment({ timeAccumulation: 'low' }) });
    const none = task();
    expect(deriveTimeAccumulationFlags([low, none])).toEqual([]);
  });
});
