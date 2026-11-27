'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, KeyRound, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { AuthShowcasePanel } from '@/components/layout/AuthShowcasePanel';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [step, setStep] = useState<'REQUEST_OTP' | 'VERIFY_RESET' | 'SUCCESS'>('REQUEST_OTP');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError(t('auth.invalidEmailError', 'Vui lòng cung cấp địa chỉ email hợp lệ.'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        const devHint = data?.developmentOtp ? ` (Dev OTP: ${data.developmentOtp})` : '';
        setSuccessMessage(
          t('auth.resetOtpSent', 'Mã xác thực 6 số đã được gửi tới email của bạn. Vui lòng kiểm tra hộp thư!') + devHint,
        );
        setResendCooldown(60);
        setStep('VERIFY_RESET');
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        setError(msg || t('auth.resetRequestFailed', 'Không thể gửi mã khôi phục. Vui lòng thử lại.'));
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
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.trim().length !== 6) {
      setError(t('auth.otpInvalidLength', 'Vui lòng nhập đúng mã OTP gồm 6 chữ số.'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.passwordLengthError', 'Mật khẩu mới phải có tối thiểu 8 ký tự.'));
      return;
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(newPassword)) {
      setError(t('auth.passwordComplexityError', 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số.'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatchError', 'Xác nhận mật khẩu không khớp.'));
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setStep('SUCCESS');
        redirectTimerRef.current = setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        setError(msg || t('auth.otpInvalidOrExpired', 'Mã xác thực không đúng hoặc đã hết hạn.'));
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
          <div className="flex lg:hidden items-center gap-2.5">
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
          {step === 'SUCCESS' ? (
            <div style={{ textAlign: 'center' }}>
              <div
                aria-hidden="true"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#E8F2EB',
                  border: '1px solid #287653',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px auto',
                  color: '#287653',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#F7F7F4', marginBottom: '10px' }}>
                {t('auth.resetSuccessTitle', isEn ? 'Password Reset Successful' : 'Đặt Lại Mật Khẩu Thành Công')}
              </h1>
              <p style={{ fontSize: '13.5px', color: '#CBD5E1', lineHeight: 1.6, marginBottom: '26px' }}>
                {t(
                  'auth.resetSuccessDesc',
                  isEn
                    ? 'Your password has been updated. Redirecting you to Sign In...'
                    : 'Mật khẩu của bạn đã được cập nhật. Đang chuyển hướng về trang Đăng nhập...'
                )}
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  padding: '13px',
                  borderRadius: '11px',
                  backgroundColor: '#A67C2E',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                {t('auth.backToLoginNow', isEn ? 'Sign In Now' : 'Đăng nhập ngay')}
              </Link>
            </div>
          ) : step === 'VERIFY_RESET' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    backgroundColor: '#181A17',
                    border: '1px solid #B49A68',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#B49A68',
                    textTransform: 'uppercase',
                  }}
                >
                  <KeyRound size={12} aria-hidden="true" /> {isEn ? 'Step 2 / 2' : 'Bước 2 / 2'}
                </span>
              </div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#F7F7F4', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '6px' }}>
                {t('auth.resetPassword', 'Đặt Lại Mật Khẩu')}
              </h1>
              <p style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: 1.5, marginBottom: '20px' }}>
                {isEn ? (
                  <>
                    Enter the 6-digit OTP sent to <strong style={{ color: '#F7F7F4' }}>{email}</strong> and choose your new password.
                  </>
                ) : (
                  <>
                    Nhập mã OTP 6 số đã gửi tới <strong style={{ color: '#F7F7F4' }}>{email}</strong> và thiết lập mật khẩu mới.
                  </>
                )}
              </p>

              {successMessage && (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: '#E8F2EB',
                    border: '1px solid #287653',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                    color: '#287653',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
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

              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                    <label htmlFor="forgot-otp" style={{ fontSize: '13px', fontWeight: 600, color: '#F7F7F4' }}>
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
                      {isResending
                        ? t('common.sending', isEn ? 'Sending...' : 'Đang gửi...')
                        : resendCooldown > 0
                          ? t('auth.resendIn', isEn ? `Resend in ${resendCooldown}s` : `Gửi lại sau ${resendCooldown}s`, {
                              seconds: resendCooldown,
                            })
                          : t('auth.resendOtp', isEn ? 'Resend code' : 'Gửi lại mã')}
                    </button>
                  </div>
                  <input
                    id="forgot-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    style={{
                      width: '100%',
                      backgroundColor: '#181A17',
                      border: '1px solid #353830',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      color: '#F7F7F4',
                      fontSize: '18px',
                      fontWeight: 700,
                      letterSpacing: '0.25em',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#B49A68')}
                    onBlur={(e) => (e.target.style.borderColor = '#353830')}
                  />
                </div>

                <div>
                  <label htmlFor="forgot-new-password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '6px' }}>
                    {t('auth.newPasswordLabel', isEn ? 'New Password' : 'Mật khẩu mới')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="forgot-new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('auth.passwordRequirementHint', isEn ? 'Minimum 8 characters with letters & numbers' : 'Tối thiểu 8 ký tự, bao gồm chữ và số')}
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
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="forgot-confirm-password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '6px' }}>
                    {t('auth.confirmNewPasswordLabel', isEn ? 'Confirm New Password' : 'Xác nhận mật khẩu mới')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="forgot-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('auth.confirmPasswordPlaceholder', isEn ? 'Re-enter new password' : 'Nhập lại mật khẩu mới')}
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
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
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
                    marginTop: '6px',
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
                      {t('common.processing', isEn ? 'Updating password...' : 'Đang cập nhật mật khẩu...')}
                    </>
                  ) : (
                    t('auth.resetPasswordSubmit', isEn ? 'Reset Password' : 'Xác Nhận Đổi Mật Khẩu')
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('REQUEST_OTP');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '4px',
                  }}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> {t('auth.changeEmailBtn', isEn ? 'Use another email' : 'Đổi email khác')}
                </button>
              </form>
            </>
          ) : (
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
                {t('auth.recovery', 'Khôi phục truy cập')}
              </div>

              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#F7F7F4', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '6px' }}>
                {t('auth.forgotPasswordTitle', 'Quên mật khẩu?')}
              </h1>
              <p style={{ fontSize: '13.5px', color: '#CBD5E1', lineHeight: 1.5, marginBottom: '24px' }}>
                {t('auth.forgotStep1Desc', 'Nhập địa chỉ email đã đăng ký để nhận mã OTP xác thực khôi phục mật khẩu.')}
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

              <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label htmlFor="forgot-email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#F7F7F4', marginBottom: '8px' }}>
                    {t('auth.email', 'Địa chỉ Email')}
                  </label>
                  <input
                    id="forgot-email"
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
                      {t('common.sending', isEn ? 'Sending code...' : 'Đang gửi mã xác nhận...')}
                    </>
                  ) : (
                    t('auth.sendOtpBtn', 'Gửi Mã OTP Khôi Phục')
                  )}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13.5px', color: '#CBD5E1' }}>
                {t('auth.rememberPasswordQuestion', isEn ? 'Remember your password?' : 'Bạn đã nhớ lại mật khẩu?')}{' '}
                <Link href="/login" style={{ color: '#B49A68', fontWeight: 700, textDecoration: 'none' }}>
                  {t('auth.signInBtn', 'Đăng nhập')}
                </Link>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            color: '#94A3B8',
            marginTop: '24px',
          }}
        >
          <div>© 2026 EquiTransit Logistics Ltd.</div>
        </div>
      </div>
    </div>
  );
}
