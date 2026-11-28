'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { getAuthToken } from '@/lib/auth';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { SEVERITY_DEFINITIONS, Severity, vnd } from '@/features/orders/insurance-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface InsuranceClaim {
  id: number;
  shipmentId: number;
  shipmentHorseId: number;
  customerId: number;
  severity: Severity;
  description: string;
  vetCostVnd: number | null;
  evidenceUrls: string[];
  requestedAmount: number;
  suggestedAmount: number;
  approvedAmount: number | null;
  policyVersion: string;
  packageCode: 'basic' | 'standard' | 'premium';
  declaredValueVnd: number;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';
  rejectionReasonCode: string | null;
  decisionReason: string | null;
  decidedBy: number | null;
  decidedAt: string | null;
  refundRecordId: number | null;
  refundStatus?: string | null;
  refundBankName?: string | null;
  refundAccountNumber?: string | null;
  refundAccountHolder?: string | null;
  refundCustomerNote?: string | null;
  refundFormSubmittedAt?: string | null;
  refundSlaDueAt?: string | null;
  refundBankTransactionRef?: string | null;
  refundTransferReceiptUrl?: string | null;
  createdAt: string;
  horseName?: string;
  requestCode?: string;
  customerName?: string;
  customerEmail?: string;
}

const STATUS_TABS = [
  { key: '', labelVi: 'Tất cả', labelEn: 'All' },
  { key: 'submitted', labelVi: 'Chờ xem xét', labelEn: 'Submitted' },
  { key: 'under_review', labelVi: 'Đang thẩm định', labelEn: 'Under Review' },
  { key: 'approved', labelVi: 'Đã duyệt', labelEn: 'Approved' },
  { key: 'rejected', labelVi: 'Đã từ chối', labelEn: 'Rejected' },
  { key: 'paid', labelVi: 'Đã chi trả', labelEn: 'Paid' },
];

const REJECTION_REASONS = [
  { code: 'pre_existing_condition', label: 'Bệnh lý có sẵn trước khi vận chuyển' },
  { code: 'false_declaration', label: 'Khai báo sai lệch giá trị hoặc hồ sơ hộ chiếu' },
  { code: 'customer_caused', label: 'Sự cố do lỗi từ phía chủ ngựa / người của khách' },
  { code: 'leg_not_operated_by_company', label: 'Chặng vận chuyển không do EquiTransit vận hành' },
  { code: 'insufficient_evidence', label: 'Không đủ bằng chứng / thiếu hóa đơn thú y' },
  { code: 'out_of_window', label: 'Quá thời hạn khiếu nại quy định (72 giờ)' },
  { code: 'other', label: 'Lý do nghiệp vụ khác' },
];

export default function ManagerInsuranceClaimsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeClaim, setActiveClaim] = useState<InsuranceClaim | null>(null);

  // Review Form States
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [rejectionCode, setRejectionCode] = useState<string>('insufficient_evidence');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');

  const url = selectedStatus
    ? `/insurance/claims?status=${selectedStatus}`
    : '/insurance/claims';

  const { data: claims, error, mutate, isLoading } = useSWR<InsuranceClaim[]>(url, (u: string) =>
    apiClient<InsuranceClaim[]>(u),
  );

  const filteredClaims = (claims || []).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.requestCode?.toLowerCase().includes(q) ||
      c.horseName?.toLowerCase().includes(q) ||
      c.customerName?.toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  });

  const handleOpenClaim = (c: InsuranceClaim) => {
    setActiveClaim(c);
    setApprovedAmount(String(c.suggestedAmount || ''));
    setReason('');
    setActionError('');
    setActionSuccess('');
  };

  const handleReviewAction = async (decision: 'start_review' | 'approve' | 'reject') => {
    if (!activeClaim || isSubmitting) return;

    if (decision === 'approve') {
      const num = Number(approvedAmount);
      if (!num || num <= 0) {
        setActionError('Vui lòng nhập số tiền phê duyệt lớn hơn 0.');
        return;
      }
      if (num !== activeClaim.suggestedAmount && !reason.trim()) {
        setActionError('Bắt buộc nhập lý do chi tiết khi duyệt số tiền khác số tiền gợi ý.');
        return;
      }
    }

    if (decision === 'reject') {
      if (!rejectionCode) {
        setActionError('Vui lòng chọn mã lý do từ chối.');
        return;
      }
      if (!reason.trim()) {
        setActionError('Vui lòng nhập lý do chi tiết từ chối yêu cầu.');
        return;
      }
    }

    setIsSubmitting(true);
    setActionError('');
    setActionSuccess('');

    try {
      await apiClient(`/insurance/claims/${activeClaim.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          approvedAmount: decision === 'approve' ? Number(approvedAmount) : undefined,
          rejectionReasonCode: decision === 'reject' ? rejectionCode : undefined,
          reason: reason.trim() || undefined,
        }),
      });

      setActionSuccess(
        decision === 'start_review'
          ? 'Đã chuyển hồ sơ sang trạng thái đang thẩm định.'
          : decision === 'approve'
            ? 'Đã phê duyệt yêu cầu bồi thường và khởi tạo hồ sơ hoàn tiền thành công.'
            : 'Đã từ chối yêu cầu bồi thường.',
      );

      await mutate();
      // Re-fetch updated claim
      const updated = await apiClient<any>(`/insurance/claims/${activeClaim.id}`);
      setActiveClaim(updated.claim);
    } catch (err: any) {
      setActionError(err.message || 'Xử lý thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadEvidence = (claimId: number, idx: number, fileName: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
    const token = getAuthToken();

    fetch(`${baseUrl}/insurance/claims/${claimId}/evidence/${idx}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Không thể tải tệp chứng từ.');
        const contentType = res.headers.get('content-type') || '';
        const blob = await res.blob();
        let ext = '';
        if (contentType.includes('image/jpeg')) ext = '.jpg';
        else if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/webp')) ext = '.webp';
        else if (contentType.includes('application/pdf')) ext = '.pdf';
        const finalName = ext && fileName.endsWith('.pdf') && ext !== '.pdf'
          ? fileName.replace(/\.pdf$/i, ext)
          : fileName;
        return { blob, finalName };
      })
      .then(({ blob, finalName }) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      })
      .catch((err) => toast.error(err?.message || 'Không thể tải tệp chứng từ.'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D8CEBE] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#181A17] flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-[#8C7A5B]" />
            {isEn ? 'Insurance Claims Assessment & Approval' : 'Quản Lý & Thẩm Định Bồi Thường Bảo Hiểm'}
          </h1>
          <p className="text-xs text-[#5B6779] mt-1">
            {isEn
              ? 'Review incident claims across severity tiers, verify suggested payouts, and approve disbursements.'
              : 'Xem xét các yêu cầu bồi thường theo mức độ sự cố, đối soát số tiền gợi ý và phê duyệt chi trả.'}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 bg-[#F4F1EA] p-1 rounded-xl w-full md:w-auto">
          {STATUS_TABS.map((tab) => {
            const isSelected = selectedStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedStatus(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected ? 'bg-[#181A17] text-white shadow-sm' : 'text-[#5B6779] hover:text-[#181A17]'
                }`}
              >
                {isEn ? tab.labelEn : tab.labelVi}
              </button>
            );
          })}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#7D8A99]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search by order code, horse, customer...' : 'Tìm theo mã đơn, tên ngựa, khách...'}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-xs text-[#181A17] focus:outline-none focus:border-[#181A17]"
          />
        </div>
      </div>

      {/* Main Grid: Claims List & Detail Inspector */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Claims List */}
        <div className="md:col-span-5 space-y-3">
          {isLoading ? (
            <div className="p-8 text-center bg-white rounded-xl border border-[#D8CEBE]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#8C7A5B]" />
              <p className="text-xs text-[#7D8A99] mt-2">
                {isEn ? 'Loading insurance claims...' : 'Đang tải danh sách bồi thường...'}
              </p>
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-[#D8CEBE] text-xs text-[#7D8A99]">
              {isEn ? 'No insurance claims found.' : 'Không tìm thấy yêu cầu bồi thường nào.'}
            </div>
          ) : (
            filteredClaims.map((claim) => {
              const isSelected = activeClaim?.id === claim.id;
              const sev = claim.severity;
              return (
                <div
                  key={claim.id}
                  onClick={() => handleOpenClaim(claim)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#181A17] bg-[#FAF8F5] shadow-md ring-1 ring-[#181A17]'
                      : 'border-[#D8CEBE] bg-white hover:bg-[#FDFBF7]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#181A17]">
                      {claim.requestCode} · Ngựa {claim.horseName}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        claim.status === 'submitted'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : claim.status === 'under_review'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : claim.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : claim.status === 'paid'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {claim.status === 'submitted'
                        ? 'Chờ xem xét'
                        : claim.status === 'under_review'
                          ? 'Đang thẩm định'
                          : claim.status === 'approved'
                            ? 'Đã duyệt'
                            : claim.status === 'paid'
                              ? 'Đã chi trả'
                              : 'Từ chối'}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-xs text-[#5B6779]">
                    <span className="font-semibold px-1.5 py-0.5 rounded bg-[#EAE5D9] text-[#181A17]">
                      Mức {sev}
                    </span>
                    <span>Gói {claim.packageCode === 'premium' ? 'Toàn diện' : claim.packageCode === 'standard' ? 'Tiêu chuẩn' : 'Cơ bản'}</span>
                    <span>· Khách: {claim.customerName || `#${claim.customerId}`}</span>
                  </div>

                  <p className="mt-2 text-xs text-[#5B6779] line-clamp-2">
                    {claim.description}
                  </p>

                  <div className="mt-3 pt-2 border-t border-[#E8E2D8] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-[#7D8A99] block">Yêu cầu:</span>
                      <strong className="text-[#181A17]">{vnd(claim.requestedAmount)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#7D8A99] block">Gợi ý hệ thống:</span>
                      <strong className="text-[#8C7A5B]">{vnd(claim.suggestedAmount)}</strong>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Claim Inspector & Decision Form */}
        <div className="md:col-span-7">
          {activeClaim ? (
            <div className="space-y-5 rounded-2xl border border-[#D8CEBE] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#181A17]">
                    Chi tiết Hồ sơ Bồi thường #{activeClaim.id} ({activeClaim.requestCode})
                  </h3>
                  <p className="text-xs text-[#5B6779]">
                    Tạo lúc: {new Date(activeClaim.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    activeClaim.status === 'submitted'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : activeClaim.status === 'under_review'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : activeClaim.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeClaim.status === 'paid'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {activeClaim.status === 'submitted'
                    ? 'Chờ xem xét'
                    : activeClaim.status === 'under_review'
                      ? 'Đang thẩm định'
                      : activeClaim.status === 'approved'
                        ? 'Đã duyệt'
                        : activeClaim.status === 'paid'
                          ? 'Đã chi trả'
                          : 'Từ chối'}
                </span>
              </div>

              {/* Horse & Insurance Context */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-[#FAF8F5] rounded-xl border border-[#E8E2D8] text-xs">
                <div>
                  <span className="text-[#7D8A99] block">Cá thể ngựa:</span>
                  <strong className="text-[#181A17]">{activeClaim.horseName}</strong>
                </div>
                <div>
                  <span className="text-[#7D8A99] block">Giá trị khai báo:</span>
                  <strong className="text-[#181A17]">{vnd(activeClaim.declaredValueVnd)}</strong>
                </div>
                <div>
                  <span className="text-[#7D8A99] block">Gói bảo hiểm:</span>
                  <strong className="text-[#181A17]">
                    {activeClaim.packageCode === 'premium' ? 'Toàn diện (3%)' : activeClaim.packageCode === 'standard' ? 'Tiêu chuẩn (1.5%)' : 'Cơ bản (0%)'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#7D8A99] block">Mức độ sự cố:</span>
                  <strong className="text-[#8C7A5B]">Mức {activeClaim.severity} ({SEVERITY_DEFINITIONS[activeClaim.severity].nameVi})</strong>
                </div>
                <div>
                  <span className="text-[#7D8A99] block">Chi phí thú y thực tế:</span>
                  <strong className="text-[#181A17]">{activeClaim.vetCostVnd ? vnd(activeClaim.vetCostVnd) : 'Không khai báo'}</strong>
                </div>
                <div>
                  <span className="text-[#7D8A99] block">Phiên bản chính sách:</span>
                  <span className="text-[#5B6779] font-mono">{activeClaim.policyVersion}</span>
                </div>
              </div>

              {/* Customer Description */}
              <div className="space-y-1 text-xs">
                <span className="font-bold text-[#181A17] block">Mô tả của khách hàng:</span>
                <div className="p-3 bg-white rounded-lg border border-[#E8E2D8] text-[#5B6779] leading-relaxed">
                  {activeClaim.description}
                </div>
              </div>

              {/* Evidence Files */}
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-[#181A17] block">Tệp bằng chứng đính kèm ({activeClaim.evidenceUrls.length}):</span>
                {activeClaim.evidenceUrls.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeClaim.evidenceUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg border border-[#D8CEBE] bg-[#FAF8F5]"
                      >
                        <span className="truncate max-w-[70%] font-medium text-[#181A17] flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-[#8C7A5B]" />
                          Bằng chứng #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadEvidence(activeClaim.id, idx, `evidence-${activeClaim.id}-${idx + 1}.pdf`)}
                          className="text-xs text-[#8C7A5B] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          Xem / Tải
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#7D8A99] italic">Không có tệp bằng chứng đính kèm.</p>
                )}
              </div>

              {/* Suggested Payout Box */}
              <div className="rounded-xl border border-[#D8CEBE] bg-[#F4F1EA] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-[#5B6779]">Số tiền hệ thống gợi ý theo Rule:</span>
                    <div className="text-lg font-extrabold text-[#8C7A5B]">{vnd(activeClaim.suggestedAmount)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApprovedAmount(String(activeClaim.suggestedAmount))}
                    className="text-xs px-2.5 py-1 bg-white border border-[#D8CEBE] rounded-lg font-bold text-[#181A17] hover:bg-[#FAF8F5] cursor-pointer"
                  >
                    Dùng gợi ý
                  </button>
                </div>
                <p className="text-[11px] text-[#7D8A99]">
                  Khách hàng yêu cầu: <strong>{vnd(activeClaim.requestedAmount)}</strong>
                </p>
              </div>

              {/* Payout flow notice */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#FAF8F4] border border-[#DFCA9A] text-[#6B5016] text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#A67C2E]" />
                <div>
                  <strong>Quy trình chi trả bồi thường:</strong>
                  <p className="mt-0.5 text-[#5C6658]">
                    Sau khi bạn phê duyệt mức bồi thường, chủ ngựa sẽ điền thông tin tài khoản ngân hàng qua biểu mẫu nhận tiền. Khi có đủ STK, Quản lý vận hành duyệt chi và xác nhận chuyển khoản kèm ủy nhiệm chi ngay tại trang chi tiết đơn hàng.
                  </p>
                </div>
              </div>

              {/* Review Actions Form */}
              {['submitted', 'under_review'].includes(activeClaim.status) ? (
                <div className="border-t border-[#E8E2D8] pt-4 space-y-4">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#181A17]">
                    Thao tác xử lý hồ sơ
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#181A17] mb-1">
                        Số tiền phê duyệt (VNĐ)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={approvedAmount}
                        onChange={(e) => setApprovedAmount(e.target.value)}
                        placeholder="Ví dụ: 30000000"
                        className="w-full rounded-lg border border-[#D8CEBE] bg-white px-3 py-2 text-xs font-semibold text-[#181A17] focus:border-[#181A17] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#181A17] mb-1">
                        Mã lý do (nếu từ chối)
                      </label>
                      <select
                        value={rejectionCode}
                        onChange={(e) => setRejectionCode(e.target.value)}
                        className="w-full rounded-lg border border-[#D8CEBE] bg-white px-3 py-2 text-xs text-[#181A17] focus:border-[#181A17] focus:outline-none"
                      >
                        {REJECTION_REASONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#181A17] mb-1">
                      Lý do quyết định / Ghi chú thẩm định (Bắt buộc khi từ chối hoặc duyệt khác gợi ý)
                    </label>
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Nêu rõ căn cứ y tế, đối soát hóa đơn hoặc lý do từ chối..."
                      className="w-full rounded-lg border border-[#D8CEBE] bg-white p-2.5 text-xs text-[#181A17] focus:border-[#181A17] focus:outline-none"
                    />
                  </div>

                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{actionError}</span>
                    </div>
                  )}

                  {actionSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{actionSuccess}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                    {activeClaim.status === 'submitted' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleReviewAction('start_review')}
                        className="px-3.5 py-2 rounded-lg border border-[#D8CEBE] text-xs font-semibold text-[#181A17] hover:bg-[#F0EEE8] cursor-pointer"
                      >
                        Bắt đầu xem xét
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleReviewAction('reject')}
                      className="px-4 py-2 rounded-lg bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                      Từ chối bồi thường
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleReviewAction('approve')}
                      className="px-5 py-2 rounded-lg bg-[#181A17] text-xs font-bold text-white hover:bg-[#242722] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Duyệt bồi thường
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-[#E8E2D8] pt-4 space-y-3 text-xs text-[#5B6779]">
                  <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E8E2D8]">
                    <strong className="text-[#181A17]">Kết quả xử lý:</strong> Hồ sơ đã được quyết định ({activeClaim.status}).
                    {activeClaim.approvedAmount !== null && (
                      <p className="mt-1 mb-0">
                        Số tiền duyệt bồi thường: <strong className="text-emerald-700">{vnd(activeClaim.approvedAmount)}</strong>
                      </p>
                    )}
                    {activeClaim.decisionReason && (
                      <p className="mt-1 mb-0">
                        Lý do: <em>{activeClaim.decisionReason}</em>
                      </p>
                    )}
                    {activeClaim.refundRecordId && (
                      <p className="mt-1 mb-0 text-emerald-700 font-semibold">
                        Hồ sơ hoàn tiền liên kết: #{activeClaim.refundRecordId} ({activeClaim.refundStatus || 'pending_approval'})
                      </p>
                    )}
                  </div>

                  {['approved', 'paid'].includes(activeClaim.status) && activeClaim.refundRecordId && (
                    <div
                      className={`p-3.5 rounded-xl border space-y-1.5 ${
                        activeClaim.refundFormSubmittedAt
                          ? 'bg-[#F2F9F4] border-[#B7DBC4] text-[#1E563B]'
                          : 'bg-[#FFF9EB] border-[#DFCA9A] text-[#7A5616]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="flex items-center gap-1.5 text-[#181A17]">
                          <Building2 className="h-4 w-4 text-[#A67C2E]" />
                          Thông tin tài khoản nhận bồi thường của khách hàng
                        </strong>
                        <Link
                          href={`/manager/requests/${activeClaim.shipmentId}`}
                          className="inline-flex items-center gap-1 font-bold text-[#A67C2E] hover:underline no-underline"
                        >
                          <span>Mở Sổ hoàn tiền đơn</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>

                      {activeClaim.refundFormSubmittedAt ? (
                        <div className="text-[#273244] space-y-1 pt-1">
                          <p className="m-0">
                            <strong>Ngân hàng:</strong> {activeClaim.refundBankName}
                          </p>
                          <p className="m-0">
                            <strong>Số tài khoản:</strong>{' '}
                            <span className="font-mono font-bold text-[#181A17]">{activeClaim.refundAccountNumber}</span>
                          </p>
                          <p className="m-0">
                            <strong>Chủ tài khoản:</strong> {activeClaim.refundAccountHolder}
                          </p>
                          <p className="m-0 text-[11px] text-[#5B6779]">
                            Khách đã nộp lúc: {new Date(activeClaim.refundFormSubmittedAt).toLocaleString('vi-VN')}
                            {activeClaim.refundSlaDueAt
                              ? ` · Hạn SLA: ${new Date(activeClaim.refundSlaDueAt).toLocaleDateString('vi-VN')}`
                              : ''}
                          </p>
                          {activeClaim.refundBankTransactionRef && (
                            <p className="m-0 text-emerald-700 font-semibold">
                              Mã GD chuyển khoản: {activeClaim.refundBankTransactionRef}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="m-0 pt-0.5">
                          Hệ thống đã gửi thông báo &amp; biểu mẫu nhận tiền tới khách hàng. Đang chờ khách hàng điền thông tin tài khoản ngân hàng trước khi duyệt chi.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-[#D8CEBE] text-xs text-[#7D8A99]">
              {isEn
                ? 'Select a claim from the list on the left to view details and evaluate.'
                : 'Chọn một yêu cầu bồi thường từ danh sách bên trái để xem chi tiết và thẩm định.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
