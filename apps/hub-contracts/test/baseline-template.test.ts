import { describe, expect, test } from 'vitest';
import {
  SeasonBaselineSchema,
  generateRoboconBaselineTemplate,
} from '../src/index.js';

/**
 * Robocon 三版车节奏模板单测（baseline-design.md §2）：锚点展开的段/门顺序 + 真空段绕开。
 * 锚点取秋季开学 → 赛日约 49 周，满足模板「正向段 vs 倒推段 ≥ ~34 周才不穿插」的间隔假设。
 */
const ANCHORS = {
  semesterStart: '2025-09-08T00:00:00.000Z',
  competitionDate: '2026-08-16T00:00:00.000Z',
};

const ms = (iso: string) => new Date(iso).getTime();

describe('generateRoboconBaselineTemplate', () => {
  const tpl = generateRoboconBaselineTemplate(ANCHORS);

  test('产物 + id/seasonId 满足 SeasonBaselineSchema', () => {
    const parsed = SeasonBaselineSchema.safeParse({
      id: 'b-1',
      seasonId: 'season-x',
      ...tpl,
    });
    expect(parsed.success).toBe(true);
  });

  test('两锚点原样回填 anchors', () => {
    expect(tpl.anchors.semesterStart).toBe(ANCHORS.semesterStart);
    expect(tpl.anchors.competitionDate).toBe(ANCHORS.competitionDate);
  });

  test('里程碑 / 门按 plannedAt 升序 = V1→sim2real→V2→V3→整车试跑→调参', () => {
    const ordered = [...tpl.milestones].sort((a, b) => ms(a.plannedAt) - ms(b.plannedAt));
    expect(ordered.map((m) => m.id)).toEqual(['m-g1', 'm-m1', 'm-g2', 'm-g3', 'm-g4', 'm-m2']);
    // 数组本身即已按此顺序生成（生成序 = 时间序，前端无须再排）。
    expect(tpl.milestones.map((m) => m.id)).toEqual(ordered.map((m) => m.id));
  });

  test('门的 kind/robotVersion 正确；里程碑（M1/M2）是 milestone', () => {
    const byId = new Map(tpl.milestones.map((m) => [m.id, m]));
    expect(byId.get('m-g1')?.kind).toBe('gate');
    expect(byId.get('m-g2')?.robotVersion).toBe('V2');
    expect(byId.get('m-g3')?.robotVersion).toBe('V3');
    expect(byId.get('m-g4')?.kind).toBe('gate');
    expect(byId.get('m-m1')?.kind).toBe('milestone');
    expect(byId.get('m-m2')?.kind).toBe('milestone');
  });

  test('真空段存在且被 vacuum 阶段覆盖，研发/迭代/调参阶段一律绕开它', () => {
    const vacuumSeg = tpl.segments.find((s) => s.kind === 'vacuum');
    expect(vacuumSeg).toBeDefined();
    const vs = ms(vacuumSeg!.startsAt);
    const ve = ms(vacuumSeg!.endsAt);
    expect(ve).toBeGreaterThan(vs);

    // 真空窗口恰有一条 vacuum 阶段与之对齐（计划恒为零）。
    const vacuumPhase = tpl.phases.find((p) => p.type === 'vacuum');
    expect(vacuumPhase).toBeDefined();
    expect(ms(vacuumPhase!.startsAt)).toBe(vs);
    expect(ms(vacuumPhase!.endsAt)).toBe(ve);

    // 非真空阶段（rd/iterate/tuning）不与真空窗口重叠（半开区间 [start, end)）。
    for (const p of tpl.phases.filter((ph) => ph.type !== 'vacuum')) {
      const overlaps = ms(p.startsAt) < ve && ms(p.endsAt) > vs;
      expect(overlaps).toBe(false);
    }
  });

  test('阶段无缝铺满 semesterStart → competitionDate（无空洞、无越界）', () => {
    const sorted = [...tpl.phases].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
    expect(ms(sorted[0].startsAt)).toBe(ms(ANCHORS.semesterStart));
    expect(ms(sorted[sorted.length - 1].endsAt)).toBe(ms(ANCHORS.competitionDate));
    for (let i = 1; i < sorted.length; i += 1) {
      expect(ms(sorted[i].startsAt)).toBe(ms(sorted[i - 1].endsAt)); // 首尾相接
    }
  });
});
