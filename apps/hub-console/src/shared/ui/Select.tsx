import type { SelectHTMLAttributes } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  invalid?: boolean;
  className?: string;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Select({ invalid, className, children, ...rest }: SelectProps): JSX.Element {
  return <select className={cls('ui-select ui-control', className)} aria-invalid={invalid || undefined} {...rest}>{children}</select>;
}
