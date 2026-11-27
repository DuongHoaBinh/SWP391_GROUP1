'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { SepayPayment } from '@/features/orders/components/SepayPayment';
import { PaymentCountdownBadge } from '@/features/orders/components/PaymentCountdownBadge';

interface Order {
  id: number;
  requestCode: string;
  customerRequestCode?: string;
  totalCost: number;
  status: string;
  paymentStatus?: string;
  paymentFlow?: string;
  paidAt?: string | null;
  paymentDueAt?: string | null;
  createdAt?: string | null;
}

const payableStatuses = [
  'awaiting_payment',
  'planning',
  'confirmed',
  'ready_to_depart',
];

export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  const { language, t } = useLanguage();
  const isEn = language === 'en';
  const [userId, setUserId] = useState<string | number | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setUserId(user?.id ?? 'guest');
  }, []);

  const rawId = params?.id ?? '';
  const shipmentId = Number(rawId);
  const validId = /^\d+$/.test(rawId) && Number.isSafeInteger(shipmentId) && shipmentId > 0;

  const { data: order, error, isLoading, mutate } = useSWR<Order>(
    validId && userId !== null ? ['sepay-order', userId, shipmentId] : null,
    () => apiClient<Order>(`/orders/${shipmentId}`, { cache: 'no-store' }),
    { shouldRetryOnError: false, refreshInterval: 10000 },
  );

  const isLoadingOrder = validId && (userId === null || isLoading);
  const statusLower = String(order?.status || '').toLowerCase();
  const isAlreadyPaid =
    Boolean(order?.paidAt) ||
    String(order?.paymentStatus || '').toLowerCase() === 'succeeded' ||
    String(order?.paymentStatus || '').toLowerCase() === 'paid' ||
    (order?.paymentFlow === 'prepaid' &&
      ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed'].includes(statusLower));
  const displayCode = order?.customerRequestCode || order?.requestCode || (validId ? `REQ-${String(shipmentId).padStart(3, '0')}` : '');

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header className="border-b border-[#E5DDD0] pb-5">
        <Link
          href={validId ? `/customer/requests/${shipmentId}?tab=payment` : '/customer/requests'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F6977] hover:text-[#181A17] mb-2 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E] rounded"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{t('payment.backToOrder', isEn ? 'Back to Order' : 'Quay lại chi tiết đơn')}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#181A17] m-0">
            {displayCode
              ? isEn
                ? `Payment for ${displayCode}`
                : `Thanh toán đơn ${displayCode}`
              : isEn
                ? 'Order Payment'
                : 'Thanh toán đơn hàng'}
          </h1>
          {statusLower === 'awaiting_payment' && !isAlreadyPaid && (
            <PaymentCountdownBadge paymentDueAt={order?.paymentDueAt} createdAt={order?.createdAt} />
          )}
        </div>
        <p className="mt-1 mb-0 text-sm text-[#5F6977]">
          {isEn
            ? 'Transfer confirmation is verified automatically via SePay VietQR. Unpaid orders stay reserved for 12 hours.'
            : 'Kết quả chuyển khoản được xác nhận tự động qua SePay VietQR. Đơn chưa thanh toán được giữ chỗ tối đa 12 giờ.'}
        </p>
      </header>

      {!validId || error ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-5 text-sm text-[#B33E3E]">
          <p className="m-0">{error?.message || (isEn ? 'Invalid transport order ID.' : 'Mã đơn hàng không hợp lệ.')}</p>
          {validId && (
            <button
              type="button"
              onClick={() => void mutate()}
              className="min-h-[44px] rounded-lg px-3 font-semibold underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B33E3E]"
            >
              {isEn ? 'Retry' : 'Thử tải lại'}
            </button>
          )}
        </div>
      ) : isLoadingOrder || !order ? (
        <div role="status" className="space-y-4 rounded-2xl border border-[#E5DDD0] bg-white p-6">
          <div className="h-5 w-48 animate-pulse rounded bg-[#F0EEE8]" />
          <div className="h-28 w-full animate-pulse rounded-xl bg-[#F0EEE8]" />
          <div className="h-12 w-40 animate-pulse rounded-lg bg-[#F0EEE8]" />
        </div>
      ) : isAlreadyPaid ? (
        <div className="rounded-2xl border border-[#B7DBC4] bg-[#E8F2EB] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-[#287653] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-extrabold text-[#1E563B] m-0">
                {isEn ? 'This order has already been paid' : 'Đơn hàng này đã được thanh toán thành công'}
              </h2>
              <p className="text-sm text-[#2D5A3F] mt-1 mb-0">
                {isEn
                  ? `Amount received: ${Number(order.totalCost).toLocaleString('vi-VN')} VND. No further payment is required.`
                  : `Số tiền đã thanh toán: ${Number(order.totalCost).toLocaleString('vi-VN')} VND. Quý khách không cần chuyển khoản thêm.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={`/customer/requests/${order.id}/invoice`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold hover:bg-[#2C2F2A] no-underline"
            >
              <FileText size={14} className="text-[#D4C5A3]" aria-hidden="true" />
              <span>{isEn ? 'View Electronic Invoice' : 'Xem Hóa đơn điện tử'}</span>
            </Link>
            <Link
              href={`/customer/requests/${order.id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#B7DBC4] bg-white text-[#181A17] text-xs font-bold hover:bg-[#FAF8F4] no-underline"
            >
              <span>{isEn ? 'Back to Order Detail' : 'Về chi tiết đơn hàng'}</span>
            </Link>
          </div>
        </div>
      ) : (
        <SepayPayment
          key={order.id}
          shipmentId={order.id}
          requestCode={displayCode}
          amount={Number(order.totalCost)}
          checkout
          autoGenerateQr={statusLower === 'awaiting_payment'}
          eligible={
            payableStatuses.includes(statusLower) &&
            Number.isSafeInteger(Number(order.totalCost)) &&
            Number(order.totalCost) > 0
          }
          onPaid={() => void mutate()}
        />
      )}
    </div>
  );
}
