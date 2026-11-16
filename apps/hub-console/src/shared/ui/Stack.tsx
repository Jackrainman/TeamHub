import type { HTMLAttributes } from 'react';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'column' | 'row';
  gap?: 1 | 2 | 3 | 4 | 5;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Stack({
  direction = 'column', gap = 3, align = 'stretch', justify = 'start', className, ...rest
}: StackProps): JSX.Element {
  const directionClass = direction === 'row' ? ' ui-stack--row' : '';
  const classes = `ui-stack${directionClass} ui-stack--gap-${gap} ui-stack--align-${align} ui-stack--justify-${justify}`;
  return <div className={cls(classes, className)} {...rest} />;
}
