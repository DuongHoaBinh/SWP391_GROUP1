'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  ShieldCheck,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatVietnamDateTime } from '@/features/orders/prepaid-policy';

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
  'Khác (nhập tên ngân hàng)',
];

export default function CustomerRefundPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<any>(null);

  // Form state
  const [selectedBank, setSelectedBank] = useState<string>(POPULAR_BANKS[0]);
  const [customBankName, setCustomBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    apiClient<any>(`/orders/${id}/refund-form`)
      .then((res) => {
        setInfo(res);
      })
      .catch((err) => {
        toast.error(err?.message || 'Không thể tải thông tin hoàn tiền');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      toast.error('Vui lòng tích xác nhận số tiền hoàn');
      return;
    }
    const bankName = selectedBank.startsWith('Khác') ? customBankName.trim() : selectedBank;
    if (!bankName) {
      toast.error('Vui lòng chọn hoặc nhập tên ngân hàng');
      return;
    }
    if (!/^\d{6,20}$/.test(accountNumber.trim())) {
      toast.error('Số tài khoản ngân hàng phải gồm từ 6 đến 20 chữ số');
      return;
    }
    if (!accountHolder.trim()) {
      toast.error('Vui lòng nhập họ tên chủ tài khoản ngân hàng');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient(`/orders/${id}/refund-form`, {
        method: 'POST',
        body: JSON.stringify({
          bankName,
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim().toUpperCase(),
          confirmAmount: Number(info.totalPaidAmount),
          note: note.trim() || undefined,
        }),
      });
      toast.success('Gửi thông tin nhận hoàn tiền thành công!');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Gửi form hoàn tiền thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-sm text-slate-500">Đang tải thông tin hoàn tiền...</p>
        </div>
      </div>
    );
  }

  const existingRefund = info?.refundRecord;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href={`/customer/requests/${id}`}
            className="inline-flex items-center text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            ← Quay lại chi tiết yêu cầu
          </Link>
        </div>

        {/* Header Alert Card */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-amber-900 dark:text-amber-200">
                Thông Báo Hoàn Tiền 100% Cho Đơn Hàng #{id}
              </h1>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                Rất tiếc công ty hiện chưa thể đáp ứng yêu cầu vận chuyển của bạn. Theo cam kết dịch vụ, bạn sẽ được hoàn trả <strong>100% số tiền đã thanh toán</strong> vào tài khoản ngân hàng trong vòng <strong>3 ngày làm việc</strong>.
              </p>
              {info?.cannotFulfilReason && (
                <div className="mt-3 p-3 bg-white/70 dark:bg-slate-900/60 rounded-lg text-xs text-amber-900 dark:text-amber-200 border border-amber-200/50">
                  <p><strong>Lý do từ chối:</strong> {info.cannotFulfilReason}</p>
                  {info.cannotFulfilNote && <p className="mt-1"><strong>Ghi chú giải trình:</strong> {info.cannotFulfilNote}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 100% Refund Breakdown Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Chi Tiết Khoản Hoàn Tiền (100%)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-750 border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-500 uppercase font-medium">Hoàn cước vận chuyển</span>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">
                {Number(info?.freightAmount || 0).toLocaleString('vi-VN')} VND
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-750 border border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-500 uppercase font-medium">Hoàn phí bảo hiểm</span>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">
                {Number(info?.insuranceAmount || 0).toLocaleString('vi-VN')} VND
              </p>
            </div>
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs text-emerald-700 dark:text-emerald-300 uppercase font-bold">Tổng hoàn trả 100%</span>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                {Number(info?.totalPaidAmount || 0).toLocaleString('vi-VN')} VND
              </p>
            </div>
          </div>
        </div>

        {/* If already submitted -> Status Tracker Card */}
        {existingRefund ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow border border-slate-200 dark:border-slate-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Tiến Độ Xử Lý Hoàn Tiền
              </h2>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {existingRefund.status === 'transferred' ? 'ĐÃ HOÀN TẤT CHUYỂN TIỀN' : 'ĐANG XỬ LÝ (SLA 3 NGÀY)'}
              </span>
            </div>

            {/* Step Progress Bar */}
            <div className="py-4">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold mb-1">1</div>
                  <span className="font-semibold text-emerald-600">Đã gửi form</span>
                  <span className="text-[10px] text-slate-400">{formatVietnamDateTime(existingRefund.formSubmittedAt)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${['approved_for_transfer', 'transferred'].includes(existingRefund.status) ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>2</div>
                  <span className="font-semibold">Quản lý duyệt</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${existingRefund.status === 'transferred' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>3</div>
                  <span className="font-semibold">Admin chuyển khoản</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${existingRefund.status === 'transferred' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>4</div>
                  <span className="font-semibold">Hoàn tất</span>
                </div>
              </div>
            </div>

            {/* Submitted Bank Information */}
            <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-750 text-xs space-y-2 border border-slate-100 dark:border-slate-700">
              <p><strong>Ngân hàng thụ hưởng:</strong> {existingRefund.bankName}</p>
              <p><strong>Số tài khoản:</strong> <span className="font-mono font-bold">{existingRefund.accountNumber}</span></p>
              <p><strong>Chủ tài khoản:</strong> {existingRefund.accountHolder}</p>
              {existingRefund.slaDueAt && (
                <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  Hạn hoàn tiền theo cam kết SLA: {formatVietnamDateTime(existingRefund.slaDueAt)}
                </p>
              )}
              {existingRefund.transferReceiptUrl && (
                <div className="pt-2">
                  <a
                    href={existingRefund.transferReceiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-emerald-600 hover:underline"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Xem ủy nhiệm chi chuyển tiền (PDF/Ảnh)
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Refund Form */
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              Điền Thông Tin Tài Khoản Nhận Tiền
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Ngân hàng thụ hưởng <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {POPULAR_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {selectedBank.startsWith('Khác') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Nhập tên ngân hàng của bạn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Ngân hàng số Cake by VPBank"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Số tài khoản ngân hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập từ 6 đến 20 chữ số"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Họ tên chủ tài khoản (in hoa không dấu hoặc có dấu) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: NGUYEN VAN A"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm font-bold uppercase rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Ghi chú thêm (không bắt buộc)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm cho bộ phận kế toán..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Confirmation Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-800 dark:text-slate-200">
                    Tôi xác nhận thông tin tài khoản trên là chính xác và đồng ý nhận hoàn số tiền <strong>{Number(info?.totalPaidAmount || 0).toLocaleString('vi-VN')} VND</strong>.
                  </span>
                </label>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !confirmed}
                  className="inline-flex items-center px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow transition text-sm cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang xử lý gửi...
                    </>
                  ) : (
                    'Gửi Thông Tin Nhận Hoàn Tiền'
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
