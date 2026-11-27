'use client';

import React from 'react';
import { ShieldCheck, FileX, ClipboardCheck, FolderOpen, Scale } from 'lucide-react';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function ComplianceHubLayout({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <div className="flex flex-col gap-5">
      <ManagerSectionTabs
        ariaLabel={isEn ? 'Compliance & Quarantine sections' : 'Các mục Hồ sơ & Kiểm dịch'}
        tabs={[
          {
            key: 'overview',
            label: isEn ? 'Review Desk' : 'Bàn Thẩm Định',
            href: '/manager/compliance',
            icon: <ShieldCheck size={14} />,
            exact: true,
          },
          {
            key: 'missing',
            label: isEn ? 'Missing / Expired' : 'Hồ Sơ Còn Thiếu',
            href: '/manager/compliance/missing',
            icon: <FileX size={14} />,
          },
          {
            key: 'orders',
            label: isEn ? 'By Order' : 'Theo Đơn Hàng',
            href: '/manager/compliance/orders',
            icon: <ClipboardCheck size={14} />,
          },
          {
            key: 'documents',
            label: isEn ? 'Dossiers' : 'Kho Hồ Sơ',
            href: '/manager/compliance/documents',
            icon: <FolderOpen size={14} />,
          },
          {
            key: 'regulations',
            label: isEn ? 'Regulations' : 'Quy Định Quốc Gia',
            href: '/manager/compliance/regulations',
            icon: <Scale size={14} />,
          },
        ]}
      />
      {children}
    </div>
  );
}
