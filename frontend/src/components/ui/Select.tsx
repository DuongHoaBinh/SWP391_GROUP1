import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, children, disabled, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const msgId = error || helperText ? `${selectId}-msg` : undefined;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold text-text-primary uppercase tracking-wider"
          >
            {label}
            {props.required && (
              <span className="text-danger ml-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={msgId}
            className={cn(
              'w-full px-3.5 py-2.5 text-sm rounded-xl bg-surface border border-border text-text-primary appearance-none cursor-pointer',
              'pr-10 transition-all duration-150',
              'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
              'disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed',
              error && 'border-danger focus:border-danger focus:ring-danger/20',
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3.5 pointer-events-none text-text-muted flex items-center" aria-hidden="true">
            <ChevronDown size={16} />
          </div>
        </div>
        {error ? (
          <span id={msgId} role="alert" className="text-xs text-danger font-medium">
            {error}
          </span>
        ) : helperText ? (
          <span id={msgId} className="text-xs text-text-muted">
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
