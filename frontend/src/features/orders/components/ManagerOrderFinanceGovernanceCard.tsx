'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Clock,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, openAuthenticatedApiFile } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/Button';

interface RefundRecordItem {
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
  approvedBy: number | null;
  secondApprovedBy: number | null;
  transferredBy: number | null;
  recipientBankAccount: string | null;
  recipientBankName?: string | null;
  recipientAccountHolder?: string | null;
  customerNote?: string | null;
  formSubmittedAt?: string | null;
  slaDueAt?: string | null;
  bankTransactionRef: string | null;
  transferReceiptUrl: string | null;
  creditExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Props {
  shipmentId: number;
  requestCode: string;
  orderStatus: string;
  bookingType?: string;
  onUpdated: () => Promise<void> | void;
}

const CANCELLATION_CATEGORIES = [
  { value: 'company_fault', vi: 'Lỗi vận hành công ty (100% cước + 100% BH)', en: 'Company Fault (100% freight + ins)' },
  { value: 'vet_unfit_certified', vi: 'Thú y xác nhận ngựa không đủ sức khỏe', en: 'Vet Unfit (Certified)' },
  { value: 'vet_unfit_uncertified', vi: 'Khách báo không đạt sức khỏe (chưa có giấy thú y)', en: 'Vet Unfit (Uncertified)' },
  { value: 'payment_overdue', vi: 'Quá hạn thanh toán', en: 'Payment Overdue' },
  { value: 'payment_overdue_expired', vi: 'Hết hạn gia hạn thanh toán', en: 'Payment Grace Expired' },
  { value: 'customer_request_post_approval', vi: 'Khách yêu cầu hủy sau khi đã duyệt', en: 'Customer Request Post-Approval' },
  { value: 'force_majeure', vi: 'Bất khả kháng (Force Majeure)', en: 'Force Majeure' },
];

const REFUND_STATUS_META: Record<string, { vi: string; en: string; cls: string }> = {
  pending_approval: { vi: 'Chờ duyệt hoàn tiền', en: 'Pending Approval', cls: 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]' },
  pending_second_approval: { vi: 'Chờ duyệt hoàn tiền', en: 'Pending Approval', cls: 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]' },
  approved_for_transfer: { vi: 'Đã duyệt — Chờ chuyển khoản', en: 'Approved for Transfer', cls: 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]' },
  transferred: { vi: 'Đã chuyển khoản', en: 'Transferred', cls: 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]' },
  converted_to_credit: { vi: 'Đã bảo lưu 30 ngày', en: 'Converted to Credit', cls: 'bg-[#FAF5EB] text-[#A67C2E] border-[#DFCA9A]' },
  rejected: { vi: 'Đã từ chối', en: 'Rejected', cls: 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]' },
};

const REFUND_CATEGORY_LABELS: Record<string, { vi: string; en: string }> = {
  company_fault: { vi: 'Lỗi vận hành công ty', en: 'Company Fault' },
  company_cannot_fulfil: { vi: 'Công ty không thể đáp ứng', en: 'Company Cannot Fulfil' },
  vet_unfit: { vi: 'Ngựa không đạt sức khỏe thú y', en: 'Vet Unfit' },
  vet_unfit_certified: { vi: 'Thú y xác nhận không đạt sức khỏe', en: 'Vet Unfit (Certified)' },
  vet_unfit_uncertified: { vi: 'Báo không đạt sức khỏe (chưa có giấy thú y)', en: 'Vet Unfit (Uncertified)' },
  payment_overdue: { vi: 'Quá hạn thanh toán', en: 'Payment Overdue' },
  payment_overdue_expired: { vi: 'Hết hạn gia hạn thanh toán', en: 'Payment Grace Expired' },
  customer_request_post_approval: { vi: 'Khách hủy sau duyệt', en: 'Customer Post-Approval Cancel' },
  force_majeure: { vi: 'Bất khả kháng', en: 'Force Majeure' },
  return_leg_customer_cancel: { vi: 'Khách hủy chặng về khứ hồi', en: 'Customer Cancelled Return Leg' },
  return_leg_company_cancel: { vi: 'Công ty hủy chặng về khứ hồi', en: 'Company Cancelled Return Leg' },
  insurance_claim: { vi: 'Bồi thường bảo hiểm', en: 'Insurance Claim Payout' },
};

export function ManagerOrderFinanceGovernanceCard({
  shipmentId,
  requestCode,
  orderStatus,
  onUpdated,
}: Props) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [refunds, setRefunds] = useState<RefundRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Operational cancel form
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelCategory, setCancelCategory] = useState('company_fault');
  const [cancelMode, setCancelMode] = useState<'cash_refund' | 'credit_30d'>('cash_refund');
  const [cancelAirCost, setCancelAirCost] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Grace confirmation form (only for awaiting_payment)
  const [showGraceForm, setShowGraceForm] = useState(false);
  const [graceReason, setGraceReason] = useState('');

  // Transfer form per refund ID (Cách 1: uses customer-submitted bank info)
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [bankTxRef, setBankTxRef] = useState('');
  const [transferUrl, setTransferUrl] = useState('');
  const [transferFile, setTransferFile] = useState<File | null>(null);

  const loadFinanceData = useCallback(async () => {
    if (!Number.isInteger(shipmentId) || shipmentId <= 0) return;
    setLoading(true);
    try {
      const refData = await apiClient<RefundRecordItem[]>(`/orders/${shipmentId}/refunds`);
      if (Array.isArray(refData)) {
        setRefunds(refData);
      }
    } catch {
      // Keep previous state on transient network failure
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  const statusLower = String(orderStatus || '').toLowerCase();
  const canOperationalCancel = ['approved', 'planning', 'confirmed', 'ready_to_depart'].includes(statusLower);
  // Prepaid flow: payment grace extension is only relevant while awaiting initial payment
  const canGrantGrace = statusLower === 'awaiting_payment';

  const money = (v: number) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;

  const handleOperationalCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      toast.error(isEn ? 'Cancellation reason is required.' : 'Vui lòng nhập lý do hủy vận hành.');
      return;
    }
    setBusyAction('cancel');
    try {
      await apiClient(`/orders/${shipmentId}/operational-cancel`, {
        method: 'POST',
        body: JSON.stringify({
          category: cancelCategory,
          reason: cancelReason.trim(),
          refundMode: cancelMode,
          ...(cancelAirCost.trim() ? { nonRefundableAirCost: Number(cancelAirCost) } : {}),
        }),
      });
      toast.success(isEn ? `Order ${requestCode} operationally cancelled.` : `Đã hủy vận hành đơn ${requestCode} và khởi tạo hồ sơ hoàn tiền.`);
      setShowCancelForm(false);
      setCancelReason('');
      await loadFinanceData();
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Operational cancel failed.' : 'Không thể hủy vận hành đơn hàng.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleGrantGrace = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusyAction('grace');
    try {
      await apiClient(`/orders/${shipmentId}/payment-grace`, {
        method: 'POST',
        body: JSON.stringify({ reason: graceReason.trim() || 'Manager 1-time grace extension' }),
      });
      toast.success(isEn ? '1-time payment grace granted (MIN(now+10h, T-24h)).' : 'Đã cấp gia hạn thanh toán duy nhất 1 lần.');
      setGraceReason('');
      setShowGraceForm(false);
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Cannot grant payment grace.' : 'Không thể cấp gia hạn thanh toán.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveRefund = async (refundId: number, decision: 'approve' | 'reject') => {
    setBusyAction(`approve-${refundId}`);
    try {
      await apiClient(`/orders/refunds/${refundId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      });
      toast.success(
        decision === 'approve'
          ? isEn ? `Refund #${refundId} approved.` : `Đã phê duyệt hồ sơ hoàn tiền #${refundId}.`
          : isEn ? `Refund #${refundId} rejected.` : `Đã từ chối hồ sơ hoàn tiền #${refundId}.`,
      );
      await loadFinanceData();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Refund approval action failed.' : 'Không thể phê duyệt hoàn tiền.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleTransferRefund = async (e: React.FormEvent, refundId: number) => {
    e.preventDefault();
    if (!bankTxRef.trim()) {
      toast.error(isEn ? 'Bank transaction reference is required.' : 'Vui lòng nhập mã giao dịch chuyển khoản.');
      return;
    }
    setBusyAction(`transfer-${refundId}`);
    try {
      if (transferFile) {
        const fd = new FormData();
        fd.append('bankTransactionRef', bankTxRef.trim());
        fd.append('receipt', transferFile);
        await apiClient(`/orders/refunds/${refundId}/transfer`, { method: 'POST', body: fd });
      } else {
        await apiClient(`/orders/refunds/${refundId}/transfer`, {
          method: 'POST',
          body: JSON.stringify({
            bankTransactionRef: bankTxRef.trim(),
            ...(transferUrl.trim() ? { transferReceiptUrl: transferUrl.trim() } : {}),
          }),
        });
      }
      toast.success(isEn ? `Refund #${refundId} marked transferred.` : `Đã xác nhận giải ngân chuyển khoản #${refundId}.`);
      setTransferTargetId(null);
      setBankTxRef('');
      setTransferUrl('');
      setTransferFile(null);
      await loadFinanceData();
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Transfer failed.' : 'Không thể xác nhận chuyển khoản hoàn tiền.'));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-[#181A17] flex items-center gap-2 m-0">
          <Landmark size={18} className="text-[#A67C2E]" aria-hidden="true" />
          <span>{isEn ? 'Refunds & Operational Exceptions' : 'Quản Lý Hoàn Tiền & Ngoại Lệ'}</span>
        </h2>
        <button
          type="button"
          onClick={() => void loadFinanceData()}
          className="text-xs font-semibold text-[#5C6658] hover:text-[#181A17] inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer"
        >
          <RefreshCw size={12} aria-hidden="true" /> {isEn ? 'Refresh' : 'Tải lại'}
        </button>
      </div>

      {/* Operational Controls */}
      {(canGrantGrace || canOperationalCancel) && (
        <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E8E2D8]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C6658]">
            {isEn ? 'Exception Controls' : 'Tác vụ xử lý ngoại lệ'}
          </span>
          <div className="flex flex-wrap gap-2">
            {canGrantGrace && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => setShowGraceForm((v) => !v)}
                className="text-xs rounded-xl"
              >
                <Clock size={13} className="mr-1" aria-hidden="true" />
                {isEn ? 'Grant 1x Payment Grace' : 'Gia hạn thanh toán (1 lần)'}
              </Button>
            )}
            {canOperationalCancel && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => setShowCancelForm((v) => !v)}
                className="text-xs rounded-xl"
              >
                <Ban size={13} className="mr-1" aria-hidden="true" />
                {isEn ? 'Operational Cancel' : 'Hủy Vận Hành Đơn'}
              </Button>
            )}
          </div>

          {showGraceForm && (
            <form onSubmit={handleGrantGrace} className="mt-2 p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2.5 text-xs">
              <strong className="text-[#181A17]">{isEn ? 'Confirm 1-Time Payment Grace Extension' : 'Xác nhận gia hạn thanh toán (duy nhất 1 lần)'}</strong>
              <input
                type="text"
                placeholder={isEn ? 'Reason for grace extension (optional)' : 'Lý do gia hạn thanh toán (tùy chọn)'}
                value={graceReason}
                onChange={(e) => setGraceReason(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE]"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowGraceForm(false)}>
                  {isEn ? 'Cancel' : 'Đóng'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={busyAction === 'grace'}>
                  {busyAction === 'grace' && <Loader2 size={12} className="animate-spin mr-1" />}
                  {isEn ? 'Confirm Grace' : 'Xác nhận gia hạn'}
                </Button>
              </div>
            </form>
          )}

          {showCancelForm && (
            <form onSubmit={handleOperationalCancel} className="mt-2 p-3 rounded-xl bg-rose-50/70 border border-[#E5B8B8] flex flex-col gap-2.5 text-xs">
              <strong className="text-[#B33E3E] flex items-center gap-1">
                <ShieldAlert size={14} aria-hidden="true" />
                {isEn ? 'Operational Cancel & Refund Policy' : 'Hủy vận hành & Tính toán hoàn tiền'}
              </strong>
              <select
                value={cancelCategory}
                onChange={(e) => setCancelCategory(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              >
                {CANCELLATION_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{isEn ? c.en : c.vi}</option>
                ))}
              </select>
              <select
                value={cancelMode}
                onChange={(e) => setCancelMode(e.target.value as 'cash_refund' | 'credit_30d')}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              >
                <option value="cash_refund">{isEn ? 'Cash Refund (Manual Bank Transfer)' : 'Hoàn tiền chuyển khoản'}</option>
                <option value="credit_30d">{isEn ? '100% Credit Reserved 30 Days' : 'Bảo lưu cước 30 ngày'}</option>
              </select>
              <input
                type="number"
                min={0}
                placeholder={isEn ? 'Non-refundable air cost VND (optional)' : 'Chi phí vé/khoang máy bay không hoàn lại VND (tùy chọn)'}
                value={cancelAirCost}
                onChange={(e) => setCancelAirCost(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              />
              <textarea
                rows={2}
                required
                placeholder={isEn ? 'Mandatory operational cancellation reason *' : 'Lý do hủy vận hành bắt buộc *'}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="p-2.5 rounded-lg border border-[#D8CEBE] bg-white"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCancelForm(false)}>
                  {isEn ? 'Close' : 'Đóng'}
                </Button>
                <Button type="submit" variant="danger" size="sm" disabled={busyAction === 'cancel'}>
                  {busyAction === 'cancel' ? (isEn ? 'Cancelling...' : 'Đang xử lý...') : isEn ? 'Confirm Operational Cancel' : 'Xác nhận Hủy Vận Hành'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Refund Approval & Payout Ledger */}
      <div className="space-y-2.5">
        <span className="text-xs font-extrabold text-[#181A17] flex items-center gap-1.5">
          <Receipt size={14} className="text-[#A67C2E]" aria-hidden="true" />
          {isEn ? 'Refund Approval & Transfer Ledger' : 'Sổ Phê Duyệt & Chuyển Khoản Hoàn Tiền'} ({refunds.length})
        </span>

        {loading ? (
          <p className="text-xs text-[#7E867B] m-0">{isEn ? 'Loading refund records...' : 'Đang tải hồ sơ hoàn tiền...'}</p>
        ) : refunds.length === 0 ? (
          <p className="text-xs text-[#7E867B] m-0">{isEn ? 'No refund records.' : 'Chưa phát sinh hồ sơ hoàn tiền.'}</p>
        ) : (
          <div className="space-y-3">
            {refunds.map((r) => {
              const needsApproval = r.status === 'pending_approval' || r.status === 'pending_second_approval';
              const hasCustomerBankInfo = Boolean(r.formSubmittedAt && String(r.recipientBankAccount || '').trim());
              const waitingInsuranceBankForm =
                r.cancellationCategory === 'insurance_claim' &&
                r.status === 'pending_approval' &&
                !hasCustomerBankInfo;
              const waitingBankFormForTransfer =
                r.refundMode === 'cash_refund' && !hasCustomerBankInfo;
              const canTransfer = r.status === 'approved_for_transfer';
              const statusMeta = REFUND_STATUS_META[r.status] || {
                vi: r.status,
                en: r.status,
                cls: 'bg-white text-[#181A17] border-[#D8CEBE]',
              };
              const catMeta = REFUND_CATEGORY_LABELS[r.cancellationCategory];
              return (
                <div key={r.id} className="p-3.5 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#181A17]">
                      #{r.id} • {money(r.amount)} (
                      {r.refundMode === 'credit_30d'
                        ? isEn ? '30-Day Credit' : 'Bảo lưu 30 ngày'
                        : isEn ? 'Bank Transfer' : 'Hoàn chuyển khoản'}
                      )
                    </strong>
                    <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${statusMeta.cls}`}>
                      {isEn ? statusMeta.en : statusMeta.vi}
                    </span>
                  </div>
                  <div className="text-[#5C6658]">
                    {catMeta ? (isEn ? catMeta.en : catMeta.vi) : r.cancellationCategory}
                    {Number(r.disbursementDeduction || 0) > 0 && (
                      <>
                        {' • '}
                        {isEn ? 'Disbursement deducted:' : 'Khấu trừ nộp hộ:'}{' '}
                        <strong>{money(r.disbursementDeduction)}</strong>
                      </>
                    )}
                  </div>

                  {r.recipientBankAccount ? (
                    <div className="p-2.5 rounded-lg bg-white border border-[#E5DDD0] text-[#273244] space-y-0.5">
                      <span className="font-bold text-[#181A17] block">
                        {isEn ? 'Customer Beneficiary Bank Info:' : 'Thông tin tài khoản khách hàng đã gửi:'}
                      </span>
                      <span>
                        {[r.recipientBankName, r.recipientBankAccount, r.recipientAccountHolder].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  ) : r.refundMode === 'cash_refund' && ['pending_approval', 'approved_for_transfer'].includes(r.status) ? (
                    <div className="p-2.5 rounded-lg bg-[#FFF9EB] border border-[#DFCA9A] text-[#7A5616] font-medium">
                      {isEn
                        ? 'Awaiting customer to submit beneficiary bank account details via the refund form before transfer.'
                        : 'Đang chờ chủ ngựa điền thông tin tài khoản ngân hàng qua biểu mẫu hoàn tiền trước khi chuyển khoản.'}
                    </div>
                  ) : null}

                  {r.bankTransactionRef && (
                    <div className="flex items-center justify-between text-[#287653] font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck size={13} aria-hidden="true" /> {r.bankTransactionRef} ({r.recipientBankAccount})
                      </span>
                      {r.transferReceiptUrl && (
                        <button
                          type="button"
                          onClick={() => void openAuthenticatedApiFile(`/api/orders/refunds/${r.id}/receipt`)}
                          className="text-[#A67C2E] hover:underline font-bold bg-transparent border-0 cursor-pointer"
                        >
                          {isEn ? 'Receipt' : 'Ủy nhiệm chi'}
                        </button>
                      )}
                    </div>
                  )}

                  {needsApproval && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busyAction === `approve-${r.id}` || waitingInsuranceBankForm}
                        title={
                          waitingInsuranceBankForm
                            ? isEn
                              ? 'Customer must submit beneficiary bank details first'
                              : 'Cần chờ khách hàng điền STK nhận tiền trước khi duyệt chi'
                            : undefined
                        }
                        onClick={() => void handleApproveRefund(r.id, 'approve')}
                        className="text-xs rounded-xl"
                      >
                        {isEn ? 'Approve Refund' : 'Duyệt hoàn tiền'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyAction === `approve-${r.id}`}
                        onClick={() => void handleApproveRefund(r.id, 'reject')}
                        className="text-xs rounded-xl text-[#B33E3E]"
                      >
                        {isEn ? 'Reject' : 'Từ chối'}
                      </Button>
                    </div>
                  )}

                  {canTransfer && (
                    <div className="pt-1">
                      {transferTargetId === r.id ? (
                        <form onSubmit={(e) => void handleTransferRefund(e, r.id)} className="p-2.5 rounded-lg bg-white border border-[#D8CEBE] flex flex-col gap-2">
                          <div className="text-[11px] bg-[#FAF8F4] border border-[#E5DDD0] rounded px-2.5 py-1.5 text-[#273244]">
                            <span className="font-bold text-[#181A17]">{isEn ? 'Transfer to:' : 'Chuyển khoản tới:'}</span>{' '}
                            {[r.recipientBankName, r.recipientBankAccount, r.recipientAccountHolder].filter(Boolean).join(' · ')}
                          </div>
                          <input
                            type="text"
                            required
                            placeholder={isEn ? 'Bank transaction reference' : 'Mã giao dịch ủy nhiệm chi *'}
                            value={bankTxRef}
                            onChange={(e) => setBankTxRef(e.target.value)}
                            className="h-8 px-2.5 rounded border border-[#D8CEBE]"
                          />
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setTransferFile(e.target.files?.[0] ?? null)}
                          />
                          {!transferFile && (
                            <input
                              type="url"
                              placeholder={isEn ? 'Or receipt URL (https://...)' : 'Hoặc URL chứng từ (https://...)'}
                              value={transferUrl}
                              onChange={(e) => setTransferUrl(e.target.value)}
                              className="h-8 px-2.5 rounded border border-[#D8CEBE]"
                            />
                          )}
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setTransferTargetId(null)}>
                              {isEn ? 'Cancel' : 'Hủy'}
                            </Button>
                            <Button type="submit" variant="primary" size="sm" disabled={busyAction === `transfer-${r.id}`}>
                              {isEn ? 'Confirm Transfer' : 'Xác nhận chuyển khoản'}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={waitingBankFormForTransfer}
                          title={
                            waitingBankFormForTransfer
                              ? isEn
                                ? 'Locked until customer submits bank account form'
                                : 'Đang chờ chủ ngựa cung cấp STK qua biểu mẫu hoàn tiền'
                              : undefined
                          }
                          onClick={() => setTransferTargetId(r.id)}
                          className="text-xs rounded-xl"
                        >
                          {waitingBankFormForTransfer
                            ? isEn ? 'Waiting Customer Bank Info' : 'Chờ khách cung cấp STK'
                            : isEn ? 'Confirm Bank Transfer' : 'Xác nhận đã chuyển khoản'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
