'use client';

import React from 'react';
import Link from 'next/link';
import { formatVietnamDateTime, numberToVietnameseWords } from '../prepaid-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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

function formatTransportModeLabel(mode: string | undefined, isEn: boolean): string {
  const m = String(mode || 'road').toLowerCase();
  if (m === 'air') return isEn ? 'Air Cargo' : 'Hàng không';
  if (m === 'sea') return isEn ? 'Sea Freight' : 'Đường thủy';
  return isEn ? 'Road Freight' : 'Đường bộ';
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ data, backHref }) => {
  const { language } = useLanguage();
  const isEn = language === 'en';
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
    <div className="min-h-screen bg-[#F4F1E9] py-6 px-3 sm:px-6 print:p-0 print:bg-white">
      {/* Top action bar (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-5 flex flex-wrap items-center justify-between gap-3 no-print">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center text-sm font-bold text-[#5F6977] hover:text-[#181A17] transition no-underline"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {isEn ? 'Back to Order Details' : 'Quay lại chi tiết đơn'}
          </Link>
        ) : (
          <div />
        )}

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2.5 bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] font-bold rounded-xl shadow-sm transition text-xs sm:text-sm cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2 text-[#D4C5A3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            {isEn ? 'Print / Save PDF Invoice' : 'In / Tải PDF Hóa Đơn'}
          </button>
        </div>
      </div>

      {/* A4 Printable Invoice Sheet — Warm Editorial Light Theme */}
      <div className="print-container max-w-4xl mx-auto bg-white text-[#181A17] rounded-2xl shadow-md border border-[#D8CEBE] p-6 sm:p-11 print:shadow-none print:border-none print:p-0 print:text-black">
        {/* Header: Company & Title */}
        <div className="border-b-2 border-[#181A17] pb-6 mb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-black tracking-wider text-[#181A17] uppercase">
                EquiTransit
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#FAF8F4] border border-[#D8CEBE] text-[#8C6621] font-extrabold uppercase">
                Logistics
              </span>
            </div>
            <p className="text-xs text-[#273244] font-semibold m-0">
              {isEn
                ? 'EquiTransit International Racehorse Transport JSC'
                : 'Công ty Cổ phần Vận chuyển Ngựa đua Quốc tế EquiTransit'}
            </p>
            <p className="text-xs text-[#5F6977] mt-1 mb-0">
              {isEn
                ? 'Specialized Cross-Border Equine Logistics • Hotline: 1900 6868'
                : 'Hệ thống Vận tải Xuyên biên giới Chuyên biệt • Hotline: 1900 6868'}
            </p>
            <p className="text-xs text-[#5F6977] mt-0.5 mb-0">
              Website: equitransit.com • Email: contact@equitransit.com
            </p>
          </div>

          <div className="text-left sm:text-right w-full sm:w-auto">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#181A17] m-0">
              {isEn ? 'ELECTRONIC INVOICE' : 'HÓA ĐƠN ĐIỆN TỬ'}
            </h1>
            <p className="text-xs font-mono text-[#8C6621] font-bold uppercase mt-0.5 mb-0">
              {isEn ? 'VAT & FREIGHT STATEMENT' : 'ELECTRONIC INVOICE'}
            </p>
            <div className="mt-2 inline-flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold font-mono text-[#181A17]">
                {data.invoiceCode}
              </span>
              {isPaid ? (
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-[#E8F2EB] text-[#1E563B] border border-[#B7DBC4]">
                  {isEn ? 'PAID' : 'ĐÃ THANH TOÁN'}
                </span>
              ) : isVoid ? (
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]">
                  {isEn ? 'VOID' : 'ĐÃ HỦY'}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-[#FFF7E6] text-[#8C6621] border border-[#DFCA9A]">
                  {isEn ? 'AWAITING PAYMENT' : 'CHỜ THANH TOÁN'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#5F6977] mt-1.5 mb-0">
              {isEn ? 'Issued:' : 'Ngày phát hành:'} {formatVietnamDateTime(data.issuedAt)}
            </p>
            {data.paidAt && (
              <p className="text-xs text-[#287653] font-semibold mt-0.5 mb-0">
                {isEn ? 'Paid at:' : 'Ngày thanh toán:'} {formatVietnamDateTime(data.paidAt)}
              </p>
            )}
          </div>
        </div>

        {/* 2-Column Info: Customer & Itinerary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 p-4 sm:p-5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0]">
          <div className="space-y-1">
            <h2 className="text-[11px] font-extrabold text-[#7A591C] uppercase tracking-wider mb-2 mt-0">
              {isEn ? 'Customer / Payer' : 'Khách hàng / Người thanh toán'}
            </h2>
            <p className="font-bold text-sm text-[#181A17] m-0">
              {customer.name || customer.contactName || (isEn ? 'Valued Customer' : 'Khách hàng')}
            </p>
            {customer.phone && (
              <p className="text-xs text-[#273244] m-0">
                <span className="text-[#5F6977]">{isEn ? 'Phone:' : 'Điện thoại:'}</span> {customer.phone}
              </p>
            )}
            {customer.email && (
              <p className="text-xs text-[#273244] m-0">
                <span className="text-[#5F6977]">Email:</span> {customer.email}
              </p>
            )}
            {customer.address && (
              <p className="text-xs text-[#273244] m-0">
                <span className="text-[#5F6977]">{isEn ? 'Address:' : 'Địa chỉ:'}</span> {customer.address}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-[11px] font-extrabold text-[#7A591C] uppercase tracking-wider mb-2 mt-0">
              {isEn ? 'Route & Shipment Itinerary' : 'Lộ trình & Chuyến đi'}
            </h2>
            <p className="text-xs text-[#273244] m-0">
              <span className="text-[#5F6977] font-medium">{isEn ? 'Pickup:' : 'Điểm đón:'}</span>{' '}
              <strong className="text-[#181A17]">{route.origin || snapshot?.origin || '—'}</strong>
            </p>
            <p className="text-xs text-[#273244] m-0">
              <span className="text-[#5F6977] font-medium">{isEn ? 'Destination:' : 'Điểm giao:'}</span>{' '}
              <strong className="text-[#181A17]">{route.destination || snapshot?.destination || '—'}</strong>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-[#5F6977]">
              <span>
                {isEn ? 'Mode:' : 'Phương thức:'}{' '}
                <strong className="text-[#181A17]">
                  {formatTransportModeLabel(route.transportMode || snapshot?.transportMode, isEn)}
                </strong>
                {route.seaMode ? ` (${route.seaMode})` : ''}
              </span>
              <span>
                {isEn ? 'Trip Type:' : 'Hình thức:'}{' '}
                <strong className="text-[#181A17]">
                  {route.tripType === 'round_trip' || route.isRoundTrip
                    ? isEn ? 'Round-Trip' : 'Khứ hồi'
                    : isEn ? 'One-Way' : 'Một chiều'}
                </strong>
              </span>
              {route.distanceKm && (
                <span>
                  {isEn ? 'Distance:' : 'Khoảng cách:'}{' '}
                  <strong className="text-[#181A17]">{Number(route.distanceKm).toLocaleString('vi-VN')} km</strong>
                </span>
              )}
            </div>
            {route.returnDepartureAt && (
              <p className="text-xs text-[#8C6621] pt-1 font-semibold m-0">
                {isEn ? 'Return Pickup:' : 'Lịch đón chặng về:'} {formatVietnamDateTime(route.returnDepartureAt)}
              </p>
            )}
          </div>
        </div>

        {/* Section: Horses & Insurance Table */}
        {horses.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] font-extrabold text-[#5F6977] uppercase tracking-wider mb-2 mt-0">
              {isEn ? 'Racehorses & Transport Insurance' : 'Danh sách cá thể ngựa & Gói bảo hiểm'}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-[#D8CEBE]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#FAF8F4] text-[#5F6977] font-bold border-b border-[#D8CEBE]">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">{isEn ? 'Horse Name' : 'Tên ngựa'}</th>
                    <th className="p-2.5">Microchip</th>
                    <th className="p-2.5 text-right">{isEn ? 'Declared Value' : 'Giá trị khai báo'}</th>
                    <th className="p-2.5">{isEn ? 'Insurance Plan' : 'Gói bảo hiểm'}</th>
                    <th className="p-2.5 text-right">{isEn ? 'Premium' : 'Phí bảo hiểm'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0]">
                  {horses.map((h: any, idx: number) => {
                    const pkgName =
                      h.insurancePackage === 'premium'
                        ? isEn ? 'Premium (3%)' : 'Toàn diện (3%)'
                        : h.insurancePackage === 'standard'
                          ? isEn ? 'Standard (1.5%)' : 'Tiêu chuẩn (1,5%)'
                          : isEn ? 'Basic (0%)' : 'Cơ bản (0%)';
                    return (
                      <tr key={idx} className="hover:bg-[#FAF8F4]/60">
                        <td className="p-2.5 text-[#5F6977]">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-[#181A17]">{h.name}</td>
                        <td className="p-2.5 font-mono text-[#5F6977]">{h.microchipNo || '—'}</td>
                        <td className="p-2.5 text-right font-mono whitespace-nowrap">
                          {Number(h.declaredValueVnd || h.declaredValue || 0).toLocaleString('vi-VN')}{'\u00A0'}VND
                        </td>
                        <td className="p-2.5 font-semibold text-[#181A17]">{pkgName}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#181A17] whitespace-nowrap">
                          {Number(h.insuranceFee || 0).toLocaleString('vi-VN')}{'\u00A0'}VND
                        </td>
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
          <h2 className="text-[11px] font-extrabold text-[#5F6977] uppercase tracking-wider mb-2 mt-0">
            {isEn ? 'Freight & Insurance Cost Breakdown' : 'Chi tiết cấu thành giá cước vận chuyển'}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#D8CEBE]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#FAF8F4] text-[#5F6977] font-bold border-b border-[#D8CEBE]">
                <tr>
                  <th className="p-2.5">{isEn ? 'Line Item' : 'Hạng mục cấu thành'}</th>
                  <th className="p-2.5">{isEn ? 'Description' : 'Diễn giải / Tham số'}</th>
                  <th className="p-2.5 text-right">{isEn ? 'Amount (VND)' : 'Thành tiền (VND)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE0]">
                {breakdown.length > 0 ? (
                  breakdown.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-semibold text-[#181A17]">{item.item || item.name || item.label}</td>
                      <td className="p-2.5 text-[#5F6977]">
                        {item.description || item.note || (item.quantity && item.unit ? `${item.quantity} ${item.unit}` : '—')}
                      </td>
                      <td className="p-2.5 text-right font-mono whitespace-nowrap">
                        {Number(item.amount || item.subtotal || 0).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-2.5 font-semibold text-[#181A17]">
                      {isEn ? 'Dedicated Charter Transport Freight' : 'Cước vận chuyển bao chuyến chuyên dụng'}
                    </td>
                    <td className="p-2.5 text-[#5F6977]">
                      {isEn ? 'Locked from system quote snapshot' : 'Theo báo giá hệ thống snapshot'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold whitespace-nowrap">
                      {Number(freightTotal).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                )}
                {insuranceTotal > 0 && (
                  <tr className="bg-[#E8F2EB]/60 font-semibold text-[#1E563B]">
                    <td className="p-2.5">{isEn ? 'Total Transport Insurance Premium' : 'Tổng phí bảo hiểm vận chuyển'}</td>
                    <td className="p-2.5">{isEn ? 'Coverage per incident tier M1–M4' : 'Theo bảng mức độ sự cố M1–M4'}</td>
                    <td className="p-2.5 text-right font-mono whitespace-nowrap">
                      {Number(insuranceTotal).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total calculation summary */}
        <div className="border-t-2 border-b border-[#D8CEBE] py-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Amount in words (Vietnamese):' : 'Số tiền viết bằng chữ:'}
              </span>
              <p className="text-sm font-semibold italic text-[#1E563B] mt-0.5 mb-0">
                {numberToVietnameseWords(data.amount)}
              </p>
            </div>
            <div className="text-left sm:text-right w-full sm:w-auto">
              <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                {isEn ? 'Total Amount Due:' : 'Tổng tiền thanh toán:'}
              </span>
              <p className="text-2xl font-black text-[#181A17] font-mono mt-0.5 mb-0 whitespace-nowrap">
                {Number(data.amount).toLocaleString('vi-VN')}{' '}
                <span className="text-sm font-extrabold text-[#A67C2E]">{data.currency || 'VND'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Payment Confirmation & Audit Box */}
        {payment && (
          <div className="mb-6 p-4 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4] text-xs">
            <h3 className="font-extrabold text-[#1E563B] uppercase tracking-wider mb-2 mt-0 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#287653]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {isEn ? 'Electronic Payment Confirmation (SePay)' : 'Xác nhận thanh toán điện tử (SePay)'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[#273244]">
              <div>
                <span className="text-[#5F6977] block">{isEn ? 'Method:' : 'Phương thức:'}</span>
                <strong className="text-[#181A17]">VietQR ({payment.method})</strong>
              </div>
              <div>
                <span className="text-[#5F6977] block">{isEn ? 'SePay Tx ID:' : 'Mã giao dịch SePay:'}</span>
                <strong className="font-mono text-[#181A17]">{payment.transactionId || '—'}</strong>
              </div>
              <div>
                <span className="text-[#5F6977] block">{isEn ? 'Bank:' : 'Ngân hàng:'}</span>
                <strong className="text-[#181A17]">{payment.bankCode || '—'}</strong>
              </div>
              <div>
                <span className="text-[#5F6977] block">{isEn ? 'Verified at:' : 'Thời điểm đối soát:'}</span>
                <strong className="text-[#181A17]">{formatVietnamDateTime(payment.paidAt)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Supplemental invoices if any */}
        {supplementalInvoices && supplementalInvoices.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[11px] font-extrabold text-[#5F6977] uppercase tracking-wider mb-2 mt-0">
              {isEn ? 'Supplemental Invoices' : 'Hóa đơn phát sinh bổ sung'}
            </h3>
            <div className="space-y-2">
              {supplementalInvoices.map((supp: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-[#FFF9EB] border border-[#DFCA9A] text-xs">
                  <div className="text-[#181A17]">
                    <strong className="font-mono">{supp.code}</strong> —{' '}
                    {supp.snapshot?.invoiceKind || (isEn ? 'Additional charges' : 'Phí phát sinh')}
                  </div>
                  <div className="text-right font-bold text-[#8C6621] whitespace-nowrap">
                    +{Number(supp.amount).toLocaleString('vi-VN')} VND ({supp.status})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="pt-5 border-t border-[#E5DDD0] text-center text-xs text-[#5F6977] space-y-1">
          <p className="font-semibold text-[#273244] m-0">
            {isEn
              ? 'This electronic invoice was automatically generated by EquiTransit and is valid for accounting & payment verification.'
              : 'Hóa đơn điện tử khởi tạo tự động từ hệ thống EquiTransit, có giá trị lưu hành và đối soát thanh toán.'}
          </p>
          <p className="text-[11px] m-0">
            {isEn
              ? 'Valid under e-commerce transaction regulations without requiring a physical wet stamp or manual signature.'
              : 'Theo quy định pháp luật về giao dịch thương mại điện tử, chứng từ này có hiệu lực xác nhận quyền lợi vận chuyển mà không yêu cầu chữ ký đóng dấu thủ công.'}
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
