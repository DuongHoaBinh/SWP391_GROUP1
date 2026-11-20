'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, Copy, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { InvoiceSummary, type Invoice } from './InvoiceSummary';

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
interface PaymentState {
  enabled: boolean;
  provider: 'sepay';
  payment: Payment | null;
  paymentUnlocked: boolean;
  blockedReason: string | null;
  paymentOverdue?: boolean;
  paymentDueAt?: string | null;
  graceDueAt?: string | null;
  graceCount?: number;
  invoiceStatus?: string | null;
  invoice: Invoice | null;
  supplementalInvoice?: Invoice | null;
}
const buttonStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B38E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function SepayPayment({ shipmentId, requestCode, amount, checkout = false, eligible = true }: { shipmentId: number; requestCode: string; amount: number; checkout?: boolean; eligible?: boolean }) {
  const { t, language } = useLanguage();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [qrError, setQrError] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);
  const money = (val: number) => `${val.toLocaleString('vi-VN')} VND`;
  const endpoint = `/orders/${shipmentId}/payments/sepay`;
  const orderUrl = `/customer/requests/${shipmentId}#sepay-payment`;
  const checkoutUrl = `/customer/requests/${shipmentId}/payment`;
  const { data, error: loadError, mutate, isLoading, isValidating } = useSWR<PaymentState>(
    ['sepay', getCurrentUser().id, shipmentId], () => apiClient<PaymentState>(endpoint, { cache: 'no-store' }),
    { refreshInterval: state => state?.payment?.status === 'succeeded' ? 0 : state?.payment?.status === 'pending' ? 3000 : 10000, refreshWhenHidden: false, shouldRetryOnError: false },
  );
  const payment = data?.payment;
  const paymentUnlocked = data?.paymentUnlocked === true;
  const quoteChanged = !!payment && payment.status !== 'succeeded' && payment.amount !== amount;
  const canPay = checkout && eligible && paymentUnlocked && data?.enabled && !loadError && payment?.status === 'pending' && !!payment.qrUrl && !payment.blockedReason && !quoteChanged;

  async function create() {
    if (!paymentUnlocked || !eligible || loadError) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient<Payment>(endpoint, { method: 'POST' });
      await mutate(current => current ? { ...current, payment: result } : current, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sepay.errCreateRequest', 'Không tạo được yêu cầu thanh toán. Vui lòng thử lại.'));
    }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${t('sepay.copiedPrefix', 'Đã sao chép')} ${label}`);
    } catch {
      setError(t('sepay.errCopyFailed', 'Không sao chép được. Bạn có thể chọn và sao chép trực tiếp thông tin hiển thị.'));
    }
  }

  return (
    <section id="sepay-payment" className="min-w-0 scroll-mt-28 overflow-hidden rounded-2xl border border-[#D8CEBE] bg-white shadow-sm" aria-label={t('sepay.ariaLabel', 'Thanh toán chuyển khoản SePay')}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E2D8] bg-[#FAF8F4] px-5 py-4 sm:px-6">
        <div>
          <h3 className="text-base font-bold text-[#181A17]">{t('sepay.title', 'Thanh toán chuyển khoản')}</h3>
          <p className="mt-1 text-sm text-[#5B6779]">
            {t('sepay.subtitle', 'Đơn {code} · Xác nhận tự động qua SePay', { code: requestCode })}
          </p>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${payment?.status === 'succeeded' ? 'bg-[#E8F2EB] text-[#2D5A3F]' : 'bg-[#181A17] text-[#C4B38E]'}`}>
          {payment?.status === 'succeeded' ? t('sepay.statusPaid', 'Đã thanh toán') : 'VietQR · VND'}
        </span>
      </header>
      <div className="space-y-4 p-5 sm:p-6">
        {isLoading && (
          <div className="animate-pulse space-y-3 motion-reduce:animate-none" role="status">
            <div className="h-5 w-48 rounded bg-[#FAF8F4]" />
            <div className="h-12 rounded bg-[#FAF8F4]" />
            <span className="sr-only">{t('sepay.loadingInfo', 'Đang tải thông tin thanh toán')}</span>
          </div>
        )}
        {(error || loadError) && (
          <div role="alert" className="rounded-lg border border-[#9E3B3B]/30 bg-rose-50 p-3 text-sm text-[#9E3B3B]">
            {error || loadError.message}
          </div>
        )}
        {loadError && (
          <button type="button" className={`${buttonStyle} border border-[#D8CEBE] text-[#181A17] hover:bg-[#FAF8F4]`} onClick={() => { setError(''); void mutate(); }}>
            {t('sepay.reloadInfoBtn', 'Tải lại thông tin')}
          </button>
        )}
        {data && !data.enabled && (
          <p className="text-sm text-[#A67C2E]">
            {t('sepay.gatewayDisabledNotice', 'Thanh toán đang tạm ngưng. Vui lòng liên hệ bộ phận vận chuyển trước khi chuyển tiền.')}
          </p>
        )}
        {data?.invoice && <InvoiceSummary invoice={data.invoice} />}
        {(data?.paymentDueAt || data?.graceDueAt || data?.paymentOverdue) && payment?.status !== 'succeeded' && (
          <div
            role={data.paymentOverdue ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-xs leading-5 ${
              data.paymentOverdue
                ? 'border-[#9E3B3B]/35 bg-rose-50 text-[#9E3B3B]'
                : 'border-[#DFCA9A] bg-[#FAF5EB] text-[#8C6621]'
            }`}
          >
            {data.paymentOverdue && (
              <p className="font-bold m-0">
                {language === 'en'
                  ? '⚠️ Payment deadline has passed (Overdue). Please complete payment immediately or contact Logistics Manager for a 1-time grace extension.'
                  : '⚠️ Đã quá hạn thanh toán hóa đơn. Vui lòng hoàn tất chuyển khoản ngay hoặc liên hệ Logistics Manager nếu cần gia hạn 1 lần.'}
              </p>
            )}
            {data.paymentDueAt && (
              <p className="m-0">
                {language === 'en' ? 'Payment deadline:' : 'Hạn thanh toán:'}{' '}
                <strong>
                  {new Date(data.paymentDueAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </strong>
              </p>
            )}
            {data.graceDueAt && (
              <p className="m-0 mt-0.5">
                {language === 'en' ? '1-time Grace extended until:' : 'Gia hạn duy nhất 1 lần đến:'}{' '}
                <strong>
                  {new Date(data.graceDueAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </strong>
              </p>
            )}
          </div>
        )}
        {data?.supplementalInvoice && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#A67C2E] m-0">
              {language === 'en'
                ? 'Charter Upgrade Supplemental Invoice'
                : 'Hóa đơn bổ sung nâng cấp bao xe (Charter)'}
            </p>
            <InvoiceSummary invoice={data.supplementalInvoice} />
          </div>
        )}
        {!paymentUnlocked && payment?.status !== 'succeeded' && data && (
          <p role="status" className="rounded-lg border border-[#E8E2D8] bg-[#FAF8F4] p-4 text-sm leading-6 text-[#5B6779]">
            {data.blockedReason || t('sepay.lockedDefaultReason', 'Lộ trình và chuyến xe đang được bộ phận điều phối thiết lập chi tiết. Cổng thanh toán sẽ tự động mở sau khi lịch trình được xác nhận.')}
          </p>
        )}
        {payment?.status === 'succeeded' ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-[#2D5A3F]/30 bg-[#E8F2EB] p-4 text-[#2D5A3F]">
            <CheckCircle2 className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('sepay.receivedAmount', 'Đã nhận {amount}', { amount: money(payment.amount) })}</p>
              <p className="mt-1 text-sm">{t('sepay.paymentCodeLabel', 'Mã thanh toán')}: <strong>{payment.paymentCode}</strong></p>
              <p className="mt-1 break-all text-xs">
                {t('sepay.transactionPrefix', 'Giao dịch SePay')}: {payment.transactionId}
                {payment.paidAt ? ` · ${new Date(payment.paidAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <>
            {payment?.blockedReason ? (
              <p role="alert" className="rounded-lg border border-[#DFCA9A] bg-[#FAF8F4] p-3 text-sm text-[#A67C2E]">
                {payment.blockedReason}
              </p>
            ) : quoteChanged && (
              <p role="alert" className="rounded-lg border border-[#DFCA9A] bg-[#FAF8F4] p-3 text-sm text-[#A67C2E]">
                {t('sepay.quoteChangedWarning', 'Báo giá đã thay đổi. Vui lòng liên hệ bộ phận vận chuyển để đối soát; chưa chuyển tiền theo thông tin cũ.')}
              </p>
            )}
            {payment?.status === 'review' && (
              <div role="status" className="rounded-lg border border-[#DFCA9A] bg-[#FAF8F4] p-4 text-sm text-[#A67C2E]">
                <p className="font-semibold">{t('sepay.reviewNeededTitle', 'Giao dịch cần đối soát')}</p>
                <p className="mt-1">
                  {t('sepay.reviewNeededDesc', 'Thông tin chuyển khoản chưa khớp hoàn toàn với đơn hàng. Vui lòng liên hệ bộ phận vận chuyển và cung cấp mã {code}. Chưa chuyển thêm tiền cho đến khi được xác nhận.', { code: payment.paymentCode })}
                </p>
              </div>
            )}
            {payment?.status === 'pending' && !eligible && !payment.blockedReason && (
              <p role="alert" className="text-sm text-[#A67C2E]">
                {t('sepay.ineligibleWarning', 'Đơn hàng không còn đủ điều kiện thanh toán. Vui lòng liên hệ bộ phận vận chuyển trước khi chuyển tiền.')}
              </p>
            )}
            {!payment && paymentUnlocked && !loadError && data?.enabled && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[#5B6779]">{t('sepay.invoiceAmountLabel', 'Số tiền theo hóa đơn')}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#181A17]">{money(amount)}</p>
                  <p className="mt-2 max-w-lg text-sm text-[#5B6779]">
                    {eligible
                      ? t('sepay.scanQrHint', 'Quét QR bằng ứng dụng ngân hàng. Số tiền và nội dung chuyển khoản sẽ được điền sẵn.')
                      : t('sepay.requiresConfirmedRoute', 'Đơn cần có lộ trình đã xác nhận và hóa đơn hợp lệ trước khi thanh toán.')}
                  </p>
                </div>
                {eligible && (checkout ? (
                  <button
                    type="button"
                    disabled={busy || !Number.isSafeInteger(amount) || amount <= 0}
                    className={`${buttonStyle} bg-[#181A17] text-[#C4B38E] hover:bg-[#2C2F2A] cursor-pointer`}
                    onClick={create}
                  >
                    <QrCode size={18} aria-hidden="true" />
                    {busy ? t('sepay.generatingQr', 'Đang tạo mã…') : t('sepay.createQrBtn', 'Tạo mã QR thanh toán')}
                  </button>
                ) : (
                  <Link href={checkoutUrl} className={`${buttonStyle} bg-[#181A17] text-[#C4B38E] hover:bg-[#2C2F2A]`}>
                    <QrCode size={18} aria-hidden="true" />
                    {t('sepay.payWithSepayBtn', 'Thanh toán bằng SePay')}
                  </Link>
                ))}
              </div>
            )}
            {!checkout && eligible && paymentUnlocked && !loadError && payment?.status === 'pending' && !payment.blockedReason && !quoteChanged && data?.enabled && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-[#5B6779]">
                  {t('sepay.pendingInlineHint', 'Chưa nhận xác nhận thanh toán. Nếu đã chuyển tiền, bạn có thể chờ tại đây; trang sẽ tự cập nhật.')}
                </p>
                <Link href={checkoutUrl} className={`${buttonStyle} bg-[#181A17] text-[#C4B38E] hover:bg-[#2C2F2A]`}>
                  {t('sepay.continuePaymentBtn', 'Tiếp tục thanh toán')}
                </Link>
              </div>
            )}
            {canPay && (
              <div className="grid min-w-0 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex min-h-60 w-60 max-w-full items-center justify-center rounded-xl border border-[#D8CEBE] bg-white p-3">
                    {qrError ? (
                      <div className="p-3 text-center text-sm text-[#5B6779]">
                        <p>{t('sepay.qrLoadFailed', 'Chưa tải được ảnh QR. Bạn có thể dùng thông tin chuyển khoản bên cạnh.')}</p>
                        <button type="button" className="mt-3 min-h-11 font-semibold text-[#181A17] underline cursor-pointer" onClick={() => { setQrAttempt(value => value + 1); setQrError(false); }}>
                          {t('sepay.reloadQrBtn', 'Tải lại QR')}
                        </button>
                      </div>
                    ) : payment.qrUrl ? (
                      <img
                        key={`${payment.id}-${qrAttempt}`}
                        src={`${payment.qrUrl}&retry=${qrAttempt}`}
                        width={216}
                        height={260}
                        alt={`QR chuyển khoản ${money(payment.amount)}, nội dung ${payment.paymentCode}`}
                        onError={() => setQrError(true)}
                        referrerPolicy="no-referrer"
                        className="h-auto max-w-full"
                      />
                    ) : null}
                  </div>
                  <p className="text-center text-xs text-[#5B6779]">{t('sepay.scanWithBankApp', 'Quét bằng ứng dụng ngân hàng')}</p>
                </div>
                <div className="min-w-0 space-y-4">
                  <dl className="divide-y divide-[#E8E2D8] text-sm">
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-[#5B6779]">{t('sepay.bankLabel', 'Ngân hàng')}</dt>
                      <dd className="font-semibold text-[#181A17]">{payment.bankCode}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-[#5B6779]">{t('sepay.accountHolderLabel', 'Chủ tài khoản')}</dt>
                      <dd className="break-words font-semibold text-[#181A17]">{payment.accountName}</dd>
                    </div>
                    {([
                      { label: t('sepay.accountNumberLabel', 'Số tài khoản'), value: payment.accountNumber },
                      { label: t('sepay.amountLabel', 'Số tiền'), value: String(payment.amount), display: money(payment.amount) },
                      { label: t('sepay.transferMemoLabel', 'Nội dung'), value: payment.paymentCode },
                    ]).map(item => (
                      <div key={item.label} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <dt className="text-[#5B6779]">{item.label}</dt>
                        <dd className="flex min-w-0 items-center gap-1">
                          <strong className="select-all break-all tabular-nums text-[#181A17]">{item.display ?? item.value}</strong>
                          <button
                            type="button"
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#5B6779] hover:bg-[#FAF8F4] hover:text-[#181A17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B38E] cursor-pointer"
                            aria-label={`${t('sepay.copyAriaPrefix', 'Sao chép')} ${item.label.toLowerCase()}`}
                            onClick={() => copy(item.value, item.label.toLowerCase())}
                          >
                            <Copy size={15} aria-hidden="true" />
                          </button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm text-[#5B6779]">
                    {t('sepay.exactAmountInstruction', 'Giữ nguyên số tiền và mã nội dung. Đây là chuyển khoản tiền thật vào tài khoản thụ hưởng hiển thị ở trên.')}
                  </p>
                  <div className="flex items-start gap-2 text-sm text-[#A67C2E]" role="status">
                    <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p>{t('sepay.awaitingBankConfirm', 'Đang chờ xác nhận từ ngân hàng. Trang tự cập nhật khi nhận được thanh toán.')}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {payment && payment.status !== 'succeeded' && (
          <button
            type="button"
            disabled={isValidating || busy}
            className={`${buttonStyle} border border-[#D8CEBE] text-[#181A17] hover:bg-[#FAF8F4] cursor-pointer`}
            onClick={() => { setError(''); void mutate(); }}
          >
            <RefreshCw size={16} aria-hidden="true" className={isValidating ? 'animate-spin motion-reduce:animate-none' : ''} />
            {isValidating ? t('sepay.checkingStatus', 'Đang kiểm tra…') : t('sepay.checkStatusBtn', 'Kiểm tra trạng thái')}
          </button>
        )}
        {checkout && (
          <footer className="space-y-3 border-t border-[#E8E2D8] pt-4">
            {payment?.status !== 'succeeded' && (
              <p className="text-sm text-[#5B6779]">
                {t('sepay.closeCheckoutNotice', 'Nút bên dưới chỉ đóng màn hình thanh toán. Nếu đã chuyển khoản, tiền vẫn được xác nhận tự động; không chuyển lại khi đang chờ.')}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href={orderUrl} className={`${buttonStyle} border border-[#D8CEBE] text-[#181A17] hover:bg-[#FAF8F4]`}>
                {payment?.status === 'succeeded' ? t('sepay.backToOrderDetailBtn', 'Về chi tiết đơn') : t('sepay.closeAndReturnOrderBtn', 'Đóng thanh toán và về đơn')}
              </Link>
              {payment?.status === 'succeeded' && (
                <Link href="/customer/requests" className={`${buttonStyle} bg-[#181A17] text-[#C4B38E] hover:bg-[#2C2F2A]`}>
                  {t('sepay.ordersListBtn', 'Danh sách đơn hàng')}
                </Link>
              )}
            </div>
          </footer>
        )}
        <p className="sr-only" aria-live="polite">{copied}</p>
        {copied && <p className="text-xs text-[#2D5A3F]" aria-hidden="true">{copied}</p>}
      </div>
    </section>
  );
}
