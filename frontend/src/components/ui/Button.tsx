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
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 shadow-[0_2px_8px_rgba(37,99,235,0.18)]';
      case 'secondary':
        return 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm';
      case 'outline':
        return 'bg-transparent text-slate-700 border border-slate-300 hover:bg-slate-50';
      case 'ghost':
        return 'bg-transparent text-slate-700 border-none hover:bg-slate-100';
      case 'danger':
        return 'bg-red-600 text-white border border-red-600 hover:bg-red-700';
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

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold relative transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${getVariantClasses()} ${getSizeClasses()} ${className}`}
    >
      {icon && iconPosition === 'left' && <span className="flex items-center">{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === 'right' && <span className="flex items-center">{icon}</span>}
      {badge !== undefined && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-white">
          {badge}
        </span>
      )}
    </button>
  );
};
