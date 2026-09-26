import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  badge?: number | string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  badge,
  className = '',
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--primary)',
          color: '#ffffff',
          border: '1px solid var(--primary)',
          boxShadow: '0 2px 8px var(--primary-glow)',
        };
      case 'secondary':
        return {
          backgroundColor: '#ffffff',
          color: 'var(--text-body)',
          border: '1px solid #e2e8f0',
          boxShadow: 'var(--shadow-sm)',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-body)',
          border: '1px solid #cbd5e1',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-body)',
          border: 'none',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--status-danger)',
          color: '#ffffff',
          border: '1px solid var(--status-danger)',
        };
      default:
        return {};
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '6px 12px', fontSize: '13px', borderRadius: '8px' };
      case 'lg':
        return { padding: '12px 22px', fontSize: '15px', borderRadius: '10px' };
      case 'md':
      default:
        return { padding: '9px 16px', fontSize: '14px', borderRadius: '9px' };
    }
  };

  return (
    <button
      {...props}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 600,
        position: 'relative',
        transition: 'all 0.18s ease-in-out',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
    >
      {icon && iconPosition === 'left' && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === 'right' && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {badge !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 700,
            borderRadius: '999px',
            minWidth: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid #ffffff',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};
