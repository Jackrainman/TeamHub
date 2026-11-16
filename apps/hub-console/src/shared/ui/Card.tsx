import { createElement } from 'react';
import type { HTMLAttributes } from 'react';

export type CardVariant = 'default' | 'muted' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: 'div' | 'section' | 'article';
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Card({ variant = 'default', padding = 'none', as = 'div', className, ...rest }: CardProps): JSX.Element {
  const variantClass = variant === 'muted' ? ' ui-card--muted' : variant === 'interactive' ? ' card--interactive' : '';
  const paddingClass = padding === 'none' ? '' : ` ui-card--pad-${padding}`;
  return createElement(as, { ...rest, className: cls(`card${variantClass}${paddingClass}`, className) });
}
