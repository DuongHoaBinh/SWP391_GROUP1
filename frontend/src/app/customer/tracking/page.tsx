'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Heart,
  Clock,
  MapPin,
  Activity,
  Truck,
  RefreshCw,
  FileCheck2,
  FileText,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import {
  trackingApi,
  TripTrackingDetails,
  AssignedTripSummary,
  LiveTrackingDetails,
} from '@/features/tracking/api/tracking.api';
import {
  getShipmentStatusMeta,
  formatShipmentStatusLabel,
} from '@/features/orders/shipment-status';
import { apiClient } from '@/lib/api-client';
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import { VerticalTimeline, buildTimeline, TimelineItem } from '@/features/tracking/timeline';
import toast from 'react-hot-toast';

function getTripPriority(status?: string): number {
  const s = (status || '').toLowerCase();
  if (s === 'in_transit' || s === 'return_in_transit') return 0;
  if (s === 'return_pending') return 1;
  if (s === 'ready_to_depart') return 2;
  if (s === 'confirmed' || s === 'planning' || s === 'approved') return 3;
  if (s === 'completed' || s === 'delivered') return 5;
  return 4;
}

function CustomerTrackingContent() {
  const { t, language, translateVehicleType } = useTranslation();
  const isEn = language === 'en';

  const searchParams = useSearchParams();
  const queryParam = searchParams.get('shipmentId') || searchParams.get('requestId');
  const horseIdParam = searchParams.get('horseId');

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [liveTracking, setLiveTracking] = useState<LiveTrackingDetails | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tripsError, setTripsError] = useState<string>('');
  const [detailsError, setDetailsError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchMyTrips = useCallback(async () => {
    setTripsError('');
    try {
      const data = await trackingApi.getMyTrips();
      if (!isMountedRef.current) return;

      // Sort trips so active in_transit / return_pending trips come FIRST, completed trips last
      const sorted = [...data].sort((a, b) => {
        const pa = getTripPriority(a.shipment_status);
        const pb = getTripPriority(b.shipment_status);
        if (pa !== pb) return pa - pb;
        return Number(b.shipment_id) - Number(a.shipment_id);
      });

      setTrips(sorted);

      if (sorted.length > 0) {
        let matchedId: number | null = null;
        if (queryParam) {
          const parsedNum = parseInt(queryParam.replace(/\D/g, ''), 10);
          const found = sorted.find(
            (s) =>
              s.shipment_id === parsedNum ||
              s.request_code === queryParam ||
              s.customer_request_code === queryParam ||
              s.system_request_code === queryParam,
          );
          if (found) {
            matchedId = found.shipment_id;
          } else if (!Number.isNaN(parsedNum) && parsedNum > 0) {
            matchedId = parsedNum;
          }
        } else if (horseIdParam) {
          // Resolve active trip carrying horseId via /orders/my-orders
          try {
            const myOrders = await apiClient<any[]>('/orders/my-orders');
            if (Array.isArray(myOrders)) {
              const tripIds = new Set(sorted.map((s) => Number(s.shipment_id)));
              const matchingOrders = myOrders
                .filter(
                  (o) =>
                    tripIds.has(Number(o.id)) &&
                    Array.isArray(o.horses) &&
                    o.horses.some((h: any) => String(h.horseId ?? h.id) === String(horseIdParam)),
                )
                .sort((a, b) => getTripPriority(a.status) - getTripPriority(b.status));
              if (matchingOrders.length > 0) {
                matchedId = Number(matchingOrders[0].id);
              }
            }
          } catch {
            // Fallback to highest priority trip
          }
        }

        setSelectedShipmentId((prev) => {
          if (matchedId) return matchedId;
          if (prev && sorted.some((s) => s.shipment_id === prev)) return prev;
          return sorted[0].shipment_id;
        });
      }
    } catch (err: any) {
      console.warn('Could not fetch customer shipments:', err);
      if (isMountedRef.current) {
        setTripsError(
          err?.message ||
            (isEn ? 'Unable to load active trips.' : 'Không thể tải danh sách chuyến đi.'),
        );
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [queryParam, horseIdParam, isEn]);

  const fetchTrackingDetails = useCallback(
    async (shipmentId: number, silent = false): Promise<boolean> => {
      const seq = ++requestSeqRef.current;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (!silent && isMountedRef.current) {
          setRefreshing(true);
          setDetailsError('');
        }
        const [details, liveData, timelineRes] = await Promise.all([
          trackingApi.getTrackingDetails(shipmentId),
          trackingApi.getLiveTracking(shipmentId).catch(() => null),
          trackingApi.getShipmentTimeline(shipmentId).catch(() => null),
        ]);
        if (isMountedRef.current && !controller.signal.aborted && seq === requestSeqRef.current) {
          setTrackingDetails(details);
          setLiveTracking(liveData);
          if (timelineRes) {
            setTimelineItems(buildTimeline({ timelineData: timelineRes, viewer: 'customer', language }));
          } else {
            setTimelineItems([]);
          }
          setDetailsError('');
        }
        return true;
      } catch (err: any) {
        if (err?.name === 'AbortError' || String(err?.message || '').includes('aborted')) {
          return false;
        }
        console.error('Error fetching customer tracking details:', err);
        if (isMountedRef.current && seq === requestSeqRef.current) {
          const msg =
            err?.message ||
            (isEn ? 'Unable to load journey telemetry.' : 'Không thể tải thông tin hành trình.');
          if (!silent) {
            setDetailsError(msg);
            toast.error(msg);
          }
        }
        return false;
      } finally {
        if (isMountedRef.current && seq === requestSeqRef.current) {
          setRefreshing(false);
        }
      }
    },
    [isEn, language],
  );

  useEffect(() => {
    void fetchMyTrips();
  }, [fetchMyTrips]);

  useEffect(() => {
    if (selectedShipmentId) {
      void fetchTrackingDetails(selectedShipmentId);
    }
  }, [selectedShipmentId, fetchTrackingDetails]);

  useEffect(() => {
    if (!selectedShipmentId) return;
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        void fetchTrackingDetails(selectedShipmentId, true);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, fetchTrackingDetails]);

  const handleManualRefresh = async () => {
    if (selectedShipmentId) {
      const ok = await fetchTrackingDetails(selectedShipmentId);
      if (ok) {
        toast.success(
          isEn ? 'Synced latest journey data' : 'Đã đồng bộ dữ liệu lộ trình mới nhất',
        );
      }
    } else {
      setLoading(true);
      await fetchMyTrips();
    }
  };

  // Unified synced progress % across Live Map, Progress Bar, and Vertical Timeline
  const rawCompletedCount =
    trackingDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;
  const rawTotalCount = trackingDetails?.milestones?.length || 0;
  const timelineCompletedCount = timelineItems.filter((item) => item.status === 'done').length;
  const timelineTotalCount = timelineItems.length;
  const totalCount = rawTotalCount > 0 ? rawTotalCount : timelineTotalCount;
  const completedCount = rawTotalCount > 0 ? rawCompletedCount : timelineCompletedCount;
  const statusLower = String(trackingDetails?.shipmentStatus || '').toLowerCase();

  const unifiedProgressPct = useMemo(() => {
    if (statusLower === 'completed' || statusLower === 'delivered') return 100;
    if (totalCount > 0) {
      return Math.round((completedCount / totalCount) * 100);
    }
    const fromLive = liveTracking?.progress?.percent ?? liveTracking?.progressPct;
    if (typeof fromLive === 'number' && Number.isFinite(fromLive)) {
      return Math.max(0, Math.min(100, Math.round(fromLive)));
    }
    return 0;
  }, [statusLower, completedCount, totalCount, liveTracking]);

  // Keep LiveTrackingMap percentage strictly aligned with Timeline progress
  const syncedLiveTracking = useMemo(() => {
    if (!liveTracking) return null;
    return {
      ...liveTracking,
      progressPct: unifiedProgressPct,
      progress: liveTracking.progress
        ? { ...liveTracking.progress, percent: unifiedProgressPct }
        : { percent: unifiedProgressPct },
    };
  }, [liveTracking, unifiedProgressPct]);

  const currentMilestoneDisplay = useMemo(() => {
    if (statusLower === 'completed' || statusLower === 'delivered') {
      return isEn ? 'Delivered safely & completed' : 'Đã bàn giao ngựa & Hoàn tất hành trình';
    }
    const activeMs = trackingDetails?.milestones?.find((m) => m.status === 'CURRENT');
    if (activeMs?.title) return `${activeMs.title}${activeMs.location ? ` (${activeMs.location})` : ''}`;
    return trackingDetails?.currentMilestone || '—';
  }, [statusLower, trackingDetails, isEn]);

  const latestHealth =
    trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0
      ? trackingDetails.healthLogs[0]
      : null;

  const formatDateTimeLocale = (isoString?: string | null) => {
    if (!isoString) return { time: '--:--', date: '--/--/----' };
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return { time: '--:--', date: '--/--/----' };
    const loc = isEn ? 'en-US' : 'vi-VN';
    const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  };

  const formatSyncTime = (isoString?: string | null) => {
    if (!isoString) return '--:--:--';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString(isEn ? 'en-US' : 'vi-VN');
  };

  const shortLocation = (val?: string | null) => {
    if (!val) return '—';
    return val.split(',')[0].trim() || val;
  };

  const statusMeta = getShipmentStatusMeta(trackingDetails?.shipmentStatus || 'ready_to_depart');

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-10">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {t('tracking.liveTitle', isEn ? 'Live Trip Tracking' : 'Theo dõi hành trình')}
        </h1>

        {/* Shipment Selector (dropdown only when >5 trips), Order Detail Link & Refresh */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          {trips.length > 5 && (
            <div className="flex items-center gap-2 flex-1 lg:flex-initial min-w-0">
              <label
                htmlFor="customer-tracking-trip"
                className="text-xs font-semibold text-[#5F6977] hidden sm:block shrink-0"
              >
                {t('tracking.selectShipment', isEn ? 'Trip' : 'Chuyến đi')}:
              </label>
              <select
                id="customer-tracking-trip"
                aria-label={t('tracking.selectShipment', 'Chọn đơn hàng theo dõi')}
                value={selectedShipmentId || ''}
                onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
                className="w-full sm:min-w-[240px] lg:w-[300px] min-h-[38px] truncate px-3 py-2 rounded-xl border border-[#D8CEBE] bg-white font-semibold text-xs text-[#181A17] outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 shadow-xs cursor-pointer"
              >
                {trips.map((s) => (
                  <option key={s.shipment_id} value={s.shipment_id}>
                    {s.customer_request_code || s.request_code}:{' '}
                    {shortLocation(s.origin_location)} → {shortLocation(s.destination_location)} (
                    {formatShipmentStatusLabel(s.shipment_status, isEn)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedShipmentId && (
            <Link
              href={`/customer/requests/${selectedShipmentId}`}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#181A17] text-xs font-bold text-[#8C6621] hover:text-white transition-colors no-underline shrink-0"
            >
              <FileText size={14} aria-hidden="true" />
              <span>{isEn ? 'Order Detail' : 'Chi tiết đơn'}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="min-h-[38px] shrink-0"
          >
            <RefreshCw
              size={14}
              className={refreshing ? 'animate-spin text-[#A67C2E]' : 'text-[#5F6977]'}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {refreshing ? t('common.loading', 'Đang tải...') : t('common.refresh', 'Làm mới')}
            </span>
          </Button>
        </div>
      </header>

      {/* Quick Trip Pills for Fast Switching (when 2–5 trips) */}
      {trips.length > 1 && trips.length <= 5 && (
        <div className="flex flex-wrap items-center gap-2">
          {trips.map((trip) => {
            const active = trip.shipment_id === selectedShipmentId;
            const st = (trip.shipment_status || '').toLowerCase();
            const isLive = st === 'in_transit' || st === 'return_pending' || st === 'return_in_transit';
            const code = trip.customer_request_code || trip.request_code;
            return (
              <button
                key={trip.shipment_id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedShipmentId(trip.shipment_id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#181A17] text-[#FAF8F4] border-[#181A17] shadow-xs'
                    : 'bg-white text-[#5F6977] border-[#E5DDD0] hover:bg-[#FAF8F4] hover:text-[#181A17]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isLive
                      ? 'bg-emerald-500 animate-pulse motion-reduce:animate-none'
                      : st === 'completed'
                        ? 'bg-[#287653]'
                        : 'bg-[#A67C2E]'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-mono">{code}</span>
                <span className={active ? 'text-[#D4C5A3] font-medium' : 'text-[#747D88] font-medium'}>
                  {shortLocation(trip.origin_location)} → {shortLocation(trip.destination_location)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tripsError && !loading ? (
        <div
          role="alert"
          className="p-6 bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-2xl flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 text-sm font-semibold text-[#B33E3E]">
            <AlertTriangle size={20} aria-hidden="true" />
            <span>{tripsError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleManualRefresh()}>
            {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      ) : loading ? (
        <div role="status" className="p-12 text-center bg-white rounded-2xl border border-[#E5DDD0]">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E] mx-auto mb-3" aria-hidden="true" />
          <p className="text-[#5F6977] font-semibold text-sm">
            {t('tracking.loadingYourTrips', 'Đang tải dữ liệu chuyến đi của bạn...')}
          </p>
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#E5DDD0] flex flex-col items-center">
          <Truck size={40} className="text-[#8892A0] mb-3" aria-hidden="true" />
          <h2 className="text-lg font-bold text-[#181A17] m-0">
            {t('tracking.noActiveTrips', 'Bạn chưa có chuyến đi nào đang vận chuyển')}
          </h2>
          <p className="text-sm text-[#5F6977] mt-1 max-w-md">
            {t(
              'tracking.noActiveTripsDesc',
              'Khi đơn vận chuyển của bạn được phê duyệt kế hoạch và bàn giao cho đội xe xuất phát, bạn có thể theo dõi trực tiếp tại đây.',
            )}
          </p>
          <Link
            href="/customer/requests"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#181A17] text-[#FBF9F5] px-5 py-2.5 text-xs font-bold hover:bg-[#2A2D27] transition-colors no-underline"
          >
            {t('customer.viewRequestsList', 'Xem danh sách đơn vận chuyển')}
          </Link>
        </div>
      ) : (
        /* Main Tracking Overview Card */
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-6 shadow-sm flex flex-col gap-5">
          {detailsError && (
            <div
              role="alert"
              className="p-4 bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]"
            >
              <span>{detailsError}</span>
              <Button variant="outline" size="sm" onClick={() => void handleManualRefresh()}>
                {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFEAE0] pb-4">
            <div>
              <span className="text-[11px] font-bold text-[#A67C2E] tracking-wider uppercase">
                {t('tracking.shipmentCode', isEn ? 'SHIPMENT CODE' : 'MÃ CHUYẾN VẬN CHUYỂN')}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#181A17] mt-0.5 m-0 flex flex-wrap items-center gap-2">
                <span className="font-mono">
                  {trackingDetails?.customerRequestCode || trackingDetails?.requestCode || '—'}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-[#5F6977] mt-1 flex flex-wrap items-center gap-2 mb-0">
                <MapPin size={14} className="text-[#8892A0] shrink-0" aria-hidden="true" />
                <span>
                  <strong className="text-[#181A17]">{shortLocation(trackingDetails?.origin)}</strong> →{' '}
                  <strong className="text-[#181A17]">{shortLocation(trackingDetails?.destination)}</strong>
                </span>
                {trackingDetails?.totalDistanceKm ? (
                  <>
                    <span className="text-[#D8CEBE]" aria-hidden="true">•</span>
                    <span>
                      {t('tracking.distance', isEn ? 'Distance' : 'Khoảng cách')}:{' '}
                      <strong className="text-[#181A17]">{trackingDetails.totalDistanceKm} km</strong>
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold text-[#5F6977] bg-[#FAF8F4] px-3 py-1.5 rounded-lg border border-[#E5DDD0]">
                {t('tracking.vehicle', isEn ? 'Vehicle' : 'Phương tiện')}:{' '}
                <strong className="text-[#181A17]">
                  {translateVehicleType(trackingDetails?.assignedVehicle || undefined) ||
                    (isEn ? 'Specialized Carrier' : 'Xe chuyên dụng')}
                </strong>
              </span>
              <StatusBadge
                label={formatShipmentStatusLabel(trackingDetails?.shipmentStatus || 'ready_to_depart', isEn)}
                variant={statusMeta.variant}
                hasDot={statusLower === 'in_transit' || statusLower === 'return_in_transit'}
              />
            </div>
          </div>

          {/* 4-Column Light Editorial Metrics Grid (Strictly real data + Driver/Vet names) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-[#FAF8F4] p-3.5 rounded-2xl border border-[#E5DDD0]">
            {/* 1: Heart Rate */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{t('driver.heartRate', isEn ? 'Heart Rate' : 'Nhịp tim')}</span>
                <Heart size={14} className="text-[#B33E3E] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-1.5">
                <div className="text-lg sm:text-xl font-extrabold text-[#181A17] tabular-nums">
                  {latestHealth?.heartRateBpm ? `${latestHealth.heartRateBpm} bpm` : '-- bpm'}
                </div>
                <p className="text-[11px] font-medium text-[#5F6977] mt-0.5 m-0 truncate">
                  {!latestHealth ? (
                    isEn ? 'No vitals logged yet' : 'Chưa ghi nhận chỉ số'
                  ) : latestHealth.conditionStatus === 'stressed' ? (
                    <span className="text-[#B33E3E] font-semibold">
                      {isEn ? 'Veterinarian attending' : 'Thú y đang chăm sóc'}
                    </span>
                  ) : (
                    <span className="text-[#287653] font-semibold">
                      {isEn ? 'Calm & stable' : 'Bình tĩnh & ổn định'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 2: Body Temperature */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{t('driver.bodyTemp', isEn ? 'Body Temp' : 'Thân nhiệt')}</span>
                <Activity size={14} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-1.5">
                <div className="text-lg sm:text-xl font-extrabold text-[#181A17] tabular-nums">
                  {latestHealth?.temperatureC ? `${latestHealth.temperatureC}°C` : '-- °C'}
                </div>
                <p className="text-[11px] font-medium text-[#5F6977] mt-0.5 m-0 truncate">
                  {latestHealth?.temperatureC ? (
                    <span className="text-[#287653] font-semibold">
                      {t('driver.normalRange', '37.2 – 38.3°C')}
                    </span>
                  ) : isEn ? (
                    'Awaiting vet log'
                  ) : (
                    'Chờ thú y cập nhật'
                  )}
                </p>
              </div>
            </div>

            {/* 3: On-board Crew (Driver & Vet names preserved, no fake phones) */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3 flex flex-col justify-between">
              <div className="text-xs font-semibold text-[#5F6977]">
                {isEn ? 'On-board Crew' : 'Đội ngũ phụ trách'}
              </div>
              <div className="mt-1.5 space-y-0.5 text-xs">
                <div className="truncate">
                  <span className="text-[#747D88]">{isEn ? 'Driver:' : 'Tài xế:'} </span>
                  <strong className="text-[#181A17]">
                    {trackingDetails?.assignedDriver ||
                      (statusLower === 'completed' || statusLower === 'delivered'
                        ? isEn
                          ? 'Completed handover'
                          : 'Đã hoàn tất bàn giao'
                        : isEn
                          ? 'Assigning'
                          : 'Đang phân công')}
                  </strong>
                </div>
                <div className="truncate">
                  <span className="text-[#747D88]">{isEn ? 'Vet / Escort:' : 'Thú y / Áp tải:'} </span>
                  <strong className="text-[#181A17]">
                    {trackingDetails?.assignedEscort ||
                      (isEn ? 'Equine Vet' : 'Thú y chuyên trách')}
                  </strong>
                </div>
              </div>
            </div>

            {/* 4: Last Updated */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{isEn ? 'Last Sync' : 'Cập nhật gần nhất'}</span>
                <Clock size={14} className="text-[#5F6977] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-1.5">
                <div className="text-base sm:text-lg font-extrabold text-[#181A17] tabular-nums">
                  {formatSyncTime(trackingDetails?.lastUpdated)}
                </div>
                <p className="text-[11px] text-[#747D88] mt-0.5 m-0">
                  {isEn ? 'Auto-syncs every 12s' : 'Tự động đồng bộ'}
                </p>
              </div>
            </div>
          </div>

          {/* Desktop 2-Column / Mobile Stacked: Live Map (Left/Top) & Vertical Timeline (Right/Bottom) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Column 1: Live Map & Telemetry Details */}
            <div className="lg:col-span-7 flex flex-col gap-5 order-1">
              {/* Live Telemetry Map */}
              {syncedLiveTracking && (
                <div className="bg-[#FAF8F4] border border-[#E5DDD0] rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tracking-[0.12em] text-[#A67C2E] uppercase">
                        {isEn ? 'LIVE VEHICLE TRACKING' : 'VỊ TRÍ PHƯƠNG TIỆN TRỰC TIẾP'}
                      </span>
                      {syncedLiveTracking.isSimulated && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300">
                          {isEn ? 'SIMULATED' : 'GIẢ LẬP'}
                        </span>
                      )}
                    </div>
                    {(syncedLiveTracking.currentPosition || syncedLiveTracking.vehiclePosition) && (
                      <span className="text-xs text-[#5F6977]">
                        {isEn ? 'Speed: ' : 'Vận tốc: '}
                        <strong className="text-[#181A17] tabular-nums">
                          {Math.round(
                            (syncedLiveTracking.currentPosition ||
                              syncedLiveTracking.vehiclePosition)?.speedKmh || 0,
                          )}{' '}
                          km/h
                        </strong>
                      </span>
                    )}
                  </div>
                  <LiveTrackingMap key={selectedShipmentId ?? 'map'} liveData={syncedLiveTracking} height="380px" autoCenter />
                </div>
              )}

              {/* Equine Health Summary */}
              {trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0 && (
                <div className="bg-[#FAF8F4] rounded-xl p-4 sm:p-5 border border-[#D8CEBE] flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
                      <Heart size={16} className="text-[#B33E3E]" aria-hidden="true" />
                      {isEn
                        ? 'In-Transit Equine Health & Vital Logs'
                        : 'Nhật ký Sức khỏe & Thể trạng Ngựa'}
                    </h4>
                    <span className="text-xs text-[#5F6977]">
                      {isEn ? 'Updated by Equine Escort' : 'Cập nhật bởi thú y áp tải'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {trackingDetails.healthLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-white rounded-lg border border-[#D8CEBE] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-[#181A17]">{log.horseName}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.conditionStatus === 'stable'
                                  ? 'bg-[#E8F2EB] text-[#287653]'
                                  : 'bg-[#F8F0DF] text-[#966516]'
                              }`}
                            >
                              {isEn
                                ? log.conditionStatus
                                : log.conditionStatusVi || log.conditionStatus}
                            </span>
                            {log.legName && (
                              <span className="bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE] px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                <MapPin size={10} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                                <span>{log.legName}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[#5F6977] mt-1 m-0">
                            {log.notes || (isEn ? 'Stable vital condition' : 'Sức khỏe ổn định')}
                          </p>
                        </div>

                        <div className="text-[#5F6977] sm:text-right shrink-0">
                          <span className="font-bold text-[#181A17] block tabular-nums">
                            {log.temperatureC ? `${log.temperatureC}°C` : '--'} •{' '}
                            {log.heartRateBpm ? `${log.heartRateBpm} bpm` : '--'}
                          </span>
                          {(() => {
                            const { time, date } = formatDateTimeLocale(log.recordedAt);
                            return (
                              <span className="text-[11px] text-[#5F6977] flex sm:justify-end items-center gap-1 mt-0.5 tabular-nums">
                                <Clock size={11} className="text-[#8892A0]" aria-hidden="true" />
                                <strong className="text-[#181A17]">{time}</strong>
                                <span className="text-[#D8CEBE] mx-0.5">•</span>
                                <span>{date}</span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedShipmentId && trackingDetails && (
                <DeliveryHandoverPanel
                  role="customer"
                  shipmentId={selectedShipmentId}
                  shipmentStatus={trackingDetails.shipmentStatus}
                  assignedHorses={trackingDetails.assignedHorses}
                />
              )}

              {selectedShipmentId && (statusLower === 'completed' || statusLower === 'delivered') && (
                <div className="p-4 sm:p-5 rounded-2xl border border-[#D4C5A3] bg-[#FAF8F4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#D4C5A3] text-[#A67C2E] flex items-center justify-center shrink-0">
                      <ShieldCheck size={19} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-[#181A17] m-0">
                        {isEn
                          ? 'Insurance & Post-Delivery Claims (72h Window)'
                          : 'Bảo hiểm & Yêu cầu bồi thường (Hạn 72 giờ)'}
                      </h4>
                      <p className="text-xs text-[#5F6977] m-0 mt-0.5 leading-relaxed">
                        {isEn
                          ? 'Need to report a post-delivery injury or insurance claim? Submit within 72 hours of delivery.'
                          : 'Nếu phát hiện sự cố sau bàn giao, bạn có thể gửi yêu cầu bồi thường bảo hiểm trong vòng 72 giờ kể từ lúc nhận ngựa.'}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/customer/requests/${selectedShipmentId}?tab=horses#claims`}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FAF8F4] text-xs font-bold inline-flex items-center justify-center gap-1.5 no-underline shrink-0 transition-colors"
                  >
                    <span>{isEn ? 'Open Claims & Insurance' : 'Mở Bảo hiểm & Bồi thường'}</span>
                    <ExternalLink size={13} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>

            {/* Column 2: Progress & Vertical Timeline */}
            <div className="lg:col-span-5 flex flex-col gap-5 order-2">
              {/* Light Editorial Route Progress Card */}
              <div className="bg-[#FAF8F4] border border-[#E5DDD0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                {/* Header row: Title & Percentage */}
                <div className="flex items-center justify-between gap-2 border-b border-[#EAE3D6] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#A67C2E]" />
                    <span className="text-[11px] font-bold tracking-[0.14em] text-[#A67C2E] uppercase">
                      {t('tracking.gpsRadar', isEn ? 'JOURNEY PROGRESS' : 'TIẾN ĐỘ HÀNH TRÌNH')}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#5F6977] bg-white border border-[#E5DDD0] px-2.5 py-1 rounded-full shadow-xs tabular-nums">
                    <strong className="text-[#181A17] font-bold">{unifiedProgressPct}%</strong>{' '}
                    <span className="text-[#8C95A3] font-normal">
                      ({completedCount}/{totalCount} {isEn ? 'stops' : 'mốc'})
                    </span>
                  </span>
                </div>

                {/* Origin and Destination Row */}
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#287653] ring-4 ring-[#E8F2EB] shrink-0" />
                      <span className="text-[11px] font-bold text-[#287653] uppercase tracking-wider">
                        {isEn ? 'Origin' : 'Xuất phát'}
                      </span>
                    </div>
                    <div
                      className="font-bold text-sm text-[#181A17] truncate leading-tight"
                      title={trackingDetails?.origin || ''}
                    >
                      {shortLocation(trackingDetails?.origin)}
                    </div>
                  </div>

                  <div className="text-right min-w-0">
                    <div className="flex items-center justify-end gap-1.5 mb-1">
                      <span className="text-[11px] font-bold text-[#A67C2E] uppercase tracking-wider">
                        {isEn ? 'Destination' : 'Điểm đến'}
                      </span>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#A67C2E] ring-4 ring-[#F5EFE2] shrink-0" />
                    </div>
                    <div
                      className="font-bold text-sm text-[#181A17] truncate leading-tight"
                      title={trackingDetails?.destination || ''}
                    >
                      {shortLocation(trackingDetails?.destination)}
                    </div>
                    <div className="text-[11px] text-[#5F6977] truncate mt-0.5">
                      {isEn ? 'ETA: ' : 'Dự kiến: '}
                      <span className="font-medium text-[#181A17]">
                        {trackingDetails?.eta
                          ? Number.isNaN(Date.parse(trackingDetails.eta))
                            ? trackingDetails.eta
                            : new Date(trackingDetails.eta).toLocaleString(isEn ? 'en-US' : 'vi-VN')
                          : isEn
                            ? 'On schedule'
                            : 'Đúng tiến độ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Full-width Progress Bar */}
                <div className="w-full">
                  <div className="h-2.5 w-full bg-[#E5DDD0] rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-[#287653] via-[#8C7A5E] to-[#A67C2E] rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, Math.min(100, unifiedProgressPct))}%` }}
                    />
                  </div>
                </div>

                {/* Current Milestone Banner */}
                <div className="bg-white border border-[#D8CEBE] rounded-xl p-3 flex items-start gap-2.5 shadow-xs">
                  <div className="w-7 h-7 rounded-lg bg-[#F5EFE2] flex items-center justify-center shrink-0 text-[#A67C2E] mt-0.5">
                    <MapPin size={15} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-[#8C7A5E] uppercase tracking-wider">
                      {isEn ? 'Current Milestone' : 'Mốc hành trình hiện tại'}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-[#181A17] leading-relaxed break-words mt-0.5">
                      {currentMilestoneDisplay}
                    </div>
                  </div>
                </div>
              </div>

              {/* Vertical Timeline */}
              <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[#E5DDD0] pb-3">
                  <h3 className="text-sm sm:text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                    <FileCheck2 size={17} className="text-[#A67C2E]" aria-hidden="true" />
                    {t('tracking.milestones', isEn ? 'Milestones & Border Checks' : 'Mốc Lộ trình & Kiểm dịch')}
                  </h3>
                  <span className="text-xs font-bold text-[#5F6977] tabular-nums">
                    {isEn
                      ? `${completedCount}/${totalCount} passed`
                      : `${completedCount}/${totalCount} mốc đã qua`}
                  </span>
                </div>

                <VerticalTimeline
                  items={timelineItems}
                  viewer="customer"
                  emptyText={
                    isEn
                      ? 'No control milestones have been scheduled for this journey yet.'
                      : 'Chưa có thông tin mốc kiểm soát nào cho chuyến đi này.'
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerTrackingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[360px] text-[#5F6977] text-sm font-medium">
          Đang tải thông tin giám sát hành trình...
        </div>
      }
    >
      <CustomerTrackingContent />
    </React.Suspense>
  );
}
