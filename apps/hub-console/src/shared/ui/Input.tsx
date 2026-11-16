import type { InputHTMLAttributes } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  invalid?: boolean;
  controlSize?: 'md' | 'sm';
  className?: string;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Input({ invalid, controlSize = 'md', className, ...rest }: InputProps): JSX.Element {
  const sizeClass = controlSize === 'sm' ? ' ui-control--sm' : '';
  return <input className={cls(`ui-input ui-control${sizeClass}`, className)} aria-invalid={invalid || undefined} {...rest} />;
}
