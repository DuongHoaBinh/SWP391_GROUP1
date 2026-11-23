'use client';

import React from 'react';
import { AlertTriangle, CalendarClock, Clock, Moon, Truck } from 'lucide-react';
import type { QuoteOption, QuoteShortage } from '../quote-api';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const formatVnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';

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

/**
 * Step 9: các phương án xe của báo giá (Rẻ nhất · Ít xe nhất · Đến sớm nhất · Chia ngày · Ghép 2 trạm).
 * Trả lời trực tiếp câu hỏi "3 ngựa mà xe chỉ chở 1 thì sao".
 */
export function VehicleOptionCards({ options, selectedOptionCode, recommendedOptionCode, requiredStallSlots, onSelect }: VehicleOptionCardsProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const hasAllocation = options.some((o) => Array.isArray(o.vehicleIds));
  if (!hasAllocation) return null;

  return (
    <fieldset className="mb-4 border-0 p-0 m-0">
      <legend className="text-xs font-bold text-[#6D7785] uppercase tracking-wider mb-1.5">
        {isEn ? 'Vehicle options' : 'Phương án xe'}
      </legend>
      <p className="m-0 mb-3 text-xs text-[#5B6779] leading-relaxed">
        {isEn
          ? `Your horses need ${requiredStallSlots ?? '?'} stall slot(s) (a horse needing a private stall takes 2). If one vehicle cannot carry them all, we combine several vehicles or split the trip over several days — pick the option that suits you.`
          : `Đơn cần ${requiredStallSlots ?? '?'} chỗ chuồng (ngựa cần chuồng riêng tính 2 chỗ). Nếu một xe không chở hết, hệ thống ghép nhiều xe hoặc chia nhiều lượt — chọn phương án phù hợp với bạn.`}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup">
        {options.map((o) => {
          const selected = (selectedOptionCode || recommendedOptionCode) === o.optionCode;
          const isRecommended = o.recommended || o.optionCode === recommendedOptionCode;
          const label = isEn
            ? o.optionCode === 'split_days'
              ? `Split over ${(o.extraDays ?? 0) + 1} days`
              : OPTION_LABEL_EN[o.optionCode] ?? o.label
            : o.labelVi ?? o.label;
          return (
            <label
              key={o.optionCode}
              className={`relative flex flex-col gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition-colors bg-white ${
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
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold text-[#181A17]">{label}</span>
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
                      <br />
                      {v.depotName} · {isEn ? 'empty run' : 'chạy rỗng'} {v.deadheadKm ?? 0} km
                    </span>
                  </li>
                ))}
              </ul>
              <div className="text-lg font-black font-mono text-[#A67C2E]">{formatVnd(o.freight.total)}</div>
              <div className="flex flex-col gap-1 text-[11px] text-[#5B6779]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {isEn ? 'Pickup' : 'Đón'}: <strong className="text-[#181A17]">{formatLocal(o.pickupAt, isEn)}</strong>
                </span>
                <span>
                  ETA ≈ {o.etaHours ?? '—'}h · {isEn ? 'rest stops' : 'điểm nghỉ'}: {o.restStops ?? 0}
                  {(o.mandatoryRests ?? 0) > 0 && <> · {isEn ? 'mandatory 24h rest' : 'nghỉ bắt buộc 24h'}: {o.mandatoryRests}</>}
                </span>
              </div>
              {o.pickupShifted && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                  <span>{o.shiftReasonVi || (isEn ? 'Pickup moved out of the city truck-ban window.' : 'Giờ đón đã được dời khỏi giờ cấm xe tải.')}</span>
                </div>
              )}
              {o.nightSurcharge && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#3B3F6B] bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                  <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{isEn ? 'Night surcharge applied (city truck ban).' : 'Có phụ phí ca đêm (do giờ cấm xe tải nội đô).'}</span>
                </div>
              )}
              {(o.extraDays ?? 0) > 0 && (
                <div className="text-[11px] text-[#8B6724]">
                  {isEn ? `Delivery about ${o.extraDays} day(s) later.` : `Giao chậm khoảng ${o.extraDays} ngày.`}
                </div>
              )}
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
          {isEn ? 'No date with enough vehicles in the next 14 days. Please contact us.' : 'Không có ngày nào đủ xe trong 14 ngày tới. Vui lòng liên hệ bộ phận điều phối.'}
        </p>
      )}
    </div>
  );
}
