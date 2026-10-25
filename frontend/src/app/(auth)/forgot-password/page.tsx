'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Simulated API call or backend reset link dispatch
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 900);
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

      {/* RIGHT: Forgot Password Form Panel */}
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
        {/* Mobile Header */}
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
          {isSubmitted ? (
            /* Success State */
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px auto',
                  color: '#34d399',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#ffffff',
                  marginBottom: '10px',
                }}
              >
                Check your email
              </h2>
              <p
                style={{
                  fontSize: '13.5px',
                  color: '#94a3b8',
                  lineHeight: 1.6,
                  marginBottom: '28px',
                }}
              >
                We have sent password reset instructions to{' '}
                <strong style={{ color: '#ffffff' }}>{email}</strong>. Please check your inbox or spam folder.
              </p>

              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: '#272a30',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '16px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#33373e')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#272a30')}
              >
                Try another email
              </button>

              <Link
                href="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          ) : (
            /* Input Form State */
            <>
              <h2
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  marginBottom: '6px',
                }}
              >
                Forgot password?
              </h2>
              <p
                style={{
                  fontSize: '13.5px',
                  color: '#94a3b8',
                  lineHeight: 1.5,
                  marginBottom: '28px',
                }}
              >
                Enter your email address and we&apos;ll send you instructions to reset your account password.
              </p>

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

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                  <div style={{ position: 'relative' }}>
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
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '11px',
                    background: 'linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #1e40af 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    color: '#ffffff',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(30, 58, 138, 0.45)',
                    transition: 'all 0.2s',
                    marginTop: '4px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      (e.currentTarget as HTMLElement).style.background =
                        'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      (e.currentTarget as HTMLElement).style.background =
                        'linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #1e40af 100%)';
                    }
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                      Sending Instructions...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              {/* Back to sign in */}
              <div
                style={{
                  textAlign: 'center',
                  marginTop: '26px',
                  fontSize: '13.5px',
                  color: '#94a3b8',
                }}
              >
                Remember your password?{' '}
                <Link
                  href="/login"
                  style={{
                    color: '#ffffff',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Sign In
                </Link>
              </div>
            </>
          )}
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
