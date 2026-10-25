'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { trackingApi, TripTrackingDetails } from '../api/tracking.api';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';

export function HealthLogHistory({ shipmentId, horses, revision }: { shipmentId: number; horses: TripTrackingDetails['assignedHorses']; revision?: number }) {
  const [horseId, setHorseId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const user = getCurrentUser();
  const { data, error, isLoading, mutate } = useSWR(['tracking-health', user.id, user.role, shipmentId, horseId, page, revision],
    () => trackingApi.getHealthLogs(shipmentId, page, 10, horseId), { refreshInterval: 5000, revalidateOnFocus: true });
  return <section className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><h3 className="font-bold text-slate-900">Nhật ký sức khỏe</h3><p className="text-xs text-slate-500">Mới nhất trước · {data?.total ?? 0} bản ghi</p></div>
      <label className="text-sm text-slate-700">Lọc ngựa <select aria-label="Lọc nhật ký theo ngựa" value={horseId ?? ''} onChange={e => { setHorseId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }} className="max-w-full ml-2 rounded-lg border border-slate-300 bg-white p-2">
        <option value="">Tất cả ngựa</option>{horses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select></label>
    </div>
    {error && <div role="alert" className="text-sm text-red-700">Không tải được nhật ký. {error.message} <button className="underline" onClick={() => mutate()}>Thử lại</button></div>}
    {isLoading && <p role="status" className="text-sm text-slate-500">Đang tải nhật ký…</p>}
    {!error && !isLoading && !data?.items.length && <p className="text-sm text-slate-500">Chưa có nhật ký phù hợp.</p>}
    {data?.items.map(log => {
      const warning = (log.temperatureC != null && log.temperatureC > 38.5) || (log.vehicleTemperatureC != null && (log.vehicleTemperatureC < 16 || log.vehicleTemperatureC > 22));
      return <article key={log.id} className={`rounded-lg border p-4 ${warning ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
        <div className="flex flex-wrap justify-between gap-2"><strong>{log.horseName} · {log.conditionStatusVi ?? log.conditionStatus}</strong><time className="text-xs">{new Date(log.recordedAt).toLocaleString('vi-VN')}</time></div>
        <p className="text-sm mt-2">Thân nhiệt: {log.temperatureC == null ? 'Chưa đo' : `${log.temperatureC}°C`} · Nhịp tim: {log.heartRateBpm == null ? 'Chưa đo' : `${log.heartRateBpm} bpm`} · Thùng xe: {log.vehicleTemperatureC == null ? 'Chưa đo' : `${log.vehicleTemperatureC}°C`}</p>
        {warning && <p className="font-bold text-sm mt-1">Cảnh báo vượt ngưỡng an toàn</p>}
        {log.notes && <p className="text-sm mt-2 whitespace-pre-wrap break-words">{log.notes}</p>}
        <p className="text-xs mt-2 text-slate-500">Người ghi: {log.recordedByName ?? 'Không rõ'}</p>
        {log.attachments.filter(url => /^(https?:\/\/|\/uploads\/)/.test(url)).map(url => <a className="text-sm underline mr-3" key={url} href={url.startsWith('/uploads/') ? `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000/api').replace(/\/api\/?$/, '')}${url}` : url} target="_blank" rel="noopener noreferrer">Ảnh đính kèm</a>)}
      </article>;
    })}
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <Button variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage(p => p - 1)}>Trang trước</Button>
      <span>Trang {page} / {Math.max(1, data?.totalPages ?? 0)}</span>
      <Button variant="outline" disabled={!data || page >= data.totalPages || isLoading} onClick={() => setPage(p => p + 1)}>Trang sau</Button>
    </div>
  </section>;
}
