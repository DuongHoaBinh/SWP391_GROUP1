'use client';

import React, { Suspense } from 'react';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { DriverTripConsole } from '@/features/tracking/components/DriverTripConsole';

export default function DriverStatusPage() {
  return (
    <Suspense fallback={<PortalLoadingSkeleton />}>
      <DriverTripConsole />
    </Suspense>
  );
}
