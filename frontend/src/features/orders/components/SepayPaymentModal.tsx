'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { SepayPayment } from './SepayPayment';
import { PaymentCountdownBadge } from './PaymentCountdownBadge';

interface SepayPaymentModalProps {
  isOpen: boolean;
  shipmentId: number;
  requestCode: string;
  amount: number;
  paymentDueAt?: string | null;
  createdAt?: string | null;
  justCreated?: boolean;
  onClose: () => void;
  onPaid?: () => void;
}

export function SepayPaymentModal({
  isOpen,
  shipmentId,
  requestCode,
  amount,
  paymentDueAt,
  createdAt,
  justCreated = false,
  onClose,
  onPaid,
}: SepayPaymentModalProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [mounted, setMounted] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPaidSuccess(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6 bg-[#181A17]/70 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sepay-modal-title"
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#FAF8F4] border border-[#D8CEBE] shadow-2xl animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-[#181A17] text-[#FAF8F4] border-b border-[#2C2F2A]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="sepay-modal-title" className="text-base sm:text-lg font-extrabold m-0">
                {paidSuccess
                  ? isEn
                    ? 'Payment Confirmed!'
                    : 'Thanh toán thành công!'
                  : justCreated
                    ? isEn
                      ? `Order ${requestCode} Created — Pay Now`
                      : `Đơn ${requestCode} đã tạo — Thanh toán ngay`
                    : isEn
                      ? `Pay Order ${requestCode}`
                      : `Thanh toán đơn ${requestCode}`}
              </h2>
              {!paidSuccess && (
                <PaymentCountdownBadge paymentDueAt={paymentDueAt} createdAt={createdAt} />
              )}
            </div>
            <p className="text-xs text-[#D4C5A3] mt-1 mb-0">
              {paidSuccess
                ? isEn
                  ? 'Your order has been forwarded to Logistics Manager for operational feasibility review.'
                  : 'Đơn hàng đã chuyển sang Quản lý vận hành thẩm định khả thi và lập lịch trình.'
                : isEn
                  ? 'Scan the VietQR code below to complete payment immediately. If you close this popup, your order remains reserved for 12 hours before auto-cancellation.'
                  : 'Quét mã VietQR bên dưới để thanh toán liền mạch. Nếu đóng popup hoặc thanh toán chưa hoàn tất, đơn sẽ được giữ trong 12 giờ trước khi tự động hủy.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close payment popup' : 'Đóng popup thanh toán'}
            className="p-2 rounded-xl text-[#D4C5A3] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* 12h deadline reassurance bar */}
        {!paidSuccess && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-amber-700 shrink-0" />
              <span>
                {isEn
                  ? '12-hour payment hold: Unpaid orders auto-cancel after 12 hours and release reserved vehicles & horses.'
                  : 'Chính sách giữ đơn 12 giờ: Sau 12 giờ chưa nhận thanh toán thành công, hệ thống tự động hủy đơn và giải phóng xe + ngựa.'}
              </span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-5">
          <SepayPayment
            shipmentId={shipmentId}
            requestCode={requestCode}
            amount={amount}
            checkout
            eligible
            autoGenerateQr
            inModal
            onCloseModal={onClose}
            onPaid={() => {
              setPaidSuccess(true);
              onPaid?.();
            }}
          />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white border-t border-[#E8E2D8]">
          {paidSuccess ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 size={15} />
                {isEn ? 'SePay payment verified' : 'Đã xác nhận giao dịch SePay'}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/customer/requests/${shipmentId}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold hover:bg-[#2C2F2A] no-underline"
                >
                  <span>{isEn ? 'View Order Details' : 'Xem chi tiết đơn'}</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] text-[#181A17] text-xs font-bold hover:bg-[#EFE9DC] transition-colors cursor-pointer"
              >
                {isEn ? 'Pay Later (Keep 12h Hold)' : 'Thanh toán sau (Giữ đơn 12 giờ)'}
              </button>
              <Link
                href={`/customer/requests/${shipmentId}?tab=payment`}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A67C2E] hover:underline no-underline"
              >
                <span>{isEn ? 'Open full order detail' : 'Mở trang chi tiết đơn'}</span>
                <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
