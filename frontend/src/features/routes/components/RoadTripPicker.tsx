'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import type { BookingType } from '@/features/orders/booking-policy';
import type { RouteLegItem } from '../api/routes.api';

export interface RoadTrip {
  id: number; vehicleId: number; vehiclePlate: string; bookingType: BookingType;
  originLocation: string; destinationLocation: string; plannedDeparture: string; plannedArrival: string;
  capacity: number; bookedStalls: number;
}

export function RoadTripPicker({ leg, bookingType, readOnly, onChange }: {
  leg: RouteLegItem; bookingType: BookingType; readOnly: boolean; onChange: (leg: RouteLegItem) => void;
}) {
  const { data: trips, error, mutate } = useSWR<RoadTrip[]>('/fleet/road-trips', (url: string) => apiClient<RoadTrip[]>(url));
  return <div className="mb-3 space-y-2 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
    <label className="block font-semibold">Chuyến đường bộ
      <select disabled={readOnly} value={leg.roadTripId ?? ''} onChange={event => {
        const trip = trips?.find(t => t.id === Number(event.target.value));
        onChange(trip ? { ...leg, roadTripId: trip.id, vehicleId: trip.vehicleId, vehiclePlate: trip.vehiclePlate,
          originLocation: trip.originLocation, destinationLocation: trip.destinationLocation,
          plannedDeparture: trip.plannedDeparture, plannedArrival: trip.plannedArrival } : { ...leg, roadTripId: null });
      }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal">
        <option value="">Tạo chuyến mới khi lưu kế hoạch</option>
        {trips?.filter(t => t.bookingType === bookingType || t.id === leg.roadTripId).map(t => <option key={t.id} value={t.id}>
          #{t.id} · {t.vehiclePlate} · {t.originLocation} → {t.destinationLocation} · {new Date(t.plannedDeparture).toLocaleString('vi-VN')} · {t.bookedStalls}/{t.capacity} ô
        </option>)}
      </select>
    </label>
    <p className="text-xs text-slate-600">{bookingType === 'shared_stall'
      ? 'Chọn chuyến chung sau khi kiểm tra thủ công tuyến và giờ phù hợp. Mỗi ngựa chiếm 1 ô; hệ thống kiểm tra lại chỗ khi lưu.'
      : 'Xe được dành riêng cho đơn này trong giờ đi/đến của chuyến. Không nhận thêm đơn khác trong cùng khoảng thời gian.'}</p>
    {leg.roadTripId && <p className="text-xs text-slate-600">Xe, tuyến và giờ lấy từ chuyến đã chọn. Chọn tạo chuyến mới để thay đổi các thông tin này.</p>}
    {error && <p role="alert" className="text-sm text-red-700">Chưa tải được chuyến đường bộ. <button type="button" onClick={() => void mutate()} className="underline">Thử lại</button></p>}
  </div>;
}

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
}

export function LegScheduleFields({ leg, readOnly, onChange }: { leg: RouteLegItem; readOnly: boolean; onChange: (leg: RouteLegItem) => void }) {
  return <fieldset disabled={readOnly || Boolean(leg.roadTripId)} className="mt-3 grid gap-3 sm:grid-cols-2">
    {(['plannedDeparture', 'plannedArrival'] as const).map(field => <label key={field} className="text-xs font-semibold text-slate-700">
      {field === 'plannedDeparture' ? 'Giờ xuất phát dự kiến' : 'Giờ đến dự kiến'}
      <input type="datetime-local" value={localDateTime(leg[field])} onChange={event => onChange({ ...leg, [field]: event.target.value ? new Date(event.target.value).toISOString() : null })}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" />
    </label>)}
  </fieldset>;
}
