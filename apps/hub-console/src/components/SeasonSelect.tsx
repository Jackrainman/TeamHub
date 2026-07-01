import { useI18n } from '../i18n';
import { Combobox } from './Combobox';
// guessSeason/seasonOptions 已移至 robotics 垂直包（HUB-MODULARIZATION 第6步）：赛季猜测规则
// （截止月<=4 视为上赛季延续）是机器人战队专属惯例，非通用组件应内嵌的词汇；本组件保持通用
// （只吃 value/onChange/候选项）。guessSeason re-export 维持既有 import 路径
// （ArchivePage/ResourcesPage 仍 `import { SeasonSelect, guessSeason } from '.../SeasonSelect'` 不改）；
// seasonOptions 只本文件内部用，正常 import（不 re-export，无外部消费点）。
import { guessSeason, seasonOptions } from '../verticals/robotics';
export { guessSeason };

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
