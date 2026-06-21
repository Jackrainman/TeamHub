import type { ReactNode } from 'react';

/**
 * FormGrid – 薄封装表单栅格（FORM-UNIFY B2）。
 *
 * 吐出与旧手写标记**逐字相同**的类：默认两列 `div.pm-form__grid`，`cols={3}` 追加
 * `pm-form__grid--3`（仅 Resources season/target/version 这类三连用），界面像素级不变。
 * 取代各处手写的 `div.pm-form__grid` 与一次性横排壳（archive-top-row / resources-version-row）。
 *
 * 全宽字段：给子项标 `className="span-all"`（→ `grid-column: 1 / -1`，见 styles.css），
 * **固定位置、禁条件渲染让字段跨行漂移**——条件字段应就地显隐而非进出栅格。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度，不提供「选成员打卡」语义。
 */
export function FormGrid({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  // 列数：默认两列；3 仅用于 season/target/version 三连。
  cols?: 2 | 3;
  // 可选追加类（罕用）；并到基类之后。
  className?: string;
}) {
  const base = cols === 3 ? 'pm-form__grid pm-form__grid--3' : 'pm-form__grid';
  return <div className={className ? `${base} ${className}` : base}>{children}</div>;
}
