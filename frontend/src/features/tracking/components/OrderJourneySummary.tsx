'use client';

import useSWR from 'swr';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi } from '../api/tracking.api';
import { TrackingLoadState } from './TrackingLoadState';

export function OrderJourneySummary({ shipmentId }: { shipmentId: number }) {
  const user = getCurrentUser();
  const { data, error, isLoading, mutate } = useSWR(['tracking/details', user.id, user.role, shipmentId],
    () => trackingApi.getTrackingDetails(shipmentId), { refreshInterval: 5000 });
  return <div className="p-4 sm:p-6 flex flex-col gap-3 text-sm break-words">
    <TrackingLoadState loading={isLoading} error={error} retry={() => mutate()} />
    {data && <>
      <p className="font-semibold text-slate-800">{data.origin} → {data.destination}</p>
      <p className="text-slate-600">Khoảng cách: {data.totalDistanceKm == null ? 'Chưa có kế hoạch' : `${data.totalDistanceKm.toLocaleString('vi-VN')} km`} · Dự kiến đến: {data.eta ? new Date(data.eta).toLocaleString('vi-VN') : 'Chưa có lịch'}</p>
      <p className="text-slate-600">Mốc ghi nhận gần nhất: {data.currentMilestone}</p>
      <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
        {data.milestones.filter(m => m.itemType === 'stop').map(stop => <li key={stop.id}><strong>{stop.title}</strong><p className="text-xs text-slate-500">{stop.actualTime ? `Ghi nhận: ${new Date(stop.actualTime).toLocaleString('vi-VN')}` : 'Chưa check-in'}</p></li>)}
      </ol>
      {data.milestones.length === 0 && <p className="text-slate-500">Chưa có lộ trình được lập.</p>}
    </>}
  </div>;
}
