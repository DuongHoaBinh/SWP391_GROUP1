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
    return lang === 'en' ? 'In transit' : 'Đang vận chuyển';
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
    <div className="space-y-6 pb-10 animate-fade-in font-sans">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('customer.myHorses', isEn ? 'My Horses' : 'Quản Lý Ngựa Đua')}
          </h1>
          <p className="text-sm text-[#5F6977] m-0 mt-1 max-w-3xl">
            {t(
              'customer.horses.subtitle',
              isEn
                ? 'Manage equine profiles, FEI passports, RFID microchips, and quarantine clearances.'
                : 'Quản lý hồ sơ ngựa đua, hộ chiếu FEI, vi mạch RFID và giấy tờ kiểm dịch.'
            )}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsAddHorseModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] border-0 font-bold shadow-sm transition-colors inline-flex items-center gap-1.5 text-xs self-start sm:self-auto"
        >
          <Plus size={15} className="stroke-[2.5] text-[#C4B38E]" aria-hidden="true" />
          <span>{t('customer.horses.addNew', isEn ? 'Add Horse' : 'Thêm ngựa mới')}</span>
        </Button>
      </header>

      {/* Filters & Status Tabs */}
      <div className="bg-white border border-[#E5DDD0] shadow-sm p-3 rounded-2xl flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747D88]" aria-hidden="true" />
          <input
            type="text"
            aria-label={t('customer.horses.searchPlaceholder', isEn ? 'Search by name, code, breed...' : 'Tìm theo tên, mã số, giống ngựa...')}
            placeholder={t('customer.horses.searchPlaceholder', isEn ? 'Search by name, code, breed...' : 'Tìm theo tên, mã số, giống ngựa...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] focus:bg-white text-xs font-medium text-[#181A17] focus:outline-none focus:border-[#A67C2E] transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto no-scrollbar pb-0.5">
          {[
            { key: 'ALL', label: t('common.all', isEn ? 'All' : 'Tất cả'), count: tabCounts.ALL },
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                    : 'bg-white border-[#D8CEBE] text-[#5F6977] hover:text-[#181A17] hover:bg-[#FAF8F4]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#FAF8F4] text-[#5F6977]'
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
              className="text-xs text-[#8C6621] hover:text-[#181A17] flex items-center gap-1 font-semibold ml-auto lg:ml-1 px-2.5 py-1.5 rounded-xl bg-[#FAF8F4] border border-[#D4C5A3] shrink-0 cursor-pointer"
            >
              <X size={13} aria-hidden="true" /> {t('common.clearFilter', isEn ? 'Clear' : 'Xóa lọc')}
            </button>
          )}
        </div>
      </div>

      {/* LOADING / EMPTY / CARDS GRID */}
      {isLoading && displayHorses.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
              <div className="h-48 skeleton-shimmer" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-48 rounded skeleton-shimmer" />
                <div className="h-16 rounded-xl skeleton-shimmer" />
                <div className="h-10 rounded-xl skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredHorses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center shadow-sm">
          <p className="text-base font-bold text-[#181A17] m-0">
            {displayHorses.length === 0
              ? t('customer.noHorsesInList', isEn ? 'No racehorses registered yet' : 'Chưa có ngựa nào được đăng ký')
              : t('common.noResults', isEn ? 'No racehorses match your current filters' : 'Không tìm thấy ngựa khớp với bộ lọc')}
          </p>
          <p className="text-xs text-[#5F6977] mt-1.5 mb-5 max-w-md mx-auto">
            {displayHorses.length === 0
              ? t('customer.registerHorseToStart', isEn ? 'Register your first racehorse dossier to start booking transport.' : 'Đăng ký hồ sơ ngựa để bắt đầu đặt lịch vận chuyển.')
              : t('common.clearAllFiltersHint', isEn ? 'Try adjusting your search keywords or clearing status filters.' : 'Hãy thử thay đổi từ khóa hoặc xóa bộ lọc trạng thái.')}
          </p>
          {displayHorses.length === 0 ? (
            <Button
              variant="primary"
              onClick={() => setIsAddHorseModalOpen(true)}
              className="bg-[#181A17] hover:bg-[#2A2D27] text-white border-0"
            >
              <Plus size={15} className="text-[#C4B38E]" aria-hidden="true" />
              <span>{t('customer.horses.addNew', isEn ? 'Add Horse' : 'Thêm ngựa mới')}</span>
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
                ? { bg: 'bg-white/95 border-[#D8CEBE] text-[#181A17]', dot: 'bg-[#A67C2E]' }
                : { bg: 'bg-white/95 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' };

            const dynamicLocation = isTransit
              ? `${activeOrder?.origin || 'SGN'} → ${activeOrder?.destination || 'DEST'}`
              : isScheduled
                ? `${t('customer.transitHub', 'Kho trung chuyển')} (${activeOrder?.requestCode || ''})`
                : formatHorseLocation(horse.location, horse.availabilityStatus, language);

            const healthBadge = getStatusColor(horse.medicalStatus);
            const docBadge = getStatusColor(horse.documentStatus);

            return (
              <div
                key={horse.id}
                className="bg-white border border-[#E5DDD0] rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#C5B6A0] transition-all duration-300 flex flex-col group shadow-sm"
              >
                {/* Clean Photo Container */}
                <div className="h-48 bg-[#181A17] relative overflow-hidden">
                  <img
                    src={getFullPhotoUrl(horse.photoUrl) || getFallbackHorsePhoto()}
                    alt={horse.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = getFallbackHorsePhoto();
                    }}
                  />

                  {/* Single Status Pill */}
                  <div
                    className={`absolute top-3 right-3 max-w-[70%] text-[11px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-sm flex items-center gap-1.5 shadow-sm ${dynamicStatusBadge.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dynamicStatusBadge.dot}`} aria-hidden="true" />
                    <span className="truncate">{dynamicStatusLabel}</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex flex-col gap-3.5 flex-1">
                  {/* Top Title & Compact Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-[#181A17] tracking-tight truncate m-0">
                          {horse.name}
                        </h2>
                        <span className="text-[11px] font-mono text-[#747D88] shrink-0">
                          {horse.code || `#${horse.id}`}
                        </span>
                      </div>
                      <p className="text-xs text-[#5F6977] mt-0.5 mb-0 truncate">
                        {translateBreed(horse.breed)} • {translateGender(horse.gender)} • {horse.age} {t('common.yearsOld', 'tuổi')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={t('horse.editProfileBtn', isEn ? 'Edit Horse Profile' : 'Chỉnh sửa hồ sơ')}
                        onClick={() => setEditingHorse(horse)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-transparent hover:border-[#D8CEBE] text-[#5F6977] hover:text-[#181A17] hover:bg-[#FAF8F4] transition-colors cursor-pointer"
                        aria-label={`${t('common.edit', isEn ? 'Edit' : 'Chỉnh sửa')} ${horse.name}`}
                      >
                        <Edit3 size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title={t('horse.archiveOrDelete', isEn ? 'Delete / Archive Profile' : 'Xóa / Lưu trữ hồ sơ')}
                        onClick={() => setDeletingHorse(horse)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-transparent hover:border-[#E5B8B8] text-[#747D88] hover:text-[#B33E3E] hover:bg-[#F8EAEA] transition-colors cursor-pointer"
                        aria-label={`${t('common.delete', isEn ? 'Delete' : 'Xóa')} ${horse.name}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Clean Inline Key-Value Rows */}
                  <div className="border-t border-[#EFEAE0] pt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#747D88] shrink-0 flex items-center gap-1">
                        <MapPin size={12} className="text-[#A67C2E]" aria-hidden="true" />
                        {isEn ? 'Location' : 'Vị trí'}
                      </span>
                      <span className="font-semibold text-[#181A17] truncate text-right" title={dynamicLocation}>
                        {dynamicLocation}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#747D88] shrink-0">{isEn ? 'Health' : 'Sức khỏe'}</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#181A17] truncate">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthBadge.dot}`} aria-hidden="true" />
                        {translateHealthStatus(horse.medicalStatus) || t('common.qualified', 'Đạt chuẩn')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#747D88] shrink-0">{isEn ? 'FEI Passport' : 'Hộ chiếu FEI'}</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#181A17] truncate">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${docBadge.dot}`} aria-hidden="true" />
                        {horse.passportNumber
                          ? t('horses.feiPassportValid', 'Hợp lệ')
                          : t('horses.awaitingFeiCode', 'Chờ cấp mã')}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-auto pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl border-[#D8CEBE] text-[#181A17] font-semibold hover:bg-[#FAF8F4] transition-all text-xs py-2"
                      onClick={() => router.push(`/customer/horses/${horse.id}`)}
                    >
                      <span>{t('horses.viewPassport', isEn ? 'View Profile' : 'Xem hồ sơ')}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </Button>

                    {isTransit ? (
                      <Button
                        variant="primary"
                        className="flex-1 rounded-xl bg-[#287653] hover:bg-[#205F43] border-0 text-white font-bold transition-all text-xs py-2 shadow-sm"
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
                        className="flex-1 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] border-0 text-[#FBF9F5] font-bold transition-all text-xs py-2 shadow-sm"
                        onClick={() => router.push(`/customer/requests/${activeOrder?.id}`)}
                        title={t('horses.viewRequest', isEn ? 'View Order' : 'Xem Đơn')}
                      >
                        <FileText size={13} className="text-[#C4B38E]" aria-hidden="true" />
                        <span>
                          {t('horses.viewRequest', 'Xem Đơn')} {activeOrder?.requestCode || ''}
                        </span>
                      </Button>
                    ) : isAvailable ? (
                      <Button
                        variant="primary"
                        className="flex-1 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] border-0 text-[#FBF9F5] font-bold transition-all text-xs py-2 shadow-sm"
                        onClick={() => router.push(`/customer/requests/new?horseId=${horse.id}`)}
                      >
                        <Truck size={13} className="text-[#C4B38E]" aria-hidden="true" />
                        <span>{t('horse.bookTripShort', isEn ? 'Book Trip' : 'Đặt Chuyến')}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        className="flex-1 rounded-xl bg-[#FAF8F4] text-[#747D88] border-[#E5DDD0] font-semibold text-xs py-2 cursor-not-allowed"
                        title={isEn ? 'Horse is not ready for transport' : 'Ngựa hiện chưa sẵn sàng vận chuyển'}
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
