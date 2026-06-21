import type { ReactNode } from 'react';

/**
 * Field – shared label wrapper used in PmCreatePanel and KbCloseoutForm.
 * Renders a <label class="kb-field"> with a <span> for the label text followed
 * by the child control(s).
 */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  // 可选修饰类（如 kb-field--narrow 收窄短内容控件）；并到基类 kb-field 上。
  className?: string;
}) {
  return (
    <label className={className ? `kb-field ${className}` : 'kb-field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}
