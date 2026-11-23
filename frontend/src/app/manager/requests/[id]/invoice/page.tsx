'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { InvoiceDocument, InvoiceDocumentData } from '@/features/orders/components/InvoiceDocument';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ManagerOrderInvoicePage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<InvoiceDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient<InvoiceDocumentData>(`/orders/${id}/invoice`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message || 'Không thể tải hóa đơn điện tử');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-sm text-slate-500">Đang tải hóa đơn điện tử từ hệ thống...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow p-6 text-center border border-slate-200 dark:border-slate-700">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Chưa thể xem hóa đơn</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            {error || 'Hóa đơn chưa được phát hành hoặc không tồn tại.'}
          </p>
          <Link
            href={`/manager/requests/${id}`}
            className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition"
          >
            Quay lại quản lý đơn hàng
          </Link>
        </div>
      </div>
    );
  }

  return <InvoiceDocument data={data} backHref={`/manager/requests/${id}`} />;
}
