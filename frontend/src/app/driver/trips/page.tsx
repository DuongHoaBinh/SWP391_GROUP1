'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Truck,
  MapPin,
  CheckCircle2,
  Navigation,
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
import { trackingApi, AssignedTripSummary } from '@/features/tracking/api/tracking.api';
import { routesApi } from '@/features/routes/api/routes.api';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DriverTripItem {
  id: number;
  orderCode: string;
  customerName: string;
  horseName: string;
  horses: NonNullable<AssignedTripSummary['horses']>;
  horseCount: number;
  origin: string;
  destination: string;
  departureDate: string;
  shipmentStatus: string;
  planStatus: string;
  routeName: string;
  strategicNotes?: string | null;
  tripType?: string;
  returnStatus?: string | null;
  legs: NonNullable<AssignedTripSummary['legs']>;
  stops: NonNullable<AssignedTripSummary['stops']>;
  isCurrentDriverConfirmed: boolean;
  confirmedAt?: string | null;
  driverRoleInTrip?: string;
  isAssignedToMe: boolean;
}

function tripSortPriority(status?: string): number {
  const s = String(status || '').toLowerCase();
  if (s === 'in_transit' || s === 'return_pending') return 0;
  if (s === 'ready_to_depart') return 1;
  if (s === 'planning' || s === 'confirmed') return 2;
  if (s === 'completed' || s === 'delivered') return 4;
  return 3;
}

export default function DriverTripsPage() {
  const pathname = usePathname();
  const { t, language, translateStatus, translateVehicleType, translateStopType } = useLanguage();
  const isEn = language === 'en';

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
  const isAdmin = String(currentUser?.role || '').toUpperCase().includes('ADMIN');
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
    { key: 'medical_issue', label: isEn ? 'Sudden illness / Unfit for duty' : 'Sốt cao đột xuất / Sức khỏe không đảm bảo' },
    { key: 'vehicle_issue', label: isEn ? 'Vehicle technical inspection pending' : 'Xe gặp sự cố kỹ thuật chưa kiểm định kịp' },
    { key: 'family_issue', label: isEn ? 'Urgent family emergency' : 'Bận việc gia đình đột xuất' },
    { key: 'vet_exam_clash', label: isEn ? 'Veterinary schedule conflict' : 'Trùng lịch kiểm tra thú y định kỳ' },
    { key: 'other', label: isEn ? 'Other' : 'Khác' },
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
      const list = await trackingApi.getMyTrips();
      const mapped: DriverTripItem[] = (Array.isArray(list) ? list : []).map((tr) => {
        const rawDate = tr.departure_date || tr.requested_date;
        const formattedDate = rawDate
          ? new Date(rawDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '—';
        const horses = Array.isArray(tr.horses) ? tr.horses : [];
        return {
          id: Number(tr.shipment_id),
          orderCode: String(tr.request_code || `REQ-${String(tr.shipment_id).padStart(3, '0')}`).replace(/^#+/, ''),
          customerName: tr.contact_name || (isEn ? 'Client' : 'Khách hàng'),
          horseName: horses[0]?.name || (isEn ? 'Racehorse' : 'Chiến mã'),
          horses,
          horseCount: Number(tr.requested_horse_count || horses.length || 1),
          origin: tr.origin_location || '—',
          destination: tr.destination_location || '—',
          departureDate: formattedDate,
          shipmentStatus: tr.shipment_status || 'pending',
          planStatus: tr.route_plan_status || tr.shipment_status || 'draft',
          routeName: tr.route_name || `${tr.origin_location || '—'} → ${tr.destination_location || '—'}`,
          strategicNotes: tr.strategic_notes || null,
          tripType: tr.trip_type,
          returnStatus: tr.return_status,
          legs: Array.isArray(tr.legs) ? tr.legs : [],
          stops: Array.isArray(tr.stops) ? tr.stops : [],
          isCurrentDriverConfirmed: Boolean(tr.is_confirmed),
          confirmedAt: tr.confirmed_at || null,
          driverRoleInTrip: tr.role_in_shipment || (escortFromUser ? 'escort' : 'driver'),
          isAssignedToMe: tr.role_in_shipment !== undefined ? true : !String(activeUser?.role || '').toUpperCase().includes('ADMIN'),
        };
      });

      mapped.sort((a, b) => {
        const pa = tripSortPriority(a.shipmentStatus);
        const pb = tripSortPriority(b.shipmentStatus);
        if (pa !== pb) return pa - pb;
        return b.id - a.id;
      });

      setTrips(mapped);
    } catch (err: any) {
      const msg =
        err?.message ||
        (isEn ? 'Unable to load assigned trips from server.' : 'Không thể tải danh sách chuyến đi từ hệ thống.');
      setLoadError(msg);
      toast.error(msg);
      setTrips([]);
    } finally {
      setIsLoading(false);
    }
  }, [isEn, pathname]);

  useEffect(() => {
    void loadDriverTrips();
  }, [loadDriverTrips]);

  const handleOpenConfirmModal = (trip: DriverTripItem) => {
    setSelectedTripToConfirm(trip);
    setConfirmationNotes(
      isEn
        ? 'Assignment acknowledged, vehicle pre-trip inspection complete.'
        : 'Đã nhận lệnh vận chuyển, kiểm tra xe hoàn tất và sẵn sàng xuất phát.',
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
          (isEn ? 'Assignment acknowledged, ready for departure.' : 'Đã nhận lệnh vận chuyển, sẵn sàng xuất phát.'),
      });

      toast.success(
        res.isFullyConfirmed
          ? isEn
            ? 'Trip confirmed! Full crew ready.'
            : 'Đã xác nhận chuyến đi! Toàn bộ tổ lái đã sẵn sàng.'
          : isEn
          ? 'Trip assignment confirmed!'
          : 'Bạn đã xác nhận nhận chuyến thành công!',
      );

      setConfirmModalOpen(false);
      setSelectedTripToConfirm(null);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Unable to confirm trip.' : 'Không thể xác nhận chuyến đi.'));
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
      toast.error(isEn ? 'Please provide a reason for declining.' : 'Vui lòng cung cấp lý do từ chối chuyến đi.');
      return;
    }
    setIsDeclining(true);

    try {
      await routesApi.declineTripAssignment(selectedTripToDecline.id, {
        reason: finalReason,
      });

      toast.success(
        isEn
          ? 'Decline reason sent to Logistics Manager!'
          : 'Đã gửi thông báo từ chối nhận chuyến đến Quản lý vận hành!',
      );
      setDeclineModalOpen(false);
      setSelectedTripToDecline(null);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Unable to submit decline response.' : 'Không thể gửi phản hồi từ chối.'));
    } finally {
      setIsDeclining(false);
    }
  };

  const filteredTrips = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return trips
      .filter((tr) => (!isAdmin || viewMode === 'assigned' ? tr.isAssignedToMe : true))
      .filter((tr) => {
        if (!q) return true;
        return (
          tr.orderCode.toLowerCase().includes(q) ||
          tr.horseName.toLowerCase().includes(q) ||
          tr.origin.toLowerCase().includes(q) ||
          tr.destination.toLowerCase().includes(q) ||
          tr.horses.some((h) => h.name.toLowerCase().includes(q))
        );
      });
  }, [isAdmin, searchTerm, trips, viewMode]);

  const getLegBadge = (legType: string) => {
    if (legType === 'flight') {
      return {
        label: isEn ? '✈️ Air Freight' : '✈️ Hàng không',
        cardClass: 'bg-[#FAF5EB] border-[#D4C5A3]',
      };
    }
    if (legType === 'sea') {
      return {
        label: isEn ? '🚢 Sea Freight' : '🚢 Đường biển',
        cardClass: 'bg-cyan-50/70 border-cyan-200',
      };
    }
    return {
      label: isEn ? '🚚 Road' : '🚚 Đường bộ',
      cardClass: 'bg-[#E8F2EB]/60 border-[#2D5A3F]/25',
    };
  };

  return (
    <div className="flex flex-col gap-5 pb-16 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#181A17] m-0">
            {isEn ? 'My Transport Assignments' : 'Nhiệm Vụ Vận Chuyển Của Tôi'}
          </h1>
          <p className="text-xs sm:text-sm text-[#57564E] mt-1 mb-0">
            {isEn
              ? 'Review dispatch schedule, horse manifest, transit legs, and confirm duty acceptance.'
              : 'Xem lịch trình điều phối, danh sách ngựa, lộ trình các chặng và xác nhận tiếp nhận chuyến đi.'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void loadDriverTrips()}
          disabled={isLoading}
          className="min-h-[42px] px-4 shadow-sm border-[#D8CEBE] self-start sm:self-auto"
        >
          <RefreshCw size={15} className={`mr-1.5 text-[#A67C2E] ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('common.refreshList', isEn ? 'Refresh' : 'Làm mới')}
        </Button>
      </div>

      {/* Filter & Search Bar (Hide redundant "All trips" tab for DRIVER_ESCORT) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#D8CEBE] shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin ? (
            <>
              <button
                type="button"
                aria-pressed={viewMode === 'assigned'}
                onClick={() => setViewMode('assigned')}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'assigned'
                    ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                    : 'bg-[#FAF8F4] text-[#57564E] border border-[#EAE5DA]'
                }`}
              >
                <UserCheck size={14} aria-hidden="true" />
                {isEn ? 'Assigned to me' : 'Được phân công'} ({trips.filter((tr) => tr.isAssignedToMe).length})
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'all'}
                onClick={() => setViewMode('all')}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                    : 'bg-[#FAF8F4] text-[#57564E] border border-[#EAE5DA]'
                }`}
              >
                <Layers size={14} aria-hidden="true" />
                {isEn ? 'All trips' : 'Tất cả chuyến'} ({trips.length})
              </button>
            </>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FAF8F4] border border-[#EAE5DA] text-xs font-bold text-[#181A17]">
              {isEscort ? (
                <Stethoscope size={15} className="text-[#2D5A3F]" aria-hidden="true" />
              ) : (
                <Truck size={15} className="text-[#A67C2E]" aria-hidden="true" />
              )}
              <span>
                {isEn
                  ? `${filteredTrips.length} assigned trip(s)`
                  : `${filteredTrips.length} chuyến được phân công`}
              </span>
            </div>
          )}
        </div>

        <input
          type="text"
          aria-label={isEn ? 'Search trips...' : 'Tìm chuyến đi...'}
          placeholder={isEn ? 'Search by code, horse, route...' : 'Tìm theo mã đơn, tên ngựa, điểm đi/đến...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#A67C2E] w-full sm:w-72"
        />
      </div>

      {loadError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadDriverTrips()}>
            {isEn ? 'Retry' : 'Thử lại'}
          </Button>
        </div>
      )}

      {/* Trips list */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={26} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {isEn ? 'Loading transport assignments...' : 'Đang tải danh sách nhiệm vụ vận chuyển...'}
          </p>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAF8F4] border border-[#D8CEBE] text-[#8A8478] flex items-center justify-center">
            <Truck size={24} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-[#181A17] m-0">
            {isEn ? 'No trips found' : 'Không có chuyến đi nào'}
          </h2>
          <p className="text-xs text-[#57564E] m-0 max-w-md leading-relaxed">
            {isEn
              ? 'No matching transport assignments right now. New dispatches from Logistics Manager will appear here.'
              : 'Hiện tại chưa có chuyến đi phù hợp. Khi Quản lý Logistics phân công chuyến mới, lịch trình sẽ tự động hiển thị tại đây.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredTrips.map((trip) => {
            const legs = trip.legs || [];
            const stops = trip.stops || [];
            const isCompleted =
              trip.shipmentStatus === 'completed' ||
              trip.shipmentStatus === 'delivered' ||
              trip.planStatus === 'completed' ||
              (legs.length > 0 && legs.every((l) => l.status === 'completed'));
            const isInTransit =
              !isCompleted &&
              (trip.shipmentStatus === 'in_transit' ||
                trip.shipmentStatus === 'return_pending' ||
                trip.planStatus === 'in_transit' ||
                legs.some((l) => ['active', 'in_progress', 'in_transit', 'departed'].includes(String(l.status || '').toLowerCase())));
            const isAwaitingConfirmation =
              trip.isAssignedToMe && !isCompleted && !isInTransit && !trip.isCurrentDriverConfirmed;

            return (
              <div
                key={trip.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col gap-4 shadow-sm transition-all ${
                  isAwaitingConfirmation
                    ? 'border-[#A67C2E] ring-2 ring-[#F8F0DF]'
                    : isInTransit
                    ? 'border-[#181A17]/30'
                    : isCompleted
                    ? 'border-[#2D5A3F]/30'
                    : 'border-[#D8CEBE]'
                }`}
              >
                {/* Top Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE5DA] pb-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-[#A67C2E] text-base">{trip.orderCode}</span>
                      <span className="text-xs text-[#747D88]">· {trip.customerName}</span>

                      {isCompleted ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25 flex items-center gap-1">
                          <CheckCircle2 size={12} aria-hidden="true" /> {translateStatus('completed')}
                        </span>
                      ) : trip.shipmentStatus === 'return_pending' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#966516] border border-[#D4C5A3]">
                          {translateStatus('return_pending')}
                        </span>
                      ) : isInTransit ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#181A17] text-[#C4B38E]">
                          {translateStatus('in_transit')}
                        </span>
                      ) : trip.shipmentStatus === 'ready_to_depart' || trip.planStatus === 'ready_to_depart' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#A67C2E] border border-[#D4C5A3]">
                          {translateStatus('ready_to_depart')}
                        </span>
                      ) : trip.isCurrentDriverConfirmed ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25 flex items-center gap-1">
                          <CheckCircle2 size={12} aria-hidden="true" /> {translateStatus('confirmed')}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF5EB] text-[#966516] border border-[#D4C5A3] flex items-center gap-1 animate-pulse">
                          <AlertCircle size={12} className="text-[#A67C2E]" aria-hidden="true" />
                          {isEn ? 'Needs Confirmation' : 'Cần xác nhận nhận chuyến'}
                        </span>
                      )}

                      {trip.tripType === 'round_trip' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
                          {isEn ? 'Round-Trip' : 'Khứ hồi'}
                        </span>
                      )}
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-[#181A17] mt-1 mb-0 break-words">
                      {trip.routeName}
                    </h2>
                  </div>

                  {/* Simplified CTAs: Primary Trip Console + Secondary Health (preserving ?shipmentId=) */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {isAwaitingConfirmation && (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => handleOpenConfirmModal(trip)}
                          className="min-h-[42px] bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold text-xs px-4"
                        >
                          <CheckCircle2 size={14} className="mr-1.5" aria-hidden="true" />
                          {isEn ? 'Confirm Duty' : 'Xác nhận nhận chuyến'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeclineModal(trip)}
                          className="min-h-[42px] inline-flex items-center justify-center bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold text-xs px-3.5 rounded-xl border-0 cursor-pointer"
                        >
                          <X size={14} className="mr-1" aria-hidden="true" />
                          {isEn ? 'Decline' : 'Từ chối'}
                        </button>
                      </>
                    )}

                    <Link
                      href={`${basePath}/trips/${trip.id}`}
                      className="min-h-[42px] inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold no-underline bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] shadow-sm transition-colors"
                    >
                      <Navigation size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
                      {isEn ? 'Open Trip Console' : 'Mở bảng điều hành chuyến'}
                    </Link>

                    <Link
                      href={`${basePath}/health?shipmentId=${trip.id}`}
                      className="min-h-[42px] inline-flex items-center justify-center px-3.5 py-2 rounded-xl text-xs font-bold no-underline border border-[#2D5A3F]/35 bg-[#E8F2EB]/60 hover:bg-[#E8F2EB] text-[#1E402C] transition-colors"
                    >
                      <Stethoscope size={14} className="mr-1.5" aria-hidden="true" />
                      {isEn ? 'Health' : 'Sức khỏe'}
                    </Link>
                  </div>
                </div>

                {/* Origin -> Destination Flow */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#FAF8F4] p-3.5 rounded-xl text-xs border border-[#EAE5DA]">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={14} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#747D88] font-bold uppercase m-0">
                        {isEn ? 'Pickup location' : 'Điểm đón ngựa'}
                      </p>
                      <p className="font-semibold text-[#181A17] m-0 mt-0.5 break-words">{trip.origin}</p>
                      <p className="text-[11px] text-[#57564E] m-0 mt-0.5">
                        {isEn ? 'Departure date:' : 'Ngày khởi hành:'} <strong>{trip.departureDate}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#F3EFE4] text-[#181A17] flex items-center justify-center shrink-0 mt-0.5 border border-[#D4C5A3]">
                      <MapPin size={14} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#747D88] font-bold uppercase m-0">
                        {isEn ? 'Final destination' : 'Điểm bàn giao cuối'}
                      </p>
                      <p className="font-semibold text-[#181A17] m-0 mt-0.5 break-words">{trip.destination}</p>
                      <p className="text-[11px] text-[#57564E] m-0 mt-0.5 break-words">
                        {isEn ? 'Horses:' : 'Chiến mã:'}{' '}
                        <strong className="text-[#181A17]">
                          {trip.horses.length > 0
                            ? trip.horses.map((h) => h.name).filter(Boolean).join(', ')
                            : trip.horseName}
                        </strong>{' '}
                        ({trip.horseCount} {isEn ? 'horse(s)' : 'ngựa'})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Multi-modal Legs Details (Road, Flight, Sea) */}
                {legs.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {legs.map((leg) => {
                      const legMeta = getLegBadge(leg.legType);
                      return (
                        <div
                          key={leg.legId || leg.sequenceNo}
                          className={`p-3 rounded-xl border text-xs flex flex-col gap-1 ${legMeta.cardClass}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#181A17]">
                              {isEn ? `Leg ${leg.sequenceNo}` : `Chặng ${leg.sequenceNo}`}
                              {leg.direction === 'return' ? (isEn ? ' (Return)' : ' (Chặng về)') : ''}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white border border-[#D8CEBE]">
                              {legMeta.label}
                            </span>
                          </div>
                          <p className="font-semibold text-[#181A17] m-0 break-words">
                            {(leg.originLocation || '').split(',')[0] || '—'} →{' '}
                            {(leg.destinationLocation || '').split(',')[0] || '—'}
                          </p>
                          <div className="text-[11px] text-[#57564E] font-medium">
                            {leg.legType === 'flight'
                              ? `${leg.airlineName || 'Air Cargo'} · ${leg.flightNumber || 'TBD'}`
                              : leg.legType === 'sea'
                              ? isEn ? 'Equine Maritime Vessel' : 'Tàu chuyên dụng đường biển'
                              : translateVehicleType(leg.vehiclePlate) ||
                                leg.vehiclePlate ||
                                (isEn ? 'Specialized Vehicle' : 'Xe chuyên dụng')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Stops Summary */}
                {stops.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#EAE5DA] text-xs text-[#57564E]">
                    <span className="font-bold text-[#181A17]">
                      {isEn ? 'Checkpoints:' : 'Trạm dừng & Kiểm dịch:'}
                    </span>
                    {stops.map((st) => (
                      <span
                        key={st.routeStopId || st.sequenceNo}
                        className="bg-[#FAF8F4] border border-[#EAE5DA] px-2 py-0.5 rounded-md text-[11px] text-[#181A17]"
                      >
                        #{st.sequenceNo} {st.locationName} · {translateStopType(st.stopType)}
                      </span>
                    ))}
                  </div>
                )}

                {trip.strategicNotes && (
                  <div className="text-xs bg-[#FAF5EB] border border-[#D4C5A3] p-3 rounded-xl text-[#181A17] italic break-words">
                    {isEn ? 'Operational instructions:' : 'Chỉ đạo vận hành:'} &ldquo;{trip.strategicNotes}&rdquo;
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
          title={isEn ? 'Confirm Trip Assignment' : 'Xác Nhận Tiếp Nhận Nhiệm Vụ Chuyến Đi'}
          subtitle={`${selectedTripToConfirm.orderCode} · #${selectedTripToConfirm.id}`}
          maxWidth="520px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-[#E8F2EB] border border-[#2D5A3F]/25 rounded-xl text-[#1E402C]">
              {isEn
                ? 'Confirming notifies Logistics Manager that you and your vehicle/equipment are ready for departure.'
                : 'Xác nhận sẽ thông báo tới Quản lý Logistics rằng bạn và phương tiện/thiết bị đã sẵn sàng xuất phát.'}
            </div>

            <div>
              <label htmlFor="confirm-notes" className="font-bold text-[#181A17] block mb-1.5">
                {isEn ? 'Readiness notes' : 'Ghi chú sẵn sàng'}
              </label>
              <textarea
                id="confirm-notes"
                rows={3}
                value={confirmationNotes}
                onChange={(e) => setConfirmationNotes(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#2D5A3F]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={closeConfirmModal} disabled={isConfirming}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmAssignment()}
                disabled={isConfirming}
                className="bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold"
              >
                {isConfirming ? (isEn ? 'Confirming...' : 'Đang xác nhận...') : isEn ? 'Confirm Duty' : 'Xác nhận nhận chuyến'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* DECLINE MODAL */}
      {declineModalOpen && selectedTripToDecline && (
        <Modal
          isOpen={declineModalOpen}
          onClose={closeDeclineModal}
          closeDisabled={isDeclining}
          title={isEn ? 'Decline Trip Assignment' : 'Từ Chối Tiếp Nhận Chuyến Đi'}
          subtitle={`${selectedTripToDecline.orderCode} · #${selectedTripToDecline.id}`}
          maxWidth="520px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-2">
              {declineOptions.map((opt) => (
                <label
                  key={opt.key}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer font-semibold ${
                    declineReasonKey === opt.key
                      ? 'border-[#9E3B3B] bg-rose-50 text-rose-950'
                      : 'border-[#D8CEBE] bg-white text-[#181A17]'
                  }`}
                >
                  <input
                    type="radio"
                    name="decline_reason"
                    checked={declineReasonKey === opt.key}
                    onChange={() => setDeclineReasonKey(opt.key)}
                    className="accent-[#9E3B3B]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {declineReasonKey === 'other' && (
              <textarea
                rows={3}
                value={customDeclineReason}
                onChange={(e) => setCustomDeclineReason(e.target.value)}
                placeholder={isEn ? 'Enter specific reason...' : 'Nhập lý do cụ thể...'}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#9E3B3B]"
              />
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={closeDeclineModal} disabled={isDeclining}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDeclineAssignment()}
                disabled={isDeclining}
                className="font-bold"
              >
                {isDeclining ? (isEn ? 'Submitting...' : 'Đang gửi...') : isEn ? 'Confirm Decline' : 'Xác nhận từ chối'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
