'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Clock,
  ExternalLink,
  Landmark,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient, openAuthenticatedApiFile } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/Button';

interface DisbursementItem {
  id: number;
  shipmentId: number;
  authorityName: string;
  feeType: string;
  amount: number;
  authorityReceiptUrl: string | null;
  notes: string | null;
  settledStatus: string;
  recordedByName?: string;
  createdAt: string;
}

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

export function ManagerOrderFinanceGovernanceCard({
  shipmentId,
  requestCode,
  orderStatus,
  bookingType,
  onUpdated,
}: Props) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const currentUser = getCurrentUser();
  const isAdmin = /admin/i.test(String(currentUser?.role || ''));

  const [disbursements, setDisbursements] = useState<DisbursementItem[]>([]);
  const [refunds, setRefunds] = useState<RefundRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Disbursement form
  const [showDisbForm, setShowDisbForm] = useState(false);
  const [authorityName, setAuthorityName] = useState('');
  const [feeType, setFeeType] = useState('');
  const [disbAmount, setDisbAmount] = useState('');
  const [disbReceiptUrl, setDisbReceiptUrl] = useState('');
  const [disbFile, setDisbFile] = useState<File | null>(null);

  // Operational cancel form
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelCategory, setCancelCategory] = useState('company_fault');
  const [cancelMode, setCancelMode] = useState<'cash_refund' | 'credit_30d'>('cash_refund');
  const [cancelAirCost, setCancelAirCost] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Charter upgrade form
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [charterCost, setCharterCost] = useState('');
  const [upgradeReason, setUpgradeReason] = useState('');

  // Grace reason
  const [graceReason, setGraceReason] = useState('');

  // Transfer form per refund ID
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [bankAccount, setBankAccount] = useState('');
  const [bankTxRef, setBankTxRef] = useState('');
  const [transferUrl, setTransferUrl] = useState('');
  const [transferFile, setTransferFile] = useState<File | null>(null);

  const loadFinanceData = useCallback(async () => {
    if (!Number.isInteger(shipmentId) || shipmentId <= 0) return;
    setLoading(true);
    try {
      const [disbRes, refRes] = await Promise.allSettled([
        apiClient<DisbursementItem[]>(`/orders/${shipmentId}/disbursements`),
        apiClient<RefundRecordItem[]>(`/orders/${shipmentId}/refunds`),
      ]);
      if (disbRes.status === 'fulfilled' && Array.isArray(disbRes.value)) {
        setDisbursements(disbRes.value);
      }
      if (refRes.status === 'fulfilled' && Array.isArray(refRes.value)) {
        setRefunds(refRes.value);
      }
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  const statusLower = String(orderStatus || '').toLowerCase();
  const canOperationalCancel = ['approved', 'planning', 'confirmed', 'ready_to_depart'].includes(statusLower);
  const canGrantGrace = ['planning', 'confirmed', 'ready_to_depart'].includes(statusLower);
  const canUpgradeCharter =
    bookingType === 'shared_stall' && ['approved', 'planning', 'confirmed', 'ready_to_depart'].includes(statusLower);

  const money = (v: number) => `${Number(v || 0).toLocaleString('vi-VN')} VND`;

  const handleCreateDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(disbAmount);
    if (!authorityName.trim() || !feeType.trim() || !Number.isInteger(numAmount) || numAmount <= 0) {
      toast.error(isEn ? 'Enter valid authority, fee type and positive VND amount.' : 'Nhập tên cơ quan, loại phí và số tiền VNĐ hợp lệ.');
      return;
    }
    setBusyAction('disbursement');
    try {
      if (disbFile) {
        const fd = new FormData();
        fd.append('authorityName', authorityName.trim());
        fd.append('feeType', feeType.trim());
        fd.append('amount', String(numAmount));
        fd.append('receipt', disbFile);
        await apiClient(`/orders/${shipmentId}/disbursements`, { method: 'POST', body: fd });
      } else {
        await apiClient(`/orders/${shipmentId}/disbursements`, {
          method: 'POST',
          body: JSON.stringify({
            authorityName: authorityName.trim(),
            feeType: feeType.trim(),
            amount: numAmount,
            ...(disbReceiptUrl.trim() ? { authorityReceiptUrl: disbReceiptUrl.trim() } : {}),
          }),
        });
      }
      toast.success(isEn ? 'Reimbursable disbursement recorded.' : 'Đã ghi nhận khoản phí ứng trước có biên lai.');
      setAuthorityName('');
      setFeeType('');
      setDisbAmount('');
      setDisbReceiptUrl('');
      setDisbFile(null);
      setShowDisbForm(false);
      await loadFinanceData();
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to record disbursement.' : 'Không thể ghi nhận phí ứng trước.'));
    } finally {
      setBusyAction(null);
    }
  };

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

  const handleGrantGrace = async () => {
    setBusyAction('grace');
    try {
      await apiClient(`/orders/${shipmentId}/payment-grace`, {
        method: 'POST',
        body: JSON.stringify({ reason: graceReason.trim() || 'Manager 1-time grace extension' }),
      });
      toast.success(isEn ? '1-time payment grace granted (MIN(now+10h, T-24h)).' : 'Đã cấp gia hạn thanh toán duy nhất 1 lần.');
      setGraceReason('');
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Cannot grant payment grace.' : 'Không thể cấp gia hạn thanh toán.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpgradeCharter = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = Number(charterCost);
    if (!Number.isInteger(cost) || cost <= 0) {
      toast.error(isEn ? 'Enter valid positive VND charter cost.' : 'Nhập cước bao xe VNĐ nguyên dương hợp lệ.');
      return;
    }
    setBusyAction('upgrade');
    try {
      const res = await apiClient<{ branch?: string }>(`/orders/${shipmentId}/upgrade-charter`, {
        method: 'POST',
        body: JSON.stringify({
          charterTransportCost: cost,
          reason: upgradeReason.trim() || 'D-3 Upgrade Shared Stall -> Dedicated Charter',
        }),
      });
      toast.success(
        isEn
          ? `Upgraded to Dedicated Charter (${res?.branch || 'updated'}).`
          : `Đã nâng cấp lên Bao nguyên xe (${res?.branch || 'thành công'}).`,
      );
      setShowUpgradeForm(false);
      setCharterCost('');
      setUpgradeReason('');
      await onUpdated();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Charter upgrade failed.' : 'Không thể nâng cấp lên bao nguyên xe.'));
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
    if (!bankAccount.trim() || !bankTxRef.trim()) {
      toast.error(isEn ? 'Bank account and transaction reference required.' : 'Nhập số tài khoản nhận và mã giao dịch chuyển khoản.');
      return;
    }
    setBusyAction(`transfer-${refundId}`);
    try {
      if (transferFile) {
        const fd = new FormData();
        fd.append('recipientBankAccount', bankAccount.trim());
        fd.append('bankTransactionRef', bankTxRef.trim());
        fd.append('receipt', transferFile);
        await apiClient(`/orders/refunds/${refundId}/transfer`, { method: 'POST', body: fd });
      } else {
        await apiClient(`/orders/refunds/${refundId}/transfer`, {
          method: 'POST',
          body: JSON.stringify({
            recipientBankAccount: bankAccount.trim(),
            bankTransactionRef: bankTxRef.trim(),
            ...(transferUrl.trim() ? { transferReceiptUrl: transferUrl.trim() } : {}),
          }),
        });
      }
      toast.success(isEn ? `Refund #${refundId} marked transferred.` : `Đã xác nhận giải ngân chuyển khoản #${refundId}.`);
      setTransferTargetId(null);
      setBankAccount('');
      setBankTxRef('');
      setTransferUrl('');
      setTransferFile(null);
      await loadFinanceData();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Transfer failed (check SoD separation).' : 'Không thể xác nhận chuyển khoản (kiểm tra tách nhiệm vụ SoD).'));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-[#181A17] flex items-center gap-2 m-0">
          <Landmark size={18} className="text-[#A67C2E]" aria-hidden="true" />
          <span>{isEn ? 'Finance, Disbursements & SLA Governance' : 'Tài Chính, Phí Ứng Trước & Điều Hành SLA'}</span>
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
      {(canGrantGrace || canUpgradeCharter || canOperationalCancel) && (
        <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E8E2D8]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C6658]">
            {isEn ? 'Operational Governance Controls' : 'Tác vụ xử lý ngoại lệ & SLA'}
          </span>
          <div className="flex flex-wrap gap-2">
            {canGrantGrace && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => void handleGrantGrace()}
                className="text-xs rounded-xl"
              >
                <Clock size={13} className="mr-1" aria-hidden="true" />
                {isEn ? 'Grant 1x Payment Grace' : 'Gia hạn thanh toán (1 lần)'}
              </Button>
            )}
            {canUpgradeCharter && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => setShowUpgradeForm((v) => !v)}
                className="text-xs rounded-xl"
              >
                <TrendingUp size={13} className="mr-1" aria-hidden="true" />
                {isEn ? 'Upgrade Shared → Charter' : 'Nâng cấp Bao nguyên xe'}
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

          {showUpgradeForm && (
            <form onSubmit={handleUpgradeCharter} className="mt-2 p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2.5 text-xs">
              <strong className="text-[#181A17]">{isEn ? 'D-3 Charter Upgrade Quote' : 'Báo giá nâng cấp Dedicated Charter (D-3)'}</strong>
              <input
                type="number"
                min={1}
                placeholder={isEn ? 'Charter Freight (VND)' : 'Giá cước bao nguyên xe (VND)'}
                value={charterCost}
                onChange={(e) => setCharterCost(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE]"
                required
              />
              <input
                type="text"
                placeholder={isEn ? 'Upgrade reason / notes' : 'Lý do nâng cấp'}
                value={upgradeReason}
                onChange={(e) => setUpgradeReason(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE]"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowUpgradeForm(false)}>
                  {isEn ? 'Cancel' : 'Đóng'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={busyAction === 'upgrade'}>
                  {busyAction === 'upgrade' && <Loader2 size={12} className="animate-spin mr-1" />}
                  {isEn ? 'Confirm Upgrade' : 'Xác nhận nâng cấp'}
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

      {/* Reimbursable Disbursements */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-[#181A17]">
            {isEn ? 'Agency Reimbursable Disbursements' : 'Phí cơ quan chức năng ứng trước'} ({disbursements.length})
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowDisbForm((v) => !v)} className="text-xs rounded-xl">
            <Plus size={12} className="mr-1" aria-hidden="true" />
            {isEn ? 'Add Disbursement' : 'Ghi nhận phí'}
          </Button>
        </div>

        {showDisbForm && (
          <form onSubmit={handleCreateDisbursement} className="p-3 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] flex flex-col gap-2 text-xs">
            <input
              type="text"
              required
              placeholder={isEn ? 'Authority name (e.g., Cục Thú Y)' : 'Cơ quan thu (VD: Cục Thú Y / Hải Quan)'}
              value={authorityName}
              onChange={(e) => setAuthorityName(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder={isEn ? 'Fee type (e.g., Kiểm dịch)' : 'Loại lệ phí'}
                value={feeType}
                onChange={(e) => setFeeType(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              />
              <input
                type="number"
                required
                min={1}
                placeholder={isEn ? 'Amount (VND)' : 'Số tiền (VND)'}
                value={disbAmount}
                onChange={(e) => setDisbAmount(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              />
            </div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setDisbFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            {!disbFile && (
              <input
                type="url"
                placeholder={isEn ? 'Or receipt URL (https://...)' : 'Hoặc URL biên lai (https://...)'}
                value={disbReceiptUrl}
                onChange={(e) => setDisbReceiptUrl(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowDisbForm(false)}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={busyAction === 'disbursement'}>
                {isEn ? 'Save Disbursement' : 'Lưu khoản phí'}
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-xs text-[#7E867B] m-0">{isEn ? 'Loading finance records...' : 'Đang tải dữ liệu tài chính...'}</p>
        ) : disbursements.length === 0 ? (
          <p className="text-xs text-[#7E867B] m-0">{isEn ? 'No agency disbursements recorded.' : 'Chưa có khoản phí ứng trước nào.'}</p>
        ) : (
          <div className="space-y-2">
            {disbursements.map((d) => (
              <div key={d.id} className="p-3 rounded-xl border border-[#EAE5DA] bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <strong className="text-[#181A17] block">{d.authorityName} — {d.feeType}</strong>
                  <span className="text-[#5C6658]">
                    {money(d.amount)} • <span className="uppercase font-semibold">{d.settledStatus}</span>
                  </span>
                </div>
                {d.authorityReceiptUrl && (
                  <button
                    type="button"
                    onClick={() => void openAuthenticatedApiFile(`/api/orders/disbursements/${d.id}/receipt`)}
                    className="inline-flex items-center gap-1 font-bold text-[#A67C2E] hover:underline bg-transparent border-0 cursor-pointer"
                  >
                    <ExternalLink size={12} aria-hidden="true" /> {isEn ? 'Receipt' : 'Biên lai'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refund SoD Records */}
      <div className="space-y-2.5 pt-2 border-t border-[#EAE5DA]">
        <span className="text-xs font-extrabold text-[#181A17] flex items-center gap-1.5">
          <Receipt size={14} className="text-[#A67C2E]" aria-hidden="true" />
          {isEn ? 'Refund Approval & SoD Payout Ledger' : 'Sổ Phê Duyệt & Hoàn Tiền Thủ Công (SoD)'} ({refunds.length})
        </span>

        {refunds.length === 0 ? (
          <p className="text-xs text-[#7E867B] m-0">{isEn ? 'No refund records.' : 'Chưa phát sinh hồ sơ hoàn tiền.'}</p>
        ) : (
          <div className="space-y-3">
            {refunds.map((r) => {
              const needsApproval = r.status === 'pending_approval' || r.status === 'pending_second_approval';
              const canTransfer = r.status === 'approved_for_transfer' && isAdmin;
              return (
                <div key={r.id} className="p-3.5 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#181A17]">
                      #{r.id} • {money(r.amount)} ({r.refundMode === 'credit_30d' ? 'Credit 30d' : 'Cash'})
                    </strong>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-[#D8CEBE] font-bold text-[11px] uppercase">
                      {r.status}
                    </span>
                  </div>
                  <div className="text-[#5C6658]">
                    {r.cancellationCategory} • {isEn ? 'Disbursement deducted:' : 'Khấu trừ nộp hộ:'}{' '}
                    <strong>{money(r.disbursementDeduction)}</strong>
                    {r.requiresDualApproval && (
                      <span className="ml-2 text-[#B33E3E] font-bold">• Dual Approval (&ge;20M)</span>
                    )}
                  </div>

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
                        disabled={busyAction === `approve-${r.id}`}
                        onClick={() => void handleApproveRefund(r.id, 'approve')}
                        className="text-xs rounded-xl"
                      >
                        {r.status === 'pending_second_approval'
                          ? isEn ? '2nd Approve (Dual)' : 'Duyệt lần 2 (Dual)'
                          : isEn ? 'Approve Refund' : 'Duyệt hoàn tiền'}
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
                          <input
                            type="text"
                            required
                            placeholder={isEn ? 'Recipient bank account' : 'Số tài khoản ngân hàng nhận'}
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            className="h-8 px-2.5 rounded border border-[#D8CEBE]"
                          />
                          <input
                            type="text"
                            required
                            placeholder={isEn ? 'Bank transaction reference' : 'Mã giao dịch ủy nhiệm chi'}
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
                          onClick={() => setTransferTargetId(r.id)}
                          className="text-xs rounded-xl"
                        >
                          {isEn ? 'Record Manual Transfer (Admin SoD)' : 'Xác nhận đã chuyển khoản (Admin SoD)'}
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
