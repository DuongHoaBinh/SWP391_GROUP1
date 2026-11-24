'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { SepayPayment } from '@/features/orders/components/SepayPayment';

interface Order {
  id: number;
  requestCode: string;
  totalCost: number;
  status: string;
}

const payableStatuses = [
  'awaiting_payment',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'return_pending',
  'completed',
];

export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  const { language, t } = useLanguage();
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header className="border-b border-[#E5DDD0] pb-5">
        <Link
          href={validId ? `/customer/requests/${shipmentId}#sepay-payment` : '/customer/requests'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F6977] hover:text-[#181A17] mb-2 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E] rounded"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{t('payment.backToOrder', language === 'en' ? 'Back to Order' : 'Quay lại đơn hàng')}</span>
        </Link>

        <h1 className="text-2xl font-extrabold tracking-tight text-[#181A17] m-0">
          {order?.requestCode
            ? t('payment.headerWithCode', language === 'en' ? 'Payment for {code}' : 'Thanh toán đơn {code}', { code: order.requestCode })
            : t('payment.headerDefault', language === 'en' ? 'Order Payment' : 'Thanh toán đơn hàng')}
        </h1>
        <p className="mt-1 mb-0 text-sm text-[#5F6977]">
          {t(
            'payment.sepayBankNote',
            language === 'en'
              ? 'Transfer confirmation is verified directly from the bank via SePay. You can return to your order at any time to track progress.'
              : 'Kết quả được xác nhận trực tiếp từ ngân hàng qua SePay. Bạn có thể quay lại đơn để theo dõi tiến trình.',
          )}
        </p>
      </header>

      {!validId || error ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-5 text-sm text-[#B33E3E]">
          <p>{error?.message || t('payment.invalidOrderId', language === 'en' ? 'Invalid transport order ID.' : 'Mã đơn hàng không hợp lệ.')}</p>
          {validId && (
            <button
              type="button"
              onClick={() => void mutate()}
              className="min-h-[44px] rounded-lg px-3 font-semibold underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B33E3E]"
            >
              {t('common.retry', language === 'en' ? 'Retry' : 'Thử tải lại')}
            </button>
          )}
        </div>
      ) : isLoadingOrder || !order ? (
        <div role="status" className="space-y-4 rounded-2xl border border-[#E5DDD0] bg-white p-6">
          <div className="h-5 w-48 animate-pulse rounded bg-[#F0EEE8] motion-reduce:animate-none" />
          <div className="h-28 w-full animate-pulse rounded-xl bg-[#F0EEE8] motion-reduce:animate-none" />
          <div className="h-12 w-40 animate-pulse rounded-lg bg-[#F0EEE8] motion-reduce:animate-none" />
          <span className="sr-only">
            {t('payment.loadingOrder', language === 'en' ? 'Loading order payment details...' : 'Đang tải thông tin thanh toán đơn hàng...')}
          </span>
        </div>
      ) : (
        <SepayPayment
          key={order.id}
          shipmentId={order.id}
          requestCode={order.requestCode}
          amount={Number(order.totalCost)}
          checkout
          eligible={
            payableStatuses.includes(String(order.status || '').toLowerCase()) &&
            Number.isSafeInteger(Number(order.totalCost)) &&
            Number(order.totalCost) > 0
          }
        />
      )}
    </div>
  );
}
