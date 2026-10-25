'use client';

import { TripTrackingDetails } from '../api/tracking.api';

export function JourneyHistory({ details }: { details: TripTrackingDetails | null }) {
  if (!details) return null;
  const events = [...details.statusLogs].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  const actions: Record<string, string> = { arrived: 'Đến trạm', departed: 'Rời trạm', customs_cleared: 'Thông quan', in_transit: 'Đang vận chuyển', completed: 'Hoàn thành', active: 'Xuất phát' };
  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Lịch sử cập nhật hành trình">
    <h3 className="font-bold text-slate-900">Lịch sử cập nhật hành trình</h3>
    {events.length === 0 ? <p className="mt-2 text-sm text-slate-500">Chưa có cập nhật thực tế.</p> : <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto">
      {events.map(event => <li key={event.id} className="border-l-2 border-blue-200 pl-3 text-sm break-words">
        <p className="font-semibold">{event.milestoneName} · {actions[event.newStatus] ?? event.newStatus}</p>
        <p className="text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString('vi-VN')} · {event.updatedByName || 'Tổ vận hành'}</p>
        {event.notes && <p className="mt-1 text-slate-600">{event.notes}</p>}
      </li>)}
    </ol>}
  </section>;
}
