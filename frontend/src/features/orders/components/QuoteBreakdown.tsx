'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Truck,
  Plane,
  Ship,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { QuoteResult } from '../quote-api';
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
}

export function QuoteBreakdown({
  quote,
  isLoading,
  onRefresh,
  selectedOptionCode,
  onSelectOptionCode,
  onPickShortageDate,
}: QuoteBreakdownProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number; isExpired: boolean }>({
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });
  const [showDetails, setShowDetails] = useState(true);

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
        <p className="text-sm font-semibold text-[#181A17]">
          {isEn ? 'Calculating real-time server quotation...' : 'Máy chủ đang tính toán khoảng cách và báo giá chuẩn...'}
        </p>
        <p className="text-xs text-[#5B6779]">
          {isEn ? 'Evaluating vehicle options, tariff tiers & insurance' : 'Áp dụng bảng giá có phiên bản, phương án xe và bảo hiểm'}
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

  const formatVnd = (num: number) => num.toLocaleString('vi-VN') + ' đ';
  // Step 9: tổng theo phương án đang chọn (mỗi phương án có cước riêng)
  const isAllocated = Array.isArray(activeOption?.vehicleIds);
  const selectedFreightTotal = activeOption?.freight?.total ?? 0;
  const selectedOutboundTotal = activeOption?.outboundFreightTotal ?? quote.outbound?.freight.total ?? 0;
  const grandTotal = isAllocated ? selectedFreightTotal + (quote.insurance?.total || 0) : quote.total;

  return (
    <div className={`rounded-2xl border-2 border-[#A67C2E]/40 bg-[#FAF8F4] overflow-hidden shadow-sm ${isLoading ? 'opacity-75 transition-opacity' : ''}`}>
      {/* Header with timer and status */}
      <div className="px-5 py-3.5 bg-[#F0EBE0] border-b border-[#D8CEBE] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#287653] animate-ping" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#181A17]">
            {isEn ? 'Official Server Quotation' : 'Báo Giá Tự Động Từ Máy Chủ'}
          </span>
          {quote.quoteId != null && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E5DDD0] font-mono font-bold text-[#6D7785]">
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
                {isEn ? 'Quote expired' : 'Báo giá đã hết hạn (30 phút)'}
              </span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-3 py-1 rounded-lg bg-[#A67C2E] hover:bg-[#8B6724] text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  {isEn ? 'Refresh quote' : 'Báo giá lại'}
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs font-semibold text-[#6D7785] flex items-center gap-1.5 bg-white/70 px-3 py-1 rounded-lg border border-[#D8CEBE]">
              <Clock className="w-3.5 h-3.5 text-[#A67C2E]" />
              <span>{isEn ? 'Locked price for:' : 'Giá khóa trong:'}</span>
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
            <strong>{isEn ? 'Health Risk Advisory: ' : 'Cảnh báo rủi ro sức khỏe: '}</strong>
            {isEn
              ? 'Sea transport by cargo vessel is more economical but takes significantly longer and carries higher equine health risks. Air transport is strongly recommended for high-value racehorses.'
              : 'Đường thủy rẻ hơn nhưng lâu hơn và rủi ro sức khỏe cao hơn. Khuyến nghị đường hàng không cho ngựa đua thi đấu.'}
          </div>
        </div>
      )}

      {quote.warnings?.includes('NO_PARTNER_DEPOT') && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900">
          {isEn
            ? 'No partner depot within 300 km of the destination: the final road leg is priced with the Vietnam tariff.'
            : 'Không có trạm đối tác trong 300 km quanh điểm giao: chặng bộ cuối tính theo bảng giá Việt Nam.'}
        </div>
      )}
      {(quote.partnerDepot || quote.jetStallsRequired || quote.vesselPens) && (
        <div className="mx-5 mt-4 flex flex-wrap gap-2 text-[11px]">
          {quote.jetStallsRequired ? (
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-semibold">
              {isEn ? `Needs ${quote.jetStallsRequired} jet stall(s)` : `Cần ${quote.jetStallsRequired} jet stall`}
            </span>
          ) : null}
          {quote.vesselPens ? (
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-semibold">
              {isEn ? `Needs ${quote.vesselPens} vessel pen(s)` : `Cần ${quote.vesselPens} ô chuồng trên tàu`}
            </span>
          ) : null}
          {quote.partnerDepot && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
              {isEn ? 'Final leg by partner depot: ' : 'Chặng giao cuối do trạm đối tác: '}
              {quote.partnerDepot.name} ({quote.partnerDepot.deadheadKm} km)
            </span>
          )}
        </div>
      )}

      {/* Route Legs Summary */}
      <div className="p-5 border-b border-[#E5DDD0]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-xs font-bold text-[#6D7785] uppercase tracking-wider">
            {isEn ? 'Route Segments & Distance' : 'Các Chặng Vận Chuyển & Khoảng Cách'}
          </div>
          {quote.tripType === 'round_trip' && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E5DDD0] text-[#181A17]">
              {isEn ? 'Round-trip (Outbound + Return)' : 'Khứ hồi (Chặng đi + Chặng về)'}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {quote.legs?.map((leg, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-white/80 border border-[#E5DDD0] flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2">
                {leg.direction === 'return' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    {isEn ? 'Return' : 'Chặng về'}
                  </span>
                ) : leg.direction === 'outbound' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {isEn ? 'Outbound' : 'Chặng đi'}
                  </span>
                ) : null}
                {quote.transportMode === 'air' && leg.key === 'flight' ? (
                  <Plane className="w-4 h-4 text-[#A67C2E]" />
                ) : quote.transportMode === 'sea' && leg.key === 'sea' ? (
                  <Ship className="w-4 h-4 text-[#A67C2E]" />
                ) : (
                  <Truck className="w-4 h-4 text-[#287653]" />
                )}
                <span className="font-semibold text-[#181A17]">
                  {leg.from} → {leg.to}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="font-bold text-[#181A17]">{leg.distanceKm} km</span>
                <span className="text-[#8892A0]">({leg.durationHours}h)</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-sans text-[10px] font-bold ${leg.source === 'ors'
                      ? 'bg-emerald-100 text-emerald-800'
                      : leg.source === 'table'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                >
                  {leg.source === 'ors'
                    ? (isEn ? 'Real road distance' : 'Đường đi thực tế (ORS)')
                    : leg.source === 'table'
                      ? (isEn ? 'Sea corridor' : 'Hải trình chuẩn')
                      : (isEn ? 'Estimated distance' : 'Ước lượng')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicle Option & Breakdown */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-[#6D7785] uppercase tracking-wider">
            {isEn ? 'Freight & Breakdown' : 'Chi Tiết Cước Vận Chuyển'}
          </div>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs font-semibold text-[#A67C2E] hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showDetails ? (isEn ? 'Hide items' : 'Thu gọn') : (isEn ? 'Show items' : 'Xem chi tiết')}
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <VehicleOptionCards
          options={quote.options}
          selectedOptionCode={selectedOptionCode}
          recommendedOptionCode={quote.recommendedOptionCode}
          requiredStallSlots={quote.requiredStallSlots}
          onSelect={onSelectOptionCode}
        />

        {/* Selected Vehicle Summary */}
        {activeOption?.vehicles && (
          <div className="mb-4 p-3 rounded-xl bg-[#F0EEE8] border border-[#D8CEBE] text-xs flex items-center justify-between">
            <span className="text-[#5B6779]">{isEn ? 'Vehicle solution:' : 'Phương án xe:'}</span>
            <span className="font-bold text-[#181A17]">{activeOption.label}</span>
          </div>
        )}

        {/* Itemized lines */}
        {showDetails && activeOption?.freight?.lines && (
          <div className="border border-[#E5DDD0] rounded-xl overflow-hidden mb-4 bg-white">
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
                    <td className="px-3.5 py-2 text-center text-[#5B6779]">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono text-[#5B6779]">
                      {formatVnd(line.unitPrice)}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono font-bold text-[#181A17]">
                      {formatVnd(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals Summary Card */}
        <div className="space-y-2 pt-2 border-t border-[#D8CEBE]">
          {quote.tripType === 'round_trip' && quote.outbound && quote.return ? (
            <>
              <div className="flex justify-between text-xs text-[#5B6779]">
                <span>{isEn ? 'Outbound Freight:' : 'Cước chặng đi:'}</span>
                <span className="font-mono font-semibold text-[#181A17]">
                  {formatVnd(selectedOutboundTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#5B6779]">
                <span className="flex items-center gap-1">
                  <span>{isEn ? 'Return Freight (-10%):' : 'Cước chặng về (giảm 10%):'}</span>
                </span>
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
                ? (isEn ? 'Round-trip insurance (2 legs × 0.9):' : 'Bảo hiểm khứ hồi (2 chặng × 0,9):')
                : (isEn ? 'Insurance premium:' : 'Phí bảo hiểm:')}
            </span>
            <span className="font-mono font-semibold text-[#181A17]">
              {formatVnd(quote.insurance?.total || 0)}
            </span>
          </div>
          {quote.tripType === 'round_trip' && quote.insurance?.outboundTotal !== undefined && quote.insurance?.returnTotal !== undefined && (
            <div className="text-[11px] text-[#747D88] flex justify-end gap-2 -mt-1">
              <span>{isEn ? 'Outbound:' : 'Đi:'} {formatVnd(quote.insurance.outboundTotal)}</span>
              <span>•</span>
              <span>{isEn ? 'Return:' : 'Về:'} {formatVnd(quote.insurance.returnTotal)}</span>
            </div>
          )}

          <div className="flex justify-between items-baseline pt-2 border-t-2 border-[#181A17] text-[#181A17]">
            <span className="text-sm font-bold uppercase tracking-wider">
              {isEn ? 'Total Quotation (VND):' : 'Tổng Báo Giá (VNĐ):'}
            </span>
            <span className="text-xl font-black font-mono text-[#A67C2E]">
              {formatVnd(grandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
