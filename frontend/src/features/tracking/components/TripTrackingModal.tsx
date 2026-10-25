'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { TransportRequest } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi } from '../api/tracking.api';
import { TrackingTelemetry } from './TrackingTelemetry';

export function TripTrackingModal({ isOpen, onClose, request }: { isOpen: boolean; onClose: () => void; request: TransportRequest | null }) {
  const shipmentId = Number(request?.id);
  const { data, error, isLoading } = useSWR(isOpen && Number.isInteger(shipmentId) && shipmentId > 0 ? ['tracking/details', getCurrentUser().id, getCurrentUser().role, shipmentId] : null,
    () => trackingApi.getTrackingDetails(shipmentId), { refreshInterval: 5000 });
  return <Modal isOpen={isOpen} onClose={onClose} title={`Theo dõi chuyến · ${request?.requestCode ?? ''}`} maxWidth="760px">
    {isLoading && <p role="status">Đang tải hành trình…</p>}
    {error && <p role="alert" className="text-red-700">Không thể tải hành trình: {error.message}</p>}
    {data && <div className="flex flex-col gap-4">
      <p className="text-sm">{data.origin} → {data.destination}</p><p className="text-sm font-semibold">{data.currentMilestone}</p>
      <TrackingTelemetry details={data} />
      <ol className="flex flex-col gap-2">{data.milestones.map(m => <li className="border rounded-lg p-3 text-sm" key={m.id}><strong>{m.title}</strong><p>{m.status === 'COMPLETED' ? 'Đã hoàn tất' : m.status === 'CURRENT' ? 'Mốc tiếp theo' : 'Chờ thực hiện'}{m.actualTime ? ` · ${new Date(m.actualTime).toLocaleString('vi-VN')}` : ''}</p></li>)}</ol>
      <Link className="text-blue-700 underline" href={`/customer/tracking?shipmentId=${shipmentId}`}>Xem đầy đủ hành trình và nhật ký sức khỏe</Link>
    </div>}
  </Modal>;
}
