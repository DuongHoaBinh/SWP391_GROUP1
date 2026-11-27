'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { apiClient, openAuthenticatedApiFile } from '@/lib/api-client';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  DollarSign,
  FileText,
  Info,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatVietnamDateTime } from '@/features/orders/prepaid-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const POPULAR_BANKS = [
  'Vietcombank (VCB)',
  'VietinBank (CTG)',
  'BIDV',
  'MBBank (MB)',
  'Techcombank (TCB)',
  'ACB',
  'VPBank (VPB)',
  'TPBank (TPB)',
  'Sacombank (STB)',
  'HDBank (HDB)',
  'VIB',
  'MSB',
  'SHB',
  'OTHER',
];

function CustomerRefundPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const isEn = language === 'en';
  const id = params?.id as string;
  const claimIdParam = searchParams?.get('claimId');
  const claimId = claimIdParam && /^\d+$/.test(claimIdParam) ? Number(claimIdParam) : null;
  const isClaimMode = claimId !== null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<any>(null);

  // Form state
  const [selectedBank, setSelectedBank] = useState<string>(POPULAR_BANKS[0]);
  const [customBankName, setCustomBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');

  const loadData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    const endpoint = isClaimMode
      ? `/insurance/claims/${claimId}/refund-form`
      : `/orders/${id}/refund-form`;
    apiClient<any>(endpoint)
      .then((res) => {
        setInfo(res);
      })
      .catch((err) => {
        const msg =
          err?.message ||
          (isEn ? 'Unable to load refund information.' : 'Không thể tải thông tin hoàn tiền.');
        setLoadError(msg);
        setInfo(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, isEn, isClaimMode, claimId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const payoutAmount = isClaimMode
    ? Number(info?.approvedAmount || 0)
    : Number(info?.totalPaidAmount || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;
    if (!confirmed) {
      toast.error(isEn ? 'Please confirm the refund amount.' : 'Vui lòng tích xác nhận số tiền nhận.');
      return;
    }
    const bankName = selectedBank === 'OTHER' ? customBankName.trim() : selectedBank;
    if (!bankName) {
      toast.error(isEn ? 'Please select or enter a bank name.' : 'Vui lòng chọn hoặc nhập tên ngân hàng.');
      return;
    }
    if (!/^\d{6,20}$/.test(accountNumber.trim())) {
      toast.error(
        isEn
          ? 'Bank account number must be 6–20 digits.'
          : 'Số tài khoản ngân hàng phải gồm từ 6 đến 20 chữ số.',
      );
      return;
    }
    if (!accountHolder.trim()) {
      toast.error(
        isEn ? 'Please enter the account holder name.' : 'Vui lòng nhập họ tên chủ tài khoản ngân hàng.',
      );
      return;
    }

    try {
      setSubmitting(true);
      const submitEndpoint = isClaimMode
        ? `/insurance/claims/${claimId}/refund-form`
        : `/orders/${id}/refund-form`;
      await apiClient(submitEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          bankName,
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim().toUpperCase(),
          confirmAmount: payoutAmount,
          note: note.trim() || undefined,
        }),
      });
      toast.success(
        isClaimMode
          ? isEn
            ? 'Insurance payout bank details submitted successfully!'
            : 'Gửi thông tin tài khoản nhận bồi thường bảo hiểm thành công!'
          : isEn
            ? 'Refund bank details submitted successfully!'
            : 'Gửi thông tin nhận hoàn tiền thành công!',
      );
      loadData();
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isEn ? 'Failed to submit refund form.' : 'Gửi biểu mẫu hoàn tiền thất bại.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#A67C2E]" />
          <p className="text-sm font-medium text-[#5F6977]">
            {isEn ? 'Loading refund details...' : 'Đang tải thông tin hoàn tiền...'}
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-2xl border border-[#D8CEBE] p-6 sm:p-8 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#B33E3E] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold text-[#181A17] m-0">
            {isEn ? 'Unable to load refund form' : 'Chưa thể tải biểu mẫu hoàn tiền'}
          </h1>
          <p className="text-sm text-[#5F6977] m-0 leading-relaxed">
            {loadError ||
              (isEn
                ? 'This order or claim could not be found or is not eligible for refund bank submission.'
                : 'Không tìm thấy đơn hàng / hồ sơ bồi thường hoặc chưa đủ điều kiện nộp thông tin hoàn tiền.')}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              href={`/customer/requests/${id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold hover:bg-[#2C2F2A] no-underline"
            >
              <ArrowLeft size={14} />
              <span>{isEn ? 'Back to Order Details' : 'Quay lại chi tiết đơn'}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const existingRefund = info.refundRecord;
  const hasSubmittedBankForm = isClaimMode
    ? Boolean(existingRefund?.formSubmittedAt)
    : Boolean(existingRefund);
  const orderStatusLower = String(info.status || '').toLowerCase();
  const claimStatusLower = String(info.claimStatus || '').toLowerCase();
  const isRefundEligible = isClaimMode
    ? ['approved', 'paid'].includes(claimStatusLower) && Boolean(existingRefund)
    : Boolean(existingRefund) ||
      orderStatusLower === 'refund_requested' ||
      orderStatusLower === 'refunded';

  if (!isRefundEligible) {
    return (
      <div className="max-w-2xl mx-auto py-6 space-y-4">
        <Link
          href={`/customer/requests/${id}?tab=payment`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F6977] hover:text-[#181A17] no-underline"
        >
          <ArrowLeft size={14} />
          <span>{isEn ? 'Back to Order Details' : 'Quay lại chi tiết đơn'}</span>
        </Link>

        <div className="bg-white rounded-2xl border border-[#D8CEBE] p-6 sm:p-8 text-center shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF8F4] border border-[#DFCA9A] text-[#A67C2E] flex items-center justify-center mx-auto">
            <Info className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold text-[#181A17] m-0">
            {isClaimMode
              ? isEn
                ? `Insurance Claim #${claimId} is not ready for payout`
                : `Hồ sơ bồi thường #${claimId} hiện chưa ở trạng thái nhận chi trả`
              : isEn
                ? `Order #${id} is not in refund status`
                : `Đơn hàng #${id} hiện không ở trạng thái hoàn tiền`}
          </h1>
          <p className="text-sm text-[#5F6977] m-0 leading-relaxed max-w-lg mx-auto">
            {isClaimMode
              ? isEn
                ? 'The insurance payout bank form opens once Logistics Manager approves your claim.'
                : 'Biểu mẫu nhập tài khoản nhận bồi thường bảo hiểm chỉ khả dụng sau khi Quản lý vận hành phê duyệt hồ sơ bồi thường.'
              : isEn
                ? 'The 100% refund bank form is only available when Logistics Manager marks an order as unable to fulfill (refund_requested) or a refund record exists.'
                : 'Biểu mẫu nhập tài khoản nhận hoàn tiền 100% chỉ khả dụng khi Quản lý vận hành xác nhận không thể đáp ứng chuyến đi hoặc đơn đã phát sinh hồ sơ hoàn tiền.'}
          </p>
          <div className="pt-3">
            <Link
              href={`/customer/requests/${id}?tab=payment`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold hover:bg-[#2C2F2A] no-underline"
            >
              <span>{isEn ? 'Return to Order Detail' : 'Về chi tiết đơn hàng'}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-10 space-y-6">
      {/* Back Link */}
      <div>
        <Link
          href={`/customer/requests/${id}?tab=payment`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F6977] hover:text-[#181A17] no-underline transition-colors"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{isEn ? 'Back to Order Details' : 'Quay lại chi tiết đơn hàng'}</span>
        </Link>
      </div>

      {/* Header Alert Card */}
      <div className="bg-[#FFF9EB] border border-[#DFCA9A] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-[#F5E6C4] text-[#8C6621] shrink-0">
            {isClaimMode ? (
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#181A17] m-0">
              {isClaimMode
                ? isEn
                  ? `Insurance Payout Bank Form · Claim #${claimId} (${info.requestCode || `#${id}`})`
                  : `Biểu Mẫu Nhận Tiền Bồi Thường Bảo Hiểm · Hồ Sơ #${claimId} (${info.requestCode || `#${id}`})`
                : isEn
                  ? `100% Refund Notice for Order #${id}`
                  : `Thông Báo Hoàn Tiền 100% Cho Đơn Hàng #${id}`}
            </h1>
            <p className="text-xs sm:text-sm text-[#4A4338] mt-1.5 mb-0 leading-relaxed">
              {isClaimMode ? (
                isEn ? (
                  <>
                    Your insurance claim for horse <strong className="text-[#181A17]">{info.horseName}</strong> (Level{' '}
                    <strong className="text-[#181A17]">{info.severity}</strong>) has been approved. Please submit your beneficiary
                    bank account below to receive <strong className="text-[#181A17]">{payoutAmount.toLocaleString('vi-VN')} VND</strong>{' '}
                    within <strong className="text-[#181A17]">3–5 business days</strong>.
                  </>
                ) : (
                  <>
                    Yêu cầu bồi thường bảo hiểm cho ngựa <strong className="text-[#181A17]">{info.horseName}</strong> (Mức{' '}
                    <strong className="text-[#181A17]">{info.severity}</strong>) đã được phê duyệt. Vui lòng cung cấp thông tin
                    tài khoản ngân hàng thụ hưởng bên dưới để nhận khoản bồi thường{' '}
                    <strong className="text-[#181A17]">{payoutAmount.toLocaleString('vi-VN')} VND</strong> trong vòng{' '}
                    <strong className="text-[#181A17]">3–5 ngày làm việc</strong>.
                  </>
                )
              ) : isEn ? (
                <>
                  We apologize that we cannot fulfill this transport request at this time. Under our service guarantee, you will receive a{' '}
                  <strong className="text-[#181A17]">100% refund of your paid amount</strong> to your bank account within{' '}
                  <strong className="text-[#181A17]">3–5 business days</strong>.
                </>
              ) : (
                <>
                  Rất tiếc công ty hiện chưa thể đáp ứng yêu cầu vận chuyển của bạn. Theo cam kết dịch vụ, bạn sẽ được hoàn trả{' '}
                  <strong className="text-[#181A17]">100% số tiền đã thanh toán</strong> vào tài khoản ngân hàng trong vòng{' '}
                  <strong className="text-[#181A17]">3–5 ngày làm việc</strong>.
                </>
              )}
            </p>
            {isClaimMode && info.decisionReason && (
              <div className="mt-3 p-3 bg-white rounded-xl text-xs text-[#273244] border border-[#E5DDD0]">
                <strong className="text-[#181A17]">{isEn ? 'Manager Approval Note:' : 'Ghi chú phê duyệt của Quản lý:'}</strong>{' '}
                {info.decisionReason}
              </div>
            )}
            {!isClaimMode && info.cannotFulfilReason && (
              <div className="mt-3 p-3 bg-white rounded-xl text-xs text-[#273244] border border-[#E5DDD0] space-y-1">
                <p className="m-0">
                  <strong className="text-[#181A17]">{isEn ? 'Reason:' : 'Lý do từ chối:'}</strong>{' '}
                  {info.cannotFulfilReason}
                </p>
                {info.cannotFulfilNote && (
                  <p className="m-0">
                    <strong className="text-[#181A17]">{isEn ? 'Explanation:' : 'Ghi chú giải trình:'}</strong>{' '}
                    {info.cannotFulfilNote}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund / Payout Breakdown Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#D8CEBE] p-5 sm:p-6">
        <h2 className="text-base font-extrabold text-[#181A17] mb-4 mt-0 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[#287653]" aria-hidden="true" />
          <span>
            {isClaimMode
              ? isEn
                ? 'Approved Insurance Payout Summary'
                : 'Chi Tiết Khoản Bồi Thường Bảo Hiểm'
              : isEn
                ? '100% Refund Breakdown'
                : 'Chi Tiết Khoản Hoàn Tiền (100%)'}
          </span>
        </h2>
        {isClaimMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center">
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0]">
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Insured Horse' : 'Cá thể ngựa'}
              </span>
              <p className="text-base font-extrabold text-[#181A17] mt-1 mb-0 truncate">
                {info.horseName}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0]">
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Severity & Package' : 'Mức độ & Gói BH'}
              </span>
              <p className="text-base font-extrabold text-[#181A17] mt-1 mb-0">
                {info.severity} · {String(info.packageCode || 'basic').toUpperCase()}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4]">
              <span className="text-[11px] text-[#1E563B] uppercase font-extrabold block">
                {isEn ? 'Approved Payout' : 'Số tiền bồi thường'}
              </span>
              <p className="text-xl font-black text-[#1E563B] font-mono mt-1 mb-0 whitespace-nowrap">
                {payoutAmount.toLocaleString('vi-VN')}{'\u00A0'}VND
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center">
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0]">
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Freight Refund' : 'Hoàn cước vận chuyển'}
              </span>
              <p className="text-lg font-extrabold text-[#181A17] font-mono mt-1 mb-0 whitespace-nowrap">
                {Number(info.freightAmount || 0).toLocaleString('vi-VN')}{'\u00A0'}VND
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0]">
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Insurance Refund' : 'Hoàn phí bảo hiểm'}
              </span>
              <p className="text-lg font-extrabold text-[#181A17] font-mono mt-1 mb-0 whitespace-nowrap">
                {Number(info.insuranceAmount || 0).toLocaleString('vi-VN')}{'\u00A0'}VND
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4]">
              <span className="text-[11px] text-[#1E563B] uppercase font-extrabold block">
                {isEn ? 'Total 100% Refund' : 'Tổng hoàn trả 100%'}
              </span>
              <p className="text-xl font-black text-[#1E563B] font-mono mt-1 mb-0 whitespace-nowrap">
                {Number(info.totalPaidAmount || 0).toLocaleString('vi-VN')}{'\u00A0'}VND
              </p>
            </div>
          </div>
        )}
      </div>

      {/* If already submitted -> Status Tracker Card */}
      {hasSubmittedBankForm && existingRefund ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#D8CEBE] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-extrabold text-[#181A17] m-0 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#287653]" aria-hidden="true" />
              <span>
                {isClaimMode
                  ? isEn
                    ? 'Insurance Payout Progress'
                    : 'Tiến Độ Chi Trả Bồi Thường Bảo Hiểm'
                  : isEn
                    ? 'Refund Processing Progress'
                    : 'Tiến Độ Xử Lý Hoàn Tiền'}
              </span>
            </h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#1E563B] border border-[#B7DBC4]">
              {existingRefund.status === 'transferred'
                ? isEn
                  ? 'TRANSFER COMPLETED'
                  : 'ĐÃ HOÀN TẤT CHUYỂN TIỀN'
                : isEn
                  ? 'PROCESSING (3–5 BUSINESS DAYS)'
                  : 'ĐANG XỬ LÝ (SLA 3–5 NGÀY)'}
            </span>
          </div>

          {/* Step Progress Bar */}
          <div className="py-4">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#287653] text-white flex items-center justify-center font-bold mb-1">1</div>
                <span className="font-bold text-[#1E563B]">{isEn ? 'Submitted' : 'Đã gửi form'}</span>
                <span className="text-[10px] text-[#5F6977] mt-0.5">{formatVietnamDateTime(existingRefund.formSubmittedAt)}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${['approved_for_transfer', 'transferred'].includes(existingRefund.status) ? 'bg-[#287653] text-white' : 'bg-[#EAE4D8] text-[#5F6977]'}`}>2</div>
                <span className="font-semibold text-[#181A17]">{isEn ? 'Manager Approved' : 'Quản lý duyệt chi'}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${existingRefund.status === 'transferred' ? 'bg-[#287653] text-white' : 'bg-[#EAE4D8] text-[#5F6977]'}`}>3</div>
                <span className="font-semibold text-[#181A17]">{isEn ? 'Admin Transfer' : 'Admin chuyển khoản'}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${existingRefund.status === 'transferred' ? 'bg-[#287653] text-white' : 'bg-[#EAE4D8] text-[#5F6977]'}`}>4</div>
                <span className="font-semibold text-[#181A17]">{isEn ? 'Completed' : 'Hoàn tất'}</span>
              </div>
            </div>
          </div>

          {/* Submitted Bank Information */}
          <div className="mt-4 p-4 rounded-xl bg-[#FAF8F4] text-xs text-[#273244] space-y-2 border border-[#E5DDD0]">
            <p className="m-0">
              <strong className="text-[#181A17]">{isEn ? 'Beneficiary Bank:' : 'Ngân hàng thụ hưởng:'}</strong>{' '}
              {existingRefund.bankName}
            </p>
            <p className="m-0">
              <strong className="text-[#181A17]">{isEn ? 'Account Number:' : 'Số tài khoản:'}</strong>{' '}
              <span className="font-mono font-bold text-[#181A17]">{existingRefund.accountNumber}</span>
            </p>
            <p className="m-0">
              <strong className="text-[#181A17]">{isEn ? 'Account Holder:' : 'Chủ tài khoản:'}</strong>{' '}
              {existingRefund.accountHolder}
            </p>
            {existingRefund.bankTransactionRef && (
              <p className="m-0">
                <strong className="text-[#181A17]">{isEn ? 'Bank Transaction Ref:' : 'Mã giao dịch ngân hàng:'}</strong>{' '}
                <span className="font-mono font-bold text-[#1E563B]">{existingRefund.bankTransactionRef}</span>
              </p>
            )}
            {existingRefund.slaDueAt && (
              <p className="m-0 text-[#1E563B] font-bold">
                {isEn ? 'SLA Payout Deadline:' : 'Hạn chi trả theo cam kết SLA:'}{' '}
                {formatVietnamDateTime(existingRefund.slaDueAt)}
              </p>
            )}
            {existingRefund.transferReceiptUrl && existingRefund.refundId && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void openAuthenticatedApiFile(`/api/orders/refunds/${existingRefund.refundId}/receipt`)}
                  className="inline-flex items-center text-xs font-bold text-[#287653] hover:underline bg-transparent border-0 cursor-pointer p-0"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  {isEn ? 'View Transfer Receipt (PDF/Image)' : 'Xem ủy nhiệm chi chuyển tiền (PDF/Ảnh)'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Refund Form */
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-[#D8CEBE] p-5 sm:p-6">
          <h2 className="text-base font-extrabold text-[#181A17] mb-4 mt-0 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#A67C2E]" aria-hidden="true" />
            <span>
              {isClaimMode
                ? isEn
                  ? 'Enter Beneficiary Bank Account for Insurance Payout'
                  : 'Điền Thông Tin Tài Khoản Nhận Tiền Bồi Thường'
                : isEn
                  ? 'Enter Beneficiary Bank Account Details'
                  : 'Điền Thông Tin Tài Khoản Nhận Tiền'}
            </span>
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="refund-bank" className="block text-xs font-bold text-[#181A17] uppercase mb-1.5">
                {isEn ? 'Beneficiary Bank' : 'Ngân hàng thụ hưởng'} <span className="text-[#B33E3E]">*</span>
              </label>
              <select
                id="refund-bank"
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] font-medium focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] focus:outline-none"
              >
                {POPULAR_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b === 'OTHER'
                      ? isEn
                        ? 'Other (enter bank name)'
                        : 'Khác (nhập tên ngân hàng)'
                      : b}
                  </option>
                ))}
              </select>
            </div>

            {selectedBank === 'OTHER' && (
              <div>
                <label htmlFor="refund-custom-bank" className="block text-xs font-bold text-[#181A17] uppercase mb-1.5">
                  {isEn ? 'Enter Your Bank Name' : 'Nhập tên ngân hàng của bạn'} <span className="text-[#B33E3E]">*</span>
                </label>
                <input
                  id="refund-custom-bank"
                  type="text"
                  required
                  placeholder={isEn ? 'e.g. Cake by VPBank' : 'VD: Ngân hàng số Cake by VPBank'}
                  value={customBankName}
                  onChange={(e) => setCustomBankName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] placeholder:text-[#747D88] focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="refund-acc-num" className="block text-xs font-bold text-[#181A17] uppercase mb-1.5">
                {isEn ? 'Bank Account Number' : 'Số tài khoản ngân hàng'} <span className="text-[#B33E3E]">*</span>
              </label>
              <input
                id="refund-acc-num"
                type="text"
                required
                placeholder={isEn ? 'Enter 6 to 20 digits' : 'Nhập từ 6 đến 20 chữ số'}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] placeholder:text-[#747D88] focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="refund-acc-holder" className="block text-xs font-bold text-[#181A17] uppercase mb-1.5">
                {isEn ? 'Account Holder Name (UPPERCASE)' : 'Họ tên chủ tài khoản (in hoa)'}{' '}
                <span className="text-[#B33E3E]">*</span>
              </label>
              <input
                id="refund-acc-holder"
                type="text"
                required
                placeholder="VD: NGUYEN VAN A"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 text-sm font-bold uppercase rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] placeholder:text-[#747D88] focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="refund-note" className="block text-xs font-bold text-[#181A17] uppercase mb-1.5">
                {isEn ? 'Additional Note (Optional)' : 'Ghi chú thêm (không bắt buộc)'}
              </label>
              <textarea
                id="refund-note"
                rows={2}
                placeholder={isEn ? 'Optional note for our finance team...' : 'Ghi chú thêm cho bộ phận kế toán...'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] placeholder:text-[#747D88] focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] focus:outline-none"
              />
            </div>

            {/* Confirmation Checkbox */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#181A17] rounded border-[#D8CEBE] cursor-pointer"
                />
                <span className="text-xs text-[#181A17] leading-relaxed">
                  {isClaimMode ? (
                    isEn ? (
                      <>
                        I confirm the bank account information above is accurate and agree to receive the approved insurance compensation of{' '}
                        <strong>{payoutAmount.toLocaleString('vi-VN')} VND</strong>.
                      </>
                    ) : (
                      <>
                        Tôi xác nhận thông tin tài khoản trên là chính xác và đồng ý nhận khoản bồi thường bảo hiểm{' '}
                        <strong>{payoutAmount.toLocaleString('vi-VN')} VND</strong>.
                      </>
                    )
                  ) : isEn ? (
                    <>
                      I confirm the bank account information above is accurate and agree to receive a 100% refund of{' '}
                      <strong>{payoutAmount.toLocaleString('vi-VN')} VND</strong>.
                    </>
                  ) : (
                    <>
                      Tôi xác nhận thông tin tài khoản trên là chính xác và đồng ý nhận hoàn 100% số tiền{' '}
                      <strong>{payoutAmount.toLocaleString('vi-VN')} VND</strong>.
                    </>
                  )}
                </span>
              </label>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !confirmed}
                className="inline-flex items-center px-6 py-2.5 bg-[#181A17] hover:bg-[#2C2F2A] disabled:opacity-50 text-[#FAF8F4] font-bold rounded-xl shadow-sm transition text-sm cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEn ? 'Submitting...' : 'Đang xử lý gửi...'}
                  </>
                ) : isClaimMode ? (
                  isEn ? 'Submit Insurance Payout Bank Details' : 'Gửi Thông Tin Nhận Bồi Thường'
                ) : isEn ? (
                  'Submit Refund Bank Details'
                ) : (
                  'Gửi Thông Tin Nhận Hoàn Tiền'
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CustomerRefundPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#A67C2E]" />
        </div>
      }
    >
      <CustomerRefundPageContent />
    </Suspense>
  );
}
