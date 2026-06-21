import type { ReactNode } from 'react';

/**
 * SubmitButton – 统一的 `kb-submit` 提交按钮（`type="submit"`，消除各处 `type=button onClick` 提交歧异）。
 *
 * pending 时切到 `submittingLabel`，并与 `disabled` 一起禁用按钮。可选 `icon`（如归档 / 检索图标）
 * 渲染在文案前，与旧内联写法（图标 + 文案同一 button）逐字一致。
 *
 * `label` / `submittingLabel` 必须是**调用点已翻译好的字符串**，本组件不持有 i18n key。
 * 吐出与旧内联标记相同的类 `kb-submit`，界面像素级不变。
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
    <button className="kb-submit" type="submit" disabled={disabled || submitting}>
      {icon}
      {submitting ? submittingLabel : label}
    </button>
  );
}
