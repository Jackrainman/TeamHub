import type { ReactNode } from 'react';

export interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  as?: 'label' | 'div' | 'fieldset';
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

/** shared/ui 版本，P1 起为规范版本；components/Field.tsx 暂留。 */
export function Field({
  label,
  children,
  className,
  hint,
  error,
  required,
  as = 'label',
}: FieldProps): JSX.Element {
  const classes = cls('kb-field', className);
  const marker = required ? (
    <span className="kb-field__req" aria-hidden="true"> *</span>
  ) : null;
  const labelNode = as === 'fieldset' ? (
    <legend>{label}{marker}</legend>
  ) : (
    <span>{label}{marker}</span>
  );
  const body = (
    <>
      {labelNode}
      {children}
      {hint != null ? <span className="kb-field__hint">{hint}</span> : null}
      {error != null ? <p className="form-hint form-hint--warn">{error}</p> : null}
    </>
  );

  if (as === 'div') return <div className={classes}>{body}</div>;
  if (as === 'fieldset') return <fieldset className={classes}>{body}</fieldset>;
  return <label className={classes}>{body}</label>;
}
