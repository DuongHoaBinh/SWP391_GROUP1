'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Clock,
  Phone,
  AlertCircle,
  Search,
  RefreshCw,
  Copy,
  Check,
  X,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

type StaffCategory =
  | 'Driver / Escort'
  | 'Equine Medical Escort'
  | 'Transport Specialist'
  | 'Fleet Coordinator';

interface StaffMember {
  id: string;
  name: string;
  role: StaffCategory;
  rawRole: string;
  email: string;
  phone: string;
  specialization: string | null;
  currentShift:
    | 'Morning (06:00 - 14:00)'
    | 'Afternoon (14:00 - 22:00)'
    | 'Night (22:00 - 06:00)'
    | 'Resting'
    | string;
  dutyStatus: 'ON_ROUTE' | 'ON_DUTY' | 'STANDBY' | 'RESTING' | 'OFF_DUTY';
  activeTripsCount: number;
  activeTrip: string | null;
  experienceYears: number;
}

function normalizeStaffCategory(rawRole: string, specialization?: string | null): StaffCategory {
  const r = String(rawRole || '').toLowerCase();
  const sp = String(specialization || '').toLowerCase();
  if (r.includes('specialist') || r.includes('kiểm dịch')) return 'Transport Specialist';
  if (r.includes('coordinator') || r.includes('điều phối') || r.includes('fleet')) return 'Fleet Coordinator';
  if (sp.includes('escort') || sp.includes('vet') || r.includes('medical') || r.includes('thú y') || r.includes('hộ tống')) {
    return 'Equine Medical Escort';
  }
  return 'Driver / Escort';
}

function roleIdFromCategory(cat: StaffCategory): 2 | 3 | 4 | 5 {
  if (cat === 'Transport Specialist') return 3;
  if (cat === 'Fleet Coordinator') return 4;
  return 5;
}

export default function ManagerStaffPage() {
  const { t, language, translateRole } = useLanguage();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Shift Assignment Modal (local schedule view state; preserved across language changes)
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [newShift, setNewShift] = useState<StaffMember['currentShift']>('Morning (06:00 - 14:00)');
  const [newStatus, setNewStatus] = useState<StaffMember['dutyStatus']>('ON_DUTY');
  const [newTrip, setNewTrip] = useState('');

  // Add Staff Modal (wired to POST /fleet/staff)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<StaffCategory>('Driver / Escort');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    roleLabel: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const resetAddForm = useCallback(() => {
    setAddName('');
    setAddRole('Driver / Escort');
    setAddEmail('');
    setAddPhone('');
    setAddPassword('');
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const backendStaff = await apiClient<any[]>('/fleet/staff');
      if (Array.isArray(backendStaff)) {
        const mapped: StaffMember[] = backendStaff.map((s, idx) => {
          const rawRole = String(s.roleName || s.role || 'DRIVER_ESCORT');
          const category = normalizeStaffCategory(rawRole, s.specialization);
          const activeCount = Number(s.activeTrips ?? 0);
          return {
            id: s.id ? String(s.id) : `usr-staff-${idx}`,
            name: s.fullName || s.name || `Staff #${s.id || idx + 1}`,
            role: category,
            rawRole,
            email: s.email || '',
            phone: s.phone || '',
            specialization: s.specialization || null,
            currentShift: s.currentShift || 'Morning (06:00 - 14:00)',
            dutyStatus: s.dutyStatus || (s.status === 'inactive' ? 'RESTING' : 'ON_DUTY'),
            activeTripsCount: activeCount,
            activeTrip: s.activeTrip || null,
            experienceYears: Number(s.experienceYears || 5),
          };
        });
        setStaffList(mapped);
      } else {
        setStaffList([]);
      }
    } catch (err: any) {
      console.warn('Backend staff load notice:', err);
      setLoadError(
        err?.message ||
          (language === 'en'
            ? 'Unable to load personnel roster from server.'
            : 'Không thể tải danh sách nhân sự từ máy chủ.'),
      );
    } finally {
      setLoading(false);
    }
  }, [language]);

  // Fetch once on mount only — never wipe local edits when user switches language
  const hasLoadedRef = React.useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void fetchStaff();
  }, [fetchStaff]);

  const openShiftModal = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setNewShift(staff.currentShift);
    setNewStatus(staff.dutyStatus);
    setNewTrip(staff.activeTrip || '');
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff || isSavingShift) return;

    const numericId = Number(selectedStaff.id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      toast.error(language === 'en' ? 'Invalid staff ID.' : 'Mã nhân sự không hợp lệ.');
      return;
    }

    setIsSavingShift(true);
    try {
      await apiClient(`/fleet/staff/${numericId}/shift`, {
        method: 'PATCH',
        body: JSON.stringify({
          currentShift: newShift,
          dutyStatus: newStatus,
        }),
      });

      setStaffList((prev) =>
        prev.map((s) =>
          s.id === selectedStaff.id
            ? {
                ...s,
                currentShift: newShift,
                dutyStatus: newStatus,
                activeTrip: newTrip.trim() || null,
              }
            : s,
        ),
      );

      toast.success(
        t('manager.staff.toastSaveSuccess', `Đã cập nhật ca trực và trạng thái cho ${selectedStaff.name}!`, {
          name: selectedStaff.name,
        }),
      );
      setIsShiftModalOpen(false);
    } catch (err: any) {
      toast.error(
        err?.message ||
          (language === 'en'
            ? 'Unable to save shift assignment.'
            : 'Không thể lưu thay đổi ca trực lên máy chủ.'),
      );
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleCloseAddModal = () => {
    if (isAddingStaff) return;
    resetAddForm();
    setIsAddOpen(false);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingStaff) return;
    const cleanName = addName.trim();
    const cleanEmail = addEmail.trim().toLowerCase();
    const cleanPassword = addPassword.trim();

    if (!cleanName || !cleanEmail) {
      toast.error(t('manager.staff.toastFillAll', 'Vui lòng điền đầy đủ họ tên và email nhân sự.'));
      return;
    }
    if (cleanPassword && cleanPassword.length < 8) {
      toast.error(
        language === 'en'
          ? 'Initial password must be at least 8 characters if provided.'
          : 'Mật khẩu khởi tạo phải tối thiểu 8 ký tự nếu nhập.',
      );
      return;
    }

    setIsAddingStaff(true);
    try {
      const roleId = roleIdFromCategory(addRole);
      const payload: Record<string, any> = {
        fullName: cleanName,
        email: cleanEmail,
        roleId,
      };
      if (addPhone.trim()) payload.phone = addPhone.trim();
      if (roleId === 5) {
        payload.specialization = addRole === 'Equine Medical Escort' ? 'escort' : 'driver';
      }
      if (cleanPassword) payload.password = cleanPassword;

      const created = await apiClient<any>('/fleet/staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const issuedPassword = created?.temporaryPassword || cleanPassword;
      if (issuedPassword) {
        setCreatedCredentials({
          name: cleanName,
          email: cleanEmail,
          password: issuedPassword,
          roleLabel: getRoleDisplayName(addRole),
        });
        setCopiedCreds(false);
      }

      if (roleFilter !== 'ALL' && roleFilter !== addRole) {
        setRoleFilter('ALL');
      }

      toast.success(
        t('manager.staff.toastAddSuccess', `Đã cấp tài khoản nhân sự cho ${cleanName}!`, {
          name: cleanName,
        }),
      );
      resetAddForm();
      setIsAddOpen(false);
      await fetchStaff();
    } catch (err: any) {
      toast.error(
        err?.message ||
          (language === 'en' ? 'Unable to provision staff account.' : 'Không thể tạo tài khoản nhân sự.'),
      );
    } finally {
      setIsAddingStaff(false);
    }
  };

  const getRoleDisplayName = (r: StaffCategory | string) => {
    switch (r) {
      case 'Driver / Escort':
        return t(
          'manager.staff.roleDriver',
          language === 'en' ? 'Specialized Truck Driver (Road)' : 'Tài xế xe chuyên dụng (Đường bộ)'
        );
      case 'Equine Medical Escort':
        return t(
          'manager.staff.roleEscort',
          language === 'en' ? 'Veterinary & Flight Escort (Road & Air)' : 'Bác sĩ thú y / Hộ tống (Đường bộ & Hàng không)'
        );
      case 'Transport Specialist':
        return t('manager.staff.roleSpecialist', 'Chuyên viên kiểm dịch');
      case 'Fleet Coordinator':
        return t('manager.staff.roleCoordinator', 'Điều phối viên đội xe');
      default:
        return translateRole(r);
    }
  };

  const getRoleOperationalScope = (r: StaffCategory | string) => {
    switch (r) {
      case 'Driver / Escort':
        return language === 'en'
          ? 'Road corridors & Airport transfer (Leg 1)'
          : 'Tuyến đường bộ & Xe trung chuyển ra sân bay';
      case 'Equine Medical Escort':
        return language === 'en'
          ? 'In-flight air cargo escort & Border clearance'
          : 'Áp tải khoang bay hàng không & Thông quan đích';
      case 'Transport Specialist':
        return language === 'en'
          ? 'Quarantine dossiers & CITES / customs permits'
          : 'Thẩm định hồ sơ kiểm dịch & cấp phép thông quan';
      case 'Fleet Coordinator':
        return language === 'en'
          ? 'Route building, fleet dispatch & live radar'
          : 'Thiết kế chặng, điều độ đội xe & giám sát hành trình';
      default:
        return '';
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q);
    const matchesRole = roleFilter === 'ALL' || s.role === roleFilter || s.rawRole === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roadDriversCount = staffList.filter((s) => s.role === 'Driver / Escort').length;
  const airMedicalEscortsCount = staffList.filter((s) => s.role === 'Equine Medical Escort').length;
  const onRouteCount = staffList.filter((s) => s.dutyStatus === 'ON_ROUTE').length;
  const onDutyCount = staffList.filter((s) => s.dutyStatus === 'ON_DUTY').length;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-14">
      {/* 1. EDITORIAL LIGHT HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-5 border-b border-[#E5DDD0]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#966516] m-0 mb-1.5">
            {t('manager.staff.badge', 'Quản Trị Đội Ngũ Nhân Sự & Hộ Tống')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#181A17] m-0">
            {language === 'en' ? (
              <>
                Personnel Roster & <span className="text-[#966516]">Shift Dispatch</span>
              </>
            ) : (
              <>
                Đội Ngũ Nhân Sự & <span className="text-[#966516]">Bảng Phân Ca Trực</span>
              </>
            )}
          </h1>
          <p className="text-sm text-[#5F6977] max-w-2xl mt-1.5 mb-0">
            {t(
              'manager.staff.subtitle',
              'Phân bổ lịch trực rõ ràng giữa Tài xế xe chuyên dụng (Đường bộ / Trung chuyển sân bay) và Bác sĩ thú y hộ tống (Khoang bay Hàng không & Thông quan).'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void fetchStaff()}
            disabled={loading}
            aria-label={t('common.refresh', 'Làm mới danh sách nhân sự')}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              resetAddForm();
              setIsAddOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D28] text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus size={15} className="text-[#D4C5A3]" aria-hidden="true" />
            <span>{t('manager.staff.addStaff', 'Thêm Nhân Sự Mới')}</span>
          </button>
        </div>
      </div>

      {/* 1.5 CLICKABLE ROLE FILTER KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setRoleFilter('ALL')}
          className={`text-left rounded-2xl p-4 sm:p-5 border shadow-sm transition-all cursor-pointer ${
            roleFilter === 'ALL' ? 'bg-[#FAF8F4] border-[#C4B38E]' : 'bg-white border-[#E5DDD0] hover:border-[#C4B38E]'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] block">
            {language === 'en' ? 'Total Operations Staff' : 'Tổng Nhân Sự Vận Hành'}
          </span>
          <span className="text-2xl sm:text-3xl font-black text-[#181A17] mt-1.5 block tabular-nums">
            {String(staffList.length).padStart(2, '0')}
          </span>
          <span className="text-xs text-[#287653] font-semibold mt-1 block">
            {onDutyCount} {t('manager.staff.onDutyStandby', 'đang trực sẵn sàng')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRoleFilter(roleFilter === 'Driver / Escort' ? 'ALL' : 'Driver / Escort')}
          className={`text-left rounded-2xl p-4 sm:p-5 border shadow-sm transition-all cursor-pointer ${
            roleFilter === 'Driver / Escort'
              ? 'bg-[#FAF8F4] border-[#C4B38E]'
              : 'bg-white border-[#E5DDD0] hover:border-[#C4B38E]'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#966516] block">
            {language === 'en' ? 'Road Truck Drivers' : 'Tài Xế Xe Chuyên Dụng (Đường Bộ)'}
          </span>
          <span className="text-2xl sm:text-3xl font-black text-[#181A17] mt-1.5 block tabular-nums">
            {String(roadDriversCount).padStart(2, '0')}
          </span>
          <span className="text-xs text-[#5F6977] font-medium mt-1 block">
            {language === 'en' ? 'Overland & airport transfer' : 'Lái xe đường bộ & trung chuyển sân bay'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRoleFilter(roleFilter === 'Equine Medical Escort' ? 'ALL' : 'Equine Medical Escort')}
          className={`text-left rounded-2xl p-4 sm:p-5 border shadow-sm transition-all cursor-pointer ${
            roleFilter === 'Equine Medical Escort'
              ? 'bg-[#E8F2EB] border-[#287653]'
              : 'bg-white border-[#E5DDD0] hover:border-[#B7DBC4]'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#287653] block">
            {language === 'en' ? 'Air & Vet Escorts' : 'Bác Sĩ Thú Y / Hộ Tống Bay'}
          </span>
          <span className="text-2xl sm:text-3xl font-black text-[#287653] mt-1.5 block tabular-nums">
            {String(airMedicalEscortsCount).padStart(2, '0')}
          </span>
          <span className="text-xs text-[#287653] font-semibold mt-1 block">
            {language === 'en' ? 'In-flight care & border handover' : 'Đi cùng chuyến bay & thông quan đích'}
          </span>
        </button>

        <div className="rounded-2xl p-4 sm:p-5 border border-[#E5DDD0] bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] block">
            {t('manager.staff.onRouteDrivers', 'Đang Làm Nhiệm Vụ Trên Tuyến')}
          </span>
          <span className="text-2xl sm:text-3xl font-black text-[#181A17] mt-1.5 block tabular-nums">
            {String(onRouteCount).padStart(2, '0')}
          </span>
          <span className="text-xs text-[#966516] font-semibold mt-1 block">
            {language === 'en' ? 'Active road & air shipments' : 'Đang phụ trách chuyến đường bộ / bay'}
          </span>
        </div>
      </div>

      {createdCredentials && (
        <div
          role="status"
          className="rounded-2xl border border-[#287653]/35 bg-[#E8F2EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#181A17] shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#287653] text-white flex items-center justify-center shrink-0">
              <KeyRound size={17} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#181A17] m-0">
                {language === 'en'
                  ? `Staff account provisioned: ${createdCredentials.name}`
                  : `Đã tạo tài khoản nhân sự: ${createdCredentials.name}`}
              </p>
              <p className="text-[11.5px] text-[#287653] font-semibold m-0 mt-0.5">
                {createdCredentials.roleLabel}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs bg-white/80 px-3 py-1.5 rounded-lg border border-[#B7DBC4]">
                <span>
                  Email: <strong>{createdCredentials.email}</strong>
                </span>
                <span>
                  {language === 'en' ? 'Initial Password:' : 'Mật khẩu khởi tạo:'}{' '}
                  <strong className="text-[#966516]">{createdCredentials.password}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => {
                const text = `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`;
                void navigator.clipboard?.writeText(text);
                setCopiedCreds(true);
                toast.success(language === 'en' ? 'Copied credentials!' : 'Đã sao chép tài khoản & mật khẩu!');
              }}
              className="px-3 py-1.5 rounded-lg bg-[#287653] hover:bg-[#1f5e42] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer border-0"
            >
              {copiedCreds ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedCreds ? (language === 'en' ? 'Copied' : 'Đã sao chép') : (language === 'en' ? 'Copy Login Info' : 'Sao chép thông tin')}</span>
            </button>
            <button
              type="button"
              aria-label={language === 'en' ? 'Dismiss' : 'Đóng thông báo'}
              onClick={() => setCreatedCredentials(null)}
              className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-[#5F6977] hover:text-[#181A17] border border-[#B7DBC4] cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchStaff()}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* 2. MAIN TABLE CONTAINER */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-[#E8E2D8] flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-[#FAF8F4]">
          <div>
            <h2 className="text-sm font-bold text-[#181A17] uppercase tracking-wider m-0">
              {t('manager.staff.tableTitle', 'Lịch Phân Ca & Phân Bổ Chuyến Đi')}
            </h2>
            <p className="text-xs text-[#5F6977] mt-0.5 mb-0">
              {t('manager.staff.tableSubtitle', 'Phân ca thời gian thực và quản lý chứng chỉ hành nghề vận tải')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center bg-white border border-[#D8CEBE] rounded-xl px-3 py-2 flex-1 sm:flex-initial sm:w-64">
              <Search size={15} className="text-[#5F6977] mr-2 shrink-0" aria-hidden="true" />
              <input
                type="text"
                aria-label={t('manager.staff.searchPlaceholder', 'Tìm nhân sự, email, số bằng lái')}
                placeholder={t('manager.staff.searchPlaceholder', 'Tìm nhân sự, số bằng lái...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-none outline-none text-xs w-full bg-transparent text-[#181A17] placeholder:text-[#5F6977]"
              />
            </div>

            <select
              aria-label={t('manager.staff.roleLabel', 'Lọc theo vị trí')}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-[#D8CEBE] text-[#181A17] text-xs font-bold rounded-xl px-3 py-2.5 outline-none cursor-pointer"
            >
              <option value="ALL">{t('manager.staff.allRoles', 'Tất Cả Vị Trí')}</option>
              <option value="Driver / Escort">
                {language === 'en' ? 'Specialized Truck Driver (Road)' : 'Tài xế xe chuyên dụng (Đường bộ)'}
              </option>
              <option value="Equine Medical Escort">
                {language === 'en' ? 'Veterinary & Flight Escort (Road & Air)' : 'Bác sĩ thú y / Hộ tống (Đường bộ & Hàng không)'}
              </option>
              <option value="Transport Specialist">{t('manager.staff.roleSpecialist', 'Chuyên viên kiểm dịch')}</option>
              <option value="Fleet Coordinator">{t('manager.staff.roleCoordinator', 'Điều phối viên đội xe')}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead>
              <tr className="bg-[#F0EEE8] border-b border-[#D8CEBE] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
                <th className="px-6 py-3.5">{t('manager.staff.colMember', 'Thành Viên Nhân Sự')}</th>
                <th className="px-6 py-3.5">{t('manager.staff.colRole', 'Vị Trí & Chứng Chỉ')}</th>
                <th className="px-6 py-3.5">{t('manager.staff.colShift', 'Ca Trực Phân Công')}</th>
                <th className="px-6 py-3.5">{t('manager.staff.colStatus', 'Trạng Thái Trực')}</th>
                <th className="px-6 py-3.5">{t('manager.staff.colActiveTrip', 'Chuyến Đi Đang Phụ Trách')}</th>
                <th className="px-6 py-3.5 text-right">{t('manager.staff.colActions', 'Thao Tác Phân Ca')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E2D8]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5F6977]">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2 text-[#A67C2E]" aria-hidden="true" />
                    {t('manager.staff.loading', 'Đang nạp danh sách nhân sự...')}
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#5F6977]">
                    <Users size={32} className="mx-auto mb-2 text-[#8892A0]" aria-hidden="true" />
                    <p className="font-bold text-[#181A17] m-0 text-sm">
                      {t('manager.staff.noStaffFound', 'Không tìm thấy thành viên nhân sự nào')}
                    </p>
                    <p className="text-xs text-[#5F6977] mt-1">
                      {t('manager.staff.noStaffDesc', 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc vị trí')}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-[#FAF8F4]/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#181A17] text-[#C4B38E] font-extrabold text-xs flex items-center justify-center shrink-0">
                          {staff.name
                            .split(' ')
                            .filter(Boolean)
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase() || 'ST'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-[#181A17] text-sm m-0">{staff.name}</p>
                          <p className="text-[11px] text-[#5F6977] flex items-center gap-1 m-0 mt-0.5">
                            <Phone className="w-3 h-3 text-[#8892A0] shrink-0" aria-hidden="true" />{' '}
                            <span>{staff.phone || staff.email || '—'}</span>
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="font-bold text-[#181A17] block">{getRoleDisplayName(staff.role)}</span>
                      {getRoleOperationalScope(staff.role) && (
                        <span className="text-[11px] text-[#966516] font-semibold block mt-0.5">
                          {getRoleOperationalScope(staff.role)}
                        </span>
                      )}
                      <span className="text-[11px] text-[#5F6977] font-mono">
                        {staff.email || '—'}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0EEE8] text-[#181A17] font-semibold text-[11px]">
                        <Clock className="w-3 h-3 text-[#5F6977]" aria-hidden="true" />
                        {staff.currentShift === 'Morning (06:00 - 14:00)' &&
                          t('manager.staff.shiftMorning', 'Ca Sáng (06:00 - 14:00)')}
                        {staff.currentShift === 'Afternoon (14:00 - 22:00)' &&
                          t('manager.staff.shiftAfternoon', 'Ca Chiều (14:00 - 22:00)')}
                        {staff.currentShift === 'Night (22:00 - 06:00)' &&
                          t('manager.staff.shiftNight', 'Ca Đêm (22:00 - 06:00)')}
                        {staff.currentShift === 'Resting' &&
                          t('manager.staff.shiftResting', 'Nghỉ Hồi Sức')}
                        {![
                          'Morning (06:00 - 14:00)',
                          'Afternoon (14:00 - 22:00)',
                          'Night (22:00 - 06:00)',
                          'Resting',
                        ].includes(staff.currentShift) && staff.currentShift}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {staff.dutyStatus === 'ON_ROUTE' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]/50">
                          <span className="w-2 h-2 rounded-full bg-[#A67C2E]" aria-hidden="true" />{' '}
                          {t('manager.staff.statusOnRoute', 'Đang trên tuyến')}
                        </span>
                      )}
                      {staff.dutyStatus === 'ON_DUTY' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#287653] border border-[#287653]/30">
                          <span className="w-2 h-2 rounded-full bg-[#287653]" aria-hidden="true" />{' '}
                          {t('manager.staff.statusOnDuty', 'Trực sẵn sàng')}
                        </span>
                      )}
                      {staff.dutyStatus === 'STANDBY' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#A67C2E] border border-[#A67C2E]/30">
                          <span className="w-2 h-2 rounded-full bg-[#A67C2E]" aria-hidden="true" />{' '}
                          {t('manager.staff.statusStandbyBadge', language === 'en' ? 'Standby Reserve' : 'Dự bị (Standby)')}
                        </span>
                      )}
                      {staff.dutyStatus === 'RESTING' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#F8F0DF] text-[#966516] border border-[#966516]/30">
                          <Clock className="w-3 h-3 text-[#966516]" aria-hidden="true" />{' '}
                          {t('manager.staff.statusResting', 'Nghỉ ngơi')}
                        </span>
                      )}
                      {staff.dutyStatus === 'OFF_DUTY' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#F0EEE8] text-[#5F6977]">
                          {t('manager.staff.statusOffDuty', 'Hết ca trực')}
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {staff.activeTrip ? (
                        <span className="font-mono font-bold text-[#A67C2E] bg-[#FAF8F4] px-2 py-0.5 rounded border border-[#D4C5A3]">
                          {staff.activeTrip}
                        </span>
                      ) : staff.activeTripsCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-[#966516] bg-[#F8F0DF] px-2.5 py-1 rounded-lg border border-[#DFCA9A]">
                          {staff.activeTripsCount}{' '}
                          {language === 'en'
                            ? staff.activeTripsCount > 1
                              ? 'active trips'
                              : 'active trip'
                            : 'chuyến đang phụ trách'}
                        </span>
                      ) : (
                        <span className="text-[#5F6977] font-medium">— {t('manager.staff.standbyReady', 'Sẵn sàng')} —</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openShiftModal(staff)}
                        className="px-3.5 py-1.5 bg-white border border-[#D8CEBE] hover:border-[#A67C2E] text-[#181A17] hover:text-[#A67C2E] font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
                      >
                        {t('manager.staff.assignShiftBtn', 'Phân Ca Trực')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Shift Assignment */}
      {isShiftModalOpen && selectedStaff && (
        <Modal
          isOpen={isShiftModalOpen}
          onClose={() => setIsShiftModalOpen(false)}
          title={t('manager.staff.modalShiftTitle', `Phân bổ ca trực: ${selectedStaff.name}`, { name: selectedStaff.name })}
          subtitle={t('manager.staff.modalShiftSubtitle', `Điều phối lịch làm việc & gán chuyến đi cho ${getRoleDisplayName(selectedStaff.role)}`, {
            role: getRoleDisplayName(selectedStaff.role),
          })}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleSaveShift} className="flex flex-col gap-4 text-sm">
            <div>
              <label htmlFor="staff-shift-select" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                {t('manager.staff.workShiftLabel', 'Ca làm việc')}
              </label>
              <select
                id="staff-shift-select"
                value={newShift}
                onChange={(e) => setNewShift(e.target.value as any)}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm font-semibold outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] cursor-pointer"
              >
                <option value="Morning (06:00 - 14:00)">{t('manager.staff.shiftMorning', 'Ca Sáng (06:00 - 14:00)')}</option>
                <option value="Afternoon (14:00 - 22:00)">{t('manager.staff.shiftAfternoon', 'Ca Chiều (14:00 - 22:00)')}</option>
                <option value="Night (22:00 - 06:00)">{t('manager.staff.shiftNight', 'Ca Đêm (22:00 - 06:00)')}</option>
                <option value="Ca Hành Chính (08:00 - 17:00)">{language === 'en' ? 'Office Shift (08:00 - 17:00)' : 'Ca Hành Chính (08:00 - 17:00)'}</option>
                <option value="Resting">{t('manager.staff.shiftRestingOption', 'Nghỉ Hồi Sức Luân Phiên')}</option>
              </select>
            </div>

            <div>
              <span className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                {t('manager.staff.dutyStatusLabel', 'Trạng thái hoạt động')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'ON_DUTY', label: t('manager.staff.statusStandbyOption', 'Trực sẵn sàng'), color: 'border-[#287653] bg-[#E8F2EB] text-[#287653]' },
                  { key: 'STANDBY', label: t('manager.staff.statusReserveOption', language === 'en' ? 'Standby Reserve' : 'Dự bị (Standby)'), color: 'border-[#A67C2E] bg-[#FAF5EB] text-[#8C6621]' },
                  { key: 'ON_ROUTE', label: t('manager.staff.statusDrivingOption', 'Đang trên tuyến'), color: 'border-[#A67C2E] bg-[#FAF8F4] text-[#8C6621]' },
                  { key: 'RESTING', label: t('manager.staff.statusRestingOption', 'Nghỉ hồi sức'), color: 'border-[#966516] bg-[#F8F0DF] text-[#966516]' },
                  { key: 'OFF_DUTY', label: t('manager.staff.statusOffDutyOption', 'Hết ca'), color: 'border-[#8892A0] bg-[#F0EEE8] text-[#181A17]' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    aria-pressed={newStatus === st.key}
                    onClick={() => setNewStatus(st.key as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
                      newStatus === st.key ? st.color : 'border-[#D8CEBE] text-[#5F6977] bg-white hover:bg-[#FAF8F4]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="staff-trip-code" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                {t('manager.staff.tripAssignLabel', 'Gán Chuyến Đi Hiện Tại')}
              </label>
              <input
                id="staff-trip-code"
                type="text"
                value={newTrip}
                onChange={(e) => setNewTrip(e.target.value)}
                placeholder={t('manager.staff.tripPlaceholder', 'VD: REQ-2026-001 hoặc để trống nếu chưa gán')}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm font-mono outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 mt-3 pt-3 border-t border-[#E8E2D8]">
              <Button type="button" variant="outline" disabled={isSavingShift} onClick={() => setIsShiftModalOpen(false)} className="rounded-xl">
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button type="submit" variant="primary" disabled={isSavingShift} className="rounded-xl">
                {isSavingShift ? (language === 'en' ? 'Saving...' : 'Đang lưu...') : t('manager.staff.btnSaveShift', 'Lưu Ca Trực')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Provision Staff via POST /fleet/staff */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={handleCloseAddModal}
          closeDisabled={isAddingStaff}
          title={t('manager.staff.modalAddTitle', 'Thêm Nhân sự & Cấp Chứng chỉ Vận hành')}
          subtitle={t('manager.staff.modalAddSubtitle', 'Đăng ký tài xế chuyên dụng, hộ tống thú y hoặc điều phối viên mới')}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleAddStaff} className="flex flex-col gap-4 text-sm">
            <div>
              <label htmlFor="add-staff-name" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                {t('manager.staff.fullNameLabel', 'Họ và Tên Nhân viên *')}
              </label>
              <input
                id="add-staff-name"
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t('manager.staff.fullNamePlaceholder', 'VD: Nguyễn Thành Nam')}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] font-semibold"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-staff-role" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                  {t('manager.staff.roleLabel', 'Vị trí Chuyên môn *')}
                </label>
                <select
                  id="add-staff-role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as any)}
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-xs font-bold outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] cursor-pointer"
                >
                  <option value="Driver / Escort">
                    {language === 'en' ? 'Specialized Truck Driver (Road)' : 'Tài xế xe chuyên dụng (Đường bộ)'}
                  </option>
                  <option value="Equine Medical Escort">
                    {language === 'en' ? 'Veterinary & Flight Escort (Road & Air)' : 'Bác sĩ thú y / Hộ tống (Đường bộ & Bay)'}
                  </option>
                  <option value="Fleet Coordinator">{t('manager.staff.optRoleCoordinator', 'Điều phối viên đội xe')}</option>
                  <option value="Transport Specialist">{t('manager.staff.optRoleSpecialist', 'Chuyên viên kiểm dịch & pháp lý')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="add-staff-phone" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                  {t('manager.staff.phoneLabel', 'Số điện thoại')}
                </label>
                <input
                  id="add-staff-phone"
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-xs outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E] font-mono"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#EAE5DA] bg-[#FAF8F4] px-3.5 py-2.5 text-xs text-[#5C6658]">
              <span className="font-bold text-[#966516]">
                {language === 'en' ? 'Operational Scope:' : 'Phạm vi nhiệm vụ:'}{' '}
              </span>
              <span className="font-medium text-[#181A17]">{getRoleOperationalScope(addRole)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-staff-email" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                  {t('manager.staff.emailLabel', 'Email đăng nhập *')}
                </label>
                <input
                  id="add-staff-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="nhanvien@example.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E]"
                  required
                />
              </div>

              <div>
                <label htmlFor="add-staff-password" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                  {language === 'en' ? 'Initial Password (Optional)' : 'Mật khẩu khởi tạo (Tùy chọn)'}
                </label>
                <input
                  id="add-staff-password"
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder={language === 'en' ? '8+ chars or auto-generated' : 'Bỏ trống = Hệ thống tự sinh'}
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm outline-none focus:ring-2 focus:ring-[#A67C2E]/20 focus:border-[#A67C2E]"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 mt-3 pt-3 border-t border-[#E8E2D8]">
              <Button type="button" variant="outline" disabled={isAddingStaff} onClick={handleCloseAddModal} className="rounded-xl">
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button type="submit" variant="primary" disabled={isAddingStaff} className="rounded-xl">
                {isAddingStaff ? t('common.saving', 'Đang tạo...') : t('manager.staff.btnAddStaffSubmit', 'Thêm Nhân sự')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
