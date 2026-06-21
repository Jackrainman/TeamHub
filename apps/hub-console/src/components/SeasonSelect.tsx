import { useI18n } from '../i18n';
import { Combobox } from './Combobox';

// guessSeason：纯 UI helper，猜当前赛季年份（后两位数字字符串，如 "25"）。
// 赛季切换惯例：赛季年份 = 日历年 - 1（赛季到次年前数月结束）。
// 截止月：若当前月份 <= 4（1~4月），视为"上个赛季年"仍在进行，用 (year-1) 的后两位；否则用 year 后两位。
export function guessSeason(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const seasonYear = month <= 4 ? year - 1 : year;
  return String(seasonYear).slice(-2);
}

// 从当前猜测赛季生成 ±2 年的选项列表（字符串后两位）。
export function seasonOptions(now: Date): string[] {
  const base = guessSeason(now);
  const baseYear = 2000 + parseInt(base, 10);
  return [-2, -1, 0, 1, 2].map((offset) => String(baseYear + offset).slice(-2));
}

// 共享赛季选择：组合框（候选 ±2 年 + 直接手填）。受控：value=赛季后两位字符串；onChange(去空白字符串)。
// 改自旧「select + 其它(手填)」二段式——用户反馈"下拉且窄、需手填"：datalist 让手填即输即得、候选仍在，
// 覆盖老车赛季（如 21/20）无需先点"其它"。父层只持有一个 season 字符串 state。
// ariaLabelKey：可选，覆盖默认 aria-label 用的翻译 key（默认 'archive.form.season'，不传则行为不变）。
export function SeasonSelect({
  now,
  value,
  onChange,
  ariaLabelKey = 'archive.form.season',
}: {
  now: Date;
  value: string;
  onChange: (season: string) => void;
  /** 覆盖 aria-label 用的翻译 key；默认 'archive.form.season'（不传=不破坏现有调用）。 */
  ariaLabelKey?: string;
}) {
  const { t } = useI18n();
  return (
    <Combobox
      value={value}
      onChange={(v) => onChange(v.trim())}
      options={seasonOptions(now)}
      placeholder={t('season.otherHint')}
      ariaLabel={t(ariaLabelKey as Parameters<typeof t>[0])}
    />
  );
}
