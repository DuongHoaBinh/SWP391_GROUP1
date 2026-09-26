import React from 'react';

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
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  subtextAction,
  subtextColor = '#64748b',
  valueColor = 'var(--text-heading)',
  titleColor = '#64748b',
  borderColor = 'var(--border-card)',
  icon,
  iconBg = '#eff6ff',
}) => {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: `1px solid ${borderColor}`,
        padding: '20px 22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        boxShadow: 'var(--shadow-sm)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        cursor: subtextAction ? 'pointer' : 'default',
      }}
      onClick={subtextAction}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
            fontSize: '32px',
            fontWeight: 800,
            lineHeight: 1.1,
            color: valueColor,
            fontFeatureSettings: '"tnum"',
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
