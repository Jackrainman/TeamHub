import { describe, expect, test } from 'vitest';
import {
  deriveStagePipeline,
  STAGE_PIPELINE_STAGES,
  type BaselinePhase,
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
