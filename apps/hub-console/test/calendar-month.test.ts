import { describe, expect, test, vi } from 'vitest';
import type { Project } from '@teamhub/hub-contracts';
import {
  buildMonthGrid,
  colorIndexOf,
  layoutWeekBars,
  monthLabel,
} from '../src/features/pm/calendar/calendar-month';

const today = '2026-11-16';

function project(id: string, startsAt: string | null, endsAt: string | null, name = id): Project {
  return {
    id,
    seasonId: 'season-1',
    name,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    startsAt,
    endsAt,
  };
}

describe('buildMonthGrid', () => {
  test('2026-11 固定六周、42 格并正确标记月外日期和今天', () => {
    const grid = buildMonthGrid(2026, 11, today);
    const days = grid.weeks.flatMap(week => week.days);
    expect(grid.weeks).toHaveLength(6);
    expect(days).toHaveLength(42);
    expect(days[0].key).toBe('2026-10-26');
    expect(days[41].key).toBe('2026-12-06');
    expect(days.filter(day => day.inMonth)).toHaveLength(30);
    expect(days.filter(day => day.isToday).map(day => day.key)).toEqual([today]);
    expect(grid.weeks.every(week => week.days.length === 7 && week.weekEnd === week.days[6].key)).toBe(true);
  });

  test('跨年 2027-01 与闰年 2028-02 的 42 格边界', () => {
    const january = buildMonthGrid(2027, 1, today).weeks.flatMap(week => week.days);
    expect(january).toHaveLength(42);
    expect(january[0].key).toBe('2026-12-28');
    expect(january[41].key).toBe('2027-02-07');
    expect(january.filter(day => day.inMonth)).toHaveLength(31);

    const february = buildMonthGrid(2028, 2, today).weeks.flatMap(week => week.days);
    expect(february).toHaveLength(42);
    expect(february[0].key).toBe('2028-01-31');
    expect(february[41].key).toBe('2028-03-12');
    expect(february.some(day => day.key === '2028-02-29' && day.inMonth)).toBe(true);
    expect(february.filter(day => day.inMonth)).toHaveLength(29);
  });
});

describe('layoutWeekBars', () => {
  test('整周项目跨连续三周保持分段与方角语义', () => {
    const projects = [project('long', '2026-11-01', '2026-11-30')];
    const first = layoutWeekBars(projects, '2026-11-09', today).bars[0];
    const middle = layoutWeekBars(projects, '2026-11-16', today).bars[0];
    const third = layoutWeekBars(projects, '2026-11-23', today).bars[0];
    const last = layoutWeekBars(projects, '2026-11-30', today).bars[0];
    expect(first).toMatchObject({ startCol: 0, endCol: 6, clippedStart: true, clippedEnd: true, spanDays: 7 });
    expect(middle).toMatchObject({ startCol: 0, endCol: 6, clippedStart: true, clippedEnd: true, spanDays: 7 });
    expect(third).toMatchObject({ startCol: 0, endCol: 6, clippedStart: true, clippedEnd: true, spanDays: 7 });
    expect(last).toMatchObject({ startCol: 0, endCol: 0, clippedStart: true, clippedEnd: false, spanDays: 1 });
    expect(layoutWeekBars(projects, '2026-10-26', today).bars[0]).toMatchObject({ startCol: 6, endCol: 6, clippedStart: false, clippedEnd: true });
  });

  test('同日开始结束是单日条且包含结束日', () => {
    const bar = layoutWeekBars([project('single', '2026-11-18', '2026-11-18')], '2026-11-16', today).bars[0];
    expect(bar).toMatchObject({ startCol: 2, endCol: 2, clippedStart: false, clippedEnd: false, spanDays: 1 });
  });

  test('周内开始、周内结束的列号和跨度正确', () => {
    const bar = layoutWeekBars([project('inside', '2026-11-17T08:00:00.000Z', '2026-11-20T08:00:00.000Z')], '2026-11-16', today).bars[0];
    expect(bar).toMatchObject({ startCol: 1, endCol: 4, clippedStart: false, clippedEnd: false, spanDays: 4 });
  });

  test('startsAt=null 不产生 bar', () => {
    expect(layoutWeekBars([project('unset', null, null)], '2026-11-16', today).bars).toEqual([]);
  });

  test('endsAt=null 画到今天且之后周不出现', () => {
    const projects = [project('open', '2026-11-10', null)];
    const current = layoutWeekBars(projects, '2026-11-16', today).bars[0];
    expect(current).toMatchObject({ startCol: 0, endCol: 0, clippedStart: true, clippedEnd: false, openEnded: true, spanDays: 1 });
    expect(layoutWeekBars(projects, '2026-11-23', today).bars).toEqual([]);
  });

  test('四个完全重叠项目只显示三道并隐藏一个，相邻区间共用一道', () => {
    const overlapping = ['a', 'b', 'c', 'd'].map(id => project(id, '2026-11-16', '2026-11-20'));
    const layout = layoutWeekBars(overlapping, '2026-11-16', today);
    expect(layout.bars.map(bar => bar.lane)).toEqual([0, 1, 2]);
    expect(layout.hidden).toHaveLength(1);
    expect(layout.hidden[0].id).toBe('d');

    const adjacent = layoutWeekBars([
      project('later', '2026-11-18', '2026-11-19'),
      project('earlier', '2026-11-16', '2026-11-17'),
    ], '2026-11-16', today);
    expect(adjacent.bars.map(bar => bar.lane)).toEqual([0, 0]);
    expect(adjacent.hidden).toEqual([]);
  });

  test('结束早于开始沿用防御性告警并跳过', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(layoutWeekBars([project('invalid', '2026-11-18', '2026-11-17')], '2026-11-16', today).bars).toEqual([]);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});

describe('monthLabel/colorIndexOf', () => {
  test('月份标题按语言输出', () => {
    expect(monthLabel(2026, 11, 'zh')).toBe('2026年11月');
    expect(monthLabel(2026, 11, 'en')).toBe('November 2026');
  });

  test('项目色只依赖 id、固定期望且落在 0..5', () => {
    expect(colorIndexOf('a')).toBe(1);
    expect(colorIndexOf('b')).toBe(2);
    expect(colorIndexOf('f')).toBe(0);
    expect(colorIndexOf('project-a')).toBe(1);
    expect(colorIndexOf('project-a')).toBe(colorIndexOf('project-a'));
    for (const id of ['', 'alpha', 'beta', 'gamma', '项目一']) {
      expect(colorIndexOf(id)).toBeGreaterThanOrEqual(0);
      expect(colorIndexOf(id)).toBeLessThan(6);
    }
  });
});
