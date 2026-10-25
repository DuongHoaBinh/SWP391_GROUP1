'use client';

import { TripTrackingDetails } from '../api/tracking.api';

export function TrackingTelemetry({ details }: { details: TripTrackingDetails | null }) {
  const readings = details?.latestHorseHealth ?? [];
  const temperature = details?.telemetry?.vehicleTemperatureC;
  return <section className="flex flex-col gap-3" aria-label="Số đo và cảnh báo">
    {(details?.alerts ?? []).map((alert) => <div role="alert" key={`${alert.type}-${alert.horseId ?? 'vehicle'}`} className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
      <strong>Cảnh báo: {alert.message}</strong>
      <p className="text-xs mt-1">Ghi nhận: {new Date(alert.recordedAt).toLocaleString('vi-VN')}</p>
    </div>)}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        { label: 'Nhiệt độ thùng xe', value: temperature == null ? 'Chưa có số đo' : `${temperature}°C`, note: details?.telemetry?.recordedAt ? new Date(details.telemetry.recordedAt).toLocaleString('vi-VN') : 'Ngưỡng cảnh báo: dưới 16°C hoặc trên 22°C' },
      ].map(item => <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-500">{item.label}</p><p className="text-xl font-bold text-slate-900 mt-2">{item.value}</p><p className="text-xs text-slate-500 mt-1">{item.note}</p>
      </div>)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(details?.assignedHorses ?? []).map(horse => {
        const latest = readings.find(log => log.horseId === horse.id);
        const fever = latest?.temperatureC != null && latest.temperatureC > 38.5;
        return <div key={horse.id} className={`rounded-xl border p-4 ${fever ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
          <h4 className="font-bold break-words">{horse.name}</h4>
          <p className="text-sm mt-2">Thân nhiệt: {latest?.temperatureC == null ? 'Chưa đo' : `${latest.temperatureC}°C`} · Nhịp tim: {latest?.heartRateBpm == null ? 'Chưa đo' : `${latest.heartRateBpm} bpm`}</p>
          <p className="text-xs mt-1">{latest ? `Ghi nhận: ${new Date(latest.recordedAt).toLocaleString('vi-VN')}` : 'Chờ nhật ký của tổ vận hành'}</p>
        </div>;
      })}
    </div>
  </section>;
}
