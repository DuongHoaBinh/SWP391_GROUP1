'use client';

import React, { useState, useEffect } from 'react';
import { User, KeyRound, Save, Building2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function ManagerSettingsPage() {
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [bankConfig, setBankConfig] = useState({
    bankCode: 'MBBank',
    bankAccountNo: '0000123456789',
    bankAccountName: 'CONG TY VAN CHUYEN NGUA EQUITRANSIT',
    paymentCodePrefix: 'EQT',
    expireHours: 48,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    setProfile({
      fullName: u.name || u.fullName || 'Logistics Manager',
      email: u.email || 'manager@example.com',
      phone: u.phone || '0901112222',
    });

    apiClient<any>('/orders/payments/config')
      .then((res) => {
        if (res) {
          setBankConfig({
            bankCode: res.bankCode || 'MBBank',
            bankAccountNo: res.bankAccountNo || '0000123456789',
            bankAccountName: res.bankAccountName || 'CONG TY VAN CHUYEN NGUA EQUITRANSIT',
            paymentCodePrefix: res.paymentCodePrefix || 'EQT',
            expireHours: Number(res.expireHours || 48),
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: profile.fullName, phone: profile.phone }),
      });
      toast.success('Đã cập nhật hồ sơ Quản lý!');
    } catch {
      toast.error('Không thể cập nhật hồ sơ.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBankConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankConfig.bankCode.trim() || !bankConfig.bankAccountNo.trim() || !bankConfig.bankAccountName.trim()) {
      toast.error('Vui lòng nhập đầy đủ Ngân hàng, Số tài khoản và Tên chủ tài khoản.');
      return;
    }
    setIsSavingBank(true);
    try {
      await apiClient('/orders/payments/config', {
        method: 'PUT',
        body: JSON.stringify({
          bankCode: bankConfig.bankCode.trim(),
          bankAccountNo: bankConfig.bankAccountNo.trim(),
          bankAccountName: bankConfig.bankAccountName.trim().toUpperCase(),
          paymentCodePrefix: bankConfig.paymentCodePrefix.trim().toUpperCase() || 'EQT',
          expireHours: Number(bankConfig.expireHours) || 48,
        }),
      });
      toast.success('Đã lưu cấu hình Tài khoản Ngân hàng nhận tiền (VietQR / SePay)!');
    } catch (err: any) {
      toast.error(err?.message || 'Không thể lưu cấu hình ngân hàng.');
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Mật khẩu mới không khớp');
      return;
    }
    setIsChangingPass(true);
    try {
      await apiClient('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      });
      toast.success('Đã đổi mật khẩu thành công!');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      toast.error('Không thể đổi mật khẩu.');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">Manager Account & Payment Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Quản lý thông tin tài khoản, bảo mật và cấu hình tài khoản ngân hàng nhận tiền chuyển khoản QR (SePay / VietQR).
        </p>
      </div>

      {/* Cấu hình Tài khoản Ngân hàng nhận tiền (VietQR / SePay) */}
      <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
            <QrCode size={19} className="text-blue-600" /> Cấu hình Tài khoản Ngân hàng Nhận tiền (VietQR / SePay)
          </h3>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            SePay Test Mode / VietQR
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Thông tin tài khoản ngân hàng dưới đây được dùng để tự động sinh mã QR chuyển khoản cho khách hàng sau khi hoàn tất thẩm định hồ sơ (Flow 2). Trong môi trường thử nghiệm, sử dụng tài khoản/VA giả lập do SePay cung cấp.
        </p>

        <form onSubmit={handleSaveBankConfig} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Ngân hàng thụ hưởng (Bank Code) <span className="text-red-600">*</span>
              </label>
              <select
                value={bankConfig.bankCode}
                onChange={(e) => setBankConfig({ ...bankConfig, bankCode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="MBBank">MBBank (Ngân hàng Quân Đội)</option>
                <option value="Vietcombank">Vietcombank (VCB)</option>
                <option value="BIDV">BIDV (Đầu tư & Phát triển VN)</option>
                <option value="VietinBank">VietinBank (ICB)</option>
                <option value="Techcombank">Techcombank (TCB)</option>
                <option value="ACB">ACB (Á Châu)</option>
                <option value="TPBank">TPBank (Tiên Phong)</option>
                <option value="VPBank">VPBank (Việt Nam Thịnh Vượng)</option>
                <option value="OCB">OCB (Phương Đông)</option>
                <option value="KienLongBank">KienLongBank</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Số tài khoản nhận / VA (Account Number) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={bankConfig.bankAccountNo}
                onChange={(e) => setBankConfig({ ...bankConfig, bankAccountNo: e.target.value })}
                placeholder="VD: 0000123456789"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Tên chủ tài khoản (Không dấu) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={bankConfig.bankAccountName}
                onChange={(e) => setBankConfig({ ...bankConfig, bankAccountName: e.target.value.toUpperCase() })}
                placeholder="CONG TY VAN CHUYEN NGUA EQUITRANSIT"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Tiền tố mã thanh toán (Prefix)
              </label>
              <input
                type="text"
                value={bankConfig.paymentCodePrefix}
                onChange={(e) =>
                  setBankConfig({
                    ...bankConfig,
                    paymentCodePrefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
                  })
                }
                placeholder="EQT"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Hạn thanh toán mặc định (Giờ)
              </label>
              <input
                type="number"
                min={1}
                max={720}
                value={bankConfig.expireHours}
                onChange={(e) => setBankConfig({ ...bankConfig, expireHours: Number(e.target.value) || 48 })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Building2 size={14} className="text-blue-600" />
              Ví dụ mã nội dung CK tự sinh: <code className="font-bold text-blue-700">{bankConfig.paymentCodePrefix || 'EQT'}039</code>
            </span>
            <Button type="submit" variant="primary" size="sm" disabled={isSavingBank}>
              <Save size={16} className="mr-1.5" /> {isSavingBank ? 'Đang lưu...' : 'Lưu cấu hình Ngân hàng'}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <User size={18} className="text-blue-600" /> Manager Profile
        </h3>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
              <input
                type="text"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
            <input
              type="email"
              disabled
              value={profile.email}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-sm"
            />
          </div>
          <div className="flex justify-end mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
              <Save size={16} className="mr-1.5" /> {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-blue-600" /> Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Current Password</label>
            <input
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">New Password</label>
              <input
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={isChangingPass}>
              <KeyRound size={16} className="mr-1.5" /> {isChangingPass ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
