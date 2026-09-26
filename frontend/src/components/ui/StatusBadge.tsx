import React from 'react';

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
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  hasDot = false,
}) => {
  const getBadgeStyle = (): { bg: string; color: string; dotColor: string } => {
    switch (variant) {
      case 'transit':
        return { bg: '#fff7ed', color: '#c2410c', dotColor: '#ea580c' }; // amber/orange
      case 'pending':
        return { bg: '#fef3c7', color: '#b45309', dotColor: '#f59e0b' }; // yellow
      case 'success':
        return { bg: '#dcfce7', color: '#15803d', dotColor: '#16a34a' }; // green
      case 'danger':
        return { bg: '#fee2e2', color: '#b91c1c', dotColor: '#ef4444' }; // red
      case 'info':
        return { bg: '#e0f2fe', color: '#0369a1', dotColor: '#0284c7' }; // light blue
      case 'neutral':
      default:
        return { bg: '#f1f5f9', color: '#475569', dotColor: '#64748b' };
    }
  };

  const { bg, color, dotColor } = getBadgeStyle();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: bg,
        color: color,
        whiteSpace: 'nowrap',
      }}
    >
      {hasDot && (
        <span
          className="pulsing-dot"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {label}
    </span>
  );
};
