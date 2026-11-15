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

function LoginFormContent() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
    searchParams.get('reason') === 'session-expired' ? SESSION_EXPIRED_MESSAGE : null
  );

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
        // Remembering the email is optional; the authenticated session has already been saved.
      }
      setIsSuccess(true);
      // A fresh navigation makes middleware read the cookies just written by setAuthSession.
      window.location.replace(finalRoute);
    } catch (cause) {
      setIsSuccess(false);
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#0c0e12',
        color: '#f8fafc',
        fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      }}
    >
      {/* LEFT: Brand & Live Trip Showcase */}
      <AuthShowcasePanel />

      {/* RIGHT: Login Card Panel */}
      <div
        style={{
          flex: '1 1 50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '40px 24px',
          minHeight: '100vh',
          backgroundColor: '#0d0f12',
          overflowY: 'auto',
        }}
      >
        {/* Mobile Header (Shown on small screens) */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
          className="md:hidden"
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: '#0c1a2e',
              flexShrink: 0,
            }}
          >
            <img src="/logo.png" alt="RaceHorse Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>RaceHorse</div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '2px' }}>
              LOGISTICS MANAGEMENT
            </div>
          </div>
        </div>

        {/* Center Card */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            margin: 'auto 0',
            backgroundColor: '#16171a',
            border: '1px solid #26282d',
            borderRadius: '24px',
            padding: '38px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          }}
        >
          {/* Card Title */}
          <h2
            style={{
              fontSize: '30px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: '6px',
            }}
          >
            Welcome back
          </h2>
          <p
            style={{
              fontSize: '13.5px',
              color: '#94a3b8',
              marginBottom: '28px',
            }}
          >
            Sign in to continue to RaceHorse Logistics.
          </p>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '20px',
                color: '#f87171',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '20px',
                color: '#34d399',
                fontSize: '13px',
              }}
            >
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <span>Authenticated successfully! Redirecting...</span>
            </div>
          )}

          {/* Login Form */}
          <form suppressHydrationWarning onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Email Field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '8px',
                }}
              >
                Email address
              </label>
              <input
                suppressHydrationWarning
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  backgroundColor: '#111215',
                  border: '1px solid #272a30',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#272a30')}
              />
            </div>

            {/* Password Field */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                  }}
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  style={{
                    fontSize: '12.5px',
                    color: '#94a3b8',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#ffffff')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#94a3b8')}
                >
                  Forgot password?
                </Link>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  suppressHydrationWarning
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    backgroundColor: '#111215',
                    border: '1px solid #272a30',
                    borderRadius: '10px',
                    padding: '12px 42px 12px 14px',
                    color: '#f8fafc',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#272a30')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748b',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
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
                  accentColor: '#2563eb',
                  cursor: 'pointer',
                }}
              />
              <label
                htmlFor="rememberMe"
                style={{
                  fontSize: '13px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Remember me for 30 days
              </label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading || isSuccess}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #1e40af 100%)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 700,
                cursor: isLoading || isSuccess ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(30, 58, 138, 0.45)',
                transition: 'all 0.2s',
                marginTop: '4px',
              }}
              onMouseEnter={(e) => {
                if (!isLoading && !isSuccess) {
                  (e.currentTarget as HTMLElement).style.background =
                    'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading && !isSuccess) {
                  (e.currentTarget as HTMLElement).style.background =
                    'linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #1e40af 100%)';
                }
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                  Signing In...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={17} />
                  Signed In
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* OR CONTINUE WITH Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '26px 0 20px 0',
              gap: '12px',
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: '#26282d' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#64748b',
                textTransform: 'uppercase',
              }}
            >
              Or continue with
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#26282d' }} />
          </div>

          {/* Social Logins */}
          <div style={{ width: '100%' }}>
            {/* Google */}
            <GoogleAuthButton onError={(msg) => setError(msg)} disabled={isLoading} />
          </div>

          {/* Switch to Register */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '26px',
              fontSize: '13.5px',
              color: '#94a3b8',
            }}
          >
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              style={{
                color: '#ffffff',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Create account
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#64748b',
            marginTop: '24px',
          }}
        >
          <div>© 2026 RaceHorse Logistics Ltd.</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span style={{ cursor: 'pointer' }}>Privacy</span>
            <span style={{ cursor: 'pointer' }}>Terms</span>
            <span style={{ cursor: 'pointer' }}>Support</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0d0f12',
            color: '#94a3b8',
          }}
        >
          Loading RaceHorse Logistics...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
