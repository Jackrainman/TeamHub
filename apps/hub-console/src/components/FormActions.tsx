import type { ReactNode } from 'react';
import { SubmitButton } from './SubmitButton';
import { FormBanner } from './FormBanner';

/**
 * FormActions – 统一表单 footer（由 PmCreatePanel 的本地 `FormFooter` 原地提升为共享原语）。
 *
 * 渲染 `div.pm-form__footer`，内含一个 {@link SubmitButton} + 成功 / 失败两条 {@link FormBanner}，
 * 与各表单旧 footer 的 DOM / className 逐字一致（按钮 → 成功条 → 失败条顺序），界面像素级不变。
 *
 * `submitLabel` / `submittingLabel` / `error` / `success` 都接**调用点已翻译好的字符串**：
 * 调用点用自己已有的 i18n key（+ errorDetail() 组合错误明细）拼好再传入。本原语绝不持有任何 i18n key、
 * 绝不硬编码 pm.create.* 等文案。`error` / `success` 为空（null/undefined/空串）时对应条不渲染。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度（owner/confirmer 仅是录入者凭证、非考勤）。
 */
export function FormActions({
  submitLabel,
  submittingLabel,
  submitting,
  disabled,
  error,
  success,
  icon,
}: {
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  disabled?: boolean;
  /** 已翻译好的失败文案（调用点自带 key + errorDetail() 组合）；空则不渲染失败条。 */
  error?: string | null;
  /** 已翻译好的成功文案；空则不渲染成功条。 */
  success?: string | null;
  icon?: ReactNode;
}) {
  return (
    <div className="pm-form__footer">
      <SubmitButton
        label={submitLabel}
        submittingLabel={submittingLabel}
        submitting={submitting}
        disabled={disabled}
        icon={icon}
      />
      {success ? <FormBanner kind="ok" message={success} /> : null}
      {error ? <FormBanner kind="err" message={error} /> : null}
    </div>
  );
}
