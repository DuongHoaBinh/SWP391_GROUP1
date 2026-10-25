'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Users,
  UserCheck,
  ShieldCheck,
  Truck,
  Plus,
  Search,
  Filter,
  Mail,
  Phone,
  KeyRound,
  Loader2,
  CheckCircle2,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface StaffItem {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleId?: number;
  roleName: string;
  specialization?: string | null;
  activeTrips?: number;
  status?: string;
}

const fetcher = (url: string) => apiClient<StaffItem[]>(url);

export default function ManagerStaffPage() {
  const { data: staffList = [], isLoading, mutate } = useSWR('/fleet/staff', fetcher, {
    revalidateOnFocus: true,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modal State for Provisioning New Staff
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    roleId: 5, // Default: Vehicle Driver / Escort
    specialization: 'driver' as 'driver' | 'escort',
    password: 'Password123',
  });

  // Filter out any customers just in case
  const internalStaff = staffList.filter(
    (s) => s.roleName !== 'Customer' && s.roleId !== 6
  );

  const isEscortRole = (s: StaffItem) => {
    if (s.specialization === 'escort') return true;
    const lowerName = s.fullName.toLowerCase();
    const lowerEmail = s.email.toLowerCase();
    return lowerName.includes('thú y') || lowerName.includes('escort') || lowerName.includes('vet') || lowerEmail.includes('escort');
  };

  const isDriverRole = (s: StaffItem) => {
    if (s.specialization === 'driver') return true;
    if (isEscortRole(s)) return false;
    const lowerRole = s.roleName.toLowerCase();
    return lowerRole.includes('driver') || lowerRole.includes('escort');
  };

  const filteredStaff = internalStaff.filter((s) => {
    let matchesRole = true;
    if (roleFilter === 'driver') {
      matchesRole = isDriverRole(s);
    } else if (roleFilter === 'escort') {
      matchesRole = isEscortRole(s);
    } else if (roleFilter !== 'ALL') {
      matchesRole = s.roleName.toLowerCase().includes(roleFilter.toLowerCase());
    }

    const query = searchTerm.toLowerCase();
    const matchesSearch =
      s.fullName.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query) ||
      (s.phone && s.phone.toLowerCase().includes(query)) ||
      s.roleName.toLowerCase().includes(query) ||
      (isDriverRole(s) && 'tài xế driver'.includes(query)) ||
      (isEscortRole(s) && 'hộ tống thú y escort vet'.includes(query));
    return matchesRole && matchesSearch;
  });

  // Metrics
  const totalStaff = internalStaff.length;
  const activeStaff = internalStaff.filter((s) => (s.activeTrips || 0) > 0).length;
  const availableStaff = internalStaff.filter((s) => (s.activeTrips || 0) === 0).length;
  const driverOnlyCount = internalStaff.filter((s) => isDriverRole(s)).length;
  const escortOnlyCount = internalStaff.filter((s) => isEscortRole(s)).length;

  const handleOpenProvisionModal = () => {
    setForm({
      fullName: '',
      email: '',
      phone: '',
      roleId: 5,
      specialization: 'driver',
      password: 'Password123',
    });
    setIsProvisionOpen(true);
  };

  const handleSubmitProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error('Vui lòng nhập đầy đủ họ tên và email!');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient('/fleet/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          roleId: Number(form.roleId),
          specialization: Number(form.roleId) === 5 ? form.specialization : undefined,
          password: form.password.trim() || 'Password123',
        }),
      });

      const roleLabel = Number(form.roleId) === 5 
        ? (form.specialization === 'driver' ? 'Tài xế chuyên dụng' : 'Bác sĩ thú y / Hộ tống')
        : 'nhân sự';
      toast.success(`Đã khởi tạo thành công ${roleLabel} "${form.fullName}" vào cơ sở dữ liệu!`);
      setIsProvisionOpen(false);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi khởi tạo tài khoản nhân sự');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRoleBadge = (s: StaffItem) => {
    const lower = s.roleName.toLowerCase();
    if (lower.includes('specialist')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border bg-purple-100 text-purple-800 border-purple-200">
          <Briefcase size={12} /> Transport Specialist
        </span>
      );
    }
    if (lower.includes('coordinator')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border bg-blue-100 text-blue-800 border-blue-200">
          <ShieldCheck size={12} /> Fleet Coordinator
        </span>
      );
    }
    if (isEscortRole(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 shadow-2xs">
          <span className="text-sm leading-none">🩺</span> Equine Medical Escort (Thú y / Hộ tống)
        </span>
      );
    }
    if (isDriverRole(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs">
          <Truck size={12} className="text-emerald-700" /> Vehicle Driver (Tài xế chuyên dụng)
        </span>
      );
    }
    if (lower.includes('manager')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border bg-indigo-100 text-indigo-800 border-indigo-200">
          <UserCheck size={12} /> Logistics Manager
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border bg-slate-100 text-slate-800 border-slate-200">
        {s.roleName}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Operations Staff & Assignment</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý và điều phối chuyên viên kiểm dịch, điều phối tuyến, tài xế chuyên dụng và bác sĩ thú y.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenProvisionModal} className="shadow-sm">
          <Plus size={18} className="mr-1.5" /> Provision New Staff
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Tổng nhân sự</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1 m-0">{totalStaff}</h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Tài xế chuyên dụng</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1 m-0">{driverOnlyCount}</h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Truck size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Bác sĩ thú y & Hộ tống</p>
            <h3 className="text-2xl font-black text-fuchsia-600 mt-1 m-0">{escortOnlyCount}</h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center font-bold text-lg">
            🩺
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Sẵn sàng nhận việc</p>
            <h3 className="text-2xl font-black text-cyan-600 mt-1 m-0">{availableStaff}</h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
            <ShieldCheck size={20} />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Controls */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-80 shadow-2xs">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Tìm theo tên, email, vai trò..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-slate-500 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none"
            >
              <option value="ALL">Tất cả vai trò</option>
              <option value="driver">🚚 Tài xế chuyên dụng (Driver)</option>
              <option value="escort">🩺 Bác sĩ thú y / Hộ tống (Escort)</option>
              <option value="Coordinator">Fleet & Route Coordinator</option>
              <option value="Specialist">Transport Specialist</option>
              <option value="Manager">Logistics Manager</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Staff Member</th>
                <th className="p-4">Assigned Role & Specialization</th>
                <th className="p-4">Contact</th>
                <th className="p-4 text-center">Active Trip Assignments</th>
                <th className="p-4 text-center">Duty Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-600" />
                    Đang tải danh sách nhân sự từ cơ sở dữ liệu...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    Không tìm thấy nhân sự nào phù hợp với điều kiện lọc.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((s) => {
                  const trips = Number(s.activeTrips || 0);
                  const isBusy = trips > 0;
                  const initials = s.fullName
                    .split(' ')
                    .filter(Boolean)
                    .slice(-2)
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase() || 'ST';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Avatar */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 m-0 leading-tight">{s.fullName}</p>
                            <p className="text-xs text-slate-400 m-0 mt-0.5 flex items-center gap-1">
                              {s.phone ? (
                                <>
                                  <Phone size={11} /> {s.phone}
                                </>
                              ) : (
                                <span>ID: #{s.id}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="p-4">
                        {renderRoleBadge(s)}
                      </td>

                      {/* Contact */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <Mail size={13} className="text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                      </td>

                      {/* Active Trip Assignments */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[130px] px-3 py-1 rounded-full text-xs font-bold ${
                            isBusy
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {trips > 0 ? `${trips} Trips Assigned` : '0 Trips (Available)'}
                        </span>
                      </td>

                      {/* Duty Status */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[100px] gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            isBusy
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {isBusy && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                          {isBusy ? 'On Duty' : 'Available'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PROVISION NEW STAFF MODAL */}
      <Modal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        title="Khởi tạo tài khoản nhân sự mới (Provision Staff)"
        subtitle="Thông tin sẽ được lưu trực tiếp vào cơ sở dữ liệu và kích hoạt quyền truy cập tương ứng."
      >
        <form onSubmit={handleSubmitProvision} className="flex flex-col gap-4 text-xs mt-2">
          {/* Full Name */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Họ và tên nhân sự <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: Trần Hữu Nam"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Địa chỉ Email đăng nhập <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="VD: nam.tran@racehorse.logistics"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Số điện thoại liên hệ</label>
            <input
              type="tel"
              placeholder="VD: 0901234568"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Vai trò đảm nhiệm (Assigned Role) <span className="text-red-500">*</span>
            </label>
            <select
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white font-medium text-slate-800"
            >
              <option value={5}>Vehicle Driver / Escort (Nhân sự vận hành hiện trường)</option>
              <option value={4}>Fleet & Route Coordinator (Điều phối viên đội xe & lộ trình)</option>
              <option value={3}>Transport Specialist (Chuyên viên kiểm dịch & hồ sơ)</option>
              <option value={2}>Logistics Manager (Quản lý vận hành Logistics)</option>
            </select>
          </div>

          {/* Specialization Selection (Only for Driver / Escort role 5) */}
          {Number(form.roleId) === 5 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2">
              <label className="font-bold text-slate-700 block text-xs uppercase tracking-wider">
                Chuyên môn hiện trường (Specialization) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, specialization: 'driver' })}
                  className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                    form.specialization === 'driver'
                      ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Truck size={14} className="text-emerald-600" /> Tài xế chuyên dụng
                  </span>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Lái xe tải nặng, phụ trách phương tiện & an toàn hành trình.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, specialization: 'escort' })}
                  className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                    form.specialization === 'escort'
                      ? 'border-fuchsia-600 bg-fuchsia-50/70 ring-2 ring-fuchsia-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold text-xs text-fuchsia-900 flex items-center gap-1.5">
                    <span>🩺</span> Bác sĩ thú y / Hộ tống
                  </span>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Theo dõi sức khỏe, kiểm tra sinh hiệu & y tế cho ngựa.
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Mật khẩu khởi tạo <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 italic">
              Mặc định: <strong>Password123</strong>. Nhân sự có thể dùng mật khẩu này để đăng nhập ngay sau khi tạo.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsProvisionOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin mr-1.5" /> Đang tạo tài khoản...
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} className="mr-1.5" /> Tạo tài khoản
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
