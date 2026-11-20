'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export type BadgeVariant =
  | 'transit'
  | 'pending'
  | 'success'
  | 'danger'
  | 'info'
  | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  hasDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  hasDot = false,
  className,
}) => {
  const lang = useLanguage() as { translateStatus?: (s?: string | null) => string } | null;
  const displayLabel = lang?.translateStatus ? lang.translateStatus(label) : label;

  const getVariantClasses = (): { wrapper: string; dot: string } => {
    switch (variant) {
      case 'transit':
        return {
          wrapper: 'bg-primary-subtle text-primary border border-primary/30',
          dot: 'bg-primary',
        };
      case 'success':
        return {
          wrapper: 'bg-success-bg text-success border border-success/25',
          dot: 'bg-success',
        };
      case 'pending':
        return {
          wrapper: 'bg-warning-bg text-warning border border-warning/25',
          dot: 'bg-warning',
        };
      case 'danger':
        return {
          wrapper: 'bg-danger-bg text-danger border border-danger/25',
          dot: 'bg-danger',
        };
      case 'info':
        return {
          wrapper: 'bg-[#F0EEE8] text-[#273244] border border-[#D8CEBE]',
          dot: 'bg-[#A67C2E]',
        };
      case 'neutral':
      default:
        return {
          wrapper: 'bg-surface-muted text-text-secondary border border-border',
          dot: 'bg-text-muted',
        };
    }
  };

  const { wrapper, dot } = getVariantClasses();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap max-w-full truncate',
        wrapper,
        className
      )}
    >
      {hasDot && <span aria-hidden="true" className={cn('pulsing-dot w-2 h-2 rounded-full shrink-0', dot)} />}
      <span className="truncate">{displayLabel}</span>
    </span>
  );
};
