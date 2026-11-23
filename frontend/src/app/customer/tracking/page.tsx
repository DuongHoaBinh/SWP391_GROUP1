'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Heart,
  Clock,
  MapPin,
  Activity,
  CheckCircle2,
  Truck,
  Plane,
  RefreshCw,
  FileCheck2,
  FileText,
  AlertTriangle,
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
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import toast from 'react-hot-toast';

function CustomerTrackingContent() {
  const { t, language, translateStatus, translateVehicleType } = useTranslation();

  const searchParams = useSearchParams();
  const queryParam = searchParams.get('shipmentId') || searchParams.get('requestId');

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [liveTracking, setLiveTracking] = useState<LiveTrackingDetails | null>(null);
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
      setTrips(data);

      if (data.length > 0) {
        let matchedId: number | null = null;
        if (queryParam) {
          const parsedNum = parseInt(queryParam.replace(/\D/g, ''), 10);
          const found = data.find(
            (s) =>
              s.shipment_id === parsedNum ||
              s.request_code === queryParam ||
              s.customer_request_code === queryParam ||
              s.system_request_code === queryParam,
          );
          if (found) {
            matchedId = found.shipment_id;
          } else if (!isNaN(parsedNum) && parsedNum > 0) {
            matchedId = parsedNum;
          }
        }

        setSelectedShipmentId((prev) => {
          if (matchedId) return matchedId;
          if (prev && data.some((s) => s.shipment_id === prev)) return prev;
          return data[0].shipment_id;
        });
      }
    } catch (err: any) {
      console.warn('Could not fetch customer shipments:', err);
      if (isMountedRef.current) {
        setTripsError(
          err?.message ||
            (language === 'en'
              ? 'Unable to load active trips.'
              : 'Không thể tải danh sách chuyến đi.'),
        );
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [queryParam, language]);

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
        const [details, liveData] = await Promise.all([
          trackingApi.getTrackingDetails(shipmentId),
          trackingApi.getLiveTracking(shipmentId).catch(() => null),
        ]);
        if (isMountedRef.current && !controller.signal.aborted && seq === requestSeqRef.current) {
          setTrackingDetails(details);
          if (liveData) setLiveTracking(liveData);
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
            (language === 'en'
              ? 'Unable to load journey telemetry.'
              : 'Không thể tải thông tin hành trình.');
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
    [language],
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
          language === 'en'
            ? 'Synced latest journey data'
            : 'Đã đồng bộ dữ liệu lộ trình mới nhất',
        );
      }
    } else {
      setLoading(true);
      await fetchMyTrips();
    }
  };

  const completedCount = trackingDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalCount = trackingDetails?.milestones?.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const latestHealth =
    trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0
      ? trackingDetails.healthLogs[0]
      : null;

  const formatDateTimeLocale = (isoString?: string | null) => {
    if (!isoString) return { time: '--:--', date: '--/--/----' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { time: '--:--', date: '--/--/----' };
    const loc = language === 'en' ? 'en-US' : 'vi-VN';
    const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  };

  const formatSyncTime = (isoString?: string | null) => {
    if (!isoString) return '--:--:--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString(language === 'en' ? 'en-US' : 'vi-VN');
  };

  const shortLocation = (val?: string | null) => {
    if (!val) return '—';
    return val.split(',')[0].trim() || val;
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('tracking.liveTitle', language === 'en' ? 'Trip Tracking' : 'Theo dõi hành trình')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0 max-w-3xl">
            {t(
              'tracking.liveSubtitle',
              language === 'en'
                ? 'Track route milestones and veterinary check-ins along the journey.'
                : 'Theo dõi tiến độ các mốc kiểm soát và sức khỏe ngựa trong chuyến đi.',
            )}
          </p>
        </div>

        {/* Shipment Selector & Refresh */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto shrink-0">
          {trips.length > 0 && (
            <div className="flex items-center gap-2 flex-1 lg:flex-initial min-w-0">
              <label htmlFor="customer-tracking-trip" className="text-xs font-semibold text-[#5F6977] hidden sm:block shrink-0">
                {t('tracking.selectShipment', 'Đơn hàng')}:
              </label>
              <select
                id="customer-tracking-trip"
                aria-label={t('tracking.selectShipment', 'Chọn đơn hàng theo dõi')}
                value={selectedShipmentId || ''}
                onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
                className="w-full sm:min-w-[260px] lg:w-[320px] xl:w-[360px] min-h-[40px] truncate px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white font-semibold text-xs text-[#181A17] outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 shadow-sm cursor-pointer"
              >
                {trips.map((s) => (
                  <option key={s.shipment_id} value={s.shipment_id}>
                    {s.request_code}:{' '}
                    {s.request_title || `${shortLocation(s.origin_location)} → ${shortLocation(s.destination_location)}`} (
                    {translateStatus(s.shipment_status)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="min-h-[40px] shrink-0"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#A67C2E]' : 'text-[#5F6977]'} aria-hidden="true" />
            <span className="hidden sm:inline">
              {refreshing ? t('common.loading', 'Đang tải...') : t('common.refresh', 'Làm mới')}
            </span>
          </Button>
        </div>
      </header>

      {tripsError && !loading ? (
        <div role="alert" className="p-6 bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-[#B33E3E]">
            <AlertTriangle size={20} aria-hidden="true" />
            <span>{tripsError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleManualRefresh()}>
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
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
            {t('tracking.noActiveTripsDesc', 'Khi đơn vận chuyển của bạn được phê duyệt kế hoạch và bàn giao cho đội xe xuất phát, bạn có thể theo dõi trực tiếp tại đây.')}
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
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 sm:p-8 shadow-sm flex flex-col gap-6">
          {detailsError && (
            <div role="alert" className="p-4 bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]">
              <span>{detailsError}</span>
              <Button variant="outline" size="sm" onClick={() => void handleManualRefresh()}>
                {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFEAE0] pb-6">
            <div>
              <span className="text-[11px] font-bold text-[#A67C2E] tracking-wider uppercase">
                {t('tracking.shipmentCode', 'MÃ CHUYẾN VẬN CHUYỂN')}
              </span>
              <h2 className="text-2xl font-extrabold text-[#181A17] mt-1 m-0 flex flex-wrap items-center gap-2">
                <span>{trackingDetails?.requestCode || '—'}</span>
                {trackingDetails?.requestTitle && (
                  <span className="text-base font-semibold text-[#5F6977]">— {trackingDetails.requestTitle}</span>
                )}
              </h2>
              <p className="text-sm text-[#5F6977] mt-1.5 flex flex-wrap items-center gap-2 mb-0">
                <MapPin size={15} className="text-[#8892A0] shrink-0" aria-hidden="true" />
                <span>
                  <strong className="text-[#181A17]">{shortLocation(trackingDetails?.origin)}</strong> →{' '}
                  <strong className="text-[#181A17]">{shortLocation(trackingDetails?.destination)}</strong>
                </span>
                <span className="text-[#D8CEBE]" aria-hidden="true">•</span>
                <span>
                  {t('tracking.distance', 'Khoảng cách')}: <strong className="text-[#181A17]">{trackingDetails?.totalDistanceKm || 0} km</strong>
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-[#5F6977] bg-[#FAF8F4] px-3 py-1.5 rounded-lg border border-[#E5DDD0]">
                {t('tracking.vehicle', 'Phương tiện')}:{' '}
                <strong className="text-[#181A17]">
                  {translateVehicleType(trackingDetails?.assignedVehicle || undefined) ||
                    (language === 'en' ? 'Specialized Carrier' : 'Xe chuyên dụng')}
                </strong>
              </span>
              <StatusBadge
                label={translateStatus(trackingDetails?.shipmentStatus || 'ready_to_depart')}
                variant={
                  trackingDetails?.shipmentStatus === 'in_transit'
                    ? 'transit'
                    : trackingDetails?.shipmentStatus === 'completed' || trackingDetails?.shipmentStatus === 'arrived'
                    ? 'success'
                    : 'pending'
                }
                hasDot={trackingDetails?.shipmentStatus === 'in_transit'}
              />
            </div>
          </div>

          {/* 4-Column Light Editorial Metrics Grid (Strictly real data) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 bg-[#FAF8F4] p-4 rounded-2xl border border-[#E5DDD0]">
            {/* 1: Heart Rate */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{t('driver.heartRate', language === 'en' ? 'Heart Rate' : 'Nhịp tim')}</span>
                <Heart size={15} className="text-[#B33E3E] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-extrabold text-[#181A17]">
                  {latestHealth?.heartRateBpm ? `${latestHealth.heartRateBpm} bpm` : '-- bpm'}
                </div>
                <p className="text-[11px] font-medium text-[#5F6977] mt-0.5 m-0 truncate">
                  {!latestHealth ? (
                    language === 'en' ? 'No vital signs recorded yet' : 'Chưa ghi nhận chỉ số'
                  ) : latestHealth.conditionStatus === 'stressed' ? (
                    <span className="text-[#B33E3E] font-semibold">
                      {language === 'en' ? 'Veterinarian attending' : 'Bác sĩ thú y đang chăm sóc'}
                    </span>
                  ) : (
                    <span className="text-[#287653] font-semibold">
                      {language === 'en' ? 'Calm & stable' : 'Bình tĩnh & ổn định'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 2: Body Temperature */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{t('driver.bodyTemp', language === 'en' ? 'Body Temp' : 'Thân nhiệt')}</span>
                <Activity size={15} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <div className="text-xl font-extrabold text-[#181A17]">
                  {latestHealth?.temperatureC ? `${latestHealth.temperatureC}°C` : '-- °C'}
                </div>
                <p className="text-[11px] font-medium text-[#5F6977] mt-0.5 m-0 truncate">
                  {latestHealth?.temperatureC ? (
                    <span className="text-[#287653] font-semibold">
                      {t('driver.normalRange', 'Bình thường: 37.2 - 38.3°C')}
                    </span>
                  ) : language === 'en' ? (
                    'Awaiting escort vet log'
                  ) : (
                    'Chờ cập nhật từ thú y'
                  )}
                </p>
              </div>
            </div>

            {/* 3: On-board Crew */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3.5 flex flex-col justify-between">
              <div className="text-xs font-semibold text-[#5F6977]">
                {language === 'en' ? 'On-board Crew' : 'Đội ngũ phụ trách'}
              </div>
              <div className="mt-2 space-y-0.5 text-xs">
                <div className="truncate">
                  <span className="text-[#747D88]">{language === 'en' ? 'Driver:' : 'Tài xế:'} </span>
                  <strong className="text-[#181A17]">
                    {trackingDetails?.assignedDriver || (language === 'en' ? 'Dispatching' : 'Đang điều phối')}
                  </strong>
                </div>
                <div className="truncate">
                  <span className="text-[#747D88]">{language === 'en' ? 'Vet / Escort:' : 'Thú y / Áp tải:'} </span>
                  <strong className="text-[#181A17]">
                    {trackingDetails?.assignedEscort ||
                      (language === 'en' ? 'Equine Vet' : 'Thú y chuyên trách')}
                  </strong>
                </div>
              </div>
            </div>

            {/* 4: Last Updated */}
            <div className="bg-white rounded-xl border border-[#E5DDD0] p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-[#5F6977]">
                <span>{language === 'en' ? 'Last Updated' : 'Cập nhật gần nhất'}</span>
                <Clock size={15} className="text-[#5F6977] shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-extrabold text-[#181A17] tabular-nums">
                  {formatSyncTime(trackingDetails?.lastUpdated)}
                </div>
                <p className="text-[11px] text-[#747D88] mt-0.5 m-0">
                  {language === 'en' ? 'Synced automatically' : 'Đồng bộ tự động'}
                </p>
              </div>
            </div>
          </div>

          {/* Live Telemetry Map */}
          {liveTracking && (
            <div className="bg-[#FAF8F4] border border-[#E5DDD0] rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.12em] text-[#A67C2E] uppercase">
                    {language === 'en' ? 'LIVE VEHICLE TRACKING' : 'VỊ TRÍ PHƯƠNG TIỆN TRỰC TIẾP'}
                  </span>
                  {liveTracking.isSimulated && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300">
                      {language === 'en' ? 'SIMULATED DATA' : 'DỮ LIỆU GIẢ LẬP'}
                    </span>
                  )}
                </div>
                {(liveTracking.currentPosition || liveTracking.vehiclePosition) && (
                  <span className="text-xs text-[#5F6977]">
                    {language === 'en' ? 'Speed: ' : 'Vận tốc: '}
                    <strong className="text-[#181A17]">
                      {Math.round(
                        (liveTracking.currentPosition || liveTracking.vehiclePosition)?.speedKmh || 0,
                      )}{' '}
                      km/h
                    </strong>
                  </span>
                )}
              </div>
              <LiveTrackingMap liveData={liveTracking} height="380px" autoCenter />
            </div>
          )}

          {/* Light Editorial Route Progress Card */}
          <div className="bg-[#FAF8F4] border border-[#E5DDD0] rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <span className="text-[11px] font-bold tracking-[0.12em] text-[#A67C2E] uppercase">
                {t('tracking.gpsRadar', language === 'en' ? 'JOURNEY PROGRESS' : 'TIẾN ĐỘ HÀNH TRÌNH')}
              </span>
              <span className="text-xs font-semibold text-[#5F6977]">
                {language === 'en' ? 'Progress:' : 'Tiến độ:'} <strong className="text-[#181A17]">{progressPct}%</strong> (
                {completedCount}/{totalCount} {language === 'en' ? 'milestones' : 'mốc'})
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 my-2">
              <div className="text-center sm:text-left">
                <div className="w-3 h-3 rounded-full bg-[#287653] mb-1.5 ring-4 ring-[#E8F2EB] mx-auto sm:mx-0" />
                <div className="font-bold text-sm text-[#181A17]">{shortLocation(trackingDetails?.origin)}</div>
                <div className="text-xs text-[#5F6977]">{language === 'en' ? 'Origin' : 'Điểm xuất phát'}</div>
              </div>

              <div className="flex-1 w-full relative px-2 sm:px-4">
                <div className="h-2 w-full bg-[#E5DDD0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#181A17] rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(8, progressPct)}%` }}
                  />
                </div>
                <div className="flex justify-center mt-3">
                  <span className="bg-white border border-[#D8CEBE] text-[#181A17] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm">
                    <MapPin size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                    <span>
                      {language === 'en' ? 'Current milestone:' : 'Vị trí hiện tại:'}{' '}
                      <strong>{trackingDetails?.currentMilestone || '—'}</strong>
                    </span>
                  </span>
                </div>
              </div>

              <div className="text-center sm:text-right">
                <div className="w-3 h-3 rounded-full bg-[#A67C2E] mb-1.5 ring-4 ring-[#F5EFE2] mx-auto sm:ml-auto" />
                <div className="font-bold text-sm text-[#181A17]">{shortLocation(trackingDetails?.destination)}</div>
                <div className="text-xs text-[#5F6977]">
                  {language === 'en' ? 'Estimated arrival:' : 'Dự kiến đến:'}{' '}
                  {trackingDetails?.eta
                    ? (Number.isNaN(Date.parse(trackingDetails.eta))
                        ? trackingDetails.eta
                        : new Date(trackingDetails.eta).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN'))
                    : (language === 'en' ? 'On schedule' : 'Đúng tiến độ')}
                </div>
              </div>
            </div>
          </div>

          {/* Milestones Timeline */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="text-lg font-bold text-[#181A17] m-0 flex items-center gap-2">
                <FileCheck2 size={18} className="text-[#A67C2E]" aria-hidden="true" />
                {t('tracking.milestones', 'Tiến độ các Mốc Lộ trình & Thủ tục Kiểm dịch')}
              </h3>
              <span className="text-xs font-bold text-[#5F6977]">
                {language === 'en'
                  ? `${completedCount} of ${totalCount} checkpoints passed`
                  : `${completedCount} trên ${totalCount} chặng/trạm đã qua`}
              </span>
            </div>

            <div className="relative border-l-2 border-[#D8CEBE] ml-4 pl-6 flex flex-col gap-5 py-2">
              {!trackingDetails || !trackingDetails.milestones || trackingDetails.milestones.length === 0 ? (
                <p className="text-sm text-[#5F6977]">
                  {language === 'en'
                    ? 'No control milestones have been scheduled for this journey yet.'
                    : 'Chưa có thông tin mốc kiểm soát nào cho chuyến đi này.'}
                </p>
              ) : (
                trackingDetails.milestones.map((m, idx) => {
                  const isCompleted = m.status === 'COMPLETED';
                  const isCurrent = m.status === 'CURRENT';

                  return (
                    <div key={m.id} className="relative">
                      {/* Status Icon */}
                      <div
                        className={`absolute -left-[35px] top-0.5 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                          isCompleted
                            ? 'bg-[#287653] text-white ring-4 ring-[#E8F2EB]'
                            : isCurrent
                            ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#F5EFE2] animate-pulse motion-reduce:animate-none'
                            : 'bg-[#F0EEE8] text-[#5F6977]'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 size={16} aria-hidden="true" /> : idx + 1}
                      </div>

                      <div
                        className={`rounded-xl p-4 border transition-colors ${
                          isCurrent
                            ? 'bg-[#FAF8F4] border-[#A67C2E]'
                            : isCompleted
                            ? 'bg-[#F0EEE8]/60 border-[#D8CEBE]'
                            : 'bg-white border-[#D8CEBE]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#181A17] text-sm">{m.title}</span>
                            {m.legType === 'flight' && (
                              <span className="bg-[#F5EFE2] text-[#8C6621] border border-[#DFCA9A] text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                <Plane size={11} aria-hidden="true" /> {language === 'en' ? 'Air Leg' : 'Chặng bay'}
                              </span>
                            )}
                            {m.isCustomsBorder && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                                {language === 'en' ? 'Quarantine & Customs' : 'Kiểm dịch & Hải quan'}
                              </span>
                            )}
                          </div>

                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full w-fit ${
                              isCompleted
                                ? 'bg-[#E8F2EB] text-[#287653]'
                                : isCurrent
                                ? 'bg-[#181A17] text-[#C4B38E]'
                                : 'bg-[#F0EEE8] text-[#5F6977]'
                            }`}
                          >
                            {isCompleted
                              ? language === 'en'
                                ? 'Completed'
                                : 'Đã hoàn tất'
                              : isCurrent
                              ? language === 'en'
                                ? 'In Progress'
                                : 'Đang thực hiện'
                              : language === 'en'
                              ? 'Upcoming'
                              : 'Sắp tới'}
                          </span>
                        </div>

                        <p className="text-xs text-[#5F6977] flex items-center gap-1.5 mt-1.5 m-0">
                          <MapPin size={13} className="text-[#8892A0] shrink-0" aria-hidden="true" /> {m.location}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#5F6977] mt-2.5">
                          {m.plannedTime && (() => {
                            const { time, date } = formatDateTimeLocale(m.plannedTime);
                            return (
                              <span className="inline-flex items-center gap-1.5 bg-[#F0EEE8] text-[#181A17] px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#D8CEBE]">
                                <Clock size={12} className="text-[#5F6977] shrink-0" aria-hidden="true" />
                                <span>{language === 'en' ? 'Planned:' : 'Kế hoạch:'}</span>
                                <strong className="text-[#181A17]">{time}</strong>
                                <span className="text-[#8892A0] mx-0.5">•</span>
                                <span>{date}</span>
                              </span>
                            );
                          })()}
                          {m.actualTime && (() => {
                            const { time, date } = formatDateTimeLocale(m.actualTime);
                            return (
                              <span className="inline-flex items-center gap-1.5 bg-[#E8F2EB] text-[#287653] px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#B7DBC4]">
                                <CheckCircle2 size={12} className="text-[#287653] shrink-0" aria-hidden="true" />
                                <span>{language === 'en' ? 'Actual:' : 'Thực tế:'}</span>
                                <strong className="font-bold">{time}</strong>
                                <span className="opacity-60 mx-0.5">•</span>
                                <span>{date}</span>
                              </span>
                            );
                          })()}
                          {m.updatedBy && (
                            <span className="text-[#5F6977] italic text-[11px]">
                              {language === 'en' ? 'Confirmed by:' : 'Xác nhận bởi:'} {m.updatedBy}
                            </span>
                          )}
                        </div>

                        {m.notes && (
                          <div className="mt-2.5 bg-[#F8F0DF]/70 border border-[#DFCA9A] rounded-lg p-2.5 text-xs text-[#181A17] flex items-start gap-2 shadow-sm">
                            <FileText size={14} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="flex-1">
                              <span className="font-bold text-[#8C6621] text-[11px] uppercase tracking-wide block">
                                {language === 'en' ? 'Field Notes:' : 'Ghi chú thực địa:'}
                              </span>
                              <p className="mt-0.5 m-0 text-[#181A17] font-medium italic">&ldquo;{m.notes}&rdquo;</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Equine Health Summary */}
          {trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0 && (
            <div className="bg-[#FAF8F4] rounded-xl p-5 border border-[#D8CEBE] flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
                  <Heart size={16} className="text-[#B33E3E]" aria-hidden="true" />
                  {language === 'en'
                    ? 'In-Transit Equine Health & Vital Logs'
                    : 'Nhật ký Sức khỏe & Thể trạng Ngựa trong Chuyến đi'}
                </h4>
                <span className="text-xs text-[#5F6977]">
                  {language === 'en'
                    ? 'Updated by Attending Equine Escort'
                    : 'Cập nhật bởi Chuyên viên y tế áp tải'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {trackingDetails.healthLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-white rounded-lg border border-[#D8CEBE] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
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
                          {language === 'en'
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
                        {log.notes || (language === 'en' ? 'Stable vital condition' : 'Sức khỏe ổn định')}
                      </p>
                    </div>

                    <div className="text-[#5F6977] sm:text-right shrink-0">
                      <span className="font-bold text-[#181A17] block">
                        {log.temperatureC ? `${log.temperatureC}°C` : '--'} •{' '}
                        {log.heartRateBpm ? `${log.heartRateBpm} bpm` : '--'}
                      </span>
                      {(() => {
                        const { time, date } = formatDateTimeLocale(log.recordedAt);
                        return (
                          <span className="text-[11px] text-[#5F6977] flex sm:justify-end items-center gap-1 mt-0.5">
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
