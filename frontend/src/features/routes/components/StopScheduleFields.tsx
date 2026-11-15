'use client';

import { vietnamDateTimeInput, vietnamInputToIso } from '@/lib/transport-dates';
import type { RouteLegItem, RouteStopItem } from '../api/routes.api';

export function StopScheduleFields({ stop, legs, readOnly, onChange }: {
  stop: RouteStopItem; legs: RouteLegItem[]; readOnly: boolean; onChange: (stop: RouteStopItem) => void;
}) {
  const leg = legs.find(item => item.sequenceNo === stop.legSequenceNo);
  return <fieldset disabled={readOnly} className="mt-2 grid min-w-64 gap-2">
    <label className="text-xs text-slate-600">Chặng chứa trạm {stop.sequenceNo}
      <select value={stop.legSequenceNo ?? ''} onChange={event => onChange({ ...stop, legSequenceNo: event.target.value ? Number(event.target.value) : undefined })}
        className="mt-1 min-h-10 w-full rounded border border-slate-300 bg-white px-2">
        <option value="">Trong toàn hành trình / giữa các chặng</option>
        {legs.map(item => <option key={item.sequenceNo} value={item.sequenceNo}>Chặng {item.sequenceNo}: {item.originLocation} → {item.destinationLocation}</option>)}
      </select>
    </label>
    <div className="grid gap-2 sm:grid-cols-2">
      {(['plannedArrival', 'plannedDeparture'] as const).map(field => <label key={field} className="text-xs text-slate-600">
        {field === 'plannedArrival' ? 'Đến' : 'Rời'} trạm {stop.sequenceNo} (UTC+07)
        <input type="datetime-local" value={vietnamDateTimeInput(stop[field])}
          min={vietnamDateTimeInput(field === 'plannedDeparture' ? stop.plannedArrival ?? leg?.plannedDeparture : leg?.plannedDeparture)}
          max={vietnamDateTimeInput(leg?.plannedArrival)}
          onChange={event => onChange({ ...stop, [field]: vietnamInputToIso(event.target.value) })}
          className="mt-1 min-h-10 w-full rounded border border-slate-300 px-2" />
      </label>)}
    </div>
    {stop.plannedArrival && stop.plannedDeparture && new Date(stop.plannedDeparture) < new Date(stop.plannedArrival) &&
      <p role="alert" className="text-xs text-red-700">Giờ rời trạm không được trước giờ đến.</p>}
  </fieldset>;
}
