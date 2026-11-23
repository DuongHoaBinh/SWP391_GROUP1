'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import { getAuthToken } from '@/lib/auth';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { SEVERITY_DEFINITIONS, Severity, vnd } from '@/features/orders/insurance-policy';

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
  createdAt: string;
  horseName?: string;
  requestCode?: string;
  customerName?: string;
  customerEmail?: string;
}

const STATUS_TABS = [
  { key: '', label: 'Tất cả' },
  { key: 'submitted', label: 'Chờ xem xét' },
  { key: 'under_review', label: 'Đang thẩm định' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Đã từ chối' },
  { key: 'paid', label: 'Đã chi trả' },
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
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải tệp.');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D8CEBE] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#181A17] flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-[#8C7A5B]" />
            Quản Lý & Thẩm Định Bồi Thường Bảo Hiểm
          </h1>
          <p className="text-xs text-[#5B6779] mt-1">
            Xem xét các yêu cầu bồi thường theo mức độ sự cố M1–M4, đối soát số tiền gợi ý và phê duyệt chi trả.
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
                {tab.label}
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
            placeholder="Tìm theo mã đơn, tên ngựa, khách..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-xs text-[#181A17] focus:outline-none focus:border-[#181A17]"
          />
        </div>
      </div>

      {/* Main Grid: Claims List & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Claims List */}
        <div className="lg:col-span-5 space-y-3">
          {isLoading ? (
            <div className="p-8 text-center bg-white rounded-xl border border-[#D8CEBE]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#8C7A5B]" />
              <p className="text-xs text-[#7D8A99] mt-2">Đang tải danh sách bồi thường...</p>
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-[#D8CEBE] text-xs text-[#7D8A99]">
              Không tìm thấy yêu cầu bồi thường nào.
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
        <div className="lg:col-span-7">
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
                  Trạng thái: {activeClaim.status}
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

              {/* Dual-approval & SoD notice */}
              {Number(approvedAmount || activeClaim.suggestedAmount) >= 20000000 && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <strong>Cảnh báo Dual-Approval & SoD (≥ 20.000.000 VNĐ):</strong>
                    <p className="mt-0.5 text-amber-800">
                      Khoản duyệt này sẽ tự động tạo hồ sơ hoàn tiền yêu cầu <strong>phê duyệt 2 cấp</strong> độc lập và lệnh chuyển khoản do <strong>Admin</strong> thực hiện (người chuyển không trùng người duyệt).
                    </p>
                  </div>
                </div>
              )}

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
                <div className="border-t border-[#E8E2D8] pt-4 text-xs text-[#5B6779] bg-[#FAF8F5] p-3 rounded-lg">
                  <strong>Kết quả xử lý:</strong> Hồ sơ đã được quyết định ({activeClaim.status}).
                  {activeClaim.decisionReason && (
                    <p className="mt-1">
                      Lý do: <em>{activeClaim.decisionReason}</em>
                    </p>
                  )}
                  {activeClaim.refundRecordId && (
                    <p className="mt-1 text-emerald-700 font-semibold">
                      Hồ sơ hoàn tiền liên kết: #{activeClaim.refundRecordId}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-[#D8CEBE] text-xs text-[#7D8A99]">
              Chọn một yêu cầu bồi thường từ danh sách bên trái để xem chi tiết và thẩm định.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
