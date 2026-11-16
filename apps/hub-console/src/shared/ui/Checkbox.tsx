import type { InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Checkbox({ label, hint, className, disabled, ...rest }: CheckboxProps): JSX.Element {
  return (
    <label className={cls('ui-check', className)} data-disabled={disabled || undefined}>
      <input type="checkbox" className="ui-check__input" disabled={disabled} {...rest} />
      <span className="ui-check__label">{label}</span>
      {hint ? <span className="ui-check__hint">{hint}</span> : null}
    </label>
  );
}
