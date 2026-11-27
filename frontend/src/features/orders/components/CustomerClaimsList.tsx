'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { CustomerClaimModal } from './CustomerClaimModal';
import { InsurancePackage, vnd } from '../insurance-policy';
import { CheckCircle, Clock, PlusCircle, ShieldAlert, XCircle } from 'lucide-react';

export interface CustomerClaimsListProps {
  shipmentId: number;
  shipmentStatus: string;
  deliveredAt?: string | null;
  horses: Array<{
    shipmentHorseId?: number;
    horseId: number;
    name: string;
    declaredValueVnd?: number;
    insurancePackage?: InsurancePackage;
  }>;
}

const getStatusBadge = (status: string, isEn: boolean) => {
  switch (status) {
    case 'submitted':
      return {
        label: isEn ? 'Submitted · Awaiting review' : 'Đã nộp · Chờ xem xét',
        color: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: Clock,
      };
    case 'under_review':
      return {
        label: isEn ? 'Under Review' : 'Đang thẩm định',
        color: 'bg-blue-50 text-blue-800 border-blue-200',
        icon: Clock,
      };
    case 'approved':
      return {
        label: isEn ? 'Approved · Pending payout' : 'Đã phê duyệt · Chờ chi trả',
        color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: CheckCircle,
      };
    case 'rejected':
      return {
        label: isEn ? 'Rejected' : 'Đã từ chối',
        color: 'bg-rose-50 text-rose-800 border-rose-200',
        icon: XCircle,
      };
    case 'paid':
      return {
        label: isEn ? 'Compensation Paid' : 'Đã chi trả bồi thường',
        color: 'bg-purple-50 text-purple-800 border-purple-200',
        icon: CheckCircle,
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: Clock,
      };
  }
};

export function CustomerClaimsList({
  shipmentId,
  shipmentStatus,
  deliveredAt,
  horses,
}: CustomerClaimsListProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [selectedHorse, setSelectedHorse] = useState<{
    shipmentHorseId: number;
    name: string;
    declaredValueVnd: number;
    insurancePackage: InsurancePackage;
  } | null>(null);

  const { data: claims, mutate } = useSWR<any[]>(
    `/orders/${shipmentId}/claims`,
    (url: string) => apiClient<any[]>(url),
  );

  const statusLower = String(shipmentStatus || '').toLowerCase();
  const isDeliveredOrCompleted =
    Boolean(deliveredAt) ||
    ['completed', 'delivered', 'in_transit', 'return_pending', 'return_in_transit'].includes(
      statusLower,
    );

  // 72h window check
  const deliveryMs = deliveredAt ? new Date(deliveredAt).getTime() : null;
  const isExpired = deliveryMs ? Date.now() - deliveryMs > 72 * 3600 * 1000 : false;
  const deadlineDate = deliveryMs ? new Date(deliveryMs + 72 * 3600 * 1000) : null;
  const locale = isEn ? 'en-US' : 'vi-VN';

  const packageLabel = (pkg?: InsurancePackage) => {
    if (pkg === 'premium') return isEn ? 'Comprehensive' : 'Toàn diện';
    if (pkg === 'standard') return isEn ? 'Standard' : 'Tiêu chuẩn';
    return isEn ? 'Basic' : 'Cơ bản';
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#D8CEBE] bg-white p-5 text-[#181A17]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8E2D8] pb-3">
        <div>
          <h4 className="font-bold text-base flex items-center gap-2 m-0">
            <ShieldAlert className="h-5 w-5 text-[#8C7A5B]" aria-hidden="true" />
            <span>
              {isEn
                ? 'Insurance & Incident Claims'
                : 'Bảo hiểm & Yêu cầu bồi thường sự cố (Claims)'}
            </span>
          </h4>
          <p className="text-xs text-[#5B6779] mt-0.5 mb-0">
            {isEn ? 'Window: 72h after handover (M4 anytime in transit).' : 'Hạn gửi: 72h sau bàn giao (M4 gửi ngay khi đang chạy).'}
          </p>
        </div>
        {deadlineDate && (
          <div className="text-xs text-[#8C7A5B] bg-[#FAF3E0] px-3 py-1.5 rounded-lg border border-[#EAD8B1] self-start sm:self-auto">
            {isExpired ? (
              <span className="text-red-700 font-semibold">
                {isEn
                  ? `Claim window closed at ${deadlineDate.toLocaleTimeString(locale)} ${deadlineDate.toLocaleDateString(locale)}`
                  : `Đã hết hạn khiếu nại lúc ${deadlineDate.toLocaleTimeString(locale)} ${deadlineDate.toLocaleDateString(locale)}`}
              </span>
            ) : (
              <span>
                {isEn
                  ? `Deadline: ${deadlineDate.toLocaleTimeString(locale)} on ${deadlineDate.toLocaleDateString(locale)}`
                  : `Hạn chót: ${deadlineDate.toLocaleTimeString(locale)} ngày ${deadlineDate.toLocaleDateString(locale)}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Horse action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {horses.map((h, idx) => {
          const sHorseId = h.shipmentHorseId ?? h.horseId;
          const activeClaim = (claims || []).find(
            (c) => Number(c.shipmentHorseId) === sHorseId && ['submitted', 'under_review'].includes(c.status),
          );

          return (
            <div
              key={`${sHorseId}-${idx}`}
              className="flex items-center gap-2 rounded-lg border border-[#D8CEBE] bg-[#FAF8F5] px-3 py-2 text-xs"
            >
              <span className="font-semibold text-[#181A17]">{h.name}</span>
              <span className="text-[11px] text-[#7D8A99]">({packageLabel(h.insurancePackage)})</span>
              {activeClaim ? (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  {isEn ? `Processing claim #${activeClaim.id}` : `Đang xử lý claim #${activeClaim.id}`}
                </span>
              ) : isDeliveredOrCompleted && !isExpired ? (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedHorse({
                      shipmentHorseId: sHorseId,
                      name: h.name,
                      declaredValueVnd: Number(h.declaredValueVnd || 0),
                      insurancePackage: h.insurancePackage || 'basic',
                    })
                  }
                  className="inline-flex items-center gap-1 rounded bg-[#181A17] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#242722] cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isEn ? 'File Claim' : 'Yêu cầu bồi thường'}</span>
                </button>
              ) : isExpired ? (
                <span className="text-[11px] text-[#7D8A99] italic">
                  {isEn ? 'Claim window expired' : 'Hết hạn khiếu nại'}
                </span>
              ) : (
                <span className="text-[11px] text-[#7D8A99] italic">
                  {isEn ? 'Available after handover' : 'Mở sau khi bàn giao'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Existing claims list */}
      {claims && claims.length > 0 ? (
        <div className="space-y-3 pt-2">
          <h5 className="font-bold text-xs uppercase tracking-wider text-[#5B6779] m-0">
            {isEn ? `Submitted Claims (${claims.length})` : `Hồ sơ khiếu nại đã gửi (${claims.length})`}
          </h5>
          <div className="divide-y divide-[#E8E2D8] border border-[#E8E2D8] rounded-xl overflow-hidden">
            {claims.map((c) => {
              const badge = getStatusBadge(c.status, isEn);
              const Icon = badge.icon;
              return (
                <div key={c.id} className="p-4 bg-white space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#181A17]">
                        {isEn
                          ? `Claim #${c.id} · Horse ${c.horseName || `#${c.shipmentHorseId}`}`
                          : `Hồ sơ #${c.id} · Ngựa ${c.horseName || `#${c.shipmentHorseId}`}`}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#EAE5D9] text-[#181A17]">
                        {isEn ? `Level ${c.severity}` : `Mức ${c.severity}`}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.color}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-xs text-[#5B6779] line-clamp-2 m-0">
                    <strong>{isEn ? 'Description:' : 'Mô tả:'}</strong> {c.description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[11px] text-[#7D8A99] block">
                        {isEn ? 'Requested Amount:' : 'Số tiền yêu cầu:'}
                      </span>
                      <span className="font-bold text-[#181A17]">{vnd(c.requestedAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#7D8A99] block">
                        {isEn ? 'Policy Suggestion:' : 'Gợi ý theo quy định:'}
                      </span>
                      <span className="font-bold text-[#8C7A5B]">{vnd(c.suggestedAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#7D8A99] block">
                        {isEn ? 'Approved Amount:' : 'Số tiền phê duyệt:'}
                      </span>
                      <span className="font-bold text-emerald-700">
                        {c.approvedAmount !== null ? vnd(c.approvedAmount) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#7D8A99] block">
                        {isEn ? 'Submitted Date:' : 'Thời gian tạo:'}
                      </span>
                      <span className="text-[#5B6779]">
                        {new Date(c.createdAt).toLocaleDateString(locale)}
                      </span>
                    </div>
                  </div>

                  {c.decisionReason && (
                    <div className="mt-2 text-xs bg-[#F9F8F5] p-2.5 rounded-lg border border-[#E8E2D8]">
                      <strong>{isEn ? 'Manager Response:' : 'Phản hồi từ quản lý:'}</strong>{' '}
                      {c.decisionReason}
                      {c.rejectionReasonCode && (
                        <span className="ml-1 text-rose-700">({c.rejectionReasonCode})</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-[#7D8A99] bg-[#FAF8F5] rounded-lg border border-[#E8E2D8]">
          {isEn
            ? 'No insurance claims have been submitted for this order.'
            : 'Chưa có yêu cầu bồi thường nào được gửi cho đơn hàng này.'}
        </div>
      )}

      {selectedHorse && (
        <CustomerClaimModal
          shipmentId={shipmentId}
          shipmentHorseId={selectedHorse.shipmentHorseId}
          horseName={selectedHorse.name}
          declaredValueVnd={selectedHorse.declaredValueVnd}
          insurancePackage={selectedHorse.insurancePackage}
          isOpen={true}
          onClose={() => setSelectedHorse(null)}
          onClaimCreated={() => {
            void mutate();
          }}
        />
      )}
    </div>
  );
}
