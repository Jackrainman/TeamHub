import { describe, expect, test } from 'vitest';
import {
  deriveRobotStageMarkers,
  deriveStagePipeline,
  deriveStageProgress,
  STAGE_PIPELINE_STAGES,
  type BaselineMilestone,
  type BaselinePhase,
  type StagePipelineStage,
} from '../src/index.js';

/**
 * STAGE-PIPELINE Step1：phases 时间窗近似映射六阶段（零 schema 变更）。
 * 状态语义：已结束 done、第一个未结束 current、其余 upcoming。
 */

const rd: BaselinePhase = { type: 'rd', startsAt: '2026-03-01T00:00:00.000Z', endsAt: '2026-05-31T00:00:00.000Z' };
const iterate: BaselinePhase = { type: 'iterate', startsAt: '2026-06-01T00:00:00.000Z', endsAt: '2026-07-15T00:00:00.000Z' };
const tuning: BaselinePhase = { type: 'tuning', startsAt: '2026-07-16T00:00:00.000Z', endsAt: '2026-08-10T00:00:00.000Z' };
const COMPETITION = '2026-08-24T00:00:00.000Z';

describe('deriveStagePipeline', () => {
  test('无 rd phase（空板）→ null（前端空态）', () => {
    expect(deriveStagePipeline([], COMPETITION, '2026-04-01T00:00:00.000Z')).toBeNull();
    expect(deriveStagePipeline([iterate], COMPETITION, '2026-04-01T00:00:00.000Z')).toBeNull();
  });

  test('六段顺序与 STAGE_PIPELINE_STAGES 一致；rd 三等分边界相连', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-03-01T00:00:00.000Z')!;
    expect(stages.map((s) => s.stage)).toEqual([...STAGE_PIPELINE_STAGES]);
    // rd 三等分：moduleDesign.end = moduleAssembly.start，moduleAssembly.end = moduleTest.start
    expect(stages[0].endsAt).toBe(stages[1].startsAt);
    expect(stages[1].endsAt).toBe(stages[2].startsAt);
    expect(stages[2].endsAt).toBe(rd.endsAt);
    expect(stages[3].startsAt).toBe(iterate.startsAt);
    expect(stages[4].startsAt).toBe(tuning.startsAt);
    expect(stages[5].endsAt).toBe(COMPETITION);
  });

  test('rd 前段 → moduleDesign current，其余 upcoming', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-03-10T00:00:00.000Z')!;
    expect(stages[0].status).toBe('current');
    expect(stages.slice(1).every((s) => s.status === 'upcoming')).toBe(true);
  });

  test('now 落在 iterate → 前三段 done，integratedAssembly current', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-06-15T00:00:00.000Z')!;
    expect(stages.map((s) => s.status)).toEqual([
      'done', 'done', 'done', 'current', 'upcoming', 'upcoming',
    ]);
  });

  test('待联调段（tuning 末→比赛日）→ convergence current', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-08-15T00:00:00.000Z')!;
    expect(stages[5].status).toBe('current');
    expect(stages.slice(0, 5).every((s) => s.status === 'done')).toBe(true);
  });

  test('超过比赛日 → 全 done（无 current）', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-09-01T00:00:00.000Z')!;
    expect(stages.every((s) => s.status === 'done')).toBe(true);
  });

  test('缺失 iterate/tuning → 塌缩零长区间自动判 done，不炸', () => {
    const stages = deriveStagePipeline([rd], COMPETITION, '2026-06-01T00:00:00.000Z')!;
    // rd 已结束 → 前三段 done；iterate/tuning 零长 → done；convergence current
    expect(stages.map((s) => s.status)).toEqual([
      'done', 'done', 'done', 'done', 'done', 'current',
    ]);
  });

  test('无 competitionDate → 待联调段终点 = tuning 末 +14d', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], undefined, '2026-08-15T00:00:00.000Z')!;
    expect(stages[5].startsAt).toBe(tuning.endsAt);
    const fallbackMs = new Date(stages[5].endsAt).getTime() - new Date(tuning.endsAt).getTime();
    expect(fallbackMs).toBe(14 * 24 * 60 * 60 * 1000);
    expect(stages[5].status).toBe('current');
  });

  test('now 在 rd 开始前 → 首段 current（「当前要推进的」不断头）', () => {
    const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-02-01T00:00:00.000Z')!;
    expect(stages[0].status).toBe('current');
  });
});

describe('deriveRobotStageMarkers（「当前 V1 车状态在这里」车标派生）', () => {
  const stages = deriveStagePipeline([rd, iterate, tuning], COMPETITION, '2026-04-01T00:00:00.000Z')!;
  const ms = (
    id: string,
    robotVersion: 'V1' | 'V2' | 'V3' | undefined,
    plannedAt: string,
    status: 'pending' | 'passed' | 'missed' = 'pending',
  ): BaselineMilestone => ({
    id,
    title: `节点-${id}`,
    kind: 'milestone',
    plannedAt,
    robotVersion,
    status,
  });

  test('车标 = 该车最早 pending 里程碑落入的阶段区间', () => {
    const markers = deriveRobotStageMarkers(
      [
        ms('a', 'V1', '2026-03-10T00:00:00.000Z'), // rd 前 1/3 → moduleDesign(0)
        ms('b', 'V1', '2026-07-20T00:00:00.000Z'), // 更晚的 pending 不影响（取最早）
        ms('c', 'V2', '2026-07-20T00:00:00.000Z'), // tuning → integratedTest(4)
      ],
      stages,
    );
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ robotVersion: 'V1', stageIndex: 0, allPassed: false });
    expect(markers[1]).toMatchObject({ robotVersion: 'V2', stageIndex: 4, allPassed: false });
  });

  test('plannedAt 早于首段 → 首段；晚于末段 → 末段', () => {
    const markers = deriveRobotStageMarkers(
      [
        ms('early', 'V1', '2026-01-01T00:00:00.000Z'),
        ms('late', 'V2', '2027-01-01T00:00:00.000Z'),
      ],
      stages,
    );
    expect(markers[0].stageIndex).toBe(0);
    expect(markers[1].stageIndex).toBe(stages.length - 1);
  });

  test('该车里程碑全通过 → 末段 + allPassed 标记（冲线而非还有节点）', () => {
    const markers = deriveRobotStageMarkers(
      [ms('a', 'V1', '2026-03-10T00:00:00.000Z', 'passed')],
      stages,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ stageIndex: stages.length - 1, allPassed: true });
  });

  test('无挂版里程碑的车不出标记；无 robotVersion 的里程碑不参与', () => {
    const markers = deriveRobotStageMarkers(
      [ms('a', undefined, '2026-03-10T00:00:00.000Z')],
      stages,
    );
    expect(markers).toHaveLength(0);
  });
});

describe('deriveStageProgress（STAGE-PIPELINE Step2 精确派生）', () => {
  const tm = (
    id: string,
    stage: StagePipelineStage,
    plannedAt: string,
    status: 'pending' | 'passed' | 'missed' = 'pending',
  ): BaselineMilestone => ({
    id,
    title: `节点-${id}`,
    kind: 'milestone',
    plannedAt,
    stage,
    status,
  });

  test('零 stage 标签（存量板）→ 回退 Step1 phases 近似映射，结果逐项一致', () => {
    const untagged: BaselineMilestone[] = [
      { id: 'x', title: 'x', kind: 'milestone', plannedAt: '2026-04-01T00:00:00.000Z', status: 'pending' },
    ];
    const now = '2026-06-15T00:00:00.000Z';
    const precise = deriveStageProgress(untagged, [rd, iterate, tuning], COMPETITION, now);
    const approx = deriveStagePipeline([rd, iterate, tuning], COMPETITION, now);
    expect(precise).toEqual(approx);
  });

  test('任一里程碑带 stage 标签 → 精确模式：窗口=该阶段里程碑 plannedAt [min,max]', () => {
    const stages = deriveStageProgress(
      [
        tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z'),
        tm('d2', 'moduleDesign', '2026-04-01T00:00:00.000Z'),
        tm('t1', 'moduleTest', '2026-05-01T00:00:00.000Z'),
      ],
      [],
      undefined,
      '2026-03-15T00:00:00.000Z',
    )!;
    expect(stages.map((s) => s.stage)).toEqual([...STAGE_PIPELINE_STAGES]);
    expect(stages[0]).toMatchObject({
      startsAt: '2026-03-01T00:00:00.000Z',
      endsAt: '2026-04-01T00:00:00.000Z',
    });
    expect(stages[2]).toMatchObject({
      startsAt: '2026-05-01T00:00:00.000Z',
      endsAt: '2026-05-01T00:00:00.000Z',
    });
  });

  test('状态=里程碑结论投影：全完结段 done，第一个有 pending 段 current，其余 upcoming（时钟无关）', () => {
    const stages = deriveStageProgress(
      [
        tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z', 'passed'),
        tm('a1', 'moduleAssembly', '2026-04-01T00:00:00.000Z', 'missed'), // missed 也算完结
        tm('t1', 'moduleTest', '2026-05-01T00:00:00.000Z'), // pending → current
        tm('i1', 'integratedAssembly', '2026-06-01T00:00:00.000Z'),
      ],
      [],
      undefined,
      '2026-01-01T00:00:00.000Z', // now 远在过去也不影响（精确模式时钟无关）
    )!;
    expect(stages.map((s) => s.status)).toEqual([
      'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming',
    ]);
  });

  test('无标签阶段塌缩零长：current 之前判 done、之后判 upcoming', () => {
    // moduleAssembly(1) 无标签，在 current(2) 之前 → done；integratedTest(4) 无标签，在 current 之后 → upcoming
    const stages = deriveStageProgress(
      [
        tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z', 'passed'),
        tm('t1', 'moduleTest', '2026-05-01T00:00:00.000Z'), // current
        tm('i1', 'integratedAssembly', '2026-06-01T00:00:00.000Z'),
        tm('c1', 'convergence', '2026-08-01T00:00:00.000Z'),
      ],
      [],
      undefined,
      '2026-05-10T00:00:00.000Z',
    )!;
    expect(stages.map((s) => s.status)).toEqual([
      'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming',
    ]);
    // 塌缩段窗口 = 前一段末（零长）
    expect(stages[1].startsAt).toBe(stages[1].endsAt);
    expect(stages[1].endsAt).toBe(stages[0].endsAt);
    expect(stages[4].startsAt).toBe(stages[4].endsAt);
    expect(stages[4].endsAt).toBe(stages[3].endsAt);
  });

  test('末段 endsAt 被更晚的 competitionDate 拉长（不截短已有窗口）', () => {
    const stages = deriveStageProgress(
      [tm('c1', 'convergence', '2026-08-01T00:00:00.000Z')],
      [],
      '2026-08-24T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z',
    )!;
    expect(stages[5].endsAt).toBe('2026-08-24T00:00:00.000Z');
    // competitionDate 早于末段里程碑 → 不截短
    const stages2 = deriveStageProgress(
      [tm('c1', 'convergence', '2026-09-01T00:00:00.000Z')],
      [],
      '2026-08-24T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z',
    )!;
    expect(stages2[5].endsAt).toBe('2026-09-01T00:00:00.000Z');
  });

  test('全部 passed → 全 done 无 current（与车标 allPassed 口径一致）', () => {
    const stages = deriveStageProgress(
      [
        tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z', 'passed'),
        tm('c1', 'convergence', '2026-08-01T00:00:00.000Z', 'passed'),
      ],
      [],
      undefined,
      '2026-05-01T00:00:00.000Z',
    )!;
    expect(stages.every((s) => s.status === 'done')).toBe(true);
  });

  test('阶段内 plannedAt 倒挂/乱序 → 单调钳制不炸（窗口非递减）', () => {
    const stages = deriveStageProgress(
      [
        tm('d1', 'moduleDesign', '2026-05-01T00:00:00.000Z'), // 比后段还晚
        tm('t1', 'moduleTest', '2026-03-01T00:00:00.000Z'),
      ],
      [],
      undefined,
      '2026-04-01T00:00:00.000Z',
    )!;
    for (let i = 1; i < stages.length; i++) {
      expect(new Date(stages[i].startsAt).getTime()).toBeGreaterThanOrEqual(
        new Date(stages[i - 1].endsAt).getTime(),
      );
    }
  });

  test('未挂 stage 的里程碑不参与精确模式（全部未挂 → 回退近似）', () => {
    const mixed: BaselineMilestone[] = [
      tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z'),
      { id: 'u', title: 'u', kind: 'milestone', plannedAt: '2026-07-01T00:00:00.000Z', status: 'pending' },
    ];
    const stages = deriveStageProgress(mixed, [], undefined, '2026-03-10T00:00:00.000Z')!;
    // 未挂标签的 7 月里程碑不把窗口拉长：moduleDesign 段止于一 milestone 自身
    expect(stages[0].endsAt).toBe('2026-03-01T00:00:00.000Z');
    expect(stages[0].status).toBe('current');
  });

  test('精确模式窗口与 deriveRobotStageMarkers 协作：车标落在最早 pending 里程碑所属段', () => {
    const milestones: BaselineMilestone[] = [
      tm('d1', 'moduleDesign', '2026-03-01T00:00:00.000Z', 'passed'),
      tm('t1', 'moduleTest', '2026-05-01T00:00:00.000Z'),
      { ...tm('v1', 'integratedTest', '2026-07-01T00:00:00.000Z'), robotVersion: 'V2' },
    ];
    const stages = deriveStageProgress(milestones, [], undefined, '2026-05-10T00:00:00.000Z')!;
    const markers = deriveRobotStageMarkers(milestones, stages);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ robotVersion: 'V2', stageIndex: 4 });
  });
});
