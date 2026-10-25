'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi } from './api/tracking.api';

export function useTracking(interval = 5000) {
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  useEffect(() => {
    setUser(getCurrentUser());
    const sync = () => {
      const requestedId = new URLSearchParams(window.location.search).get('shipmentId');
      setSelection(requestedId === null ? null : Number(requestedId));
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const list = useSWR(user ? ['tracking-trips', user.id, user.role] : null, () => trackingApi.getMyTrips(), { refreshInterval: interval, keepPreviousData: false });
  const trips = list.data ?? [];
  const selectedShipmentId = selection != null
    ? trips.find(trip => trip.shipment_id === selection)?.shipment_id ?? null
    : trips.find(trip => trip.shipment_status === 'in_transit')?.shipment_id ?? trips[0]?.shipment_id ?? null;
  const selectionError = list.data && selection != null && selectedShipmentId == null
    ? new Error('Không tìm thấy chuyến được chọn hoặc bạn không có quyền theo dõi chuyến này.') : null;
  const detail = useSWR(user && selectedShipmentId ? ['tracking-detail', user.id, user.role, selectedShipmentId] : null,
    () => trackingApi.getTrackingDetails(selectedShipmentId!), { refreshInterval: interval, keepPreviousData: false });
  const setSelectedShipmentId = (id: number) => {
    setSelection(id);
    const url = new URL(window.location.href);
    url.searchParams.set('shipmentId', String(id));
    window.history.replaceState(null, '', url);
  };
  const refresh = async () => { await Promise.allSettled([list.mutate(), detail.mutate()]); };
  return { currentUser: user, trips, selectedShipmentId, setSelectedShipmentId, trackingDetails: detail.data ?? null,
    loading: !user || list.isLoading, refreshing: detail.isValidating, detailLoading: detail.isLoading,
    error: list.error ?? selectionError ?? detail.error, refresh, refreshTrips: () => list.mutate().catch(() => undefined) };
}
