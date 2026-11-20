'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getAuthToken, getCurrentUser } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [homeRoute, setHomeRoute] = useState('/login');

  useEffect(() => {
    console.error('Unhandled page error:', error);
    try {
      if (getAuthToken()) {
        const user = getCurrentUser();
        setHomeRoute(getDashboardRouteForRole(user?.role));
      }
    } catch {
      // ignore
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F4F1E9] text-[#273244] flex items-center justify-center p-6">
      <div
        role="alert"
        className="max-w-md w-full bg-white rounded-3xl border border-[#D8CEBE] shadow-sm p-6 sm:p-8 text-center"
      >
        <div
          aria-hidden="true"
          className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#F8EAEA] text-[#B33E3E] border border-[#B33E3E]/25 flex items-center justify-center"
        >
          <AlertTriangle size={28} />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#B33E3E] mb-2">
          {t('errors.noticeBrand', isEn ? 'EquiTransit System Notice' : 'Thông Báo Hệ Thống EquiTransit')}
        </p>
        <h1 className="text-2xl font-extrabold text-[#273244] mb-3">
          {t('errors.unexpectedTitle', isEn ? 'Unexpected Application Error' : 'Đã Xảy Ra Sự Cố Hiển Thị')}
        </h1>
        <p className="text-sm text-[#5F6977] leading-relaxed mb-7">
          {t(
            'errors.unexpectedMessage',
            isEn
              ? 'An unexpected client error occurred while loading this page. Please retry or return to the portal.'
              : 'Hệ thống gặp lỗi ngoài ý muốn khi tải trang này. Vui lòng thử lại hoặc quay về trang chính.'
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#181A17] hover:bg-[#242722] text-[#B49A68] border border-[#B49A68]/40 text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t('common.tryAgain', isEn ? 'Try Again' : 'Thử Lại')}</span>
          </button>
          <Link
            href={homeRoute}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] hover:bg-[#E8E2D8] text-[#273244] text-xs font-bold transition-colors no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Home size={14} aria-hidden="true" />
            <span>{t('errors.goHome', isEn ? 'Go to Portal' : 'Về Trang Chính')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
