'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Plane,
  FileText,
  Upload,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Shield,
  FileCheck2,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { TransportRequest, UserProfile, Horse } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { documentsApi } from '@/features/documents/api/documents.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { StatusBadge, type BadgeVariant } from '@/components/ui/StatusBadge';

const FALLBACK_HORSE_PHOTO =
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80';

function getOrderBadgeVariant(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (s === 'in_transit') return 'transit';
  if (s === 'approved' || s === 'completed' || s === 'confirmed' || s === 'ready_to_depart') return 'success';
  if (s === 'rejected' || s === 'cancelled') return 'danger';
  if (s === 'requested' || s === 'under_review' || s === 'planning' || s === 'change_requested') return 'pending';
  return 'neutral';
}

function getAirportCode(location?: string, explicitCode?: string) {
  if (explicitCode && explicitCode.length === 3) return explicitCode;
  const text = (location || '').toUpperCase();
  const known = ['SGN', 'HAN', 'DAD', 'SIN', 'DXB', 'MEL', 'HKG', 'KUL', 'BKK', 'CDG', 'SYD', 'NRT', 'LHR'];
  const found = known.find((code) => text.includes(code));
  if (found) return found;
  if (text.includes('SINGAPORE')) return 'SIN';
  if (text.includes('HANOI') || text.includes('HÀ NỘI')) return 'HAN';
  if (text.includes('HO CHI MINH') || text.includes('CỦ CHI') || text.includes('TP.HCM')) return 'SGN';
  if (text.includes('BANGKOK') || text.includes('THAI')) return 'BKK';
  if (text.includes('MALAYSIA') || text.includes('SELANGOR')) return 'KUL';
  if (text.includes('DUBAI')) return 'DXB';
  return 'TRN';
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const {
    t,
    language,
    translateStatus,
    translateGender,
    translateBreed,
    translateNotification,
  } = useLanguage();
  const isEn = language === 'en';

  const {
    horses,
    notifications,
    uploadDocumentForRequest,
    markAllNotificationsRead,
    refreshHorses,
  } = useCustomerStore();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docCount, setDocCount] = useState({ pending: 0, missing: 0, approved: 0, total: 0 });
  const [viewMode, setViewMode] = useState<'cockpit' | 'table'>('cockpit');
  const [transitSearchQuery, setTransitSearchQuery] = useState('');

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeRequestForUpload, setActiveRequestForUpload] = useState<string>('');
  const [trackingRequest, setTrackingRequest] = useState<TransportRequest | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoadingOrders(true);
      setLoadError(null);
      const [ordersRes, docsRes] = await Promise.all([
        apiClient<any[]>('/orders/my-orders'),
        documentsApi.getDocuments().catch(() => []),
      ]);
      if (Array.isArray(ordersRes)) {
        setMyOrders(ordersRes);
      } else {
        setMyOrders([]);
      }
      if (Array.isArray(docsRes)) {
        const pending = docsRes.filter((d: any) =>
          ['pending', 'submitted', 'under_review'].includes((d.status || '').toLowerCase())
        ).length;
        const missing = docsRes.filter((d: any) =>
          ['missing', 'rejected', 'expired'].includes((d.status || '').toLowerCase())
        ).length;
        const approved = docsRes.filter((d: any) =>
          (d.status || '').toLowerCase() === 'approved'
        ).length;
        setDocCount({ pending, missing, approved, total: docsRes.length });
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          t('common.loadError', isEn ? 'Failed to load dashboard data.' : 'Không thể tải dữ liệu bảng điều khiển.')
      );
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isEn, t]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    const handleUserUpdate = () => setCurrentUser(getCurrentUser());
    const handleOpenUploadModal = () => {
      setActiveRequestForUpload('');
      setIsUploadModalOpen(true);
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    window.addEventListener('open-customer-upload-modal', handleOpenUploadModal);
    void loadData();
    void refreshHorses();
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
      window.removeEventListener('open-customer-upload-modal', handleOpenUploadModal);
    };
  }, [loadData, refreshHorses]);

  const handleDocumentUploadSuccess = (uploadedDoc: any) => {
    if (activeRequestForUpload) {
      uploadDocumentForRequest(activeRequestForUpload, uploadedDoc.title);
    }
    setActiveRequestForUpload('');
    setIsUploadModalOpen(false);
    toast.success(t('common.success', isEn ? 'Document uploaded successfully' : 'Tải lên tài liệu thành công'));
    void loadData();
  };

  // Metrics derived from real API orders & documents
  const activeShipments = myOrders.filter(
    (o) => !['completed', 'cancelled', 'rejected'].includes((o.status || '').toLowerCase())
  );
  const inTransitShipments = myOrders.filter((o) =>
    ['in_transit', 'ready_to_depart', 'confirmed', 'planning'].includes((o.status || '').toLowerCase())
  );
  const inTransitCount = myOrders.filter((o) =>
    (o.status || '').toLowerCase() === 'in_transit'
  ).length;
  const readyOrPlanningCount = myOrders.filter((o) =>
    ['ready_to_depart', 'confirmed', 'planning'].includes((o.status || '').toLowerCase())
  ).length;
  const historyOrders = myOrders.filter((o) =>
    ['completed', 'cancelled', 'rejected'].includes((o.status || '').toLowerCase())
  );
  const completedCount = myOrders.filter((o) =>
    (o.status || '').toLowerCase() === 'completed'
  ).length;
  const pendingDocsCount = docCount.pending + docCount.missing;
  const docComplianceRate = docCount.total > 0 ? Math.round((docCount.approved / docCount.total) * 100) : null;

  const upcomingTrip =
    myOrders.find((o) => (o.status || '').toLowerCase() === 'in_transit') ||
    myOrders.find((o) => (o.status || '').toLowerCase() === 'ready_to_depart') ||
    myOrders.find((o) => (o.status || '').toLowerCase() === 'confirmed') ||
    myOrders.find((o) => (o.status || '').toLowerCase() === 'planning') ||
    myOrders.find((o) => (o.status || '').toLowerCase() === 'approved') ||
    myOrders[0];

  const upcomingHorseName = upcomingTrip?.horses?.[0]?.name || (isEn ? 'Equine Athlete' : 'Chiến mã');

  const filteredTransits = activeShipments.filter((ord) => {
    if (!transitSearchQuery.trim()) return true;
    const q = transitSearchQuery.toLowerCase();
    const code = (ord.requestCode || `REQ-${ord.id}`).toLowerCase();
    const orig = (ord.originLocation || '').toLowerCase();
    const dest = (ord.destinationLocation || '').toLowerCase();
    const horseMatch = (ord.horses || []).some((h: any) => (h.name || '').toLowerCase().includes(q));
    return code.includes(q) || orig.includes(q) || dest.includes(q) || horseMatch;
  });

  const showcaseHorses = horses.slice(0, 4);

  const openOrderInModal = (ord: any) => {
    const firstHorse = ord.horses?.[0] || {};
    const adapted: TransportRequest = {
      id: ord.id,
      requestCode: ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`,
      horseId: String(firstHorse.horseId || firstHorse.id || ''),
      horse: {
        id: String(firstHorse.horseId || firstHorse.id || ''),
        name: firstHorse.name || upcomingHorseName,
        breed: firstHorse.breed || 'Thoroughbred',
        age: firstHorse.age || 5,
        gender: firstHorse.gender || 'Stallion',
        microchipNumber: firstHorse.microchipNumber || '',
        passportNumber: firstHorse.passportNumber || '',
        ownerName: currentUser?.fullName || currentUser?.name || '',
      },
      horses: ord.horses,
      origin: ord.originLocation || '',
      originCode: getAirportCode(ord.originLocation),
      destination: ord.destinationLocation || '',
      destinationCode: getAirportCode(ord.destinationLocation),
      departureDate: ord.requestedDate
        ? new Date(ord.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
        : '—',
      estimatedArrivalDate: ord.arrivalDate
        ? new Date(ord.arrivalDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
        : t('common.tbd', isEn ? 'TBD' : 'Chưa cập nhật'),
      status: ord.status,
      statusLabel: translateStatus(ord.status),
      activeStepIndex: 1,
      totalSteps: 5,
      pendingDocumentsCount: 0,
    };
    setTrackingRequest(adapted);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. EDITORIAL HEADER */}
      <ScrollReveal direction="up" duration={300}>
        <header className="border-b border-[#E5DDD0] pb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="text-[11px] font-bold tracking-[0.14em] text-[#A67C2E] uppercase" suppressHydrationWarning>
              {new Date().toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <h1 suppressHydrationWarning className="text-2xl sm:text-3xl font-extrabold text-[#181A17] tracking-tight m-0">
              {t('customer.dashboard.welcome', 'Xin chào,')}{' '}
              {currentUser?.fullName || currentUser?.name || (isEn ? 'Valued Client' : 'Quý khách')}
            </h1>
            <p className="text-sm text-[#5F6977] m-0 max-w-3xl">
              {t(
                'customer.dashboard.subtitle',
                'Tổng quan đơn vận chuyển, hồ sơ kiểm dịch và lịch trình của bạn.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setActiveRequestForUpload(
                  upcomingTrip ? upcomingTrip.requestCode || `REQ-${upcomingTrip.id}` : ''
                );
                setIsUploadModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-[#181A17] text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload size={15} className="text-[#A67C2E]" aria-hidden="true" />
              <span>{t('customer.uploadDocsBtn', 'Nộp Hồ Sơ')}</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/customer/requests/new')}
              className="px-4 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <Plus size={15} strokeWidth={2.5} className="text-[#C4B38E]" aria-hidden="true" />
              <span>{t('customer.createRequestBtn', 'Tạo Yêu Cầu Vận Chuyển')}</span>
            </button>
          </div>
        </header>
      </ScrollReveal>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#B33E3E]/30 bg-[#F8EAEA] px-4 py-3 text-xs font-semibold text-[#B33E3E] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-[#B33E3E] text-white font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* 2. KPI STAT SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScrollReveal direction="up" duration={350} delay={50}>
          <Link
            href="/customer/requests"
            className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-5 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#5F6977]">
                {t('customer.kpi.activeRequests', 'Đơn vận chuyển đang mở')}
              </span>
              <FileCheck2 size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-3">
              {isLoadingOrders ? '—' : <NumberTicker value={activeShipments.length} duration={600} />}
            </div>
            <div className="text-[11px] font-medium text-[#747D88] mt-2 inline-flex items-center gap-0.5">
              <span>{isEn ? 'View orders' : 'Xem danh sách đơn'}</span>
              <ChevronRight size={13} aria-hidden="true" />
            </div>
          </Link>
        </ScrollReveal>

        <ScrollReveal direction="up" duration={350} delay={100}>
          <Link
            href="/customer/tracking"
            className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-5 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#5F6977]">
                {t('dashboard.inTransit', 'Chuyến đang vận chuyển')}
              </span>
              <Plane size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-3">
              {isLoadingOrders ? '—' : <NumberTicker value={inTransitCount} duration={600} />}
            </div>
            <div className="text-[11px] font-medium text-[#747D88] mt-2 inline-flex items-center gap-0.5">
              <span>
                {readyOrPlanningCount > 0
                  ? `${readyOrPlanningCount} ${isEn ? 'ready / planned' : 'chờ xuất phát / lập lịch'}`
                  : isEn
                    ? 'Track trips'
                    : 'Theo dõi hành trình'}
              </span>
              <ChevronRight size={13} aria-hidden="true" />
            </div>
          </Link>
        </ScrollReveal>

        <ScrollReveal direction="up" duration={350} delay={150}>
          <Link
            href="/customer/documents"
            className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-5 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#5F6977]">
                {t('nav.documents', 'Hồ sơ kiểm dịch hợp lệ')}
              </span>
              <Shield size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-3">
              {isLoadingOrders || docComplianceRate === null ? (
                '—'
              ) : (
                <NumberTicker value={docComplianceRate} duration={700} suffix="%" />
              )}
            </div>
            <div
              className={`text-[11px] font-semibold mt-2 ${
                pendingDocsCount > 0 || (docComplianceRate !== null && docComplianceRate < 100)
                  ? 'text-[#966516]'
                  : docCount.total === 0
                    ? 'text-[#747D88]'
                    : 'text-[#287653]'
              }`}
            >
              {pendingDocsCount > 0
                ? `${pendingDocsCount} ${isEn ? 'pending' : 'cần xử lý'}`
                : docCount.total === 0
                  ? isEn
                    ? 'No docs yet'
                    : 'Chưa có hồ sơ'
                  : docComplianceRate !== null && docComplianceRate < 100
                    ? `${docCount.approved}/${docCount.total} ${isEn ? 'approved' : 'đã duyệt'}`
                    : isEn
                      ? 'All clear'
                      : 'Đạt chuẩn'}
            </div>
          </Link>
        </ScrollReveal>

        <ScrollReveal direction="up" duration={350} delay={200}>
          <Link
            href="/customer/requests"
            className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-5 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#5F6977]">
                {t('customer.kpi.completedTrips', 'Chuyến vận chuyển hoàn thành')}
              </span>
              <CheckCircle2 size={16} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-3">
              {isLoadingOrders ? '—' : <NumberTicker value={completedCount} duration={600} />}
            </div>
            <div className="text-[11px] font-medium text-[#747D88] mt-2 inline-flex items-center gap-0.5">
              <span>{isEn ? 'Order history' : 'Lịch sử vận chuyển'}</span>
              <ChevronRight size={13} aria-hidden="true" />
            </div>
          </Link>
        </ScrollReveal>
      </div>

      {/* 2.5 ACTIONABLE MISSING / REJECTED DOCUMENTS BANNER */}
      {docCount.missing > 0 && (
        <div
          role="status"
          className="rounded-xl border border-[#DFCA9A] bg-[#F8F0DF] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold text-[#7A591C]">
            <AlertTriangle size={16} className="text-[#966516] shrink-0" aria-hidden="true" />
            <span>
              {isEn
                ? `You have ${docCount.missing} missing or rejected document(s) requiring upload to keep quarantine clearance on schedule.`
                : `Bạn có ${docCount.missing} hồ sơ còn thiếu hoặc cần tải lại để đảm bảo tiến độ kiểm dịch.`}
            </span>
          </div>
          <Link
            href="/customer/documents"
            className="no-underline px-3.5 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2A2D28] text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
          >
            <span>{isEn ? 'Open Documents' : 'Bổ sung hồ sơ ngay'}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* 3. ACTIVE SHIPMENTS */}
      <ScrollReveal direction="up" duration={400} delay={120}>
        {isLoadingOrders && myOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-3 shadow-sm">
            <div className="h-5 w-52 rounded skeleton-shimmer" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-36 rounded-xl skeleton-shimmer" />
              <div className="h-36 rounded-xl skeleton-shimmer" />
            </div>
          </div>
        ) : activeShipments.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#181A17] m-0">
                {t('customer.inTransitJourneysTitle', isEn ? 'Active Shipments' : 'Đơn đang hoạt động')}{' '}
                <span className="text-[#747D88] font-semibold">({activeShipments.length})</span>
              </h2>

              <div className="flex items-center gap-3">
                <div className="inline-flex p-0.5 bg-[#F0EEE8] rounded-lg border border-[#E5DDD0]">
                  <button
                    type="button"
                    onClick={() => setViewMode('cockpit')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'cockpit' ? 'bg-white text-[#181A17] shadow-sm' : 'text-[#5F6977] hover:text-[#181A17]'
                    }`}
                  >
                    <LayoutGrid size={13} aria-hidden="true" />
                    <span>{t('customer.viewCockpit', isEn ? 'Cards' : 'Thẻ')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'table' ? 'bg-[#181A17] text-white shadow-sm' : 'text-[#5F6977] hover:text-[#181A17]'
                    }`}
                  >
                    <List size={13} aria-hidden="true" />
                    <span>{t('customer.viewTable', isEn ? 'Table' : 'Bảng')}</span>
                  </button>
                </div>

                <Link
                  href="/customer/tracking"
                  className="text-xs font-bold text-[#A67C2E] hover:text-[#181A17] inline-flex items-center gap-1 no-underline transition-colors"
                >
                  <span>{t('customer.globalRadar', isEn ? 'Track Trips' : 'Theo dõi hành trình')}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {viewMode === 'cockpit' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(inTransitShipments.length > 0 ? inTransitShipments : activeShipments).slice(0, 4).map((ord) => {
                  const reqCode = ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`;
                  const originCity =
                    ord.originLocation?.split(',')?.[0]?.trim() ||
                    ord.originLocation ||
                    t('common.origin', isEn ? 'Origin' : 'Xuất phát');
                  const destCity =
                    ord.destinationLocation?.split(',')?.[0]?.trim() ||
                    ord.destinationLocation ||
                    t('common.destination', isEn ? 'Destination' : 'Điểm đến');
                  const horseNames =
                    ord.horses?.map((h: any) => h.name).join(', ') ||
                    `${ord.requestedHorseCount || 1} ${isEn ? 'horses' : 'ngựa'}`;
                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-5 flex flex-col gap-4 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="technical-id-badge">{reqCode}</span>
                          <StatusBadge
                            label={translateStatus(ord.status)}
                            variant={getOrderBadgeVariant(ord.status)}
                            hasDot={(ord.status || '').toLowerCase() === 'in_transit'}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => openOrderInModal(ord)}
                          className="text-xs font-bold text-[#A67C2E] hover:underline cursor-pointer"
                        >
                          {t('customer.flightRadarBtn', isEn ? 'Track' : 'Theo dõi')}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 py-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-extrabold text-[#181A17] truncate" title={ord.originLocation}>
                            {originCity}
                          </div>
                          <div className="text-[11px] text-[#5F6977] truncate" title={ord.originLocation}>
                            {ord.originLocation}
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center px-2 min-w-[96px] max-w-[140px]">
                          <div className="flex items-center gap-1.5 w-full">
                            <span className="h-[1px] flex-1 border-t border-dashed border-[#C4B38E]" />
                            <Plane size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                            <span className="h-[1px] flex-1 border-t border-dashed border-[#C4B38E]" />
                          </div>
                          <span className="text-[10px] font-bold text-[#966516] mt-1 truncate max-w-full text-center">
                            {horseNames}
                          </span>
                        </div>

                        <div className="text-right min-w-0 flex-1">
                          <div className="text-base font-extrabold text-[#181A17] truncate" title={ord.destinationLocation}>
                            {destCity}
                          </div>
                          <div className="text-[11px] text-[#5F6977] truncate" title={ord.destinationLocation}>
                            {ord.destinationLocation}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#EFEAE0] text-xs gap-2">
                        <span className="text-[#5F6977]">
                          {t('customer.table.departure', 'Khởi hành')}:{' '}
                          <strong className="text-[#181A17]">
                            {ord.requestedDate
                              ? new Date(ord.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                              : '—'}
                          </strong>
                        </span>
                        <Link
                          href={`/customer/requests/${ord.id}`}
                          className="font-bold text-[#A67C2E] hover:text-[#181A17] inline-flex items-center gap-1"
                        >
                          <span>{t('orders.viewDetails', 'Chi tiết đơn')}</span>
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
                <div className="p-3.5 bg-white border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747D88]" aria-hidden="true" />
                    <input
                      type="text"
                      aria-label={t('customer.searchTransitPlaceholder', 'Tìm theo mã đơn, tên ngựa, địa điểm...')}
                      value={transitSearchQuery}
                      onChange={(e) => setTransitSearchQuery(e.target.value)}
                      placeholder={t('customer.searchTransitPlaceholder', 'Tìm theo mã đơn, tên ngựa, địa điểm...')}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] focus:bg-white text-xs text-[#181A17] outline-none focus:border-[#A67C2E]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[#5F6977] uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4 font-bold">{t('customer.table.requestId', 'Mã đơn')}</th>
                        <th className="py-3 px-4 font-bold">{t('customer.table.route', 'Hành trình')}</th>
                        <th className="py-3 px-4 font-bold">{t('customer.table.horse', 'Chiến mã')}</th>
                        <th className="py-3 px-4 font-bold">{t('customer.table.departure', 'Khởi hành')}</th>
                        <th className="py-3 px-4 font-bold">{t('customer.table.status', 'Trạng thái')}</th>
                        <th className="py-3 px-4 font-bold text-right">{t('customer.table.action', 'Thao tác')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEAE0]">
                      {filteredTransits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-xs text-[#5F6977]">
                            {t('common.noResults', isEn ? 'No matching orders found' : 'Không tìm thấy đơn phù hợp')}
                          </td>
                        </tr>
                      ) : (
                        filteredTransits.slice(0, 8).map((order) => {
                          const reqCode = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
                          const horseNames =
                            order.horses && order.horses.length > 0
                              ? order.horses.map((h: any) => h.name).join(', ')
                              : `${order.requestedHorseCount || 1} ${isEn ? 'horses' : 'chiến mã'}`;
                          return (
                            <tr key={order.id} className="hover:bg-[#FAF8F4] transition-colors">
                              <td className="py-3.5 px-4 font-mono font-bold text-[#A67C2E] whitespace-nowrap">{reqCode}</td>
                              <td className="py-3.5 px-4 font-semibold text-[#181A17]">
                                {order.originLocation} → {order.destinationLocation}
                              </td>
                              <td className="py-3.5 px-4 text-[#273244] font-medium">{horseNames}</td>
                              <td className="py-3.5 px-4 text-[#5F6977] whitespace-nowrap">
                                {order.requestedDate
                                  ? new Date(order.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                                  : '—'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <StatusBadge label={translateStatus(order.status)} variant={getOrderBadgeVariant(order.status)} />
                              </td>
                              <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openOrderInModal(order)}
                                  className="px-2.5 py-1 rounded-lg bg-[#FAF8F4] border border-[#E5DDD0] text-[#A67C2E] font-bold hover:bg-[#181A17] hover:text-white transition-colors cursor-pointer"
                                >
                                  {t('customer.flightRadarBtn', isEn ? 'Track' : 'Theo dõi')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/customer/requests/${order.id}`)}
                                  className="px-2.5 py-1 rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-bold hover:bg-[#F0EEE8] transition-colors cursor-pointer"
                                >
                                  {t('common.view', 'Xem')}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="text-lg font-bold text-[#181A17] m-0">
                  {t('customer.createInternationalTripTitle', 'Khởi Tạo Yêu Cầu Vận Chuyển Ngựa Đua')}
                </h2>
                <p className="text-xs sm:text-sm text-[#5F6977] mt-1.5 mb-4 leading-relaxed">
                  {t('customer.createInternationalTripDesc', 'Đặt dịch vụ ghép chuồng hoặc bao chuyến kèm quy trình kiểm dịch trọn gói.')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">1</span>
                    <span className="text-xs font-semibold text-[#181A17]">{t('customer.stepSelectHorse', 'Chọn chiến mã')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">2</span>
                    <span className="text-xs font-semibold text-[#181A17]">{t('customer.stepQuarantineDocs', 'Hồ sơ kiểm dịch')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">3</span>
                    <span className="text-xs font-semibold text-[#181A17]">{t('customer.stepCharterFlight', 'Theo dõi hành trình')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => router.push('/customer/requests/new')}
                  className="px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus size={15} className="text-[#C4B38E]" aria-hidden="true" />
                  <span>{t('customer.bookTransportNow', 'Tạo đơn vận chuyển ngay')}</span>
                </button>
                <span className="text-[11px] text-[#747D88]">
                  {t('customer.consulting247', 'Hỗ trợ kiểm dịch & hải quan 24/7')}
                </span>
              </div>
            </div>
          </div>
        )}
      </ScrollReveal>

      {/* 4. OPERATIONAL GRID */}
      {(() => {
        const showOrdersPanel = historyOrders.length > 0 || activeShipments.length === 0;
        const ordersPanelList = activeShipments.length > 0 ? historyOrders : myOrders;
        const ordersPanelTitle =
          activeShipments.length > 0
            ? t('customer.orderHistoryTitle', isEn ? 'Recent Order History' : 'Lịch Sử Đơn Vận Chuyển')
            : t('customer.recentRequestsTitle', 'Yêu Cầu Vận Chuyển Gần Đây');

        const stableCard = (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#181A17] m-0">{t('customer.myStableTitle', 'Chiến mã của bạn')}</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FAF8F4] text-[#181A17] border border-[#E5DDD0]">
                  {horses.length}
                </span>
              </div>
              <Link href="/customer/horses" className="text-xs font-bold text-[#A67C2E] hover:underline inline-flex items-center gap-1">
                <span>{t('common.viewAll', 'Tất cả')}</span>
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {showcaseHorses.length > 0 ? (
              <div className="divide-y divide-[#EFEAE0]">
                {showcaseHorses.map((horse: Horse) => {
                  const isTransit = horse.availabilityStatus === 'In Transit' || horse.status === 'in_transit';
                  const imgSrc = getFullPhotoUrl(horse.photoUrl) || FALLBACK_HORSE_PHOTO;
                  return (
                    <Link
                      key={horse.id}
                      href={`/customer/horses/${horse.id}`}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#FAF8F4] transition-colors no-underline"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E5DDD0] shrink-0 bg-[#FAF8F4]">
                          <img
                            src={imgSrc}
                            alt={horse.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_HORSE_PHOTO;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#181A17] truncate">{horse.name}</span>
                            <span className="text-[10px] text-[#747D88] shrink-0">({translateGender(horse.gender)})</span>
                          </div>
                          <div className="text-[11px] text-[#5F6977] truncate">
                            {translateBreed(horse.breed)} • {horse.age} {t('horse.yearsOld', 'tuổi')}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          isTransit
                            ? 'bg-[#FAF8F4] text-[#A67C2E] border-[#D4C5A3]'
                            : 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                        }`}
                      >
                        {isTransit ? t('customer.inFlight', 'Đang vận chuyển') : t('customer.ready', 'Sẵn sàng')}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#5F6977]">
                <p className="m-0 mb-3">{t('customer.noHorsesInList', 'Chưa có chiến mã trong danh sách.')}</p>
                <Link
                  href="/customer/horses"
                  className="px-3.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#181A17] font-bold inline-flex items-center gap-1"
                >
                  <Plus size={13} aria-hidden="true" />
                  <span>{t('customer.registerHorseBtn', 'Đăng Ký Ngựa')}</span>
                </Link>
              </div>
            )}
          </div>
        );

        const notificationsCard = (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#181A17] m-0">{t('common.notifications', 'Thông báo')}</h2>
              <button
                type="button"
                disabled={notifications.length === 0}
                onClick={markAllNotificationsRead}
                className="text-xs font-semibold text-[#A67C2E] hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('common.markAllRead', 'Đã đọc hết')}
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {notifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#747D88]">
                  {t('notifications.empty', isEn ? 'No new notifications' : 'Không có thông báo mới nào')}
                </div>
              ) : (
                notifications.slice(0, 3).map((notif) => {
                  const localized = translateNotification(notif.title, notif.message);
                  return (
                    <Link
                      key={notif.id}
                      href="/customer/notifications"
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF8F4] hover:bg-[#F3EFE4]/60 border border-[#E5DDD0] transition-colors no-underline"
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          notif.type === 'CRITICAL' ? 'bg-[#F8EAEA] text-[#B33E3E]' : 'bg-white border border-[#E5DDD0] text-[#A67C2E]'
                        }`}
                      >
                        {notif.type === 'CRITICAL' ? (
                          <AlertTriangle size={14} aria-hidden="true" />
                        ) : (
                          <Clock size={14} aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#181A17] line-clamp-1">{localized.title}</div>
                        <div className="text-[11px] text-[#5F6977] line-clamp-2 mt-0.5">
                          {localized.message || notif.timeAgo}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
              <Link
                href="/customer/notifications"
                className="text-center text-xs font-bold text-[#A67C2E] hover:underline pt-1"
              >
                {t('customer.viewAllNotifications', 'Xem tất cả thông báo')}
              </Link>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {showOrdersPanel && (
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-[#181A17] m-0">{ordersPanelTitle}</h2>
                    <Link href="/customer/requests" className="text-xs font-bold text-[#A67C2E] hover:underline inline-flex items-center gap-1">
                      <span>{t('common.viewAll', 'Xem tất cả')}</span>
                      <ChevronRight size={13} aria-hidden="true" />
                    </Link>
                  </div>

                  {ordersPanelList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#5F6977]">
                      {isLoadingOrders
                        ? t('common.loading', 'Đang tải danh sách đơn...')
                        : t('customer.noRequestsYet', 'Chưa có yêu cầu vận chuyển nào.')}
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFEAE0]">
                      {ordersPanelList.slice(0, 5).map((req) => {
                        const code = req.requestCode || `REQ-${String(req.id).padStart(3, '0')}`;
                        const orig =
                          req.originLocation?.split(',')?.[0]?.trim() || t('common.origin', isEn ? 'Origin' : 'Xuất phát');
                        const dest =
                          req.destinationLocation?.split(',')?.[0]?.trim() ||
                          t('common.destination', isEn ? 'Destination' : 'Điểm đến');
                        return (
                          <Link
                            key={req.id}
                            href={`/customer/requests/${req.id}`}
                            className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#FAF8F4] transition-colors no-underline"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-lg bg-[#FAF8F4] border border-[#E5DDD0] flex items-center justify-center text-[#A67C2E] shrink-0">
                                <FileText size={16} aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#181A17] font-mono">{code}</div>
                                <div className="text-[11.5px] text-[#5F6977] truncate">
                                  {orig} → {dest} ·{' '}
                                  {req.requestedDate
                                    ? new Date(req.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                                    : '—'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge label={translateStatus(req.status)} variant={getOrderBadgeVariant(req.status)} />
                              <ChevronRight size={14} className="text-[#747D88]" aria-hidden="true" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showOrdersPanel ? (
              <div className="lg:col-span-4 flex flex-col gap-6">
                {stableCard}
                {notificationsCard}
              </div>
            ) : (
              <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {stableCard}
                {notificationsCard}
              </div>
            )}
          </div>
        );
      })()}

      {/* Modals */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setActiveRequestForUpload('');
        }}
        onSuccess={handleDocumentUploadSuccess}
      />

      <TripTrackingModal
        isOpen={Boolean(trackingRequest)}
        onClose={() => setTrackingRequest(null)}
        request={trackingRequest}
      />
    </div>
  );
}
