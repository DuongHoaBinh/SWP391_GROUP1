'use client';

import React from 'react';
import { MapPin, Map as MapIcon, CalendarDays } from 'lucide-react';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function DispatchSectionTabs() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <ManagerSectionTabs
      ariaLabel={isEn ? 'Planning & Dispatch sections' : 'Các mục Lập tuyến & Điều phối'}
      tabs={[
        {
          key: 'planning',
          label: isEn ? 'Trip Planning' : 'Kế Hoạch & Phân Công',
          href: '/manager/planning',
          icon: <MapPin size={14} />,
        },
        {
          key: 'routes',
          label: isEn ? 'Route Builder' : 'Dựng Lộ Trình Chi Tiết',
          href: '/manager/dispatch/routes',
          icon: <MapIcon size={14} />,
        },
        {
          key: 'schedule',
          label: isEn ? 'Departure Schedule' : 'Lịch Xuất Phát',
          href: '/manager/dispatch/schedule',
          icon: <CalendarDays size={14} />,
        },
      ]}
    />
  );
}
