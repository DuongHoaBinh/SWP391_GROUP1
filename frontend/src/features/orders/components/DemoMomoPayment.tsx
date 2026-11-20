'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t, language } = useLanguage();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardNumber, setCardNumber] = useState('9704 0000 0000 0018');
  const [cardHolder, setCardHolder] = useState('NGUYEN VAN A');
  const [issueDate, setIssueDate] = useState('03/07');
  const [otp, setOtp] = useState('OTP');

  const labels: Record<SandboxPayment['status'], string> = {
    creating: t('momo.statusCreating', 'Đang tạo giao dịch'),
    pending: t('momo.statusPending', 'Chờ thanh toán bằng thẻ ATM'),
    succeeded: t('momo.statusSucceeded', 'Thanh toán sandbox thành công'),
    failed: t('momo.statusFailed', 'Giao dịch sandbox thất bại'),
    unknown: t('momo.statusUnknown', 'Chưa xác minh được kết quả'),
  };

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
      setError(err instanceof Error ? err.message : t('momo.errConnect', 'Không kết nối được MoMo sandbox'));
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
      setError(err instanceof Error ? err.message : t('momo.errConfirmAtm', 'Không thể xác nhận thanh toán thẻ ATM'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data?.enabled || !payment || payment.status !== 'pending' || new URLSearchParams(window.location.search).get('payment') !== 'momo-sandbox') return;
    // Redirect parameters only trigger reconciliation; they never supply payment status.
    void apiClient<SandboxPayment | null>(`${endpoint}/refresh`, { method: 'POST' })
      .then(result => mutate({ enabled: true, sandbox: true, payment: result }, false))
      .catch(err => setError(err instanceof Error ? err.message : t('momo.errCheckResult', 'Chưa kiểm tra được kết quả MoMo')));
  }, [data?.enabled, payment?.id, endpoint, mutate]);

  if (payment?.status === 'succeeded') {
    return (
      <section className="min-w-0 rounded-2xl border border-[#2D5A3F]/30 bg-[#E8F2EB] p-5 flex flex-col gap-2 break-words" aria-label={t('momo.paidAria', 'Đã thanh toán MoMo')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[#181A17] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2D5A3F]" />
            {t('momo.paidTitle', 'Đã thanh toán cước vận chuyển qua MoMo')}
          </h3>
          <span className="rounded bg-[#2D5A3F] text-white px-2.5 py-0.5 text-xs font-bold">
            {t('momo.paidBadge', 'ĐÃ THANH TOÁN THÀNH CÔNG')}
          </span>
        </div>
        <p className="text-sm text-[#181A17]">
          {t('momo.orderPrefix', 'Đơn')} {requestCode} · {t('momo.paidAmountLabel', 'Số tiền đã thanh toán')}: <strong>{Number(payment.amount).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} VND</strong>
        </p>
        <p className="text-xs text-[#5B6779]">
          {t('momo.txIdLabel', 'Mã giao dịch MoMo')}: {payment.orderId} {payment.transactionId ? `· ${t('momo.refIdLabel', 'Mã đối soát')}: ${payment.transactionId}` : ''}
        </p>
      </section>
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) return null;
  return (
    <section className="min-w-0 rounded-2xl border border-[#D8CEBE] bg-[#FAF8F4] p-5 flex flex-col gap-3 break-words" aria-label={t('momo.sandboxAria', 'Thanh toán MoMo sandbox')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-[#181A17]">{t('momo.title', 'Thanh toán thẻ qua MoMo')}</h3>
        <span className="rounded bg-white border border-[#D8CEBE] px-2.5 py-1 text-xs font-bold text-[#A67C2E]">
          {t('momo.sandboxBadge', 'SANDBOX · TIỀN THỬ')}
        </span>
      </div>
      <p className="text-sm text-[#181A17]">
        {t('momo.orderPrefix', 'Đơn')} {requestCode} · {(payment?.amount ?? amount).toLocaleString('vi-VN')} VND
      </p>
      <p className="text-xs text-[#5B6779]">
        {t('momo.sandboxNotice', 'Thanh toán bằng thẻ ATM nội địa trên trang MoMo sandbox. Đây là tiền thử; kết quả không thay đổi trạng thái vận chuyển.')}
      </p>
      {isLoading && <p role="status" className="text-sm text-[#5B6779]">{t('momo.loadingInfo', 'Đang tải thông tin thanh toán…')}</p>}
      {(error || loadError) && <p role="alert" className="text-[#9E3B3B] text-sm">{error || loadError.message}</p>}
      {loadError && <button type="button" className="text-sm text-[#A67C2E] underline self-start cursor-pointer" onClick={() => mutate()}>{t('momo.reloadInfoBtn', 'Tải lại thông tin')}</button>}
      {data && !data.enabled && <p className="text-sm text-[#5B6779]">{t('momo.disabledNotice', 'MoMo sandbox chưa được bật trên hệ thống.')}</p>}
      {payment && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${payment.status === 'failed' ? 'border-[#9E3B3B]/40 bg-rose-50 text-[#9E3B3B]' : 'border-[#D8CEBE] bg-white text-[#181A17]'}`}>
          <strong>{payment.status === 'failed' && payment.resultCode === 1005 ? t('momo.expiredTitle', 'Giao dịch MoMo đã hết hạn') : labels[payment.status]}</strong>
          {payment.message && <p className="mt-1">{payment.message}</p>}
          <p className="text-xs mt-1 break-all">{t('momo.txCodeLabel', 'Mã giao dịch')}: {payment.orderId}</p>
          {payment.transactionId && payment.transactionId !== '0' && <p className="text-xs mt-1">{t('momo.momoCodeLabel', 'Mã MoMo')}: {payment.transactionId}</p>}
        </div>
      )}
      {!validAmount && <p className="text-sm text-[#A67C2E]">{t('momo.minAmountWarning', 'Số tiền thanh toán tối thiểu là 10.000đ.')}</p>}
      {data?.enabled && (!payment || payment.status === 'failed') && (
        <button
          type="button"
          disabled={busy || !validAmount}
          className="rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E] font-semibold py-2 px-4 self-start disabled:opacity-50 cursor-pointer"
          onClick={() => perform(false)}
        >
          {busy ? t('momo.creatingTx', 'Đang khởi tạo giao dịch…') : payment ? t('momo.retryAtmBtn', 'Thanh toán bằng thẻ ATM (Thử lại)') : t('momo.payAtmBtn', 'Thanh toán bằng thẻ ATM')}
        </button>
      )}
      {data?.enabled && pending && (
        <div className="rounded-xl border border-[#D8CEBE] bg-white p-4 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#E8E2D8] pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#181A17]">
              {t('momo.atmGatewayHeader', 'Cổng xác thực thẻ ATM nội địa (NAPAS / MoMo Sandbox)')}
            </span>
            <span className="text-xs font-semibold text-[#2D5A3F] bg-[#E8F2EB] px-2 py-0.5 rounded border border-[#2D5A3F]/25">
              {t('momo.secureBadge', 'Bảo mật 3D-Secure')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="momo-card-number" className="block font-semibold text-[#181A17] mb-1">{t('momo.cardNumberLabel', 'Số thẻ ATM nội địa')}</label>
              <input
                id="momo-card-number"
                type="text"
                autoComplete="off"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="9704 0000 0000 0018"
                className="w-full rounded-lg border border-[#D8CEBE] px-3 py-2 font-mono text-sm text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
            </div>
            <div>
              <label htmlFor="momo-card-holder" className="block font-semibold text-[#181A17] mb-1">{t('momo.cardHolderLabel', 'Tên chủ thẻ (Không dấu)')}</label>
              <input
                id="momo-card-holder"
                type="text"
                autoComplete="off"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                placeholder="NGUYEN VAN A"
                className="w-full rounded-lg border border-[#D8CEBE] px-3 py-2 uppercase text-sm text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
            </div>
            <div>
              <label htmlFor="momo-issue-date" className="block font-semibold text-[#181A17] mb-1">{t('momo.issueDateLabel', 'Ngày phát hành (MM/YY)')}</label>
              <input
                id="momo-issue-date"
                type="text"
                autoComplete="off"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                placeholder="03/07"
                className="w-full rounded-lg border border-[#D8CEBE] px-3 py-2 font-mono text-sm text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
            </div>
            <div>
              <label htmlFor="momo-otp" className="block font-semibold text-[#181A17] mb-1">{t('momo.otpLabel', 'Mã xác thực OTP Sandbox')}</label>
              <input
                id="momo-otp"
                type="text"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="OTP"
                className="w-full rounded-lg border border-[#D8CEBE] px-3 py-2 font-mono text-sm text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={confirmAtmCard}
              className="rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E] font-bold py-2.5 px-5 text-sm disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {busy
                ? t('momo.processingPayment', 'Đang xử lý thanh toán…')
                : `${t('momo.confirmPaymentPrefix', 'Xác nhận thanh toán')} ${(payment?.amount ?? amount).toLocaleString('vi-VN')} VND`}
            </button>
            {payment.payUrl && /^https:\/\/test-payment\.momo\.vn\//.test(payment.payUrl) && (
              <>
                <a href={payment.payUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] text-[#181A17] font-semibold py-2 px-4 text-sm">
                  {t('momo.openExternalBtn', 'Mở trang MoMo ngoài')}
                </a>
                <button type="button" disabled={busy} className="rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-semibold py-2 px-4 text-sm disabled:opacity-50 cursor-pointer" onClick={() => perform(true)}>
                  {t('momo.checkResultBtn', 'Kiểm tra kết quả')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {data?.enabled && (
        <details className="text-xs text-[#5B6779]">
          <summary className="cursor-pointer font-semibold">{t('momo.testCardSummary', 'Thẻ thử nghiệm ATM')}</summary>
          <p className="mt-2">{t('momo.testCardDetails', 'Số thẻ: 9704 0000 0000 0018 · Tên: NGUYEN VAN A · Ngày phát hành: 03/07 · OTP: OTP')}</p>
          <a className="underline text-[#A67C2E]" href="https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/" target="_blank" rel="noopener noreferrer">
            {t('momo.testCardDocsLink', 'Hướng dẫn thẻ thử từ MoMo')}
          </a>
        </details>
      )}
    </section>
  );
}
