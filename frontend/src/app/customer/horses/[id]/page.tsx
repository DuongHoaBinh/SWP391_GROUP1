'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileCheck2,
  FileText,
  ShieldCheck,
  Truck,
  Upload,
  AlertTriangle,
  UserCheck,
  Download,
  Info,
  ChevronRight,
  Camera,
  Edit2,
  Trash2,
  Activity,
  Heart,
} from 'lucide-react';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { Horse, HorseDocument } from '@/lib/types';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { EditHorseModal } from '@/components/horses/EditHorseModal';
import { DeleteHorseModal } from '@/components/horses/DeleteHorseModal';
import { Modal } from '@/components/ui/Modal';
import { apiClient, openAuthenticatedDocument } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const getFallbackHorsePhoto = () =>
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80';

export default function HorseDetailPage() {
  const { t, language, translateGender, translateBreed, translateColor, translateHealthStatus } = useLanguage();
  const isEn = language === 'en';
  const params = useParams();
  const router = useRouter();
  const horseId = params?.id as string;

  const { getHorseById, requests, uploadHorseAvatar } = useCustomerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const initialLocal = getHorseById(horseId);
  const [horse, setHorse] = useState<Horse | undefined>(initialLocal);
  const [isLoading, setIsLoading] = useState(!initialLocal);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Real backend documents & health tracking logs
  const [horseDocs, setHorseDocs] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [medicalLogs, setMedicalLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<HorseDocument | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const formatDocTypeName = useCallback(
    (docType: string): string => {
      switch (docType) {
        case 'passport':
        case 'horse_passport':
          return isEn ? 'FEI Horse Passport' : 'Hộ chiếu ngựa (FEI Passport)';
        case 'health_certificate':
        case 'health_cert':
          return isEn ? 'Veterinary Health Certificate' : 'Chứng nhận sức khỏe thú y';
        case 'quarantine_permit':
        case 'quarantine_certificate':
          return isEn ? 'Quarantine Isolation Certificate' : 'Giấy phép kiểm dịch';
        case 'import_permit':
          return isEn ? 'Import Veterinary Permit' : 'Giấy phép nhập khẩu';
        case 'export_permit':
          return isEn ? 'Export Quarantine Permit' : 'Giấy phép xuất khẩu';
        case 'customs_declaration':
          return isEn ? 'Customs Transit Declaration' : 'Tờ khai hải quan';
        default:
          return docType || (isEn ? 'Quarantine Document' : 'Tài liệu kiểm dịch');
      }
    },
    [isEn]
  );

  const formatDocStatus = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'submitted':
      case 'under_review':
        return 'Under Review';
      case 'rejected':
        return 'Rejected';
      case 'expired':
        return 'Expired';
      default:
        return 'Missing';
    }
  };

  const fetchHorseDocs = useCallback(() => {
    if (!horseId) return;
    setIsLoadingDocs(true);
    setDocsError(null);
    apiClient<any[]>(`/documents/horse/${horseId}`)
      .then((data) => {
        if (Array.isArray(data)) {
          const mapped = data.map((d) => {
            const docTypeDisplay = formatDocTypeName(d.docType);
            const statusDisplay = formatDocStatus(d.status);
            return {
              id: d.id,
              title: d.regulationTitle || docTypeDisplay,
              type: docTypeDisplay,
              docType: d.docType,
              docNumber: d.docNumber || '—',
              uploadedDate: d.createdAt ? new Date(d.createdAt).toISOString().split('T')[0] : '—',
              expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString().split('T')[0] : null,
              status: statusDisplay,
              rawStatus: d.status,
              fileUrl: d.fileUrl,
              reviewerNotes: d.reviewerNotes,
              regulationCountry: d.regulationCountry,
            };
          });
          setHorseDocs(mapped);
        }
      })
      .catch((err: any) => {
        setDocsError(err?.message || (isEn ? 'Could not load documents.' : 'Không thể tải danh sách chứng từ.'));
      })
      .finally(() => setIsLoadingDocs(false));
  }, [horseId, formatDocTypeName, isEn]);

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
            title: log.legName || (isEn ? 'Transit Checkpoint Health Check' : 'Kiểm tra sức khỏe trạm vận chuyển'),
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
        setLogsError(err?.message || (isEn ? 'Could not load health logs.' : 'Không thể tải nhật ký sức khỏe.'));
      })
      .finally(() => setIsLoadingLogs(false));
  }, [horseId, isEn]);

  useEffect(() => {
    fetchHorseDocs();
    fetchHealthLogs();
  }, [fetchHorseDocs, fetchHealthLogs]);

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
          const dobFormatted = res.dob
            ? res.dob
            : res.dateOfBirth
              ? new Date(res.dateOfBirth).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
              : '';
          const mapped: Horse = {
            id: String(res.id || horseId),
            backendId: res.id ? Number(res.id) : undefined,
            code: res.code || res.passportNo || (res.id ? `HOR-2026-${String(res.id).padStart(3, '0')}` : undefined),
            name: res.name,
            breed: res.breed || 'Thoroughbred',
            age: Number(res.age) || 5,
            gender:
              res.gender === 'female' || res.gender === 'Mare'
                ? 'Mare'
                : res.gender === 'gelding' || res.gender === 'Gelding'
                  ? 'Gelding'
                  : 'Stallion',
            dob: dobFormatted,
            color: res.color || '',
            weight: res.weight ? String(res.weight) : '',
            microchipNumber: res.microchipNumber || res.microchipNo || '',
            passportNumber: res.passportNumber || res.passportNo || '',
            ownerName: res.ownerName || '',
            medicalStatus: res.medicalStatus || 'Healthy',
            vaccinationStatus: res.vaccinationStatus || '',
            quarantineStatus: res.quarantineStatus || 'Pending',
            lastExamDate: res.lastExamDate || '',
            veterinarian: res.veterinarian || '',
            specialRequirements: res.specialRequirements || '',
            location: res.location || '',
            photoUrl: res.photoUrl || undefined,
            documents: res.documents && res.documents.length > 0 ? res.documents : localAtFetch?.documents || [],
            ...res,
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
        (r.horses && r.horses.some((item: any) => String(item.horse?.id) === String(h.id) || String(item.id) === String(h.id))) ||
        (r.horse?.name && h.name && r.horse.name.toLowerCase().trim() === h.name.toLowerCase().trim());

      const upper = String(r.status || '').toUpperCase();
      const isFinished = upper === 'COMPLETED' || upper === 'CANCELLED' || upper === 'REJECTED';
      return match && !isFinished;
    });
  };

  const activeOrder = horse ? getHorseActiveOrder(horse) : undefined;
  const isTransit = horse
    ? (horse.availabilityStatus || '').toLowerCase().includes('transit') ||
      activeOrder?.status === 'IN_TRANSIT' ||
      activeOrder?.status === 'in_transit'
    : false;

  const displayDocs = horseDocs.length > 0 ? horseDocs : horse?.documents || [];
  const displayMedicalHistory = medicalLogs.length > 0 ? medicalLogs : horse?.medicalHistory || [];
  const hasMissingDoc = displayDocs.some((d: any) => d.status === 'Missing');

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !horse) return;
    try {
      setIsUploadingAvatar(true);
      await uploadHorseAvatar(horse.id, file);
      showFeedback(
        t('horse.avatarUpdateSuccess', isEn ? 'Horse avatar updated successfully!' : 'Cập nhật ảnh đại diện chiến mã thành công!'),
        4000
      );
    } catch (err: any) {
      toast.error(err?.message || t('horse.avatarUpdateFail', isEn ? 'Could not upload avatar.' : 'Không thể tải lên ảnh đại diện. Vui lòng thử lại.'));
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadSuccess = () => {
    fetchHorseDocs();
    showFeedback(
      t('horse.docUploadSuccess', isEn ? 'Quarantine document uploaded and sent for specialist review!' : 'Hồ sơ kiểm dịch đã được tải lên và chuyển tới chuyên viên thẩm định!'),
      5000
    );
  };

  const translateDocType = (type: string, title?: string) => {
    if (language === 'vi') return title || type;
    switch (type) {
      case 'Hộ chiếu ngựa (FEI Passport)':
      case 'FEI Passport':
        return 'FEI Horse Passport';
      case 'Chứng nhận tiêm chủng cúm & dại':
      case 'Vaccination Record':
        return 'Equine Influenza & Rabies Vaccine Record';
      case 'Xét nghiệm âm tính Coggins (EIA)':
      case 'Coggins Test':
        return 'Coggins Test (EIA Negative)';
      case 'Giấy chứng nhận kiểm dịch xuất cảnh':
      case 'Export Quarantine Permit':
        return 'Export Veterinary Health Certificate';
      case 'Giấy phép nhập cảnh cục thú y nước đến':
      case 'Import Permit':
        return 'Import Veterinary Quarantine Permit';
      default:
        return title || type;
    }
  };

  const translateDocStatusBadge = (s: string) => {
    switch (s) {
      case 'Approved':
        return t('horse.docApproved', '✓ Đạt chuẩn');
      case 'Under Review':
        return t('horse.docUnderReview', '⏳ Đang thẩm định');
      case 'Rejected':
        return t('horse.docRejected', isEn ? '✕ Rejected' : '✕ Bị từ chối');
      case 'Expired':
        return isEn ? '✕ Expired' : '✕ Hết hạn';
      case 'Missing':
      default:
        return t('horse.docMissing', '✕ Thiếu giấy tờ');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="w-12 h-12 border-4 border-[#C4B38E] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-[#5F6977]">{t('horse.loadingProfile', 'Đang tải hồ sơ chiến mã...')}</p>
      </div>
    );
  }

  if (!horse) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 text-center bg-white rounded-3xl border border-[#D8CEBE] shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-4">
          <Info size={32} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-[#181A17] m-0">{t('horse.notFoundTitle', 'Không tìm thấy thông tin cá thể ngựa')}</h1>
        <p className="text-sm text-[#5F6977] mt-2 mb-6">
          {t('horse.notFoundDesc', 'Dữ liệu không tồn tại hoặc đã được chuyển vào mục lưu trữ.')}
        </p>
        <Link
          href="/customer/horses"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#181A17] text-white font-bold text-xs hover:bg-[#242722] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('horse.backToStable', isEn ? 'Back to Stable' : 'Quay lại danh sách')}</span>
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

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-[#747D88] flex-wrap">
        <Link href="/customer" className="text-[#5F6977] hover:text-[#181A17] no-underline transition-colors">
          {t('nav.dashboard', 'Bảng điều khiển')}
        </Link>
        <ChevronRight size={13} className="text-[#747D88]" aria-hidden="true" />
        <Link href="/customer/horses" className="text-[#5F6977] hover:text-[#181A17] no-underline transition-colors">
          {t('horse.fleetTitle', isEn ? 'My Horses' : 'Quản Lý Ngựa Đua')}
        </Link>
        <ChevronRight size={13} className="text-[#747D88]" aria-hidden="true" />
        <span className="text-[#181A17] font-bold truncate max-w-[220px]">{horse.name}</span>
      </nav>

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
              aria-label={t('horse.changeAvatarHint', isEn ? 'Change racehorse avatar' : 'Nhấp để thay đổi ảnh đại diện')}
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-[#E5DDD0] shadow-sm shrink-0 cursor-pointer group bg-[#FAF8F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
            >
              <img
                src={horsePhoto}
                alt={horse.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex flex-col items-center justify-center text-white gap-1">
                <Camera size={18} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('horse.changePhoto', 'Đổi ảnh')}</span>
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
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
                    ● {t('horse.stableReady', isEn ? 'Ready in Stable' : 'Sẵn sàng tại chuồng')}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#181A17] m-0">
                {horse.name}
              </h1>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-[#5F6977] mt-2 font-medium">
                <span>
                  {t('horses.age', 'Tuổi')}: <strong className="text-[#181A17]">{horse.age} {t('horse.yearsOld', 'tuổi')}</strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horse.genderLabel', 'Giới tính')}: <strong className="text-[#181A17]">{translateGender(horse.gender)}</strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horse.colorLabel', 'Màu lông')}: <strong className="text-[#181A17]">{horse.color ? translateColor(horse.color) : '—'}</strong>
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {t('horse.weightLabel', 'Thể trọng')}: <strong className="text-[#181A17]">{horse.weight || '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-[#EFEAE0]">
            {isTransit && activeOrder ? (
              <Link
                href={`/customer/requests/${activeOrder.id}`}
                className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 no-underline"
              >
                <Truck size={14} className="text-[#C4B38E]" aria-hidden="true" />
                <span>{t('horse.viewOrderBtn', 'Xem Đơn')} ({activeOrder.requestCode || `#${activeOrder.id}`})</span>
              </Link>
            ) : (
              <Link
                href={`/customer/requests/new?horseId=${horse.id}`}
                className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 no-underline"
              >
                <Truck size={14} className="text-[#C4B38E]" aria-hidden="true" />
                <span>{t('horse.bookNewTripBtn', 'Tạo Chuyến Vận Chuyển')}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:border-[#B49A68] text-[#181A17] text-xs font-semibold transition-colors border border-[#D8CEBE] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 size={13} aria-hidden="true" />
              <span>{t('common.edit', 'Sửa')}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-[#F8EAEA]/60 hover:bg-[#F8EAEA] text-[#B33E3E] text-xs font-semibold transition-colors border border-[#E5B8B8] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>{t('common.delete', 'Xóa')}</span>
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
                {t('horse.studbookTitle', 'Hồ Sơ Nhận Diện & Phả Hệ')}
              </h2>
              <ShieldCheck size={17} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.microchipLabel', 'Số Microchip ISO')}</span>
                <div className="font-mono font-bold text-[#181A17] break-all">{horse.microchipNumber || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.passportLabel', 'Số Hộ Chiếu FEI')}</span>
                <div className="font-mono font-bold text-[#181A17] break-all">{horse.passportNumber || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.dobLabel', 'Ngày sinh')}</span>
                <div className="font-bold text-[#181A17]">{horse.dob || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.currentLocation', 'Địa điểm lưu trú hiện tại')}</span>
                <div className="font-bold text-[#181A17]">{horse.location || notUpdatedText}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5F6977] font-medium">{t('horse.originFarmLabel', isEn ? 'Registered Owner:' : 'Chủ sở hữu đăng ký:')}</span>
            <span className="font-bold text-[#181A17]">{horse.ownerName || notUpdatedText}</span>
          </div>
        </div>

        {/* Card 2: Medical & Quarantine Compliance */}
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEAE0] mb-4">
              <h2 className="text-sm font-bold text-[#181A17] m-0">
                {t('horse.medicalQuarantineTitle', 'Hồ Sơ Y Tế & Kiểm Dịch')}
              </h2>
              <Activity size={17} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.fitnessLabel', 'Tình trạng thể lực')}</span>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${medBadgeClass}`}>
                  ● {translateHealthStatus(horse.medicalStatus || 'Healthy')}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.vaccineBookLabel', 'Tiêm chủng thú y')}</span>
                <div className="font-bold text-[#287653]">{horse.vaccinationStatus || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.lastExamLabel', 'Lần khám gần nhất')}</span>
                <div className="font-bold text-[#181A17]">{horse.lastExamDate || notUpdatedText}</div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#747D88] block mb-0.5">{t('horse.vetDoctorLabel', 'Bác sĩ thú y phụ trách')}</span>
                <div className="font-bold text-[#181A17]">{horse.veterinarian || notUpdatedText}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-xs">
              <span className="text-[11px] font-bold text-[#A67C2E] uppercase tracking-wide block mb-1">
                {t('horse.climateReqLabel', 'Ghi chú chăm sóc đặc biệt')}
              </span>
              <p className="text-[#181A17] font-medium m-0 leading-relaxed">
                {horse.specialRequirements || (isEn ? 'No special handling notes recorded.' : 'Không có ghi chú chăm sóc đặc biệt.')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* DOCUMENTS MATRIX & UPLOAD AUDIT */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 bg-white border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
              <FileCheck2 size={17} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
              <span>{t('horse.quarantineDocsMatrixTitle', 'Hồ sơ & Giấy phép kiểm dịch')}</span>
            </h2>
            <p className="text-xs text-[#5F6977] mt-1 m-0">
              {t('horse.quarantineDocsMatrixDesc', 'Danh sách chứng từ thú y và giấy phép xuất nhập cảnh của ngựa.')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <Upload size={14} className="text-[#C4B38E]" aria-hidden="true" />
            <span>{t('horse.uploadNewCertBtn', 'Tải Lên Chứng Thư Mới')}</span>
          </button>
        </div>

        {hasMissingDoc && (
          <div className="mx-6 my-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-4 text-xs flex-wrap">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-rose-600 shrink-0" aria-hidden="true" />
              <div>
                <strong className="text-rose-950 block">{t('horse.missingDocAlert', 'Phát hiện hồ sơ kiểm dịch còn thiếu!')}</strong>
                <span className="text-rose-800">{t('horse.missingDocAlertDesc', 'Vui lòng bổ sung đầy đủ tài liệu trước khi xe chuyên dụng nhận ngựa.')}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#B33E3E] text-white font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              {t('horse.uploadNowBtn', 'Bổ sung ngay')}
            </button>
          </div>
        )}

        {docsError && (
          <div role="alert" className="mx-6 mt-4 p-3 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 text-xs text-[#B33E3E] flex items-center justify-between gap-2">
            <span>{docsError}</span>
            <button type="button" onClick={fetchHorseDocs} className="font-bold underline cursor-pointer">
              {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">{t('horse.docTitleCol', 'Tên tài liệu / Chứng thư')}</th>
                <th className="py-3.5 px-6">{t('horse.docCategoryCol', 'Phân loại')}</th>
                <th className="py-3.5 px-6">{t('horse.docIssueDateCol', 'Ngày cấp')}</th>
                <th className="py-3.5 px-6">{t('horse.docExpiryDateCol', 'Hạn hiệu lực')}</th>
                <th className="py-3.5 px-6">{t('horse.docReviewStatusCol', 'Trạng thái thẩm định')}</th>
                <th className="py-3.5 px-6 text-right">{t('common.actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E2D8] font-medium">
              {isLoadingDocs ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#747D88]">
                    {t('common.loading', isEn ? 'Loading quarantine documents...' : 'Đang tải danh sách tài liệu kiểm dịch...')}
                  </td>
                </tr>
              ) : displayDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#747D88]">
                    {t('customer.noDocumentsUploaded', isEn ? 'No quarantine documents uploaded for this horse yet.' : 'Chưa có tài liệu kiểm dịch nào được tải lên cho con ngựa này.')}
                  </td>
                </tr>
              ) : (
                displayDocs.map((doc: any) => (
                  <tr key={doc.id} className="hover:bg-[#FAF8F4] transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2.5">
                        <FileText size={17} className={doc.status === 'Missing' ? 'text-rose-500 shrink-0' : 'text-[#A67C2E] shrink-0'} aria-hidden="true" />
                        <span className="font-bold text-[#181A17]">{translateDocType(doc.type, doc.title)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-[#5F6977]">{translateDocType(doc.type)}</td>
                    <td className="py-4 px-6 font-mono text-[#5F6977]">{doc.uploadedDate || '—'}</td>
                    <td className="py-4 px-6 font-mono text-[#5F6977]">{doc.expiryDate || '—'}</td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                          doc.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : doc.status === 'Under Review'
                              ? 'bg-[#F3EFE4] text-[#181A17] border border-[#EAE5DA]'
                              : doc.status === 'Expired'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {translateDocStatusBadge(doc.status)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      {doc.status === 'Missing' ? (
                        <button
                          type="button"
                          onClick={() => setIsUploadOpen(true)}
                          className="text-rose-600 font-bold hover:underline cursor-pointer"
                        >
                          {t('horse.uploadDocAction', 'Tải lên ngay')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="text-[#A67C2E] font-bold hover:underline cursor-pointer"
                        >
                          {t('common.viewDetails', 'Xem chi tiết')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
          <div role="alert" className="p-3 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 text-xs text-[#B33E3E] flex items-center justify-between gap-2">
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
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

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
              5000
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

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <Modal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={translateDocType(previewDoc.type, previewDoc.title)}
          subtitle={`${t('horse.docCategoryCol', 'Phân loại')}: ${translateDocType(previewDoc.type)}`}
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-[#F0EEE8] rounded-2xl flex flex-col gap-3 border border-[#D8CEBE]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAF8F4] text-[#A67C2E] flex items-center justify-center shrink-0">
                  <FileText size={22} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#181A17] text-sm truncate">
                    {translateDocType(previewDoc.type, previewDoc.title)}
                  </div>
                  <div className="text-[11px] text-[#5F6977] font-mono">{previewDoc.id || 'DOC-AUTO'}</div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                    previewDoc.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : previewDoc.status === 'Under Review'
                        ? 'bg-[#F3EFE4] text-[#181A17]'
                        : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {translateDocStatusBadge(previewDoc.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#D8CEBE]">
                <div>
                  <span className="text-[10px] text-[#747D88] font-bold uppercase block">
                    {t('horse.docIssueDateCol', 'Ngày cấp')}
                  </span>
                  <span className="font-semibold text-[#273244]">{previewDoc.uploadedDate || notUpdatedText}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#747D88] font-bold uppercase block">
                    {t('horse.docExpiryDateCol', 'Hạn hiệu lực')}
                  </span>
                  <span className="font-semibold text-[#273244]">{previewDoc.expiryDate || t('common.permanent', 'Vô thời hạn')}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{t('horse.iataCertifiedNote', 'Chứng từ đã được lưu trữ và xác thực trên hệ thống.')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-xl border border-[#D8CEBE] text-xs font-bold text-[#273244] hover:bg-[#F0EEE8] transition-colors cursor-pointer"
              >
                {t('common.close', 'Đóng')}
              </button>
              {previewDoc.fileUrl && (
                <button
                  type="button"
                  onClick={() => openAuthenticatedDocument(previewDoc.id, previewDoc.fileUrl)}
                  className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E] border border-[#C4B38E]/40 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} aria-hidden="true" />
                  <span>{t('common.downloadFile', 'Mở / Tải tệp')}</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
