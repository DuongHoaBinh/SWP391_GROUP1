'use client';

import React, { useState, useEffect } from 'react';
import { User, KeyRound, Save, Eye, EyeOff, Loader2, Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser, updateAuthUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { trackingApi, TrackingSystemSettings } from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

export default function ManagerSettingsPage() {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' });
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [trackingSettings, setTrackingSettings] = useState<TrackingSystemSettings>({
    simulationEnabled: false,
    customerVitalsDetail: false,
    geofenceRadiusDefaultM: 300,
    geofenceRadiusLargeSiteM: 1000,
  });

  useEffect(() => {
    const u = getCurrentUser();
    if (u) {
      setIsAdmin(u.role?.toUpperCase() === 'ADMIN');
      setProfile({
        fullName: u.fullName || u.name || '',
        email: u.email || '',
        phone: u.phone || '',
      });
    }

    trackingApi
      .getTrackingSettings()
      .then((s) => {
        if (mounted && s) setTrackingSettings(s);
      })
      .catch((err) => {
        console.warn('Could not load tracking settings:', err);
      });

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
        console.warn('Could not load manager profile, falling back to session:', err);
      } finally {
        if (mounted) setIsLoadingProfile(false);
      }
    };

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoadingProfile || isSaving) return;
    if (!profile.fullName.trim()) {
      toast.error(
        language === 'en' ? 'Full name is required.' : 'Họ và tên không được để trống',
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
        t('common.updateProfileSuccess', language === 'en' ? 'Manager profile updated!' : 'Đã cập nhật thông tin tài khoản Manager!'),
      );
    } catch (err: any) {
      toast.error(err?.message || t('common.updateProfileError', 'Không thể cập nhật thông tin.'));
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
          : 'Mật khẩu mới phải có tối thiểu 8 ký tự',
      );
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(passwords.newPassword)) {
      toast.error(
        language === 'en'
          ? 'New password must include letters and at least one number.'
          : 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số',
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
          : 'Mật khẩu mới không được trùng mật khẩu hiện tại',
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
        t('common.changePasswordSuccess', language === 'en' ? 'Password updated successfully!' : 'Đã đổi mật khẩu thành công!'),
      );
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err?.message || t('common.changePasswordError', 'Không thể đổi mật khẩu.'));
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleSaveTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTracking(true);
    try {
      const updated = await trackingApi.updateTrackingSettings({
        simulationEnabled: trackingSettings.simulationEnabled,
        customerVitalsDetail: trackingSettings.customerVitalsDetail,
        geofenceRadiusDefaultM: Number(trackingSettings.geofenceRadiusDefaultM) || 300,
        geofenceRadiusLargeSiteM: Number(trackingSettings.geofenceRadiusLargeSiteM) || 1000,
      });
      setTrackingSettings(updated);
      toast.success(
        language === 'en'
          ? 'Tracking settings updated!'
          : 'Đã cập nhật cấu hình định vị GPS & hàng rào địa lý!',
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          (language === 'en'
            ? 'Failed to update tracking settings.'
            : 'Không thể cập nhật cấu hình định vị.'),
      );
    } finally {
      setIsSavingTracking(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {language === 'en'
            ? 'Logistics Manager Account Settings'
            : 'Cài Đặt Tài Khoản Logistics Manager'}
        </h1>
        <p className="text-sm text-[#5F6977] mt-1 mb-0">
          {language === 'en'
            ? 'Manage executive profile details and security credentials.'
            : 'Quản lý thông tin quản trị và bảo mật tài khoản điều hành.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <User size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Personal Information' : 'Thông Tin Cá Nhân'}
        </h2>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mgr-fullname" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.fullName', language === 'en' ? 'Full Name' : 'Họ và Tên')}
              </label>
              <input
                id="mgr-fullname"
                type="text"
                autoComplete="name"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                placeholder={language === 'en' ? 'Enter your full name...' : 'Nhập họ và tên...'}
              />
            </div>
            <div>
              <label htmlFor="mgr-phone" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.phone', language === 'en' ? 'Phone Number' : 'Số Điện Thoại')}
              </label>
              <input
                id="mgr-phone"
                type="tel"
                autoComplete="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
                placeholder={language === 'en' ? 'e.g. 0901234567' : 'VD: 0901234567'}
              />
            </div>
          </div>
          <div>
            <label htmlFor="mgr-email" className="text-xs font-bold text-[#181A17] block mb-1.5">
              {t('common.emailAddress', language === 'en' ? 'Email (Login Username)' : 'Email (Tên đăng nhập)')}
            </label>
            <input
              id="mgr-email"
              type="email"
              disabled
              value={profile.email}
              className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#F4F1E9] text-[#5F6977] text-sm cursor-not-allowed"
            />
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
              {isSaving ? t('common.saving', 'Đang lưu...') : t('common.save', 'Lưu Thay Đổi')}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#181A17] mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-[#A67C2E]" aria-hidden="true" />{' '}
          {language === 'en' ? 'Change Password' : 'Đổi Mật Khẩu'}
        </h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label htmlFor="mgr-cur-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
              {t('common.currentPassword', language === 'en' ? 'Current Password' : 'Mật Khẩu Hiện Tại')}
            </label>
            <div className="relative">
              <input
                id="mgr-cur-pw"
                type={showCurrentPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
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
              <label htmlFor="mgr-new-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {language === 'en'
                  ? 'New Password (8+ chars, letters & digits)'
                  : 'Mật Khẩu Mới (Tối thiểu 8 ký tự, gồm chữ và số)'}
              </label>
              <div className="relative">
                <input
                  id="mgr-new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
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
              <label htmlFor="mgr-confirm-pw" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {t('common.confirmNewPassword', language === 'en' ? 'Confirm New Password' : 'Xác Nhận Mật Khẩu Mới')}
              </label>
              <div className="relative">
                <input
                  id="mgr-confirm-pw"
                  type={showConfirmPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] transition-all"
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
                ? t('common.updating', 'Đang cập nhật...')
                : language === 'en'
                ? 'Update Password'
                : 'Cập Nhật Mật Khẩu'}
            </Button>
          </div>
        </form>
      </div>

      {/* Tracking & Geofence System Settings */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#181A17] mb-2 flex items-center gap-2">
          <Compass size={18} className="text-[#A67C2E]" aria-hidden="true" />
          {language === 'en' ? 'GPS Tracking & Geofence Settings' : 'Cấu Hình Định Vị GPS & Hàng Rào Địa Lý'}
        </h2>
        <p className="text-xs text-[#5F6977] mb-4">
          {language === 'en'
            ? 'Configure GPS accuracy tolerances, geofence radius, vitals visibility, and route simulation.'
            : 'Cấu hình dung sai tọa độ, bán kính trạm dừng, hiển thị sinh hiệu cho khách hàng và cờ giả lập tuyến đường.'}
        </p>

        <form onSubmit={handleSaveTracking} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="geofence-default" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {language === 'en' ? 'Default Geofence Radius (meters)' : 'Bán kính Geofence mặc định (mét)'}
              </label>
              <input
                id="geofence-default"
                type="number"
                min="50"
                max="2000"
                value={trackingSettings.geofenceRadiusDefaultM}
                onChange={(e) =>
                  setTrackingSettings({
                    ...trackingSettings,
                    geofenceRadiusDefaultM: Number(e.target.value),
                  })
                }
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E]"
              />
              <span className="text-[11px] text-[#747D88] mt-1 block">
                {language === 'en'
                  ? 'Used for standard rest stops, tolls, and checkpoints (default 300m)'
                  : 'Áp dụng cho trạm dừng nghỉ, trạm thu phí (mặc định 300m)'}
              </span>
            </div>

            <div>
              <label htmlFor="geofence-large" className="text-xs font-bold text-[#181A17] block mb-1.5">
                {language === 'en' ? 'Large Site Geofence Radius (meters)' : 'Bán kính Geofence khu liên hợp lớn (mét)'}
              </label>
              <input
                id="geofence-large"
                type="number"
                min="100"
                max="5000"
                value={trackingSettings.geofenceRadiusLargeSiteM}
                onChange={(e) =>
                  setTrackingSettings({
                    ...trackingSettings,
                    geofenceRadiusLargeSiteM: Number(e.target.value),
                  })
                }
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E]"
              />
              <span className="text-[11px] text-[#747D88] mt-1 block">
                {language === 'en'
                  ? 'Used for airports, seaports, and border quarantine complexes (default 1000m)'
                  : 'Áp dụng cho sân bay, cảng biển, khu kiểm dịch biên giới (mặc định 1000m)'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#181A17]">
                {language === 'en' ? 'Show detailed vitals to customers' : 'Cho phép khách xem chi tiết sinh hiệu'}
              </div>
              <div className="text-[11px] text-[#5F6977]">
                {language === 'en'
                  ? 'If enabled, customers can view temperature and heart rate; otherwise only condition badges are visible.'
                  : 'Nếu bật, khách hàng được xem số đo nhiệt độ và nhịp tim cụ thể; nếu tắt, chỉ hiển thị trạng thái ổn định/cảnh báo.'}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={trackingSettings.customerVitalsDetail}
                onChange={(e) =>
                  setTrackingSettings({
                    ...trackingSettings,
                    customerVitalsDetail: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#287653]"></div>
            </label>
          </div>

          <div className="pt-2 border-t border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#181A17] flex items-center gap-1.5">
                <span>{language === 'en' ? 'Simulation Mode' : 'Chế độ Giả lập Tọa độ (Simulation Mode)'}</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300">
                  DEV / TEST
                </span>
              </div>
              <div className="text-[11px] text-[#5F6977]">
                {language === 'en'
                  ? 'Enable route pings from simulation engine for testing without physical vehicles (Admin permission).'
                  : 'Cho phép tiếp nhận tọa độ giả lập để kiểm thử luồng di chuyển mà không cần xe thật chạy trên đường (Quyền Admin).'}
              </div>
            </div>
            <label className={`relative inline-flex items-center ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={trackingSettings.simulationEnabled}
                onChange={(e) =>
                  setTrackingSettings({
                    ...trackingSettings,
                    simulationEnabled: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#A67C2E]"></div>
            </label>
          </div>

          <div className="flex justify-end mt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSavingTracking}
              className="h-11 px-5 rounded-xl"
            >
              {isSavingTracking ? (
                <Loader2 size={16} className="animate-spin mr-1.5" aria-hidden="true" />
              ) : (
                <Save size={16} className="mr-1.5" aria-hidden="true" />
              )}
              {isSavingTracking
                ? t('common.saving', 'Đang lưu...')
                : language === 'en'
                ? 'Save Tracking Settings'
                : 'Lưu Cài Đặt Định Vị'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
