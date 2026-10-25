'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftRight, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';

interface LanguageSwitcherProps {
  variant?: 'pill' | 'compact' | 'dropdown';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'pill',
  className = '',
}) => {
  const { language, setLanguage, toggleLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const languages: { code: Language; label: string; flag: string; short: string }[] = [
    { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', short: 'VI' },
    { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN' },
  ];

  const current = languages.find((l) => l.code === language) || languages[0];

  // 1. PILL VARIANT: Both languages visible side-by-side. 1-click switch!
  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold ${className}`}
        style={{
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)',
        }}
      >
        {languages.map((l) => {
          const isActive = language === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLanguage(l.code);
              }}
              title={l.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isActive ? '#2563eb' : 'transparent',
                color: isActive ? '#ffffff' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.3)' : 'none',
              }}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>{l.flag}</span>
              <span>{l.short}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 2. COMPACT VARIANT: 1-click toggle button! Directly switches on click!
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleLanguage();
        }}
        title={language === 'vi' ? 'Bấm để đổi sang English' : 'Click to switch to Tiếng Việt'}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          color: '#1e293b',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
        aria-label="Toggle language"
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{current.flag}</span>
        <span style={{ color: '#2563eb' }}>{current.short}</span>
        <ArrowLeftRight size={12} color="#94a3b8" />
      </button>
    );
  }

  // 3. DROPDOWN VARIANT
  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }} className={className}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '9px',
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          color: '#1e293b',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
        aria-label="Change language"
      >
        <span style={{ fontSize: '15px' }}>{current.flag}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{current.label}</span>
        <ChevronDown size={13} color="#94a3b8" />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '160px',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '5px',
            zIndex: 100,
          }}
        >
          {languages.map((l) => {
            const isSelected = language === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLanguage(l.code);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                  color: isSelected ? '#2563eb' : '#334155',
                  fontSize: '13px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>{l.flag}</span>
                  <span>{l.label}</span>
                </div>
                {isSelected && <Check size={14} color="#2563eb" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
