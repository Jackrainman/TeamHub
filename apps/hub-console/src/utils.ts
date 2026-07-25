/** Shared utility functions for hub-console. */
import type { TranslationKey } from './i18n';

/**
 * Split a comma-separated string into a trimmed, non-empty string array.
 * Used for tag / collaborator / skill input fields.
 */
export function parseList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract a human-readable message from an unknown thrown value.
 */
export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 赛季建议（SEASON-SUGGEST 刀⑨ / onboarding-init-wizard §2 决策4）：赛季语义 =「2026 赛季」指 2026 年
 * 比赛，时间区间 2025.9.1–2026.7.31；7 月过后滚到下一届。8–12 月 → 次年赛季（当年 9.1–次年 7.31）；
 * 1–7 月 → 当年赛季（去年 9.1–当年 7.31）。
 * 刻意用 UTC（getUTCFullYear/getUTCMonth）而非本地时区：产出是纯日期语义（ISO 钉 Z 后缀），
 * 用 UTC 保证任何运行环境/测试时区下结果确定。刀⑬ 初始化向导赛季步复用本函数。
 */
export function suggestSeason(now: Date): {
  name: string;
  startsAt: string;
  endsAt: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based：0=1月 … 6=7月，7=8月 … 11=12月
  if (month >= 7) {
    // 8–12 月：新赛季 9 月开赛，打到次年 7 月。
    return {
      name: `${year + 1}赛季`,
      startsAt: `${year}-09-01T00:00:00.000Z`,
      endsAt: `${year + 1}-07-31T23:59:59.999Z`,
    };
  }
  // 1–7 月：当前赛季去年 9 月已开赛，今年 7 月收官。
  return {
    name: `${year}赛季`,
    startsAt: `${year - 1}-09-01T00:00:00.000Z`,
    endsAt: `${year}-07-31T23:59:59.999Z`,
  };
}

export function seasonForYear(year: number): { name: string; startsAt: string; endsAt: string } {
  return {
    name: `${year}赛季`,
    startsAt: `${year - 1}-09-01T00:00:00.000Z`,
    endsAt: `${year}-07-31T23:59:59.999Z`,
  };
}

export function seasonYearOptions(now: Date): { years: number[]; suggested: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const suggested = month >= 7 ? year + 1 : year;
  return { years: [suggested - 1, suggested, suggested + 1], suggested };
}

/**
 * suggestSeason 产物的展示用区间标签：「2026.9–2027.7」。纯解析 ISO 前 10 位（YYYY-MM-DD），
 * 不做时区换算（输入本就钉在 UTC 日期边界上）。i18n 的 {range} 参数统一走这里，zh/en 同形。
 */
export function seasonRangeLabel(season: { startsAt: string; endsAt: string }): string {
  const [sy, sm] = season.startsAt.slice(0, 7).split('-');
  const [ey, em] = season.endsAt.slice(0, 7).split('-');
  return `${sy}.${Number(sm)}–${ey}.${Number(em)}`;
}

/**
 * Return the CSS class string for a segmented-control button.
 * active=true  → 'seg__btn seg__btn--active'
 * active=false → 'seg__btn'
 */
export function segClass(active: boolean): string {
  return active ? 'seg__btn seg__btn--active' : 'seg__btn';
}

/**
 * Humanize a mutation/query error for a form banner.
 * 401 / unauthorized（写端点鉴权拒绝）走通用「请到设置页填写入令牌」文案（common.error401），
 * 其余走调用方传入的 fallbackKey（沿用各表单原有的「XX失败：{detail}」措辞，参数名固定 `detail`）。
 */
export function humanizeFormError(
  error: unknown,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  fallbackKey: TranslationKey,
): string {
  const detail = errorDetail(error);
  if (/401|unauthorized/i.test(detail)) return t('common.error401');
  return t(fallbackKey, { detail });
}
