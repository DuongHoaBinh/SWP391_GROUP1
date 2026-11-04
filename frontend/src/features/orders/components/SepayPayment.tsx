'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, Copy, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

interface Payment {
  id: number;
  shipmentId: number;
  paymentCode: string;
  amount: number;
  status: 'pending' | 'review' | 'succeeded';
  bankCode: string;
  accountNumber: string;
  accountName: string;
  qrUrl: string | null;
  blockedReason: string | null;
  transactionId: string | null;
  paidAt: string | null;
}
interface PaymentState { enabled: boolean; provider: 'sepay'; payment: Payment | null }
const money = (amount: number) => `${amount.toLocaleString('vi-VN')} VND`;
const buttonStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function SepayPayment({ shipmentId, requestCode, amount, checkout = false, eligible = true }: { shipmentId: number; requestCode: string; amount: number; checkout?: boolean; eligible?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [qrError, setQrError] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);
  const endpoint = `/orders/${shipmentId}/payments/sepay`;
  const orderUrl = `/customer/requests/${shipmentId}#sepay-payment`;
  const checkoutUrl = `/customer/requests/${shipmentId}/payment`;
  const { data, error: loadError, mutate, isLoading, isValidating } = useSWR<PaymentState>(
    ['sepay', getCurrentUser().id, shipmentId], () => apiClient<PaymentState>(endpoint, { cache: 'no-store' }),
    { refreshInterval: state => state?.payment?.status === 'pending' ? 3000 : 0, refreshWhenHidden: false, shouldRetryOnError: false },
  );
  const payment = data?.payment;
  const quoteChanged = !!payment && payment.status !== 'succeeded' && payment.amount !== amount;
  const canPay = checkout && eligible && data?.enabled && !loadError && payment?.status === 'pending' && !!payment.qrUrl && !payment.blockedReason && !quoteChanged;

  async function create() {
    setBusy(true); setError('');
    try {
      const result = await apiClient<Payment>(endpoint, { method: 'POST' });
      await mutate({ enabled: true, provider: 'sepay', payment: result }, false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không tạo được yêu cầu thanh toán. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(`Đã sao chép ${label}`); }
    catch { setError('Không sao chép được. Bạn có thể chọn và sao chép trực tiếp thông tin hiển thị.'); }
  }

  return <section id="sepay-payment" className="min-w-0 scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Thanh toán chuyển khoản SePay">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div><h3 className="text-base font-bold text-slate-900">Thanh toán chuyển khoản</h3><p className="mt-1 text-sm text-slate-500">Đơn {requestCode} · Xác nhận tự động qua SePay</p></div>
      <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${payment?.status === 'succeeded' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{payment?.status === 'succeeded' ? 'Đã thanh toán' : 'VietQR · VND'}</span>
    </header>
    <div className="space-y-4 p-5 sm:p-6">
      {isLoading && <div className="animate-pulse space-y-3 motion-reduce:animate-none" role="status"><div className="h-5 w-48 rounded bg-slate-100" /><div className="h-12 rounded bg-slate-100" /><span className="sr-only">Đang tải thông tin thanh toán</span></div>}
      {(error || loadError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || loadError.message}</div>}
      {loadError && <button type="button" className={`${buttonStyle} border border-slate-200 text-slate-700 hover:bg-slate-50`} onClick={() => { setError(''); void mutate(); }}>Tải lại thông tin</button>}
      {data && !data.enabled && <p className="text-sm text-amber-800">Thanh toán đang tạm ngưng. Vui lòng liên hệ bộ phận vận chuyển trước khi chuyển tiền.</p>}
      {payment?.status === 'succeeded' ? <div role="status" className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
        <CheckCircle2 className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
        <div><p className="font-semibold">Đã nhận {money(payment.amount)}</p><p className="mt-1 text-sm">Mã thanh toán: <strong>{payment.paymentCode}</strong></p><p className="mt-1 break-all text-xs">Giao dịch SePay: {payment.transactionId}{payment.paidAt ? ` · ${new Date(payment.paidAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}</p></div>
      </div> : <>
        {payment?.blockedReason ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{payment.blockedReason}</p> : quoteChanged && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Báo giá đã thay đổi. Vui lòng liên hệ bộ phận vận chuyển để đối soát; chưa chuyển tiền theo thông tin cũ.</p>}
        {payment?.status === 'review' && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Giao dịch cần đối soát</p><p className="mt-1">Thông tin chuyển khoản chưa khớp hoàn toàn với đơn hàng. Vui lòng liên hệ bộ phận vận chuyển và cung cấp mã {payment.paymentCode}. Chưa chuyển thêm tiền cho đến khi được xác nhận.</p></div>}
        {payment?.status === 'pending' && !eligible && !payment.blockedReason && <p role="alert" className="text-sm text-amber-800">Đơn hàng không còn đủ điều kiện thanh toán. Vui lòng liên hệ bộ phận vận chuyển trước khi chuyển tiền.</p>}
        {!payment && data?.enabled && <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-500">Số tiền theo báo giá</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{money(amount)}</p><p className="mt-2 max-w-lg text-sm text-slate-600">{eligible ? 'Quét QR bằng ứng dụng ngân hàng. Số tiền và nội dung chuyển khoản sẽ được điền sẵn.' : 'Đơn cần được duyệt và có báo giá hợp lệ trước khi thanh toán.'}</p></div>{eligible && (checkout ? <button type="button" disabled={busy || !Number.isSafeInteger(amount) || amount <= 0} className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700`} onClick={create}><QrCode size={18} aria-hidden="true" />{busy ? 'Đang tạo mã…' : 'Tạo mã QR thanh toán'}</button> : <Link href={checkoutUrl} className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700`}><QrCode size={18} aria-hidden="true" />Thanh toán bằng SePay</Link>)}</div>}
        {!checkout && eligible && payment?.status === 'pending' && !payment.blockedReason && !quoteChanged && data?.enabled && <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-600">Chưa nhận xác nhận thanh toán. Nếu đã chuyển tiền, bạn có thể chờ tại đây; trang sẽ tự cập nhật.</p><Link href={checkoutUrl} className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700`}>Tiếp tục thanh toán</Link></div>}
        {canPay && <div className="grid min-w-0 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-3">
            <div className="flex min-h-60 w-60 max-w-full items-center justify-center rounded-xl border border-slate-200 p-3">
              {qrError ? <div className="p-3 text-center text-sm text-slate-600"><p>Chưa tải được ảnh QR. Bạn có thể dùng thông tin chuyển khoản bên cạnh.</p><button type="button" className="mt-3 min-h-11 font-semibold text-blue-700 underline" onClick={() => { setQrAttempt(value => value + 1); setQrError(false); }}>Tải lại QR</button></div> : payment.qrUrl ? <img key={`${payment.id}-${qrAttempt}`} src={`${payment.qrUrl}&retry=${qrAttempt}`} width={216} height={260} alt={`QR chuyển khoản ${money(payment.amount)}, nội dung ${payment.paymentCode}`} onError={() => setQrError(true)} referrerPolicy="no-referrer" className="h-auto max-w-full" /> : null}
            </div><p className="text-center text-xs text-slate-500">Quét bằng ứng dụng ngân hàng</p>
          </div>
          <div className="min-w-0 space-y-4">
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex flex-wrap justify-between gap-2 py-2"><dt className="text-slate-500">Ngân hàng</dt><dd className="font-semibold text-slate-900">{payment.bankCode}</dd></div>
              <div className="flex flex-wrap justify-between gap-2 py-2"><dt className="text-slate-500">Chủ tài khoản</dt><dd className="break-words font-semibold text-slate-900">{payment.accountName}</dd></div>
              {([{ label: 'Số tài khoản', value: payment.accountNumber }, { label: 'Số tiền', value: String(payment.amount), display: money(payment.amount) }, { label: 'Nội dung', value: payment.paymentCode }]).map(item => <div key={item.label} className="flex flex-wrap items-center justify-between gap-2 py-2"><dt className="text-slate-500">{item.label}</dt><dd className="flex min-w-0 items-center gap-1"><strong className="select-all break-all tabular-nums text-slate-900">{item.display ?? item.value}</strong><button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Sao chép ${item.label.toLowerCase()}`} onClick={() => copy(item.value, item.label.toLowerCase())}><Copy size={15} aria-hidden="true" /></button></dd></div>)}
            </dl>
            <p className="text-sm text-slate-600">Giữ nguyên số tiền và mã nội dung. Đây là chuyển khoản tiền thật vào tài khoản thụ hưởng hiển thị ở trên.</p>
            <div className="flex items-start gap-2 text-sm text-blue-700" role="status"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><p>Đang chờ xác nhận từ ngân hàng. Trang tự cập nhật khi nhận được thanh toán.</p></div>
          </div>
        </div>}
      </>}
      {payment && payment.status !== 'succeeded' && <button type="button" disabled={isValidating || busy} className={`${buttonStyle} border border-slate-200 text-slate-700 hover:bg-slate-50`} onClick={() => { setError(''); void mutate(); }}><RefreshCw size={16} aria-hidden="true" className={isValidating ? 'animate-spin motion-reduce:animate-none' : ''} />{isValidating ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'}</button>}
      {checkout && <footer className="space-y-3 border-t border-slate-100 pt-4">
        {payment?.status !== 'succeeded' && <p className="text-sm text-slate-500">Nút bên dưới chỉ đóng màn hình thanh toán. Nếu đã chuyển khoản, tiền vẫn được xác nhận tự động; không chuyển lại khi đang chờ.</p>}
        <div className="flex flex-wrap gap-3"><Link href={orderUrl} className={`${buttonStyle} border border-slate-200 text-slate-700 hover:bg-slate-50`}>{payment?.status === 'succeeded' ? 'Về chi tiết đơn' : 'Đóng thanh toán và về đơn'}</Link>{payment?.status === 'succeeded' && <Link href="/customer/requests" className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700`}>Danh sách đơn hàng</Link>}</div>
      </footer>}
      <p className="sr-only" aria-live="polite">{copied}</p>
      {copied && <p className="text-xs text-green-700" aria-hidden="true">{copied}</p>}
    </div>
  </section>;
}
