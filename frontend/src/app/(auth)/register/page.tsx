'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';
import { setAuthSession } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';

export default function RegisterPage() {
  const router = useRouter();

  // Step 1: Register, Step 2: Verify OTP
  const [step, setStep] = useState<'REGISTER' | 'VERIFY_OTP'>('REGISTER');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [otp, setOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle Step 1: Submit Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreeTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setSuccessMessage('Registration initiated! A verification code was sent to your email.');
        setStep('VERIFY_OTP');
        setIsLoading(false);
        return;
      } else {
        setError(data?.message || 'Registration failed. Please try again.');
        setIsLoading(false);
        return;
      }
    } catch {
      // Backend offline fallback for preview / demo testing
      setSuccessMessage('Demo Mode: Verification OTP sent! Use code 123456 to verify.');
      setStep('VERIFY_OTP');
      setIsLoading(false);
    }
  };

  // Handle Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.trim().length < 6) {
      setError('Please enter a valid 6-digit OTP code.');
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setSuccessMessage('Account verified successfully! Logging you in...');
        setAuthSession(data.accessToken || 'mock-token-registered', {
          id: data.user?.id || 'usr-reg-new',
          name: email.split('@')[0],
          email: email.trim().toLowerCase(),
          role: 'CUSTOMER',
        });
        setTimeout(() => {
          router.push('/customer');
        }, 1200);
        return;
      } else {
        setError(data?.message || 'Invalid or expired OTP code.');
        setIsLoading(false);
        return;
      }
    } catch {
      // Demo fallback if backend is offline
      if (otp.trim() === '123456') {
        setSuccessMessage('Account verified successfully! Logging you in...');
        setAuthSession('mock-token-registered', {
          ...mockCurrentUser,
          name: email.split('@')[0],
          email: email.trim().toLowerCase(),
        });
        setTimeout(() => {
          router.push('/customer');
        }, 1200);
      } else {
        setError('Invalid OTP code. For demo mode, please enter 123456.');
        setIsLoading(false);
      }
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

      {/* RIGHT: Register Form Panel */}
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
          {step === 'REGISTER' ? (
            <>
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
                Create account
              </h2>
              <p
                style={{
                  fontSize: '13.5px',
                  color: '#94a3b8',
                  marginBottom: '28px',
                }}
              >
                Start managing cross-border equine shipments.
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

              {/* Register Form */}
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      marginBottom: '8px',
                    }}
                  >
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters with numbers"
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

                {/* Confirm Password Field */}
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
                    Confirm password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
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
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Terms Agreement Checkbox */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="agreeTerms"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      marginTop: '3px',
                      borderRadius: '4px',
                      accentColor: '#2563eb',
                      cursor: 'pointer',
                    }}
                  />
                  <label
                    htmlFor="agreeTerms"
                    style={{
                      fontSize: '12.5px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                      userSelect: 'none',
                    }}
                  >
                    I agree to the <span style={{ color: '#ffffff', fontWeight: 600 }}>Terms of Service</span> and{' '}
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>Privacy Policy</span>
                  </label>
                </div>

                {/* Submit Button */}
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
                    marginTop: '6px',
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
                      Creating Account...
                    </>
                  ) : (
                    'Create account'
                  )}
                </button>
              </form>

              {/* OR CONTINUE WITH Divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '24px 0 18px 0',
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
                <button
                  type="button"
                  onClick={() => {
                    setEmail('google.new@equitransit.com');
                    setPassword('Password@123');
                    setConfirmPassword('Password@123');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    backgroundColor: '#121316',
                    border: '1px solid #272a30',
                    borderRadius: '10px',
                    padding: '12px 16px',
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
                  <svg width="18" height="18" viewBox="0 0 24 24">
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
                  Continue with Google
                </button>
              </div>

              {/* Switch to Login */}
              <div
                style={{
                  textAlign: 'center',
                  marginTop: '26px',
                  fontSize: '13.5px',
                  color: '#94a3b8',
                }}
              >
                Already have an account?{' '}
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
          ) : (
            /* STEP 2: VERIFY OTP */
            <div>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(37, 99, 235, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#60a5fa',
                }}
              >
                <KeyRound size={26} />
              </div>

              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#ffffff',
                  textAlign: 'center',
                  marginBottom: '8px',
                }}
              >
                Verify Email Code
              </h2>
              <p
                style={{
                  fontSize: '13.5px',
                  color: '#94a3b8',
                  textAlign: 'center',
                  marginBottom: '24px',
                  lineHeight: 1.5,
                }}
              >
                Enter the 6-digit verification code sent to <br />
                <strong style={{ color: '#ffffff' }}>{email}</strong>
              </p>

              {successMessage && (
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
                  <span>{successMessage}</span>
                </div>
              )}

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

              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit code"
                    style={{
                      width: '100%',
                      backgroundColor: '#111215',
                      border: '1px solid #272a30',
                      borderRadius: '10px',
                      padding: '14px',
                      color: '#ffffff',
                      fontSize: '20px',
                      fontWeight: 700,
                      letterSpacing: '0.25em',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                    onBlur={(e) => (e.target.style.borderColor = '#272a30')}
                  />
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#64748b',
                      textAlign: 'center',
                      marginTop: '8px',
                    }}
                  >
                    Demo OTP code: <span style={{ color: '#60a5fa', fontWeight: 600 }}>123456</span>
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
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Enter Dashboard'
                  )}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('REGISTER');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={14} /> Back to edit information
                </button>
              </div>
            </div>
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
