'use client';

import React, { useState, useEffect } from 'react';
import { User, KeyRound, Save, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser, updateAuthUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function SpecialistSettingsPage() {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
  });
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    if (u) {
      setProfile({
        fullName: u.fullName || u.name || '',
        email: u.email || '',
        phone: u.phone || '',
      });
    }

    let mounted = true;
    const loadProfile = async () => {
      setIsLoadingProfile(true);
      try {
        const data = await apiClient<any>('/auth/profile');
        if (mounted && data) {
          setProfile({
            fullName: data.fullName || data.name || u?.fullName || u?.name || '',
            email: data.email || u?.email || '',
            phone: data.phone || u?.phone || '',
          });
          updateAuthUser({
            name: data.fullName || data.name,
            fullName: data.fullName,
            phone: data.phone,
            address: data.address,
          });
        }
      } catch (err) {
        console.warn('Could not load specialist profile, falling back to session:', err);
      } finally {
        if (mounted) setIsLoadingProfile(false);
      }
    };

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoadingProfile || isSaving) return;
    if (!profile.fullName.trim()) {
      toast.error(
        language === 'en' ? 'Full name is required.' : 'Họ và tên không được để trống'
      );
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
            ? 'Specialist profile updated successfully!'
            : 'Cập nhật thông tin hồ sơ chuyên viên thành công!'
        )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'common.updateProfileError',
            language === 'en'
              ? 'Failed to update profile. Please try again.'
              : 'Cập nhật hồ sơ thất bại. Vui lòng thử lại.'
          )
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.currentPassword) {
      toast.error(language === 'en' ? 'Please enter current password.' : 'Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (passwords.newPassword.length < 8) {
      toast.error(
        language === 'en'
          ? 'New password must be at least 8 characters.'
          : 'Mật khẩu mới phải có tối thiểu 8 ký tự'
      );
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(passwords.newPassword)) {
      toast.error(
        language === 'en'
          ? 'New password must include letters and at least one number.'
          : 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số'
      );
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error(language === 'en' ? 'Confirmed password does not match.' : 'Mật khẩu xác nhận không khớp');
      return;
    }
    if (passwords.currentPassword === passwords.newPassword) {
      toast.error(
        language === 'en'
          ? 'New password cannot match current password.'
          : 'Mật khẩu mới không được trùng mật khẩu hiện tại'
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
        t('common.changePasswordSuccess', language === 'en' ? 'Password updated successfully!' : 'Đổi mật khẩu thành công!')
      );
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'common.changePasswordError',
            language === 'en'
              ? 'Failed to change password. Please check your current password.'
              : 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.'
          )
      );
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {language === 'en'
            ? 'Specialist Account Settings'
            : 'Cài Đặt Tài Khoản Chuyên Viên Kiểm Dịch'}
        </h1>
        <p className="text-sm text-[#5F6977] mt-1 mb-0">
          {language === 'en'
            ? 'Manage quarantine specialist profile details and system security settings.'
            : 'Quản lý thông tin hồ sơ chuyên viên kiểm dịch và thiết lập bảo mật hệ thống.'}
        </p>
      </div>

      {/* Card 1: Profile Information */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-5 sm:p-6">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <User size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Specialist Profile Information' : 'Thông Tin Hồ Sơ Chuyên Viên'}
        </h2>
        <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="spec-fullname" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.fullName', language === 'en' ? 'Full Name' : 'Họ và Tên')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="spec-fullname"
                type="text"
                autoComplete="name"
                required
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] placeholder:text-[#747D88] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                placeholder={language === 'en' ? 'Enter specialist full name...' : 'Nhập họ và tên chuyên viên'}
              />
            </div>
            <div>
              <label htmlFor="spec-phone" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.phone', language === 'en' ? 'Phone Number' : 'Số Điện Thoại')}
              </label>
              <input
                id="spec-phone"
                type="tel"
                autoComplete="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] placeholder:text-[#747D88] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                placeholder={language === 'en' ? 'e.g. 0987 654 321' : 'VD: 0987 654 321'}
              />
            </div>
          </div>
          <div>
            <label htmlFor="spec-email" className="text-xs font-bold text-[#181A17] block mb-1.5">
              {t('common.emailAddress', language === 'en' ? 'System Email (Login Username)' : 'Địa Chỉ Email Hệ Thống')}
            </label>
            <input
              id="spec-email"
              type="email"
              disabled
              value={profile.email}
              className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] text-[#5F6977] text-sm cursor-not-allowed"
            />
            <p className="text-[11px] text-[#747D88] mt-1 mb-0">
              {language === 'en'
                ? 'Assigned by system administrator and cannot be modified here.'
                : 'Email do quản trị viên cấp, không thể tự chỉnh sửa.'}
            </p>
          </div>
          <div className="flex justify-end mt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving || isLoadingProfile}
              className="h-11 px-5 rounded-xl"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin mr-1.5" aria-hidden="true" />
              ) : (
                <Save size={16} className="mr-1.5" aria-hidden="true" />
              )}
              {isSaving
                ? t('common.saving', language === 'en' ? 'Saving...' : 'Đang lưu...')
                : t('common.save', language === 'en' ? 'Save Profile' : 'Lưu Thông Tin')}
            </Button>
          </div>
        </form>
      </div>

      {/* Card 2: Password & Security */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-5 sm:p-6">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Password & Security' : 'Bảo Mật & Mật Khẩu'}
        </h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label htmlFor="spec-cur-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
              {t('common.currentPassword', language === 'en' ? 'Current Password' : 'Mật Khẩu Hiện Tại')}{' '}
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="spec-cur-pw"
                type={showCurrentPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] placeholder:text-[#747D88] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                placeholder="••••••••"
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
                className="w-10 h-10 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] rounded-lg cursor-pointer"
              >
                {showCurrentPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="spec-new-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {language === 'en'
                  ? 'New Password (8+ chars, letters & digits)'
                  : 'Mật Khẩu Mới (Tối thiểu 8 ký tự, gồm chữ và số)'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="spec-new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] placeholder:text-[#747D88] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                  placeholder="••••••••"
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
                  className="w-10 h-10 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] rounded-lg cursor-pointer"
                >
                  {showNewPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="spec-confirm-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.confirmNewPassword', language === 'en' ? 'Confirm New Password' : 'Xác Nhận Mật Khẩu Mới')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="spec-confirm-pw"
                  type={showConfirmPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] placeholder:text-[#747D88] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                  placeholder="••••••••"
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
                  className="w-10 h-10 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#5F6977] hover:text-[#181A17] rounded-lg cursor-pointer"
                >
                  {showConfirmPw ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={isChangingPass} className="h-11 px-5 rounded-xl">
              {isChangingPass ? (
                <Loader2 size={16} className="animate-spin mr-1.5" aria-hidden="true" />
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
