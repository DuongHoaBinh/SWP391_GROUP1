'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  MapPin,
  X,
  Edit3,
  Trash2,
  ArrowRight,
  Truck,
  Navigation,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { AddHorseModal } from '@/components/horses/AddHorseModal';
import { EditHorseModal } from '@/components/horses/EditHorseModal';
import { DeleteHorseModal } from '@/components/horses/DeleteHorseModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const getFallbackHorsePhoto = () =>
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80';

function formatHorseLocation(loc?: string, availabilityStatus?: string, lang: string = 'vi'): string {
  const isTransit = (availabilityStatus || '').toLowerCase().includes('transit');
  if (isTransit) {
    return lang === 'en' ? 'International Flight Corridor (IATA LAR)' : 'Đang trên tuyến vận tải quốc tế (IATA LAR)';
  }
  if (!loc || loc.toLowerCase() === 'stable') {
    return lang === 'en' ? 'Cu Chi Stable & Training Facility, HCMC' : 'Trại Huấn Luyện Củ Chi, TP.HCM';
  }
  return loc;
}

export default function HorsesPage() {
  const router = useRouter();
  const { t, language, translateGender, translateBreed, translateStatus, translateHealthStatus } = useLanguage();
  const isEn = language === 'en';
  const { horses, requests, refreshHorses } = useCustomerStore();

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddHorseModalOpen, setIsAddHorseModalOpen] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [deletingHorse, setDeletingHorse] = useState<Horse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'IN_TRANSIT' | 'SCHEDULED'>('ALL');

  const loadHorses = useCallback(async () => {
    setIsLoading(true);
    try {
      await refreshHorses();
    } finally {
      setIsLoading(false);
    }
  }, [refreshHorses]);

  useEffect(() => {
    void loadHorses();
  }, [loadHorses]);

  // Helper to find any active (in-progress) transport order for this horse
  const getHorseActiveOrder = (horse: Horse) => {
    return requests.find((r) => {
      const match =
        String(r.horseId) === String(horse.id) ||
        String(r.horse?.id) === String(horse.id) ||
        (horse.backendId && String(r.horseId) === String(horse.backendId)) ||
        (r.horses && r.horses.some((h: any) => String(h.horse?.id) === String(horse.id) || String(h.id) === String(horse.id))) ||
        (r.horse?.name && horse.name && r.horse.name.toLowerCase().trim() === horse.name.toLowerCase().trim());

      const upper = String(r.status || '').toUpperCase();
      const isFinished = upper === 'COMPLETED' || upper === 'CANCELLED' || upper === 'REJECTED';
      return match && !isFinished;
    });
  };

  // Exclude soft-deleted/retired horses
  const displayHorses = horses.filter(
    (h) => (h as any).status !== 'retired' && (h as any).status !== 'deleted'
  );

  const classifyHorse = (h: Horse) => {
    const activeOrder = getHorseActiveOrder(h);
    const orderStatusStr = String(activeOrder?.status || '').toLowerCase();
    const isTransit =
      (h.availabilityStatus || '').toLowerCase().includes('transit') ||
      (h.status || '').toLowerCase().includes('transit') ||
      orderStatusStr.includes('transit');
    const isScheduled =
      !isTransit &&
      Boolean(activeOrder) &&
      (orderStatusStr.includes('approved') ||
        orderStatusStr.includes('review') ||
        orderStatusStr.includes('planning') ||
        orderStatusStr.includes('submit') ||
        orderStatusStr.includes('request') ||
        orderStatusStr.includes('confirmed') ||
        orderStatusStr.includes('ready'));
    const isAvailable = !isTransit && !isScheduled && (h.medicalStatus || 'Healthy') === 'Healthy';
    return { activeOrder, isTransit, isScheduled, isAvailable };
  };

  const tabCounts = displayHorses.reduce(
    (acc, h) => {
      const c = classifyHorse(h);
      acc.ALL += 1;
      if (c.isAvailable) acc.AVAILABLE += 1;
      if (c.isTransit) acc.IN_TRANSIT += 1;
      if (c.isScheduled) acc.SCHEDULED += 1;
      return acc;
    },
    { ALL: 0, AVAILABLE: 0, IN_TRANSIT: 0, SCHEDULED: 0 }
  );

  const filteredHorses = displayHorses.filter((h) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      h.name.toLowerCase().includes(q) ||
      (h.code && h.code.toLowerCase().includes(q)) ||
      (h.breed && h.breed.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    const c = classifyHorse(h);
    if (statusFilter === 'AVAILABLE') return c.isAvailable;
    if (statusFilter === 'IN_TRANSIT') return c.isTransit;
    if (statusFilter === 'SCHEDULED') return c.isScheduled;
    return true;
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'In Transit':
      case 'in_transit':
      case 'Scheduled':
      case 'Approved':
      case 'approved':
        return { bg: 'bg-[#FAF8F4] border-[#EAE5DA] text-[#181A17]', dot: 'bg-[#181A17]' };
      case 'Available':
      case 'Healthy':
      case 'Valid':
        return { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' };
      case 'Not Cleared':
      case 'Medical Attention':
      case 'Missing':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
      case 'Monitoring':
      case 'Requires Review':
      case 'Expiring Soon':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
      default:
        return { bg: 'bg-[#F0EEE8] text-[#273244] border-[#D8CEBE]', dot: 'bg-[#747D88]' };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* PAGE HEADER & ACTION TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('customer.myHorses', isEn ? 'Registered Racehorses' : 'Quản Lý Đàn Chiến Mã')}
          </h1>
          <p className="text-xs sm:text-sm text-[#5F6977] m-0 mt-1">
            {t(
              'customer.horses.subtitle',
              isEn
                ? 'Manage equine profiles, FEI passports, RFID microchips, and quarantine clearances.'
                : 'Quản lý hồ sơ chiến mã, hộ chiếu FEI, vi mạch RFID và giấy tờ kiểm dịch.'
            )}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsAddHorseModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#242722] text-white border-[#181A17] font-bold shadow-sm transition-colors flex items-center gap-1.5 text-xs self-start sm:self-auto"
        >
          <Plus size={15} className="stroke-[2.5]" aria-hidden="true" />
          <span>{t('customer.horses.addNew', 'Đăng Ký Chiến Mã Mới')}</span>
        </Button>
      </div>

      {/* FILTERS & STATUS TABS */}
      <div className="bg-white border border-[#D8CEBE] shadow-sm p-3 sm:p-4 rounded-2xl flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747D88]" aria-hidden="true" />
          <input
            type="text"
            aria-label={t('customer.horses.searchPlaceholder', isEn ? 'Search by name, code, breed...' : 'Tìm theo tên, mã số, giống ngựa...')}
            placeholder={t('customer.horses.searchPlaceholder', isEn ? 'Search by name, code, breed...' : 'Tìm theo tên, mã số, giống ngựa...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] focus:bg-white text-xs font-semibold text-[#181A17] focus:outline-none focus:border-[#A67C2E] transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto no-scrollbar pb-0.5">
          {[
            { key: 'ALL', label: t('common.all', isEn ? 'All Horses' : 'Tất cả chiến mã'), count: tabCounts.ALL },
            { key: 'AVAILABLE', label: t('customer.ready', isEn ? 'Ready' : 'Sẵn sàng'), count: tabCounts.AVAILABLE },
            { key: 'SCHEDULED', label: t('status.scheduled', isEn ? 'Scheduled' : 'Đã xếp lịch'), count: tabCounts.SCHEDULED },
            { key: 'IN_TRANSIT', label: t('customer.inFlight', isEn ? 'In Transit' : 'Đang vận chuyển'), count: tabCounts.IN_TRANSIT },
          ].map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#181A17] text-white shadow-sm ring-1 ring-[#C4B38E]'
                    : 'bg-[#F0EEE8] border border-[#D8CEBE] text-[#5F6977] hover:text-[#181A17] hover:bg-[#E8E2D8]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white text-[#5F6977]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}

          {(searchTerm || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
              className="text-xs text-[#5F6977] hover:text-[#181A17] flex items-center gap-1 font-semibold ml-auto lg:ml-2 px-2 shrink-0 cursor-pointer"
            >
              <X size={14} aria-hidden="true" /> {t('common.clearFilter', isEn ? 'Clear' : 'Xóa lọc')}
            </button>
          )}
        </div>
      </div>

      {/* LOADING / EMPTY / CARDS GRID */}
      {isLoading && displayHorses.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="bg-white rounded-3xl border border-[#D8CEBE] overflow-hidden shadow-sm">
              <div className="h-52 skeleton-shimmer" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-48 rounded skeleton-shimmer" />
                <div className="h-16 rounded-xl skeleton-shimmer" />
                <div className="h-10 rounded-xl skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredHorses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#D8CEBE] p-10 text-center shadow-sm">
          <p className="text-base font-bold text-[#181A17] m-0">
            {displayHorses.length === 0
              ? t('customer.noHorsesInList', isEn ? 'No racehorses registered yet' : 'Chưa có chiến mã nào được đăng ký')
              : t('common.noResults', isEn ? 'No racehorses match your current filters' : 'Không tìm thấy chiến mã khớp với bộ lọc')}
          </p>
          <p className="text-xs text-[#5F6977] mt-1.5 mb-5 max-w-md mx-auto">
            {displayHorses.length === 0
              ? t('customer.registerHorseToStart', isEn ? 'Register your first racehorse dossier to start booking transport.' : 'Đăng ký hồ sơ chiến mã để bắt đầu đặt lịch vận chuyển quốc tế.')
              : t('common.clearAllFiltersHint', isEn ? 'Try adjusting your search keywords or clearing status filters.' : 'Hãy thử thay đổi từ khóa hoặc xóa bộ lọc trạng thái.')}
          </p>
          {displayHorses.length === 0 ? (
            <Button
              variant="primary"
              onClick={() => setIsAddHorseModalOpen(true)}
              className="bg-[#181A17] hover:bg-[#242722] text-white border-[#181A17]"
            >
              <Plus size={15} aria-hidden="true" />
              <span>{t('customer.horses.addNew', 'Đăng Ký Chiến Mã Mới')}</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
            >
              <X size={14} aria-hidden="true" />
              <span>{t('common.clearAllFilters', isEn ? 'Clear all filters' : 'Xóa bộ lọc')}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredHorses.map((horse) => {
            const { activeOrder, isTransit, isScheduled, isAvailable } = classifyHorse(horse);

            const dynamicStatusLabel = isTransit
              ? `${translateStatus('in_transit')}${activeOrder?.requestCode ? ` (${activeOrder.requestCode})` : ''}`
              : isScheduled
                ? `${translateStatus('scheduled')} (${activeOrder?.requestCode || translateStatus('approved')})`
                : translateStatus('available');

            const dynamicStatusBadge =
              isTransit || isScheduled
                ? { bg: 'bg-[#FAF8F4] border-[#EAE5DA] text-[#181A17]', dot: 'bg-[#181A17]' }
                : { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' };

            const dynamicLocation = isTransit
              ? `${t('dashboard.inTransit', 'Đang vận chuyển')}: ${activeOrder?.origin || 'SGN'} -> ${activeOrder?.destination || 'DEST'}`
              : isScheduled
                ? `${t('customer.transitHub', 'Kho trung chuyển')} (${t('customer.awaitingDeparture', 'Chờ xuất phát')} ${activeOrder?.requestCode || ''})`
                : formatHorseLocation(horse.location, horse.availabilityStatus, language);

            const healthBadge = getStatusColor(horse.medicalStatus);
            const docBadge = getStatusColor(horse.documentStatus);

            return (
              <div
                key={horse.id}
                className="bg-white border border-[#D8CEBE] rounded-3xl overflow-hidden hover:shadow-xl hover:border-[#C5B6A0] transition-all duration-300 flex flex-col group shadow-sm"
              >
                {/* Photo Header with Ambient Badges */}
                <div className="h-52 bg-gradient-to-br from-[#242722] via-[#181A17] to-[#2C2F2A] relative overflow-hidden">
                  <img
                    src={getFullPhotoUrl(horse.photoUrl) || getFallbackHorsePhoto()}
                    alt={horse.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = getFallbackHorsePhoto();
                    }}
                  />

                  {/* ID Badge */}
                  <div className="absolute top-3 left-3 max-w-[44%] truncate bg-[#181A17]/90 backdrop-blur-sm text-[#F7F7F4] text-[11px] font-mono font-extrabold tracking-wider px-3 py-1 rounded-xl border border-[#2C2F2A] shadow-sm">
                    {horse.code || horse.id}
                  </div>

                  {/* Availability Status Badge */}
                  <div
                    className={`absolute top-3 right-3 max-w-[48%] text-[11px] font-extrabold px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-sm ${dynamicStatusBadge.bg}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dynamicStatusBadge.dot}`} aria-hidden="true" />
                    <span className="truncate">{dynamicStatusLabel}</span>
                  </div>

                  {/* Bottom Photo Overlay Info */}
                  <div className="absolute bottom-0 inset-x-0 bg-[#181A17]/90 backdrop-blur-sm border-t border-[#2C2F2A] p-3 px-4 flex items-end justify-between gap-2 text-white">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#B49A68] block truncate">
                        {translateBreed(horse.breed)}
                      </span>
                      <h2 className="text-lg font-extrabold text-white tracking-tight truncate m-0">
                        {horse.name}
                      </h2>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[#242722] text-[#F7F7F4] border border-[#2C2F2A] shrink-0">
                      {translateGender(horse.gender)} • {horse.age} {t('common.yearsOld', 'tuổi')}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Actions Row */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E8E2D8]">
                    <div className="flex items-center gap-1.5 text-xs text-[#5F6977] font-medium min-w-0">
                      <MapPin size={14} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                      <span className="truncate">{dynamicLocation}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        title={t('horse.editProfileBtn', isEn ? 'Edit Horse Profile' : 'Chỉnh sửa hồ sơ chiến mã')}
                        onClick={() => setEditingHorse(horse)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-[#D8CEBE] text-[#5F6977] hover:text-[#A67C2E] hover:border-[#C5B6A0] hover:bg-[#FAF8F4] transition-colors shadow-sm cursor-pointer"
                        aria-label={`${t('common.edit', isEn ? 'Edit' : 'Chỉnh sửa')} ${horse.name}`}
                      >
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title={t('horse.archiveOrDelete', isEn ? 'Delete / Archive Profile' : 'Xóa / Lưu trữ hồ sơ chiến mã')}
                        onClick={() => setDeletingHorse(horse)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-rose-200 text-[#B33E3E] hover:bg-[#F8EAEA] transition-colors shadow-sm cursor-pointer"
                        aria-label={`${t('common.delete', isEn ? 'Delete' : 'Xóa')} ${horse.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Biometrics Matrix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#FAF8F4] border border-[#E8E2D8]">
                      <span className="text-[10px] uppercase font-bold text-[#747D88] block mb-0.5">
                        {t('horses.vitalsAndQuarantine', 'Thể Lực & Kiểm Dịch')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${healthBadge.dot}`} aria-hidden="true" />
                        <span className="font-bold text-[#273244] truncate">
                          {translateHealthStatus(horse.medicalStatus) || t('common.qualified', 'Đạt chuẩn')}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#FAF8F4] border border-[#E8E2D8]">
                      <span className="text-[10px] uppercase font-bold text-[#747D88] block mb-0.5">
                        {t('horses.docsAndPassport', 'Hồ Sơ & Hộ Chiếu')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${docBadge.dot}`} aria-hidden="true" />
                        <span className="font-bold text-[#273244] truncate">
                          {horse.passportNumber
                            ? t('horses.feiPassportValid', 'Hộ chiếu FEI hợp lệ')
                            : t('horses.awaitingFeiCode', 'Chờ cấp mã FEI')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-auto pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl border-[#D8CEBE] text-[#273244] font-bold hover:bg-[#F0EEE8] transition-all text-xs py-2.5 shadow-sm"
                      onClick={() => router.push(`/customer/horses/${horse.id}`)}
                    >
                      <span>{t('horses.viewPassport', 'Xem Hộ Chiếu')}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </Button>

                    {isTransit ? (
                      <Button
                        variant="primary"
                        className="flex-1 rounded-xl bg-[#287653] hover:bg-[#205F43] border-[#287653] text-white font-bold transition-all text-xs py-2.5 shadow-sm"
                        onClick={() =>
                          router.push(
                            activeOrder
                              ? `/customer/tracking?requestId=${activeOrder.id}&horseId=${horse.id}`
                              : `/customer/tracking?horseId=${horse.id}`
                          )
                        }
                        title={t('customer.trackTrip', isEn ? 'Track Trip' : 'Theo Dõi Chuyến')}
                      >
                        <Navigation size={13} className="text-white" aria-hidden="true" />
                        <span>{t('customer.trackTrip', 'Theo Dõi Chuyến')}</span>
                      </Button>
                    ) : isScheduled ? (
                      <Button
                        variant="primary"
                        className="flex-1 rounded-xl bg-[#181A17] hover:bg-[#242722] border-[#181A17] text-white font-bold transition-all text-xs py-2.5 shadow-sm"
                        onClick={() => router.push(`/customer/requests/${activeOrder?.id}`)}
                        title={t('horses.viewRequest', isEn ? 'View Order' : 'Xem Đơn')}
                      >
                        <FileText size={13} className="text-white" aria-hidden="true" />
                        <span>
                          {t('horses.viewRequest', 'Xem Đơn')} {activeOrder?.requestCode || ''}
                        </span>
                      </Button>
                    ) : isAvailable ? (
                      <Button
                        variant="primary"
                        className="flex-1 rounded-xl bg-[#181A17] hover:bg-[#242722] border-[#181A17] text-white font-bold transition-all text-xs py-2.5 shadow-sm"
                        onClick={() => router.push(`/customer/requests/new?horseId=${horse.id}`)}
                      >
                        <Truck size={13} aria-hidden="true" />
                        <span>{t('horse.bookTripShort', isEn ? 'Book Trip' : 'Đặt Chuyến')}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        className="flex-1 rounded-xl bg-[#F0EEE8] text-[#747D88] border-[#D8CEBE] font-bold text-xs py-2.5 cursor-not-allowed"
                        title={isEn ? 'Horse is not ready for transport' : 'Chiến mã hiện chưa sẵn sàng vận chuyển'}
                      >
                        <span>{t('common.unavailable', isEn ? 'Unavailable' : 'Không Khả Dụng')}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AddHorseModal
        isOpen={isAddHorseModalOpen}
        onClose={() => setIsAddHorseModalOpen(false)}
      />

      {editingHorse && (
        <EditHorseModal
          isOpen={Boolean(editingHorse)}
          onClose={() => setEditingHorse(null)}
          horse={editingHorse}
        />
      )}

      {deletingHorse && (
        <DeleteHorseModal
          isOpen={Boolean(deletingHorse)}
          onClose={() => setDeletingHorse(null)}
          horse={deletingHorse}
        />
      )}
    </div>
  );
}
