import type { ReactNode } from 'react';

/**
 * Field – shared label wrapper used across PM / KB / Inv / Resources / Archive forms.
 * Renders a `<label class="kb-field">` with a `<span>` for the label text followed
 * by the child control(s).
 *
 * 向后兼容扩展（FORM-UNIFY B1）：
 * - `hint?`   字段级辅助说明 → `span.kb-field__hint`（吸收散落的内联 hint，去 title/hint 双写）。
 * - `error?`  字段级内联错误 → `p.form-hint.form-hint--warn`（沿用 PM 自环校验模式）。
 * - `as?`     外壳元素：'label'（默认，文本走 `<span>`）/ 'div'（复合控件 / checkbox 行）/
 *             'fieldset'（真分组，label 走 `<legend>`）。
 *
 * 不传新 props 时行为与旧版逐字一致（仅 `label`/`children`/`className`）：界面像素级不变。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度，不提供「选成员打卡」语义。
 */
export function Field({
  label,
  children,
  className,
  hint,
  error,
  as = 'label',
}: {
  label: string;
  children: ReactNode;
  // 可选修饰类（如 kb-field--narrow 收窄短内容控件）；并到基类 kb-field 上。
  className?: string;
  // 字段级辅助说明（→ kb-field__hint）。
  hint?: ReactNode;
  // 字段级内联错误（→ form-hint--warn）。已翻译好的字符串 / 节点。
  error?: ReactNode;
  // 外壳元素：复合控件 / checkbox 行用 'div'、真分组用 'fieldset'+legend。
  as?: 'label' | 'div' | 'fieldset';
}) {
  const classes = className ? `kb-field ${className}` : 'kb-field';
  const labelNode = as === 'fieldset' ? <legend>{label}</legend> : <span>{label}</span>;
  const body = (
    <>
      {labelNode}
      {children}
      {hint != null ? <span className="kb-field__hint">{hint}</span> : null}
      {error != null ? <p className="form-hint form-hint--warn">{error}</p> : null}
    </>
  );

  if (as === 'div') {
    return <div className={classes}>{body}</div>;
  }
  if (as === 'fieldset') {
    return <fieldset className={classes}>{body}</fieldset>;
  }
  return <label className={classes}>{body}</label>;
}
