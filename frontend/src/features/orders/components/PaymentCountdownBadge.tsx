'use client';

import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface PaymentCountdownBadgeProps {
  paymentDueAt?: string | null;
  createdAt?: string | null;
  fallbackHours?: number;
  compact?: boolean;
  className?: string;
}

export function resolvePaymentDueTimestamp(
  paymentDueAt?: string | null,
  createdAt?: string | null,
  fallbackHours = 12,
): number | null {
  if (paymentDueAt) {
    const ms = new Date(paymentDueAt).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (createdAt) {
    const ms = new Date(createdAt).getTime();
    if (Number.isFinite(ms)) return ms + fallbackHours * 3600 * 1000;
  }
  return null;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PaymentCountdownBadge({
  paymentDueAt,
  createdAt,
  fallbackHours = 12,
  compact = false,
  className = '',
}: PaymentCountdownBadgeProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const targetMs = resolvePaymentDueTimestamp(paymentDueAt, createdAt, fallbackHours);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!targetMs) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [targetMs]);

  if (!targetMs) return null;

  const remainingMs = targetMs - nowMs;
  const isExpired = remainingMs <= 0;
  const isUrgent = remainingMs > 0 && remainingMs <= 2 * 3600 * 1000;

  if (isExpired) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 whitespace-nowrap ${className}`}
      >
        <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
        <span>{isEn ? 'Payment expired' : 'Quá hạn thanh toán'}</span>
      </span>
    );
  }

  const timeText = formatRemaining(remainingMs);
  return (
    <span
      title={
        isEn
          ? `Pay before ${new Date(targetMs).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })} or the order auto-cancels`
          : `Thanh toán trước ${new Date(targetMs).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} để tránh tự động hủy đơn`
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums whitespace-nowrap ${
        isUrgent
          ? 'border-rose-300 bg-rose-50 text-rose-700'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      } ${className}`}
    >
      <Clock size={12} className="shrink-0" aria-hidden="true" />
      <span>
        {compact
          ? timeText
          : isEn
            ? `Pay within ${timeText}`
            : `Còn ${timeText} để thanh toán`}
      </span>
    </span>
  );
}
