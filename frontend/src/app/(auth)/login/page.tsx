'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, Globe, Star, AlertCircle, Check, Loader2 } from 'lucide-react';
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
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        authToken = data.accessToken;
        authUser = {
          ...authUser,
          ...data.user,
        };
      } else if (response.status === 401 || response.status === 400) {
        const errData = await response.json().catch(() => null);
        setError(errData?.message || 'Invalid email or password. Please check your credentials and try again.');
        setIsLoading(false);
        return;
      }
    } catch {
      // Backend not running: proceed with demo session
    }

    // Set auth session
    setAuthSession(authToken, authUser);

    // Show smooth Success state animation before redirecting
    setIsLoading(false);
    setIsSuccess(true);

    setTimeout(() => {
      router.push(redirectTarget);
    }, 1800);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        padding: '16px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Top subtle progress line when loading */}
      {isLoading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '3px',
            backgroundColor: '#2563EB',
            zIndex: 1000,
            animation: 'pulseGlow 1.2s infinite ease-in-out',
          }}
        />
      )}

      {/* Main Centered Login Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          width: '100%',
          maxWidth: '1024px',
          borderRadius: '16px',
          boxShadow: '0 20px 30px -10px rgba(15, 23, 42, 0.08), 0 10px 15px -3px rgba(15, 23, 42, 0.05)',
          border: '1px solid #E2E8F0',
          display: 'flex',
          overflow: 'hidden',
          minHeight: '620px',
        }}
      >
        {/* LEFT SIDE: Visual Branding */}
        <div
          style={{
            width: '50%',
            position: 'relative',
            backgroundColor: '#0F172A',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
          className="brand-showcase-panel"
        >
          {/* Background image with overlay */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1553531580-65239a2d8a0c?q=80&w=2000&auto=format&fit=crop"
              alt="Racehorse Transportation"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.3,
                mixBlendMode: 'overlay',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, #0F172A 0%, rgba(15, 23, 42, 0.8) 60%, transparent 100%)',
              }}
            />
          </div>

          {/* Visual Content */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              padding: '48px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ color: 'rgba(37, 99, 235, 0.45)', marginBottom: '24px' }}>
                <Globe size={56} strokeWidth={1.5} />
              </div>
              <h2
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  color: '#ffffff',
                  marginBottom: '16px',
                  lineHeight: 1.25,
                }}
              >
                Global Equine
                <br />
                Logistics Network
              </h2>
              <p
                style={{
                  color: '#94A3B8',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  maxWidth: '320px',
                  margin: 0,
                }}
              >
                Seamless cross-border racehorse transportation. Connecting owners, veterinary experts, and logistics coordinators worldwide.
              </p>
            </div>

            {/* Testimonial Badge */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.55)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '12px',
                padding: '18px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '3px', color: '#FBBF24' }}>
                  <Star size={13} fill="#FBBF24" stroke="none" />
                  <Star size={13} fill="#FBBF24" stroke="none" />
                  <Star size={13} fill="#FBBF24" stroke="none" />
                  <Star size={13} fill="#FBBF24" stroke="none" />
                  <Star size={13} fill="#FBBF24" stroke="none" />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>
                  Enterprise Grade
                </span>
              </div>
              <p
                style={{
                  fontSize: '12px',
                  color: '#94A3B8',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                &ldquo;The most secure and transparent management system for high-value equine assets.&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Form / Success States */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px 48px',
            backgroundColor: '#ffffff',
            position: 'relative',
          }}
        >
          {/* Logo Header (Consistent) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: isSuccess ? 'auto' : '32px',
              justifyContent: 'flex-start',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <path d="M21 16v-1c0-4-3-6-7-6H9l-2-3H3l1 5-2 3v3h10" />
                <circle cx="8" cy="7" r="1" />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
              EquiTransit
            </span>
          </div>

          {/* STATE 1: SUCCESS STATE (Matching template 1) */}
          {isSuccess ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                margin: 'auto 0',
                width: '100%',
                maxWidth: '380px',
                alignSelf: 'center',
              }}
            >
              {/* Pop-in Success Badge */}
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: '#F0FDF4',
                  border: '6px solid #DCFCE7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '24px',
                  animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#16A34A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  <Check size={32} strokeWidth={3} />
                </div>
              </div>

              {/* Text */}
              <div style={{ animation: 'fadeUp 0.5s ease-out 0.15s forwards' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                  Login Successful
                </h2>
                <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '32px' }}>
                  Redirecting to your dashboard...
                </p>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '192px',
                  height: '6px',
                  backgroundColor: '#F1F5F9',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  animation: 'fadeUp 0.5s ease-out 0.2s forwards',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#16A34A',
                    borderRadius: '999px',
                    animation: 'progressFill 1.8s ease-in-out forwards',
                  }}
                />
              </div>
            </div>
          ) : (
            /* STATE 2: ACTIVE / LOADING / ERROR FORM */
            <div style={{ width: '100%', maxWidth: '380px', margin: '0 auto' }}>
              <div style={{ marginBottom: '28px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0' }}>
                  Welcome Back
                </h1>
                <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
                  Sign in to manage your racehorse transportation activities.
                </p>
              </div>

              {/* Authentication Error Banner */}
              {error && (
                <div
                  style={{
                    marginBottom: '20px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <AlertCircle size={18} color="#DC2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                      Sign in failed
                    </h4>
                    <p style={{ fontSize: '12.5px', color: '#B91C1C', marginTop: '3px', margin: 0, fontWeight: 500 }}>
                      {error}
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Email Field */}
                <div>
                  <label
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 500,
                      color: '#334155',
                      display: 'block',
                      marginBottom: '6px',
                    }}
                  >
                    Email Address <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail
                      size={16}
                      color="#94A3B8"
                      style={{ position: 'absolute', top: '13px', left: '13px' }}
                    />
                    <input
                      type="email"
                      value={email}
                      disabled={isLoading}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      required
                      placeholder="name@company.com"
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 14px 0 38px',
                        backgroundColor: isLoading ? '#F1F5F9' : '#F8FAFC',
                        borderRadius: '10px',
                        border: error ? '1px solid #DC2626' : '1px solid #CBD5E1',
                        fontSize: '14px',
                        color: '#1E293B',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 500,
                      color: '#334155',
                      display: 'block',
                      marginBottom: '6px',
                    }}
                  >
                    Password <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock
                      size={16}
                      color="#94A3B8"
                      style={{ position: 'absolute', top: '13px', left: '13px' }}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      disabled={isLoading}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      required
                      placeholder="••••••••"
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 38px 0 38px',
                        backgroundColor: isLoading ? '#F1F5F9' : '#F8FAFC',
                        borderRadius: '10px',
                        border: error ? '1px solid #DC2626' : '1px solid #CBD5E1',
                        fontSize: '14px',
                        color: '#1E293B',
                        outline: 'none',
                        letterSpacing: showPassword ? 'normal' : '2px',
                        transition: 'all 0.15s ease',
                      }}
                    />
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        cursor: isLoading ? 'default' : 'pointer',
                        color: '#94A3B8',
                        padding: 0,
                      }}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13.5px',
                    paddingTop: '2px',
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
                      fontWeight: 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      disabled={isLoading}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        accentColor: '#2563EB',
                        cursor: 'pointer',
                      }}
                    />
                    Remember me
                  </label>

                  <Link
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Password recovery dispatched to your registered address.');
                    }}
                    style={{
                      color: '#2563EB',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit Button */}
                <div style={{ paddingTop: '10px' }}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      height: '44px',
                      borderRadius: '10px',
                      backgroundColor: '#2563EB',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '14.5px',
                      fontWeight: 600,
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.85 : 1,
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <span>Signing in...</span>
                        <Loader2 size={16} className="animate-spin" />
                      </>
                    ) : (
                      <span>Sign In</span>
                    )}
                  </button>
                </div>
              </form>

              {/* Footer Links */}
              <p
                style={{
                  textAlign: 'center',
                  fontSize: '13.5px',
                  color: '#64748B',
                  marginTop: '28px',
                  marginBottom: 0,
                }}
              >
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  style={{
                    color: '#2563EB',
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
                    color: '#64748B',
                    textDecoration: 'none',
                  }}
                >
                  Contact IT Support
                </a>
              </p>
            </div>
          )}
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
            backgroundColor: '#F8FAFC',
            color: '#64748B',
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
