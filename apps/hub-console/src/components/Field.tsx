import type { ReactNode } from 'react';

/**
 * Field – shared label wrapper used in PmCreatePanel and KbCloseoutForm.
 * Renders a <label class="kb-field"> with a <span> for the label text followed
 * by the child control(s).
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="kb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
