'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Compass, ArrowLeft, Home } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getAuthToken, getCurrentUser } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';

export default function NotFoundPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [homeRoute, setHomeRoute] = useState('/login');
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    try {
      if (getAuthToken()) {
        const user = getCurrentUser();
        setHomeRoute(getDashboardRouteForRole(user?.role));
      }
      if (typeof window !== 'undefined' && window.history.length > 1) {
        setCanGoBack(true);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F1E9] text-[#273244] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#D8CEBE] shadow-sm p-6 sm:p-8 text-center">
        <div
          aria-hidden="true"
          className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#181A17] text-[#B49A68] border border-[#B49A68]/40 flex items-center justify-center"
        >
          <Compass size={28} />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#A67C2E] mb-2">
          404 • EquiTransit Logistics
        </p>
        <h1 className="text-2xl font-extrabold text-[#273244] mb-3">
          {isEn ? 'Page Not Found' : 'Không Tìm Thấy Trang'}
        </h1>
        <p className="text-sm text-[#5F6977] leading-relaxed mb-7">
          {isEn
            ? 'The route or resource you requested does not exist or has been relocated within our portal.'
            : 'Đường dẫn hoặc tài nguyên bạn đang tìm kiếm không tồn tại hoặc đã được chuyển vị trí.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {canGoBack && (
            <button
              type="button"
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] hover:bg-[#E8E2D8] text-[#273244] text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{t('errors.goBack', isEn ? 'Go Back' : 'Quay Lại')}</span>
            </button>
          )}
          <Link
            href={homeRoute}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#181A17] hover:bg-[#242722] text-[#B49A68] border border-[#B49A68]/40 text-xs font-bold transition-colors no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Home size={14} aria-hidden="true" />
            <span>{t('errors.goHome', isEn ? 'Go to Portal' : 'Về Trang Chính')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
