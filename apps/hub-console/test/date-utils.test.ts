import { describe, expect, test } from 'vitest';
import {
  toIso,
  toMd,
  isoToday,
  isoTomorrow,
  isoDayAfter,
  isoPrevDay,
  relativeSegments,
} from '../src/features/schedule/date-utils';

// 排班日期工具（A1）：windowLabel 取真实日期串、本地时区，承重接力 carry-over（isoPrevDay 是 I0
// 关键路径之一）与「今天/明天/后天」三段渲染。本仓「测逻辑不测 DOM」；全程传显式 Date，确定性不依赖系统当天。
describe('排班日期工具 date-utils（纯函数，显式 Date）', () => {
  test('toIso：本地时区 YYYY-MM-DD（刻意不走 toISOString 避 UTC 跨日偏移）', () => {
    // 月份 0-based：5 = 六月。
    expect(toIso(new Date(2026, 5, 21))).toBe('2026-06-21');
    expect(toIso(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('toMd：M/D（不补零）', () => {
    expect(toMd(new Date(2026, 5, 21))).toBe('6/21');
    expect(toMd(new Date(2026, 0, 5))).toBe('1/5');
  });

  test('isoToday / isoTomorrow / isoDayAfter：相对给定 now 的 +0 / +1 / +2 天', () => {
    const now = new Date(2026, 5, 21);
    expect(isoToday(now)).toBe('2026-06-21');
    expect(isoTomorrow(now)).toBe('2026-06-22');
    expect(isoDayAfter(now)).toBe('2026-06-23');
  });

  describe('isoPrevDay：日期串前一天（「沿用上一天计划」carry-over 承重）', () => {
    test('月界（非闰年）：2026-03-01 → 2026-02-28', () => {
      expect(isoPrevDay('2026-03-01')).toBe('2026-02-28');
    });
    test('闰年硬化：2024-03-01 → 2024-02-29', () => {
      expect(isoPrevDay('2024-03-01')).toBe('2024-02-29');
    });
    test('年界：2026-01-01 → 2025-12-31', () => {
      expect(isoPrevDay('2026-01-01')).toBe('2025-12-31');
    });
    test('普通日：2026-06-21 → 2026-06-20', () => {
      expect(isoPrevDay('2026-06-21')).toBe('2026-06-20');
    });
    test('非日期格式串原样返回、不抛（历史自由文本 windowLabel「今晚」/ 空串防御 L42）', () => {
      expect(isoPrevDay('今晚')).toBe('今晚');
      expect(isoPrevDay('')).toBe('');
    });
  });

  test('relativeSegments：今天/明天/后天三段（iso + i18n 相对名键 + M/D）', () => {
    const segs = relativeSegments(new Date(2026, 5, 21));
    expect(segs.map((s) => s.iso)).toEqual([
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
    ]);
    expect(segs.map((s) => s.labelKey)).toEqual([
      'schedule.date.today',
      'schedule.date.tomorrow',
      'schedule.date.dayAfter',
    ]);
    expect(segs.map((s) => s.md)).toEqual(['6/21', '6/22', '6/23']);
  });
});
