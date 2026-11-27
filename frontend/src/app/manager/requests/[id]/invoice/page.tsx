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
      <div className="min-h-[60vh] flex items-center justify-center bg-[#FAF8F4] rounded-2xl border border-[#D8CEBE]">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#A67C2E]" />
          <p className="text-sm font-medium text-[#5C6658]">Đang tải hóa đơn điện tử từ hệ thống...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-7 text-center border border-[#D8CEBE]">
          <div className="w-12 h-12 rounded-2xl bg-[#F8EAEA] border border-[#E5B8B8] flex items-center justify-center mx-auto mb-3.5">
            <AlertCircle className="w-6 h-6 text-[#B33E3E]" />
          </div>
          <h2 className="text-lg font-extrabold text-[#181A17] mb-2">Chưa có hóa đơn điện tử</h2>
          <p className="text-sm text-[#5C6658] mb-6 leading-relaxed">
            {error || 'Hóa đơn chưa được phát hành hoặc đơn hàng chưa hoàn tất thanh toán.'}
          </p>
          <Link
            href={`/manager/requests/${id}`}
            className="no-underline inline-flex items-center justify-center px-4 py-2.5 bg-[#181A17] hover:bg-[#2A2D28] text-[#FAF8F4] font-bold rounded-xl text-xs whitespace-nowrap transition-colors shadow-sm"
          >
            Quay lại chi tiết đơn hàng
          </Link>
        </div>
      </div>
    );
  }

  return <InvoiceDocument data={data} backHref={`/manager/requests/${id}`} />;
}
