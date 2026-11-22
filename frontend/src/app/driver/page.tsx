'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi, AssignedTripSummary, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import { routesApi } from '@/features/routes/api/routes.api';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function DriverDashboardPage() {
  const pathname = usePathname();
  const { t, language, translateStatus, translateVehicleType, translateBreed } = useLanguage();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [activeTrip, setActiveTrip] = useState<AssignedTripSummary | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Emergency SOS Modal
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
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
        setTrips(myTrips || []);

        if (myTrips && myTrips.length > 0) {
          const target =
            myTrips.find((tr) => tr.shipment_status === 'in_transit') ||
            myTrips.find((tr) => tr.shipment_status === 'ready_to_depart') ||
            myTrips.find((tr) => tr.shipment_status === 'confirmed') ||
            myTrips[0];

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
          t(
            'driver.dashboard.loadFailed',
            language === 'en'
              ? 'Unable to sync assigned trips from server.'
              : 'Không thể đồng bộ dữ liệu chuyến đi từ máy chủ.'
          );
        setLoadError(msg);
        if (!silent) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [language, t]
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
      toast.error(
        t(
          'driver.dashboard.noActiveTripToAlert',
          language === 'en' ? 'No active trip to report SOS.' : 'Không có chuyến đi đang kích hoạt để báo sự cố.'
        )
      );
      setEmergencyModalOpen(false);
      return;
    }

    setIsSendingEmergency(true);
    try {
      await routesApi.reportIncident(activeTrip.shipment_id, {
        incidentType: 'emergency_sos',
        description:
          emergencyReason.trim() ||
          (language === 'en'
            ? 'Driver/Escort dispatched emergency SOS signal on route'
            : 'Tài xế/Hộ tống phát tín hiệu cứu hộ khẩn cấp trên tuyến vận chuyển'),
        severity: 'critical',
      });
      toast.success(
        t(
          'driver.dashboard.sosDispatched',
          language === 'en'
            ? 'Emergency SOS dispatched to Logistics Manager & Fleet Coordinator!'
            : 'Tín hiệu khẩn cấp đã được gửi tới Logistics Manager & Fleet Coordinator! Đội cứu hộ đang liên lạc.'
        ),
        { duration: 8000 }
      );
      setEmergencyModalOpen(false);
      setEmergencyReason('');
      void loadDashboard(true);
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('driver.dashboard.sosFailed', language === 'en' ? 'Failed to dispatch SOS signal.' : 'Không thể phát tín hiệu khẩn cấp qua mạng.')
      );
    } finally {
      setIsSendingEmergency(false);
    }
  };

  const mapStatusToBadge = (status?: string): { label: string; variant: BadgeVariant } => {
    const s = (status || '').toLowerCase();
    const label = translateStatus(status || 'pending');
    if (s.includes('transit')) return { label, variant: 'transit' };
    if (s.includes('ready')) return { label, variant: 'info' };
    if (s.includes('complete')) return { label, variant: 'success' };
    if (s.includes('confirm')) return { label, variant: 'info' };
    if (s.includes('plan')) return { label, variant: 'pending' };
    return { label, variant: 'neutral' };
  };

  const totalAssignedHorses = trips.reduce(
    (sum, tr) => sum + (Number(tr.requested_horse_count) || 1),
    0
  );

  const completedMilestones =
    trackingDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalMilestones = trackingDetails?.milestones?.length || 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* 1. EDITORIAL LIGHT HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-5 border-b border-[#E5DDD0]">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${
                isEscort
                  ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                  : 'bg-[#FAF8F4] text-[#966516] border-[#D4C5A3]'
              }`}
            >
              {isEscort
                ? t('role.escort', language === 'en' ? 'Equine Vet / Escort' : 'Bác sĩ Thú y / Hộ tống')
                : t('driver.dashboard.driverRoleTitle', language === 'en' ? 'Vehicle Driver' : 'Tài xế Vận tải Chuyên nghiệp')}
            </span>
            <span className="text-xs text-[#5F6977] font-medium">
              • {currentUser?.fullName || currentUser?.name || (language === 'en' ? 'Crew Member' : 'Nhân sự vận chuyển')}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#181A17] m-0 tracking-tight">
            {t('driver.dashboard.title', language === 'en' ? 'Field Operations & Trip Monitoring' : 'Bảng Điều Khiển Thực Địa & Giám Sát Chuyến Đi')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
            className="min-h-[42px] px-4 bg-white hover:bg-[#FAF8F4] text-[#181A17] border-[#D8CEBE] text-xs font-bold"
          >
            <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!activeTrip}
            onClick={openEmergencyModal}
            title={!activeTrip ? (language === 'en' ? 'No active trip assigned' : 'Chưa có chuyến đi để báo SOS') : undefined}
            className="min-h-[42px] px-4 bg-[#B33E3E] hover:bg-[#932E2E] text-white font-extrabold text-xs shadow-sm border border-[#9E3B3B] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <AlertTriangle size={15} className="mr-1.5 stroke-[2.5]" aria-hidden="true" />
            {t('driver.dashboard.reportIncident', language === 'en' ? 'Emergency SOS' : 'Báo Cứu Hộ SOS')}
          </Button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* 2. STATS KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E5DDD0] shadow-sm flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] m-0">
              {t('driver.dashboard.assignedTrips', language === 'en' ? 'Assigned Trips' : 'Chuyến được phân công')}
            </p>
            <p className="text-2xl font-black text-[#181A17] m-0 mt-1">{trips.length}</p>
            <span className="text-[11px] text-[#747D88] mt-0.5 block">
              {t('driver.dashboard.inTransitTrips', '{count} chuyến đang di chuyển', {
                count: trips.filter((tr) => tr.shipment_status === 'in_transit').length,
              })}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FAF8F4] text-[#181A17] flex items-center justify-center shrink-0 border border-[#EAE5DA]">
            <Truck size={22} aria-hidden="true" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5DDD0] shadow-sm flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] m-0">
              {t('dashboard.totalHorses', language === 'en' ? 'Assigned Horses' : 'Chiến mã phụ trách')}
            </p>
            <p className="text-2xl font-black text-[#181A17] m-0 mt-1">{totalAssignedHorses}</p>
            <span className="text-[11px] text-[#747D88] mt-0.5 block">
              {language === 'en'
                ? `Across ${trips.length} trip(s)`
                : `Trên ${trips.length} chuyến phân công`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#E8F2EB] text-[#287653] flex items-center justify-center shrink-0 border border-[#B7DBC4]">
            <HeartPulse size={22} aria-hidden="true" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#D8CEBE] shadow-sm flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#57564E] m-0">
              {t('driver.status.milestonesTitle', language === 'en' ? 'Current Progress' : 'Tiến độ mốc hiện tại')}
            </p>
            <p className="text-2xl font-black text-[#181A17] m-0 mt-1">
              {totalMilestones > 0 ? `${completedMilestones}/${totalMilestones}` : '0/0'}
            </p>
            <span className="text-[11px] text-[#747D88] mt-0.5 block">
              {totalMilestones > 0
                ? `${Math.round((completedMilestones / totalMilestones) * 100)}%`
                : t('common.pending', language === 'en' ? 'Pending activation' : 'Chưa kích hoạt')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FAF5EB] text-[#A67C2E] flex items-center justify-center shrink-0 border border-[#D4C5A3]">
            <Crosshair size={22} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* 3. ACTIVE TRIP SECTION */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {t('driver.dashboard.loadingTrip', language === 'en' ? 'Loading your field trip data...' : 'Đang tải dữ liệu chuyến đi thực địa của bạn...')}
          </p>
        </div>
      ) : !activeTrip ? (
        <div className="p-10 sm:p-14 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF8F4] text-[#8A8478] flex items-center justify-center border border-[#D8CEBE]">
            <Truck size={32} aria-hidden="true" />
          </div>
          <div className="max-w-md">
            <h2 className="text-lg font-bold text-[#181A17] m-0">
              {t('driver.noTripsTitle', language === 'en' ? 'No Trips Assigned Right Now' : 'Hiện Tại Chưa Có Chuyến Đi Nào Được Phân Công')}
            </h2>
            <p className="text-xs sm:text-sm text-[#57564E] mt-2 leading-relaxed m-0">
              {t(
                'driver.noTripsDesc',
                language === 'en'
                  ? 'You are on standby. Once assigned to an approved itinerary, trip routes, vehicle details, and equine dossiers will appear here.'
                  : 'Bạn đang ở trạng thái sẵn sàng. Khi Quản lý Logistics hoặc Điều phối viên chỉ định bạn vào lịch trình vận chuyển, toàn bộ tuyến đường, thông tin xe và hồ sơ sức khỏe ngựa sẽ tự động xuất hiện tại đây.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <Link
              href={`${basePath}/trips`}
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] font-bold text-xs no-underline shadow-sm transition-colors"
            >
              <Truck size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
              {t('driver.dashboard.viewAllTrips', language === 'en' ? 'View All Trips' : 'Xem Tất Cả Chuyến Đi')}
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadDashboard(true)}
              className="min-h-[44px] px-4 font-bold text-xs border-[#D8CEBE]"
            >
              <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
              {t('common.refresh', language === 'en' ? 'Check again' : 'Kiểm tra lại')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Trip Card (Left 2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {trips.length > 1 && (
              <div className="bg-white rounded-2xl border border-[#E5DDD0] px-4 py-3 shadow-xs flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] mr-1">
                  {t('driver.dashboard.selectTrip', language === 'en' ? 'Assigned trips:' : 'Chọn chuyến:')}
                </span>
                {trips.map((tr) => {
                  const isSelected = tr.shipment_id === activeTrip.shipment_id;
                  const code = tr.customer_request_code || tr.request_code || `#${tr.shipment_id}`;
                  return (
                    <button
                      key={tr.shipment_id}
                      type="button"
                      onClick={() => void handleSelectTrip(tr)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#181A17] text-white border-[#181A17]'
                          : 'bg-[#FAF8F4] text-[#181A17] border-[#D8CEBE] hover:border-[#A67C2E]'
                      }`}
                    >
                      #{code}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 sm:p-6 shadow-sm flex flex-col gap-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE5DA] pb-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-black text-[#181A17] text-base">
                      #{activeTrip.customer_request_code || activeTrip.request_code}
                    </span>
                    <span className="text-xs text-[#8A8478]">•</span>
                    <span className="text-xs font-semibold text-[#57564E]">
                      {t('coordinator.routes.customerLabel', language === 'en' ? 'Customer:' : 'Khách hàng:')}{' '}
                      {activeTrip.contact_name || (language === 'en' ? 'Client' : 'Khách hàng')}
                    </span>
                    <StatusBadge
                      label={translateStatus(activeTrip.shipment_status)}
                      variant={mapStatusToBadge(activeTrip.shipment_status).variant}
                      hasDot
                    />
                  </div>
                  <h2 className="text-lg font-bold text-[#181A17] m-0 mt-1.5 break-words">
                    {activeTrip.route_name ||
                      `${(activeTrip.origin_location || '').split(',')[0]} → ${(activeTrip.destination_location || '').split(',')[0]}`}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
                    className="inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] font-bold text-xs no-underline shadow-sm transition-colors"
                  >
                    <Crosshair size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
                    {t('driver.updateMilestoneBtn', language === 'en' ? 'Update Milestone' : 'Cập nhật mốc')}
                  </Link>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#FAF8F4] p-4 rounded-xl border border-[#EAE5DA] text-xs">
                <div>
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {t('common.origin', language === 'en' ? 'Origin' : 'Điểm đón')}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 truncate" title={activeTrip.origin_location}>
                    {(activeTrip.origin_location || '').split(',')[0] || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {t('common.destination', language === 'en' ? 'Destination' : 'Điểm đến')}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 truncate" title={activeTrip.destination_location}>
                    {(activeTrip.destination_location || '').split(',')[0] || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {t('fleet.vehicle', language === 'en' ? 'Vehicle' : 'Phương tiện')}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 truncate">
                    {translateVehicleType(trackingDetails?.assignedVehicle) ||
                      trackingDetails?.assignedVehicle ||
                      (language === 'en' ? 'Specialized Vehicle' : 'Xe chuyên dụng')}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#747D88] uppercase block">
                    {t('coordinator.assignEscort', language === 'en' ? 'Vet / Escort' : 'Hộ tống y tế')}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 truncate">
                    {trackingDetails?.assignedEscort || t('driver.status.unassigned', language === 'en' ? 'Unassigned' : 'Chưa gán')}
                  </span>
                </div>
              </div>

              {/* Milestone Timeline Progress */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold text-[#181A17] uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <Crosshair size={14} className="text-[#A67C2E]" aria-hidden="true" />
                    {t('driver.dashboard.timelineTitle', language === 'en' ? 'Route Progress & Live Stops' : 'Tiến độ chặng & Trạm dừng thực tế')}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#747D88] font-semibold">
                      {completedMilestones} / {totalMilestones}{' '}
                      {t('driver.dashboard.milestonesCompleted', language === 'en' ? 'milestones completed' : 'mốc hoàn tất')}
                    </span>
                    <Link
                      href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
                      className="text-xs font-bold text-[#A67C2E] hover:underline whitespace-nowrap"
                    >
                      {t('driver.dashboard.viewAllMilestonesLink', language === 'en' ? 'View full timeline →' : 'Xem tất cả mốc →')}
                    </Link>
                  </div>
                </div>

                {trackingDetails?.milestones && trackingDetails.milestones.length > 0 ? (
                  <div className="relative border-l-2 border-[#D8CEBE] ml-3 pl-5 flex flex-col gap-4 py-2">
                    {trackingDetails.milestones.slice(0, 5).map((m) => {
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
                            <div>
                              <p className={`font-bold m-0 ${isCurrent ? 'text-[#181A17]' : isCompleted ? 'text-[#3C403A]' : 'text-[#747D88]'}`}>
                                #{m.seq} - {m.title}
                              </p>
                              <span className="text-[11px] text-[#747D88] block mt-0.5">
                                {m.location}{' '}
                                {m.isCustomsBorder &&
                                  `• [${t('driver.status.customsQuarantineBadge', language === 'en' ? 'Customs / Quarantine' : 'Hải quan / Kiểm dịch')}]`}
                              </span>
                            </div>

                            {isCurrent ? (
                              <Link
                                href={`${basePath}/status?shipmentId=${activeTrip.shipment_id}`}
                                className="no-underline px-2.5 py-1 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-[11px] font-bold inline-flex items-center gap-1 shadow-xs transition-colors"
                              >
                                <span>{t('driver.dashboard.checkinAction', 'Check-in →')}</span>
                              </Link>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isCompleted
                                    ? 'bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/20'
                                    : 'bg-[#F4F1E9] text-[#747D88]'
                                }`}
                              >
                                {isCompleted
                                  ? t('common.completed', language === 'en' ? 'Done' : 'Đã xong')
                                  : t('common.pending', language === 'en' ? 'Pending' : 'Chờ xử lý')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#747D88] py-3 italic m-0">
                    {t('driver.dashboard.noMilestonesAssigned', language === 'en' ? 'No milestones configured yet.' : 'Chưa có danh sách mốc hành trình từ Điều phối viên.')}
                  </p>
                )}
              </div>

              {/* Assigned Horses List */}
              <div className="border-t border-[#EAE5DA] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold text-[#181A17] uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <HeartPulse size={14} className="text-[#2D5A3F]" aria-hidden="true" />
                    {t('driver.dashboard.assignedHorsesListTitle', language === 'en' ? 'Assigned Horses' : 'Danh sách ngựa đua phụ trách')}
                  </h3>
                  <Link href={`${basePath}/health`} className="text-xs text-[#A67C2E] hover:underline font-semibold">
                    {t('driver.dashboard.viewHealthDossierLink', language === 'en' ? 'View health dossier →' : 'Xem hồ sơ sức khỏe →')}
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
                              {translateBreed(horse.breed) || (language === 'en' ? 'Racehorse' : 'Ngựa đua thuần chủng')}{' '}
                              {horse.microchipNo ? `• Chip: ${horse.microchipNo}` : ''}
                            </span>
                          </div>
                        </div>

                        {isEscort && (
                          <Link
                            href={`${basePath}/health`}
                            className="inline-flex items-center justify-center min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] hover:border-[#A67C2E] text-[11px] font-bold text-[#181A17] no-underline shrink-0 transition-colors"
                          >
                            {t('driver.dashboard.recordVitalsBtn', language === 'en' ? 'Log vitals' : 'Ghi sinh hiệu')}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#747D88] py-2 italic m-0">
                    {t('driver.dashboard.noHorsesAssigned', language === 'en' ? 'No horses assigned to this shipment yet.' : 'Chưa có hồ sơ ngựa đua được gán cho chuyến này.')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Quick Actions */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm flex flex-col gap-3">
              <h2 className="text-xs font-bold text-[#5F6977] uppercase tracking-wider m-0">
                {t('driver.dashboard.quickActionsTitle', language === 'en' ? 'Quick Actions' : 'Thao Tác Nhanh')}
              </h2>

              <div className="flex flex-col gap-2.5">
                <Link
                  href={`${basePath}/status`}
                  className="p-3.5 min-h-[52px] rounded-xl border border-[#D8CEBE] hover:border-[#A67C2E] hover:bg-[#FAF5EB] transition-all flex items-center justify-between text-xs no-underline group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#FAF8F4] text-[#A67C2E] flex items-center justify-center shrink-0 border border-[#EAE5DA]">
                      <Crosshair size={16} aria-hidden="true" />
                    </div>
                    <div>
                      <span className="font-bold text-[#181A17] block">
                        {t('driver.status.updateMilestones', language === 'en' ? 'Update Route Milestones' : 'Cập nhật mốc hành trình')}
                      </span>
                      <span className="text-[11px] text-[#747D88]">
                        {t('driver.dashboard.milestonesLinkDesc', language === 'en' ? 'Rest stops / Airports / Borders' : 'Đến trạm nghỉ / Sân bay / Biên giới')}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#8A8478] group-hover:text-[#A67C2E]" aria-hidden="true" />
                </Link>

                {isEscort && (
                  <Link
                    href={`${basePath}/health`}
                    className="p-3.5 min-h-[52px] rounded-xl border border-[#D8CEBE] hover:border-[#2D5A3F] hover:bg-[#E8F2EB]/60 transition-all flex items-center justify-between text-xs no-underline group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center shrink-0">
                        <Stethoscope size={16} aria-hidden="true" />
                      </div>
                      <div>
                        <span className="font-bold text-[#181A17] block group-hover:text-[#2D5A3F]">
                          {t('driver.status.healthLog', language === 'en' ? 'Equine Health Log' : 'Nhật ký sức khỏe ngựa')}
                        </span>
                        <span className="text-[11px] text-[#747D88]">
                          {t('driver.status.healthLogDesc', language === 'en' ? 'Log vitals & photos' : 'Ghi thân nhiệt, nhịp tim & ảnh chụp')}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[#8A8478] group-hover:text-[#2D5A3F]" aria-hidden="true" />
                  </Link>
                )}

                <Link
                  href={`${basePath}/trips`}
                  className="p-3.5 min-h-[52px] rounded-xl border border-[#D8CEBE] hover:border-[#181A17] hover:bg-[#FAF8F4] transition-all flex items-center justify-between text-xs no-underline group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#F4F1E9] text-[#181A17] flex items-center justify-center shrink-0">
                      <Truck size={16} aria-hidden="true" />
                    </div>
                    <div>
                      <span className="font-bold text-[#181A17] block">
                        {t('driver.status.myTrips', language === 'en' ? 'My Assigned Trips' : 'Danh sách chuyến đi')}
                      </span>
                      <span className="text-[11px] text-[#747D88]">
                        {t('driver.status.myTripsDesc', language === 'en' ? 'Accept or decline dispatch' : 'Xác nhận hoặc từ chối lệnh điều phối')}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#8A8478] group-hover:text-[#181A17]" aria-hidden="true" />
                </Link>

                <Link
                  href={`${basePath}/incidents`}
                  className="p-3.5 min-h-[52px] rounded-xl border border-[#D8CEBE] hover:border-[#9E3B3B]/45 hover:bg-rose-50/50 transition-all flex items-center justify-between text-xs no-underline group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-rose-50 text-[#9E3B3B] flex items-center justify-center shrink-0">
                      <AlertTriangle size={16} aria-hidden="true" />
                    </div>
                    <div>
                      <span className="font-bold text-[#181A17] block group-hover:text-[#9E3B3B]">
                        {t('driver.status.reportIncident', language === 'en' ? 'Report Route Incident' : 'Báo cáo sự cố tuyến đường')}
                      </span>
                      <span className="text-[11px] text-[#747D88]">
                        {t('driver.status.reportIncidentDesc', language === 'en' ? 'Traffic, customs, vehicle issue' : 'Tắc đường, thủ tục hải quan, hư xe')}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#8A8478] group-hover:text-[#9E3B3B]" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY SOS CONFIRMATION MODAL */}
      <Modal
        isOpen={emergencyModalOpen}
        onClose={closeEmergencyModal}
        closeDisabled={isSendingEmergency}
        title={`🚨 ${t('driver.dashboard.sosModalTitle', language === 'en' ? 'CONFIRM EMERGENCY SOS SIGNAL' : 'XÁC NHẬN PHÁT TÍN HIỆU CỨU HỘ KHẨN CẤP (SOS)')}`}
        maxWidth="500px"
      >
        <form onSubmit={handleSendEmergency} className="flex flex-col gap-4 text-xs">
          <div className="p-3.5 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900 leading-relaxed">
            <strong className="block text-sm mb-1 text-rose-950">
              {t('driver.dashboard.sosNoticeTitle', language === 'en' ? 'Urgent Alert to Dispatch & Vet Rescue' : 'Cảnh báo khẩn cấp tới Phòng Điều Hành & Bác Sĩ Cứu Hộ')}
            </strong>
            {t(
              'driver.dashboard.sosNoticeDesc',
              language === 'en'
                ? 'Immediately notifies Logistics Manager and Fleet Coordinator to arrange backup transport or emergency veterinary support.'
                : 'Hệ thống sẽ lập tức gửi thông báo ưu tiên cao nhất tới Logistics Manager và Điều phối viên Tuyến để tổ chức xe thay thế, liên hệ trạm thú y gần nhất hoặc chuyển hướng lộ trình khẩn cấp.'
            )}
          </div>

          <div>
            <label htmlFor="driver-sos-reason" className="font-bold text-[#181A17] block mb-1.5">
              {t('driver.dashboard.sosReasonLabel', language === 'en' ? 'Short description of emergency:' : 'Mô tả ngắn tình trạng sự cố:')}
            </label>
            <textarea
              id="driver-sos-reason"
              rows={3}
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              placeholder={t(
                'driver.dashboard.sosReasonPlaceholder',
                language === 'en'
                  ? 'e.g. Tire blowout / Horse showing signs of colic, temp 39.5°C...'
                  : 'Ví dụ: Xe bị nổ lốp trên đèo Hải Vân / Ngựa Thunder có dấu hiệu đau bụng co giật, thân nhiệt 39.5°C...'
              )}
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
              {t('common.cancel', language === 'en' ? 'Cancel' : 'Hủy bỏ')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSendingEmergency || !activeTrip}
              className="min-h-[44px] px-5 bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold cursor-pointer"
            >
              {isSendingEmergency
                ? t('driver.dashboard.sendingSos', language === 'en' ? 'Sending SOS...' : 'Đang phát tín hiệu...')
                : t('driver.dashboard.confirmSosBtn', language === 'en' ? 'Confirm & Send SOS' : 'Xác nhận gửi SOS')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
