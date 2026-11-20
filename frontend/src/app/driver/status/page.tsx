'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Crosshair,
  CheckCircle2,
  MapPin,
  Truck,
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  Plane,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getCurrentUser } from '@/lib/auth';
import {
  trackingApi,
  AssignedTripSummary,
  TripTrackingDetails,
  TrackingMilestoneItem,
} from '@/features/tracking/api/tracking.api';
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { routesApi } from '@/features/routes/api/routes.api';
import toast from 'react-hot-toast';

function DriverStatusContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, language, translateStatus, translateIncident, translateRole } = useLanguage();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check-in modal
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState('');

  // Emergency Incident Modal
  const [isIncidentOpen, setIsIncidentOpen] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState('');
  const [incidentType, setIncidentType] = useState('traffic_delay');
  const [activeIncident, setActiveIncident] = useState<any>(null);

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscort ? '/escort' : '/driver';

  const queryShipmentParam = searchParams.get('shipmentId');

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const user = getCurrentUser();
      setCurrentUser(user);
      const list = await trackingApi.getMyTrips();
      setTrips(list);

      const qNum = queryShipmentParam ? Number(queryShipmentParam) : NaN;
      const targetId = Number.isFinite(qNum) && qNum > 0 ? qNum : null;

      if (list.length > 0) {
        if (targetId && list.some((tr) => tr.shipment_id === targetId)) {
          setSelectedShipmentId(targetId);
        } else {
          const active =
            list.find((tr) => tr.shipment_status === 'in_transit') ||
            list.find((tr) => tr.shipment_status === 'ready_to_depart') ||
            list.find((tr) => tr.shipment_status === 'confirmed') ||
            list[0];
          setSelectedShipmentId((prev) =>
            prev && list.some((tr) => tr.shipment_id === prev) ? prev : active.shipment_id
          );
        }
      } else {
        setSelectedShipmentId(null);
        setTrackingDetails(null);
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          t(
            'driver.status.loadFailed',
            language === 'en' ? 'Unable to load assigned trips.' : 'Không thể tải danh sách chuyến được giao'
          )
      );
    } finally {
      setIsLoading(false);
    }
  }, [language, queryShipmentParam, t]);

  const loadDetails = useCallback(
    async (shipmentId: number, isSilent = false) => {
      try {
        const details = await trackingApi.getTrackingDetails(shipmentId);
        setTrackingDetails(details);
        try {
          const route = await routesApi.getRouteByShipmentId(shipmentId);
          setActiveIncident(route?.activeIncident || null);
        } catch {
          setActiveIncident(null);
        }
      } catch (err: any) {
        if (!isSilent) {
          toast.error(
            err?.message ||
              t('driver.status.loadFailed', language === 'en' ? 'Unable to load trip progress.' : 'Không thể tải chi tiết tiến độ')
          );
        }
      }
    },
    [language, t]
  );

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    if (!selectedShipmentId) return;
    void loadDetails(selectedShipmentId);
    const interval = setInterval(() => {
      void loadDetails(selectedShipmentId, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, loadDetails]);

  const formatDateTimeLocale = (isoString?: string | null) => {
    if (!isoString) return { time: '--:--', date: '--/--/----' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { time: '--:--', date: '--/--/----' };
    const locale = language === 'en' ? 'en-US' : 'vi-VN';
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  };

  const handleOpenCheckin = (milestone: TrackingMilestoneItem) => {
    setActiveMilestone(milestone);
    const defaultAction = milestone.allowedActions[0] || 'arrive_stop';
    setSelectedAction(defaultAction);
    setCheckInNotes('');
    setIsCheckInOpen(true);
  };

  const closeCheckInModal = () => {
    if (isSubmitting) return;
    setIsCheckInOpen(false);
    setActiveMilestone(null);
    setCheckInNotes('');
  };

  const openIncidentModal = () => {
    if (!selectedShipmentId) return;
    setIncidentType('traffic_delay');
    setIncidentNotes('');
    setIsIncidentOpen(true);
  };

  const closeIncidentModal = () => {
    if (isSubmitting) return;
    setIsIncidentOpen(false);
    setIncidentType('traffic_delay');
    setIncidentNotes('');
  };

  const handleConfirmCheckin = async () => {
    if (!activeMilestone || !selectedShipmentId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (activeMilestone.itemType === 'leg_start') {
        await trackingApi.checkInLegStart(selectedShipmentId, activeMilestone.legId, {
          notes: checkInNotes,
        });
        toast.success(t('driver.status.legStartSuccess', language === 'en' ? 'Leg departure confirmed!' : 'Đã xác nhận xuất phát chặng!'));
      } else if (activeMilestone.itemType === 'stop') {
        if (!activeMilestone.stopId) {
          toast.error(t('driver.status.invalidStopId', language === 'en' ? 'Invalid stop reference.' : 'Mốc dừng này không có stopId hợp lệ.'));
          return;
        }
        const actionMap: Record<string, 'arrived' | 'departed' | 'customs_cleared'> = {
          arrive_stop: 'arrived',
          depart_stop: 'departed',
          clear_customs: 'customs_cleared',
        };
        const action = actionMap[selectedAction] || 'arrived';
        await trackingApi.checkInStop(selectedShipmentId, activeMilestone.stopId, {
          action,
          notes: checkInNotes,
        });
        toast.success(t('driver.status.stopCheckinSuccess', 'Đã cập nhật mốc: {title}!', { title: activeMilestone.title }));
      } else if (activeMilestone.itemType === 'leg_end') {
        await trackingApi.checkInLegArrival(selectedShipmentId, activeMilestone.legId, {
          notes: checkInNotes,
        });
        toast.success(t('driver.status.legArrivalSuccess', language === 'en' ? 'Leg arrival completed safely!' : 'Đã hoàn thành chặng đến nơi an toàn!'));
      }

      setIsCheckInOpen(false);
      setActiveMilestone(null);
      setCheckInNotes('');
      await loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(
        err?.message || t('driver.status.checkinFailed', language === 'en' ? 'Unable to update milestone.' : 'Không thể cập nhật mốc')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await routesApi.reportIncident(selectedShipmentId, {
        incidentType,
        description: incidentNotes,
        severity: 'critical',
      });
      toast.success(
        t(
          'driver.status.incidentReportedSuccess',
          language === 'en'
            ? 'Emergency incident reported to Coordinator and Manager for rerouting!'
            : 'Báo cáo sự cố khẩn cấp đã được gửi tới Điều phối viên Tuyến và Quản lý Logistics! Tuyến đường sẽ được kiểm tra và hiệu chỉnh lại.'
        )
      );
      setIsIncidentOpen(false);
      setIncidentNotes('');
      await loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(
        err?.message || t('driver.status.incidentReportFailed', language === 'en' ? 'Failed to send incident report.' : 'Không thể gửi báo cáo sự cố')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentTrip = trips.find((tr) => tr.shipment_id === selectedShipmentId);
  const milestones = trackingDetails?.milestones || [];
  const firstLegMilestone = milestones.find((m) => m.itemType === 'leg_start' && m.seq === 1);
  const isTripReadyToDepart =
    (currentTrip?.shipment_status === 'ready_to_depart' ||
      trackingDetails?.shipmentStatus === 'ready_to_depart') &&
    firstLegMilestone &&
    firstLegMilestone.status !== 'COMPLETED';

  const canUserCheckinMilestone = (m: TrackingMilestoneItem) => {
    if (isEscort) return true;
    const hasFlight = milestones.some((item) => item.legType === 'flight');
    if (hasFlight) {
      if (m.seq > 2 || m.legType === 'flight' || m.responsibleRole === 'escort') {
        return false;
      }
    }
    return true;
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Role Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-all ${
          !isEscort ? 'bg-[#FAF8F4] border-[#D8CEBE] text-[#181A17]' : 'bg-[#E8F2EB] border-[#2D5A3F]/25 text-[#1E402C]'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          {!isEscort ? (
            <Truck size={20} className="text-[#A67C2E] shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          ) : (
            <Stethoscope size={20} className="text-[#2D5A3F] shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          )}
          <div>
            <span className="font-bold block text-sm">
              {!isEscort
                ? t('driver.status.roleBannerDriver', language === 'en' ? 'Milestone Access: Vehicle Driver' : '🚚 Quyền cập nhật mốc: Tài Xế Lái Xe Chuyên Dụng')
                : t('driver.status.roleBannerEscort', language === 'en' ? 'Milestone Access: Equine Vet / Escort' : '🩺 Quyền cập nhật mốc: Bác Sĩ Thú Y / Chuyên Viên Hộ Tống')}
            </span>
            <p className="m-0 mt-0.5 opacity-90 text-xs">
              {!isEscort
                ? t(
                    'driver.status.driverBannerDesc',
                    language === 'en'
                      ? 'You operate transport vehicles and confirm road transit stops and field checkpoints.'
                      : 'Bạn trực tiếp điều khiển xe vận tải và xác nhận các trạm dừng, mốc kiểm tra thực địa của chặng đường bộ.'
                  )
                : t(
                    'driver.status.escortBannerDesc',
                    language === 'en'
                      ? 'You monitor equine welfare and confirm airport/flight milestones alongside the driver.'
                      : 'Bạn phụ trách quan sát sức khỏe ngựa, xác nhận các mốc tại sân bay / chặng bay và phối hợp cùng tài xế.'
                  )}
            </p>
          </div>
        </div>
      </div>

      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('driver.checkInTitle', language === 'en' ? 'Route Milestone Check-In' : 'Cập nhật Mốc Trạng thái Lộ trình')}
          </h1>
          <p className="text-sm text-[#57564E] mt-1 mb-0 break-words">
            {t('common.trip', language === 'en' ? 'Trip' : 'Chuyến')}:{' '}
            <strong className="text-[#A67C2E]">
              #{currentTrip?.request_code || t('common.unselected', language === 'en' ? 'Unselected' : 'Chưa chọn')}
            </strong>{' '}
            • {t('driver.trips.route', language === 'en' ? 'Route:' : 'Tuyến:')}{' '}
            {currentTrip ? `${currentTrip.origin_location} → ${currentTrip.destination_location}` : '—'}
          </p>
          {trackingDetails?.consolidatedRouteSummary && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FAF8F4] border border-[#D4C5A3] text-xs font-medium text-[#A67C2E]">
              <Truck size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
              <span className="break-words">{trackingDetails.consolidatedRouteSummary}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label htmlFor="status-trip-select" className="sr-only">
            {t('common.trip', language === 'en' ? 'Select Trip' : 'Chọn chuyến đi')}
          </label>
          <select
            id="status-trip-select"
            value={selectedShipmentId || ''}
            disabled={trips.length === 0}
            onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D8CEBE] text-sm font-semibold bg-white outline-none focus:border-[#A67C2E] shadow-sm disabled:opacity-60"
          >
            {trips.length === 0 ? (
              <option value="">{t('driver.trips.noTrips', language === 'en' ? 'No assigned trips' : 'Chưa có chuyến đi')}</option>
            ) : (
              trips.map((s) => (
                <option key={s.shipment_id} value={s.shipment_id}>
                  #{s.request_code} • {translateStatus(s.shipment_status)}
                </option>
              ))
            )}
          </select>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (selectedShipmentId) {
                void loadDetails(selectedShipmentId);
              } else {
                void loadTrips();
              }
            }}
            aria-label={t('common.refreshServer', language === 'en' ? 'Refresh data' : 'Làm mới dữ liệu từ máy chủ')}
            className="text-[#181A17] min-h-[44px] min-w-[44px] px-3 rounded-xl border-[#D8CEBE]"
            title={t('common.refreshServer', language === 'en' ? 'Refresh data' : 'Làm mới dữ liệu từ máy chủ')}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </Button>

          <Button
            type="button"
            variant="primary"
            disabled={!selectedShipmentId}
            onClick={openIncidentModal}
            className="min-h-[44px] bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-45 disabled:cursor-not-allowed"
            title={t('driver.status.reportEmergencyBtn', language === 'en' ? '🚨 Report Incident' : '🚨 Báo Cáo Sự Cố Khẩn Cấp')}
          >
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{t('driver.status.reportEmergencyBtn', language === 'en' ? '🚨 Report Incident' : '🚨 Báo Cáo Sự Cố Khẩn Cấp')}</span>
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
            onClick={() => void loadTrips()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {t('common.loading', language === 'en' ? 'Loading route milestones...' : 'Đang tải tiến độ hành trình...')}
          </p>
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF8F4] border border-[#D8CEBE] text-[#8A8478] flex items-center justify-center">
            <Truck size={28} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[#181A17] m-0">
            {t('driver.noTripsTitle', language === 'en' ? 'No Trips Assigned' : 'Chưa Có Chuyến Đi Nào Được Giao')}
          </h2>
          <p className="text-xs text-[#57564E] max-w-md m-0 leading-relaxed">
            {t(
              'driver.status.emptyTripsDesc',
              language === 'en'
                ? 'Please accept an assigned trip first on My Trips to update live checkpoints.'
                : 'Vui lòng kiểm tra và xác nhận nhận chuyến tại mục Danh sách chuyến đi để cập nhật mốc hành trình.'
            )}
          </p>
          <Link
            href={`${basePath}/trips`}
            className="mt-2 min-h-[44px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] text-xs font-bold no-underline"
          >
            {t('driver.dashboard.viewAllTrips', language === 'en' ? 'Go to My Trips' : 'Xem Chuyến Đi Của Tôi')}
          </Link>
        </div>
      ) : (
        <>
          {/* Active Incident Alert Banner */}
          {activeIncident && (
            <div role="alert" className="p-4 rounded-xl border-2 border-[#9E3B3B]/45 bg-rose-50 flex flex-wrap items-center justify-between gap-3 text-rose-950 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#9E3B3B] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-xs uppercase text-[#9E3B3B] block">
                      {t('driver.status.incidentReportedAlert', language === 'en' ? '🚨 INCIDENT REPORTED:' : '🚨 BẠN ĐÃ BÁO CÁO SỰ CỐ:')}{' '}
                      {translateIncident(activeIncident.incidentType)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 font-bold text-[10px]">
                      {t('driver.status.awaitingReroute', language === 'en' ? 'Awaiting coordinator reroute' : 'Đang chờ Điều phối viên đổi tuyến')}
                    </span>
                  </div>
                  <p className="text-xs text-rose-950 m-0 mt-1 font-semibold break-words">
                    {t('driver.status.incidentDesc', language === 'en' ? 'Description:' : 'Nội dung:')}{' '}
                    <span>{activeIncident.description}</span>
                  </p>
                  <span className="text-[11px] text-[#9E3B3B] block mt-0.5">
                    {t(
                      'driver.status.rerouteInProgressDesc',
                      language === 'en'
                        ? 'Route Coordinator received your alert and is revising affected legs.'
                        : 'Điều phối viên Tuyến đã nhận cảnh báo và đang hiệu chỉnh lại các chặng đường vòng tránh cho xe của bạn.'
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Trip Information Cards */}
          {trackingDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 bg-white border border-[#D8CEBE] rounded-2xl shadow-sm">
                <span className="text-[#747D88] font-semibold block uppercase text-[10px]">
                  {t('driver.status.tripStatus', language === 'en' ? 'Trip Status' : 'Trạng thái chuyến đi')}
                </span>
                <span
                  className={`inline-block mt-1 font-bold px-2.5 py-0.5 rounded-md text-xs ${
                    trackingDetails.shipmentStatus === 'in_transit'
                      ? 'bg-[#F3EFE4] text-[#181A17]'
                      : trackingDetails.shipmentStatus === 'completed'
                      ? 'bg-[#E8F2EB] text-[#2D5A3F]'
                      : 'bg-[#FAF5EB] text-[#A67C2E]'
                  }`}
                >
                  {translateStatus(trackingDetails.shipmentStatus)}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-[#D8CEBE] rounded-2xl shadow-sm">
                <span className="text-[#747D88] font-semibold block uppercase text-[10px]">
                  {t('driver.status.vehicleAndDriver', language === 'en' ? 'Vehicle & Driver' : 'Phương tiện & Tài xế')}
                </span>
                <span className="font-bold text-[#181A17] block mt-1 truncate">
                  {trackingDetails.assignedVehicle} • {trackingDetails.assignedDriver || t('driver.status.unassigned', 'Chưa gán')}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-[#D8CEBE] rounded-2xl shadow-sm">
                <span className="text-[#747D88] font-semibold block uppercase text-[10px]">
                  {t('driver.status.vetEscort', language === 'en' ? 'Vet / Escort' : 'Hộ tống y tế')}
                </span>
                <span className="font-bold text-[#181A17] block mt-1 truncate">
                  {trackingDetails.assignedEscort || t('driver.status.unassigned', 'Chưa gán')}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-[#D8CEBE] rounded-2xl shadow-sm">
                <span className="text-[#747D88] font-semibold block uppercase text-[10px]">
                  {t('driver.status.assignedHorses', language === 'en' ? 'Assigned Horses' : 'Chiến mã phụ trách')}
                </span>
                <span className="font-bold text-[#181A17] block mt-1 truncate">
                  {(trackingDetails.assignedHorses || []).map((h) => h.name).join(', ') || t('common.horsesUnit', 'Chiến mã')} (
                  {t('common.horsesCount', '{count} ngựa', { count: (trackingDetails.assignedHorses || []).length })})
                </span>
              </div>
            </div>
          )}

          {/* Official Start Trip Action Card when at customer's farm */}
          {isTripReadyToDepart && firstLegMilestone && (
            <div className="p-5 rounded-2xl border-2 border-[#2D5A3F] bg-gradient-to-r from-[#E8F2EB] via-[#F4F8F5] to-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#2D5A3F] text-white flex items-center justify-center shrink-0 shadow-sm text-2xl">
                  🏇
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-[#1E402C] uppercase tracking-wide">
                      {t('driver.status.readyToDepartTitle', language === 'en' ? 'Trip Ready for Official Departure' : 'Chuyến Đi Đã Sẵn Sàng Xuất Phát Tại Trang Trại Khách Hàng')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#2D5A3F]/15 text-[#2D5A3F] font-bold text-[11px]">
                      {t('driver.status.awaitingStartNotice', language === 'en' ? 'Awaiting departure confirmation' : 'Chờ nhân sự bấm xuất phát')}
                    </span>
                  </div>
                  <p className="text-xs text-[#3C403A] m-0 mt-1">
                    {t('driver.status.pickupDeparturePoint', language === 'en' ? 'Pickup location:' : 'Điểm tiếp nhận & xuất phát:')}{' '}
                    <strong className="text-[#181A17]">{firstLegMilestone.location || currentTrip?.origin_location}</strong>
                  </p>
                  <p className="text-[11px] text-[#57564E] m-0 mt-0.5">
                    {t(
                      'driver.status.startTripInstruction',
                      language === 'en'
                        ? 'After final pre-departure horse check, tap Start Trip to begin live tracking.'
                        : 'Sau khi kiểm tra ngựa và chuẩn bị xong tại trang trại của khách, nhân sự bấm nút bên cạnh để chính thức kích hoạt hành trình.'
                    )}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                onClick={() => handleOpenCheckin(firstLegMilestone)}
                className="min-h-[44px] bg-[#2D5A3F] hover:bg-[#234731] text-white font-extrabold text-sm px-6 py-3 rounded-xl shrink-0 shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={18} fill="currentColor" aria-hidden="true" />
                <span>{t('driver.status.startTripBtn', language === 'en' ? 'Start Trip' : 'Bắt đầu chuyến đi')}</span>
              </Button>
            </div>
          )}

          {/* Timeline of Real Legs and Stops */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
              <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                <Crosshair size={20} className="text-[#A67C2E]" aria-hidden="true" />
                {t('driver.status.timelineTitle', language === 'en' ? 'Transit Milestones Timeline' : 'Tiến độ Mốc Hành Trình Thực Tế')}
              </h2>
              <span className="text-xs font-bold text-[#57564E]">
                {milestones.filter((m) => m.status === 'COMPLETED').length} / {milestones.length}{' '}
                {t('driver.status.milestonesCompleted', language === 'en' ? 'Completed' : 'Mốc hoàn thành')}
              </span>
            </div>

            <div className="relative border-l-2 border-[#D8CEBE] ml-4 pl-6 flex flex-col gap-8">
              {milestones.length === 0 ? (
                <p className="text-sm text-[#57564E] py-4 m-0">
                  {t('driver.status.noMilestonesYet', language === 'en' ? 'No milestones created yet.' : 'Chưa có chặng và trạm dừng nào được tạo cho đơn này.')}
                </p>
              ) : (
                milestones.map((m) => {
                  const isCurrent = m.status === 'CURRENT';
                  const isCompleted = m.status === 'COMPLETED';

                  return (
                    <div key={m.id} className="relative">
                      <div
                        className={`absolute -left-[33px] top-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                          isCompleted
                            ? 'border-[#2D5A3F] text-[#2D5A3F]'
                            : isCurrent
                            ? 'border-[#181A17] text-[#A67C2E] animate-pulse'
                            : 'border-[#D8CEBE] text-[#D8CEBE]'
                        }`}
                      >
                        {isCompleted && <div className="w-2.5 h-2.5 rounded-full bg-[#2D5A3F]" />}
                        {isCurrent && <div className="w-2.5 h-2.5 rounded-full bg-[#181A17]" />}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs px-2 py-0.5 rounded bg-[#F4F1E9] text-[#57564E]">
                              #{m.seq}
                            </span>
                            <h3 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-1.5">
                              {m.legType === 'flight' ? (
                                <Plane size={14} className="text-[#A67C2E]" aria-hidden="true" />
                              ) : (
                                <Truck size={14} className="text-[#A67C2E]" aria-hidden="true" />
                              )}
                              {m.title}
                            </h3>
                            {m.isCustomsBorder && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
                                {t('driver.status.customsQuarantineBadge', language === 'en' ? 'Customs / Quarantine' : 'Hải quan / Kiểm dịch')}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                isCompleted
                                  ? 'bg-[#E8F2EB] text-[#2D5A3F]'
                                  : isCurrent
                                  ? 'bg-[#FAF5EB] text-[#A67C2E] border border-[#D4C5A3]'
                                  : 'bg-[#F4F1E9] text-[#747D88]'
                              }`}
                            >
                              {isCompleted
                                ? t('common.completed', language === 'en' ? 'Completed' : 'Đã hoàn tất')
                                : isCurrent
                                ? t('driver.status.inProgressCurrent', language === 'en' ? 'Current milestone' : 'Đang diễn ra — Mốc hiện tại')
                                : t('driver.status.waitingTurn', language === 'en' ? 'Upcoming' : 'Chờ tới lượt')}
                            </span>
                          </div>

                          <p className="text-xs text-[#57564E] flex flex-wrap items-center gap-1.5 mt-1.5 m-0">
                            <MapPin size={12} className="text-[#8A8478] shrink-0" aria-hidden="true" /> <span>{m.location}</span>
                            {m.actualTime
                              ? (() => {
                                  const { time, date } = formatDateTimeLocale(m.actualTime);
                                  return (
                                    <span className="text-[#2D5A3F] font-semibold inline-flex items-center gap-1">
                                      • {t('driver.status.actualTime', language === 'en' ? 'Actual:' : 'Thực tế:')} <strong>{time}</strong> (
                                      {t('driver.status.onDate', 'Ngày {date}', { date })})
                                    </span>
                                  );
                                })()
                              : m.plannedTime
                              ? (() => {
                                  const { time, date } = formatDateTimeLocale(m.plannedTime);
                                  return (
                                    <span className="text-[#747D88] inline-flex items-center gap-1">
                                      • {t('driver.status.plannedTime', language === 'en' ? 'Estimated:' : 'Dự kiến:')} <strong>{time}</strong> (
                                      {t('driver.status.onDate', 'Ngày {date}', { date })})
                                    </span>
                                  );
                                })()
                              : null}
                          </p>

                          {m.notes && (
                            <div className="mt-2 p-2.5 rounded-xl bg-[#FAF8F4] border border-[#EAE5DA] text-xs text-[#3C403A] break-words">
                              <strong>{t('common.notes', language === 'en' ? 'Notes' : 'Ghi chú')}:</strong> {m.notes}
                              {m.updatedBy && (
                                <span className="text-[#747D88] ml-2">
                                  • {t('driver.status.updatedBy', language === 'en' ? 'Updated by:' : 'Cập nhật bởi:')} {m.updatedBy}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {isCurrent && (
                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {canUserCheckinMilestone(m) && (m.allowedActions || []).length > 0 && (
                              <Button
                                type="button"
                                variant="primary"
                                onClick={() => handleOpenCheckin(m)}
                                className={`min-h-[44px] font-bold text-xs shrink-0 shadow-sm transition-all cursor-pointer ${
                                  m.itemType === 'leg_start' && m.seq === 1
                                    ? 'bg-[#2D5A3F] hover:bg-[#234731] text-white px-4'
                                    : 'bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4] px-4'
                                }`}
                              >
                                {m.itemType === 'leg_start' && m.seq === 1 ? (
                                  <>
                                    <Play size={14} fill="currentColor" className="mr-1.5" aria-hidden="true" />
                                    {t('driver.status.startTripBtn', language === 'en' ? 'Start Trip' : 'Bắt đầu chuyến đi')}
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={15} className="mr-1.5" aria-hidden="true" />
                                    {t('driver.status.reportMilestoneBtn', language === 'en' ? 'Check-in Milestone' : 'Báo cáo mốc này')}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={openIncidentModal}
                              className="min-h-[44px] px-3.5 border-[#9E3B3B]/40 text-[#9E3B3B] hover:bg-rose-50 font-bold text-xs shrink-0 flex items-center gap-1 cursor-pointer"
                              title={t('driver.status.reportEmergencyBtn', language === 'en' ? 'Report incident' : 'Báo cáo sự cố khẩn cấp')}
                            >
                              <AlertTriangle size={14} className="text-[#9E3B3B]" aria-hidden="true" />
                              <span>{t('incidents.reportIncident', language === 'en' ? 'Report Incident' : 'Báo sự cố')}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {selectedShipmentId && trackingDetails && (
        <DeliveryHandoverPanel
          role="driver"
          shipmentId={selectedShipmentId}
          shipmentStatus={trackingDetails.shipmentStatus}
          assignedHorses={trackingDetails.assignedHorses}
        />
      )}

      {/* Check-in Modal */}
      {isCheckInOpen && activeMilestone && (
        <Modal
          isOpen={isCheckInOpen}
          onClose={closeCheckInModal}
          closeDisabled={isSubmitting}
          title={
            activeMilestone.itemType === 'leg_start' && activeMilestone.seq === 1
              ? t('driver.status.startTripModalTitle', '🚀 Bắt đầu chuyến đi tại trang trại khách hàng - #{code}', {
                  code: currentTrip?.request_code || activeMilestone.seq,
                })
              : t('driver.status.milestoneModalTitle', 'Báo cáo mốc di chuyển - #{seq}', { seq: activeMilestone.seq })
          }
          maxWidth="520px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-[#FAF8F4] border border-[#D8CEBE] rounded-xl text-[#181A17] leading-relaxed">
              <strong className="block text-sm mb-1">{activeMilestone.title}</strong>
              <div className="flex flex-col gap-1 text-[#57564E] mt-1">
                <p className="m-0">
                  {t('driver.status.location', language === 'en' ? 'Location:' : 'Địa điểm:')}{' '}
                  <strong>{activeMilestone.location}</strong> •{' '}
                  {t('driver.status.mode', language === 'en' ? 'Mode:' : 'Phương thức:')}{' '}
                  <strong>
                    {activeMilestone.legType === 'flight'
                      ? t('driver.status.airCargoMode', language === 'en' ? '✈️ Air Cargo' : '✈️ Chặng hàng không')
                      : t('driver.status.roadTransitMode', language === 'en' ? '🚚 Road Transit' : '🚚 Chặng đường bộ')}
                  </strong>
                </p>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <span className="text-[#57564E]">{t('driver.status.reporter', language === 'en' ? 'Reporter:' : 'Người báo cáo:')}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                      isEscort
                        ? 'bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25'
                        : 'bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]'
                    }`}
                  >
                    {isEscort ? <Stethoscope size={12} aria-hidden="true" /> : <Truck size={12} aria-hidden="true" />}
                    <strong>
                      {currentUser?.fullName ||
                        currentUser?.name ||
                        (isEscort ? (language === 'en' ? 'Equine Vet' : 'Bác sĩ Thú y') : language === 'en' ? 'Driver' : 'Tài xế')}
                    </strong>{' '}
                    ({translateRole(isEscort ? 'escort' : 'driver')})
                  </span>
                </div>
              </div>
            </div>

            {activeMilestone.itemType === 'stop' && (
              <div>
                <p className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px] m-0">
                  {t('driver.status.selectActionLabel', language === 'en' ? 'Select checkpoint action *' : 'Chọn thao tác báo cáo mốc: *')}
                </p>
                <div className="flex flex-col gap-2 mt-1.5">
                  {(activeMilestone.allowedActions || []).map((act) => {
                    const labelMap: Record<string, string> = {
                      arrive_stop: t(
                        'driver.status.actionArriveStop',
                        language === 'en' ? '📍 Arrived at veterinary/rest stop' : '📍 Đã tới điểm dừng nghỉ ngựa và chăm sóc thú y'
                      ),
                      clear_customs: t(
                        'driver.status.actionClearCustoms',
                        language === 'en' ? '🛂 Customs & veterinary clearance completed' : '🛂 Đã hoàn thành thông quan & kiểm dịch thú y'
                      ),
                      depart_stop: t(
                        'driver.status.actionDepartStop',
                        language === 'en' ? '🚛 Departed stop to continue route' : '🚛 Đã rời điểm dừng để tiếp tục hành trình'
                      ),
                    };

                    return (
                      <label
                        key={act}
                        className={`p-3 min-h-[44px] rounded-xl border flex items-center gap-2.5 cursor-pointer font-bold ${
                          selectedAction === act
                            ? 'border-[#A67C2E] bg-[#FAF5EB] text-[#181A17]'
                            : 'border-[#D8CEBE] bg-white text-[#57564E] hover:bg-[#FAF8F4]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="milestone_action"
                          checked={selectedAction === act}
                          onChange={() => setSelectedAction(act)}
                          className="accent-[#A67C2E]"
                        />
                        <span>{labelMap[act] || act}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {activeMilestone.itemType === 'leg_start' && activeMilestone.seq === 1 ? (
              <div className="p-3.5 bg-[#E8F2EB] border border-[#2D5A3F]/30 rounded-xl text-[#1E402C] font-medium space-y-1">
                <div className="font-bold text-sm flex items-center gap-1.5">
                  <span>🚀</span>
                  <span>
                    {t('driver.status.confirmDepartureAtFarm', language === 'en' ? 'Confirm Official Departure' : 'Xác nhận xuất phát chính thức tại trang trại của khách')}
                  </span>
                </div>
                <p className="text-xs m-0">
                  {t('driver.status.pickupLocation', language === 'en' ? 'Pickup location:' : 'Địa điểm tiếp nhận:')}{' '}
                  <strong>{activeMilestone.location}</strong>
                </p>
              </div>
            ) : activeMilestone.itemType === 'leg_start' ? (
              <div className="p-3 bg-[#E8F2EB] border border-[#2D5A3F]/25 rounded-xl text-[#1E402C] font-semibold">
                {t(
                  'driver.status.confirmLegStart',
                  language === 'en'
                    ? '🚀 Confirm departure for this leg. Timestamp and customer notification update automatically.'
                    : '🚀 Bạn đang bấm xác nhận "ĐÃ XUẤT PHÁT" chặng đường này. Giờ thực tế sẽ được tự động ghi nhận và thông báo sẽ gửi tới Khách hàng.'
                )}
              </div>
            ) : null}

            {activeMilestone.itemType === 'leg_end' && (
              <div className="p-3 bg-[#E8F2EB] border border-[#2D5A3F]/25 rounded-xl text-[#1E402C] font-semibold">
                {t(
                  'driver.status.confirmLegArrival',
                  language === 'en'
                    ? '🏁 Confirm safe arrival for this transit leg.'
                    : '🏁 Bạn đang bấm xác nhận "ĐÃ ĐẾN NƠI" chặng này an toàn.'
                )}
              </div>
            )}

            <div>
              <label htmlFor="checkin-notes" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.status.fieldNotesOf', 'Ghi chú thực địa của {role}:', {
                  role: isEscort ? t('role.escort', 'Bác sĩ Thú y / Chuyên viên Hộ tống') : t('role.driver', 'Tài xế lái xe'),
                })}
              </label>
              <textarea
                id="checkin-notes"
                rows={3}
                placeholder={
                  isEscort
                    ? t(
                        'driver.status.vetNotesPlaceholder',
                        language === 'en'
                          ? 'e.g. Horses hydrated, vitals stable, cabin temperature at 18°C...'
                          : 'Ví dụ: Đã kiểm tra thể trạng ngựa tốt, sinh hiệu ổn định, nhiệt độ thùng xe duy trì 18°C...'
                      )
                    : t(
                        'driver.status.driverNotesPlaceholder',
                        language === 'en'
                          ? 'e.g. Passed checkpoint safely, trailer climate 18°C...'
                          : 'Ví dụ: Xe đã qua trạm an toàn, nhiệt độ thùng xe ổn định 18°C, các chiến mã được uống nước đầy đủ...'
                      )
                }
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#D8CEBE] rounded-xl outline-none focus:border-[#A67C2E] text-xs font-medium"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-[#EAE5DA]">
              <Button
                type="button"
                variant="outline"
                onClick={closeCheckInModal}
                disabled={isSubmitting}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.cancel', language === 'en' ? 'Cancel' : 'Hủy')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmCheckin()}
                disabled={isSubmitting}
                className={`min-h-[44px] px-4 font-bold transition-all cursor-pointer ${
                  activeMilestone.itemType === 'leg_start' && activeMilestone.seq === 1
                    ? 'bg-[#2D5A3F] hover:bg-[#234731] text-white'
                    : 'bg-[#181A17] hover:bg-[#2C2F2A] text-[#F7F7F4]'
                }`}
              >
                {activeMilestone.itemType === 'leg_start' && activeMilestone.seq === 1
                  ? isSubmitting
                    ? t('common.activating', language === 'en' ? 'Activating...' : 'Đang kích hoạt...')
                    : t('driver.status.startTripNowBtn', language === 'en' ? '🚀 Start Trip Now' : '🚀 Bắt đầu chuyến đi ngay')
                  : isSubmitting
                  ? t('common.saving', language === 'en' ? 'Saving...' : 'Đang lưu...')
                  : t('driver.status.confirmMilestoneBtn', language === 'en' ? 'Confirm Check-in' : 'Xác nhận Báo cáo Mốc')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Emergency Incident Modal */}
      {isIncidentOpen && (
        <Modal
          isOpen={isIncidentOpen}
          onClose={closeIncidentModal}
          closeDisabled={isSubmitting}
          title={t('driver.health.emergencyModalTitle', language === 'en' ? 'Report Road Emergency Incident' : 'Báo cáo sự cố khẩn cấp trên đường')}
          maxWidth="500px"
        >
          <form onSubmit={handleReportIncident} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900">
              {t(
                'driver.health.emergencyNotice',
                language === 'en'
                  ? 'Emergency alert goes directly to Logistics Manager & Fleet Coordinator to coordinate rescue or detour.'
                  : 'Kênh liên lạc sự cố khẩn cấp: Báo cáo này sẽ được ưu tiên phát cảnh báo đỏ ngay lập tức đến màn hình của Logistics Manager và Fleet Coordinator để kích hoạt phương án cứu hộ.'
              )}
            </div>

            <div>
              <label htmlFor="status-incident-type" className="font-bold text-[#181A17] block mb-1.5">
                {t('incidents.type', language === 'en' ? 'Incident type' : 'Loại sự cố gặp phải trên đường')} *
              </label>
              <select
                id="status-incident-type"
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-[#D8CEBE] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#9E3B3B] shadow-sm"
              >
                <option value="traffic_delay">{translateIncident('traffic_delay')}</option>
                <option value="vehicle_breakdown">{translateIncident('vehicle_breakdown')}</option>
                <option value="weather">{translateIncident('weather')}</option>
                <option value="border_issue">{translateIncident('border_issue')}</option>
                <option value="horse_medical">{translateIncident('horse_medical')}</option>
                <option value="other">{translateIncident('other')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="status-incident-notes" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.health.incidentDescLabel', language === 'en' ? 'Incident details *' : 'Mô tả tình huống sự cố *')}
              </label>
              <textarea
                id="status-incident-notes"
                rows={3}
                required
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder={t(
                  'driver.status.incidentPlaceholder',
                  language === 'en'
                    ? 'Describe road blockage, vehicle issue, or horse condition requiring detour...'
                    : 'Ví dụ: Đoạn đèo Quốc lộ 1 phía trước bị sạt lở cây chắn ngang đường, xe tải không qua được. Đề nghị Điều phối viên đổi tuyến đi đường tránh cao tốc...'
                )}
                className="w-full p-3 border border-[#D8CEBE] rounded-xl outline-none focus:border-[#9E3B3B] text-xs"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#EAE5DA]">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={closeIncidentModal}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.close', language === 'en' ? 'Close' : 'Đóng')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || !selectedShipmentId}
                className="min-h-[44px] px-4 bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  {isSubmitting
                    ? t('common.sending', language === 'en' ? 'Sending...' : 'Đang gửi...')
                    : t('driver.status.submitIncidentReroute', language === 'en' ? 'Send Alert & Request Reroute' : 'Gửi cảnh báo & Yêu cầu đổi tuyến')}
                </span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function DriverStatusPage() {
  return (
    <Suspense fallback={<PortalLoadingSkeleton />}>
      <DriverStatusContent />
    </Suspense>
  );
}
