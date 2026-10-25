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

export function DemoMomoPayment({ shipmentId, requestCode, amount }: { shipmentId: number; requestCode: string; amount: number }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/orders/${shipmentId}/payments/momo`;
  const userId = getCurrentUser().id;
  const { data, error: loadError, mutate, isLoading } = useSWR(['momo-sandbox', userId, shipmentId], () => apiClient<PaymentState>(endpoint), { refreshInterval: 5000 });
  const payment = data?.payment;
  const validAmount = Number.isSafeInteger(amount) && amount >= 10000 && amount <= 50000000;
  const pending = payment && ['creating', 'pending', 'unknown'].includes(payment.status);
  async function perform(refresh: boolean) {
    setBusy(true); setError('');
    try {
      const result = await apiClient<SandboxPayment | null>(`${endpoint}${refresh ? '/refresh' : ''}`, { method: 'POST' });
      await mutate({ enabled: true, sandbox: true, payment: result }, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kết nối được MoMo sandbox');
      await mutate().catch(() => undefined);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!data?.enabled || !payment || payment.status !== 'pending' || new URLSearchParams(window.location.search).get('payment') !== 'momo-sandbox') return;
    // Redirect parameters only trigger reconciliation; they never supply payment status.
    void apiClient<SandboxPayment | null>(`${endpoint}/refresh`, { method: 'POST' })
      .then(result => mutate({ enabled: true, sandbox: true, payment: result }, false))
      .catch(err => setError(err instanceof Error ? err.message : 'Chưa kiểm tra được kết quả MoMo'));
  }, [data?.enabled, payment?.id, endpoint, mutate]);

  if (payment?.status === 'succeeded' || !Number.isFinite(amount) || amount <= 0) return null;
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
    {!validAmount && <p className="text-sm text-amber-800">Thẻ ATM sandbox hỗ trợ báo giá nguyên VND từ 10.000đ đến 50.000.000đ.</p>}
    {data?.enabled && (!payment || payment.status === 'failed') && <button disabled={busy || !validAmount} className="rounded-lg bg-pink-700 text-white font-semibold py-2 px-4 self-start disabled:opacity-50" onClick={() => perform(false)}>{busy ? 'Đang kết nối MoMo…' : payment ? 'Tạo giao dịch thẻ mới' : 'Thanh toán bằng thẻ ATM'}</button>}
    {data?.enabled && pending && <div className="flex flex-wrap gap-2">
      {payment.payUrl && /^https:\/\/test-payment\.momo\.vn\//.test(payment.payUrl) && <a href={payment.payUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-pink-700 text-white font-semibold py-2 px-4 text-sm">Nhập thẻ trên MoMo</a>}
      <button disabled={busy} className="rounded-lg border border-pink-300 bg-white text-pink-900 font-semibold py-2 px-4 text-sm disabled:opacity-50" onClick={() => perform(true)}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra kết quả'}</button>
    </div>}
    {data?.enabled && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Thẻ thử nghiệm ATM</summary><p className="mt-2">Số thẻ: 9704 0000 0000 0018 · Tên: NGUYEN VAN A · Ngày phát hành: 03/07 · OTP: OTP</p><a className="underline" href="https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/" target="_blank" rel="noopener noreferrer">Hướng dẫn thẻ thử từ MoMo</a></details>}
    {pending && <p className="text-xs text-slate-600">Sau khi thanh toán thử, bấm “Kiểm tra kết quả” để cập nhật trạng thái.</p>}
  </section>;
}
