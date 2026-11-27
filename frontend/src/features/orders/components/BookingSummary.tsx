'use client';

import {
  bookingName,
  previewBookingQuote,
  suggestManagerFreightQuote,
  type BookingType,
  type ManagerFreightSuggestion,
} from '../booking-policy';
import { vnd } from '../insurance-policy';
import { CostSummary } from './InsuranceSummary';
import { Clock } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function BookingSummary({
  bookingType,
  horseCount,
  stallUnitPrice,
  status,
  departureDate,
  compact = false,
}: {
  bookingType?: BookingType;
  horseCount: number;
  stallUnitPrice?: number | null;
  status?: string;
  departureDate?: string;
  compact?: boolean;
}) {
  const { t, language } = useLanguage();
  const isShared = (bookingType ?? 'dedicated_charter') === 'shared_stall';

  let activeStep = 1;
  const normalizedStatus = (status || '').toLowerCase();

  if (['ready_to_depart', 'in_transit', 'delivered', 'completed'].includes(normalizedStatus)) {
    activeStep = 5;
  } else if (['invoiced', 'route_approved', 'confirmed'].includes(normalizedStatus)) {
    activeStep = 4;
  } else if (['planning', 'pending_approval'].includes(normalizedStatus)) {
    activeStep = 3;
  } else if (['approved'].includes(normalizedStatus)) {
    activeStep = 2;
  } else {
    activeStep = 1;
  }

  const bookingDisplayName = language === 'en'
    ? (isShared ? 'Shared Stall' : 'Dedicated Charter')
    : bookingName(bookingType);

  if (!isShared) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] px-4 py-3 text-xs"
        aria-label={t('booking.summaryAriaLabel', 'Hình thức đặt chỗ')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[#181A17]">{bookingDisplayName}</span>
          <span className="text-[#5B6779]">
            · {language === 'en' ? `Flat charter rate for ${horseCount} horse(s)` : `Giá trọn gói riêng cho đoàn ${horseCount} ngựa`}
          </span>
        </div>
        <span className="rounded-full bg-white border border-[#D8CEBE] px-2.5 py-0.5 font-semibold text-[#181A17]">
          {horseCount} {language === 'en' ? (horseCount === 1 ? 'horse' : 'horses') : 'ngựa'}
        </span>
      </div>
    );
  }

  return (
    <div
      className="space-y-2.5 rounded-2xl border border-[#D8CEBE] bg-white p-4 shadow-sm"
      aria-label={t('booking.summaryAriaLabel', 'Hình thức đặt chỗ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-[#181A17] m-0">{bookingDisplayName}</h4>
        <span className="rounded-full bg-[#FAF8F4] border border-[#D8CEBE] px-2.5 py-0.5 text-xs font-semibold text-[#181A17]">
          {t('booking.horsesAndStallsCount', '{count} ngựa ({count} ô chuồng)', { count: horseCount })}
        </span>
      </div>

      {stallUnitPrice != null && (
        <div className="flex items-center justify-between rounded-lg bg-[#FAF8F4] border border-[#E8E2D8] px-3 py-2 text-xs text-[#181A17]">
          <span className="text-[#5B6779]">{t('booking.baseStallFreightLabel', 'Cước theo ô chuồng:')}</span>
          <span className="font-semibold">
            {vnd(stallUnitPrice)} × {horseCount} = <strong className="text-[#A67C2E]">{vnd(stallUnitPrice * horseCount)}</strong>
          </span>
        </div>
      )}

      {departureDate && (
        <div className="flex items-center gap-1.5 text-xs text-[#5B6779]">
          <Clock className="h-3.5 w-3.5 text-[#A67C2E]" />
          <span>{t('booking.expectedDeparture', 'Ngày đi dự kiến')}: <strong className="text-[#181A17]">{departureDate}</strong></span>
        </div>
      )}
    </div>
  );
}

export function BookingQuoteSummary({ input, bookingType, horseCount, currency, insuranceFee }: {
  input: string; bookingType?: BookingType; horseCount: number; currency: 'VND' | 'USD'; insuranceFee: number;
}) {
  const { t } = useLanguage();
  const quote = previewBookingQuote(input, bookingType ?? 'dedicated_charter', horseCount, currency);
  return (
    <div className="space-y-3">
      <BookingSummary compact bookingType={bookingType} horseCount={horseCount} stallUnitPrice={bookingType === 'dedicated_charter' || quote.error ? null : quote.unit} />
      <CostSummary transportCost={quote.error ? null : quote.freight} insuranceFee={insuranceFee} />
      {quote.error && <p role="alert" className="text-sm text-[#9E3B3B]">{quote.error}</p>}
      {!quote.error && quote.freight + insuranceFee > 9999999999999 && (
        <p role="alert" className="text-sm text-[#9E3B3B]">
          {t('booking.totalOverflowError', 'Tổng cước và bảo hiểm vượt giới hạn đơn hàng.')}
        </p>
      )}
    </div>
  );
}

export function ManagerFreightSuggestionCard({
  transportMode,
  bookingType,
  horseCount,
  distanceKm,
  customsCount,
  usdToVndRate = 25400,
  currentInput,
  currency = 'VND',
  onApplySuggestion,
}: {
  transportMode: 'road' | 'air' | 'sea';
  bookingType?: BookingType;
  horseCount: number;
  distanceKm: number;
  customsCount?: number;
  usdToVndRate?: number;
  currentInput?: string;
  currency?: 'VND' | 'USD';
  onApplySuggestion?: (suggestion: ManagerFreightSuggestion) => void;
}) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const suggestion = suggestManagerFreightQuote({
    transportMode,
    bookingType,
    horseCount,
    distanceKm,
    customsCount,
    usdToVndRate,
  });

  const isCharter = suggestion.bookingType === 'dedicated_charter';
  const isAir = suggestion.transportMode === 'air';
  const isSea = suggestion.transportMode === 'sea';

  const modeBadgeLabel = isEn
    ? `${isSea ? 'Sea Freight' : isAir ? 'Air Cargo' : 'Overland Road'} · ${isCharter ? 'Dedicated Charter' : 'Shared Stall'}`
    : `${isSea ? 'Đường thủy' : isAir ? 'Hàng không' : 'Đường bộ'} · ${isCharter ? 'Bao trọn chuyến' : 'Ghép ô chuồng'}`;

  const currentNumeric = Number(currentInput || 0);
  const targetInput = currency === 'USD' ? suggestion.suggestedInputUsd : suggestion.suggestedInputVnd;
  const isDiffFromSuggested =
    !Number.isFinite(currentNumeric) || Math.abs(currentNumeric - targetInput) > (currency === 'USD' ? 0.5 : 1000);

  return (
    <div className="rounded-xl border border-[#D4C5A3] bg-[#FAF6EC] p-3.5 text-xs text-[#181A17] space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A591C]">
            {isEn ? 'Suggested Freight Basis' : 'Cơ sở gợi ý cước vận chuyển'}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[#181A17] text-[#F8F0DF] text-[10.5px] font-bold">
            {modeBadgeLabel}
          </span>
        </div>

        {onApplySuggestion && isDiffFromSuggested && (
          <button
            type="button"
            onClick={() => onApplySuggestion(suggestion)}
            className="px-2.5 py-1 rounded-lg bg-[#A67C2E] hover:bg-[#8E6823] text-white text-[11px] font-bold cursor-pointer transition-colors"
          >
            {isEn ? 'Apply Suggested Price' : 'Áp dụng mức gợi ý'}
          </button>
        )}
      </div>

      <p className="text-[11.5px] font-semibold text-[#5C6658] m-0">
        {isEn ? suggestion.capacityBlockLabelEn : suggestion.capacityBlockLabelVi}
      </p>

      <div className="rounded-lg bg-white/90 border border-[#E5DDD0] p-2.5 space-y-1.5">
        {suggestion.breakdown.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-3 text-[11.5px]">
            <span className="text-[#5C6658]">• {isEn ? item.labelEn : item.labelVi}</span>
            <strong className="text-[#181A17] whitespace-nowrap">{vnd(item.amountVnd)}</strong>
          </div>
        ))}

        <div className="pt-1.5 mt-1 border-t border-[#EAE5DA] flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-[#181A17]">
            {isCharter
              ? isEn
                ? 'Suggested Flat Charter Freight:'
                : 'Cước bao trọn chuyến gợi ý:'
              : isEn
              ? `Suggested Per-Stall Price (× ${suggestion.horseCount} horses):`
              : `Đơn giá 1 ô gợi ý (× ${suggestion.horseCount} ngựa):`}
          </span>
          <div className="text-right">
            {!isCharter && suggestion.suggestedUnitVnd != null && (
              <span className="text-[11px] font-semibold text-[#7A591C] mr-1.5">
                {vnd(suggestion.suggestedUnitVnd)}/{isEn ? 'stall' : 'ô'} →
              </span>
            )}
            <strong className="text-sm font-black text-[#A67C2E]">
              {vnd(suggestion.suggestedTotalFreightVnd)}
            </strong>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C6658] pt-0.5">
        <span>
          {isEn ? 'Est. internal operating cost:' : 'Chi phí vận hành nội bộ ước tính:'}{' '}
          <strong className="text-[#181A17]">{vnd(suggestion.suggestedOperatingCostVnd)}</strong>{' '}
          <span className="text-[#287653] font-bold">
            (~{suggestion.estimatedMarginPct}% {isEn ? 'gross margin' : 'biên gộp'})
          </span>
        </span>
        <span>
          {isCharter
            ? isEn
              ? `Compare Shared Stall (${suggestion.horseCount} stalls): ${vnd(suggestion.alternateBookingFreightVnd)}`
              : `Đối chiếu nếu Ghép ô (${suggestion.horseCount} ô): ${vnd(suggestion.alternateBookingFreightVnd)}`
            : isEn
            ? `Compare Dedicated Charter: ${vnd(suggestion.alternateBookingFreightVnd)}`
            : `Đối chiếu nếu Bao trọn chuyến: ${vnd(suggestion.alternateBookingFreightVnd)}`}
        </span>
      </div>
    </div>
  );
}
