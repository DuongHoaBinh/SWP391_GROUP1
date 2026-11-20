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
  const isShared = (bookingType ?? 'shared_stall') === 'shared_stall';

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

  return (
    <div
      className="space-y-3 rounded-2xl border border-[#D8CEBE] bg-white p-5 shadow-sm"
      aria-label={t('booking.summaryAriaLabel', 'Hình thức đặt chỗ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E2D8] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isShared ? '🟢' : '🔵'}</span>
          <div>
            <h4 className="text-sm font-bold text-[#181A17]">{bookingDisplayName}</h4>
            <p className="text-xs text-[#5B6779]">
              {isShared
                ? t('booking.summarySharedSub', 'Dịch vụ ghép chuồng theo hành lang · Đặt trước ≥ 7 ngày · Chốt sổ trước 72h')
                : t('booking.summaryCharterSub', 'Dịch vụ bao trọn xe chuyên dụng · Chạy thẳng độc quyền · Lịch trình linh hoạt')}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#FAF8F4] border border-[#D8CEBE] px-3 py-1 text-xs font-semibold text-[#181A17]">
          {t('booking.horsesAndStallsCount', '{count} ngựa ({count} ô chuồng)', { count: horseCount })}
        </span>
      </div>

      <div className="rounded-lg bg-[#FAF8F4] border border-[#E8E2D8] p-3 text-sm text-[#181A17]">
        {isShared ? (
          stallUnitPrice == null ? (
            <p className="text-xs leading-relaxed text-[#5B6779]">
              {t('booking.awaitingStallQuotePrefix', 'Đơn hàng đang chờ quản lý duyệt báo giá theo từng ô chuồng. Cước = ')}{' '}
              <span className="font-semibold text-[#181A17]">
                {t('booking.stallUnitFormula', 'Đơn giá 1 ô × {count} ngựa', { count: horseCount })}
              </span>.
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#5B6779]">{t('booking.baseStallFreightLabel', 'Cước cơ bản theo ô chuồng:')}</span>
              <span className="font-semibold text-[#181A17]">
                {vnd(stallUnitPrice)} / {t('booking.perStallUnit', 'ô')} × {horseCount} {t('common.horsesUnit', 'ngựa')} = <strong className="text-[#A67C2E]">{vnd(stallUnitPrice * horseCount)}</strong>
              </span>
            </div>
          )
        ) : (
          <p className="text-xs text-[#5B6779]">
            {t('booking.charterFlatSummaryDesc', 'Giá trọn gói riêng cho đoàn {count} ngựa. Không đón/trả phụ, ưu tiên tuyến thẳng.', { count: horseCount })}
          </p>
        )}
      </div>

      {/* CONSOLIDATION TIMELINE TRACKER (FOR SHARED STALL) */}
      {isShared && (
        <div className="mt-3 rounded-xl border border-[#C4B38E]/50 bg-[#FAF8F4] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#181A17] flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[#A67C2E]" />
              {t('booking.consolidationSlaHeader', 'Tiến độ Ghép chuồng & Chốt lộ trình (Consolidation SLA)')}
            </span>
            {departureDate && (
              <span className="text-[11px] font-semibold text-[#A67C2E]">
                {t('booking.expectedDeparture', 'Ngày đi dự kiến')}: {departureDate}
              </span>
            )}
          </div>

          {/* Stepper Visual */}
          <div className={`mt-3 grid gap-2 text-center text-[11px] ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-5'}`}>
            <div className={`min-w-0 break-words leading-snug rounded-md p-2 border transition-all ${
              activeStep > 1
                ? 'border-[#2D5A3F]/40 bg-[#E8F2EB] text-[#2D5A3F]'
                : activeStep === 1
                ? 'border-[#181A17] bg-white shadow-sm font-bold text-[#181A17]'
                : 'border-[#D8CEBE] bg-white/70 text-[#5B6779]'
            }`}>
              <div className="font-semibold">{t('booking.step1Label', '1. Đặt chỗ')}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{t('booking.step1Timing', 'Trước ≥ 7 ngày')}</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 1 ? t('booking.stepDoneCreated', '✓ Đã tạo') : activeStep === 1 ? t('booking.stepProcessing', '● Đang xử lý') : t('booking.stepWaiting', 'Chờ')}
              </div>
            </div>

            <div className={`min-w-0 break-words leading-snug rounded-md p-2 border transition-all ${
              activeStep > 2
                ? 'border-[#2D5A3F]/40 bg-[#E8F2EB] text-[#2D5A3F]'
                : activeStep === 2
                ? 'border-[#181A17] bg-white shadow-sm font-bold text-[#181A17]'
                : 'border-[#D8CEBE] bg-white/70 text-[#5B6779]'
            }`}>
              <div className="font-semibold">{t('booking.step2Label', '2. Hồ sơ thú y')}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{t('booking.step2Timing', 'Trước ≥ 5 ngày')}</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 2 ? t('booking.stepDoneValid', '✓ Hợp lệ') : activeStep === 2 ? t('booking.stepReviewing', '● Thẩm định') : t('booking.stepWaiting', 'Chờ')}
              </div>
            </div>

            <div className={`min-w-0 break-words leading-snug rounded-md p-2 border transition-all ${
              activeStep > 3
                ? 'border-[#2D5A3F]/40 bg-[#E8F2EB] text-[#2D5A3F]'
                : activeStep === 3
                ? 'border-[#181A17] bg-white shadow-sm font-bold text-[#181A17]'
                : 'border-[#D8CEBE] bg-white/70 text-[#5B6779]'
            }`}>
              <div className="font-semibold">{t('booking.step3Label', '3. Chốt sổ tuyến')}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{t('booking.step3Timing', 'Trước 72h (D-3)')}</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 3 ? t('booking.stepDoneLocked', '✓ Đã chốt') : activeStep === 3 ? t('booking.stepConsolidating', '● Đang gom xe') : t('booking.stepWaiting', 'Chờ')}
              </div>
            </div>

            <div className={`min-w-0 break-words leading-snug rounded-md p-2 border transition-all ${
              activeStep > 4
                ? 'border-[#2D5A3F]/40 bg-[#E8F2EB] text-[#2D5A3F]'
                : activeStep === 4
                ? 'border-[#181A17] bg-white shadow-sm font-bold text-[#181A17]'
                : 'border-[#D8CEBE] bg-white/70 text-[#5B6779]'
            }`}>
              <div className="font-semibold">{t('booking.step4Label', '4. Thanh toán')}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{t('booking.step4Timing', 'Trước 24h')}</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 4 ? t('booking.stepDonePaid', '✓ Đã thanh toán') : activeStep === 4 ? t('booking.stepScanSepay', '● Quét SePay') : t('booking.stepWaiting', 'Chờ')}
              </div>
            </div>

            <div className={`min-w-0 break-words leading-snug rounded-md p-2 border transition-all ${compact ? 'col-span-2 sm:col-span-1' : 'col-span-2 md:col-span-1'} ${
              activeStep === 5
                ? 'border-[#2D5A3F] bg-[#E8F2EB] font-bold text-[#2D5A3F]'
                : 'border-[#D8CEBE] bg-white/70 text-[#5B6779]'
            }`}>
              <div className="font-semibold">{t('booking.step5Label', '5. Khởi hành')}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{t('booking.step5Timing', 'Ngày D')}</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep === 5 ? t('booking.stepRunning', '● Đang chạy') : t('booking.stepWaiting', 'Chờ')}
              </div>
            </div>
          </div>

          {/* Contextual Status Guidance */}
          <div className="mt-3 text-xs text-[#181A17]">
            {activeStep === 1 && (
              <p>{t('booking.guidanceStep1', '💡 Đơn hàng đã ghi nhận. Vui lòng hoàn tất nộp giấy tờ tiêm phòng và xét nghiệm máu của ngựa trước ngày khởi hành tối thiểu 5 ngày.')}</p>
            )}
            {activeStep === 2 && (
              <p>{t('booking.guidanceStep2', '📋 Đơn hàng đã được duyệt sơ bộ. Chuyên viên đang hoàn thiện hồ sơ xin kiểm dịch thú y liên tỉnh.')}</p>
            )}
            {activeStep === 3 && (
              <p>{t('booking.guidanceStep3', '🚚 Điều phối viên đang gom đơn ghép tuyến & sắp xếp ô chuồng. Lộ trình đón/trả và hóa đơn sẽ được xác nhận chậm nhất trước giờ chạy 72 giờ.')}</p>
            )}
            {activeStep === 4 && (
              <p>{t('booking.guidanceStep4', '💳 Lộ trình đã được chốt thành công! Quý khách vui lòng quét mã QR SePay bên dưới để thanh toán và khóa slot chuồng trước giờ xuất phát.')}</p>
            )}
            {activeStep === 5 && (
              <p>{t('booking.guidanceStep5', '🏁 Chuyến đi đã sẵn sàng hoặc đang lăn bánh đón/trả ngựa theo lộ trình multi-stop.')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function BookingQuoteSummary({ input, bookingType, horseCount, currency, insuranceFee }: {
  input: string; bookingType?: BookingType; horseCount: number; currency: 'VND' | 'USD'; insuranceFee: number;
}) {
  const { t } = useLanguage();
  const quote = previewBookingQuote(input, bookingType ?? 'shared_stall', horseCount, currency);
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
  transportMode: 'road' | 'air';
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

  const modeBadgeLabel = isEn
    ? `${isAir ? 'Air Cargo' : 'Overland Road'} · ${isCharter ? 'Dedicated Charter' : 'Shared Stall'}`
    : `${isAir ? 'Hàng không' : 'Đường bộ'} · ${isCharter ? 'Bao trọn chuyến' : 'Ghép ô chuồng'}`;

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
