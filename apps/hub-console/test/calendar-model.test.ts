import { describe, expect, test, vi } from 'vitest';
import { STAGE_PIPELINE_STAGES } from '@teamhub/hub-contracts';
import {
  STAGE_LABEL_KEYS,
  addDays,
  bandGeometry,
  barGeometry,
  buildAxis,
  dateKeyOf,
  dayNumber,
  milestoneLeft,
  mondayOf,
  todayKey,
} from '../src/features/pm/calendar/model';

const today = '2026-11-16';
const season = { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2027-07-31T00:00:00.000Z' };

describe('todayKey（Asia/Shanghai）', () => {
  test('上海跨日边界', () => {
    expect(todayKey(new Date('2026-11-16T15:59:00Z'))).toBe('2026-11-16');
    expect(todayKey(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-17');
  });

  test('只依赖 instant，不依赖运行环境本地时区', () => {
    const instant = new Date('2028-02-28T16:00:00Z');
    expect(todayKey(instant)).toBe('2028-02-29');
    expect(todayKey(new Date(instant.getTime()))).toBe(todayKey(instant));
  });
});

describe('dateKeyOf', () => {
  test('合法 ISO 取日期串，非法输入返回 null', () => {
    expect(dateKeyOf('2026-11-16T23:00:00.000Z')).toBe('2026-11-16');
    expect(dateKeyOf('2028-02-29')).toBe('2028-02-29');
    for (const value of [null, undefined, '', '2026-1-1', '2026-02-30']) {
      expect(dateKeyOf(value)).toBeNull();
    }
  });
});

describe('dayNumber/addDays', () => {
  test('跨月、跨年与闰日连续', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(dayNumber(addDays(today, 1)) - dayNumber(today)).toBe(1);
  });
});

describe('mondayOf', () => {
  test('周一保持自身，周日回退六天，支持跨年周', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe("buildAxis('month')", () => {
  test('有效赛季使用完整月窗', () => {
    const axis = buildAxis('month', today, season);
    expect(axis.startKey).toBe('2026-09-01');
    expect(axis.endKeyExclusive).toBe('2027-08-01');
    expect(axis.days).toBe(334);
    expect(axis.ticks).toHaveLength(11);
    expect(axis.seasonTruncated).toBe(false);
  });

  test('跨年 tick 标记一月且 left 单调递增', () => {
    const axis = buildAxis('month', today, season);
    expect(axis.ticks.some(tick => tick.key === '2027-01-01' && tick.isYearStart)).toBe(true);
    expect(axis.ticks.every(tick => tick.left >= 0 && tick.left < 1)).toBe(true);
    expect(axis.ticks.every((tick, index) => index === 0 || tick.left > axis.ticks[index - 1].left)).toBe(true);
  });

  test('超 18 个月回退，缺赛季也回退十二个月', () => {
    const truncated = buildAxis('month', today, { startsAt: '2025-01-01T00:00:00Z', endsAt: '2027-12-31T00:00:00Z' });
    expect(truncated.startKey).toBe('2026-05-01');
    expect(truncated.endKeyExclusive).toBe('2027-05-01');
    expect(truncated.ticks).toHaveLength(12);
    expect(truncated.seasonTruncated).toBe(true);
    const fallback = buildAxis('month', today, null);
    expect(fallback.startKey).toBe('2026-05-01');
    expect(fallback.endKeyExclusive).toBe('2027-05-01');
    expect(fallback.todayLeft).not.toBeNull();
  });

  test('已结束赛季仍使用赛季窗，但今天线不画', () => {
    const axis = buildAxis('month', '2028-01-01', season);
    expect(axis.startKey).toBe('2026-09-01');
    expect(axis.todayLeft).toBeNull();
  });
});

describe("buildAxis('week')", () => {
  test('固定今天所在周一前 3 周起，共 8 周 56 天', () => {
    const axis = buildAxis('week', today, season);
    expect(axis.startKey).toBe('2026-10-26');
    expect(axis.endKeyExclusive).toBe('2026-12-21');
    expect(axis.days).toBe(56);
    expect(axis.ticks).toHaveLength(8);
    expect(axis.ticks.every(tick => mondayOf(tick.key) === tick.key)).toBe(true);
    expect(axis.todayLeft).toBe((21 + 0.5) / 56);
  });
});

describe('barGeometry', () => {
  const axis = buildAxis('month', today, season);

  test('无开始日期不画条', () => {
    expect(barGeometry({ startsAt: null, endsAt: null }, axis, today)).toBeNull();
  });

  test('无结束日期画到今天并标记 open-ended', () => {
    const geometry = barGeometry({ startsAt: '2026-11-01', endsAt: null }, axis, today)!;
    expect(geometry.endKey).toBe(today);
    expect(geometry.fullEndKey).toBe(today);
    expect(geometry.openEnded).toBe(true);
    expect(geometry.days).toBe(16);
  });

  test('单日条与结束日均包含在宽度内', () => {
    const one = barGeometry({ startsAt: '2026-10-01', endsAt: '2026-10-01' }, axis, today)!;
    expect(one.days).toBe(1);
    expect(one.width).toBe(1 / axis.days);
    const two = barGeometry({ startsAt: '2026-10-01', endsAt: '2026-10-02' }, axis, today)!;
    expect(two.days).toBe(2);
    expect(two.width).toBe(2 / axis.days);
  });

  test('左右与两端越界均正确裁剪', () => {
    const left = barGeometry({ startsAt: '2026-08-01', endsAt: '2026-09-10' }, axis, today)!;
    expect(left.left).toBe(0);
    expect(left.clippedStart).toBe(true);
    expect(left.days).toBe(10);
    const right = barGeometry({ startsAt: '2027-07-20', endsAt: '2027-08-20' }, axis, today)!;
    expect(right.clippedEnd).toBe(true);
    expect(right.endKey).toBe('2027-07-31');
    expect(right.left + right.width).toBe(1);
    const both = barGeometry({ startsAt: '2026-01-01', endsAt: '2028-01-01' }, axis, today)!;
    expect(both.left).toBe(0);
    expect(both.width).toBe(1);
  });

  test('整条在窗口外不画', () => {
    expect(barGeometry({ startsAt: '2026-01-01', endsAt: '2026-02-01' }, axis, today)).toBeNull();
    expect(barGeometry({ startsAt: '2028-01-01', endsAt: '2028-02-01' }, axis, today)).toBeNull();
  });

  test('结束早于开始仅防御性忽略并告警', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(barGeometry({ startsAt: '2026-10-02', endsAt: '2026-10-01' }, axis, today)).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});

describe('milestoneLeft/bandGeometry', () => {
  const axis = buildAxis('week', today, null);

  test('里程碑定位当天中点，窗口外返回 null', () => {
    expect(milestoneLeft('2026-10-26T00:00:00Z', axis)).toBe(0.5 / 56);
    expect(milestoneLeft('2027-01-01T00:00:00Z', axis)).toBeNull();
    expect(milestoneLeft('invalid', axis)).toBeNull();
  });

  test('背景带使用闭区间且完整覆盖窗口时铺满', () => {
    expect(bandGeometry({ startsAt: '2026-10-26', endsAt: '2026-10-27' }, axis)).toEqual({ left: 0, width: 2 / 56 });
    expect(bandGeometry({ startsAt: '2020-01-01', endsAt: '2030-01-01' }, axis)).toEqual({ left: 0, width: 1 });
  });
});

describe('阶段映射', () => {
  test('覆盖全部六阶段', () => {
    expect(Object.keys(STAGE_LABEL_KEYS).sort()).toEqual([...STAGE_PIPELINE_STAGES].sort());
  });
});
