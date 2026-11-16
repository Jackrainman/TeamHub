import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  invalid?: boolean;
  controlSize?: 'md' | 'sm';
  className?: string;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Textarea({ invalid, controlSize = 'md', className, ...rest }: TextareaProps): JSX.Element {
  const sizeClass = controlSize === 'sm' ? ' ui-control--sm' : '';
  return <textarea className={cls(`ui-textarea ui-control${sizeClass}`, className)} aria-invalid={invalid || undefined} {...rest} />;
}
