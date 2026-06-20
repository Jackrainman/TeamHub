// 排班日期工具（A1）。windowLabel 取真实日期串 'YYYY-MM-DD'，UI 显示相对名（今天/明天/后天）+ 月日。
// 纯函数；浏览器侧用 new Date()（App 代码可用 Date）。本地时区，不带时分秒。

import type { TranslationKey } from '../../i18n';

/** 把 Date 格式化成本地时区的 'YYYY-MM-DD'（不走 toISOString 以免 UTC 偏移跨日）。 */
export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'M/D'（如 6/20），用于段内副标题。 */
export function toMd(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function isoToday(now: Date = new Date()): string {
  return toIso(now);
}

export function isoTomorrow(now: Date = new Date()): string {
  return toIso(addDays(now, 1));
}

export function isoDayAfter(now: Date = new Date()): string {
  return toIso(addDays(now, 2));
}

/**
 * 给 'YYYY-MM-DD' 返回前一天的 'YYYY-MM-DD'（本地时区，用于「沿用上一天计划」）。
 * 非法日期串原样返回（防御：UI windowLabel 恒为日期，但历史 '今晚' 等自由文本不应崩）。
 */
export function isoPrevDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(addDays(base, -1));
}

export interface DateSegment {
  iso: string; // 'YYYY-MM-DD'，windowLabel 值
  labelKey: TranslationKey; // i18n 相对名键（今天/明天/后天）
  md: string; // 'M/D'
}

/** 今天/明天/后天三段（排班向前看，不含昨天）。 */
export function relativeSegments(now: Date = new Date()): DateSegment[] {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [
    { iso: toIso(base), labelKey: 'schedule.date.today', md: toMd(base) },
    {
      iso: toIso(addDays(base, 1)),
      labelKey: 'schedule.date.tomorrow',
      md: toMd(addDays(base, 1)),
    },
    {
      iso: toIso(addDays(base, 2)),
      labelKey: 'schedule.date.dayAfter',
      md: toMd(addDays(base, 2)),
    },
  ];
}
