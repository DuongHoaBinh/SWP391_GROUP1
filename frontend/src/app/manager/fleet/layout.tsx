'use client';

import React from 'react';
import { Bus, Building2 } from 'lucide-react';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function FleetHubLayout({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <div className="flex flex-col gap-5">
      <ManagerSectionTabs
        ariaLabel={isEn ? 'Fleet & Depots sections' : 'Các mục Đội xe & Trạm xe'}
        tabs={[
          {
            key: 'vehicles',
            label: isEn ? 'Vehicles' : 'Phương Tiện',
            href: '/manager/fleet/vehicles',
            icon: <Bus size={14} />,
          },
          {
            key: 'depots',
            label: isEn ? 'Depots & Partners' : 'Trạm Xe & Đối Tác',
            href: '/manager/fleet/depots',
            icon: <Building2 size={14} />,
          },
        ]}
      />
      {children}
    </div>
  );
}
