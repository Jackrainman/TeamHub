import type { HTMLAttributes } from 'react';

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end' | 'between';
  wrap?: boolean;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Toolbar({ align = 'start', wrap = true, className, ...rest }: ToolbarProps): JSX.Element {
  const alignClass = align === 'start' ? '' : ` ui-toolbar--${align}`;
  const wrapClass = wrap ? '' : ' ui-toolbar--nowrap';
  return <div className={cls(`ui-toolbar${alignClass}${wrapClass}`, className)} {...rest} />;
}
