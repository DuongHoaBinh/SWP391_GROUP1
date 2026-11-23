'use client';

import React from 'react';
import Link from 'next/link';
import { formatVietnamDateTime, numberToVietnameseWords } from '../prepaid-policy';

export interface InvoiceDocumentData {
  invoiceCode: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  amount: number;
  currency: string;
  snapshot: any;
  payment?: {
    method: string;
    transactionId: string;
    paidAt: string | null;
    bankCode?: string;
  } | null;
  supplementalInvoices?: any[];
}

interface InvoiceDocumentProps {
  data: InvoiceDocumentData;
  backHref?: string;
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ data, backHref }) => {
  const { snapshot, payment, supplementalInvoices } = data;
  const customer = snapshot?.customer || {};
  const route = snapshot?.route || {};
  const horses = snapshot?.horses || [];
  const breakdown = snapshot?.breakdown || [];
  const freightTotal = snapshot?.freightTotal ?? (data.amount - (snapshot?.insuranceTotal || 0));
  const insuranceTotal = snapshot?.insuranceTotal ?? 0;

  const isPaid = data.status === 'paid' || Boolean(payment?.paidAt);
  const isVoid = data.status === 'void';

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 sm:px-6 print:p-0 print:bg-white">
      {/* Top action bar (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between no-print">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Quay lại chi tiết đơn
          </Link>
        ) : <div />}

        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition text-sm cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            In / Tải PDF Hóa Đơn
          </button>
        </div>
      </div>

      {/* A4 Printable Invoice Sheet */}
      <div className="print-container max-w-4xl mx-auto bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 sm:p-12 print:shadow-none print:border-none print:p-0 print:text-black">
        {/* Header: Company & Title */}
        <div className="border-b-2 border-emerald-600 pb-6 mb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-black tracking-wider text-emerald-700 dark:text-emerald-400 print:text-emerald-800 uppercase">
                EquiTransit
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold uppercase">
                Logistics
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 print:text-slate-700">
              Công ty Cổ phần Vận chuyển Ngựa đua Quốc tế EquiTransit
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
              Hệ thống Vận tải Xuyên biên giới Chuyên biệt • Hotline: 1900 6868
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
              Website: equitransit.com • Email: contact@equitransit.com
            </p>
          </div>

          <div className="text-left sm:text-right w-full sm:w-auto">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white print:text-black">
              HÓA ĐƠN ĐIỆN TỬ
            </h1>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase mt-0.5">
              ELECTRONIC INVOICE
            </p>
            <div className="mt-2 inline-flex items-center gap-2">
              <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
                {data.invoiceCode}
              </span>
              {isPaid ? (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300">
                  ĐÃ THANH TOÁN
                </span>
              ) : isVoid ? (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 border border-rose-300">
                  ĐÃ HỦY
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300">
                  CHỜ THANH TOÁN
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ngày phát hành: {formatVietnamDateTime(data.issuedAt)}
            </p>
            {data.paidAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Ngày thanh toán: {formatVietnamDateTime(data.paidAt)}
              </p>
            )}
          </div>
        </div>

        {/* 2-Column Info: Customer & Itinerary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 print:bg-slate-50 print:border-slate-200">
          <div>
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Khách hàng / Người thanh toán
            </h2>
            <p className="font-semibold text-sm">{customer.name || 'Khách hàng'}</p>
            {customer.phone && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <span className="text-slate-500">Điện thoại:</span> {customer.phone}
              </p>
            )}
            {customer.email && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <span className="text-slate-500">Email:</span> {customer.email}
              </p>
            )}
            {customer.address && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <span className="text-slate-500">Địa chỉ:</span> {customer.address}
              </p>
            )}
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Lộ trình & Chuyến đi
            </h2>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 font-medium">Điểm đón:</span> {route.origin || '—'}
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 font-medium">Điểm giao:</span> {route.destination || '—'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
              <span>
                <span className="text-slate-500">Phương thức:</span>{' '}
                <strong className="text-slate-800 dark:text-slate-200 uppercase">{route.transportMode || 'road'}</strong>
                {route.seaMode ? ` (${route.seaMode})` : ''}
              </span>
              <span>
                <span className="text-slate-500">Hình thức:</span>{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {route.tripType === 'round_trip' || route.isRoundTrip ? 'Khứ hồi' : 'Một chiều'}
                </strong>
              </span>
              {route.distanceKm && (
                <span>
                  <span className="text-slate-500">Khoảng cách:</span>{' '}
                  <strong className="text-slate-800 dark:text-slate-200">{Number(route.distanceKm).toLocaleString('vi-VN')} km</strong>
                </span>
              )}
            </div>
            {route.returnDepartureAt && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                Lịch đón chặng về: {formatVietnamDateTime(route.returnDepartureAt)}
              </p>
            )}
          </div>
        </div>

        {/* Section: Horses & Insurance Table */}
        {horses.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Danh sách cá thể ngựa & Gói bảo hiểm
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-700 rounded-lg">
                <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">STT</th>
                    <th className="p-2.5">Tên ngựa</th>
                    <th className="p-2.5">Số Microchip</th>
                    <th className="p-2.5 text-right">Giá trị khai báo</th>
                    <th className="p-2.5">Gói bảo hiểm</th>
                    <th className="p-2.5 text-right">Phí bảo hiểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {horses.map((h: any, idx: number) => {
                    const pkgName = h.insurancePackage === 'premium' ? 'Toàn diện (3%)' : h.insurancePackage === 'standard' ? 'Tiêu chuẩn (1.5%)' : 'Cơ bản (0%)';
                    return (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                        <td className="p-2.5 text-slate-500">{idx + 1}</td>
                        <td className="p-2.5 font-medium">{h.name}</td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-400">{h.microchipNo || '—'}</td>
                        <td className="p-2.5 text-right">{Number(h.declaredValueVnd || 0).toLocaleString('vi-VN')} VND</td>
                        <td className="p-2.5">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{pkgName}</span>
                        </td>
                        <td className="p-2.5 text-right font-medium">{Number(h.insuranceFee || 0).toLocaleString('vi-VN')} VND</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section: Freight Cost Breakdown Table */}
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Chi tiết cấu thành giá cước vận chuyển (Breakdown)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-700 rounded-lg">
              <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Hạng mục cấu thành</th>
                  <th className="p-2.5">Diễn giải / Tham số</th>
                  <th className="p-2.5 text-right">Thành tiền (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {breakdown.length > 0 ? (
                  breakdown.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                      <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{item.item || item.name}</td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">{item.description || item.note || '—'}</td>
                      <td className="p-2.5 text-right font-mono">{Number(item.amount || item.subtotal || 0).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-2.5 font-medium">Cước vận chuyển trọn gói</td>
                    <td className="p-2.5 text-slate-500">Theo báo giá hệ thống snapshot</td>
                    <td className="p-2.5 text-right font-mono">{Number(freightTotal).toLocaleString('vi-VN')}</td>
                  </tr>
                )}
                {insuranceTotal > 0 && (
                  <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 font-medium text-emerald-900 dark:text-emerald-300">
                    <td className="p-2.5">Tổng phí bảo hiểm vận chuyển</td>
                    <td className="p-2.5">Theo bảng mức độ sự cố M1–M4</td>
                    <td className="p-2.5 text-right font-mono">{Number(insuranceTotal).toLocaleString('vi-VN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total calculation summary */}
        <div className="border-t border-b border-slate-200 dark:border-slate-700 py-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <span className="text-xs text-slate-500 uppercase font-medium">Số tiền viết bằng chữ:</span>
              <p className="text-sm font-semibold italic text-emerald-800 dark:text-emerald-300">
                {numberToVietnameseWords(data.amount)}
              </p>
            </div>
            <div className="text-left sm:text-right w-full sm:w-auto">
              <span className="text-xs text-slate-500 uppercase font-medium">Tổng tiền thanh toán:</span>
              <p className="text-2xl font-black text-slate-900 dark:text-white print:text-black">
                {Number(data.amount).toLocaleString('vi-VN')} <span className="text-sm font-bold text-emerald-600">{data.currency || 'VND'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Payment Confirmation & Audit Box */}
        {payment && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs">
            <h3 className="font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Xác nhận thanh toán điện tử (SePay)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-slate-700 dark:text-slate-300">
              <div>
                <span className="text-slate-500 block">Phương thức:</span>
                <strong>Chuyển khoản VietQR ({payment.method})</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Mã giao dịch SePay:</span>
                <strong className="font-mono">{payment.transactionId || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Ngân hàng:</span>
                <strong>{payment.bankCode || 'VietinBank'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Thời điểm đối soát:</span>
                <strong>{formatVietnamDateTime(payment.paidAt)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Supplemental invoices if any */}
        {supplementalInvoices && supplementalInvoices.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Hóa đơn phát sinh bổ sung (Supplemental Invoices)
            </h3>
            <div className="space-y-2">
              {supplementalInvoices.map((supp: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-2.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs">
                  <div>
                    <strong className="font-mono">{supp.code}</strong> — {supp.snapshot?.invoiceKind || 'Phí phát sinh'}
                  </div>
                  <div className="text-right font-bold text-amber-900 dark:text-amber-200">
                    +{Number(supp.amount).toLocaleString('vi-VN')} VND ({supp.status})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400 print:text-slate-600 space-y-1">
          <p className="font-medium">
            Hóa đơn điện tử khởi tạo tự động từ hệ thống EquiTransit, có giá trị lưu hành và đối soát thanh toán.
          </p>
          <p className="text-[11px]">
            Theo quy định pháp luật về giao dịch thương mại điện tử, chứng từ này có hiệu lực xác nhận quyền lợi vận chuyển mà không yêu cầu chữ ký đóng dấu thủ công.
          </p>
        </div>
      </div>

      {/* Media print style overrides */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};
