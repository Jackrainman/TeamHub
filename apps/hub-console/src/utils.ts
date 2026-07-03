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
