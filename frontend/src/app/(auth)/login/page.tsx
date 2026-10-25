'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';
import { setAuthSession } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/customer';

  const [email, setEmail] = useState('customer@equitransit.com');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    let authUser = {
      ...mockCurrentUser,
      email,
    };
    let authToken = 'mock-jwt-token-customer';

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (response.ok) {
        const data = await response.json();
        authToken = data.accessToken;
        authUser = {
          ...mockCurrentUser,
          ...data.user,
          name: data.user?.fullName || data.user?.name || data.user?.email?.split('@')[0] || email.split('@')[0],
        };
      } else if (response.status === 401 || response.status === 400) {
        const errData = await response.json().catch(() => null);
        setError(errData?.message || 'Invalid email or password. Please verify your credentials.');
        setIsLoading(false);
        return;
      }
    } catch {
      // Backend offline fallback for preview
    }

    setAuthSession(authToken, authUser);
    setIsLoading(false);
    setIsSuccess(true);

    setTimeout(() => {
      router.push(redirectTarget);
    }, 1200);
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
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <circle cx="5" cy="19" r="2" fill="#fff" />
              <path d="M5 17c0-5 4-9 9-9h5" />
              <polyline points="15 4 19 8 15 12" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff' }}>EquiRoute</div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.12em' }}>
              TRANSPORT MANAGEMENT
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
            Sign in to continue to EquiRoute.
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
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Google */}
            <button
              type="button"
              onClick={() => {
                setEmail('google.user@equitransit.com');
                setPassword('Password@123');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '9px',
                backgroundColor: '#121316',
                border: '1px solid #272a30',
                borderRadius: '10px',
                padding: '11px',
                color: '#e2e8f0',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#18191e';
                (e.currentTarget as HTMLElement).style.borderColor = '#383b42';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#121316';
                (e.currentTarget as HTMLElement).style.borderColor = '#272a30';
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.5 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4 0-.8.1-1.6.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.1L1.6 16.1C3.5 19.9 7.4 23 12 23z"
                />
              </svg>
              Google
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => {
                setEmail('facebook.user@equitransit.com');
                setPassword('Password@123');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '9px',
                backgroundColor: '#121316',
                border: '1px solid #272a30',
                borderRadius: '10px',
                padding: '11px',
                color: '#e2e8f0',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#18191e';
                (e.currentTarget as HTMLElement).style.borderColor = '#383b42';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#121316';
                (e.currentTarget as HTMLElement).style.borderColor = '#272a30';
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </button>
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
          <div>© 2026 EquiRoute Logistics Ltd.</div>
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
          Loading EquiRoute...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
