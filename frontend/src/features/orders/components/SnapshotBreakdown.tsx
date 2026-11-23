'use client';

import React, { useState } from 'react';
import { ShieldCheck, Truck, Plane, Ship, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface SnapshotBreakdownProps {
  quoteId?: number | null;
  pricingSnapshot: any;
  transportCost?: number | null;
  insuranceFee?: number | null;
  totalCost?: number | null;
}

export function SnapshotBreakdown({
  quoteId,
  pricingSnapshot,
  transportCost,
  insuranceFee,
  totalCost,
}: SnapshotBreakdownProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [showDetails, setShowDetails] = useState(false);

  if (!quoteId && !pricingSnapshot) return null;

  const option = pricingSnapshot?.option;
  const legs = pricingSnapshot?.legs || [];
  const lines = option?.freight?.lines || [];
  const formatVnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';

  return (
    <div className="p-4 rounded-xl border border-[#A67C2E]/40 bg-[#FAF8F4] text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#A67C2E]" />
          <span className="font-bold text-[#181A17]">
            {isEn ? `Quotation Locked (#${quoteId})` : `Giá Đã Khóa Theo Báo Giá (#${quoteId})`}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
          {isEn ? 'Server locked' : 'Khóa từ máy chủ'}
        </span>
      </div>

      <div className="p-3 rounded-lg bg-white border border-[#E5DDD0] space-y-2">
        {option?.label && (
          <div className="flex justify-between text-[#5B6779]">
            <span>{isEn ? 'Solution:' : 'Phương án xe:'}</span>
            <span className="font-semibold text-[#181A17]">{option.label}</span>
          </div>
        )}
        <div className="flex justify-between text-[#5B6779]">
          <span>{isEn ? 'Freight:' : 'Cước vận chuyển:'}</span>
          <span className="font-mono font-bold text-[#181A17]">
            {formatVnd(Number(transportCost || option?.freight?.total || 0))}
          </span>
        </div>
        <div className="flex justify-between text-[#5B6779]">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#287653]" />
            {isEn ? 'Insurance:' : 'Bảo hiểm:'}
          </span>
          <span className="font-mono font-bold text-[#181A17]">
            {formatVnd(Number(insuranceFee || 0))}
          </span>
        </div>
        <div className="flex justify-between items-baseline pt-2 border-t border-[#D8CEBE] font-bold text-[#181A17]">
          <span>{isEn ? 'Total:' : 'Tổng cước & bảo hiểm:'}</span>
          <span className="text-sm font-mono text-[#A67C2E]">
            {formatVnd(Number(totalCost || 0))}
          </span>
        </div>
      </div>

      {lines.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] font-semibold text-[#A67C2E] hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showDetails ? (isEn ? 'Hide itemized lines' : 'Ẩn chi tiết từng dòng') : (isEn ? 'View itemized breakdown' : 'Xem chi tiết từng dòng cước')}
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDetails && (
            <div className="mt-2 border border-[#E5DDD0] rounded-lg overflow-hidden bg-white">
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-[#F0EEE8]">
                  {lines.map((l: any, i: number) => (
                    <tr key={i} className="px-2.5 py-1.5 flex justify-between">
                      <td className="p-2 text-[#181A17]">{l.label}</td>
                      <td className="p-2 font-mono font-bold text-[#181A17] text-right">
                        {formatVnd(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
