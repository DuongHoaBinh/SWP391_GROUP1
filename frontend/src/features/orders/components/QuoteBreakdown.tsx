'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Truck,
  Plane,
  Ship,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ReceiptText,
} from 'lucide-react';
import { QuoteLeg, QuoteResult } from '../quote-api';
import { VehicleOptionCards, VehicleShortageBlock } from './VehicleOptionCards';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface QuoteBreakdownProps {
  quote: QuoteResult | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  selectedOptionCode?: string;
  onSelectOptionCode?: (code: string) => void;
  /** Step 9: khách bấm chọn nhanh một ngày gợi ý khi thiếu xe */
  onPickShortageDate?: (date: string) => void;
  /** Demo payment override (VND string; empty = use calculated quote total) */
  demoPaymentAmount?: string;
  onDemoPaymentAmountChange?: (value: string) => void;
}

function getSourceBadge(source: QuoteLeg['source'], isEn: boolean) {
  if (source === 'ors' || source === 'osrm') {
    return {
      label: isEn ? 'Real road route' : 'Đường bộ thực tế',
      className: 'bg-emerald-100 text-emerald-800',
    };
  }
  if (source === 'air') {
    return {
      label: isEn ? 'Airport airway' : 'Đường bay sân bay',
      className: 'bg-sky-100 text-sky-800',
    };
  }
  if (source === 'table') {
    return {
      label: isEn ? 'Sea corridor' : 'Hải trình chuẩn',
      className: 'bg-sky-100 text-sky-800',
    };
  }
  return {
    label: isEn ? 'Estimated' : 'Ước lượng',
    className: 'bg-amber-100 text-amber-800',
  };
}

function getLegTimePrefix(mode: QuoteResult['transportMode'], legKey: string, isEn: boolean) {
  if (mode === 'air' && legKey === 'flight') return isEn ? 'Flight' : 'Bay';
  if (mode === 'sea' && legKey === 'sea') return isEn ? 'Voyage' : 'Tàu';
  return isEn ? 'Driving' : 'Chạy xe';
}

export function QuoteBreakdown({
  quote,
  isLoading,
  onRefresh,
  selectedOptionCode,
  onSelectOptionCode,
  onPickShortageDate,
  demoPaymentAmount,
  onDemoPaymentAmountChange,
}: QuoteBreakdownProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number; isExpired: boolean }>({
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!quote?.expiresAt) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(quote.expiresAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0, isExpired: true });
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ minutes, seconds, isExpired: false });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [quote?.expiresAt]);

  if (isLoading && !quote) {
    return (
      <div className="p-6 rounded-2xl border border-[#D8CEBE] bg-[#FDFCFB] flex flex-col items-center justify-center gap-3 text-center animate-pulse">
        <RefreshCw className="w-8 h-8 text-[#A67C2E] animate-spin" />
        <p className="text-sm font-semibold text-[#181A17] m-0">
          {isEn ? 'Calculating transport quotation...' : 'Đang tính khoảng cách thực tế và báo giá...'}
        </p>
        <p className="text-xs text-[#5B6779] m-0">
          {isEn
            ? 'Evaluating real route distance, vehicle options & insurance'
            : 'Đối chiếu tuyến đường thực tế, phương tiện khả dụng và bảo hiểm'}
        </p>
      </div>
    );
  }

  if (!quote) return null;

  // Step 9: không có phương án xe → khối "Chưa đủ xe ngày này"
  if (!quote.options.length && quote.shortage) {
    return <VehicleShortageBlock shortage={quote.shortage} onPickDate={onPickShortageDate} />;
  }

  const activeOption =
    quote.options.find((o) => o.optionCode === (selectedOptionCode || quote.recommendedOptionCode)) ||
    quote.options[0];

  const formatVnd = (num: number) => `${num.toLocaleString('vi-VN')}\u00A0đ`;
  const isAllocated = Array.isArray(activeOption?.vehicleIds);
  const selectedFreightTotal = activeOption?.freight?.total ?? 0;
  const selectedOutboundTotal = activeOption?.outboundFreightTotal ?? quote.outbound?.freight.total ?? 0;
  const grandTotal = isAllocated ? selectedFreightTotal + (quote.insurance?.total || 0) : quote.total;

  return (
    <div
      className={`rounded-2xl border-2 border-[#A67C2E]/40 bg-[#FAF8F4] overflow-hidden shadow-sm ${
        isLoading ? 'opacity-75 transition-opacity' : ''
      }`}
    >
      {/* Header with quote code and lock countdown */}
      <div className="px-5 py-3.5 bg-[#F0EBE0] border-b border-[#D8CEBE] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="w-4 h-4 text-[#A67C2E]" aria-hidden="true" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#181A17]">
            {isEn ? 'Transport Quotation' : 'Báo giá vận chuyển'}
          </span>
          {quote.quoteId != null && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E5DDD0] font-mono font-bold text-[#5F6977]">
              #{quote.quoteId}
            </span>
          )}
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-2">
          {timeLeft.isExpired ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#B33E3E] bg-[#F8EAEA] px-2.5 py-1 rounded-lg border border-[#E5B8B8] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {isEn ? 'Quote expired' : 'Báo giá đã hết hạn'}
              </span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-3 py-1 rounded-lg bg-[#A67C2E] hover:bg-[#8B6724] text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  {isEn ? 'Refresh quote' : 'Cập nhật giá'}
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs font-semibold text-[#5F6977] flex items-center gap-1.5 bg-white/80 px-3 py-1 rounded-lg border border-[#D8CEBE]">
              <Clock className="w-3.5 h-3.5 text-[#A67C2E]" />
              <span>{isEn ? 'Price held for:' : 'Giữ giá trong:'}</span>
              <span className="font-mono font-bold text-[#181A17]">
                {String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Warnings */}
      {quote.warnings?.includes('SEA_VESSEL_HEALTH_RISK') && (
        <div className="mx-5 mt-4 p-3.5 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-3 text-xs text-amber-900 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>{isEn ? 'Health Risk Advisory: ' : 'Lưu ý sức khỏe ngựa: '}</strong>
            {isEn
              ? 'Sea transport by cargo vessel takes significantly longer and carries higher equine health risks. Air transport is recommended for high-value racehorses.'
              : 'Đường thủy có thời gian di chuyển dài hơn và rủi ro sức khỏe cao hơn. Khuyến nghị đường hàng không cho ngựa đua giá trị cao.'}
          </div>
        </div>
      )}

      {quote.warnings?.includes('NO_PARTNER_DEPOT') && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900">
          {isEn
            ? 'No partner depot within 300 km of the destination: the final road leg is priced with the standard tariff.'
            : 'Không có trạm đối tác trong 300 km quanh điểm giao: chặng bộ cuối áp dụng bảng giá chuẩn.'}
        </div>
      )}

      {(quote.partnerDepot || quote.jetStallsRequired || quote.vesselPens) && (
        <div className="mx-5 mt-4 flex flex-wrap gap-2 text-[11px]">
          {quote.jetStallsRequired ? (
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-semibold">
              {isEn ? `${quote.jetStallsRequired} air jet stall(s)` : `${quote.jetStallsRequired} khoang bay (jet stall)`}
            </span>
          ) : null}
          {quote.vesselPens ? (
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-semibold">
              {isEn ? `${quote.vesselPens} vessel pen(s)` : `${quote.vesselPens} ô chuồng trên tàu`}
            </span>
          ) : null}
          {quote.partnerDepot && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
              {isEn ? 'Final delivery partner: ' : 'Đối tác giao chặng cuối: '}
              {quote.partnerDepot.name}
            </span>
          )}
        </div>
      )}

      {/* Route Legs Summary (Authoritative mode-specific distances) */}
      <div className="p-5 border-b border-[#E5DDD0]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="text-xs font-bold text-[#6D7785] uppercase tracking-wider">
            {isEn ? 'Route Segments & Distance' : 'Chặng vận chuyển & quãng đường'}
          </div>
          {quote.tripType === 'round_trip' && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E5DDD0] text-[#181A17]">
              {isEn ? 'Round-trip (Outbound + Return)' : 'Khứ hồi (Chặng đi + Chặng về)'}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {quote.legs?.map((leg, i) => {
            const sourceBadge = getSourceBadge(leg.source, isEn);
            const timePrefix = getLegTimePrefix(quote.transportMode, leg.key, isEn);
            return (
              <div
                key={i}
                className="p-3 rounded-xl bg-white/90 border border-[#E5DDD0] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {leg.direction === 'return' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                      {isEn ? 'Return' : 'Chặng về'}
                    </span>
                  ) : leg.direction === 'outbound' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                      {isEn ? 'Outbound' : 'Chặng đi'}
                    </span>
                  ) : null}
                  {quote.transportMode === 'air' && leg.key === 'flight' ? (
                    <Plane className="w-4 h-4 text-[#A67C2E] shrink-0" />
                  ) : quote.transportMode === 'sea' && leg.key === 'sea' ? (
                    <Ship className="w-4 h-4 text-[#A67C2E] shrink-0" />
                  ) : (
                    <Truck className="w-4 h-4 text-[#287653] shrink-0" />
                  )}
                  <span className="font-semibold text-[#181A17]">
                    {leg.from} → {leg.to}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] shrink-0">
                  <span className="font-bold text-[#181A17]">{leg.distanceKm.toLocaleString('vi-VN')} km</span>
                  <span className="font-sans text-[#5F6977]">
                    ({timePrefix} ~{leg.durationHours}h)
                  </span>
                  <span className={`px-2 py-0.5 rounded-md font-sans text-[10px] font-bold ${sourceBadge.className}`}>
                    {sourceBadge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vehicle Option & Itemized Cost Breakdown */}
      <div className="p-5">
        <VehicleOptionCards
          options={quote.options}
          selectedOptionCode={selectedOptionCode}
          recommendedOptionCode={quote.recommendedOptionCode}
          requiredStallSlots={quote.requiredStallSlots}
          onSelect={onSelectOptionCode}
        />

        {/* Fallback vehicle label when allocation options are not present */}
        {!isAllocated && activeOption?.vehicles && (
          <div className="mb-4 p-3 rounded-xl bg-white border border-[#E5DDD0] text-xs flex items-center justify-between">
            <span className="text-[#5B6779]">{isEn ? 'Assigned vehicle:' : 'Phương tiện bố trí:'}</span>
            <span className="font-bold text-[#181A17]">{activeOption.label}</span>
          </div>
        )}

        {/* Itemized Freight Table Header + Toggle */}
        {activeOption?.freight?.lines && activeOption.freight.lines.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-[#6D7785] uppercase tracking-wider">
                {isEn ? 'Freight Breakdown' : 'Bảng kê chi tiết cước phí'}
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs font-semibold text-[#A67C2E] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {showDetails ? (isEn ? 'Hide breakdown' : 'Thu gọn chi tiết cước') : isEn ? 'View breakdown' : 'Xem chi tiết cước'}
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showDetails && (
              <div className="border border-[#E5DDD0] rounded-xl overflow-hidden bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[#6D7785] font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">{isEn ? 'Item' : 'Hạng mục'}</th>
                      <th className="px-3.5 py-2.5 text-center">{isEn ? 'Qty' : 'Số lượng'}</th>
                      <th className="px-3.5 py-2.5 text-right">{isEn ? 'Unit Price' : 'Đơn giá'}</th>
                      <th className="px-3.5 py-2.5 text-right">{isEn ? 'Amount' : 'Thành tiền'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EEE8]">
                    {activeOption.freight.lines.map((line, idx) => (
                      <tr key={idx} className={line.code === 'rounding' ? 'bg-amber-50/50 italic text-[#8B6724]' : ''}>
                        <td className="px-3.5 py-2 text-[#181A17]">{line.label}</td>
                        <td className="px-3.5 py-2 text-center text-[#5B6779] whitespace-nowrap">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono text-[#5B6779] whitespace-nowrap tabular-nums">
                          {formatVnd(line.unitPrice)}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono font-bold text-[#181A17] whitespace-nowrap tabular-nums">
                          {formatVnd(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Totals Summary */}
        <div className="space-y-2 pt-3 border-t border-[#D8CEBE]">
          {quote.tripType === 'round_trip' && quote.outbound && quote.return ? (
            <>
              <div className="flex justify-between text-xs text-[#5B6779]">
                <span>{isEn ? 'Outbound Freight:' : 'Cước chặng đi:'}</span>
                <span className="font-mono font-semibold text-[#181A17]">
                  {formatVnd(selectedOutboundTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#5B6779]">
                <span>{isEn ? 'Return Freight (-10%):' : 'Cước chặng về (giảm 10%):'}</span>
                <span className="font-mono font-semibold text-[#181A17]">
                  {formatVnd(quote.return.freight.total)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-xs text-[#5B6779]">
              <span>{isEn ? 'Freight subtotal:' : 'Tổng cước vận chuyển:'}</span>
              <span className="font-mono font-semibold text-[#181A17]">
                {formatVnd(activeOption?.freight?.total || 0)}
              </span>
            </div>
          )}

          <div className="flex justify-between text-xs text-[#5B6779]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#287653]" />
              {quote.tripType === 'round_trip'
                ? isEn
                  ? 'Round-trip insurance (2 legs × 0.9):'
                  : 'Bảo hiểm khứ hồi (2 chặng × 0,9):'
                : isEn
                  ? 'Insurance premium:'
                  : 'Phí bảo hiểm:'}
            </span>
            <span className="font-mono font-semibold text-[#181A17]">
              {formatVnd(quote.insurance?.total || 0)}
            </span>
          </div>
          {quote.tripType === 'round_trip' &&
            quote.insurance?.outboundTotal !== undefined &&
            quote.insurance?.returnTotal !== undefined && (
              <div className="text-[11px] text-[#747D88] flex justify-end gap-2 -mt-1">
                <span>
                  {isEn ? 'Outbound:' : 'Đi:'} {formatVnd(quote.insurance.outboundTotal)}
                </span>
                <span>•</span>
                <span>
                  {isEn ? 'Return:' : 'Về:'} {formatVnd(quote.insurance.returnTotal)}
                </span>
              </div>
            )}

          {(() => {
            const rawDigits = (demoPaymentAmount || '').replace(/[^\d]/g, '');
            const parsedDemo = rawDigits ? Number(rawDigits) : null;
            const hasValidDemo = parsedDemo !== null && Number.isFinite(parsedDemo) && parsedDemo >= 1000;
            const effectiveTotal = hasValidDemo ? parsedDemo : grandTotal;
            return (
              <>
                <div className="flex flex-wrap justify-between items-baseline gap-2 pt-2.5 border-t-2 border-[#181A17] text-[#181A17]">
                  <span className="text-sm font-bold uppercase tracking-wider">
                    {isEn ? 'Total Payment (VND):' : 'Tổng thanh toán (VNĐ):'}
                  </span>
                  <div className="flex items-baseline gap-2.5">
                    {hasValidDemo && parsedDemo !== grandTotal && (
                      <span className="text-xs font-mono line-through text-[#747D88]">
                        {formatVnd(grandTotal)}
                      </span>
                    )}
                    <span className="text-xl font-black font-mono text-[#A67C2E]">
                      {formatVnd(effectiveTotal)}
                    </span>
                  </div>
                </div>

                {onDemoPaymentAmountChange && (
                  <div className="mt-3 p-3 rounded-xl border border-dashed border-[#CBB682] bg-white/90 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="demo-payment-amount-input"
                        className="text-[11.5px] font-bold text-[#181A17]"
                      >
                        {isEn
                          ? 'Adjust Payment Amount (Transfer Demo)'
                          : 'Điều chỉnh số tiền thanh toán (Demo chuyển khoản)'}
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[2000, 5000, 10000].map((preset) => {
                          const isSelected = rawDigits === String(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => onDemoPaymentAmountChange(String(preset))}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#181A17] text-[#FAF8F4] border-[#181A17]'
                                  : 'bg-[#FAF8F4] text-[#5F6977] border-[#D8CEBE] hover:border-[#A67C2E]'
                              }`}
                            >
                              {preset.toLocaleString('vi-VN')} đ
                            </button>
                          );
                        })}
                        {rawDigits && (
                          <button
                            type="button"
                            onClick={() => onDemoPaymentAmountChange('')}
                            className="px-2 py-0.5 rounded-md text-[11px] font-bold border border-[#D8CEBE] bg-white text-[#8C6621] hover:bg-[#FAF8F4] cursor-pointer"
                          >
                            {isEn ? 'Reset' : 'Giá gốc'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="demo-payment-amount-input"
                        type="text"
                        inputMode="numeric"
                        value={rawDigits ? Number(rawDigits).toLocaleString('vi-VN') : ''}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/[^\d]/g, '').slice(0, 12);
                          onDemoPaymentAmountChange(digitsOnly);
                        }}
                        placeholder={
                          isEn
                            ? `Leave blank for original (${grandTotal.toLocaleString('vi-VN')} VND)`
                            : `Để trống giữ giá gốc (${grandTotal.toLocaleString('vi-VN')} đ) hoặc nhập VD: 2.000`
                        }
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-[#FDFCFB] text-xs font-mono font-bold text-[#181A17] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]"
                      />
                      <span className="text-xs font-bold text-[#5F6977] shrink-0">VNĐ</span>
                    </div>
                    {rawDigits && !hasValidDemo && (
                      <p className="text-[11px] text-[#B33E3E] font-medium m-0">
                        {isEn
                          ? 'Minimum demo transfer amount is 1,000 VND.'
                          : 'Số tiền demo chuyển khoản tối thiểu là 1.000 VNĐ.'}
                      </p>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
