'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Moon, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getShipmentAllocation, swapReservedVehicle, type ShipmentAllocation, type ShipmentReservation } from '../allocation-api';

interface VehicleLite {
  id: number;
  plateOrCode: string;
  capacity: number;
  status: string;
  vehicleType: string;
  vehicleClassName?: string | null;
  depotName?: string | null;
}

const fmt = (iso: string | null | undefined, isEn: boolean) =>
  iso
    ? new Date(iso).toLocaleString(isEn ? 'en-GB' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

/**
 * Step 9: xe đã giữ chỗ cho đơn theo phương án khách chọn. Manager đổi xe phải nhập lý do
 * (backend nhả reservation cũ, giữ xe mới cùng khung giờ, ghi lịch sử).
 */
export function ReservedVehiclesPanel({ shipmentId, onChanged }: { shipmentId: number; onChanged?: () => void }) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [data, setData] = useState<ShipmentAllocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [swapFrom, setSwapFrom] = useState<ShipmentReservation | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLite[]>([]);
  const [toVehicleId, setToVehicleId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getShipmentAllocation(shipmentId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSwap = async (r: ShipmentReservation) => {
    setSwapFrom(r);
    setToVehicleId('');
    setReason('');
    try {
      const list = await apiClient<VehicleLite[]>('/fleet/vehicles');
      const held = new Set((data?.reservations ?? []).map((x) => x.vehicleId));
      setVehicles(list.filter((v) => v.vehicleType !== 'aircraft_stall' && v.status === 'available' && !held.has(v.id)));
    } catch {
      setVehicles([]);
    }
  };

  const submitSwap = async () => {
    if (!swapFrom || !toVehicleId) return;
    if (reason.trim().length < 5) {
      toast.error(isEn ? 'Please enter a reason (at least 5 characters)' : 'Vui lòng nhập lý do đổi xe (tối thiểu 5 ký tự)');
      return;
    }
    setSaving(true);
    try {
      setData(await swapReservedVehicle(shipmentId, { fromVehicleId: swapFrom.vehicleId, toVehicleId: Number(toVehicleId), reason: reason.trim() }));
      toast.success(isEn ? 'Vehicle swapped' : 'Đã đổi xe');
      setSwapFrom(null);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data || (!data.reservations.length && !data.optionCode)) return null;
  const active = data.reservations.filter((r) => r.status !== 'released');

  return (
    <section className="rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] p-4 flex flex-col gap-3" aria-label={isEn ? 'Reserved vehicles' : 'Xe đã giữ chỗ'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-bold text-[#181A17] flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#A67C2E]" aria-hidden="true" />
          {isEn ? 'Vehicles reserved at booking' : 'Xe đã giữ chỗ khi khách đặt'}
          {data.snapshot?.label && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E5DDD0] text-[#181A17]">{data.snapshot.label}</span>
          )}
        </h3>
        <span className="text-xs text-[#5B6779] flex items-center gap-2">
          {isEn ? 'Pickup' : 'Giờ đón'}: <strong className="text-[#181A17]">{fmt(data.pickupAt, isEn)}</strong>
          {data.nightSurchargeApplied && (
            <span className="inline-flex items-center gap-1 text-[#3B3F6B]">
              <Moon className="w-3.5 h-3.5" aria-hidden="true" /> {isEn ? 'night surcharge' : 'phụ phí đêm'}
            </span>
          )}
        </span>
      </div>
      <p className="m-0 text-[11px] text-[#5B6779]">
        {isEn
          ? 'Multi-vehicle options run as a convoy: assign the lead vehicle to each road leg; the reserved convoy capacity counts. Using another vehicle requires a reason.'
          : 'Phương án nhiều xe chạy thành đoàn: gán xe dẫn đầu cho từng chặng bộ, sức chứa tính theo cả đoàn đã giữ. Dùng xe khác phải ghi lý do.'}
      </p>
      {active.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[520px]">
            <thead className="text-[#6D7785]">
              <tr>
                <th className="py-1.5 pr-3">{isEn ? 'Vehicle' : 'Xe'}</th>
                <th className="py-1.5 pr-3">{isEn ? 'Depot' : 'Trạm'}</th>
                <th className="py-1.5 pr-3">{isEn ? 'Window' : 'Khung giờ giữ'}</th>
                <th className="py-1.5 pr-3">{isEn ? 'Status' : 'Trạng thái'}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD0]">
              {active.map((r) => (
                <tr key={r.reservationId}>
                  <td className="py-1.5 pr-3 font-semibold text-[#181A17]">
                    {r.plate} <span className="font-normal text-[#5B6779]">({r.capacity} {isEn ? 'slots' : 'chỗ'})</span>
                  </td>
                  <td className="py-1.5 pr-3">{r.depotName ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-mono">{fmt(r.startAt, isEn)} → {fmt(r.endAt, isEn)}</td>
                  <td className="py-1.5 pr-3">{r.status === 'consumed' ? (isEn ? 'in plan' : 'đã vào kế hoạch') : (isEn ? 'held' : 'đang giữ')}</td>
                  <td className="py-1.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => void openSwap(r)}>
                      <ArrowLeftRight className="w-3.5 h-3.5" /> {isEn ? 'Swap' : 'Đổi xe'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-xs text-[#747D88]">{isEn ? 'No active reservation.' : 'Không còn xe đang giữ.'}</p>
      )}
      {!!data.snapshot?.overrides?.length && (
        <ul className="m-0 pl-4 text-[11px] text-[#5B6779]">
          {data.snapshot.overrides.map((o, i) => (
            <li key={i}>
              {fmt(o.at, isEn)} — #{o.fromVehicleId} → #{o.toVehicleId}: {o.reason}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={Boolean(swapFrom)}
        onClose={() => !saving && setSwapFrom(null)}
        title={isEn ? 'Swap reserved vehicle' : 'Đổi xe đã giữ chỗ'}
        subtitle={swapFrom ? `${swapFrom.plate} (${swapFrom.capacity} ${isEn ? 'slots' : 'chỗ'})` : undefined}
        maxWidth="max-w-lg"
        closeDisabled={saving}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="swap-to" className="block text-xs font-semibold text-[#5B6779] mb-1">{isEn ? 'Replacement vehicle' : 'Xe thay thế'}</label>
            <select
              id="swap-to"
              value={toVehicleId}
              onChange={(e) => setToVehicleId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-sm"
            >
              <option value="">{isEn ? '— choose —' : '— chọn xe —'}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateOrCode} · {v.vehicleClassName ?? v.vehicleType} · {v.capacity} {isEn ? 'slots' : 'chỗ'} · {v.depotName ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="swap-reason" className="block text-xs font-semibold text-[#5B6779] mb-1">{isEn ? 'Reason (required)' : 'Lý do (bắt buộc)'}</label>
            <textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={255}
              className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-sm"
              placeholder={isEn ? 'e.g. Vehicle under unplanned maintenance' : 'VD: Xe phát sinh bảo dưỡng đột xuất'}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSwapFrom(null)} disabled={saving}>{isEn ? 'Cancel' : 'Hủy'}</Button>
            <Button variant="primary" onClick={() => void submitSwap()} disabled={saving || !toVehicleId || reason.trim().length < 5}>
              {isEn ? 'Confirm swap' : 'Xác nhận đổi xe'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
