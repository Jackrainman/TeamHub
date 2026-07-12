import type { ReactNode } from 'react';

/**
 * SubmitButton – 统一的表单提交按钮（`type="submit"`，消除各处 `type=button onClick` 提交歧异）。
 *
 * pending 时切到 `submittingLabel`，并与 `disabled` 一起禁用按钮。可选 `icon`（如归档 / 检索图标）
 * 渲染在文案前，与旧内联写法（图标 + 文案同一 button）逐字一致。
 *
 * `label` / `submittingLabel` 必须是**调用点已翻译好的字符串**，本组件不持有 i18n key。
 * 皮肤 = `.btn--primary`（DESIGN-LANG B3：原 `kb-submit` 已归并进 .btn 体系，见
 * design-language.md §2——表单提交是 primary 的法定场景，一屏至多一个）。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度。
 */
export function SubmitButton({
  label,
  submittingLabel,
  submitting,
  disabled,
  icon,
}: {
  label: string;
  submittingLabel: string;
  submitting: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button className="btn btn--primary" type="submit" disabled={disabled || submitting}>
      {icon}
      {submitting ? submittingLabel : label}
    </button>
  );
}
