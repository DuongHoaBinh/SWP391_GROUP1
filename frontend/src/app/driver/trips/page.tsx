'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Truck,
  MapPin,
  CheckCircle2,
  Navigation,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Stethoscope,
  UserCheck,
  Layers,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { routesApi, RouteDetail } from '@/features/routes/api/routes.api';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DriverTripItem {
  id: number;
  orderCode: string;
  customerName?: string;
  horseName: string;
  horses?: any[];
  horseCount: number;
  origin: string;
  destination: string;
  departureDate?: string;
  shipmentStatus: string;
  planStatus: string;
  routeDetail?: RouteDetail;
  assignedStaff?: any[];
  assignedVehicles?: any[];
  isCurrentDriverConfirmed: boolean;
  confirmedAt?: string;
  driverRoleInTrip?: string;
  isAssignedToMe?: boolean;
}

export default function DriverTripsPage() {
  const pathname = usePathname();
  const { t, language, translateStatus, translateVehicleType, translateStopType } = useLanguage();
  const [trips, setTrips] = useState<DriverTripItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'assigned' | 'all'>('assigned');
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscort ? '/escort' : '/driver';

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedTripToConfirm, setSelectedTripToConfirm] = useState<DriverTripItem | null>(null);
  const [confirmationNotes, setConfirmationNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Decline Modal
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [selectedTripToDecline, setSelectedTripToDecline] = useState<DriverTripItem | null>(null);
  const [declineReasonKey, setDeclineReasonKey] = useState('medical_issue');
  const [customDeclineReason, setCustomDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  const declineOptions = [
    { key: 'medical_issue', label: t('driver.trips.reasonMedical', language === 'en' ? 'Sudden illness / Unfit for duty' : 'Sốt cao đột xuất / Sức khỏe không đảm bảo') },
    { key: 'vehicle_issue', label: t('driver.trips.reasonVehicle', language === 'en' ? 'Vehicle technical inspection pending' : 'Xe gặp sự cố kỹ thuật chưa kiểm định kịp') },
    { key: 'family_issue', label: t('driver.trips.reasonFamily', language === 'en' ? 'Urgent family emergency' : 'Bận việc gia đình đột xuất') },
    { key: 'vet_exam_clash', label: t('driver.trips.reasonVetClash', language === 'en' ? 'Veterinary schedule conflict' : 'Trùng lịch kiểm tra thú y định kỳ') },
    { key: 'other', label: t('driver.trips.reasonOther', language === 'en' ? 'Other' : 'Khác') },
  ];

  const loadDriverTrips = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const activeUser = getCurrentUser();
    setCurrentUser(activeUser);

    const escortFromUser =
      activeUser?.persona === 'escort' ||
      activeUser?.specialization === 'escort' ||
      activeUser?.email?.toLowerCase().includes('escort') ||
      Boolean(pathname?.startsWith('/escort'));

    try {
      const orders = await apiClient<any[]>('/orders');
      if (Array.isArray(orders)) {
        const enriched: DriverTripItem[] = [];
        const userEmail = (activeUser?.email || '').toLowerCase().trim();
        const userId = String(activeUser?.id || '');

        const chunkSize = 5;
        for (let i = 0; i < orders.length; i += chunkSize) {
          const chunk = orders.slice(i, i + chunkSize);
          await Promise.allSettled(
            chunk.map(async (ord) => {
              try {
                const [routeRes, assignRes] = await Promise.allSettled([
                  routesApi.findRouteByShipmentId(ord.id),
                  apiClient<any>(`/fleet/shipments/${ord.id}/assignments`),
                ]);

                const routeDetail = routeRes.status === 'fulfilled' ? (routeRes.value ?? undefined) : undefined;
                const staffList =
                  assignRes.status === 'fulfilled' && assignRes.value?.staff
                    ? assignRes.value.staff
                    : [];
                const vehicleList =
                  assignRes.status === 'fulfilled' && assignRes.value?.vehicles
                    ? assignRes.value.vehicles
                    : [];

                const myAssignment = staffList.find((s: any) => {
                  const sUserId = String(s.userId || s.user?.id || '');
                  const sEmail = (s.user?.email || '').toLowerCase().trim();

                  return (
                    (Boolean(userId) && Boolean(sUserId) && sUserId === userId) ||
                    (Boolean(userEmail) && Boolean(sEmail) && sEmail === userEmail)
                  );
                });

                const isAssignedToMe = Boolean(myAssignment);
                const isConfirmed = Boolean(myAssignment?.isConfirmed);

                enriched.push({
                  id: ord.id,
                  orderCode: ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`,
                  customerName:
                    ord.customer?.fullName ||
                    ord.customerName ||
                    (language === 'en' ? 'VIP Client' : 'Khách hàng VIP'),
                  horseName: ord.horses?.[0]?.name || (language === 'en' ? 'Racehorse' : 'Chiến Mã'),
                  horses: ord.horses || [],
                  horseCount: Number(ord.requestedHorseCount || ord.horses?.length || 1),
                  origin: ord.originLocation || '—',
                  destination: ord.destinationLocation || '—',
                  departureDate: ord.requestedDate
                    ? new Date(ord.requestedDate).toLocaleDateString(
                        language === 'en' ? 'en-US' : 'vi-VN',
                        { year: 'numeric', month: 'short', day: 'numeric' }
                      )
                    : '—',
                  shipmentStatus: ord.status,
                  planStatus: routeDetail?.planStatus || 'draft',
                  routeDetail,
                  assignedStaff: staffList,
                  assignedVehicles: vehicleList,
                  isCurrentDriverConfirmed: isConfirmed,
                  confirmedAt: myAssignment?.confirmedAt,
                  driverRoleInTrip:
                    myAssignment?.roleInShipment || (escortFromUser ? 'escort' : 'driver'),
                  isAssignedToMe,
                });
              } catch (e) {
                console.warn(`Could not load details for order #${ord.id}`, e);
              }
            })
          );
        }

        const relevantTrips = enriched.filter(
          (tr) =>
            tr.planStatus !== 'draft' ||
            Boolean(tr.assignedStaff?.length) ||
            tr.shipmentStatus === 'in_transit' ||
            tr.shipmentStatus === 'planning' ||
            tr.shipmentStatus === 'completed'
        );

        setTrips(relevantTrips.length > 0 ? relevantTrips : enriched);
        return;
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        t(
          'driver.trips.loadFailed',
          language === 'en'
            ? 'Unable to load assigned trips from server.'
            : 'Không thể tải danh sách chuyến đi từ hệ thống.'
        );
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }

    setTrips([]);
  }, [language, pathname, t]);

  useEffect(() => {
    void loadDriverTrips();
  }, [loadDriverTrips]);

  const handleOpenConfirmModal = (trip: DriverTripItem) => {
    setSelectedTripToConfirm(trip);
    setConfirmationNotes(
      t(
        'driver.trips.defaultConfirmNote',
        language === 'en'
          ? 'Assignment acknowledged, vehicle pre-trip inspection complete.'
          : 'Đã nhận lệnh vận chuyển, kiểm tra xe hoàn tất và sẵn sàng xuất phát.'
      )
    );
    setConfirmModalOpen(true);
  };

  const closeConfirmModal = () => {
    if (isConfirming) return;
    setConfirmModalOpen(false);
    setSelectedTripToConfirm(null);
    setConfirmationNotes('');
  };

  const handleConfirmAssignment = async () => {
    if (!selectedTripToConfirm || isConfirming) return;
    setIsConfirming(true);

    try {
      const res = await routesApi.confirmTripAssignment(selectedTripToConfirm.id, {
        confirmationNotes:
          confirmationNotes.trim() ||
          t(
            'driver.trips.defaultConfirmNote',
            language === 'en'
              ? 'Assignment acknowledged, ready for departure.'
              : 'Đã nhận lệnh vận chuyển, kiểm tra xe hoàn tất và sẵn sàng xuất phát.'
          ),
      });

      toast.success(
        res.isFullyConfirmed
          ? t(
              'driver.trips.fullyConfirmedSuccess',
              language === 'en'
                ? 'Trip confirmed! Full crew ready.'
                : 'Đã xác nhận chuyến đi! Toàn bộ tổ lái đã sẵn sàng, kế hoạch chuyển sang Đã xác nhận.'
            )
          : t(
              'driver.trips.confirmedSuccess',
              language === 'en' ? 'Trip assignment confirmed!' : 'Bạn đã xác nhận nhận chuyến thành công!'
            )
      );

      setConfirmModalOpen(false);
      setSelectedTripToConfirm(null);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('driver.trips.confirmFailed', language === 'en' ? 'Unable to confirm trip.' : 'Không thể xác nhận chuyến đi')
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const handleOpenDeclineModal = (trip: DriverTripItem) => {
    setSelectedTripToDecline(trip);
    setDeclineReasonKey('medical_issue');
    setCustomDeclineReason('');
    setDeclineModalOpen(true);
  };

  const closeDeclineModal = () => {
    if (isDeclining) return;
    setDeclineModalOpen(false);
    setSelectedTripToDecline(null);
    setCustomDeclineReason('');
  };

  const handleDeclineAssignment = async () => {
    if (!selectedTripToDecline || isDeclining) return;
    const matched = declineOptions.find((o) => o.key === declineReasonKey);
    const finalReason =
      declineReasonKey === 'other'
        ? customDeclineReason.trim()
        : matched?.label || declineReasonKey;
    if (!finalReason) {
      toast.error(
        t(
          'driver.trips.declineReasonRequired',
          language === 'en' ? 'Please provide a reason for declining.' : 'Vui lòng cung cấp lý do từ chối chuyến đi'
        )
      );
      return;
    }
    setIsDeclining(true);

    try {
      await routesApi.declineTripAssignment(selectedTripToDecline.id, {
        reason: finalReason,
      });

      toast.success(
        t(
          'driver.trips.declinedSuccess',
          language === 'en'
            ? 'Decline reason sent to Operations Manager!'
            : 'Đã gửi thông báo từ chối nhận chuyến đến Quản lý vận hành!'
        )
      );
      setDeclineModalOpen(false);
      setSelectedTripToDecline(null);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('driver.trips.declineFailed', language === 'en' ? 'Unable to submit decline response.' : 'Không thể gửi phản hồi từ chối')
      );
    } finally {
      setIsDeclining(false);
    }
  };

  const filteredTrips = trips
    .filter((tr) => {
      if (viewMode === 'assigned') {
        return Boolean(tr.isAssignedToMe);
      }
      return true;
    })
    .filter(
      (tr) =>
        tr.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tr.horseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tr.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tr.destination.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('driver.trips.title', language === 'en' ? 'My Transport Assignments' : 'Nhiệm Vụ Vận Chuyển Của Tôi')}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
              {t('driver.trips.badge', language === 'en' ? 'Dispatch & Route Acceptance' : 'Nhiệm Vụ Vận Chuyển & Tiếp Nhận Lộ Trình')}
            </span>
          </div>
          <p className="text-sm text-[#57564E] mt-1 mb-0">
            {t(
              'driver.trips.subtitle',
              language === 'en'
                ? 'Review dispatch schedule, horse manifest, transit legs, and confirm duty acceptance.'
                : 'Xem lịch trình điều phối, manifest ngựa, lộ trình các chặng đường bộ & xác nhận tiếp nhận chuyến đi.'
            )}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void loadDriverTrips()}
          disabled={isLoading}
          className="min-h-[44px] px-4 shadow-sm border-[#D8CEBE] self-start sm:self-auto"
        >
          <RefreshCw size={15} className={`mr-1.5 text-[#A67C2E] ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('common.refreshList', language === 'en' ? 'Refresh list' : 'Làm mới danh sách')}
        </Button>
      </div>

      {/* Role Context Notification Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition-all ${
          isEscort
            ? 'bg-[#E8F2EB] border-[#2D5A3F]/25 text-[#1E402C]'
            : 'bg-[#FAF8F4] border-[#D8CEBE] text-[#181A17]'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5 font-bold">
          {isEscort ? (
            <Stethoscope size={18} className="text-[#2D5A3F] shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          ) : (
            <Truck size={18} className="text-[#A67C2E] shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          )}
          <span>
            {isEscort
              ? t(
                  'driver.trips.escortRoleBanner',
                  language === 'en'
                    ? 'Role: Equine Vet / Escort — Authorized for clinical monitoring and horse health logging.'
                    : 'Vai trò: Bác Sĩ Thú Y / Chuyên Viên Hộ Tống — Bạn được phân quyền theo dõi lâm sàng & ghi nhật ký sức khỏe ngựa.'
                )
              : t(
                  'driver.trips.driverRoleBanner',
                  language === 'en'
                    ? 'Role: Specialized Vehicle Driver — Responsible for safe transit and milestone check-ins.'
                    : 'Vai trò: Tài Xế Lái Xe Chuyên Dụng — Bạn phụ trách lái xe an toàn, cập nhật mốc hành trình và kiểm soát trạm dừng.'
                )}
          </span>
        </div>
        <span className="font-semibold text-[11px] opacity-85 shrink-0">
          {t('driver.trips.loggedInAs', language === 'en' ? 'Signed in as:' : 'Đăng nhập:')}{' '}
          {currentUser?.fullName ||
            currentUser?.name ||
            (isEscort
              ? language === 'en'
                ? 'Vet Specialist'
                : 'BS. Thú Y'
              : language === 'en'
              ? 'Driver'
              : 'Tài Xế')}
        </span>
      </div>

      {/* View Filter Mode Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#D8CEBE] shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            aria-pressed={viewMode === 'assigned'}
            onClick={() => setViewMode('assigned')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'assigned'
                ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                : 'bg-[#FAF8F4] text-[#57564E] border border-[#EAE5DA] hover:bg-[#F3EFE4]'
            }`}
          >
            <UserCheck size={14} aria-hidden="true" />{' '}
            {t('driver.trips.assignedToMe', language === 'en' ? 'Assigned to me' : 'Chuyến được phân công cho tôi')} (
            {trips.filter((tr) => tr.isAssignedToMe).length})
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'all'}
            onClick={() => setViewMode('all')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'all'
                ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                : 'bg-[#FAF8F4] text-[#57564E] border border-[#EAE5DA] hover:bg-[#F3EFE4]'
            }`}
          >
            <Layers size={14} aria-hidden="true" />{' '}
            {t('driver.trips.allTrips', language === 'en' ? 'All trips' : 'Tất cả chuyến')} ({trips.length})
          </button>
        </div>

        <input
          type="text"
          aria-label={t('driver.trips.searchPlaceholder', language === 'en' ? 'Search trips...' : 'Tìm chuyến đi...')}
          placeholder={t('driver.trips.searchPlaceholder', language === 'en' ? 'Search by code, horse, route...' : 'Tìm theo mã đơn, điểm đi, điểm đến...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#A67C2E] w-full sm:w-72"
        />
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadDriverTrips()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* Trips list / Loading / Empty State */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {t('common.loading', language === 'en' ? 'Loading transport assignments...' : 'Đang tải danh sách nhiệm vụ vận chuyển...')}
          </p>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAF8F4] border border-[#D8CEBE] text-[#8A8478] flex items-center justify-center">
            <Truck size={24} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-[#181A17] m-0">
            {t('driver.trips.noTrips', language === 'en' ? 'No trips found' : 'Không có chuyến đi nào')}
          </h2>
          <p className="text-xs text-[#57564E] m-0 max-w-md leading-relaxed">
            {viewMode === 'assigned'
              ? t(
                  'driver.trips.noAssignedTripsDesc',
                  'Hiện tại chưa có chuyến đi nào được phân công cho bạn ({name}). Khi Quản lý phân công bạn vào chuyến xe, chuyến đi sẽ xuất hiện tại đây.',
                  { name: currentUser?.fullName || currentUser?.name || (language === 'en' ? 'Crew Member' : 'Nhân sự') }
                )
              : t(
                  'driver.trips.noTripsInSystem',
                  language === 'en' ? 'No matching trips found in system.' : 'Không tìm thấy chuyến đi nào trong hệ thống.'
                )}
          </p>
          {viewMode === 'assigned' && trips.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setViewMode('all')}
              className="min-h-[44px] border-[#D8CEBE]"
            >
              {t('driver.trips.viewAllInSystem', 'Xem tất cả {count} chuyến trong hệ thống', { count: trips.length })}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filteredTrips.map((trip) => {
            const legs = trip.routeDetail?.legs || [];
            const stops = trip.routeDetail?.stops || [];
            const isCompleted =
              trip.shipmentStatus === 'completed' ||
              trip.shipmentStatus === 'delivered' ||
              trip.planStatus === 'completed' ||
              (legs.length > 0 && legs.every((l) => l.status === 'completed'));
            const isInTransit =
              !isCompleted &&
              (trip.shipmentStatus === 'in_transit' ||
                trip.planStatus === 'in_transit' ||
                (legs.length > 0 && legs.some((l) => l.status === 'in_progress' || l.status === 'in_transit')));
            const isAwaitingConfirmation =
              Boolean(trip.isAssignedToMe) && !isCompleted && !isInTransit && !trip.isCurrentDriverConfirmed;

            return (
              <div
                key={trip.id}
                className={`bg-white rounded-2xl border p-5 sm:p-6 flex flex-col gap-5 shadow-sm transition-all ${
                  isAwaitingConfirmation
                    ? 'border-[#A67C2E] ring-2 ring-[#F8F0DF]'
                    : isCompleted
                    ? 'border-[#2D5A3F]/30'
                    : 'border-[#D8CEBE]'
                }`}
              >
                {/* Top Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE5DA] pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-[#A67C2E] text-base">{trip.orderCode}</span>
                      <span className="text-xs text-[#747D88]">
                        • {t('coordinator.routes.customerLabel', language === 'en' ? 'Customer:' : 'Khách hàng:')} {trip.customerName}
                      </span>

                      {isCompleted ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25 flex items-center gap-1 shadow-sm">
                          <CheckCircle2 size={13} className="text-[#2D5A3F]" aria-hidden="true" /> {translateStatus('completed')}
                        </span>
                      ) : isInTransit ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3] flex items-center gap-1 shadow-sm">
                          🚚 {translateStatus('in_transit')}
                        </span>
                      ) : trip.planStatus === 'ready_to_depart' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#A67C2E] border border-[#D4C5A3] flex items-center gap-1 shadow-sm">
                          🚀 {translateStatus('ready_to_depart')}
                        </span>
                      ) : trip.isCurrentDriverConfirmed ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25 flex items-center gap-1 shadow-sm">
                          <CheckCircle2 size={13} className="text-[#2D5A3F]" aria-hidden="true" /> {translateStatus('confirmed')}
                        </span>
                      ) : trip.isAssignedToMe ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#966516] border border-[#D4C5A3] flex items-center gap-1 animate-pulse">
                          <AlertCircle size={13} className="text-[#A67C2E]" aria-hidden="true" />{' '}
                          {t('driver.needsConfirmation', language === 'en' ? 'Needs Confirmation' : 'Cần xác nhận nhận chuyến')}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F4F1E9] text-[#57564E] border border-[#D8CEBE] flex items-center gap-1">
                          {t('driver.waitingAssignment', language === 'en' ? 'Pending assignment' : 'Chờ phân công')}
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-[#181A17] mt-1.5 mb-0 break-words">
                      {trip.routeDetail?.routeName || `${trip.origin} → ${trip.destination}`}
                    </h2>
                  </div>

                  {/* Main Action Buttons */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {isAwaitingConfirmation && (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => handleOpenConfirmModal(trip)}
                          className="min-h-[44px] bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold shadow-sm text-xs py-2 px-4"
                        >
                          <CheckCircle2 size={15} className="mr-1.5" aria-hidden="true" />
                          {isEscort
                            ? t('driver.trips.confirmEscortBtn', language === 'en' ? 'Confirm Escort Duty' : 'Xác Nhận Hộ Tống Chuyến Đi')
                            : t('driver.trips.confirmDriverBtn', language === 'en' ? 'Confirm Driver Duty' : 'Xác Nhận Lái Xe Chuyến Đi')}
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeclineModal(trip)}
                          className="min-h-[44px] inline-flex items-center justify-center bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold text-xs py-2 px-3.5 rounded-xl border border-[#7F2E2E] shadow-sm transition-all cursor-pointer"
                        >
                          <X size={14} className="mr-1 stroke-[2.5]" aria-hidden="true" />
                          {t('driver.trips.declineBtn', language === 'en' ? 'Decline' : 'Từ chối')}
                        </button>
                      </>
                    )}

                    <Link
                      href={`${basePath}/status?shipmentId=${trip.id}`}
                      className={`min-h-[44px] inline-flex items-center justify-center px-3.5 py-2 rounded-xl text-xs font-bold no-underline transition-colors ${
                        isCompleted
                          ? 'bg-[#3C403A] hover:bg-[#181A17] text-white'
                          : !isEscort
                          ? 'bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] shadow-sm'
                          : 'bg-white border border-[#D8CEBE] hover:bg-[#FAF8F4] text-[#181A17]'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={14} className="mr-1.5 text-emerald-300" aria-hidden="true" />
                      ) : (
                        <Navigation size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
                      )}
                      {isCompleted
                        ? !isEscort
                          ? t('driver.trips.viewCompletedJourney', language === 'en' ? 'Review completed trip' : 'Xem lại hành trình đã hoàn thành')
                          : t('driver.trips.viewCompletedRoute', language === 'en' ? 'Review completed route' : 'Xem lại lộ trình đã hoàn thành')
                        : !isEscort
                        ? t('driver.trips.updateJourneyBtn', language === 'en' ? 'Update journey & stops' : 'Cập nhật hành trình & đến trạm')
                        : t('driver.trips.viewRouteBtn', language === 'en' ? 'View route status' : 'Xem lộ trình di chuyển')}
                    </Link>

                    {isEscort && (
                      <Link
                        href={`${basePath}/health`}
                        className={`min-h-[44px] inline-flex items-center justify-center px-3.5 py-2 rounded-xl text-xs font-bold no-underline shadow-sm transition-colors ${
                          isCompleted
                            ? 'bg-white border border-[#2D5A3F] text-[#2D5A3F] hover:bg-[#E8F2EB]'
                            : 'bg-[#2D5A3F] hover:bg-[#234731] text-white'
                        }`}
                      >
                        <Stethoscope size={14} className="mr-1.5" aria-hidden="true" />
                        {isCompleted
                          ? t('driver.trips.viewHealthDossier', language === 'en' ? 'View health dossier' : 'Xem hồ sơ sức khỏe ngựa')
                          : t('driver.trips.recordHealthLog', language === 'en' ? 'Log horse health' : 'Ghi nhật ký sức khỏe ngựa')}
                      </Link>
                    )}

                    <Link
                      href={`${basePath}/trips/${trip.id}`}
                      className="min-h-[44px] inline-flex items-center justify-center px-3.5 py-2 rounded-xl text-xs font-bold no-underline border border-[#D8CEBE] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#181A17] shadow-sm transition-colors cursor-pointer"
                    >
                      <Navigation size={14} className="mr-1.5 text-[#A67C2E]" aria-hidden="true" />
                      {language === 'en' ? 'Timeline & Milestones' : 'Tiến độ dọc'}
                    </Link>
                  </div>
                </div>

                {/* Origin -> Destination Flow */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#FAF8F4] p-4 rounded-xl text-sm border border-[#EAE5DA]">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#747D88] font-bold uppercase m-0">
                        {t('driver.trips.pickupPoint', language === 'en' ? 'Pickup location' : 'Điểm đón ngựa')}
                      </p>
                      <p className="font-semibold text-[#181A17] m-0 mt-0.5 break-words">{trip.origin}</p>
                      <p className="text-xs text-[#57564E] m-0 mt-0.5">
                        {t('driver.trips.estDeparture', language === 'en' ? 'Planned departure:' : 'Khởi hành dự kiến:')}{' '}
                        <strong>{trip.departureDate}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#F3EFE4] text-[#181A17] flex items-center justify-center shrink-0 mt-0.5 border border-[#D4C5A3]">
                      <MapPin size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#747D88] font-bold uppercase m-0">
                        {t('driver.trips.deliveryPoint', language === 'en' ? 'Final destination' : 'Điểm bàn giao cuối')}
                      </p>
                      <p className="font-semibold text-[#181A17] m-0 mt-0.5 break-words">{trip.destination}</p>
                      <p className="text-xs text-[#57564E] m-0 mt-0.5 break-words">
                        {t('common.horsesUnit', language === 'en' ? 'Horses' : 'Chiến mã')}:{' '}
                        <strong className="text-[#181A17]">
                          {trip.horses && trip.horses.length > 0
                            ? trip.horses.map((h: any) => h.name).filter(Boolean).join(', ')
                            : trip.horseName}
                        </strong>{' '}
                        ({t('common.horsesCount', '{count} ngựa', { count: trip.horseCount })})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Multi-modal Legs Details */}
                {legs.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#57564E] mb-2">
                      {t('driver.trips.legsListTitle', 'Lộ trình các chặng vận chuyển ({count} chặng):', {
                        count: legs.length,
                      })}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {legs.map((leg) => (
                        <div
                          key={leg.sequenceNo}
                          className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                            leg.legType === 'flight'
                              ? 'bg-[#FAF5EB] border-[#D4C5A3]'
                              : 'bg-[#E8F2EB]/60 border-[#2D5A3F]/25'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#181A17]">
                              {t('driver.trips.legSeq', 'Chặng {seq}', { seq: leg.sequenceNo })}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white border border-[#D8CEBE]">
                              {leg.legType === 'flight'
                                ? t('driver.trips.flightLeg', language === 'en' ? '✈️ Flight' : '✈️ Chặng Bay')
                                : t('driver.trips.roadLeg', language === 'en' ? '🚚 Road' : '🚚 Đường bộ')}
                            </span>
                          </div>
                          <p className="font-semibold text-[#181A17] m-0 truncate">
                            {(leg.originLocation || '').split(',')[0] || '—'} →{' '}
                            {(leg.destinationLocation || '').split(',')[0] || '—'}
                          </p>
                          {leg.legType === 'flight' ? (
                            <div className="text-[11px] text-[#181A17] font-medium">
                              {leg.airlineName || 'Airline'} • {t('driver.trips.flightCode', language === 'en' ? 'Flight:' : 'Chuyến:')}{' '}
                              {leg.flightNumber || 'TBD'}
                            </div>
                          ) : (
                            <div className="text-[11px] text-[#2D5A3F] font-medium">
                              {t('driver.trips.vehicle', language === 'en' ? 'Vehicle:' : 'Phương tiện:')}{' '}
                              {translateVehicleType(leg.vehiclePlate) ||
                                leg.vehiclePlate ||
                                (language === 'en' ? 'Specialized Vehicle' : 'Xe chuyên dụng')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stops & Rest stations */}
                {stops.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EAE5DA] text-xs text-[#57564E]">
                    <span className="font-bold text-[#181A17]">
                      {t('driver.trips.stopsQuarantine', language === 'en' ? 'Rest & Quarantine Stops:' : 'Trạm dừng & Kiểm dịch:')}
                    </span>
                    {stops.map((st) => (
                      <span
                        key={st.sequenceNo}
                        className="bg-[#FAF8F4] border border-[#EAE5DA] px-2.5 py-0.5 rounded-md text-[11px] text-[#181A17]"
                      >
                        #{st.sequenceNo} {st.locationName} • {translateStopType(st.stopType)}
                      </span>
                    ))}
                  </div>
                )}

                {trip.routeDetail?.strategicNotes && (
                  <div className="text-xs bg-[#FAF5EB] border border-[#D4C5A3] p-3 rounded-xl text-[#181A17] italic break-words">
                    {t('driver.trips.coordinatorNotes', language === 'en' ? 'Coordinator instructions:' : 'Chỉ đạo vận hành từ điều phối viên:')}{' '}
                    &quot;{trip.routeDetail.strategicNotes}&quot;
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModalOpen && selectedTripToConfirm && (
        <Modal
          isOpen={confirmModalOpen}
          onClose={closeConfirmModal}
          closeDisabled={isConfirming}
          title={t('driver.trips.confirmModalTitle', language === 'en' ? 'Confirm Trip Assignment' : 'Xác Nhận Tiếp Nhận Nhiệm Vụ Chuyến Đi')}
          subtitle={`${t('common.orderCode', language === 'en' ? 'Order:' : 'Đơn hàng:')} ${selectedTripToConfirm.orderCode} • ${t('common.tripCode', language === 'en' ? 'Trip ID:' : 'Mã số chuyến đi:')} #${selectedTripToConfirm.id}`}
          maxWidth="560px"
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-[#E8F2EB] border border-[#2D5A3F]/25 rounded-xl text-xs text-[#1E402C]">
              <p className="font-bold m-0 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-[#2D5A3F]" aria-hidden="true" />
                {t('driver.trips.safetyCommitmentTitle', language === 'en' ? 'Equine Transport Safety Commitment' : 'Cam kết tuân thủ quy chuẩn an toàn vận chuyển ngựa đua')}
              </p>
              <p className="m-0 mt-1 leading-relaxed">
                {t(
                  'driver.trips.safetyCommitmentDesc',
                  language === 'en'
                    ? 'By confirming, you verify cabin climate control, surveillance camera, water tanks, and shock absorbers are ready.'
                    : 'Bằng việc bấm xác nhận, tài xế cam kết đã kiểm tra hệ thống điều hòa khoang xe, camera giám sát, bồn nước uống và các thiết bị giảm sốc trên xe.'
                )}
              </p>
            </div>

            <div className="text-xs text-[#57564E] flex flex-col gap-1">
              <div>
                {t('common.horsesUnit', language === 'en' ? 'Horses' : 'Chiến mã')}:{' '}
                <strong className="text-[#181A17]">{selectedTripToConfirm.horseName}</strong> (
                {t('common.horsesCount', '{count} ngựa', { count: selectedTripToConfirm.horseCount })})
              </div>
              <div>
                {t('driver.trips.itineraryLabel', language === 'en' ? 'Route:' : 'Lộ trình:')}{' '}
                <strong className="text-[#181A17]">
                  {selectedTripToConfirm.origin} → {selectedTripToConfirm.destination}
                </strong>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-notes-input" className="text-xs font-bold text-[#181A17] uppercase tracking-wider block mb-1.5">
                {t('driver.trips.confirmationNotesLabel', language === 'en' ? 'Crew Confirmation Notes' : 'Ghi chú hoặc lời nhắn xác nhận của Tài xế / Hộ tống viên')}
              </label>
              <textarea
                id="confirm-notes-input"
                rows={3}
                value={confirmationNotes}
                onChange={(e) => setConfirmationNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D8CEBE] text-xs focus:border-[#A67C2E] outline-none resize-none font-medium"
                placeholder={t(
                  'driver.trips.confirmationNotesPlaceholder',
                  language === 'en'
                    ? 'Enter pre-trip inspection or equine readiness remarks...'
                    : 'Nhập ghi chú tình trạng kiểm tra xe và sức khỏe ngựa trước khi khởi hành...'
                )}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-[#EAE5DA]">
              <Button
                type="button"
                variant="outline"
                onClick={closeConfirmModal}
                disabled={isConfirming}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.cancel', language === 'en' ? 'Cancel' : 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmAssignment()}
                disabled={isConfirming}
                className="min-h-[44px] bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold shadow-sm"
              >
                <CheckCircle2 size={16} className="mr-1.5" aria-hidden="true" />
                {isConfirming
                  ? t('common.confirming', language === 'en' ? 'Confirming...' : 'Đang xác nhận...')
                  : t('driver.trips.confirmSubmitBtn', language === 'en' ? 'Confirm Duty Acceptance' : 'Tôi Xác Nhận Nhận Chuyến')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* DECLINE TRIP MODAL */}
      {declineModalOpen && selectedTripToDecline && (
        <Modal
          isOpen={declineModalOpen}
          onClose={closeDeclineModal}
          closeDisabled={isDeclining}
          title={t('driver.trips.declineModalTitle', language === 'en' ? 'Decline Trip Assignment' : 'Từ Chối Nhận Nhiệm Vụ Chuyến Đi')}
          subtitle={`${t('common.orderCode', language === 'en' ? 'Order:' : 'Đơn hàng:')} ${selectedTripToDecline.orderCode} • ${t('driver.trips.route', language === 'en' ? 'Route:' : 'Tuyến:')} ${selectedTripToDecline.origin} → ${selectedTripToDecline.destination}`}
          maxWidth="560px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900 leading-relaxed">
              <p className="font-bold m-0 flex items-center gap-1.5 text-[#9E3B3B]">
                <AlertCircle size={16} className="text-[#9E3B3B] shrink-0" aria-hidden="true" />
                {t('driver.trips.declineNoticeTitle', language === 'en' ? 'Important Notice When Declining' : 'Lưu ý quan trọng khi từ chối nhận chuyến')}
              </p>
              <p className="m-0 mt-1">
                {t(
                  'driver.trips.declineNoticeDesc',
                  language === 'en'
                    ? 'Declining unassigns you from this trip and alerts the Operations Manager to assign replacement crew.'
                    : 'Khi bạn từ chối, hệ thống sẽ gỡ bạn khỏi nhiệm vụ chuyến đi này và tự động gửi thông báo khẩn cấp tới Quản lý Logistics để phân công nhân sự thay thế kịp thời.'
                )}
              </p>
            </div>

            <div>
              <p className="font-bold text-[#181A17] block mb-2 uppercase tracking-wider text-[11px] m-0">
                {t('driver.trips.quickDeclineReasonsLabel', language === 'en' ? 'Select reason for declining:' : 'Chọn lý do từ chối nhanh:')}
              </p>
              <div className="flex flex-wrap gap-2">
                {declineOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={declineReasonKey === opt.key}
                    onClick={() => setDeclineReasonKey(opt.key)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      declineReasonKey === opt.key
                        ? 'border-[#9E3B3B] bg-rose-50 text-[#9E3B3B]'
                        : 'border-[#D8CEBE] bg-white text-[#181A17] hover:bg-[#FAF8F4]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {declineReasonKey === 'other' && (
              <div>
                <label htmlFor="decline-custom-reason" className="font-bold text-[#181A17] block mb-1.5">
                  {t('driver.trips.detailReasonLabel', language === 'en' ? 'Detailed reason' : 'Nhập lý do chi tiết')}{' '}
                  <span className="text-[#9E3B3B]">*</span>
                </label>
                <textarea
                  id="decline-custom-reason"
                  rows={3}
                  required
                  value={customDeclineReason}
                  onChange={(e) => setCustomDeclineReason(e.target.value)}
                  placeholder={t(
                    'driver.trips.detailReasonPlaceholder',
                    language === 'en' ? 'Explain why you cannot take this assignment...' : 'Ghi rõ lý do không thể nhận chuyến...'
                  )}
                  className="w-full px-3 py-2.5 border border-[#D8CEBE] rounded-xl outline-none focus:border-[#9E3B3B] text-xs font-medium"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-[#EAE5DA] mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDeclineModal}
                disabled={isDeclining}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.back', language === 'en' ? 'Back' : 'Quay lại')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleDeclineAssignment()}
                disabled={isDeclining}
                className="min-h-[44px] bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold shadow-sm"
              >
                <X size={15} className="mr-1.5" aria-hidden="true" />
                {isDeclining
                  ? t('driver.trips.declining', language === 'en' ? 'Sending...' : 'Đang gửi từ chối...')
                  : t('driver.trips.confirmDeclineBtn', language === 'en' ? 'Confirm Decline' : 'Xác Nhận Từ Chối Chuyến Đi')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
