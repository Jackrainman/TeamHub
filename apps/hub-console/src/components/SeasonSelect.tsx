import { useId, useState } from 'react';
import { useI18n } from '../i18n';

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

// 共享赛季选择：下拉 ±2 年自动猜 + 末项「其它/手填」；选「其它」露 input 收历史赛季
// （覆盖老车，无需问用户）。受控：value=赛季后两位字符串；onChange(纯字符串)。
// 父层只持有一个 season 字符串 state，无需自管 isOther。
// 「其它」显隐：纯派生 isOther（value 不在 options）会漏掉「刚选其它但 value 还空」的瞬间，
// 故组件内自管 otherMode：选 __other__ 时 setOtherMode(true)+onChange('')，露条件=otherMode||isOther。
export function SeasonSelect({
  now,
  value,
  onChange,
}: {
  now: Date;
  value: string;
  onChange: (season: string) => void;
}) {
  const { t } = useI18n();
  const opts = seasonOptions(now);
  const isOther = value !== '' && !opts.includes(value);
  const [otherMode, setOtherMode] = useState(isOther);
  const showInput = otherMode || isOther;
  const inputId = useId();
  return (
    <div className="season-select">
      <select
        value={showInput ? '__other__' : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__other__') {
            // 选「其它」→ 先清空交给 input 收（input 出现且空值被父层 valid 校验拦住）。
            setOtherMode(true);
            onChange('');
          } else {
            setOtherMode(false);
            onChange(v);
          }
        }}
      >
        {opts.map((s) => (
          <option value={s} key={s}>
            {s}
          </option>
        ))}
        <option value="__other__">{t('season.other')}</option>
      </select>
      {showInput ? (
        <input
          id={inputId}
          className="season-select__other-input"
          value={value}
          placeholder={t('season.otherHint')}
          aria-label={t('season.other')}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      ) : null}
    </div>
  );
}
