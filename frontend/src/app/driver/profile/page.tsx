'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User, KeyRound, Save, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser, updateAuthUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function DriverProfilePage() {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    roleDisplay: '',
  });
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const loadProfile = useCallback(async () => {
    const u = getCurrentUser();
    const resolveRoleLabel = (src: any) => {
      if (src?.specialization === 'escort' || src?.persona === 'escort' || src?.email?.toLowerCase().includes('escort')) {
        return language === 'en' ? 'Equine Vet / Escort' : 'Bác sĩ thú y / Áp tải';
      }
      if (src?.specialization === 'driver' || src?.persona === 'driver' || src?.role) {
        return language === 'en' ? 'Driver' : 'Tài xế';
      }
      return '';
    };

    if (u) {
      setProfile({
        fullName: u.fullName || u.name || '',
        email: u.email || '',
        phone: u.phone || '',
        roleDisplay: resolveRoleLabel(u),
      });
    }

    setIsLoadingProfile(true);
    setProfileLoadError(null);
    try {
      const data = await apiClient<any>('/auth/profile');
      if (data) {
        setProfile({
          fullName: data.fullName || data.name || u?.fullName || u?.name || '',
          email: data.email || u?.email || '',
          phone: data.phone || u?.phone || '',
          roleDisplay: resolveRoleLabel(data) || resolveRoleLabel(u),
        });
        updateAuthUser({
          name: data.fullName || data.name,
          fullName: data.fullName,
          phone: data.phone,
          address: data.address,
        });
      }
    } catch (err: any) {
      if (!u) {
        setProfileLoadError(
          err?.message ||
            (language === 'en'
              ? 'Unable to load crew profile.'
              : 'Không thể tải thông tin hồ sơ nhân sự.')
        );
      }
    } finally {
      setIsLoadingProfile(false);
    }
  }, [language]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoadingProfile || isSaving) return;
    if (!profile.fullName.trim()) {
      toast.error(language === 'en' ? 'Full name is required.' : 'Họ và tên không được để trống.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiClient<any>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: profile.fullName.trim(),
          phone: profile.phone.trim(),
        }),
      });
      const updated = res?.user || profile;
      updateAuthUser({
        name: updated.fullName || updated.name || profile.fullName.trim(),
        fullName: updated.fullName || profile.fullName.trim(),
        phone: updated.phone ?? profile.phone.trim(),
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth-user-updated'));
      }
      toast.success(
        t(
          'common.updateProfileSuccess',
          language === 'en'
            ? 'Crew profile updated successfully!'
            : 'Hồ sơ nhân sự vận chuyển đã được lưu thành công!'
        )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'common.updateProfileError',
            language === 'en' ? 'Unable to update profile.' : 'Lỗi khi cập nhật hồ sơ cá nhân.'
          )
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.currentPassword) {
      toast.error(language === 'en' ? 'Please enter your current password.' : 'Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (passwords.newPassword.length < 8) {
      toast.error(
        language === 'en'
          ? 'New password must be at least 8 characters.'
          : 'Mật khẩu mới phải có tối thiểu 8 ký tự.'
      );
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(passwords.newPassword)) {
      toast.error(
        language === 'en'
          ? 'New password must include letters and at least one digit.'
          : 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số.'
      );
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error(language === 'en' ? 'Confirmed password does not match.' : 'Mật khẩu mới xác nhận không khớp.');
      return;
    }
    if (passwords.currentPassword === passwords.newPassword) {
      toast.error(
        language === 'en'
          ? 'New password cannot match current password.'
          : 'Mật khẩu mới không được trùng mật khẩu hiện tại.'
      );
      return;
    }

    setIsChangingPass(true);
    try {
      await apiClient('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      });
      toast.success(
        t(
          'common.changePasswordSuccess',
          language === 'en' ? 'Password updated successfully!' : 'Đã cập nhật mật khẩu đăng nhập thành công!'
        )
      );
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'common.changePasswordError',
            language === 'en' ? 'Failed to change password.' : 'Lỗi khi đổi mật khẩu. Vui lòng kiểm tra mật khẩu hiện tại.'
          )
      );
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {language === 'en' ? 'Transport Crew Profile & Security' : 'Hồ Sơ Nhân Sự Vận Chuyển'}
        </h1>
        <p className="text-sm text-[#57564E] mt-1 mb-0">
          {language === 'en'
            ? 'Manage contact details, field assignment credentials, and account password.'
            : 'Quản lý thông tin liên lạc thực địa, phân công vai trò và bảo mật tài khoản.'}
        </p>
      </div>

      {profileLoadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{profileLoadError}</span>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* Card 1: Profile */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-7 shadow-sm">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <User size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Field Crew Details' : 'Thông Tin Nhân Viên Thực Địa'}
        </h2>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="driver-fullname" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                {t('common.fullName', language === 'en' ? 'Full Name' : 'Họ và Tên Nhân Viên')}{' '}
                <span className="text-[#9E3B3B]">*</span>
              </label>
              <input
                id="driver-fullname"
                type="text"
                autoComplete="name"
                required
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                placeholder={language === 'en' ? 'Enter your full name' : 'Nhập họ và tên nhân viên'}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 bg-[#FDFCFB] text-[#181A17] font-medium"
              />
            </div>
            <div>
              <label htmlFor="driver-phone" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                {t('common.phone', language === 'en' ? 'Active Phone Number' : 'Số Điện Thoại Trực Tuyến')}
              </label>
              <input
                id="driver-phone"
                type="tel"
                autoComplete="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder={language === 'en' ? 'e.g. 0903 123 456' : 'VD: 0903 123 456'}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 bg-[#FDFCFB] text-[#181A17] font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="driver-email" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                {t('common.emailAddress', language === 'en' ? 'System Email' : 'Email Tài Khoản')}
              </label>
              <input
                id="driver-email"
                type="email"
                disabled
                value={profile.email}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] text-[#57564E] text-sm font-medium cursor-not-allowed"
              />
            </div>
            {profile.roleDisplay && (
              <div>
                <label htmlFor="driver-role-cert" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                  {language === 'en' ? 'Assigned Field Role' : 'Vai Trò Chuyên Môn Thực Địa'}
                </label>
                <input
                  id="driver-role-cert"
                  type="text"
                  disabled
                  value={profile.roleDisplay}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] text-[#181A17] font-semibold text-xs cursor-not-allowed"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end mt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving || isLoadingProfile}
              className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl font-bold"
            >
              {isSaving ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save size={16} className="mr-1.5" aria-hidden="true" />
              )}
              {isSaving
                ? t('common.saving', language === 'en' ? 'Saving...' : 'Đang lưu...')
                : t('common.save', language === 'en' ? 'Save Changes' : 'Lưu Thay Đổi')}
            </Button>
          </div>
        </form>
      </div>

      {/* Card 2: Password */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-7 shadow-sm">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Change Login Password' : 'Đổi Mật Khẩu Đăng Nhập'}
        </h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label htmlFor="driver-cur-pw" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
              {t('common.currentPassword', language === 'en' ? 'Current Password' : 'Mật khẩu hiện tại')}{' '}
              <span className="text-[#9E3B3B]">*</span>
            </label>
            <div className="relative">
              <input
                id="driver-cur-pw"
                type={showCurrentPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                placeholder="••••••••"
                className="w-full min-h-[44px] pl-3.5 pr-12 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 bg-[#FDFCFB]"
              />
              <button
                type="button"
                aria-pressed={showCurrentPw}
                aria-label={
                  showCurrentPw
                    ? language === 'en'
                      ? 'Hide current password'
                      : 'Ẩn mật khẩu hiện tại'
                    : language === 'en'
                    ? 'Show current password'
                    : 'Hiển thị mật khẩu hiện tại'
                }
                onClick={() => setShowCurrentPw((v) => !v)}
                className="w-11 h-11 absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#57564E] hover:text-[#181A17] rounded-lg cursor-pointer"
              >
                {showCurrentPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="driver-new-pw" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                {language === 'en'
                  ? 'New Password (8+ chars, letter & digit)'
                  : 'Mật khẩu mới (8+ ký tự, gồm chữ và số)'}{' '}
                <span className="text-[#9E3B3B]">*</span>
              </label>
              <div className="relative">
                <input
                  id="driver-new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-3.5 pr-12 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 bg-[#FDFCFB]"
                />
                <button
                  type="button"
                  aria-pressed={showNewPw}
                  aria-label={
                    showNewPw
                      ? language === 'en'
                        ? 'Hide new password'
                        : 'Ẩn mật khẩu mới'
                      : language === 'en'
                      ? 'Show new password'
                      : 'Hiển thị mật khẩu mới'
                  }
                  onClick={() => setShowNewPw((v) => !v)}
                  className="w-11 h-11 absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#57564E] hover:text-[#181A17] rounded-lg cursor-pointer"
                >
                  {showNewPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="driver-confirm-pw" className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px]">
                {t('common.confirmNewPassword', language === 'en' ? 'Confirm New Password' : 'Xác nhận mật khẩu mới')}{' '}
                <span className="text-[#9E3B3B]">*</span>
              </label>
              <div className="relative">
                <input
                  id="driver-confirm-pw"
                  type={showConfirmPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-3.5 pr-12 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 bg-[#FDFCFB]"
                />
                <button
                  type="button"
                  aria-pressed={showConfirmPw}
                  aria-label={
                    showConfirmPw
                      ? language === 'en'
                        ? 'Hide confirmed password'
                        : 'Ẩn mật khẩu xác nhận'
                      : language === 'en'
                      ? 'Show confirmed password'
                      : 'Hiển thị mật khẩu xác nhận'
                  }
                  onClick={() => setShowConfirmPw((v) => !v)}
                  className="w-11 h-11 absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#57564E] hover:text-[#181A17] rounded-lg cursor-pointer"
                >
                  {showConfirmPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isChangingPass}
              className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl font-bold"
            >
              {isChangingPass ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound size={16} className="mr-1.5" aria-hidden="true" />
              )}
              {isChangingPass
                ? t('common.updating', language === 'en' ? 'Updating...' : 'Đang cập nhật...')
                : language === 'en'
                ? 'Update Password'
                : 'Cập Nhật Mật Khẩu'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
