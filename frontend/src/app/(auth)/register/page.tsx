'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, KeyRound, Loader2, RotateCcw } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';
import { setAuthSession } from '@/lib/auth';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function RegisterPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [step, setStep] = useState<'REGISTER' | 'VERIFY_OTP'>('REGISTER');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [otp, setOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreeTerms) {
      setError(t('auth.termsAgreeError', 'Vui lòng đồng ý với Điều khoản Dịch vụ và Chính sách Bảo mật.'));
      return;
    }

    if (password.length < 8) {
      setError(t('auth.passwordLengthError', 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.'));
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
      setError(t('auth.passwordComplexityError', 'Mật khẩu phải bao gồm cả chữ cái và chữ số.'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatchError', 'Mật khẩu xác nhận không khớp.'));
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
        const devHint = data?.developmentOtp ? ` (Dev OTP: ${data.developmentOtp})` : '';
        setSuccessMessage(
          t('auth.otpSentSuccess', 'Đăng ký thành công! Mã xác thực đã được gửi về email của bạn.') + devHint,
        );
        setResendCooldown(60);
        setStep('VERIFY_OTP');
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        setError(msg || t('auth.registerFailed', 'Đăng ký thất bại. Vui lòng thử lại.'));
      }
    } catch {
      setError(t('auth.networkError', 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (isResending || resendCooldown > 0) return;
    setIsResending(true);
    setError(null);
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
        const devHint = data?.developmentOtp ? ` (Dev OTP: ${data.developmentOtp})` : '';
        setSuccessMessage(t('auth.resetOtpResent', 'Mã OTP mới đã được gửi lại thành công!') + devHint);
        setResendCooldown(60);
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        setError(msg || t('auth.resetResendFailed', 'Không thể gửi lại mã OTP. Vui lòng thử lại sau.'));
      }
    } catch {
      setError(t('auth.networkError', 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.'));
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.trim().length < 6) {
      setError(t('auth.otpInvalidLength', 'Vui lòng nhập mã OTP gồm 6 chữ số hợp lệ.'));
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

      if (response.ok && data?.accessToken) {
        setSuccessMessage(t('auth.verifySuccessRedirect', 'Xác thực tài khoản thành công! Đang chuyển hướng...'));
        setAuthSession(data.accessToken, {
          id: data.user?.id || '',
          name: data.user?.fullName || data.user?.name || email.split('@')[0],
          email: email.trim().toLowerCase(),
          role: data.user?.role || 'CUSTOMER',
        });
        redirectTimerRef.current = setTimeout(() => {
          router.push('/customer');
        }, 1200);
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        setError(msg || t('auth.otpInvalidOrExpired', 'Mã OTP không đúng hoặc đã hết hạn.'));
      }
    } catch {
      setError(t('auth.networkError', 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.'));
    } finally {
      setIsLoading(false);
    }
  };

  const passwordToggleLabel = showPassword
    ? t('auth.hidePassword', 'Ẩn mật khẩu')
    : t('auth.showPassword', 'Hiện mật khẩu');
  const confirmToggleLabel = showConfirmPassword
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
      <AuthShowcasePanel />

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
          {step === 'REGISTER' ? (
            <>
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
                {t('auth.customerPortal', 'Tài khoản Chủ ngựa / Khách hàng')}
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
                {t('auth.registerTitle', 'Tạo tài khoản')}
              </h1>
              <p
                style={{
                  fontSize: '13.5px',
                  color: '#CBD5E1',
                  marginBottom: '24px',
                }}
              >
                {t('auth.registerSubtitle', 'Bắt đầu quản lý hành trình vận chuyển ngựa đua quốc tế.')}
              </p>

              {error && (
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
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label htmlFor="reg-email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '7px' }}>
                    {t('auth.email', 'Địa chỉ Email')}
                  </label>
                  <input
                    id="reg-email"
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
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                    onBlur={(e) => (e.target.style.borderColor = '#353830')}
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '7px' }}>
                    {t('auth.password', 'Mật khẩu')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordRequirementHint', 'Tối thiểu 8 ký tự gồm chữ và số')}
                      style={{
                        width: '100%',
                        backgroundColor: '#181A17',
                        border: '1px solid #353830',
                        borderRadius: '10px',
                        padding: '12px 44px 12px 14px',
                        color: '#F7F7F4',
                        fontSize: '14px',
                        outline: 'none',
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

                <div>
                  <label htmlFor="reg-confirm-password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '7px' }}>
                    {t('auth.confirmPassword', 'Xác nhận mật khẩu')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reg-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('auth.confirmPasswordPlaceholder', 'Nhập lại mật khẩu')}
                      style={{
                        width: '100%',
                        backgroundColor: '#181A17',
                        border: '1px solid #353830',
                        borderRadius: '10px',
                        padding: '12px 44px 12px 14px',
                        color: '#F7F7F4',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                      onBlur={(e) => (e.target.style.borderColor = '#353830')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={confirmToggleLabel}
                      aria-pressed={showConfirmPassword}
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
                      {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
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
                      accentColor: '#A67C2E',
                      cursor: 'pointer',
                    }}
                  />
                  <label
                    htmlFor="agreeTerms"
                    style={{
                      fontSize: '12.5px',
                      color: '#CBD5E1',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                      userSelect: 'none',
                    }}
                  >
                    {t('auth.agreeTerms', 'Tôi đồng ý với')}{' '}
                    <span style={{ color: '#F7F7F4', fontWeight: 600 }}>{t('auth.terms', 'Điều khoản Dịch vụ')}</span>{' '}
                    {t('common.and', 'và')}{' '}
                    <span style={{ color: '#F7F7F4', fontWeight: 600 }}>{t('auth.privacy', 'Chính sách Bảo mật')}</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '11px',
                    backgroundColor: '#A67C2E',
                    border: '1px solid rgba(180, 154, 104, 0.5)',
                    color: '#FFFFFF',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.65 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(166, 124, 46, 0.32)',
                    transition: 'all 0.2s',
                    marginTop: '4px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#8C6621';
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#A67C2E';
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                      {t('auth.creatingAccount', 'Đang tạo tài khoản...')}
                    </>
                  ) : (
                    t('auth.createAccountBtn', 'Tạo tài khoản')
                  )}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', margin: '22px 0 16px 0', gap: '12px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#353830' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#94A3B8', textTransform: 'uppercase' }}>
                  {t('auth.orContinueWith', 'Hoặc tiếp tục với')}
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#353830' }} />
              </div>

              <div style={{ width: '100%' }}>
                <GoogleAuthButton tone="dark" onError={(msg) => setError(msg)} disabled={isLoading} />
              </div>

              <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13.5px', color: '#CBD5E1' }}>
                {t('auth.alreadyhaveAccount', 'Đã có tài khoản?')}{' '}
                <Link href="/login" style={{ color: '#B49A68', fontWeight: 700, textDecoration: 'none' }}>
                  {t('auth.signInBtn', 'Đăng nhập')}
                </Link>
              </div>
            </>
          ) : (
            <div>
              <div
                aria-hidden="true"
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(180, 154, 104, 0.16)',
                  border: '1px solid #B49A68',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#B49A68',
                }}
              >
                <KeyRound size={25} />
              </div>

              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#F7F7F4', textAlign: 'center', marginBottom: '8px' }}>
                {t('auth.verifyEmailCode', 'Xác Thực Mã Email')}
              </h1>
              <p style={{ fontSize: '13.5px', color: '#CBD5E1', textAlign: 'center', marginBottom: '22px', lineHeight: 1.5 }}>
                {t('auth.enterOtpDesc', 'Nhập mã xác thực gồm 6 chữ số đã được gửi tới')}
                <br />
                <strong style={{ color: '#F7F7F4' }}>{email}</strong>
              </p>

              {successMessage && (
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
                    marginBottom: '18px',
                    color: '#287653',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={17} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <span>{successMessage}</span>
                </div>
              )}

              {error && (
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
                    marginBottom: '18px',
                    color: '#B33E3E',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <AlertCircle size={17} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                    <label htmlFor="reg-otp" style={{ fontSize: '13px', fontWeight: 600, color: '#F7F7F4' }}>
                      {t('auth.otpLabel', isEn ? '6-digit Verification Code (OTP)' : 'Mã xác thực OTP (6 chữ số)')}
                    </label>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isResending || resendCooldown > 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: resendCooldown > 0 ? '#94A3B8' : '#B49A68',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isResending || resendCooldown > 0 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RotateCcw size={12} className={isResending ? 'animate-spin' : ''} aria-hidden="true" />
                      {resendCooldown > 0
                        ? t('auth.resendIn', isEn ? `Resend in ${resendCooldown}s` : `Gửi lại sau ${resendCooldown}s`, {
                            seconds: resendCooldown,
                          })
                        : t('auth.resendOtp', isEn ? 'Resend code' : 'Gửi lại mã')}
                    </button>
                  </div>
                  <input
                    id="reg-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    style={{
                      width: '100%',
                      backgroundColor: '#181A17',
                      border: '1px solid #353830',
                      borderRadius: '10px',
                      padding: '14px',
                      color: '#F7F7F4',
                      fontSize: '22px',
                      fontWeight: 700,
                      letterSpacing: '0.28em',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                    onBlur={(e) => (e.target.style.borderColor = '#353830')}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '11px',
                    backgroundColor: '#A67C2E',
                    border: '1px solid rgba(180, 154, 104, 0.5)',
                    color: '#FFFFFF',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.65 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(166, 124, 46, 0.32)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#8C6621';
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#A67C2E';
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                      {t('auth.verifying', 'Đang xác thực...')}
                    </>
                  ) : (
                    t('auth.verifyAndEnter', 'Xác Thực & Vào Hệ Thống')
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
                    color: '#B49A68',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                  }}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> {t('auth.backToEdit', 'Quay lại chỉnh sửa thông tin')}
                </button>
              </div>
            </div>
          )}
        </div>

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
