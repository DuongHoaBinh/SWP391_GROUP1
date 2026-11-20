'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { setAuthSession } from '@/lib/auth';
import { getDashboardRouteForRole, getPostLoginRedirect } from '@/lib/auth-redirect';
import { loginWithGoogle } from '@/lib/auth-login';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

interface GoogleAuthButtonProps {
  onError: (msg: string) => void;
  text?: string;
  disabled?: boolean;
  tone?: 'light' | 'dark';
}

function InnerGoogleButton({ onError, text, disabled }: GoogleAuthButtonProps) {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const label = text || t('auth.continueWithGoogle', 'Tiếp tục với Google');

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const token = tokenResponse.access_token;
        const res = await loginWithGoogle(API_BASE_URL, token);
        const isEscortUser =
          res.user.specialization === 'escort' ||
          res.user.persona === 'escort' ||
          res.user.email?.toLowerCase().includes('escort');
        const normalizedRole = String(res.user.role || '').toUpperCase();
        const defaultRoute =
          normalizedRole === 'DRIVER_ESCORT'
            ? isEscortUser
              ? '/escort'
              : '/driver'
            : getDashboardRouteForRole(normalizedRole);

        const finalRoute = getPostLoginRedirect(
          searchParams.get('redirect'),
          defaultRoute,
        );

        setAuthSession(res.accessToken, {
          ...res.user,
          persona: isEscortUser ? 'escort' : res.user.persona,
        });
        window.location.assign(finalRoute);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : undefined;
        onError(
          msg ||
            t('auth.googleLoginFailed', 'Đăng nhập Google thất bại. Vui lòng thử lại.'),
        );
      } finally {
        setLoading(false);
      }
    },
    onError: (err) => {
      console.error('Google OAuth error:', err);
      setLoading(false);
      onError(
        t(
          'auth.googleAuthFailed',
          'Quá trình xác thực Google không thành công. Vui lòng thử lại.',
        ),
      );
    },
    onNonOAuthError: () => {
      setLoading(false);
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        setLoading(true);
        googleLogin();
      }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="w-full h-11 rounded-xl border border-[#D4C5A3]/70 bg-white hover:bg-[#FAF8F4] hover:border-[#C4B38E] active:scale-[0.99] transition-all flex items-center justify-center gap-3 text-sm font-bold text-[#181A17] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B49A68]"
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
      ) : (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      )}
      <span>
        {loading ? t('auth.googleAuthenticating', 'Đang xác thực Google...') : label}
      </span>
    </button>
  );
}

export function GoogleAuthButton({ tone = 'dark', ...props }: GoogleAuthButtonProps) {
  const { t } = useLanguage();
  const isDark = tone === 'dark';

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title={t('auth.googleNotConfigured', 'Google OAuth chưa được cấu hình (thiếu NEXT_PUBLIC_GOOGLE_CLIENT_ID)')}
        className={`w-full h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold cursor-not-allowed ${
          isDark
            ? 'border-[#3A3D34] bg-[#181A17] text-[#94A3B8]'
            : 'border-[#D8CEBE] bg-[#F0EEE8] text-[#747D88]'
        }`}
      >
        <span>{t('auth.googleUnavailable', 'Đăng nhập Google chưa khả dụng')}</span>
      </button>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Suspense fallback={null}>
        <InnerGoogleButton tone={tone} {...props} />
      </Suspense>
    </GoogleOAuthProvider>
  );
}
