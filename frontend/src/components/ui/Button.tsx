import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  badge?: number | string;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      icon,
      iconPosition = 'left',
      badge,
      loading = false,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const getVariantClasses = () => {
      switch (variant) {
        case 'primary':
          return 'bg-primary text-white border border-primary hover:bg-primary-hover active:bg-primary-active shadow-sm';
        case 'secondary':
          return 'bg-surface text-text-primary border border-border hover:bg-surface-muted hover:border-border-beige-hover shadow-sm';
        case 'outline':
          return 'bg-transparent text-text-primary border border-border hover:bg-surface-muted hover:border-border-beige-hover';
        case 'ghost':
          return 'bg-transparent text-text-primary border border-transparent hover:bg-surface-muted';
        case 'danger':
          return 'bg-danger text-white border border-danger hover:opacity-90 active:opacity-100 shadow-sm';
        default:
          return '';
      }
    };

    const getSizeClasses = () => {
      switch (size) {
        case 'sm':
          return 'px-3 py-1.5 text-[13px] rounded-lg';
        case 'lg':
          return 'px-5 py-3 text-[15px] rounded-xl';
        case 'md':
        default:
          return 'px-4 py-2 text-[14px] rounded-xl';
      }
    };

    const isDisabled = disabled || loading;
    const hasChildren =
      children !== undefined && children !== null && children !== false && children !== '';

    return (
      <button
        ref={ref}
        type={type}
        {...props}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold relative select-none cursor-pointer',
          'transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
          getVariantClasses(),
          getSizeClasses(),
          className
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" aria-hidden="true" />
        ) : (
          icon && iconPosition === 'left' && (
            <span className="flex items-center shrink-0" aria-hidden="true">
              {icon}
            </span>
          )
        )}
        {hasChildren && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span className="flex items-center shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-1.5 bg-danger text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border border-surface shadow-sm">
            {badge}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
