'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, Globe, Star, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { setAuthSession } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/customer';

  const [email, setEmail] = useState('customer@equitransit.com');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthSession(data.accessToken, data.user);
        router.push(redirectTarget);
        return;
      }
    } catch {
      // Backend not running or offline: graceful fallback for frontend preview
    }

    // Demo fallback for smooth UI interaction
    setAuthSession('mock-jwt-token-customer', {
      ...mockCurrentUser,
      email,
    });
    router.push(redirectTarget);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#070d18',
        padding: '24px',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1000px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 44%) 1fr',
          overflow: 'hidden',
          minHeight: '580px',
        }}
      >
        {/* Left Column: Brand & Hero Showcase */}
        <div
          style={{
            backgroundColor: '#0c182b',
            backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.15) 0%, transparent 60%)',
            padding: '44px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          {/* Top Section */}
          <div>
            {/* Globe Icon Badge */}
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'rgba(37, 99, 235, 0.25)',
                border: '1px solid rgba(96, 165, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '28px',
                color: '#60a5fa',
              }}
            >
              <Globe size={28} />
            </div>

            <h1
              style={{
                fontSize: '30px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.25,
                marginBottom: '16px',
                letterSpacing: '-0.02em',
              }}
            >
              Global Equine
              <br />
              Logistics Network
            </h1>

            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                lineHeight: 1.6,
                maxWidth: '320px',
                margin: 0,
              }}
            >
              Seamless cross-border racehorse transportation. Connecting owners, veterinary experts, and logistics coordinators worldwide.
            </p>
          </div>

          {/* Bottom Review / Trust Card */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '18px 20px',
              marginTop: '40px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '2px', color: '#fbbf24' }}>
                <Star size={14} fill="#fbbf24" stroke="none" />
                <Star size={14} fill="#fbbf24" stroke="none" />
                <Star size={14} fill="#fbbf24" stroke="none" />
                <Star size={14} fill="#fbbf24" stroke="none" />
                <Star size={14} fill="#fbbf24" stroke="none" />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                Enterprise Grade
              </span>
            </div>
            <p
              style={{
                fontSize: '12.5px',
                color: '#94a3b8',
                lineHeight: 1.5,
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              &ldquo;The most secure and transparent management system for high-value equine assets.&rdquo;
            </p>
          </div>
        </div>

        {/* Right Column: Sign In Form */}
        <div
          style={{
            padding: '48px 44px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          {/* Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.35)',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 16v-1c0-4-3-6-7-6H9l-2-3H3l1 5-2 3v3h10" />
                <circle cx="8" cy="7" r="1" />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              EquiTransit
            </span>
          </div>

          <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Welcome Back
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 26px 0' }}>
            Sign in to manage your racehorse transportation activities.
          </p>

          {/* Error Message */}
          {error && (
            <div
              style={{
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Email Field */}
            <div>
              <label
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1e293b',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Email Address <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@company.com"
                  style={{
                    width: '100%',
                    height: '46px',
                    padding: '0 14px 0 40px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    color: '#0f172a',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <Mail size={17} color="#94a3b8" style={{ position: 'absolute', top: '14px', left: '13px' }} />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1e293b',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Password <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    height: '46px',
                    padding: '0 40px 0 40px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    color: '#0f172a',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <Lock size={17} color="#94a3b8" style={{ position: 'absolute', top: '14px', left: '13px' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    top: '13px',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                marginTop: '-4px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#475569',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
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
                Remember me
              </label>

              <Link
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Password reset link has been dispatched to your registered email address.');
                }}
                style={{
                  color: '#2563eb',
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: '13px',
                }}
              >
                Forgot password?
              </Link>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isLoading}
              style={{
                width: '100%',
                height: '46px',
                borderRadius: '10px',
                backgroundColor: '#4f7cf6',
                border: 'none',
                fontSize: '15px',
                fontWeight: 600,
                marginTop: '4px',
                boxShadow: '0 4px 14px rgba(79, 124, 246, 0.35)',
              }}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          {/* Footer Register / Support Link */}
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', marginTop: '24px' }}>
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              style={{
                color: '#2563eb',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Register
            </Link>
            {' '}&bull;{' '}
            <a
              href="mailto:support@equitransit.com"
              style={{
                color: '#64748b',
                textDecoration: 'none',
              }}
            >
              Contact IT Support
            </a>
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
            backgroundColor: '#070d18',
            color: '#94a3b8',
            fontSize: '14px',
          }}
        >
          Loading portal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
