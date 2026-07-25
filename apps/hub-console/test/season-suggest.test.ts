import { describe, expect, test } from 'vitest';
import { seasonRangeLabel, suggestSeason } from '../src/utils';
import { translations } from '../src/i18n/translations';

// SEASON-SUGGEST（打磨轮刀⑨ / onboarding-init-wizard §2 决策4）：suggestSeason 纯函数——
// 「2026 赛季」= 2026 年比赛 = 2025.9.1–2026.7.31；8–12 月滚到次年赛季。刻意 UTC 取年月，
// 任何运行/测试时区下结果确定。测逻辑不测 DOM：12 个月全覆盖 + 7/8 月交界 + 跨年瞬间。
describe('suggestSeason 赛季日期派生（纯函数）', () => {
  const at = (iso: string) => new Date(iso);

  test('1–7 月 → 当年赛季（去年 9.1–当年 7.31）', () => {
    for (const month of [1, 2, 3, 4, 5, 6, 7]) {
      const mm = String(month).padStart(2, '0');
      expect(suggestSeason(at(`2026-${mm}-15T12:00:00.000Z`))).toEqual({
        name: '2026赛季',
        startsAt: '2025-09-01T00:00:00.000Z',
        endsAt: '2026-07-31T23:59:59.999Z',
      });
    }
  });

  test('8–12 月 → 次年赛季（当年 9.1–次年 7.31）', () => {
    for (const month of [8, 9, 10, 11, 12]) {
      const mm = String(month).padStart(2, '0');
      expect(suggestSeason(at(`2026-${mm}-15T12:00:00.000Z`))).toEqual({
        name: '2027赛季',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2027-07-31T23:59:59.999Z',
      });
    }
  });

  test('7/8 月交界：7.31 最后一毫秒仍当年赛季，8.1 第一毫秒滚次年', () => {
    expect(suggestSeason(at('2026-07-31T23:59:59.999Z')).name).toBe('2026赛季');
    expect(suggestSeason(at('2026-08-01T00:00:00.000Z')).name).toBe('2027赛季');
  });

  test('跨年瞬间：12.31 最后一毫秒次年赛季，1.1 第一毫秒回到当年赛季', () => {
    expect(suggestSeason(at('2026-12-31T23:59:59.999Z'))).toEqual({
      name: '2027赛季',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
    expect(suggestSeason(at('2027-01-01T00:00:00.000Z'))).toEqual({
      name: '2027赛季',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2027-07-31T23:59:59.999Z',
    });
  });

  test('1 月赛季区间跨年正确（2026 年 1 月 → 2025.9.1 开赛）', () => {
    const s = suggestSeason(at('2026-01-15T00:00:00.000Z'));
    expect(s.startsAt.startsWith('2025-09-01')).toBe(true);
    expect(s.endsAt.startsWith('2026-07-31')).toBe(true);
  });

  test('seasonRangeLabel：区间标签「2026.9–2027.7」（i18n {range} 参数唯一来源）', () => {
    expect(
      seasonRangeLabel({
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2027-07-31T23:59:59.999Z',
      }),
    ).toBe('2026.9–2027.7');
    expect(seasonRangeLabel(suggestSeason(at('2026-03-01T00:00:00.000Z')))).toBe(
      '2025.9–2026.7',
    );
  });

  test('建议卡/一键创建文案键 zh/en 双语齐全', () => {
    for (const key of [
      'settings.seasons.suggest',
      'settings.seasons.suggestApply',
      'overview.baseline.noSeasonSuggest',
      'overview.baseline.noSeasonCreate',
      'overview.baseline.noSeasonCreating',
      'overview.baseline.noSeasonError',
    ] as const) {
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });
});
