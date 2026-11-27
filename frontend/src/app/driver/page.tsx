'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Truck,
  Crosshair,
  AlertTriangle,
  ChevronRight,
  Stethoscope,
  RefreshCw,
  HeartPulse,
  Phone,
  CheckCircle2,
  MapPin,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi, AssignedTripSummary, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import { incidentsApi } from '@/features/incidents/api/incidents.api';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function formatCode(raw?: string | null, fallbackId?: number): string {
  const cleaned = String(raw || '').replace(/^#+/, '').trim();
  if (cleaned) return cleaned;
  return fallbackId ? `REQ-${String(fallbackId).padStart(3, '0')}` : '—';
}

function parseNameAndPhone(raw?: string | null): { name: string; phone: string | null } {
  if (!raw) return { name: '', phone: null };
  const match = raw.match(/^(.*?)\s*\(([\d+\s.-]{8,})\)\s*$/);
  if (match) return { name: match[1].trim(), phone: match[2].trim() };
  return { name: raw.trim(), phone: null };
}

function tripPriority(status?: string): number {
  const s = String(status || '').toLowerCase();
  if (s === 'in_transit' || s === 'return_pending') return 0;
  if (s === 'ready_to_depart') return 1;
  if (s === 'planning' || s === 'confirmed') return 2;
  if (s === 'completed' || s === 'delivered') return 4;
  return 3;
}

export default function DriverDashboardPage() {
  const pathname = usePathname();
  const { t, language, translateStatus, translateVehicleType, translateBreed, translateIncident } = useLanguage();
  const isEn = language === 'en';

  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [activeTrip, setActiveTrip] = useState<AssignedTripSummary | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Emergency SOS Modal (Flow 5 unified)
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyType, setEmergencyType] = useState<'vehicle_breakdown' | 'horse_medical' | 'traffic_delay' | 'border_issue' | 'weather' | 'other'>('vehicle_breakdown');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [isSendingEmergency, setIsSendingEmergency] = useState(false);

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscort ? '/escort' : '/driver';

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setLoadError(null);

      try {
        const user = getCurrentUser();
        setCurrentUser(user);

        const myTrips = await trackingApi.getMyTrips();
        const sorted = [...(myTrips || [])].sort((a, b) => {
          const pa = tripPriority(a.shipment_status);
          const pb = tripPriority(b.shipment_status);
          if (pa !== pb) return pa - pb;
          return Number(b.shipment_id) - Number(a.shipment_id);
        });
        setTrips(sorted);

        if (sorted.length > 0) {
          const target = sorted[0];
          setActiveTrip(target);

          if (target?.shipment_id) {
            try {
              const details = await trackingApi.getTrackingDetails(target.shipment_id);
              setTrackingDetails(details);
            } catch (e) {
              console.warn('Could not load tracking details for shipment', target.shipment_id, e);
            }
          }
        } else {
          setActiveTrip(null);
          setTrackingDetails(null);
        }
      } catch (err: any) {
        const msg =
          err?.message ||
          (isEn
            ? 'Unable to sync assigned trips from server.'
            : 'Không thể đồng bộ dữ liệu chuyến đi từ máy chủ.');
        setLoadError(msg);
        if (!silent) toast.error(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isEn],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleSelectTrip = async (trip: AssignedTripSummary) => {
    setActiveTrip(trip);
    if (trip.shipment_id) {
      try {
        const details = await trackingApi.getTrackingDetails(trip.shipment_id);
        setTrackingDetails(details);
      } catch (e) {
        console.warn('Could not load tracking details for shipment', trip.shipment_id, e);
      }
    }
  };

  const openEmergencyModal = () => {
    if (!activeTrip) return;
    setEmergencyType(isEscort ? 'horse_medical' : 'vehicle_breakdown');
    setEmergencyReason('');
    setEmergencyModalOpen(true);
  };

  const closeEmergencyModal = () => {
    if (isSendingEmergency) return;
    setEmergencyModalOpen(false);
    setEmergencyReason('');
  };

  const handleSendEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingEmergency) return;
    if (!activeTrip) {
      toast.error(isEn ? 'No active trip to report SOS.' : 'Không có chuyến đi đang kích hoạt để báo sự cố.');
      setEmergencyModalOpen(false);
      return;
    }

    setIsSendingEmergency(true);
    try {
      const activeMs = trackingDetails?.milestones?.find((m) => m.status === 'CURRENT');
      await incidentsApi.createIncident(activeTrip.shipment_id, {
        incidentType: emergencyType,
        severity: 'critical',
        locationText: activeMs?.location || activeTrip.origin_location,
        description:
          emergencyReason.trim() ||
          (isEn
            ? 'Urgent field SOS alert dispatched from route'
            : 'Phát tín hiệu cứu hộ khẩn cấp từ tuyến vận chuyển'),
      });
      toast.success(
        isEn
          ? 'Emergency SOS sent to Logistics Manager! Rescue support has been notified.'
          : 'Tín hiệu cứu hộ khẩn cấp đã gửi tới Logistics Manager! Bộ phận điều hành đang xử lý.',
        { duration: 7000 },
      );
      setEmergencyModalOpen(false);
      setEmergencyReason('');
      void loadDashboard(true);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to dispatch SOS signal.' : 'Không thể phát tín hiệu khẩn cấp qua mạng.'));
    } finally {
      setIsSendingEmergency(false);
    }
  };

  const mapStatusToBadge = (status?: string): { label: string; variant: BadgeVariant } => {
    const s = (status || '').toLowerCase();
    const label = translateStatus(status || 'pending');
    if (s === 'in_transit' || s === 'return_pending') return { label, variant: 'transit' };
    if (s === 'ready_to_depart' || s === 'confirmed') return { label, variant: 'info' };
    if (s === 'completed' || s === 'delivered') return { label, variant: 'success' };
    if (s === 'planning') return { label, variant: 'pending' };
    return { label, variant: 'neutral' };
  };

  const pendingConfirmTrips = useMemo(
    () =>
      trips.filter(
        (tr) =>
          !Boolean(tr.is_confirmed) &&
          !['completed', 'delivered', 'in_transit', 'return_pending'].includes(
            String(tr.shipment_status || '').toLowerCase(),
          ),
      ),
    [trips],
  );

  const totalAssignedHorses = trips.reduce((sum, tr) => sum + (Number(tr.requested_horse_count) || 1), 0);
  const activeCount = trips.filter((tr) =>
    ['in_transit', 'return_pending'].includes(String(tr.shipment_status || '').toLowerCase()),
  ).length;
  const completedMilestones = trackingDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalMilestones = trackingDetails?.milestones?.length || 0;
  const currentMilestone = trackingDetails?.milestones?.find((m) => m.status === 'CURRENT') || null;
  const progressPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const escortContact = parseNameAndPhone(trackingDetails?.assignedEscort);
  const driverContact = parseNameAndPhone(trackingDetails?.assignedDriver);
  const activeShipmentParam = activeTrip ? `?shipmentId=${activeTrip.shipment_id}` : '';

  return (
    <div className="flex flex-col gap-4 sm:gap-5 pb-12 min-w-0">
      {/* 1. COMPACT FIELD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E5DDD0]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                isEscort
                  ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                  : 'bg-[#FAF8F4] text-[#966516] border-[#D4C5A3]'
              }`}
            >
              {isEscort
                ? isEn ? 'Equine Vet / Escort' : 'Bác sĩ thú y / Áp tải'
                : isEn ? 'Driver' : 'Tài xế'}
            </span>
            <span className="text-xs text-[#5F6977] font-semibold truncate">
              {currentUser?.fullName || currentUser?.name || ''}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] m-0 tracking-tight">
            {isEn ? 'Field Operations Dashboard' : 'Tổng Quan Điều Hành Thực Địa'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
            className="min-h-[42px] px-3.5 bg-white hover:bg-[#FAF8F4] text-[#181A17] border-[#D8CEBE] text-xs font-bold"
          >
            <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh', isEn ? 'Refresh' : 'Làm mới')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!activeTrip}
            onClick={openEmergencyModal}
            className="min-h-[42px] px-3.5 bg-[#B33E3E] hover:bg-[#932E2E] text-white font-extrabold text-xs shadow-sm border border-[#9E3B3B] cursor-pointer disabled:opacity-45"
          >
            <AlertTriangle size={14} className="mr-1.5 stroke-[2.5]" aria-hidden="true" />
            {isEn ? 'Emergency SOS' : 'Báo Cứu Hộ SOS'}
          </Button>
        </div>
      </div>

      {/* 2. MOBILE-COMPACT 3-COLUMN KPI STRIP */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-2xl bg-white border border-[#E5DDD0] shadow-xs flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#5F6977] m-0 truncate">
              {isEn ? 'Trips' : 'Chuyến giao'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#181A17] m-0 mt-0.5 tabular-nums">{trips.length}</p>
            <span className="text-[10px] sm:text-[11px] text-[#287653] font-semibold block truncate">
              {isEn ? `${activeCount} active` : `${activeCount} đang chạy`}
            </span>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-[#FAF8F4] text-[#181A17] items-center justify-center shrink-0 border border-[#EAE5DA]">
            <Truck size={18} aria-hidden="true" />
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white border border-[#E5DDD0] shadow-xs flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#5F6977] m-0 truncate">
              {isEn ? 'Horses' : 'Chiến mã'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#181A17] m-0 mt-0.5 tabular-nums">{totalAssignedHorses}</p>
            <span className="text-[10px] sm:text-[11px] text-[#747D88] block truncate">
              {isEn ? 'In care' : 'Đang phụ trách'}
            </span>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-[#E8F2EB] text-[#287653] items-center justify-center shrink-0 border border-[#B7DBC4]">
            <HeartPulse size={18} aria-hidden="true" />
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white border border-[#D8CEBE] shadow-xs flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#57564E] m-0 truncate">
              {isEn ? 'Progress' : 'Tiến độ'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#181A17] m-0 mt-0.5 tabular-nums">
              {totalMilestones > 0 ? `${completedMilestones}/${totalMilestones}` : '0/0'}
            </p>
            <span className="text-[10px] sm:text-[11px] text-[#A67C2E] font-bold block truncate tabular-nums">
              {totalMilestones > 0 ? `${progressPct}%` : isEn ? 'Standby' : 'Chờ xuất phát'}
            </span>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-[#FAF5EB] text-[#A67C2E] items-center justify-center shrink-0 border border-[#D4C5A3]">
            <Crosshair size={18} aria-hidden="true" />
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer"
          >
            {isEn ? 'Retry' : 'Thử lại'}
          </button>
        </div>
      )}

      {/* 3. ACTION-FIRST: PENDING ASSIGNMENT CONFIRMATION BANNER */}
      {pendingConfirmTrips.length > 0 && (
        <div className="p-4 rounded-2xl border-2 border-[#A67C2E] bg-[#FAF5EB] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Clock size={18} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-extrabold text-[#181A17] m-0">
                {isEn
                  ? `${pendingConfirmTrips.length} trip assignment(s) awaiting your confirmation`
                  : `Có ${pendingConfirmTrips.length} chuyến đi mới đang chờ bạn xác nhận nhận chuyến`}
              </p>
              <p className="text-xs text-[#57564E] m-0 mt-0.5 truncate">
                {pendingConfirmTrips
                  .map((tr) => `${formatCode(tr.request_code, tr.shipment_id)} (${tr.origin_location.split(',')[0]} → ${tr.destination_location.split(',')[0]})`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <Link
            href={`${basePath}/trips`}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 no-underline shrink-0"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>{isEn ? 'Review & Confirm' : 'Xác nhận ngay'}</span>
          </Link>
        </div>
      )}

      {/* 4. ACTION-FIRST: CURRENT MILESTONE CHECK-IN HERO (ABOVE THE FOLD ON MOBILE) */}
      {!isLoading && activeTrip && currentMilestone && (
        <div className="rounded-2xl border-2 border-[#181A17] bg-gradient-to-br from-[#181A17] via-[#232620] to-[#181A17] text-[#FAF8F4] p-4 sm:p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-[#A67C2E] text-white font-extrabold">
                {formatCode(activeTrip.request_code, activeTrip.shipment_id)}
              </span>
              <span className="text-[#C4B38E] font-bold uppercase tracking-wider">
                {isEn
                  ? `Next Milestone #${currentMilestone.seq}/${totalMilestones}`
                  : `Mốc cần xử lý #${currentMilestone.seq}/${totalMilestones}`}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white m-0 mt-1.5 break-words leading-snug">
              {currentMilestone.title}
            </h2>
            <p className="text-xs text-[#D8CEBE] m-0 mt-1 flex items-start gap-1.5 break-words">
              <MapPin size={13} className="text-[#C4B38E] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{currentMilestone.location}</span>
            </p>
          </div>

          <Link
            href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#A67C2E] hover:bg-[#8E6822] text-white font-extrabold text-xs inline-flex items-center justify-center gap-2 no-underline shadow-sm shrink-0 transition-colors"
          >
            <Crosshair size={16} aria-hidden="true" />
            <span>{isEn ? 'Check-in Now' : 'Check-in ngay'}</span>
          </Link>
        </div>
      )}

      {/* 5. ACTIVE TRIP DETAILS SECTION */}
      {isLoading ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-[#D8CEBE] flex flex-col items-center gap-2.5">
          <RefreshCw size={26} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {isEn ? 'Loading your field trip data...' : 'Đang tải dữ liệu chuyến đi thực địa của bạn...'}
          </p>
        </div>
      ) : !activeTrip ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF8F4] text-[#8A8478] flex items-center justify-center border border-[#D8CEBE]">
            <Truck size={28} aria-hidden="true" />
          </div>
          <div className="max-w-md">
            <h2 className="text-lg font-bold text-[#181A17] m-0">
              {isEn ? 'No Trips Assigned Right Now' : 'Hiện Tại Chưa Có Chuyến Đi Nào Được Phân Công'}
            </h2>
            <p className="text-xs sm:text-sm text-[#57564E] mt-1.5 leading-relaxed m-0">
              {isEn
                ? 'You are on standby. Once Logistics Manager assigns you to a transport itinerary, routes and horse dossiers will appear here.'
                : 'Bạn đang ở trạng thái sẵn sàng. Khi Quản lý Logistics phân công bạn vào chuyến vận chuyển, tuyến đường và hồ sơ ngựa sẽ xuất hiện tại đây.'}
            </p>
          </div>
          <Link
            href={`${basePath}/trips`}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] font-bold text-xs no-underline"
          >
            <Truck size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
            {isEn ? 'View My Trips' : 'Xem Danh Sách Chuyến Đi'}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Main Trip Card (Full width — Quick Actions already live in sidebar) */}
          <div className="flex flex-col gap-5 min-w-0">
            {trips.length > 1 && (
              <div className="bg-white rounded-2xl border border-[#E5DDD0] px-3.5 py-2.5 shadow-xs flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] shrink-0">
                  {isEn ? 'Switch trip:' : 'Chọn chuyến:'}
                </span>
                {trips.map((tr) => {
                  const isSelected = tr.shipment_id === activeTrip.shipment_id;
                  const code = formatCode(tr.customer_request_code || tr.request_code, tr.shipment_id);
                  return (
                    <button
                      key={tr.shipment_id}
                      type="button"
                      onClick={() => void handleSelectTrip(tr)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-[#181A17] text-white border-[#181A17]'
                          : 'bg-[#FAF8F4] text-[#181A17] border-[#D8CEBE] hover:border-[#A67C2E]'
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-6 shadow-sm flex flex-col gap-5 min-w-0">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE5DA] pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-[#181A17] text-base">
                      {formatCode(activeTrip.customer_request_code || activeTrip.request_code, activeTrip.shipment_id)}
                    </span>
                    <StatusBadge
                      label={translateStatus(activeTrip.shipment_status)}
                      variant={mapStatusToBadge(activeTrip.shipment_status).variant}
                      hasDot={
                        activeTrip.shipment_status === 'in_transit' ||
                        activeTrip.shipment_status === 'return_pending'
                      }
                    />
                    <span className="text-xs font-semibold text-[#57564E]">
                      {activeTrip.contact_name || (isEn ? 'Client' : 'Khách hàng')}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#181A17] m-0 mt-1.5 break-words">
                    {activeTrip.route_name || `${activeTrip.origin_location} → ${activeTrip.destination_location}`}
                  </h2>
                </div>

                <Link
                  href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
                  className="inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] font-bold text-xs no-underline shadow-sm transition-colors shrink-0"
                >
                  <Crosshair size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
                  {isEn ? 'Open Trip Console' : 'Mở bảng điều hành'}
                </Link>
              </div>

              {/* Specs Grid with full origin/destination & clickable tel: links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#FAF8F4] p-4 rounded-xl border border-[#EAE5DA] text-xs">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {isEn ? 'Pickup Origin' : 'Điểm đón'}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 break-words">
                    {activeTrip.origin_location || '—'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {isEn ? 'Destination' : 'Điểm đến'}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 break-words">
                    {activeTrip.destination_location || '—'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {isEn ? 'Vehicle & Driver' : 'Phương tiện & Tài xế'}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 break-words">
                    {translateVehicleType(trackingDetails?.assignedVehicle) ||
                      trackingDetails?.assignedVehicle ||
                      (isEn ? 'Specialized Vehicle' : 'Xe chuyên dụng')}
                    {driverContact.name ? ` · ${driverContact.name}` : ''}
                  </span>
                  {driverContact.phone && (
                    <a
                      href={`tel:${driverContact.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2D5A3F] hover:underline mt-0.5"
                    >
                      <Phone size={11} aria-hidden="true" />
                      {driverContact.phone}
                    </a>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {isEn ? 'Vet / Escort' : 'Thú y / Áp tải'}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 break-words">
                    {escortContact.name || (isEn ? 'Unassigned' : 'Chưa gán')}
                  </span>
                  {escortContact.phone && (
                    <a
                      href={`tel:${escortContact.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2D5A3F] hover:underline mt-0.5"
                    >
                      <Phone size={11} aria-hidden="true" />
                      {escortContact.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* ALL Milestones Progress (no .slice(0, 5) truncation!) */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold text-[#181A17] uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <Crosshair size={14} className="text-[#A67C2E]" aria-hidden="true" />
                    {isEn ? 'All Route Milestones' : 'Toàn Bộ Mốc Hành Trình'}
                  </h3>
                  <span className="text-xs text-[#747D88] font-semibold tabular-nums">
                    {completedMilestones}/{totalMilestones}{' '}
                    {isEn ? 'completed' : 'mốc hoàn tất'} ({progressPct}%)
                  </span>
                </div>

                {trackingDetails?.milestones && trackingDetails.milestones.length > 0 ? (
                  <div className="relative border-l-2 border-[#D8CEBE] ml-3 pl-5 flex flex-col gap-3.5 py-1">
                    {trackingDetails.milestones.map((m) => {
                      const isCompleted = m.status === 'COMPLETED';
                      const isCurrent = m.status === 'CURRENT';

                      return (
                        <div key={m.id} className="relative text-xs">
                          <div
                            className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${
                              isCompleted
                                ? 'border-[#2D5A3F] text-[#2D5A3F]'
                                : isCurrent
                                ? 'border-[#181A17] text-[#A67C2E] animate-pulse'
                                : 'border-[#D8CEBE] text-[#D8CEBE]'
                            }`}
                          >
                            {isCompleted && <div className="w-2 h-2 rounded-full bg-[#2D5A3F]" />}
                            {isCurrent && <div className="w-2 h-2 rounded-full bg-[#181A17]" />}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className={`font-bold m-0 break-words ${isCurrent ? 'text-[#181A17]' : isCompleted ? 'text-[#3C403A]' : 'text-[#747D88]'}`}>
                                #{m.seq} - {m.title}
                              </p>
                              <span className="text-[11px] text-[#747D88] block mt-0.5 break-words">
                                {m.location}{' '}
                                {m.isCustomsBorder &&
                                  `· [${isEn ? 'Customs / Quarantine' : 'Hải quan / Kiểm dịch'}]`}
                              </span>
                            </div>

                            {isCurrent ? (
                              <Link
                                href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
                                className="no-underline px-2.5 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                              >
                                <span>{isEn ? 'Check-in →' : 'Check-in →'}</span>
                              </Link>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  isCompleted
                                    ? 'bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/20'
                                    : 'bg-[#F4F1E9] text-[#747D88]'
                                }`}
                              >
                                {isCompleted
                                  ? isEn ? 'Done' : 'Đã xong'
                                  : isEn ? 'Pending' : 'Chờ tới'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#747D88] py-3 italic m-0">
                    {isEn ? 'No milestones configured yet.' : 'Chưa có danh sách mốc hành trình.'}
                  </p>
                )}
              </div>

              {/* Assigned Horses List */}
              <div className="border-t border-[#EAE5DA] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold text-[#181A17] uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <HeartPulse size={14} className="text-[#2D5A3F]" aria-hidden="true" />
                    {isEn ? 'Assigned Horses' : 'Danh sách ngựa phụ trách'}
                  </h3>
                  <Link
                    href={`${basePath}/health${activeShipmentParam}`}
                    className="text-xs text-[#A67C2E] hover:underline font-semibold"
                  >
                    {isEn ? 'View health dossier →' : 'Xem hồ sơ sức khỏe →'}
                  </Link>
                </div>

                {trackingDetails?.assignedHorses && trackingDetails.assignedHorses.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {trackingDetails.assignedHorses.map((horse) => (
                      <div
                        key={horse.id}
                        className="p-3 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#A67C2E] transition-all flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/20 font-black text-xs flex items-center justify-center shrink-0">
                            {(horse.name || 'H').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[#181A17] m-0 truncate">{horse.name}</p>
                            <span className="text-[11px] text-[#747D88] block mt-0.5 truncate">
                              {translateBreed(horse.breed) || (isEn ? 'Racehorse' : 'Ngựa đua')}{' '}
                              {horse.microchipNo ? `· Chip: ${horse.microchipNo}` : ''}
                            </span>
                          </div>
                        </div>

                        <Link
                          href={`${basePath}/health${activeShipmentParam}`}
                          className="inline-flex items-center justify-center min-h-[36px] px-3 py-1 rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] hover:border-[#A67C2E] text-[11px] font-bold text-[#181A17] no-underline shrink-0"
                        >
                          {isEn ? 'Vitals' : 'Sinh hiệu'}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#747D88] py-2 italic m-0">
                    {isEn ? 'No horses assigned to this shipment yet.' : 'Chưa có hồ sơ ngựa được gán cho chuyến này.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY SOS CONFIRMATION MODAL (Unified Flow 5 incidentsApi) */}
      <Modal
        isOpen={emergencyModalOpen}
        onClose={closeEmergencyModal}
        closeDisabled={isSendingEmergency}
        title={isEn ? 'Confirm Emergency SOS Alert' : 'Xác Nhận Phát Tín Hiệu Cứu Hộ Khẩn Cấp (SOS)'}
        maxWidth="500px"
      >
        <form onSubmit={handleSendEmergency} className="flex flex-col gap-4 text-xs">
          <div className="p-3.5 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900 leading-relaxed">
            <strong className="block text-sm mb-1 text-rose-950">
              {isEn ? 'Urgent Alert to Logistics Manager & Vet Rescue' : 'Cảnh báo khẩn cấp tới Quản lý Logistics & Cứu hộ Thú y'}
            </strong>
            {isEn
              ? 'Immediately opens a Critical incident report for Logistics Manager to arrange backup transport, emergency vet support, or rerouting.'
              : 'Hệ thống sẽ lập tức tạo hồ sơ sự cố mức Khẩn cấp gửi tới Logistics Manager để điều phối xe thay thế, hỗ trợ thú y gần nhất hoặc duyệt đổi tuyến.'}
          </div>

          <div>
            <label htmlFor="driver-sos-type" className="font-bold text-[#181A17] block mb-1.5">
              {isEn ? 'Emergency Type *' : 'Loại sự cố khẩn cấp *'}
            </label>
            <select
              id="driver-sos-type"
              value={emergencyType}
              onChange={(e) => setEmergencyType(e.target.value as typeof emergencyType)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold text-xs"
            >
              <option value="vehicle_breakdown">{translateIncident('vehicle_breakdown')}</option>
              <option value="horse_medical">{translateIncident('horse_medical')}</option>
              <option value="traffic_delay">{translateIncident('traffic_delay')}</option>
              <option value="border_issue">{translateIncident('border_issue')}</option>
              <option value="weather">{translateIncident('weather')}</option>
              <option value="other">{translateIncident('other')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="driver-sos-reason" className="font-bold text-[#181A17] block mb-1.5">
              {isEn ? 'Short description of emergency:' : 'Mô tả ngắn tình trạng sự cố:'}
            </label>
            <textarea
              id="driver-sos-reason"
              rows={3}
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. Tire blowout on highway / Horse showing colic signs, temperature 39.5°C...'
                  : 'Ví dụ: Xe nổ lốp trên quốc lộ / Ngựa có dấu hiệu đau bụng, thân nhiệt 39.5°C cần thú y hỗ trợ...'
              }
              className="w-full p-3 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#9E3B3B] font-medium"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#EAE5DA]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeEmergencyModal}
              disabled={isSendingEmergency}
              className="min-h-[44px] px-4 border-[#D8CEBE]"
            >
              {isEn ? 'Cancel' : 'Hủy bỏ'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSendingEmergency || !activeTrip}
              className="min-h-[44px] px-5 bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold cursor-pointer"
            >
              {isSendingEmergency
                ? isEn ? 'Sending SOS...' : 'Đang phát tín hiệu...'
                : isEn ? 'Confirm & Send SOS' : 'Xác nhận gửi SOS'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
