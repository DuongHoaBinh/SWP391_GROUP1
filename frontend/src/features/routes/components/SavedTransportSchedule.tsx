'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import { scheduleTimeLabel } from '@/lib/transport-dates';
import type { RouteDetail } from '../api/routes.api';

export function SavedTransportSchedule({ shipmentId }: { shipmentId: number }) {
  const { data, error, isLoading, mutate } = useSWR<{ route: RouteDetail | null }>(
    `/routes/shipment/${shipmentId}/plan`, (url: string) => apiClient(url), { revalidateOnFocus: true });
  const route = data?.route;
  const legs = [...(route?.legs ?? [])].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const confirmed = Boolean(route && legs.length && legs.every(leg => leg.plannedDeparture && leg.plannedArrival) && ['confirmed', 'ready_to_depart', 'in_transit', 'completed'].includes(route.planStatus));
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="text-base font-semibold text-slate-900">Lịch vận chuyển {confirmed ? 'đã xác nhận' : 'đang thiết lập'}</h3>
    <p className="mt-1 text-sm text-slate-600">Ngày khách mong muốn và bản đồ tham khảo không phải lịch đã chốt. Tất cả giờ dưới đây theo Việt Nam (UTC+07:00).</p>
    {isLoading ? <p className="mt-3 text-sm text-slate-600">Đang tải lịch đã lưu…</p>
      : error ? <p role="alert" className="mt-3 text-sm text-red-700">Không tải được lịch đã lưu. <button type="button" className="underline" onClick={() => void mutate()}>Thử lại</button></p>
      : !legs.length ? <p className="mt-3 text-sm text-slate-600">Chưa có giờ đi/đến chi tiết được lưu. Điều phối cần hoàn thiện kế hoạch.</p>
      : <ol className="mt-3 space-y-3">{legs.map(leg => <li key={leg.sequenceNo} className="rounded-lg border border-slate-200 p-3 text-sm">
        <p className="font-semibold text-slate-800">Chặng {leg.sequenceNo} · {leg.legType === 'flight' ? 'Hàng không' : 'Đường bộ'}: {leg.originLocation} → {leg.destinationLocation}</p>
        <p className="mt-1 text-slate-600">Đi: {scheduleTimeLabel(leg.plannedDeparture)} · Đến: {scheduleTimeLabel(leg.plannedArrival)}</p>
      </li>)}</ol>}
    {legs.length > 0 && !confirmed && <p className="mt-3 text-sm text-amber-800">Lịch dự thảo; cần Manager duyệt và nhân sự nhận chuyến xác nhận trước khi chốt.</p>}
  </section>;
}
