// 日期纯函数（跨 checklist / overview 两 feature 共用，SHARED-PREVIEW 自 features/checklist/
// checklist-utils.ts 上提至 shared/lib，消 overview→checklist 跨 feature import）。零副作用、配单测。

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 自选到期日欠条的过期天数（告警区「过期时长」文案用）：`now - dueAt` 向下取整到天，最小 0。
 * 未过期（dueAt 在未来）返回 0——调用方只对红档（已过期）欠条调用，负值无意义故夹到 0。
 */
export function overdueDays(dueAtIso: string, now: Date): number {
  const diff = now.getTime() - new Date(dueAtIso).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}
