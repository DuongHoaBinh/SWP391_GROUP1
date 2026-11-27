'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface CustomerTabItem {
  key: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badge?: number | string;
  badgeTone?: 'neutral' | 'amber' | 'danger' | 'success';
  exact?: boolean;
}

interface CustomerSectionTabsProps {
  tabs: CustomerTabItem[];
  activeKey?: string;
  onChange?: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}

function getBadgeClasses(tone: CustomerTabItem['badgeTone'], isActive: boolean): string {
  if (isActive) {
    if (tone === 'danger') return 'bg-rose-500 text-white';
    if (tone === 'amber') return 'bg-[#A67C2E] text-white';
    if (tone === 'success') return 'bg-emerald-600 text-white';
    return 'bg-[#FAF8F4]/20 text-[#FAF8F4]';
  }
  if (tone === 'danger') return 'bg-rose-100 text-rose-700';
  if (tone === 'amber') return 'bg-amber-100 text-amber-800';
  if (tone === 'success') return 'bg-emerald-100 text-emerald-700';
  return 'bg-[#EAE4D8] text-[#5C6658]';
}

export function CustomerSectionTabs({
  tabs,
  activeKey,
  onChange,
  ariaLabel = 'Điều hướng nhóm chức năng',
  className = '',
}: CustomerSectionTabsProps) {
  const pathname = usePathname();

  const isTabActive = (tab: CustomerTabItem) => {
    if (activeKey !== undefined) return activeKey === tab.key;
    if (!tab.href) return false;
    return tab.exact
      ? pathname === tab.href
      : pathname === tab.href || Boolean(pathname?.startsWith(`${tab.href}/`));
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 ${className}`}
    >
      <div className="inline-flex items-center gap-1 bg-white/95 border border-[#D8CEBE] rounded-2xl p-1 shadow-xs">
        {tabs.map((tab) => {
          const active = isTabActive(tab);
          const sharedClasses = `inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all no-underline cursor-pointer ${
            active
              ? 'bg-[#181A17] text-[#FAF8F4] shadow-sm'
              : 'text-[#5C6658] hover:text-[#181A17] hover:bg-[#F4F1E9]'
          }`;

          const content = (
            <>
              {tab.icon && (
                <span className={active ? 'text-[#D4C5A3]' : 'text-[#8C7A5B]'}>
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== '' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold leading-none ${getBadgeClasses(
                    tab.badgeTone,
                    active,
                  )}`}
                >
                  {tab.badge}
                </span>
              )}
            </>
          );

          if (tab.href && !onChange) {
            return (
              <Link
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={active}
                aria-current={active ? 'page' : undefined}
                className={sharedClasses}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(tab.key)}
              className={`${sharedClasses} border-0`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Hub 1: Đơn vận chuyển & Sao kê (/customer/requests | /customer/reports) */
export function CustomerOrdersHubTabs({
  ordersCount,
  className = '',
}: {
  ordersCount?: number;
  className?: string;
}) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const tabs: CustomerTabItem[] = [
    {
      key: 'requests',
      label: isEn ? 'Orders List' : 'Danh sách đơn',
      href: '/customer/requests',
      icon: <FileText size={14} aria-hidden="true" />,
      badge: ordersCount !== undefined && ordersCount > 0 ? ordersCount : undefined,
      exact: true,
    },
    {
      key: 'reports',
      label: isEn ? 'Reports & Statements' : 'Báo cáo & Sao kê',
      href: '/customer/reports',
      icon: <BarChart3 size={14} aria-hidden="true" />,
      exact: true,
    },
  ];

  return (
    <CustomerSectionTabs
      tabs={tabs}
      ariaLabel={isEn ? 'Transport orders & financial statements' : 'Đơn vận chuyển & Sao kê'}
      className={className}
    />
  );
}
