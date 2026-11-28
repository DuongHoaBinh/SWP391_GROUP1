'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  CheckCircle2,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';
import { useFleetRouteStore, Vehicle } from '@/lib/fleet-route-store';
import { apiClient } from '@/lib/api-client';
import { DepotOption, VehicleClassOption, MODE_TO_VEHICLE_TYPE } from '@/features/fleet/fleet-catalog';

type CanonicalVehicleType = 'truck' | 'aircraft_stall' | 'container';
type CanonicalVehicleStatus = 'available' | 'in_use' | 'maintenance';

const toCanonicalVehicleType = (raw?: string): CanonicalVehicleType => {
  const val = String(raw || '').toLowerCase();
  if (val === 'aircraft_stall' || val.includes('air cargo') || val.includes('chuồng bay') || val.includes('máy bay')) {
    return 'aircraft_stall';
  }
  if (val === 'container' || val.includes('container')) {
    return 'container';
  }
  return 'truck';
};

const normalizeFleetStatus = (raw?: string): CanonicalVehicleStatus => {
  const s = String(raw || '').toLowerCase();
  if (s === 'in_use' || s === 'in_transit') return 'in_use';
  if (s === 'maintenance') return 'maintenance';
  return 'available';
};

export default function VehicleManagementPage() {
  const { t, language, translateStatus, translateVehicleType } = useLanguage();
  const { vehicles, isLoaded, addVehicle, updateVehicle, deleteVehicle, refreshVehicles } = useFleetRouteStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | CanonicalVehicleType>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Step 3: danh mục loại phương tiện + trạm xe
  const [vehicleClasses, setVehicleClasses] = useState<VehicleClassOption[]>([]);
  const [depots, setDepots] = useState<DepotOption[]>([]);
  const [filterDepot, setFilterDepot] = useState<string>('ALL');

  useEffect(() => {
    apiClient<VehicleClassOption[]>('/fleet/vehicle-classes').then(setVehicleClasses).catch(() => setVehicleClasses([]));
    apiClient<DepotOption[]>('/fleet/depots').then(setDepots).catch(() => setDepots([]));
  }, []);

  // Form State (store capacityInput as string so users can clear & retype cleanly)
  const [formData, setFormData] = useState<{
    code: string;
    type: CanonicalVehicleType;
    classCode: string;
    depotId: string;
    capacityInput: string;
    status: CanonicalVehicleStatus;
    location: string;
  }>({
    code: '',
    type: 'truck',
    classCode: 'truck_4',
    depotId: '',
    capacityInput: '4',
    status: 'available',
    location: '',
  });

  const selectedClass = useMemo(
    () => vehicleClasses.find((c) => c.code === formData.classCode),
    [vehicleClasses, formData.classCode],
  );
  const needsCapacityInput = !selectedClass || selectedClass.horseCapacity === null;
  const needsDepot = !selectedClass || selectedClass.mode === 'road';
  const className = (c: VehicleClassOption) => (language === 'en' ? c.nameEn : c.nameVi);
  const activeDepots = depots.filter((d) => d.isActive);

  const onClassChange = (code: string) => {
    const cls = vehicleClasses.find((c) => c.code === code);
    setFormData((prev) => ({
      ...prev,
      classCode: code,
      type: cls ? MODE_TO_VEHICLE_TYPE[cls.mode] : prev.type,
      capacityInput: cls?.horseCapacity != null ? String(cls.horseCapacity) : prev.capacityInput,
    }));
  };

  const classAndDepotFields = (prefix: string) => (
    <>
      <div>
        <label htmlFor={`${prefix}-veh-class`} className="text-xs font-bold text-slate-700 block mb-1.5">
          {t('fleet.vehicleClassLabel', language === 'en' ? 'Vehicle class *' : 'Loại phương tiện *')}
        </label>
        <select
          id={`${prefix}-veh-class`}
          value={formData.classCode}
          onChange={(e) => onClassChange(e.target.value)}
          className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/20 bg-white font-medium text-slate-800 transition-all cursor-pointer"
        >
          {(['road', 'air', 'sea'] as const).map((mode) => (
            <optgroup key={mode} label={mode === 'road' ? (language === 'en' ? 'Road' : 'Đường bộ') : mode === 'air' ? (language === 'en' ? 'Air' : 'Hàng không') : (language === 'en' ? 'Sea' : 'Đường thủy')}>
              {vehicleClasses.filter((c) => c.mode === mode).map((c) => (
                <option key={c.code} value={c.code}>
                  {className(c)}
                  {c.horseCapacity != null ? ` · ${c.horseCapacity} ${language === 'en' ? 'horses' : 'ngựa'}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedClass && (
          <p className="text-[11px] text-slate-500 mt-1 m-0">
            {selectedClass.horseCapacity != null
              ? language === 'en'
                ? `Capacity is fixed by class: ${selectedClass.horseCapacity} horses.`
                : `Sức chứa theo loại: ${selectedClass.horseCapacity} ngựa.`
              : language === 'en'
                ? 'Capacity is variable; enter it below.'
                : 'Sức chứa tùy phương tiện; nhập ở ô bên dưới.'}
            {selectedClass.isHeavyTruck ? (language === 'en' ? ' Heavy truck: city time windows apply.' : ' Xe tải nặng: bị giới hạn giờ chạy trong đô thị.') : ''}
          </p>
        )}
      </div>
      {needsDepot && (
        <div>
          <label htmlFor={`${prefix}-veh-depot`} className="text-xs font-bold text-slate-700 block mb-1.5">
            {t('fleet.depotLabel', language === 'en' ? 'Home depot *' : 'Trạm xe *')}
          </label>
          <select
            id={`${prefix}-veh-depot`}
            value={formData.depotId}
            onChange={(e) => setFormData({ ...formData, depotId: e.target.value })}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/20 bg-white font-medium text-slate-800 transition-all cursor-pointer"
          >
            <option value="">{language === 'en' ? '— Choose depot —' : '— Chọn trạm —'}</option>
            {activeDepots.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name} ({d.city}, {d.country}){d.type === 'partner' ? (language === 'en' ? ' · partner' : ' · đối tác') : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {needsCapacityInput && (
        <div>
          <label htmlFor={`${prefix}-veh-cap`} className="text-xs font-bold text-slate-700 block mb-1.5">
            {t('fleet.stallCapacityLabel', 'Sức chứa buồng (ngựa)')}
          </label>
          <input
            id={`${prefix}-veh-cap`}
            type="number"
            min={1}
            max={24}
            value={formData.capacityInput}
            onChange={(e) => setFormData({ ...formData, capacityInput: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 text-slate-800 transition-all"
          />
        </div>
      )}
    </>
  );

  const handleSyncDatabase = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await refreshVehicles();
      toast.success(t('fleet.syncDbSuccess', 'Đã làm mới dữ liệu phương tiện từ Database!'));
    } catch (err: any) {
      const msg =
        err?.message ||
        t('fleet.syncDbError', language === 'en' ? 'Unable to sync fleet vehicles.' : 'Không thể đồng bộ dữ liệu đội xe.');
      setSyncError(msg);
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      type: 'truck',
      classCode: 'truck_4',
      depotId: '',
      capacityInput: '4',
      status: 'available',
      location: '',
    });
  };

  const depotRequiredOrToast = (): boolean => {
    if (needsDepot && !formData.depotId) {
      toast.error(language === 'en' ? 'Road vehicles must belong to a depot.' : 'Xe đường bộ phải thuộc một trạm xe.');
      return false;
    }
    return true;
  };

  const closeAddModal = () => {
    if (isSubmitting) return;
    setIsAddOpen(false);
    resetForm();
  };

  const closeEditModal = () => {
    if (isSubmitting) return;
    setIsEditOpen(false);
    setSelectedVehicle(null);
    resetForm();
  };

  const closeDeleteModal = () => {
    if (isSubmitting) return;
    setIsDeleteOpen(false);
    setSelectedVehicle(null);
  };

  const parseCapacityOrToast = (): number | null => {
    const parsed = parseInt(formData.capacityInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24) {
      toast.error(
        language === 'en'
          ? 'Please enter a valid stall capacity between 1 and 24.'
          : 'Vui lòng nhập sức chứa buồng hợp lệ từ 1 đến 24.'
      );
      return null;
    }
    return parsed;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.code?.trim()) {
      toast.error(t('fleet.errPlateRequired', 'Vui lòng nhập biển số xe / mã thiết bị.'));
      return;
    }
    const capacity = parseCapacityOrToast();
    if (capacity === null || !depotRequiredOrToast()) return;

    setIsSubmitting(true);
    try {
      const created = await addVehicle({
        code: formData.code.trim().toUpperCase(),
        type: toCanonicalVehicleType(formData.type),
        vehicleClassCode: formData.classCode || null,
        depotId: needsDepot && formData.depotId ? Number(formData.depotId) : null,
        capacity,
        status: formData.status,
        lastInspection: new Date().toISOString().split('T')[0],
        location: formData.location?.trim() || 'HCMC Central Depot',
      });
      toast.success(t('fleet.vehicleCreatedSuccess', 'Phương tiện {code} đã được lưu vào hệ thống!', { code: created.code }));
      setIsAddOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || t('fleet.errSaveVehicle', 'Không thể lưu phương tiện'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || isSubmitting) return;
    const capacity = parseCapacityOrToast();
    if (capacity === null || !depotRequiredOrToast()) return;

    setIsSubmitting(true);
    try {
      await updateVehicle(selectedVehicle.id, {
        code: formData.code.trim().toUpperCase() || selectedVehicle.code,
        type: toCanonicalVehicleType(formData.type),
        vehicleClassCode: formData.classCode || null,
        depotId: needsDepot && formData.depotId ? Number(formData.depotId) : null,
        capacity,
        status: formData.status,
        location: formData.location.trim(),
      });
      toast.success(t('fleet.vehicleUpdatedSuccess', 'Phương tiện {code} đã được cập nhật!', { code: formData.code || selectedVehicle.code }));
      setIsEditOpen(false);
      setSelectedVehicle(null);
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || t('fleet.errUpdateVehicle', 'Không thể cập nhật phương tiện'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedVehicle || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await deleteVehicle(selectedVehicle.id);
      toast.success(t('fleet.vehicleDeletedSuccess', 'Đã xóa phương tiện {code} khỏi danh mục.', { code: selectedVehicle.code }));
      setIsDeleteOpen(false);
      setSelectedVehicle(null);
    } catch (err: any) {
      toast.error(err?.message || t('fleet.errDeleteVehicle', 'Không thể xóa phương tiện'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      v.code.toLowerCase().includes(q) ||
      (v.location || '').toLowerCase().includes(q);
    const matchesType = filterType === 'ALL' || toCanonicalVehicleType(v.type) === filterType;
    const matchesDepot = filterDepot === 'ALL' || String(v.depotId ?? '') === filterDepot;
    return matchesSearch && matchesType && matchesDepot;
  });

  const availableCount = vehicles.filter((v) => normalizeFleetStatus(v.status) === 'available').length;
  const isVehicleInTransit = (v: Vehicle) => {
    const s = normalizeFleetStatus(v.status);
    if (s !== 'in_use') return false;
    const isReservedOnly = Boolean((v as any).isReservedOnly);
    const shipStatus = String((v as any).assignedShipmentStatus || '').toLowerCase();
    if (shipStatus) return shipStatus === 'in_transit' || shipStatus === 'return_pending';
    return !isReservedOnly;
  };
  const inUseCount = vehicles.filter(isVehicleInTransit).length;
  const reservedCount = vehicles.filter(
    (v) => normalizeFleetStatus(v.status) === 'in_use' && !isVehicleInTransit(v),
  ).length;
  const maintenanceCount = vehicles.filter((v) => normalizeFleetStatus(v.status) === 'maintenance').length;
  const hasActiveFilter = Boolean(searchTerm.trim()) || filterType !== 'ALL' || filterDepot !== 'ALL';

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {t('fleet.pageTitle', 'Quản Lý Đội Xe')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSyncing}
            onClick={() => void handleSyncDatabase()}
            className="shadow-sm border-[#D8CEBE] hover:bg-slate-50"
          >
            {isSyncing ? (
              <RefreshCw size={16} className="mr-1.5 animate-spin text-[#A67C2E]" />
            ) : (
              <ShieldCheck size={16} className="mr-1.5 text-emerald-600" />
            )}
            <span>
              {isSyncing
                ? t('common.syncing', language === 'en' ? 'Refreshing...' : 'Đang làm mới...')
                : t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}
            </span>
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="shadow-sm bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]"
          >
            <Plus size={18} className="mr-1.5" />
            <span>{t('fleet.addVehicleBtn', 'Thêm Phương Tiện Mới')}</span>
          </Button>
        </div>
      </div>

      {syncError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => void handleSyncDatabase()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 font-bold hover:bg-red-100 cursor-pointer"
          >
            <RotateCcw size={13} /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#D8CEBE]/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">
              {t('fleet.statusAvailable', 'Sẵn Sàng / Khả Dụng')}
            </p>
            <h2 className="text-2xl font-extrabold text-emerald-600 mt-1 m-0">
              {t('fleet.vehiclesUnit', '{count} Phương tiện', { count: availableCount })}
            </h2>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#D8CEBE]/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">
              {t('fleet.statusInUse', 'Đang Di Chuyển Tuyến')}
            </p>
            <h2 className="text-2xl font-extrabold text-[#966516] mt-1 m-0">
              {t('fleet.vehiclesUnit', '{count} Phương tiện', { count: inUseCount })}
            </h2>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FAF8F4] text-[#A67C2E] flex items-center justify-center">
            <Truck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#D8CEBE]/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">
              {language === 'en' ? 'Reserved for Orders' : 'Đang Giữ Chỗ'}
            </p>
            <h2 className="text-2xl font-extrabold text-sky-700 mt-1 m-0">
              {t('fleet.vehiclesUnit', '{count} Phương tiện', { count: reservedCount })}
            </h2>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#D8CEBE]/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">
              {t('fleet.statusMaintenance', 'Đang Bảo Trì / Kiểm Định')}
            </p>
            <h2 className="text-2xl font-extrabold text-amber-600 mt-1 m-0">
              {t('fleet.vehiclesUnit', '{count} Phương tiện', { count: maintenanceCount })}
            </h2>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Wrench size={24} />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE]/70 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-slate-50/70">
          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-xl px-3.5 h-11 w-full sm:w-80 shadow-sm focus-within:border-[#181A17] focus-within:ring-2 focus-within:ring-[#181A17]/10 transition-all">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              aria-label={t('fleet.searchPlaceholder', 'Tìm theo biển số, vị trí depot...')}
              placeholder={t('fleet.searchPlaceholder', 'Tìm theo biển số, vị trí depot...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <Filter size={16} className="text-slate-500 shrink-0 hidden sm:block" />
            <select
              aria-label={t('fleet.vehicleTypeLabel', 'Lọc theo loại phương tiện')}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="flex-1 sm:flex-none px-3.5 h-11 border border-[#D8CEBE] rounded-xl text-sm bg-white font-medium text-slate-700 outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/20 transition-all cursor-pointer"
            >
              <option value="ALL">{t('fleet.allTypes', 'Tất cả loại phương tiện')}</option>
              <option value="truck">{translateVehicleType('truck')}</option>
              <option value="container">{translateVehicleType('container')}</option>
              <option value="aircraft_stall">{translateVehicleType('aircraft_stall')}</option>
            </select>
            <select
              aria-label={language === 'en' ? 'Filter by depot' : 'Lọc theo trạm'}
              value={filterDepot}
              onChange={(e) => setFilterDepot(e.target.value)}
              className="flex-1 sm:flex-none px-3.5 h-11 border border-[#D8CEBE] rounded-xl text-sm bg-white font-medium text-slate-700 outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/20 transition-all cursor-pointer"
            >
              <option value="ALL">{language === 'en' ? 'All depots' : 'Tất cả trạm'}</option>
              {depots.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('ALL');
                  setFilterDepot('ALL');
                }}
                className="text-xs font-semibold text-slate-600 hover:text-[#966516] px-2.5 py-2 rounded-lg hover:bg-white border border-transparent hover:border-[#D8CEBE] transition-colors cursor-pointer"
              >
                {t('common.clearFilters', language === 'en' ? 'Clear filters' : 'Xóa bộ lọc')}
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-2.5 whitespace-nowrap">{t('coordinator.vehicles.plate', 'Mã xe')}</th>
                <th className="py-3 px-2.5 whitespace-nowrap">{t('coordinator.vehicles.type', 'Loại phương tiện')}</th>
                <th className="py-3 px-2.5 whitespace-nowrap">{t('coordinator.vehicles.capacity', 'Sức chứa')}</th>
                <th className="py-3 px-2.5 whitespace-nowrap">{language === 'en' ? 'Depot & Location' : 'Trạm xe & Vị trí'}</th>
                <th className="py-3 px-2.5 whitespace-nowrap">{t('common.status', 'Trạng thái')}</th>
                <th className="py-3 px-2.5 text-right whitespace-nowrap">{t('common.actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!isLoaded ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#181A17] border-t-transparent mb-2" />
                    <div className="text-xs font-medium">
                      {t('fleet.loadingVehicles', language === 'en' ? 'Loading fleet vehicles...' : 'Đang tải danh sách đội xe chuyên dụng...')}
                    </div>
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-slate-500">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <Truck size={28} />
                      </div>
                      <p className="font-bold text-slate-700 m-0">
                        {t('fleet.noVehiclesFound', 'Không tìm thấy phương tiện nào')}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 m-0">
                        {hasActiveFilter
                          ? t('fleet.noVehiclesMatchSearch', 'Không có phương tiện nào khớp với từ khóa hoặc bộ lọc đã chọn.')
                          : t('fleet.noVehiclesRegistered', 'Chưa có phương tiện nào trong danh mục.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v) => {
                  const normStatus = normalizeFleetStatus(v.status);
                  const shipStatus = String((v as any).assignedShipmentStatus || '').toLowerCase();
                  const isActiveOnRoad = shipStatus === 'in_transit' || shipStatus === 'return_pending';
                  const isReservedHold =
                    normStatus === 'in_use' &&
                    !isActiveOnRoad &&
                    (Boolean((v as any).isReservedOnly) || /active:\s*req-/i.test(String(v.location || '')));
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-2.5 font-bold text-slate-900 whitespace-nowrap text-[13px]">{v.code}</td>
                      <td className="py-3 px-2.5 text-slate-700 font-medium text-xs max-w-[190px]">
                        <span className="line-clamp-2">
                          {(language === 'en' && (v as any).vehicleClassNameEn)
                            ? (v as any).vehicleClassNameEn
                            : (v.vehicleClassName || translateVehicleType(v.type))}
                        </span>
                        {v.isHeavyTruck && (
                          <span className="mt-0.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {language === 'en' ? 'Heavy' : 'Tải nặng'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2.5 text-slate-700 font-semibold text-xs whitespace-nowrap">
                        {v.capacity} {language === 'en' ? (v.capacity === 1 ? 'stall' : 'stalls') : 'ô chuồng'}
                      </td>
                      <td className="py-3 px-2.5 text-xs max-w-[200px]">
                        <div className="font-semibold text-slate-800 truncate" title={v.depotName || ''}>
                          {v.depotName || '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5" title={v.location || ''}>
                          {v.location || t('coordinator.depot', 'Depot')}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <StatusBadge
                          label={
                            isReservedHold
                              ? language === 'en'
                                ? 'Reserved'
                                : 'Đang giữ chỗ'
                              : translateStatus(normStatus)
                          }
                          variant={normStatus === 'available' ? 'success' : normStatus === 'in_use' ? 'transit' : 'pending'}
                          hasDot
                        />
                      </td>
                      <td className="py-3 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVehicle(v);
                              setFormData({
                                code: v.code,
                                type: toCanonicalVehicleType(v.type),
                                classCode: v.vehicleClassCode || 'truck_4',
                                depotId: v.depotId ? String(v.depotId) : '',
                                capacityInput: String(v.capacity ?? 4),
                                status: normalizeFleetStatus(v.status),
                                location: v.location || '',
                              });
                              setIsEditOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-[#181A17] rounded-lg hover:bg-[#FAF8F4] transition-colors cursor-pointer"
                            title={t('fleet.editVehicleTooltip', 'Chỉnh sửa phương tiện')}
                            aria-label={`${t('fleet.editVehicleTooltip', 'Chỉnh sửa phương tiện')} ${v.code}`}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVehicle(v);
                              setIsDeleteOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                            title={t('fleet.deleteVehicleTooltip', 'Xóa phương tiện')}
                            aria-label={`${t('fleet.deleteVehicleTooltip', 'Xóa phương tiện')} ${v.code}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Vehicle */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={closeAddModal}
          closeDisabled={isSubmitting}
          title={t('fleet.registerVehicleTitle', 'Đăng ký phương tiện mới')}
          subtitle={t('fleet.registerVehicleSubtitle', 'Thêm phương tiện vận tải chuyên dụng đạt chuẩn quốc tế.')}
          maxWidth="550px"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label htmlFor="add-veh-code" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t('fleet.licensePlateLabel', 'Biển số xe / Mã phương tiện *')}
              </label>
              <input
                id="add-veh-code"
                type="text"
                placeholder={t('fleet.licensePlatePlaceholder', 'Ví dụ: 51C-888.99 hoặc TRK-VN-202')}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 uppercase font-semibold text-slate-800 transition-all"
                required
              />
            </div>
            {classAndDepotFields('add')}
            <div>
              <label htmlFor="add-veh-status" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t('fleet.initialStatus', 'Trạng thái ban đầu')}
              </label>
              <select
                id="add-veh-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as CanonicalVehicleStatus })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 bg-white font-medium text-slate-800 transition-all cursor-pointer"
              >
                <option value="available">{translateStatus('available')}</option>
                <option value="maintenance">{translateStatus('maintenance')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="add-veh-loc" className="text-xs font-bold text-slate-700 block mb-1.5">
                {language === 'en' ? 'Current location (free text)' : 'Vị trí hiện tại (ghi chú)'}
              </label>
              <input
                id="add-veh-loc"
                type="text"
                placeholder={t('fleet.depotPlaceholder', 'Ví dụ: HCMC Central Depot, Tan Son Nhat Hub...')}
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 text-slate-800 transition-all"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-4 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeAddModal}>
                {t('common.cancel', 'Hủy')}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} className="bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]">
                {isSubmitting ? t('common.saving', 'Đang lưu...') : t('fleet.registerVehicleBtn', 'Đăng ký phương tiện')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Edit Vehicle */}
      {isEditOpen && selectedVehicle && (
        <Modal
          isOpen={isEditOpen}
          onClose={closeEditModal}
          closeDisabled={isSubmitting}
          title={t('fleet.editVehicleTitle', 'Chỉnh sửa phương tiện: {code}', { code: selectedVehicle.code })}
          subtitle={t('fleet.editVehicleSubtitle', 'Cập nhật loại xe, sức chứa hoặc vị trí phân bổ depot.')}
          maxWidth="550px"
        >
          <form onSubmit={handleEdit} className="flex flex-col gap-4">
            {classAndDepotFields('edit')}
            <div>
              <label htmlFor="edit-veh-status" className="text-xs font-bold text-slate-700 block mb-1.5">
                {t('fleet.operationalStatus', 'Trạng thái hoạt động')}
              </label>
              <select
                id="edit-veh-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as CanonicalVehicleStatus })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 bg-white font-medium text-slate-800 transition-all cursor-pointer"
              >
                <option value="available">{translateStatus('available')}</option>
                <option value="in_use">{translateStatus('in_transit')}</option>
                <option value="maintenance">{translateStatus('maintenance')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-veh-loc" className="text-xs font-bold text-slate-700 block mb-1.5">
                {language === 'en' ? 'Current location (free text)' : 'Vị trí hiện tại (ghi chú)'}
              </label>
              <input
                id="edit-veh-loc"
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 text-slate-800 transition-all"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-4 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeEditModal}>
                {t('common.cancel', 'Hủy')}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} className="bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]">
                {isSubmitting ? t('common.saving', 'Đang lưu...') : t('fleet.saveChangesBtn', 'Lưu thay đổi')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Delete Confirmation */}
      {isDeleteOpen && selectedVehicle && (
        <Modal
          isOpen={isDeleteOpen}
          onClose={closeDeleteModal}
          closeDisabled={isSubmitting}
          title={t('fleet.confirmDeleteTitle', 'Xác nhận xóa phương tiện')}
          maxWidth="450px"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 m-0">
              {t('fleet.confirmDeleteDesc', 'Bạn có chắc chắn muốn xóa phương tiện {code} khỏi danh mục đội xe không? Hành động này không thể hoàn tác.', { code: selectedVehicle.code })}
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-2">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeDeleteModal}>
                {t('common.cancel', 'Hủy')}
              </Button>
              <Button type="button" variant="danger" disabled={isSubmitting} onClick={handleDelete}>
                {isSubmitting ? t('common.saving', 'Đang xử lý...') : t('fleet.deleteVehicleBtn', 'Xóa phương tiện')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
