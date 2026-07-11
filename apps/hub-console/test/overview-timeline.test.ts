import { describe, expect, test } from 'vitest';
import { generateRoboconBaselineTemplate } from '@teamhub/hub-contracts';
import type { SeasonBaselinePublic } from '@teamhub/hub-contracts';
import {
  bandOf,
  currentPhase,
  currentSegment,
  pctOf,
  timelineSpan,
  weeksUntil,
} from '../src/features/overview/overview-timeline';

/** 总览时间轴位置计算单测（测逻辑不测 DOM，同 theme.test/console-pages.test 风格）。 */

const ANCHORS = {
  semesterStart: '2025-09-08T00:00:00.000Z',
  competitionDate: '2026-08-16T00:00:00.000Z',
};

function demoBaseline(): SeasonBaselinePublic {
  const tpl = generateRoboconBaselineTemplate(ANCHORS);
  return { id: 'b', seasonId: 's', ...tpl };
}

const ms = (iso: string) => new Date(iso).getTime();

describe('overview-timeline', () => {
  const baseline = demoBaseline();
  const span = timelineSpan(baseline)!;

  test('timelineSpan = 最早 segment 起点 → 最晚 segment 终点', () => {
    expect(span.startMs).toBe(ms(ANCHORS.semesterStart));
    expect(span.endMs).toBe(ms(ANCHORS.competitionDate));
  });

  test('残缺基准线（无 segment）→ null', () => {
    expect(timelineSpan({ ...baseline, segments: [] })).toBeNull();
  });

  test('pctOf：端点 0/100，越界 clamp', () => {
    expect(pctOf(span, ANCHORS.semesterStart)).toBe(0);
    expect(pctOf(span, ANCHORS.competitionDate)).toBe(100);
    expect(pctOf(span, '2020-01-01T00:00:00.000Z')).toBe(0);
    expect(pctOf(span, '2030-01-01T00:00:00.000Z')).toBe(100);
    const mid = pctOf(span, '2026-02-23T00:00:00.000Z');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
  });

  test('bandOf：宽度 = 右-左，不为负', () => {
    const seg = baseline.segments[0];
    const b = bandOf(span, seg);
    expect(b.leftPct).toBe(0);
    expect(b.widthPct).toBeGreaterThan(0);
  });

  test('currentSegment/currentPhase：now 落在第二学期 / iterate 阶段', () => {
    const now = ms('2026-07-11T00:00:00.000Z');
    expect(currentSegment(baseline.segments, now)?.kind).toBe('semester');
    expect(currentPhase(baseline.phases, now)?.type).toBe('iterate');
  });

  test('currentSegment：now 落在真空窗口内 → 命中 vacuum 段', () => {
    const inVacuum = ms('2025-12-15T00:00:00.000Z');
    expect(currentSegment(baseline.segments, inVacuum)?.kind).toBe('vacuum');
  });

  test('weeksUntil：未来向上取整；已过返回 0', () => {
    const now = ms('2026-07-11T00:00:00.000Z');
    expect(weeksUntil(ANCHORS.competitionDate, now)).toBe(6); // 07-11 → 08-16 = 36 天 → ceil(36/7)=6
    expect(weeksUntil('2026-06-01T00:00:00.000Z', now)).toBe(0);
  });
});
