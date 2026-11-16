import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
}

const cls = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Button({
  variant = 'secondary', size = 'md', loading = false,
  icon, children, className, type = 'button', disabled, ...rest
}: ButtonProps): JSX.Element {
  const sizeClass = size === 'sm' ? ' btn--sm' : '';
  return (
    <button
      type={type}
      className={cls(`btn btn--${variant}${sizeClass} ui-btn`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...rest}
    >
      {icon}
      {loading ? <span className="ui-btn__spinner" aria-hidden="true" /> : null}
      <span className={loading ? 'ui-btn__label ui-btn__label--loading' : 'ui-btn__label'}>{children}</span>
    </button>
  );
}
