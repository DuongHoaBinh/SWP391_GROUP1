'use client';

import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Moon, Truck } from 'lucide-react';
import type { QuoteOption, QuoteShortage } from '../quote-api';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')}\u00A0đ`;

const formatLocal = (iso: string | undefined, isEn: boolean) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(isEn ? 'en-GB' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
};

const OPTION_LABEL_EN: Record<string, string> = {
  cheapest: 'Cheapest',
  fewest_vehicles: 'Fewest vehicles',
  earliest: 'Earliest arrival',
  split_days: 'Split over days',
  two_depots: 'Two depots combined',
};

interface VehicleOptionCardsProps {
  options: QuoteOption[];
  selectedOptionCode?: string | null;
  recommendedOptionCode?: string | null;
  requiredStallSlots?: number;
  onSelect?: (code: string) => void;
}

function formatRestNote(o: QuoteOption, isEn: boolean): string | null {
  const parts: string[] = [];
  if ((o.restStops ?? 0) > 0) {
    parts.push(isEn ? `${o.restStops} rest stop(s)` : `${o.restStops} điểm nghỉ`);
  }
  if ((o.mandatoryRests ?? 0) > 0) {
    parts.push(isEn ? `${o.mandatoryRests} mandatory 24h rest` : `${o.mandatoryRests} lần nghỉ 24h`);
  }
  if (!parts.length) return null;
  return isEn ? `includes ${parts.join(' · ')}` : `đã gồm ${parts.join(' · ')}`;
}

/**
 * Step 9: hiển thị phương án điều xe của báo giá.
 * - Khi chỉ có 1 phương án: hiển thị thanh ngang full-width gọn gàng (tránh khoảng trống 2/3 màn hình).
 * - Khi có 2–3 phương án: chia lưới 2 hoặc 3 cột cân đối để khách chọn phương án phù hợp.
 */
export function VehicleOptionCards({
  options,
  selectedOptionCode,
  recommendedOptionCode,
  requiredStallSlots,
  onSelect,
}: VehicleOptionCardsProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const hasAllocation = options.some((o) => Array.isArray(o.vehicleIds));
  if (!hasAllocation) return null;

  // Single-option clean horizontal layout
  if (options.length === 1) {
    const o = options[0];
    const restNote = formatRestNote(o, isEn);

    return (
      <div className="mb-4 rounded-xl border border-[#DFCA9A] bg-white p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#6D7785]">
                <Truck className="w-3.5 h-3.5 text-[#A67C2E]" aria-hidden="true" />
                {isEn ? 'Assigned Vehicle' : 'Phương tiện bố trí'}
              </span>
              {requiredStallSlots ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FAF8F4] border border-[#E5DDD0] text-[#5B6779]">
                  {isEn ? `${requiredStallSlots} stall(s)` : `${requiredStallSlots} chỗ chuồng`}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-[#181A17]">
              {o.vehicles.map((v, i) => (
                <span key={i}>
                  {v.count} × {v.className || v.classCode}
                  {(v.trips ?? 1) > 1 && (
                    <span className="font-semibold text-[#5B6779]">
                      {' '}
                      · {isEn ? `${v.trips} trips` : `${v.trips} lượt`}
                    </span>
                  )}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5B6779]">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#A67C2E]" aria-hidden="true" />
                {isEn ? 'Pickup' : 'Giờ đón'}:{' '}
                <strong className="text-[#181A17]">{formatLocal(o.pickupAt, isEn)}</strong>
              </span>
              {o.etaHours != null && (
                <span>
                  {isEn ? 'Total journey' : 'Tổng hành trình'}:{' '}
                  <strong className="text-[#181A17]">~{o.etaHours}h</strong>
                  {restNote && <span className="text-[#747D88]"> ({restNote})</span>}
                </span>
              )}
            </div>
          </div>

          <div className="sm:text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EFEBE4]">
            <div className="text-[11px] font-semibold text-[#6D7785]">
              {isEn ? 'Vehicle freight' : 'Cước vận chuyển'}
            </div>
            <div className="text-lg font-black font-mono text-[#A67C2E]">{formatVnd(o.freight.total)}</div>
          </div>
        </div>

        {(o.pickupShifted || o.nightSurcharge || (o.extraDays ?? 0) > 0) && (
          <div className="flex flex-col gap-1.5 pt-1">
            {o.pickupShifted && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <span>
                  {o.shiftReasonVi ||
                    (isEn
                      ? 'Pickup adjusted to an allowed city transit window.'
                      : 'Giờ đón đã được điều chỉnh theo khung giờ lưu thông hợp lệ.')}
                </span>
              </div>
            )}
            {o.nightSurcharge && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#3B3F6B] bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{isEn ? 'Night shift surcharge applied.' : 'Có phụ phí ca đêm.'}</span>
              </div>
            )}
            {(o.extraDays ?? 0) > 0 && (
              <div className="text-[11px] font-semibold text-[#8B6724]">
                {isEn ? `Delivery about ${o.extraDays} day(s) later.` : `Giao chậm khoảng ${o.extraDays} ngày.`}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Multi-option adaptive grid (2 or 3 columns)
  const gridCols = options.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';

  return (
    <fieldset className="mb-4 border-0 p-0 m-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <legend className="text-xs font-bold text-[#6D7785] uppercase tracking-wider p-0">
          {isEn ? 'Choose a vehicle option' : 'Chọn phương án điều xe'}
        </legend>
        {requiredStallSlots ? (
          <span className="text-[11px] font-semibold text-[#5B6779]">
            {isEn ? `Needs ${requiredStallSlots} stall(s)` : `Yêu cầu ${requiredStallSlots} chỗ chuồng`}
          </span>
        ) : null}
      </div>

      <div className={`grid ${gridCols} gap-3`} role="radiogroup">
        {options.map((o) => {
          const selected = (selectedOptionCode || recommendedOptionCode) === o.optionCode;
          const isRecommended = o.recommended || o.optionCode === recommendedOptionCode;
          const restNote = formatRestNote(o, isEn);
          const label = isEn
            ? o.optionCode === 'split_days'
              ? `Split over ${(o.extraDays ?? 0) + 1} days`
              : OPTION_LABEL_EN[o.optionCode] ?? o.label
            : o.labelVi ?? o.label;

          return (
            <label
              key={o.optionCode}
              className={`relative flex flex-col justify-between gap-2.5 p-3.5 rounded-xl border-2 cursor-pointer transition-colors bg-white ${
                selected ? 'border-[#A67C2E] ring-2 ring-[#A67C2E]/20' : 'border-[#E5DDD0] hover:border-[#C4B38E]'
              }`}
            >
              <input
                type="radio"
                name="vehicle-option"
                value={o.optionCode}
                checked={selected}
                onChange={() => onSelect?.(o.optionCode)}
                className="sr-only"
              />

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {selected && <CheckCircle2 className="w-4 h-4 text-[#A67C2E] shrink-0" aria-hidden="true" />}
                    <span className="text-sm font-bold text-[#181A17]">{label}</span>
                  </div>
                  {isRecommended && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#287653] text-white shrink-0">
                      {isEn ? 'Recommended' : 'Đề xuất'}
                    </span>
                  )}
                </div>

                <ul className="m-0 p-0 list-none flex flex-col gap-1 text-xs text-[#5B6779]">
                  {o.vehicles.map((v, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Truck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#A67C2E]" aria-hidden="true" />
                      <span>
                        <strong className="text-[#181A17]">
                          {v.count} × {v.className || v.classCode}
                        </strong>
                        {(v.trips ?? 1) > 1 && <> · {isEn ? `${v.trips} trips` : `${v.trips} lượt`}</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#EFEBE4]">
                <div className="text-lg font-black font-mono text-[#A67C2E]">{formatVnd(o.freight.total)}</div>
                <div className="flex flex-col gap-0.5 text-[11px] text-[#5B6779]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#A67C2E]" aria-hidden="true" />
                    {isEn ? 'Pickup' : 'Đón'}:{' '}
                    <strong className="text-[#181A17]">{formatLocal(o.pickupAt, isEn)}</strong>
                  </span>
                  {o.etaHours != null && (
                    <span>
                      {isEn ? 'Total journey' : 'Tổng hành trình'}:{' '}
                      <strong className="text-[#181A17]">~{o.etaHours}h</strong>
                      {restNote && <span className="text-[#747D88]"> ({restNote})</span>}
                    </span>
                  )}
                </div>

                {o.pickupShifted && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                    <span>
                      {o.shiftReasonVi ||
                        (isEn
                          ? 'Pickup adjusted to an allowed city transit window.'
                          : 'Giờ đón đã được điều chỉnh theo khung giờ lưu thông hợp lệ.')}
                    </span>
                  </div>
                )}
                {o.nightSurcharge && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#3B3F6B] bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                    <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{isEn ? 'Night shift surcharge applied.' : 'Có phụ phí ca đêm.'}</span>
                  </div>
                )}
                {(o.extraDays ?? 0) > 0 && (
                  <div className="text-[11px] text-[#8B6724]">
                    {isEn ? `Delivery about ${o.extraDays} day(s) later.` : `Giao chậm khoảng ${o.extraDays} ngày.`}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface ShortageBlockProps {
  shortage: QuoteShortage;
  onPickDate?: (date: string) => void;
}

/** Step 9: không đủ xe trong ngày đã chọn → gợi ý các ngày gần nhất có đủ xe. */
export function VehicleShortageBlock({ shortage, onPickDate }: ShortageBlockProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  return (
    <div className="rounded-2xl border-2 border-[#E5B8B8] bg-[#FDF5F5] p-5 flex flex-col gap-3" role="alert">
      <div className="flex items-center gap-2 text-sm font-bold text-[#8A2C2C]">
        <CalendarClock className="w-5 h-5" aria-hidden="true" />
        {isEn ? 'Not enough vehicles on this date' : 'Chưa đủ xe ngày này'}
      </div>
      <p className="m-0 text-xs text-[#5B6779]">
        {isEn
          ? `We are short of ${shortage.slots} stall slot(s) for the requested time. Choose one of the nearest dates with enough vehicles:`
          : `Còn thiếu ${shortage.slots} chỗ chuồng cho thời gian bạn chọn. Chọn nhanh một ngày gần nhất có đủ xe:`}
      </p>
      {shortage.suggestedDates.length ? (
        <div className="flex flex-wrap gap-2">
          {shortage.suggestedDates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onPickDate?.(d)}
              className="px-3 py-1.5 rounded-lg border border-[#A67C2E] text-[#A67C2E] hover:bg-[#A67C2E] hover:text-white text-xs font-bold cursor-pointer transition-colors bg-white"
            >
              {d.split('-').reverse().join('/')}
            </button>
          ))}
        </div>
      ) : (
        <p className="m-0 text-xs text-[#8A2C2C]">
          {isEn
            ? 'No date with enough vehicles in the next 14 days. Please contact us.'
            : 'Không có ngày nào đủ xe trong 14 ngày tới. Vui lòng liên hệ Quản lý vận hành.'}
        </p>
      )}
    </div>
  );
}
