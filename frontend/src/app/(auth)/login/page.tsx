'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';
import { SESSION_EXPIRED_MESSAGE, setAuthSession } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/auth-redirect';
import { loginWithPassword } from '@/lib/auth-login';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function LoginFormContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // IMPORTANT: Keep this first useEffect intact for test/auth-login.test.cjs AST parsing
  useEffect(() => {
    try {
      sessionStorage.removeItem('equitransit_manual_logout');
      const savedEmail = localStorage.getItem('equitransit_remembered_email');
      const isRemembered = localStorage.getItem('equitransit_remember_me') === 'true';
      if (savedEmail && isRemembered) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    searchParams.get('reason') === 'session-expired' || searchParams.get('session_expired') === '1'
      ? SESSION_EXPIRED_MESSAGE
      : null
  );

  useEffect(() => {
    if (searchParams.get('session_expired') === '1' || searchParams.get('reason') === 'session-expired') {
      setError(SESSION_EXPIRED_MESSAGE);
    }
  }, [searchParams]);

  // IMPORTANT: Keep handleLogin dependencies intact for test/auth-login.test.cjs AST parsing
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isSuccess) return;
    setIsLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const { accessToken, user } = await loginWithPassword(apiUrl, email, password);
      const isEscortUser =
        user.specialization === 'escort' ||
        user.persona === 'escort' ||
        user.email?.toLowerCase().includes('escort');
      const roleRoutes: Record<string, string> = {
        CUSTOMER: '/customer',
        LOGISTICS_MANAGER: '/manager',
        TRANSPORT_SPECIALIST: '/specialist',
        FLEET_ROUTE_COORDINATOR: '/coordinator',
        DRIVER_ESCORT: isEscortUser ? '/escort' : '/driver',
        ADMIN: '/manager',
      };
      const finalRoute = getPostLoginRedirect(searchParams.get('redirect'), roleRoutes[user.role]);
      setAuthSession(accessToken, user);
      try {
        if (rememberMe) {
          localStorage.setItem('equitransit_remembered_email', email.trim().toLowerCase());
          localStorage.setItem('equitransit_remember_me', 'true');
        } else {
          localStorage.removeItem('equitransit_remembered_email');
          localStorage.removeItem('equitransit_remember_me');
        }
      } catch {
        // Optional preference
      }
      setIsSuccess(true);
      window.location.replace(finalRoute);
    } catch (cause) {
      setIsSuccess(false);
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayedError =
    error === SESSION_EXPIRED_MESSAGE
      ? t('auth.sessionExpiredNotice', SESSION_EXPIRED_MESSAGE)
      : error === 'Không thể đăng nhập. Vui lòng thử lại.'
        ? t('auth.loginErrorDefault', error)
        : error;

  const passwordToggleLabel = showPassword
    ? t('auth.hidePassword', 'Ẩn mật khẩu')
    : t('auth.showPassword', 'Hiện mật khẩu');

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100dvh',
        width: '100%',
        backgroundColor: '#181A17',
        color: '#F7F7F4',
        fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      }}
    >
      {/* LEFT: Brand & Live Trip Showcase */}
      <AuthShowcasePanel />

      {/* RIGHT: Login Card Panel */}
      <div
        className="px-4 py-6 sm:px-6 sm:py-8"
        style={{
          flex: '1 1 50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: '100dvh',
          backgroundColor: '#181A17',
          overflowY: 'auto',
        }}
      >
        {/* Top Row: Mobile/Tablet Brand + Language Switcher */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="lg:hidden">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(180, 154, 104, 0.45)',
                backgroundColor: '#242722',
                flexShrink: 0,
              }}
            >
              <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#F7F7F4', lineHeight: 1.1 }}>EquiTransit</div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#B49A68', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                EQUINE LOGISTICS
              </div>
            </div>
          </div>
          <div className="hidden lg:block" />
          <LanguageSwitcher tone="dark" />
        </div>

        {/* Center Card */}
        <div
          className="p-6 sm:p-9"
          style={{
            width: '100%',
            maxWidth: '430px',
            margin: 'auto 0',
            backgroundColor: '#242722',
            border: '1px solid #353830',
            borderRadius: '24px',
            boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(180, 154, 104, 0.14)',
              border: '1px solid rgba(180, 154, 104, 0.35)',
              color: '#B49A68',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            {t('auth.portalAccess', 'Cổng Điều Hành & Khách Hàng')}
          </div>

          <h1
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: '#F7F7F4',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: '6px',
            }}
          >
            {t('auth.welcomeBack', 'Chào mừng trở lại')}
          </h1>
          <p
            style={{
              fontSize: '13.5px',
              color: '#CBD5E1',
              marginBottom: '26px',
            }}
          >
            {t('auth.loginSubtitle', 'Đăng nhập để quản lý và theo dõi hành trình ngựa đua.')}
          </p>

          {displayedError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#F8EAEA',
                border: '1px solid #B33E3E',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '20px',
                color: '#B33E3E',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>{displayedError}</span>
            </div>
          )}

          {isSuccess && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#E8F2EB',
                border: '1px solid #287653',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '20px',
                color: '#287653',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>{t('auth.loginSuccessRedirect', 'Xác thực thành công! Đang chuyển hướng...')}</span>
            </div>
          )}

          <form suppressHydrationWarning onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#F7F7F4',
                  marginBottom: '8px',
                }}
              >
                {t('auth.email', 'Địa chỉ Email')}
              </label>
              <input
                id="login-email"
                suppressHydrationWarning
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  backgroundColor: '#181A17',
                  border: '1px solid #353830',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#F7F7F4',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                onBlur={(e) => (e.target.style.borderColor = '#353830')}
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <label htmlFor="login-password" style={{ fontSize: '13px', fontWeight: 600, color: '#F7F7F4' }}>
                  {t('auth.password', 'Mật khẩu')}
                </label>
                <Link
                  href="/forgot-password"
                  style={{
                    fontSize: '12.5px',
                    color: '#B49A68',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {t('auth.forgotPassword', 'Quên mật khẩu?')}
                </Link>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  suppressHydrationWarning
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordInputPlaceholder', 'Nhập mật khẩu của bạn')}
                  style={{
                    width: '100%',
                    backgroundColor: '#181A17',
                    border: '1px solid #353830',
                    borderRadius: '10px',
                    padding: '12px 44px 12px 14px',
                    color: '#F7F7F4',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                  onBlur={(e) => (e.target.style.borderColor = '#353830')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={passwordToggleLabel}
                  aria-pressed={showPassword}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B49A68] rounded-lg"
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '38px',
                    height: '38px',
                    color: '#94A3B8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                suppressHydrationWarning
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  accentColor: '#A67C2E',
                  cursor: 'pointer',
                }}
              />
              <label
                htmlFor="rememberMe"
                style={{
                  fontSize: '13px',
                  color: '#CBD5E1',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {t('auth.rememberMe', 'Ghi nhớ tài khoản đăng nhập')}
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || isSuccess}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '11px',
                backgroundColor: '#A67C2E',
                border: '1px solid rgba(180, 154, 104, 0.5)',
                color: '#FFFFFF',
                fontSize: '14.5px',
                fontWeight: 700,
                cursor: isLoading || isSuccess ? 'not-allowed' : 'pointer',
                opacity: isLoading || isSuccess ? 0.65 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(166, 124, 46, 0.32)',
                transition: 'all 0.2s',
                marginTop: '4px',
              }}
              onMouseEnter={(e) => {
                if (!isLoading && !isSuccess) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#8C6621';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading && !isSuccess) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#A67C2E';
                }
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  {t('auth.signingIn', 'Đang đăng nhập...')}
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  {t('auth.signedIn', 'Đã đăng nhập')}
                </>
              ) : (
                t('auth.signInBtn', 'Đăng nhập')
              )}
            </button>
          </form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '24px 0 18px 0',
              gap: '12px',
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: '#353830' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#94A3B8',
                textTransform: 'uppercase',
              }}
            >
              {t('auth.orContinueWith', 'Hoặc tiếp tục với')}
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#353830' }} />
          </div>

          <div style={{ width: '100%' }}>
            <GoogleAuthButton tone="dark" onError={(msg) => setError(msg)} disabled={isLoading || isSuccess} />
          </div>

          <div
            style={{
              textAlign: 'center',
              marginTop: '24px',
              fontSize: '13.5px',
              color: '#CBD5E1',
            }}
          >
            {t('auth.dontHaveAccount', 'Chưa có tài khoản?')}{' '}
            <Link
              href="/register"
              style={{
                color: '#B49A68',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {t('auth.registerNow', 'Đăng ký ngay')}
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#94A3B8',
            marginTop: '24px',
          }}
        >
          <div>© 2026 EquiTransit Logistics Ltd.</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>{t('auth.privacy', 'Bảo mật')}</span>
            <span>{t('auth.terms', 'Điều khoản')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginLoadingFallback() {
  const { t, language } = useLanguage();
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#181A17',
        color: '#F7F7F4',
      }}
    >
      {t(
        'auth.loadingPortal',
        language === 'en' ? 'Loading EquiTransit Logistics...' : 'Đang tải hệ thống EquiTransit Logistics...'
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoadingFallback />}>
      <LoginFormContent />
    </Suspense>
  );
}
