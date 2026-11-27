'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ShieldCheck,
  Truck,
  UserCheck,
  Info,
  Camera,
  Edit2,
  Trash2,
  Activity,
  Heart,
  Navigation,
} from 'lucide-react';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { HorseDocumentVault } from '@/features/documents/components/HorseDocumentVault';
import { EditHorseModal } from '@/components/horses/EditHorseModal';
import { DeleteHorseModal } from '@/components/horses/DeleteHorseModal';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const getFallbackHorsePhoto = () =>
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80';

const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
  'CANCELLED_OPERATIONAL',
  'REJECTED',
  'REFUNDED',
  'REFUND_REQUESTED',
]);

function formatExamDate(val: string | undefined | null, isEn: boolean): string | null {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return d.toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatLocationLabel(loc: string | undefined | null, isEn: boolean): string | null {
  const trimmed = (loc || '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'stable') {
    return isEn ? 'Registered Stable' : 'Tại chuồng đăng ký';
  }
  return trimmed;
}

export default function HorseDetailPage() {
  const { t, language, translateBreed, translateGender, translateColor, translateHealthStatus } =
    useLanguage();
  const isEn = language === 'en';
  const params = useParams();
  const router = useRouter();
  const horseId = params?.id as string;

  const { getHorseById, requests, refreshRequests, uploadHorseAvatar } = useCustomerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const initialLocal = getHorseById(horseId);
  const [horse, setHorse] = useState<Horse | undefined>(initialLocal);
  const [isLoading, setIsLoading] = useState(!initialLocal);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Nhật ký sức khỏe trong chuyến
  const [medicalLogs, setMedicalLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (requests.length === 0) {
      void refreshRequests();
    }
  }, [requests.length, refreshRequests]);

  const fetchHealthLogs = useCallback(() => {
    if (!horseId) return;
    setIsLoadingLogs(true);
    setLogsError(null);
    apiClient<any[]>(`/tracking/horses/${horseId}/health-logs`)
      .then((data) => {
        if (Array.isArray(data)) {
          const mapped = data.map((log) => ({
            id: log.id,
            date: new Date(log.recordedAt).toLocaleString(isEn ? 'en-US' : 'vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            title:
              log.legName ||
              (isEn ? 'Transit Checkpoint Health Check' : 'Kiểm tra sức khỏe trạm vận chuyển'),
            examiner: `${
              log.recordedByName || (isEn ? 'Veterinarian / Escort' : 'Nhân viên thú y / áp tải')
            }${log.recordedByRole ? ` (${log.recordedByRole})` : ''} • ${
              isEn ? 'Temp' : 'Thân nhiệt'
            }: ${log.temperatureC !== null && log.temperatureC !== undefined ? `${log.temperatureC}°C` : '—'} • ${
              isEn ? 'Heart Rate' : 'Nhịp tim'
            }: ${log.heartRateBpm ? `${log.heartRateBpm} bpm` : '—'}${
              log.notes ? ` • ${isEn ? 'Notes' : 'Ghi chú'}: ${log.notes}` : ''
            }`,
            status: isEn
              ? log.conditionStatus || 'Healthy / Stable'
              : log.conditionStatusVi || log.conditionStatus || 'Khỏe mạnh / Ổn định',
            rawStatus: log.conditionStatus,
          }));
          setMedicalLogs(mapped);
        }
      })
      .catch((err: any) => {
        setLogsError(
          err?.message || (isEn ? 'Could not load health logs.' : 'Không thể tải nhật ký sức khỏe.'),
        );
      })
      .finally(() => setIsLoadingLogs(false));
  }, [horseId, isEn]);

  useEffect(() => {
    fetchHealthLogs();
  }, [fetchHealthLogs]);

  const showFeedback = (msg: string, durationMs = 4000) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackSuccess(msg);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackSuccess(null);
    }, durationMs);
  };

  useEffect(() => {
    let isMounted = true;
    const localAtFetch = getHorseById(horseId);
    const fetchHorseDetail = async () => {
      try {
        setIsLoading(true);
        const res = await apiClient<any>(`/horses/${horseId}`);
        if (res && isMounted) {
          const parsedAge = res.age != null && Number(res.age) > 0 ? Number(res.age) : 0;
          const mapped: Horse = {
            ...res,
            id: String(res.id || horseId),
            backendId: res.id ? Number(res.id) : undefined,
            code:
              res.code ||
              res.passportNo ||
              (res.id ? `HR-${String(res.id).padStart(5, '0')}` : undefined),
            name: res.name,
            breed: res.breed || 'Thoroughbred',
            gender: res.gender || undefined,
            age: parsedAge,
            requiresPrivateStall: Boolean(res.requiresPrivateStall),
            temperament: res.temperament || 'normal',
            color: res.color || '',
            weight: res.weight ? String(res.weight) : '',
            microchipNumber: res.microchipNumber || res.microchipNo || '',
            passportNumber: res.passportNumber || res.passportNo || '',
            ownerName: res.ownerName || '',
            medicalStatus: res.medicalStatus || '',
            vaccinationStatus: res.vaccinationStatus || '',
            quarantineStatus: res.quarantineStatus || 'Pending',
            lastExamDate: res.lastExamDate || '',
            veterinarian: res.veterinarian || '',
            specialRequirements: res.specialRequirements || '',
            location: res.location || '',
            photoUrl: res.photoUrl || undefined,
            documents:
              res.documents && res.documents.length > 0
                ? res.documents
                : localAtFetch?.documents || [],
          };
          setHorse(mapped);
        }
      } catch {
        if (localAtFetch && isMounted) setHorse(localAtFetch);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchHorseDetail();
    return () => {
      isMounted = false;
    };
  }, [horseId, getHorseById, isEn]);

  const getHorseActiveOrder = (h: Horse) => {
    return requests.find((r) => {
      const match =
        String(r.horseId) === String(h.id) ||
        String(r.horse?.id) === String(h.id) ||
        (h.backendId && String(r.horseId) === String(h.backendId)) ||
        (r.horses &&
          r.horses.some(
            (item: any) =>
              String(item.horse?.id) === String(h.id) ||
              String(item.horseId) === String(h.id) ||
              (h.backendId &&
                (String(item.horse?.id) === String(h.backendId) ||
                  String(item.horseId) === String(h.backendId))),
          )) ||
        (r.horse?.name &&
          h.name &&
          r.horse.name.toLowerCase().trim() === h.name.toLowerCase().trim());

      const rawUpper = String(r.statusLabel || r.status || '').toUpperCase();
      const upper = String(r.status || '').toUpperCase();
      const isFinished = TERMINAL_STATUSES.has(rawUpper) || TERMINAL_STATUSES.has(upper);
      return match && !isFinished;
    });
  };

  const activeOrder = horse ? getHorseActiveOrder(horse) : undefined;
  const activeOrderStatusLower = String(
    activeOrder?.statusLabel || activeOrder?.status || '',
  ).toLowerCase();
  const isTransit = horse
    ? (activeOrder
        ? (activeOrderStatusLower.includes('in_transit') || activeOrderStatusLower === 'return_pending')
        : (horse.availabilityStatus || '').toLowerCase().includes('transit'))
    : false;
  const isScheduled = !isTransit && Boolean(activeOrder);

  const displayMedicalHistory = medicalLogs.length > 0 ? medicalLogs : horse?.medicalHistory || [];

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !horse) return;
    try {
      setIsUploadingAvatar(true);
      await uploadHorseAvatar(horse.id, file);
      showFeedback(
        t(
          'horse.avatarUpdateSuccess',
          isEn ? 'Horse avatar updated successfully!' : 'Cập nhật ảnh đại diện chiến mã thành công!',
        ),
        4000,
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'horse.avatarUpdateFail',
            isEn ? 'Could not upload avatar.' : 'Không thể tải lên ảnh đại diện. Vui lòng thử lại.',
          ),
      );
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="w-12 h-12 border-4 border-[#C4B38E] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-[#5F6977]">
          {t('horse.loadingProfile', isEn ? 'Loading horse profile...' : 'Đang tải hồ sơ chiến mã...')}
        </p>
      </div>
    );
  }

  if (!horse) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 text-center bg-white rounded-3xl border border-[#D8CEBE] shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-4">
          <Info size={32} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-[#181A17] m-0">
          {t('horse.notFoundTitle', isEn ? 'Horse Profile Not Found' : 'Không tìm thấy thông tin cá thể ngựa')}
        </h1>
        <p className="text-sm text-[#5F6977] mt-2 mb-6">
          {t(
            'horse.notFoundDesc',
            isEn ? 'This record does not exist or was archived.' : 'Dữ liệu không tồn tại hoặc đã được chuyển vào mục lưu trữ.',
          )}
        </p>
        <Link
          href="/customer/horses"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#181A17] text-white font-bold text-xs hover:bg-[#242722] transition-colors no-underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('horse.backToStable', isEn ? 'Back to My Horses' : 'Quay lại danh sách')}</span>
        </Link>
      </div>
    );
  }

  const horsePhoto = getFullPhotoUrl(horse.photoUrl) || getFallbackHorsePhoto();
  const medStatusLower = String(horse.medicalStatus || 'Healthy').toLowerCase();
  const medBadgeClass = medStatusLower.includes('attention')
    ? 'bg-rose-100 text-rose-800'
    : medStatusLower.includes('monitor') || medStatusLower.includes('review')
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';
  const notUpdatedText = t('common.notUpdated', isEn ? 'Not updated' : 'Chưa cập nhật');
  const hasValidAge = horse.age !== null && horse.age !== undefined && Number(horse.age) > 0;
  const displayLocation = formatLocationLabel(horse.location, isEn);
  const displayLastExam = formatExamDate(horse.lastExamDate, isEn);

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto pb-10">
      {/* Compact Back Link (Avoids double breadcrumb with Header) */}
      <div>
        <Link
          href="/customer/horses"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F6977] hover:text-[#181A17] no-underline transition-colors"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{t('horse.backToStable', isEn ? 'Back to My Horses' : 'Quay lại danh sách ngựa')}</span>
        </Link>
      </div>

      {feedbackSuccess && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-[#E8F2EB] border border-[#B7DBC4] text-[#287653] text-xs font-bold flex items-center justify-between gap-3 shadow-sm"
        >
          <span>{feedbackSuccess}</span>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            aria-label={t('common.close', isEn ? 'Close' : 'Đóng')}
            className="text-[#287653] hover:text-[#181A17] p-1 cursor-pointer bg-transparent border-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Light Editorial Horse Profile Header */}
      <header className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t(
                'horse.changeAvatarHint',
                isEn ? 'Change racehorse avatar' : 'Nhấp để thay đổi ảnh đại diện',
              )}
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-[#E5DDD0] shadow-sm shrink-0 cursor-pointer group bg-[#FAF8F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
            >
              <img
                src={horsePhoto}
                alt={horse.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex flex-col items-center justify-center text-white gap-1">
                <Camera size={18} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {t('horse.changePhoto', isEn ? 'Change' : 'Đổi ảnh')}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="sm:hidden absolute bottom-1.5 right-1.5 w-7 h-7 rounded-lg bg-white/90 border border-[#D8CEBE] text-[#181A17] flex items-center justify-center"
              >
                <Camera size={14} />
              </span>
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleAvatarChange}
            />

            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#8C6621] border border-[#E5DDD0]">
                  {translateBreed(horse.breed)}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-[#5F6977] bg-[#FAF8F4] border border-[#E5DDD0]">
                  {horse.code || `#${horse.id}`}
                </span>
                {isTransit ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#D4C5A3] inline-flex items-center gap-1.5">
                    <Truck size={12} aria-hidden="true" />
                    <span>{t('customer.inFlight', isEn ? 'In Transit' : 'Đang vận chuyển')}</span>
                  </span>
                ) : isScheduled ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                    ● {isEn ? 'Scheduled' : 'Đã xếp lịch'} ({activeOrder?.requestCode})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
                    ● {t('horse.stableReady', isEn ? 'Ready in Stable' : 'Sẵn sàng tại chuồng')}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#181A17] m-0">
                {horse.name}
              </h1>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-[#5F6977] mt-2 font-medium">
                <span>
                  {t('horses.gender', isEn ? 'Gender' : 'Giới tính')}:{' '}
                  <strong className="text-[#181A17]">
                    {horse.gender ? translateGender(horse.gender) : '—'}
                  </strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horses.age', isEn ? 'Age' : 'Tuổi')}:{' '}
                  <strong className="text-[#181A17]">
                    {hasValidAge
                      ? `${horse.age} ${t('horse.yearsOld', isEn ? 'yrs' : 'tuổi')}`
                      : notUpdatedText}
                  </strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horses.temperament', isEn ? 'Temperament' : 'Tính khí')}:{' '}
                  <strong className="text-[#181A17]">
                    {horse.temperament === 'calm'
                      ? t('horses.temperament.calm', isEn ? 'Calm' : 'Điềm tĩnh')
                      : horse.temperament === 'difficult'
                        ? t('horses.temperament.difficult', isEn ? 'Spirited' : 'Khó tính')
                        : t('horses.temperament.normal', isEn ? 'Normal' : 'Bình thường')}
                  </strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horse.colorLabel', isEn ? 'Coat Color' : 'Màu lông')}:{' '}
                  <strong className="text-[#181A17]">
                    {horse.color ? translateColor(horse.color) : '—'}
                  </strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horse.weightLabel', isEn ? 'Weight' : 'Thể trọng')}:{' '}
                  <strong className="text-[#181A17]">{horse.weight || '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-[#EFEAE0]">
            {isTransit && activeOrder ? (
              <Link
                href={`/customer/tracking?shipmentId=${activeOrder.id}&horseId=${horse.id}`}
                className="px-4 py-2.5 rounded-xl bg-[#287653] hover:bg-[#1F5E42] text-white text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 no-underline"
              >
                <Navigation size={14} aria-hidden="true" />
                <span>
                  {isEn ? 'Track Trip' : 'Theo Dõi Chuyến'} ({activeOrder.requestCode || `#${activeOrder.id}`})
                </span>
              </Link>
            ) : isScheduled && activeOrder ? (
              <Link
                href={`/customer/requests/${activeOrder.id}`}
                className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 no-underline"
              >
                <Truck size={14} className="text-[#C4B38E]" aria-hidden="true" />
                <span>
                  {t('horse.viewOrderBtn', isEn ? 'View Order' : 'Xem Đơn')} (
                  {activeOrder.requestCode || `#${activeOrder.id}`})
                </span>
              </Link>
            ) : (
              <Link
                href={`/customer/requests/new?horseIds=${horse.id}`}
                className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 no-underline"
              >
                <Truck size={14} className="text-[#C4B38E]" aria-hidden="true" />
                <span>{t('horse.bookNewTripBtn', isEn ? 'Book Transport' : 'Tạo Chuyến Vận Chuyển')}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:border-[#B49A68] text-[#181A17] text-xs font-semibold transition-colors border border-[#D8CEBE] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 size={13} aria-hidden="true" />
              <span>{t('common.edit', isEn ? 'Edit' : 'Sửa')}</span>
            </button>

            <button
              type="button"
              disabled={isTransit || isScheduled}
              title={
                isTransit || isScheduled
                  ? (isEn ? 'Cannot delete a horse tied to an active order' : 'Không thể xóa ngựa đang gắn với đơn vận chuyển hoạt động')
                  : undefined
              }
              onClick={() => !(isTransit || isScheduled) && setIsDeleteModalOpen(true)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors border inline-flex items-center gap-1.5 ${
                isTransit || isScheduled
                  ? 'bg-[#F0EEE8] text-[#94A3B8] border-[#E5DDD0] cursor-not-allowed'
                  : 'bg-[#F8EAEA]/60 hover:bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8] cursor-pointer'
              }`}
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>{t('common.delete', isEn ? 'Delete' : 'Xóa')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2-COLUMN DETAIL GRID (IDENTITY & MEDICAL) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Identity & Studbook */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEAE0] mb-4">
              <h2 className="text-sm font-bold text-[#181A17] m-0">
                {t('horse.studbookTitle', isEn ? 'Identity & Studbook' : 'Hồ Sơ Nhận Diện & Phả Hệ')}
              </h2>
              <ShieldCheck size={17} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.microchipLabel', isEn ? 'ISO Microchip No.' : 'Số Microchip ISO')}
                </span>
                <div className="font-mono font-bold text-[#181A17] break-all">
                  {horse.microchipNumber || notUpdatedText}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.passportLabel', isEn ? 'FEI Passport No.' : 'Số Hộ Chiếu FEI')}
                </span>
                <div className="font-mono font-bold text-[#181A17] break-all">
                  {horse.passportNumber || notUpdatedText}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horses.requiresPrivateStall', isEn ? 'Private Stall Required' : 'Cần chuồng riêng')}
                </span>
                <div className={`font-bold ${horse.requiresPrivateStall ? 'text-[#966516]' : 'text-[#181A17]'}`}>
                  {horse.requiresPrivateStall
                    ? t('common.yes', isEn ? 'Yes' : 'Có')
                    : t('common.no', isEn ? 'No' : 'Không')}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.currentLocation', isEn ? 'Current Stable Location' : 'Địa điểm lưu trú hiện tại')}
                </span>
                <div className="font-bold text-[#181A17]">{displayLocation || notUpdatedText}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5F6977] font-medium">
              {t('horse.originFarmLabel', isEn ? 'Registered Owner:' : 'Chủ sở hữu đăng ký:')}
            </span>
            <span className="font-bold text-[#181A17]">{horse.ownerName || notUpdatedText}</span>
          </div>
        </div>

        {/* Card 2: Medical & Quarantine Compliance */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEAE0] mb-4">
              <h2 className="text-sm font-bold text-[#181A17] m-0">
                {t('horse.medicalQuarantineTitle', isEn ? 'Medical & Quarantine Profile' : 'Hồ Sơ Y Tế & Kiểm Dịch')}
              </h2>
              <Activity size={17} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.fitnessLabel', isEn ? 'Health Status' : 'Tình trạng thể lực')}
                </span>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${medBadgeClass}`}>
                  ● {horse.medicalStatus ? translateHealthStatus(horse.medicalStatus) : (isEn ? 'Pending Verification' : 'Chưa xác minh thú y')}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.vaccineBookLabel', isEn ? 'Vaccination Status' : 'Tiêm chủng thú y')}
                </span>
                <div className="font-bold text-[#287653]">{horse.vaccinationStatus || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.lastExamLabel', isEn ? 'Last Exam Date' : 'Lần khám gần nhất')}
                </span>
                <div className="font-bold text-[#181A17]">{displayLastExam || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">
                  {t('horse.vetDoctorLabel', isEn ? 'Attending Veterinarian' : 'Bác sĩ thú y phụ trách')}
                </span>
                <div className="font-bold text-[#181A17]">{horse.veterinarian || notUpdatedText}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-xs">
              <span className="text-[11px] font-bold text-[#A67C2E] uppercase tracking-wide block mb-1">
                {t('horse.climateReqLabel', isEn ? 'Special Handling Notes' : 'Ghi chú chăm sóc đặc biệt')}
              </span>
              <p className="text-[#181A17] font-medium m-0 leading-relaxed">
                {horse.specialRequirements ||
                  (isEn ? 'No special handling notes recorded.' : 'Không có ghi chú chăm sóc đặc biệt.')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KHO GIẤY TỜ CỦA NGỰA */}
      <HorseDocumentVault horseId={horse.backendId ?? horseId} />

      {/* MEDICAL HISTORY TIMELINE */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#EFEAE0]">
          <div>
            <h2 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
              <Heart size={17} className="text-[#B33E3E] shrink-0" aria-hidden="true" />
              <span>{isEn ? 'Transit Health Logs' : 'Nhật Ký Kiểm Tra Sức Khỏe Lộ Trình'}</span>
            </h2>
            <p className="text-xs text-[#5F6977] mt-0.5 m-0">
              {isEn
                ? 'Vitals, temperature, and veterinary inspection remarks recorded at checkpoints and border gates.'
                : 'Ghi nhận tình trạng thể lực, thân nhiệt và nhịp tim của chiến mã tại từng trạm kiểm tra và cửa khẩu biên giới.'}
            </p>
          </div>
        </div>

        {logsError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 text-xs text-[#B33E3E] flex items-center justify-between gap-2"
          >
            <span>{logsError}</span>
            <button type="button" onClick={fetchHealthLogs} className="font-bold underline cursor-pointer">
              {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
            </button>
          </div>
        )}

        {isLoadingLogs ? (
          <p className="text-xs text-[#747D88] py-4 text-center">
            {isEn ? 'Loading health inspection history...' : 'Đang tải lịch sử kiểm tra sức khỏe...'}
          </p>
        ) : displayMedicalHistory.length === 0 ? (
          <p className="text-xs text-[#747D88] py-4 text-center italic">
            {isEn
              ? 'No transit health logs recorded for this horse yet. Logs appear automatically during active transport checkpoints.'
              : 'Chưa có nhật ký kiểm tra sức khỏe nào được ghi nhận cho con ngựa này. Nhật ký sẽ tự động xuất hiện khi ngựa di chuyển qua các trạm trong chuyến đi.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4 relative pl-6 pt-2">
            <div className="absolute top-3 bottom-3 left-2 w-0.5 bg-[#E8E2D8]" aria-hidden="true" />
            {displayMedicalHistory.map((item: any, idx: number) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between relative gap-3">
                <div
                  aria-hidden="true"
                  className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${
                    idx === 0 ? 'bg-emerald-600' : 'bg-[#747D88]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] text-[#747D88] font-semibold">{item.date}</span>
                  <div className="text-sm font-bold text-[#181A17] mt-0.5">{item.title}</div>
                  <div className="text-xs text-[#5F6977] mt-0.5 flex items-start gap-1.5">
                    <UserCheck size={13} className="text-[#747D88] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{item.examiner}</span>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                    idx === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-[#F0EEE8] text-[#273244]'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      {isEditModalOpen && (
        <EditHorseModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          horse={horse}
          onHorseUpdated={(updated) => {
            setHorse(updated);
            showFeedback(
              isEn
                ? `Updated profile for "${updated.name}" successfully!`
                : `Đã cập nhật thông tin chiến mã "${updated.name}" thành công!`,
              5000,
            );
          }}
        />
      )}

      {isDeleteModalOpen && (
        <DeleteHorseModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          horse={horse}
          onHorseDeleted={() => {
            router.push('/customer/horses');
          }}
        />
      )}
    </div>
  );
}
