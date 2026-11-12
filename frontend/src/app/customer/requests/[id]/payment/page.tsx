'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { SepayPayment } from '@/features/orders/components/SepayPayment';

interface Order { id: number; requestCode: string; totalCost: number; status: string }
const payableStatuses = ['approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed'];

export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  const shipmentId = Number(params.id);
  const validId = /^\d+$/.test(params.id) && Number.isSafeInteger(shipmentId) && shipmentId > 0;
  const { data: order, error, isLoading, mutate } = useSWR<Order>(
    validId ? ['sepay-order', getCurrentUser().id, shipmentId] : null,
    () => apiClient<Order>(`/orders/${shipmentId}`, { cache: 'no-store' }),
    { shouldRetryOnError: false, refreshInterval: 10000 },
  );

  return <div className="mx-auto max-w-3xl space-y-6">
    <Link href={validId ? `/customer/requests/${shipmentId}#sepay-payment` : '/customer/requests'} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ArrowLeft size={16} aria-hidden="true" />Quay lại đơn hàng</Link>
    <header><h1 className="text-2xl font-bold tracking-tight text-slate-900">Thanh toán {order?.requestCode ? `đơn ${order.requestCode}` : 'đơn hàng'}</h1><p className="mt-2 text-sm text-slate-600">Kết quả được xác nhận từ ngân hàng qua SePay. Bạn có thể quay lại đơn để theo dõi.</p></header>
    {!validId || error ? <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{error?.message || 'Mã đơn hàng không hợp lệ.'}</p>{validId && <button type="button" onClick={() => void mutate()} className="min-h-11 rounded-lg px-3 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Thử tải lại</button>}</div> : isLoading || !order ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Đang tải thông tin đơn hàng…</p> : <SepayPayment key={order.id} shipmentId={order.id} requestCode={order.requestCode} amount={Number(order.totalCost)} checkout eligible={payableStatuses.includes(order.status) && Number.isSafeInteger(Number(order.totalCost)) && Number(order.totalCost) > 0} />}
  </div>;
}
