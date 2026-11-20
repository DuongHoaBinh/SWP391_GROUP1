'use client';

import React, { useId } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export const VietnamFlag: React.FC<{ className?: string }> = ({ className = 'w-5 h-3.5' }) => (
  <svg
    viewBox="0 0 30 20"
    className={`${className} rounded-[3px] shadow-sm overflow-hidden shrink-0 block`}
    aria-hidden="true"
  >
    <rect width="30" height="20" fill="#DA251D" />
    <polygon
      points="15,4 16.54,8.76 21.55,8.76 17.5,11.71 19.04,16.47 15,13.53 10.96,16.47 12.5,11.71 8.45,8.76 13.46,8.76"
      fill="#FFFF00"
    />
  </svg>
);

export const UkFlag: React.FC<{ className?: string }> = ({ className = 'w-5 h-3.5' }) => {
  const uid = useId();
  const clipS = `${uid}-uk-s`;
  const clipT = `${uid}-uk-t`;

  return (
    <svg
      viewBox="0 0 60 30"
      className={`${className} rounded-[3px] shadow-sm overflow-hidden shrink-0 block`}
      aria-hidden="true"
    >
      <clipPath id={clipS}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={clipT}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${clipS})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipT})`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
};

interface LanguageSwitcherProps {
  variant?: 'pill' | 'compact' | 'dropdown';
  tone?: 'light' | 'dark';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  tone = 'light',
  className = '',
}) => {
  const { language, setLanguage, t } = useLanguage();
  const isDark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label={t('nav.languageSelector', language === 'en' ? 'Language selector' : 'Chọn ngôn ngữ')}
      className={`inline-flex items-center p-1 rounded-xl border shadow-sm transition-all ${
        isDark
          ? 'bg-[#242722] border-[#3E392E]'
          : 'bg-surface-muted border-border'
      } ${className}`}
    >
      <button
        type="button"
        aria-pressed={language === 'vi'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setLanguage('vi');
        }}
        title="Tiếng Việt (VI)"
        aria-label="Chuyển sang Tiếng Việt"
        className={`relative flex items-center justify-center px-2 py-1.5 rounded-lg transition-all duration-200 cursor-pointer select-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          language === 'vi'
            ? isDark
              ? 'bg-[#36332B] border border-[#B49A68]/50 shadow-sm opacity-100'
              : 'bg-white shadow-sm border border-border opacity-100'
            : isDark
              ? 'opacity-55 hover:opacity-95 hover:bg-white/5 border border-transparent'
              : 'opacity-55 hover:opacity-95 hover:bg-white/70 border border-transparent'
        }`}
      >
        <VietnamFlag />
      </button>

      <button
        type="button"
        aria-pressed={language === 'en'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setLanguage('en');
        }}
        title="English (EN)"
        aria-label="Switch to English"
        className={`relative flex items-center justify-center px-2 py-1.5 rounded-lg transition-all duration-200 cursor-pointer select-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          language === 'en'
            ? isDark
              ? 'bg-[#36332B] border border-[#B49A68]/50 shadow-sm opacity-100'
              : 'bg-white shadow-sm border border-border opacity-100'
            : isDark
              ? 'opacity-55 hover:opacity-95 hover:bg-white/5 border border-transparent'
              : 'opacity-55 hover:opacity-95 hover:bg-white/70 border border-transparent'
        }`}
      >
        <UkFlag />
      </button>
    </div>
  );
};
