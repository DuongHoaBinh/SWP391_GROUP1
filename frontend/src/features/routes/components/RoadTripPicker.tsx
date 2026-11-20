'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import type { BookingType } from '@/features/orders/booking-policy';
import type { RouteLegItem } from '../api/routes.api';

export interface RoadTrip {
  id: number;
  vehicleId: number;
  vehiclePlate: string;
  bookingType: BookingType;
  originLocation: string;
  destinationLocation: string;
  plannedDeparture: string;
  plannedArrival: string;
  capacity: number;
  bookedStalls: number;
}

export function RoadTripPicker({
  leg,
  bookingType,
  readOnly,
  language = 'vi',
  onChange,
}: {
  leg: RouteLegItem;
  bookingType: BookingType;
  readOnly: boolean;
  language?: 'en' | 'vi';
  onChange: (leg: RouteLegItem) => void;
}) {
  const { data: trips, error, mutate } = useSWR<RoadTrip[]>(
    '/fleet/road-trips',
    (url: string) => apiClient<RoadTrip[]>(url)
  );

  const isLoading = trips === undefined && !error;
  const matchingTrips =
    trips?.filter((t) => t.bookingType === bookingType || t.id === leg.roadTripId) ?? [];

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-[#287653]/30 bg-white p-3.5 text-sm">
      <label className="block font-semibold text-[#181A17]">
        {language === 'en' ? 'Road Trip Assignment' : 'Chuyến đường bộ'}
        <select
          disabled={readOnly}
          value={leg.roadTripId ?? ''}
          onChange={(event) => {
            const trip = trips?.find((t) => t.id === Number(event.target.value));
            onChange(
              trip
                ? {
                    ...leg,
                    roadTripId: trip.id,
                    vehicleId: trip.vehicleId,
                    vehiclePlate: trip.vehiclePlate,
                    originLocation: trip.originLocation,
                    destinationLocation: trip.destinationLocation,
                    plannedDeparture: trip.plannedDeparture,
                    plannedArrival: trip.plannedArrival,
                  }
                : { ...leg, roadTripId: null }
            );
          }}
          className="mt-1 min-h-11 w-full rounded-lg border border-[#D8CEBE] bg-white px-3 font-normal text-[#181A17] outline-none focus:border-[#C4B38E] disabled:opacity-70 disabled:bg-[#F4F1E9] disabled:cursor-not-allowed"
        >
          <option value="">
            {language === 'en'
              ? 'Create new road trip on save'
              : 'Tạo chuyến mới khi lưu kế hoạch'}
          </option>
          {matchingTrips.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.id} · {t.vehiclePlate} · {t.originLocation} → {t.destinationLocation} ·{' '}
              {new Date(t.plannedDeparture).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} ·{' '}
              {t.bookedStalls}/{t.capacity} {language === 'en' ? 'stalls' : 'ô'}
            </option>
          ))}
        </select>
      </label>

      {isLoading && (
        <p className="text-xs text-[#747D88] m-0">
          {language === 'en'
            ? 'Loading available road trips...'
            : 'Đang tải danh sách chuyến đường bộ...'}
        </p>
      )}

      {!isLoading && !error && matchingTrips.length === 0 && (
        <p className="text-xs text-[#747D88] m-0">
          {language === 'en'
            ? 'No matching active road trips yet — a new trip will be created when saving.'
            : 'Chưa có chuyến đường bộ sẵn có phù hợp — hệ thống sẽ tạo chuyến mới khi lưu.'}
        </p>
      )}

      <p className="text-xs text-[#57564E] m-0">
        {bookingType === 'shared_stall'
          ? language === 'en'
            ? 'Select a shared trip after checking route and schedule fit. Each horse takes 1 stall; capacity is re-verified on save.'
            : 'Chọn chuyến chung sau khi kiểm tra thủ công tuyến và giờ phù hợp. Mỗi ngựa chiếm 1 ô; hệ thống kiểm tra lại chỗ khi lưu.'
          : language === 'en'
          ? 'The vehicle is dedicated exclusively to this order during its scheduled trip window.'
          : 'Xe được dành riêng cho đơn này trong giờ đi/đến của chuyến. Không nhận thêm đơn khác trong cùng khoảng thời gian.'}
      </p>

      {leg.roadTripId && (
        <p className="text-xs text-[#A67C2E] font-medium m-0">
          {language === 'en'
            ? 'Vehicle, route, and schedule are inherited from the selected trip. Choose "Create new road trip" to edit.'
            : 'Xe, tuyến và giờ lấy từ chuyến đã chọn. Chọn tạo chuyến mới để thay đổi các thông tin này.'}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-[#B33E3E] m-0">
          {language === 'en' ? 'Failed to load road trips. ' : 'Chưa tải được chuyến đường bộ. '}
          <button type="button" onClick={() => void mutate()} className="underline font-semibold cursor-pointer">
            {language === 'en' ? 'Retry' : 'Thử lại'}
          </button>
        </p>
      )}
    </div>
  );
}

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
}

export function LegScheduleFields({
  leg,
  readOnly,
  language = 'vi',
  onChange,
}: {
  leg: RouteLegItem;
  readOnly: boolean;
  language?: 'en' | 'vi';
  onChange: (leg: RouteLegItem) => void;
}) {
  const departureLocal = localDateTime(leg.plannedDeparture);

  return (
    <fieldset
      disabled={readOnly || Boolean(leg.roadTripId)}
      className="mt-3 grid gap-3 sm:grid-cols-2 m-0 p-0 border-0 disabled:opacity-75"
    >
      {(['plannedDeparture', 'plannedArrival'] as const).map((field) => (
        <label key={field} className="text-xs font-semibold text-[#181A17]">
          {field === 'plannedDeparture'
            ? language === 'en'
              ? 'Planned Departure Time'
              : 'Giờ xuất phát dự kiến'
            : language === 'en'
            ? 'Planned Arrival Time'
            : 'Giờ đến dự kiến'}
          <input
            type="datetime-local"
            min={field === 'plannedArrival' && departureLocal ? departureLocal : undefined}
            value={localDateTime(leg[field])}
            onChange={(event) =>
              onChange({
                ...leg,
                [field]: event.target.value ? new Date(event.target.value).toISOString() : null,
              })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-[#D8CEBE] bg-white px-3 font-normal text-[#181A17] outline-none focus:border-[#C4B38E] disabled:opacity-70 disabled:bg-[#F4F1E9] disabled:cursor-not-allowed"
          />
        </label>
      ))}
    </fieldset>
  );
}
