'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { InvoiceDocument, InvoiceDocumentData } from '@/features/orders/components/InvoiceDocument';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function CustomerOrderInvoicePage() {
  const params = useParams();
  const { language } = useLanguage();
  const isEn = language === 'en';
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
        setError(
          err?.message ||
            (isEn ? 'Unable to load electronic invoice.' : 'Không thể tải hóa đơn điện tử.'),
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, isEn]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#F4F1E9] rounded-2xl">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#A67C2E]" />
          <p className="text-sm font-medium text-[#5F6977]">
            {isEn ? 'Loading electronic invoice...' : 'Đang khởi tạo hóa đơn điện tử...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#F4F1E9] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-6 text-center border border-[#D8CEBE]">
          <AlertCircle className="w-12 h-12 text-[#B33E3E] mx-auto mb-3" />
          <h2 className="text-lg font-extrabold text-[#181A17] mb-2">
            {isEn ? 'Invoice Not Available' : 'Chưa thể xem hóa đơn'}
          </h2>
          <p className="text-sm text-[#5F6977] mb-6 leading-relaxed">
            {error ||
              (isEn
                ? 'The invoice has not been issued yet or you do not have permission to view it.'
                : 'Hóa đơn chưa được phát hành hoặc bạn không có quyền xem hóa đơn này.')}
          </p>
          <Link
            href={`/customer/requests/${id}?tab=payment`}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] font-bold rounded-xl text-sm transition no-underline"
          >
            {isEn ? 'Back to Order Details' : 'Quay lại chi tiết đơn hàng'}
          </Link>
        </div>
      </div>
    );
  }

  return <InvoiceDocument data={data} backHref={`/customer/requests/${id}?tab=payment`} />;
}
