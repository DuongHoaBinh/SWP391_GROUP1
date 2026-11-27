'use client';

import React from 'react';
import { MapPin, Map as MapIcon } from 'lucide-react';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function DispatchSectionTabs() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <ManagerSectionTabs
      ariaLabel={isEn ? 'Planning & Dispatch sections' : 'Các mục Điều phối & Lộ trình'}
      tabs={[
        {
          key: 'planning',
          label: isEn ? 'Dispatch & Crew' : 'Điều Phối & Phân Công',
          href: '/manager/planning',
          icon: <MapPin size={14} />,
        },
        {
          key: 'routes',
          label: isEn ? 'Confirm Route' : 'Xác Nhận Lộ Trình',
          href: '/manager/dispatch/routes',
          icon: <MapIcon size={14} />,
        },
      ]}
    />
  );
}
