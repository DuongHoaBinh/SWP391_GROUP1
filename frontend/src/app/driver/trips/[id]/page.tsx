'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { DriverTripConsole } from '@/features/tracking/components/DriverTripConsole';

function DriverTripDetailInner() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const shipmentId = rawId ? Number(rawId) : null;

  return (
    <DriverTripConsole
      initialShipmentId={shipmentId && Number.isFinite(shipmentId) ? shipmentId : null}
      showBackToTrips
    />
  );
}

export default function DriverTripDetailPage() {
  return (
    <Suspense fallback={<PortalLoadingSkeleton />}>
      <DriverTripDetailInner />
    </Suspense>
  );
}
