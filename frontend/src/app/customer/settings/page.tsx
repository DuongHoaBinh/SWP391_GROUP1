'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { getCurrentUser, updateAuthUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function CustomerSettingsPage() {
  const { t, language, translateRole } = useLanguage();
  const [user, setUser] = useState<{
    email: string;
    role: string;
    initials: string;
    fullName?: string;
    name?: string;
    authProvider?: 'local' | 'google';
    hasPassword?: boolean;
  }>({ email: '', role: 'CUSTOMER', initials: 'CU', hasPassword: true });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string | null>(null);

  const hasLocalPassword = user.hasPassword !== false;

  useEffect(() => {
    const localUser = getCurrentUser();
    setUser(localUser);
    setFullName(localUser.fullName || localUser.name || '');
    setPhone(localUser.phone || '');
    setAddress(localUser.address || '');

    let isMounted = true;
    const loadProfile = async () => {
      setIsLoadingProfile(true);
      try {
        const data = await apiClient<any>('/auth/profile');
        if (isMounted && data) {
          if (data.fullName || data.name) {
            setFullName(data.fullName || data.name);
          }
          if (data.phone) setPhone(data.phone);
          if (data.address) setAddress(data.address);
          updateAuthUser({
            name: data.fullName || data.name,
            fullName: data.fullName,
            phone: data.phone,
            address: data.address,
            authProvider: data.authProvider,
            hasPassword: typeof data.hasPassword === 'boolean' ? data.hasPassword : undefined,
          });
          setUser(getCurrentUser());
        }
      } catch (err) {
        console.warn('Could not fetch remote profile, using local session', err);
      } finally {
        if (isMounted) setIsLoadingProfile(false);
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoadingProfile || isSaving) return;
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await apiClient<any>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          address: address.trim(),
        }),
      });

      const updatedUser = response.user || {
        fullName: fullName.trim(),
        name: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      };

      updateAuthUser({
        name: updatedUser.fullName || updatedUser.name || fullName.trim(),
        fullName: updatedUser.fullName || fullName.trim(),
        phone: updatedUser.phone || phone.trim(),
        address: updatedUser.address || address.trim(),
      });

      setUser(getCurrentUser());
      setSuccessMessage(
        t('common.updateProfileSuccess', 'Thông tin tài khoản đã được cập nhật thành công!'),
      );
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setErrorMessage(
        err?.message || t('common.updateProfileError', 'Không thể lưu thông tin. Vui lòng thử lại.'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccessMessage(null);
    setPasswordErrorMessage(null);

    if (hasLocalPassword && !currentPassword) {
      setPasswordErrorMessage(
        language === 'en' ? 'Please enter your current password.' : 'Vui lòng nhập mật khẩu hiện tại.',
      );
      return;
    }

    if (newPassword.length < 8) {
      setPasswordErrorMessage(
        language === 'en'
          ? 'New password must be at least 8 characters.'
          : 'Mật khẩu mới phải có tối thiểu 8 ký tự.',
      );
      return;
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(newPassword)) {
      setPasswordErrorMessage(
        language === 'en'
          ? 'New password must include at least one letter and one digit.'
          : 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMessage(
        language === 'en' ? 'Confirmed password does not match.' : 'Mật khẩu nhập lại không khớp.',
      );
      return;
    }

    if (hasLocalPassword && currentPassword === newPassword) {
      setPasswordErrorMessage(
        language === 'en'
          ? 'New password cannot match current password.'
          : 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
      );
      return;
    }

    setIsChangingPassword(true);
    try {
      const payload = hasLocalPassword
        ? { currentPassword, newPassword, confirmPassword }
        : { newPassword, confirmPassword };
      const response = await apiClient<any>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!hasLocalPassword) {
        updateAuthUser({ hasPassword: true });
        setUser(getCurrentUser());
      }

      setPasswordSuccessMessage(
        response?.message ||
          (hasLocalPassword
            ? t(
                'common.changePasswordSuccess',
                'Đổi mật khẩu thành công! Hãy sử dụng mật khẩu mới cho các lần đăng nhập tiếp theo.',
              )
            : language === 'en'
            ? 'Password created successfully! You can now sign in with Email/Password or Google.'
            : 'Thiết lập mật khẩu thành công! Từ giờ bạn có thể đăng nhập bằng Email/Mật khẩu hoặc Google.'),
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Failed to change password:', err);
      setPasswordErrorMessage(
        err?.message ||
          t(
            'common.changePasswordError',
            'Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.',
          ),
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-10">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5">
        <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {t('customer.settingsTitle', 'Cài đặt tài khoản & Hồ sơ')}
        </h1>
        <p className="text-sm text-[#5F6977] mt-1 mb-0">
          {t('customer.settingsSubtitle', language === 'en' ? 'Manage your personal profile, contact details, and password.' : 'Quản lý thông tin cá nhân, liên hệ và bảo mật tài khoản.')}
        </p>
      </header>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        {/* Clean White Profile Strip */}
        <div className="p-5 sm:p-6 bg-white border-b border-[#EFEAE0] flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-extrabold text-xl shrink-0">
            {user.initials || 'CU'}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#181A17] m-0">
              {fullName || user.email || (language === 'en' ? 'Account' : 'Tài khoản')}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-[#5F6977]">{user.email}</span>
              <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#FAF8F4] text-[#8C6621] border border-[#E5DDD0] uppercase">
                {translateRole(user.role)}
              </span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 flex flex-col gap-5">
          {successMessage && (
            <div
              role="status"
              className="px-4 py-3 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4] text-[#287653] flex items-center gap-2.5 text-xs sm:text-sm font-semibold"
            >
              <CheckCircle2 size={17} className="shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl bg-[#F8EAEA] border border-[#E5B8B8] text-[#B33E3E] flex items-center gap-2.5 text-xs sm:text-sm font-semibold"
            >
              <AlertCircle size={17} className="shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label htmlFor="settings-fullname" className="block text-xs font-semibold text-[#181A17] mb-1.5">
              {t('common.fullName', language === 'en' ? 'Full Name' : 'Họ và tên')} <span className="text-[#B33E3E]" aria-hidden="true">*</span>
            </label>
            <div className="relative">
              <User size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="settings-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={language === 'en' ? 'Enter your full name...' : 'Nhập họ và tên của bạn...'}
                required
                className="w-full py-2.5 pl-10 pr-3.5 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
              />
            </div>
            <p className="text-xs text-[#747D88] mt-1.5 mb-0">
              {language === 'en'
                ? 'This name is displayed on your Header, Sidebar, and transport certificates.'
                : 'Tên này sẽ hiển thị trên Header, Sidebar và các chứng từ vận chuyển của bạn.'}
            </p>
          </div>

          {/* Email (Read only) */}
          <div>
            <label htmlFor="settings-email" className="block text-xs font-semibold text-[#181A17] mb-1.5">
              {t('common.emailAddress', language === 'en' ? 'Email Address' : 'Địa chỉ Email')}
            </label>
            <div className="relative">
              <Mail size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="settings-email"
                type="email"
                value={user.email}
                disabled
                className="w-full py-2.5 pl-10 pr-3.5 rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] text-sm text-[#5F6977] cursor-not-allowed"
              />
            </div>
          </div>

          {/* Grid: Phone & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-phone" className="block text-xs font-semibold text-[#181A17] mb-1.5">
                {t('common.phone', language === 'en' ? 'Phone Number' : 'Số điện thoại liên hệ')}
              </label>
              <div className="relative">
                <Phone size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="settings-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={language === 'en' ? 'e.g. 0912345678' : 'Ví dụ: 0912345678'}
                  className="w-full py-2.5 pl-10 pr-3.5 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="settings-address" className="block text-xs font-semibold text-[#181A17] mb-1.5">
                {t('common.address', language === 'en' ? 'Contact Address' : 'Địa chỉ liên hệ')}
              </label>
              <div className="relative">
                <MapPin size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="settings-address"
                  type="text"
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={language === 'en' ? 'e.g. District 1, Ho Chi Minh City' : 'Ví dụ: Quận 1, TP. Hồ Chí Minh'}
                  className="w-full py-2.5 pl-10 pr-3.5 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end pt-4 border-t border-[#EFEAE0]">
            <button
              type="submit"
              disabled={isSaving || isLoadingProfile}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] disabled:opacity-60 text-[#FBF9F5] text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin text-[#C4B38E]" aria-hidden="true" />
                  <span>{t('common.saving', 'Đang lưu...')}</span>
                </>
              ) : (
                <>
                  <Save size={15} className="text-[#C4B38E]" aria-hidden="true" />
                  <span>{t('common.save', 'Lưu thay đổi')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        <div className="p-5 sm:p-6 bg-white border-b border-[#EFEAE0] flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-[#A67C2E] flex items-center justify-center shrink-0">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#181A17] m-0">
              {hasLocalPassword
                ? language === 'en'
                  ? 'Change Password'
                  : 'Đổi mật khẩu'
                : language === 'en'
                ? 'Set Login Password'
                : 'Thiết lập mật khẩu đăng nhập'}
            </h2>
            <p className="text-xs text-[#5F6977] mt-0.5 mb-0">
              {hasLocalPassword
                ? language === 'en'
                  ? 'Update your password to keep your account secure.'
                  : 'Cập nhật mật khẩu để bảo vệ an toàn cho tài khoản của bạn.'
                : language === 'en'
                ? 'Your account uses Google Sign-In. Set a password below to also sign in with Email and Password.'
                : 'Tài khoản của bạn đăng nhập bằng Google. Tạo mật khẩu bên dưới để có thể đăng nhập bằng cả Email + Mật khẩu hoặc Google.'}
            </p>
          </div>
        </div>

        {/* Password Form */}
        <form onSubmit={handleChangePassword} className="p-5 sm:p-6 flex flex-col gap-5">
          {!hasLocalPassword && (
            <div className="px-4 py-3 rounded-xl bg-[#FAF6EC] border border-[#E6D7B5] text-[#7D5E22] text-xs sm:text-sm font-medium">
              {language === 'en'
                ? 'No current password is required because this account was created with Google.'
                : 'Tài khoản Google này chưa từng tạo mật khẩu riêng, nên bạn không cần nhập mật khẩu hiện tại.'}
            </div>
          )}

          {passwordSuccessMessage && (
            <div
              role="status"
              className="px-4 py-3 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4] text-[#287653] flex items-center gap-2.5 text-xs sm:text-sm font-semibold"
            >
              <CheckCircle2 size={17} className="shrink-0" aria-hidden="true" />
              <span>{passwordSuccessMessage}</span>
            </div>
          )}

          {passwordErrorMessage && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl bg-[#F8EAEA] border border-[#E5B8B8] text-[#B33E3E] flex items-center gap-2.5 text-xs sm:text-sm font-semibold"
            >
              <AlertCircle size={17} className="shrink-0" aria-hidden="true" />
              <span>{passwordErrorMessage}</span>
            </div>
          )}

          {/* Current Password */}
          {hasLocalPassword && (
          <div>
            <label htmlFor="settings-cur-pw" className="block text-xs font-semibold text-[#181A17] mb-1.5">
              {t('common.currentPassword', language === 'en' ? 'Current Password' : 'Mật khẩu hiện tại')}{' '}
              <span className="text-[#B33E3E]" aria-hidden="true">*</span>
            </label>
            <div className="relative">
              <Lock size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="settings-cur-pw"
                type={showCurrentPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={language === 'en' ? 'Enter current password...' : 'Nhập mật khẩu hiện tại...'}
                required
                className="w-full py-2.5 pl-10 pr-11 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
              />
              <button
                type="button"
                aria-pressed={showCurrentPassword}
                aria-label={
                  showCurrentPassword
                    ? language === 'en'
                      ? 'Hide current password'
                      : 'Ẩn mật khẩu hiện tại'
                    : language === 'en'
                    ? 'Show current password'
                    : 'Hiển thị mật khẩu hiện tại'
                }
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="w-10 h-10 min-w-[40px] min-h-[40px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] transition-colors cursor-pointer rounded-lg hover:bg-[#FAF8F4]"
              >
                {showCurrentPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>
          )}

          {/* Grid: New Password & Confirm Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-new-pw" className="block text-xs font-semibold text-[#181A17] mb-1.5">
                {t('common.newPassword', language === 'en' ? 'New Password' : 'Mật khẩu mới')}{' '}
                <span className="text-[#B33E3E]" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <KeyRound size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="settings-new-pw"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={language === 'en' ? 'Minimum 8 characters...' : 'Tối thiểu 8 ký tự...'}
                  required
                  className="w-full py-2.5 pl-10 pr-11 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
                />
                <button
                  type="button"
                  aria-pressed={showNewPassword}
                  aria-label={
                    showNewPassword
                      ? language === 'en'
                        ? 'Hide new password'
                        : 'Ẩn mật khẩu mới'
                      : language === 'en'
                      ? 'Show new password'
                      : 'Hiển thị mật khẩu mới'
                  }
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] transition-colors cursor-pointer rounded-lg hover:bg-[#FAF8F4]"
                >
                  {showNewPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              <p className="text-xs text-[#747D88] mt-1.5 mb-0">
                {language === 'en'
                  ? 'Minimum 8 characters, with at least one letter and one digit.'
                  : 'Tối thiểu 8 ký tự, gồm ít nhất một chữ cái và một số.'}
              </p>
            </div>

            <div>
              <label htmlFor="settings-confirm-pw" className="block text-xs font-semibold text-[#181A17] mb-1.5">
                {t('common.confirmNewPassword', language === 'en' ? 'Confirm New Password' : 'Nhập lại mật khẩu mới')}{' '}
                <span className="text-[#B33E3E]" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <KeyRound size={16} className="text-[#747D88] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="settings-confirm-pw"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={language === 'en' ? 'Confirm your new password...' : 'Xác nhận lại mật khẩu mới...'}
                  required
                  className="w-full py-2.5 pl-10 pr-11 rounded-xl border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
                />
                <button
                  type="button"
                  aria-pressed={showConfirmPassword}
                  aria-label={
                    showConfirmPassword
                      ? language === 'en'
                        ? 'Hide confirmed password'
                        : 'Ẩn mật khẩu xác nhận'
                      : language === 'en'
                      ? 'Show confirmed password'
                      : 'Hiển thị mật khẩu xác nhận'
                  }
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] transition-colors cursor-pointer rounded-lg hover:bg-[#FAF8F4]"
                >
                  {showConfirmPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p role="alert" className="text-xs text-[#B33E3E] mt-1.5 mb-0">
                  {language === 'en' ? 'Confirmed password does not match.' : 'Mật khẩu nhập lại chưa khớp.'}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end pt-4 border-t border-[#EFEAE0]">
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] disabled:opacity-60 text-[#FBF9F5] text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 size={15} className="animate-spin text-[#C4B38E]" aria-hidden="true" />
                  <span>{t('common.processing', 'Đang xử lý...')}</span>
                </>
              ) : (
                <>
                  <Lock size={15} className="text-[#C4B38E]" aria-hidden="true" />
                  <span>
                    {hasLocalPassword
                      ? language === 'en'
                        ? 'Update Password'
                        : 'Cập nhật mật khẩu'
                      : language === 'en'
                      ? 'Set Password'
                      : 'Thiết lập mật khẩu'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
