'use client';

import { useEffect, useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { trackingApi, HorseHealthLogItem } from '../api/tracking.api';
import { TrackingTelemetry } from './TrackingTelemetry';
import { HealthLogHistory } from './HealthLogHistory';
import { useTracking } from '../useTracking';
import { TrackingLoadState } from './TrackingLoadState';

const emptyForm = { horseId: '', conditionStatus: '' as HorseHealthLogItem['conditionStatus'] | '', temperatureC: '', heartRateBpm: '', vehicleTemperatureC: '', notes: '', attachment: '' };

export default function HealthLogRecorder() {
  const { trips, selectedShipmentId: shipmentId, setSelectedShipmentId: setShipmentId, trackingDetails: details, error, loading, detailLoading: isLoading, refresh: mutate } = useTracking();
  const [formShipmentId, setFormShipmentId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(emptyForm);
  useEffect(() => { setOpen(false); setForm(emptyForm); }, [shipmentId]);
  const canRecord = !error && details && ['ready_to_depart', 'in_transit'].includes(details.shipmentStatus) && details.assignedHorses.length > 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!shipmentId || shipmentId !== formShipmentId || !canRecord || !details.assignedHorses.some(h => h.id === Number(form.horseId)) || !form.conditionStatus) { toast.error('Chuyến hoặc danh sách ngựa đã thay đổi. Vui lòng mở lại form.'); return; }
    setSaving(true);
    try {
      await trackingApi.createHealthLog(shipmentId, {
        horseId: Number(form.horseId), conditionStatus: form.conditionStatus,
        temperatureC: form.temperatureC === '' ? undefined : Number(form.temperatureC),
        heartRateBpm: form.heartRateBpm === '' ? undefined : Number(form.heartRateBpm),
        vehicleTemperatureC: form.vehicleTemperatureC === '' ? undefined : Number(form.vehicleTemperatureC),
        notes: form.notes.trim() || undefined, attachments: form.attachment.trim() ? [form.attachment.trim()] : undefined,
      });
      toast.success('Đã lưu nhật ký sức khỏe');
      setOpen(false); setRevision(value => value + 1); await mutate();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Không thể lưu nhật ký'); }
    finally { setSaving(false); }
  }
  return <div className="flex flex-col gap-6 pb-12">
    <header className="flex flex-wrap justify-between items-center gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Stethoscope />Nhật ký sức khỏe ngựa</h1><p className="text-sm text-slate-500 mt-1">Ghi số đo quan sát được của từng con ngựa trong chuyến được phân công.</p></div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm">Chuyến đi <select value={shipmentId ?? ''} aria-label="Chọn chuyến ghi sức khỏe" onChange={e => { setShipmentId(Number(e.target.value)); setOpen(false); }} className="max-w-full border border-slate-300 rounded-lg p-2 bg-white ml-2">
          {shipmentId == null && <option value="" disabled>{!loading && !trips.length ? 'Chưa có chuyến' : 'Chọn chuyến đi'}</option>}{trips.map(trip => <option key={trip.shipment_id} value={trip.shipment_id}>{trip.request_code}</option>)}
        </select></label>
        <Button variant="outline" onClick={() => mutate()} disabled={!shipmentId || isLoading}><RefreshCw size={16} /> Làm mới</Button>
        <Button disabled={!canRecord} onClick={() => { setFormShipmentId(shipmentId); setForm({ ...emptyForm, horseId: String(details?.assignedHorses[0]?.id ?? '') }); setOpen(true); }}><Plus size={16} /> Ghi nhật ký mới</Button>
      </div>
    </header>
    <TrackingLoadState loading={loading} error={error} retry={mutate} />
    {isLoading && <p role="status">Đang tải chi tiết chuyến…</p>}
    {!loading && !error && !trips.length && <p className="rounded-xl bg-white p-8 text-slate-500 border">Bạn chưa được phân công chuyến đi nào.</p>}
    {details && <>
      <div className="rounded-xl bg-white border border-slate-200 p-5"><strong>{details.requestCode}</strong><p className="text-sm text-slate-600 mt-1">{details.origin} → {details.destination}</p></div>
      <TrackingTelemetry details={details} />
      <HealthLogHistory key={details.shipmentId} shipmentId={details.shipmentId} horses={details.assignedHorses} revision={revision} />
    </>}
    <Modal isOpen={open} onClose={() => !saving && setOpen(false)} title="Ghi nhật ký sức khỏe" maxWidth="560px">
      <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
        <p className="text-slate-500">Chỉ nhập số đo đã kiểm tra. Ngựa sốt trên 38.5°C hoặc thùng xe ngoài 16–22°C sẽ hiển thị cảnh báo đỏ.</p>
        <label className="font-semibold">Ngựa trong chuyến<select required aria-label="Ngựa trong chuyến" value={form.horseId} onChange={e => setForm({ ...form, horseId: e.target.value })} className="mt-1 w-full border rounded-lg p-2 bg-white">
          {details?.assignedHorses.map(h => <option key={h.id} value={h.id}>{h.name} {h.microchipNo ? `· ${h.microchipNo}` : ''}</option>)}
        </select></label>
        <label className="font-semibold">Tình trạng quan sát<select required aria-label="Tình trạng quan sát" value={form.conditionStatus} onChange={e => setForm({ ...form, conditionStatus: e.target.value as typeof form.conditionStatus })} className="mt-1 w-full border rounded-lg p-2 bg-white">
          <option value="">Chọn tình trạng</option><option value="stable">Ổn định</option><option value="not_eating">Bỏ ăn</option><option value="stressed">Căng thẳng</option><option value="climate_change">Khí hậu thay đổi</option><option value="other">Khác</option>
        </select></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="font-semibold">Thân nhiệt (°C)<input aria-label="Thân nhiệt" type="number" step="0.1" min="20" max="50" value={form.temperatureC} onChange={e => setForm({ ...form, temperatureC: e.target.value })} className="w-full mt-1 border rounded-lg p-2" /></label>
          <label className="font-semibold">Nhịp tim (bpm)<input aria-label="Nhịp tim" type="number" step="1" min="1" max="300" value={form.heartRateBpm} onChange={e => setForm({ ...form, heartRateBpm: e.target.value })} className="w-full mt-1 border rounded-lg p-2" /></label>
          <label className="font-semibold">Nhiệt độ thùng xe (°C)<input aria-label="Nhiệt độ thùng xe" type="number" step="0.1" min="-30" max="70" value={form.vehicleTemperatureC} onChange={e => setForm({ ...form, vehicleTemperatureC: e.target.value })} className="w-full mt-1 border rounded-lg p-2" /></label>
        </div>
        <label className="font-semibold">Ghi chú nội bộ<textarea maxLength={2000} rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full mt-1 border rounded-lg p-2" /></label>
        <label className="font-semibold">Liên kết ảnh (tùy chọn)<input type="url" maxLength={500} placeholder="https://…" value={form.attachment} onChange={e => setForm({ ...form, attachment: e.target.value })} className="w-full mt-1 border rounded-lg p-2" /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nhật ký'}</Button></div>
      </form>
    </Modal>
  </div>;
}
