'use client';

import type { RouteLegItem } from '../api/routes.api';

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
      disabled={readOnly}
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
