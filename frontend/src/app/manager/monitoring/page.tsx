'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MapPin,
  Clock,
  Truck,
  Heart,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Check,
  FileSpreadsheet,
  Plane,
  UserCheck,
  FileText,
  RotateCcw,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  trackingApi,
  TripTrackingDetails,
  AssignedTripSummary,
  TrackingMilestoneItem,
  LiveTrackingDetails,
  LiveOverviewItem,
} from '@/features/tracking/api/tracking.api';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import { VerticalTimeline, buildTimeline, TimelineItem } from '@/features/tracking/timeline';
import toast from 'react-hot-toast';

type OverrideReasonCode =
  | 'lost_signal'
  | 'battery_depleted'
  | 'customs_confirmed'
  | 'special_dispatch';

function TripMonitoringContent() {
  const { t, language, translateStatus, translateCondition, translateRole } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedShipmentId;

  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [liveTracking, setLiveTracking] = useState<LiveTrackingDetails | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [viewMode, setViewMode] = useState<'timeline' | 'live_map' | 'fleet_overview'>('timeline');
  const [fleetOverview, setFleetOverview] = useState<LiveOverviewItem[]>([]);
  const [loadingFleet, setLoadingFleet] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowFormatted, setNowFormatted] = useState<string>('--:--');

  // Coordinator Override Modal State (stable enum reason code + clean reset)
  const [overrideMilestone, setOverrideMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [overrideAction, setOverrideAction] = useState<string>('arrived');
  const [overrideReasonCode, setOverrideReasonCode] = useState<OverrideReasonCode>('lost_signal');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState<boolean>(false);

  // Flow 5 Incident Modal
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);

  const searchParams = useSearchParams();
  const urlShipmentId = searchParams.get('shipmentId');
  const [isConfirmCompleteOpen, setIsConfirmCompleteOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const reasonTextMap: Record<OverrideReasonCode, string> = {
    lost_signal: t('monitoring.reasonLost4G', 'Tài xế mất sóng 4G, xác nhận qua bộ đàm'),
    battery_depleted: t('monitoring.reasonDepletedBattery', 'Tài xế hết pin điện thoại, gọi từ trạm dừng chân'),
    customs_confirmed: t('monitoring.reasonCustomsClearance', 'Cửa khẩu xác nhận thông quan trực tiếp cho điều phối'),
    special_dispatch: t('monitoring.reasonSpecialDispatch', 'Lý do nghiệp vụ điều phối đặc biệt khác'),
  };

  useEffect(() => {
    const locale = language === 'en' ? 'en-US' : 'vi-VN';
    if (trackingDetails?.lastUpdated) {
      setNowFormatted(new Date(trackingDetails.lastUpdated).toLocaleTimeString(locale));
    } else {
      setNowFormatted(new Date().toLocaleTimeString(locale));
    }
  }, [trackingDetails?.lastUpdated, language]);

  const fetchTrips = useCallback(
    async (keepSelected = true) => {
      try {
        setLoadError(null);
        const data = await trackingApi.getMyTrips();
        const priorityRank = (st?: string) => {
          const s = String(st || '').toLowerCase();
          if (s === 'in_transit') return 0;
          if (s === 'return_pending') return 1;
          if (s === 'ready_to_depart') return 2;
          if (s === 'confirmed' || s === 'planning' || s === 'approved') return 3;
          if (s === 'completed' || s === 'delivered') return 5;
          return 4;
        };
        const sortedData = [...data].sort((a, b) => {
          const pa = priorityRank(a.shipment_status);
          const pb = priorityRank(b.shipment_status);
          if (pa !== pb) return pa - pb;
          return Number(b.shipment_id) - Number(a.shipment_id);
        });
        setTrips(sortedData);
        if (sortedData.length > 0) {
          if (!keepSelected || !selectedIdRef.current) {
            const directMatch = urlShipmentId ? sortedData.find((item) => item.shipment_id === Number(urlShipmentId)) : null;
            if (directMatch) {
              setSelectedShipmentId(directMatch.shipment_id);
            } else {
              setSelectedShipmentId(sortedData[0].shipment_id);
            }
          }
        } else {
          setSelectedShipmentId(null);
          setTrackingDetails(null);
        }
      } catch (err: any) {
        console.warn('Could not fetch active trips from API:', err);
        setLoadError(
          err?.message ||
            tRef.current(
              'monitoring.errLoadTrips',
              language === 'en' ? 'Unable to load active monitoring trips.' : 'Không thể tải danh sách chuyến đi giám sát.'
            )
        );
      } finally {
        setLoading(false);
      }
    },
    [urlShipmentId, language]
  );

  const fetchTrackingDetails = useCallback(async (shipmentId: number, isSilent = false) => {
    try {
      if (!isSilent) setRefreshing(true);
      const [details, live, timelineRes] = await Promise.all([
        trackingApi.getTrackingDetails(shipmentId),
        trackingApi.getLiveTracking(shipmentId).catch(() => null),
        trackingApi.getShipmentTimeline(shipmentId).catch(() => null),
      ]);
      setTrackingDetails(details);
      if (live) setLiveTracking(live);
      if (timelineRes) {
        setTimelineItems(buildTimeline({ timelineData: timelineRes, viewer: 'manager', language }));
      }
    } catch {
      if (!isSilent) {
        toast.error(tRef.current('monitoring.errLoadDetails', 'Không thể tải dữ liệu chi tiết chuyến đi'));
      }
    } finally {
      setRefreshing(false);
    }
  }, [language]);

  const fetchFleetOverview = useCallback(async () => {
    try {
      setLoadingFleet(true);
      const items = await trackingApi.getLiveOverview();
      setFleetOverview(items);
    } catch (err) {
      console.warn('Could not load fleet overview', err);
    } finally {
      setLoadingFleet(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'fleet_overview') {
      void fetchFleetOverview();
    }
  }, [viewMode, fetchFleetOverview]);

  useEffect(() => {
    void fetchTrips(false);
  }, [fetchTrips]);

  useEffect(() => {
    if (selectedShipmentId) {
      void fetchTrackingDetails(selectedShipmentId, false);
    }
  }, [selectedShipmentId, fetchTrackingDetails]);

  // Polling every 15s to keep active shipment data fresh
  useEffect(() => {
    if (!selectedShipmentId) return;
    const interval = setInterval(() => {
      void fetchTrackingDetails(selectedShipmentId, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, fetchTrackingDetails]);

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return { time: '--:--', date: '--/--/----' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { time: '--:--', date: '--/--/----' };
    const locale = language === 'en' ? 'en-US' : 'vi-VN';
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  };

  const handleManualRefresh = async () => {
    if (viewMode === 'fleet_overview') {
      await fetchFleetOverview();
      toast.success(t('monitoring.refreshSuccess', 'Đã làm mới dữ liệu hành trình'));
      return;
    }
    if (selectedShipmentId) {
      await fetchTrackingDetails(selectedShipmentId, false);
      await fetchTrips(true);
      toast.success(t('monitoring.refreshSuccess', 'Đã làm mới dữ liệu hành trình'));
    } else {
      await fetchTrips(false);
    }
  };

  const handleExportCSV = () => {
    if (!trackingDetails) return;
    const csvCell = (val: unknown): string => {
      const s = String(val ?? '').replace(/"/g, '""');
      const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${neutralized}"`;
    };
    const rows = [
      ['Sequence', 'Milestone', 'Type', 'Status', 'Planned Time', 'Actual Time', 'Location'],
      ...trackingDetails.milestones.map((m, i) => [
        i + 1,
        m.title,
        m.legType || m.itemType,
        m.status,
        m.plannedTime || '',
        m.actualTime || '',
        m.location || '',
      ]),
    ];
    const csvString = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `journey-log-${trackingDetails.requestCode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t('monitoring.csvExportSuccess', 'Đã xuất báo cáo CSV cho chuyến {code}', { code: trackingDetails.requestCode }));
  };

  const closeOverrideModal = () => {
    if (isSubmittingOverride) return;
    setOverrideMilestone(null);
    setOverrideReasonCode('lost_signal');
    setOverrideNotes('');
  };

  const handleSubmitOverride = async () => {
    if (!overrideMilestone || !selectedShipmentId || isSubmittingOverride) return;
    const resolvedReason = reasonTextMap[overrideReasonCode];
    try {
      setIsSubmittingOverride(true);
      await trackingApi.coordinatorOverride(selectedShipmentId, {
        milestoneId: overrideMilestone.id,
        action: overrideAction as any,
        reason: resolvedReason,
        notes:
          overrideNotes.trim() ||
          (language === 'en' ? `Coordinator override (${resolvedReason})` : `Điều phối viên xác nhận (${resolvedReason})`),
      });
      toast.success(t('monitoring.overrideMilestoneSuccess', 'Đã cập nhật mốc "{title}" thay tài xế.', { title: overrideMilestone.title }));
      setOverrideMilestone(null);
      setOverrideReasonCode('lost_signal');
      setOverrideNotes('');
      await fetchTrackingDetails(selectedShipmentId, false);
    } catch (err: any) {
      toast.error(err?.message || t('monitoring.errUpdateMilestone', 'Không thể cập nhật mốc lộ trình'));
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const handleCompleteShipment = () => {
    if (!trackingDetails || !selectedShipmentId) return;
    setIsConfirmCompleteOpen(true);
  };

  const handleConfirmCompleteSubmit = async () => {
    if (!selectedShipmentId || isCompleting) return;
    try {
      setIsCompleting(true);
      await trackingApi.completeShipment(selectedShipmentId, {
        notes:
          language === 'en'
            ? 'The trip has arrived safely, completing the entire itinerary and customs/quarantine procedures.'
            : 'Chuyến đi đã cập bến an toàn, hoàn thành toàn bộ lộ trình và thủ tục hải quan/kiểm dịch.',
      });
      toast.success(t('monitoring.completeTripSuccess', 'Đã hoàn tất chuyến đi!'));
      setIsConfirmCompleteOpen(false);
      await fetchTrackingDetails(selectedShipmentId, false);
      await fetchTrips(true);
    } catch {
      toast.error(t('monitoring.errCompleteTrip', 'Không thể hoàn tất chuyến đi'));
    } finally {
      setIsCompleting(false);
    }
  };

  const rawTotalCount = trackingDetails?.milestones.length || 0;
  const rawCompletedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const timelineTotalCount = timelineItems.length;
  const timelineCompletedCount = timelineItems.filter((item) => item.status === 'done').length;
  const totalCount = rawTotalCount > 0 ? rawTotalCount : timelineTotalCount;
  const completedCount = rawTotalCount > 0 ? rawCompletedCount : timelineCompletedCount;
  const progressPct =
    totalCount > 0
      ? Math.round((completedCount / totalCount) * 100)
      : trackingDetails?.shipmentStatus === 'completed'
      ? 100
      : 0;
  const allMilestonesCompleted = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('monitoring.title', 'Giám sát Hành trình & Nhật ký Lộ trình')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('monitoring.subtitle', 'Theo dõi tiến độ các mốc lộ trình và hồ sơ sức khỏe ngựa.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing || loadingFleet}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing || loadingFleet ? 'animate-spin text-[#A67C2E]' : 'text-slate-600'} />
            <span>{refreshing || loadingFleet ? t('common.syncing', 'Đang đồng bộ...') : t('common.refresh', 'Làm mới')}</span>
          </Button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-slate-200 gap-2 pb-0">
        <button
          type="button"
          onClick={() => setViewMode('timeline')}
          className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            viewMode === 'timeline'
              ? 'border-[#A67C2E] text-[#181A17]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={14} />
          <span>{language === 'en' ? 'Route & Milestones' : 'Lộ trình & Mốc'}</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('live_map')}
          className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            viewMode === 'live_map'
              ? 'border-[#A67C2E] text-[#181A17]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin size={14} className="text-[#A67C2E]" />
          <span>{language === 'en' ? 'Live GPS Map' : 'Bản đồ xe trực tiếp'}</span>
          {liveTracking?.isSimulated && (
            <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-semibold border border-amber-300">
              SIM
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setViewMode('fleet_overview')}
          className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            viewMode === 'fleet_overview'
              ? 'border-[#A67C2E] text-[#181A17]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck size={14} className="text-slate-600" />
          <span>{language === 'en' ? 'Fleet Overview' : 'Toàn đội xe'}</span>
          {fleetOverview.length > 0 && (
            <span className="bg-slate-200 text-slate-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">
              {fleetOverview.length}
            </span>
          )}
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchTrips(false)}
            className="border-red-200 bg-white text-red-700 hover:bg-red-100 text-xs"
          >
            <RotateCcw size={13} className="mr-1" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw size={32} className="animate-spin text-[#A67C2E] mx-auto mb-3" />
          <p className="text-slate-600 font-semibold m-0">{t('monitoring.loadingTrips', 'Đang tải danh sách chuyến đi...')}</p>
        </div>
      ) : viewMode === 'fleet_overview' ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase">{language === 'en' ? 'Active Vehicles' : 'Xe Đang Hoạt Động'}</span>
                <div className="text-2xl font-black text-slate-900 mt-1">{fleetOverview.length}</div>
              </div>
              <Truck size={28} className="text-[#A67C2E]" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-700 font-semibold uppercase">{language === 'en' ? 'Amber Warnings' : 'Cảnh Báo Vàng'}</span>
                <div className="text-2xl font-black text-amber-600 mt-1">
                  {fleetOverview.filter((f) => f.alertTier === 'amber').length}
                </div>
              </div>
              <AlertTriangle size={28} className="text-amber-500" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-red-700 font-semibold uppercase">{language === 'en' ? 'Red Alerts' : 'Báo Động Đỏ'}</span>
                <div className="text-2xl font-black text-red-600 mt-1">
                  {fleetOverview.filter((f) => f.alertTier === 'red').length}
                </div>
              </div>
              <Heart size={28} className="text-red-500" />
            </div>
          </div>

          {fleetOverview.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <Truck size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-700 font-bold text-base m-0">
                {language === 'en' ? 'No active vehicle pings reported.' : 'Chưa có tọa độ nào được truyền từ xe đang hoạt động.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fleetOverview.map((item) => (
                <div
                  key={item.shipmentId}
                  className={`bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between gap-4 transition-all hover:shadow-md ${
                    item.alertTier === 'red'
                      ? 'border-red-400 bg-red-50/20'
                      : item.alertTier === 'amber'
                      ? 'border-amber-400 bg-amber-50/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#A67C2E] uppercase">{item.requestCode}</span>
                      <div className="flex items-center gap-1.5">
                        {item.isSimulated && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300">
                            SIM
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            item.alertTier === 'red'
                              ? 'bg-red-100 text-red-800'
                              : item.alertTier === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.alertTier}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 mt-1 mb-0">{item.customerName}</h3>
                    <p className="text-xs text-slate-500 mt-1 mb-0 flex items-center gap-2">
                      <span>{item.assignedVehicle || (item as any).vehiclePlate || '—'}</span>
                      <span>•</span>
                      <span>{item.assignedDriver || (item as any).driverName || '—'}</span>
                      <span>•</span>
                      <span>
                        {Number(item.horsesCount ?? 0)}{' '}
                        {language === 'en'
                          ? (Number(item.horsesCount ?? 0) === 1 ? 'horse' : 'horses')
                          : 'ngựa'}
                      </span>
                    </p>

                    {item.alertReason && (
                      <div className="mt-2.5 p-2 rounded bg-red-100/70 border border-red-200 text-xs font-semibold text-red-800 flex items-center gap-1.5">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>{item.alertReason}</span>
                      </div>
                    )}

                    {(item.currentPosition || item.latestPosition) && (
                      <div className="mt-2.5 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        <div>
                          {language === 'en' ? 'Position: ' : 'Vị trí: '}
                          <strong>
                            {(item.currentPosition?.lat ?? item.latestPosition?.lat ?? 0).toFixed(4)}, {(item.currentPosition?.lng ?? item.latestPosition?.lng ?? 0).toFixed(4)}
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {language === 'en' ? 'Speed: ' : 'Tốc độ: '}{' '}
                          {Math.round((item.currentPosition?.speedKmh ?? item.latestPosition?.speedKmh ?? 0))} km/h
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedShipmentId(item.shipmentId);
                      setViewMode('live_map');
                    }}
                    className="w-full text-xs font-bold"
                  >
                    <MapPin size={13} className="mr-1 text-[#A67C2E]" />
                    {language === 'en' ? 'Track on Map' : 'Theo dõi trên bản đồ'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Truck size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-lg m-0">{t('monitoring.noTrips', 'Chưa có chuyến đi nào sẵn sàng hoặc đang vận chuyển')}</p>
          <p className="text-slate-500 text-sm mt-1 mb-0">
            {t('monitoring.noTripsDesc', 'Các chuyến đi ở trạng thái Sẵn sàng xuất phát hoặc Đang di chuyển sẽ hiển thị tại đây.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Active Telemetry Data (2 Cols) */}
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            {viewMode === 'live_map' && (
              liveTracking ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 m-0">
                        {language === 'en' ? 'Live Telemetry & Geofence Map' : 'Bản Đồ Định Vị GPS & Trạm Dừng'}
                      </h3>
                      {liveTracking.isSimulated && (
                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded border border-amber-300">
                          {language === 'en' ? 'SIMULATION' : 'GIẢ LẬP'}
                        </span>
                      )}
                    </div>
                    {(liveTracking.currentPosition || liveTracking.vehiclePosition) && (
                      <span className="text-xs text-slate-500">
                        {language === 'en' ? 'Speed: ' : 'Vận tốc: '}
                        <strong className="text-slate-800">
                          {Math.round(
                            (liveTracking.currentPosition || liveTracking.vehiclePosition)?.speedKmh || 0,
                          )}{' '}
                          km/h
                        </strong>
                      </span>
                    )}
                  </div>
                  <LiveTrackingMap
                    key={selectedShipmentId ?? 'map'}
                    liveData={{
                      ...liveTracking,
                      progressPct,
                      progress: liveTracking.progress
                        ? { ...liveTracking.progress, percent: progressPct }
                        : { percent: progressPct },
                    }}
                    height="440px"
                    autoCenter
                  />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-dashed border-[#D8CEBE] p-8 text-center text-sm text-[#5C6658]">
                  <MapPin size={28} className="mx-auto text-[#A67C2E] mb-2" />
                  <p className="font-bold text-[#181A17] m-0">
                    {language === 'en'
                      ? 'No live GPS coordinates available for this trip yet'
                      : 'Chuyến đi này chưa có dữ liệu tọa độ GPS trực tuyến'}
                  </p>
                  <p className="text-xs text-[#5C6658] mt-1 mb-0">
                    {language === 'en'
                      ? 'Coordinates will appear automatically once the driver starts transmitting location pings.'
                      : 'Vị trí xe sẽ hiển thị tự động ngay khi tài xế bắt đầu gửi tín hiệu định vị trên đường.'}
                  </p>
                </div>
              )
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-[#A67C2E] uppercase tracking-wider">
                      {trackingDetails?.requestCode || 'TR-2026-F4'}
                    </span>
                    {trackingDetails?.requestTitle && (
                      <span className="text-xs font-semibold text-slate-500">
                        • {trackingDetails.requestTitle}
                      </span>
                    )}
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
                    <span className="text-xs text-slate-400">
                      {t('monitoring.customerLabel', 'Khách hàng:')} <strong>{trackingDetails?.customerName}</strong>
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 mt-1.5 m-0 flex flex-wrap items-center gap-2">
                    <span>{(trackingDetails?.origin || '').split(',')[0] || '—'}</span>
                    <span className="text-slate-400 font-normal">→</span>
                    <span>{(trackingDetails?.destination || '').split(',')[0] || '—'}</span>
                  </h2>

                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 mt-2.5">
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Truck size={13} className="text-slate-500 shrink-0" />
                      {t('monitoring.vehicleLabel', 'Phương tiện:')}{' '}
                      <strong>{trackingDetails?.assignedVehicle || t('common.unassigned', 'Chưa gán')}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <UserCheck size={13} className="text-[#A67C2E] shrink-0" />
                      {t('monitoring.driverLabel', 'Tài xế:')}{' '}
                      <strong>{trackingDetails?.assignedDriver || t('common.unassigned', 'Chưa gán')}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Heart size={13} className="text-red-500 shrink-0" />
                      {t('monitoring.escortLabel', 'Áp tải / Thú y:')}{' '}
                      <strong>{trackingDetails?.assignedEscort || t('common.unassigned', 'Chưa gán')}</strong>
                    </span>
                  </div>

                  {trackingDetails?.assignedHorses && trackingDetails.assignedHorses.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">{t('monitoring.racehorsesLabel', 'Ngựa thi đấu:')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {trackingDetails.assignedHorses.map((h) => (
                          <span
                            key={h.id}
                            className="bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold px-2 py-0.5 rounded"
                          >
                            🏇 {h.name} {h.microchipNo ? `(${h.microchipNo})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="sm:text-right shrink-0 flex flex-col sm:items-end gap-1.5">
                  <div className="bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5">
                    <Activity size={14} className="text-[#A67C2E]" />
                    <span>{t('monitoring.routeDistance', 'Lộ trình: {dist} km', { dist: trackingDetails?.totalDistanceKm || 0 })}</span>
                  </div>
                  <div className="text-xs text-slate-600 font-semibold">
                    {t('monitoring.completedMilestones', 'Tiến độ:')} <strong>{completedCount}/{totalCount}</strong> ({progressPct}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Milestones Timeline (Step 11 Vertical Timeline) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Truck size={18} className="text-[#A67C2E]" />
                    {t('monitoring.legsCheckpointsTitle', 'Lộ trình & Các mốc kiểm soát')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    {t('monitoring.legsCheckpointsDesc', 'Điều phối viên có thể cập nhật thay tài xế nếu mất tín hiệu hoặc nhận tin qua điện thoại/bộ đàm.')}
                  </p>
                </div>
              </div>

              <VerticalTimeline
                items={timelineItems}
                viewer="manager"
                emptyText={t('monitoring.noMilestones', 'Chưa có mốc kiểm soát nào.')}
                renderCurrentActions={(item) => {
                  const m =
                    (item.milestoneId
                      ? trackingDetails?.milestones.find((x) => x.id === item.milestoneId)
                      : null) ||
                    trackingDetails?.milestones.find(
                      (x) => String(x.id) === item.id || x.title === item.title,
                    ) ||
                    trackingDetails?.milestones.find((x) => x.status === 'CURRENT');

                  if (!m) return null;

                  return (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setOverrideMilestone(m);
                          const firstAllowed = m.allowedActions?.[0];
                          if (m.itemType === 'leg_start') setOverrideAction('start_leg');
                          else if (m.itemType === 'leg_end') setOverrideAction('complete_leg');
                          else if (firstAllowed === 'clear_customs') setOverrideAction('customs_cleared');
                          else if (firstAllowed === 'depart_stop') setOverrideAction('departed');
                          else setOverrideAction('arrived');
                          setOverrideReasonCode('lost_signal');
                          setOverrideNotes('');
                        }}
                        className="text-[#181A17] border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-xs font-bold cursor-pointer"
                      >
                        <Edit3 size={13} className="mr-1.5 text-[#A67C2E]" />
                        <span>{t('monitoring.overrideDriverBtn', 'Cập nhật thay Driver')}</span>
                      </Button>
                    </div>
                  );
                }}
              />
            </div>

            {/* Equine Health Monitor Stream */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Heart size={18} className="text-red-500" />
                    {t('monitoring.equineVitalTitle', 'Nhật ký Thể trạng & Sinh trắc học Ngựa')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    {t('monitoring.equineVitalSubtitle', 'Ghi nhận bởi Chuyên viên áp tải / Bác sĩ thú y trong suốt quá trình vận chuyển.')}
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
                  {t('monitoring.recordsCount', '{count} bản ghi', { count: trackingDetails?.healthLogs.length || 0 })}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {!trackingDetails || trackingDetails.healthLogs.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 m-0">
                    {t('monitoring.noHealthLogs', 'Chưa có nhật ký sức khỏe nào được nhân viên áp tải gửi lên cho chuyến đi này.')}
                  </p>
                ) : (
                  trackingDetails.healthLogs.map((log) => {
                    const isAlert = log.conditionStatus === 'not_eating' || log.conditionStatus === 'stressed';

                    return (
                      <div
                        key={log.id}
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs ${
                          isAlert ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isAlert ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                            }`}
                          >
                            <Heart size={18} />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900">{log.horseName}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.conditionStatus === 'stable'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {translateCondition(log.conditionStatus)}
                              </span>
                              {log.legName && (
                                <span className="bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                  <MapPin size={10} className="text-[#A67C2E] shrink-0" />
                                  <span>{log.legName}</span>
                                </span>
                              )}
                              {isAlert && (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                                  ⚠️ {t('monitoring.needsAttention', 'Cần chú ý')}
                                </span>
                              )}
                            </div>

                            <p className="text-slate-700 mt-1 m-0 font-medium">
                              {log.notes || t('monitoring.normalCondition', 'Thể trạng bình thường, ổn định.')}
                            </p>

                            <div className="text-[11px] text-slate-500 mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span>
                                {t('monitoring.recordedBy', 'Ghi bởi: {name} ({role})', {
                                  name: log.recordedByName || t('role.escort', 'Bác sĩ thú y'),
                                  role: translateRole(log.recordedByRole),
                                })}
                              </span>
                              <span className="text-slate-300">•</span>
                              {(() => {
                                const { time, date } = formatDateTime(log.recordedAt);
                                return (
                                  <span className="inline-flex items-center gap-1 text-slate-600">
                                    <Clock size={11} className="text-slate-400" />
                                    <strong>{time}</strong>
                                    <span className="text-slate-300">•</span>
                                    <span>{t('monitoring.datePrefix', 'Ngày {date}', { date })}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="sm:text-right shrink-0 bg-white sm:bg-transparent p-2 sm:p-0 rounded border sm:border-0 border-slate-200">
                          <span className="font-extrabold text-slate-900 text-sm block">
                            {log.temperatureC ? `${log.temperatureC}°C` : '--'} • {log.heartRateBpm ? `${log.heartRateBpm} bpm` : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: Active Fleet Quick Switcher */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col gap-4 h-fit">
            <div>
              <h3 className="text-base font-bold text-slate-900 m-0">
                {t('monitoring.tripsListTitle', 'Danh sách Chuyến đi')}
              </h3>
              <p className="text-xs text-slate-500 mt-1 mb-0">
                {t('monitoring.tripsListSubtitle', 'Chọn chuyến đi để theo dõi mốc lộ trình và nhật ký sức khỏe tương ứng.')}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {trips.map((trip) => {
                const isSelected = trip.shipment_id === selectedShipmentId;

                return (
                  <button
                    type="button"
                    key={trip.shipment_id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedShipmentId(trip.shipment_id);
                      toast.success(t('monitoring.switchedToTrip', 'Đã chuyển sang chuyến {code}', { code: trip.request_code }));
                    }}
                    className={`w-full text-left p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#A67C2E] bg-[#FAF5EB] shadow-sm ring-1 ring-[#A67C2E]/25'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <span className="text-xs font-black text-[#181A17]">{trip.request_code}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                          isSelected
                            ? 'bg-[#181A17] text-[#C4B38E]'
                            : trip.shipment_status === 'in_transit'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isSelected ? t('monitoring.viewingStatus', 'Đang xem') : translateStatus(trip.shipment_status)}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 m-0">
                      {trip.request_title ||
                        trip.route_name ||
                        `${(trip.origin_location || '').split(',')[0] || '—'} → ${(trip.destination_location || '').split(',')[0] || '—'}`}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mt-2">
                      <span>{t('monitoring.clientPrefix', 'Khách: {name}', { name: trip.contact_name })}</span>
                      <span>
                        {trip.requested_horse_count || 1}{' '}
                        {language === 'en'
                          ? (trip.requested_horse_count || 1) === 1
                            ? 'horse'
                            : 'horses'
                          : 'ngựa'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Coordinator Override */}
      <Modal
        isOpen={Boolean(overrideMilestone)}
        onClose={closeOverrideModal}
        closeDisabled={isSubmittingOverride}
        title={t('monitoring.overrideModalTitle', 'Cập nhật mốc thay tài xế')}
        maxWidth="520px"
      >
        {overrideMilestone && (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-[#FAF8F4] border border-[#EAE5DA] rounded-xl text-xs text-[#181A17]">
              <p className="font-bold m-0">{t('monitoring.milestoneLabel', 'Mốc: {title}', { title: overrideMilestone.title })}</p>
              <p className="text-[#181A17] mt-0.5 m-0">{t('monitoring.locationLabel', 'Vị trí: {loc}', { loc: overrideMilestone.location })}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="mon-override-action" className="text-xs font-bold text-slate-700 block mb-1">
                  {t('monitoring.updateActionLabel', 'Hành động cập nhật:')}
                </label>
                <select
                  id="mon-override-action"
                  value={overrideAction}
                  onChange={(e) => setOverrideAction(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-[#C4B38E]"
                >
                  {overrideMilestone.itemType === 'leg_start' ? (
                    <option value="start_leg">{t('monitoring.actionStartLeg', 'Khởi hành chặng')}</option>
                  ) : overrideMilestone.itemType === 'leg_end' ? (
                    <option value="complete_leg">{t('monitoring.actionCompleteLeg', 'Hoàn tất chặng')}</option>
                  ) : (
                    <>
                      <option value="arrived">{t('monitoring.actionArriveStop', 'Đến trạm kiểm soát')}</option>
                      {overrideMilestone.isCustomsBorder && (
                        <option value="customs_cleared">
                          {language === 'en' ? 'Customs & Quarantine Cleared' : 'Hoàn tất thông quan & kiểm dịch'}
                        </option>
                      )}
                      <option value="departed">{t('monitoring.actionDepartStop', 'Rời trạm kiểm soát')}</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="mon-override-reason" className="text-xs font-bold text-slate-700 block mb-1">
                  {t('monitoring.interventionReasonLabel', 'Lý do can thiệp:')}
                </label>
                <select
                  id="mon-override-reason"
                  value={overrideReasonCode}
                  onChange={(e) => setOverrideReasonCode(e.target.value as OverrideReasonCode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-[#C4B38E]"
                >
                  <option value="lost_signal">{t('monitoring.reasonLost4G', 'Tài xế mất sóng 4G, xác nhận qua bộ đàm')}</option>
                  <option value="battery_depleted">{t('monitoring.reasonDepletedBattery', 'Tài xế hết pin điện thoại, gọi từ trạm dừng chân')}</option>
                  <option value="customs_confirmed">{t('monitoring.reasonCustomsClearance', 'Cửa khẩu xác nhận thông quan trực tiếp cho điều phối')}</option>
                  <option value="special_dispatch">{t('monitoring.reasonSpecialDispatch', 'Lý do nghiệp vụ điều phối đặc biệt khác')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="mon-override-notes" className="text-xs font-bold text-slate-700 block mb-1">
                  {t('monitoring.additionalNotesLabel', 'Ghi chú bổ sung (tùy chọn):')}
                </label>
                <textarea
                  id="mon-override-notes"
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder={t('monitoring.additionalNotesPlaceholder', 'Nhập chi tiết ghi nhận từ tài xế hoặc hải quan...')}
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:border-[#C4B38E]"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeOverrideModal}
                disabled={isSubmittingOverride}
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#181A17] hover:bg-[#242722] text-white font-bold"
                onClick={() => void handleSubmitOverride()}
                disabled={isSubmittingOverride}
              >
                {isSubmittingOverride ? t('common.saving', 'Đang lưu...') : t('monitoring.confirmUpdateBtn', 'Xác nhận cập nhật')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function TripMonitoringPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">{t('monitoring.loadingDispatchCenter', 'Đang tải Trung tâm Điều hành Vận chuyển...')}</div>}>
      <TripMonitoringContent />
    </Suspense>
  );
}
