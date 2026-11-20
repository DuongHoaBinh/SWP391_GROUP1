'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, RefreshCw, ShieldCheck, ExternalLink, Clock } from 'lucide-react';
import { apiClient, openAuthenticatedApiFile } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface CustomerRefundRecord {
  id: number;
  shipmentId: number;
  requestCode: string;
  cancellationCategory: string;
  refundMode: 'cash_refund' | 'credit_30d';
  freightRefundAmount: number;
  insuranceRefundAmount: number;
  nonRefundableAirDeduction: number;
  disbursementDeduction: number;
  amount: number;
  receivableExcessAmount: number;
  status: string;
  requiresDualApproval: boolean;
  recipientBankAccount: string | null;
  bankTransactionRef: string | null;
  transferReceiptUrl: string | null;
  creditExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

const REFUND_STATUS_LABELS: Record<string, { vi: string; en: string; cls: string }> = {
  pending_approval: { vi: 'Chờ Manager duyệt', en: 'Pending Approval', cls: 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]' },
  pending_second_approval: { vi: 'Chờ duyệt kép (>=20M)', en: 'Pending Dual Approval', cls: 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]' },
  approved_for_transfer: { vi: 'Đã duyệt — Chờ chuyển khoản', en: 'Approved for Transfer', cls: 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]' },
  transferred: { vi: 'Đã chuyển khoản hoàn tiền', en: 'Transferred', cls: 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]' },
  converted_to_credit: { vi: 'Đã cấp Bảo lưu cước 30 ngày', en: 'Converted to 30-Day Credit', cls: 'bg-[#FAF5EB] text-[#A67C2E] border-[#DFCA9A]' },
  rejected: { vi: 'Từ chối hoàn tiền', en: 'Rejected', cls: 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]' },
};

export function CustomerRefundSummaryCard({ shipmentId }: { shipmentId: number }) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [refunds, setRefunds] = useState<CustomerRefundRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRefunds = useCallback(async () => {
    if (!Number.isInteger(shipmentId) || shipmentId <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient<CustomerRefundRecord[]>(`/orders/${shipmentId}/refunds`);
      setRefunds(Array.isArray(data) ? data : []);
    } catch {
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  if (loading || refunds.length === 0) return null;

  const formatVnd = (val: number) => `${Number(val || 0).toLocaleString('vi-VN')} VND`;

  return (
    <section
      className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden"
      aria-label={isEn ? 'Refund & Credit Summary' : 'Thông tin Hoàn tiền & Bảo lưu cước'}
    >
      <header className="px-6 py-4 border-b border-[#EAE5DA] bg-[#FAF8F4] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-[#A67C2E]" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-[#181A17] m-0">
            {isEn ? 'Refund & 30-Day Credit Records' : 'Hồ Sơ Hoàn Tiền & Bảo Lưu Cước'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void loadRefunds()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C6658] hover:text-[#181A17] bg-transparent border-0 cursor-pointer"
        >
          <RefreshCw size={13} aria-hidden="true" />
          {isEn ? 'Refresh' : 'Làm mới'}
        </button>
      </header>

      <div className="p-6 flex flex-col gap-4">
        {refunds.map((rec) => {
          const stMeta = REFUND_STATUS_LABELS[rec.status] || {
            vi: rec.status,
            en: rec.status,
            cls: 'bg-[#F0EEE8] text-[#5C6658] border-[#D8CEBE]',
          };
          return (
            <div key={rec.id} className="p-4 rounded-xl border border-[#E8E2D8] bg-[#FAF9F5] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-[#181A17] text-sm">
                  #{rec.id} • {formatVnd(rec.amount)}{' '}
                  <span className="font-semibold text-[#5C6658]">
                    ({rec.refundMode === 'credit_30d'
                      ? isEn ? '30-Day Credit' : 'Bảo lưu cước 30 ngày'
                      : isEn ? 'Manual Bank Transfer' : 'Hoàn chuyển khoản'})
                  </span>
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${stMeta.cls}`}>
                  {isEn ? stMeta.en : stMeta.vi}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[#5C6658]">
                <div>
                  {isEn ? 'Freight refund:' : 'Hoàn cước:'} <strong className="text-[#181A17]">{formatVnd(rec.freightRefundAmount)}</strong>
                </div>
                <div>
                  {isEn ? 'Insurance refund:' : 'Hoàn bảo hiểm:'} <strong className="text-[#181A17]">{formatVnd(rec.insuranceRefundAmount)}</strong>
                </div>
                <div>
                  {isEn ? 'Agency disbursement deducted:' : 'Trừ phí cơ quan nộp hộ:'}{' '}
                  <strong className="text-[#B33E3E]">-{formatVnd(rec.disbursementDeduction)}</strong>
                </div>
              </div>

              {rec.receivableExcessAmount > 0 && (
                <div className="p-2.5 rounded-lg bg-[#F8EAEA] border border-[#E5B8B8] text-[#B33E3E] font-semibold">
                  {isEn
                    ? `Unsettled agency fee balance payable: ${formatVnd(rec.receivableExcessAmount)}`
                    : `Khoản lệ phí ứng trước còn phải đối soát thu thêm: ${formatVnd(rec.receivableExcessAmount)}`}
                </div>
              )}

              {rec.creditExpiresAt && (
                <div className="flex items-center gap-1.5 text-[#A67C2E] font-semibold">
                  <Clock size={13} aria-hidden="true" />
                  <span>
                    {isEn ? 'Credit valid until:' : 'Hạn sử dụng bảo lưu đến:'}{' '}
                    {new Date(rec.creditExpiresAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                  </span>
                </div>
              )}

              {rec.bankTransactionRef && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#EAE5DA]">
                  <span className="text-[#287653] font-semibold inline-flex items-center gap-1">
                    <ShieldCheck size={14} aria-hidden="true" />
                    {isEn ? 'Bank Ref:' : 'Mã giao dịch NH:'} <strong>{rec.bankTransactionRef}</strong>
                  </span>
                  {rec.transferReceiptUrl && (
                    <button
                      type="button"
                      onClick={() => void openAuthenticatedApiFile(`/api/orders/refunds/${rec.id}/receipt`)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#A67C2E] hover:underline bg-transparent border-0 cursor-pointer"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      {isEn ? 'View Transfer Receipt' : 'Xem ủy nhiệm chi'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
