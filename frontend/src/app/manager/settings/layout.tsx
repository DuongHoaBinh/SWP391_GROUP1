'use client';

import React from 'react';
import { Settings, Coins, Timer } from 'lucide-react';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function SettingsHubLayout({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <div className="flex flex-col gap-5">
      <ManagerSectionTabs
        ariaLabel={isEn ? 'System Settings sections' : 'Các mục Cấu hình & Cài đặt'}
        tabs={[
          {
            key: 'account',
            label: isEn ? 'Account & GPS' : 'Tài Khoản & GPS',
            href: '/manager/settings',
            icon: <Settings size={14} />,
            exact: true,
          },
          {
            key: 'pricing',
            label: isEn ? 'Pricing & Tariffs' : 'Bảng Giá & Định Mức',
            href: '/manager/settings/pricing',
            icon: <Coins size={14} />,
          },
          {
            key: 'city-restrictions',
            label: isEn ? 'City Restrictions & Rest' : 'Giờ Cấm Xe & Nghỉ',
            href: '/manager/settings/city-restrictions',
            icon: <Timer size={14} />,
          },
        ]}
      />
      {children}
    </div>
  );
}
