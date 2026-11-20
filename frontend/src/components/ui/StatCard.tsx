import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext: string;
  subtextAction?: () => void;
  subtextColor?: string;
  valueColor?: string;
  titleColor?: string;
  borderColor?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  subtextAction,
  subtextColor = '#5F6977',
  valueColor = '#273244',
  titleColor = '#5F6977',
  borderColor = '#D8CEBE',
  icon,
  iconBg = '#FAF8F4',
  className,
}) => {
  const isInteractive = typeof subtextAction === 'function';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      subtextAction();
    }
  };

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      onClick={subtextAction}
      className={cn(
        'kpi-card-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className
      )}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: `1px solid ${borderColor}`,
        padding: '20px 22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(24, 26, 23, 0.04)',
        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
        cursor: isInteractive ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: titleColor,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: '30px',
            fontWeight: 800,
            lineHeight: 1.15,
            color: valueColor,
            fontFeatureSettings: '"tnum"',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: subtextColor,
            marginTop: '2px',
          }}
        >
          {subtext}
        </span>
      </div>

      {icon && (
        <div
          aria-hidden="true"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
    </div>
  );
};
