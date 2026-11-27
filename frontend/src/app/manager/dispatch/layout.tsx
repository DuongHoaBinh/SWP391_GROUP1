'use client';

import React from 'react';
import { DispatchSectionTabs } from '@/components/layout/DispatchSectionTabs';

export default function DispatchHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <DispatchSectionTabs />
      {children}
    </div>
  );
}
