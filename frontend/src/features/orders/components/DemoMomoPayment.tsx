'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

interface SandboxPayment {
  id: number;
  shipmentId: number;
  orderId: string;
  amount: number;
  status: 'creating' | 'pending' | 'succeeded' | 'failed' | 'unknown';
  payUrl: string | null;
  method: string;
  resultCode: number | null;
  message: string | null;
  transactionId: string | null;
  updatedAt: string;
}
interface PaymentState { enabled: boolean; sandbox: true; payment: SandboxPayment | null }
const labels = { creating: 'Đang tạo giao dịch', pending: 'Chờ thanh toán bằng thẻ ATM', succeeded: 'Thanh toán sandbox thành công', failed: 'Giao dịch sandbox thất bại', unknown: 'Chưa xác minh được kết quả' };

export function DemoMomoPayment({
  shipmentId,
  requestCode,
  amount,
  onPaymentSuccess,
}: {
  shipmentId: number;
  requestCode: string;
  amount: number;
  onPaymentSuccess?: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardNumber, setCardNumber] = useState('9704 0000 0000 0018');
  const [cardHolder, setCardHolder] = useState('NGUYEN VAN A');
  const [issueDate, setIssueDate] = useState('03/07');
  const [otp, setOtp] = useState('OTP');

  const endpoint = `/orders/${shipmentId}/payments/momo`;
  const userId = getCurrentUser().id;
  const { data, error: loadError, mutate, isLoading } = useSWR(['momo-sandbox', userId, shipmentId], () => apiClient<PaymentState>(endpoint), { refreshInterval: 5000 });
  const payment = data?.payment;
  const validAmount = Number.isSafeInteger(amount) && amount >= 10000;
  const pending = payment && ['creating', 'pending', 'unknown'].includes(payment.status);

  async function perform(refresh: boolean) {
    setBusy(true); setError('');
    try {
      const result = await apiClient<SandboxPayment | null>(`${endpoint}${refresh ? '/refresh' : ''}`, { method: 'POST' });
      await mutate({ enabled: true, sandbox: true, payment: result }, false);
      if (result?.status === 'succeeded') {
        onPaymentSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kết nối được MoMo sandbox');
      await mutate().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function confirmAtmCard() {
    setBusy(true);
    setError('');
    try {
      const result = await apiClient<SandboxPayment | null>(`${endpoint}/confirm-atm`, {
        method: 'POST',
        body: JSON.stringify({ cardNumber, cardHolder, issueDate, otp }),
      });
      await mutate({ enabled: true, sandbox: true, payment: result }, false);
      if (result?.status === 'succeeded') {
        onPaymentSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xác nhận thanh toán thẻ ATM');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data?.enabled || !payment || payment.status !== 'pending' || new URLSearchParams(window.location.search).get('payment') !== 'momo-sandbox') return;
    // Redirect parameters only trigger reconciliation; they never supply payment status.
    void apiClient<SandboxPayment | null>(`${endpoint}/refresh`, { method: 'POST' })
      .then(result => mutate({ enabled: true, sandbox: true, payment: result }, false))
      .catch(err => setError(err instanceof Error ? err.message : 'Chưa kiểm tra được kết quả MoMo'));
  }, [data?.enabled, payment?.id, endpoint, mutate]);

  if (payment?.status === 'succeeded') {
    return (
      <section className="min-w-0 rounded-xl border border-emerald-300 bg-emerald-50 p-5 flex flex-col gap-2 break-words" aria-label="Đã thanh toán MoMo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-emerald-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Đã thanh toán cước vận chuyển qua MoMo
          </h3>
          <span className="rounded bg-emerald-600 text-white px-2 py-0.5 text-xs font-bold">ĐÃ THANH TOÁN THÀNH CÔNG</span>
        </div>
        <p className="text-sm text-slate-700">
          Đơn {requestCode} · Số tiền đã thanh toán: <strong>{Number(payment.amount).toLocaleString('vi-VN')} VND</strong>
        </p>
        <p className="text-xs text-slate-500">Mã giao dịch MoMo: {payment.orderId} {payment.transactionId ? `· Mã đối soát: ${payment.transactionId}` : ''}</p>
      </section>
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) return null;
  return <section className="min-w-0 rounded-xl border border-pink-200 bg-pink-50 p-5 flex flex-col gap-3 break-words" aria-label="Thanh toán MoMo sandbox">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-pink-900">Thanh toán thẻ qua MoMo</h3><span className="rounded bg-white border border-pink-200 px-2 py-1 text-xs font-bold text-pink-800">SANDBOX · TIỀN THỬ</span></div>
    <p className="text-sm text-slate-700">Đơn {requestCode} · {(payment?.amount ?? amount).toLocaleString('vi-VN')} VND</p>
    <p className="text-xs text-slate-600">Thanh toán bằng thẻ ATM nội địa trên trang MoMo sandbox. Đây là tiền thử; kết quả không thay đổi trạng thái vận chuyển.</p>
    {isLoading && <p role="status" className="text-sm">Đang tải thông tin thanh toán…</p>}
    {(error || loadError) && <p role="alert" className="text-red-700 text-sm">{error || loadError.message}</p>}
    {loadError && <button className="text-sm underline self-start" onClick={() => mutate()}>Tải lại thông tin</button>}
    {data && !data.enabled && <p className="text-sm text-slate-600">MoMo sandbox chưa được bật trên hệ thống.</p>}
    {payment && <div role="status" className={`rounded-lg border p-3 text-sm ${payment.status === 'failed' ? 'border-red-300 bg-red-50 text-red-900' : 'border-pink-200 bg-white text-slate-700'}`}>
      <strong>{payment.status === 'failed' && payment.resultCode === 1005 ? 'Giao dịch MoMo đã hết hạn' : labels[payment.status]}</strong>{payment.message && <p className="mt-1">{payment.message}</p>}
      <p className="text-xs mt-1 break-all">Mã giao dịch: {payment.orderId}</p>
      {payment.transactionId && payment.transactionId !== '0' && <p className="text-xs mt-1">Mã MoMo: {payment.transactionId}</p>}
    </div>}
    {!validAmount && <p className="text-sm text-amber-800">Số tiền thanh toán tối thiểu là 10.000đ.</p>}
    {data?.enabled && (!payment || payment.status === 'failed') && <button disabled={busy || !validAmount} className="rounded-lg bg-pink-700 text-white font-semibold py-2 px-4 self-start disabled:opacity-50 cursor-pointer" onClick={() => perform(false)}>{busy ? 'Đang khởi tạo giao dịch…' : payment ? 'Thanh toán bằng thẻ ATM (Thử lại)' : 'Thanh toán bằng thẻ ATM'}</button>}
    {data?.enabled && pending && (
      <div className="rounded-xl border border-pink-200 bg-white p-4 flex flex-col gap-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-pink-800">Cổng xác thực thẻ ATM nội địa (NAPAS / MoMo Sandbox)</span>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Bảo mật 3D-Secure</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số thẻ ATM nội địa</label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="9704 0000 0000 0018"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-pink-600"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tên chủ thẻ (Không dấu)</label>
            <input
              type="text"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              placeholder="NGUYEN VAN A"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 uppercase text-sm text-slate-900 outline-none focus:border-pink-600"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ngày phát hành (MM/YY)</label>
            <input
              type="text"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              placeholder="03/07"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-pink-600"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mã xác thực OTP Sandbox</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-pink-600"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={confirmAtmCard}
            className="rounded-lg bg-pink-700 hover:bg-pink-800 text-white font-bold py-2.5 px-5 text-sm disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {busy ? 'Đang xử lý thanh toán…' : `Xác nhận thanh toán ${(payment?.amount ?? amount).toLocaleString('vi-VN')} VND`}
          </button>
          {payment.payUrl && /^https:\/\/test-payment\.momo\.vn\//.test(payment.payUrl) && (
            <>
              <a href={payment.payUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-pink-300 bg-pink-50 text-pink-900 font-semibold py-2 px-4 text-sm">Mở trang MoMo ngoài</a>
              <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold py-2 px-4 text-sm disabled:opacity-50" onClick={() => perform(true)}>Kiểm tra kết quả</button>
            </>
          )}
        </div>
      </div>
    )}
    {data?.enabled && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Thẻ thử nghiệm ATM</summary><p className="mt-2">Số thẻ: 9704 0000 0000 0018 · Tên: NGUYEN VAN A · Ngày phát hành: 03/07 · OTP: OTP</p><a className="underline" href="https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/" target="_blank" rel="noopener noreferrer">Hướng dẫn thẻ thử từ MoMo</a></details>}
  </section>;
}
