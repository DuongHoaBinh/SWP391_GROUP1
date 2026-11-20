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
} from '@/features/tracking/api/tracking.api';
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
        setTrips(data);
        if (data.length > 0) {
          if (!keepSelected || !selectedIdRef.current) {
            const directMatch = urlShipmentId ? data.find((item) => item.shipment_id === Number(urlShipmentId)) : null;
            if (directMatch) {
              setSelectedShipmentId(directMatch.shipment_id);
            } else {
              setSelectedShipmentId(data[0].shipment_id);
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
      const details = await trackingApi.getTrackingDetails(shipmentId);
      setTrackingDetails(details);
    } catch {
      if (!isSilent) {
        toast.error(tRef.current('monitoring.errLoadDetails', 'Không thể tải dữ liệu chi tiết chuyến đi'));
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  const totalCount = trackingDetails?.milestones.length || 0;
  const completedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allMilestonesCompleted = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('monitoring.title', 'Giám sát Hành trình & Nhật ký Lộ trình')}
            </h1>
            <span className="text-xs font-bold text-[#181A17] bg-[#FAF8F4] border border-[#EAE5DA] px-2.5 py-0.5 rounded-full">
              Coordinator Control
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t('monitoring.subtitle', 'Theo dõi vị trí suy diễn từ các mốc lộ trình và hồ sơ sinh trắc học ngựa.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#A67C2E]' : 'text-slate-600'} />
            <span>{refreshing ? t('common.syncing', 'Đang đồng bộ...') : t('common.refresh', 'Làm mới')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowIncidentModal(true)}
            className="text-red-700 border-red-200 bg-red-50 hover:bg-red-100 font-bold"
          >
            <AlertTriangle size={15} className="mr-1.5 text-red-600" /> {t('incidents.reportIncident', 'Báo sự cố')}
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={handleExportCSV} disabled={!trackingDetails}>
            <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600" /> {t('common.exportCSV', 'Xuất CSV')}
          </Button>
        </div>
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
                      <strong>{trackingDetails?.assignedVehicle || t('monitoring.dedicatedTruck', 'Xe thùng chuyên dụng điều hòa')}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <UserCheck size={13} className="text-[#A67C2E] shrink-0" />
                      {t('monitoring.driverLabel', 'Tài xế:')}{' '}
                      <strong>{trackingDetails?.assignedDriver || t('monitoring.assigned', 'Đã phân công')}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Heart size={13} className="text-red-500 shrink-0" />
                      {t('monitoring.escortLabel', 'Áp tải / Thú y:')}{' '}
                      <strong>{trackingDetails?.assignedEscort || t('monitoring.vetSpecialist', 'Chuyên viên thú y')}</strong>
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

                <div className="sm:text-right shrink-0">
                  <div className="bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5">
                    <Activity size={14} className="text-[#A67C2E]" />
                    <span>{t('monitoring.routeDistance', 'Lộ trình: {dist} km', { dist: trackingDetails?.totalDistanceKm || 0 })}</span>
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    {t('monitoring.updatedAt', 'Cập nhật: {time}', { time: nowFormatted })}
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Derived GPS Radar Banner */}
            <div className="bg-slate-900 rounded-xl p-5 sm:p-8 text-white flex flex-col justify-between shadow-lg relative overflow-hidden min-h-[220px]">
              <div className="relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block shrink-0" />
                    {t('monitoring.currentInferredLocation', 'Vị trí hiện tại (Suy diễn từ mốc cập nhật gần nhất)')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {t('monitoring.completedMilestones', 'Mốc đã hoàn thành:')} <strong className="text-white">{completedCount} / {totalCount}</strong> ({progressPct}%)
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mt-2 mb-2 text-white flex items-center gap-2">
                  <MapPin size={22} className="text-emerald-400 shrink-0" />
                  <span>{trackingDetails?.currentMilestone || translateStatus('ready_to_depart')}</span>
                </h3>
                <p className="text-sm text-slate-400 flex items-center gap-2 m-0">
                  <Clock size={16} className="shrink-0" /> {t('monitoring.etaLabel', 'Dự kiến đến đích:')}{' '}
                  <strong className="text-emerald-300">
                    {trackingDetails?.eta
                      ? (Number.isNaN(Date.parse(trackingDetails.eta))
                          ? trackingDetails.eta
                          : new Date(trackingDetails.eta).toLocaleString('vi-VN'))
                      : t('monitoring.onSchedule', 'Đúng tiến độ')}
                  </strong>
                </p>
              </div>

              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-[#A67C2E] h-full transition-all duration-500"
                  style={{ width: `${Math.max(8, progressPct)}%` }}
                />
              </div>

              {/* Waypoint Grid */}
              <div className="relative z-10 mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {trackingDetails?.milestones.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                        : m.status === 'CURRENT'
                        ? 'bg-[#181A17]/80 border-[#A67C2E] text-[#FAF8F4] ring-2 ring-[#C4B38E]/50'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-[10px]">#{idx + 1}</span>
                      <span className="text-[10px] font-bold">
                        {m.status === 'COMPLETED'
                          ? t('monitoring.milestoneCompleted', '✓ Đã qua')
                          : m.status === 'CURRENT'
                          ? t('monitoring.milestoneCurrent', '● Hiện tại')
                          : t('monitoring.milestonePending', 'Chờ')}
                      </span>
                    </div>
                    <span className="font-semibold truncate">{m.title}</span>
                    <span className="text-[10px] text-slate-400 truncate mt-0.5">{m.location}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Milestones Timeline */}
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
                {allMilestonesCompleted && trackingDetails?.shipmentStatus !== 'completed' && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0"
                    onClick={handleCompleteShipment}
                  >
                    <CheckCircle2 size={16} className="mr-1.5" />
                    <span>{t('monitoring.completeTripBtn', 'Hoàn tất chuyến đi')}</span>
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {trackingDetails?.milestones.map((m, idx) => {
                  const isCurrent = m.status === 'CURRENT';
                  const isCompleted = m.status === 'COMPLETED';

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-[#FAF5EB] border-[#D4C5A3] shadow-sm'
                          : isCompleted
                          ? 'bg-slate-50/80 border-slate-200'
                          : 'bg-white border-slate-200 opacity-85'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                ? 'bg-[#181A17] text-white animate-pulse'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isCompleted ? <Check size={15} /> : idx + 1}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">{m.title}</span>
                              {m.legType === 'flight' ? (
                                <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                  <Plane size={11} /> {t('monitoring.flightLeg', 'Chặng bay')}
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                  <Truck size={11} /> {t('monitoring.roadLeg', 'Đường bộ')}
                                </span>
                              )}
                              {m.isCustomsBorder && (
                                <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded">
                                  {t('monitoring.customsQuarantine', 'Kiểm dịch & Hải quan')}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isCurrent
                                    ? 'bg-[#F3EFE4] text-[#181A17] font-extrabold'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isCompleted ? translateStatus('completed') : isCurrent ? translateStatus('in_transit') : translateStatus('ready_to_depart')}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 m-0">
                              <MapPin size={12} className="text-slate-400 shrink-0" /> {m.location}
                            </p>

                            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 mt-2">
                              {m.plannedTime && (() => {
                                const { time, date } = formatDateTime(m.plannedTime);
                                return (
                                  <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                                    <Clock size={11} className="text-slate-400 shrink-0" />
                                    <span>{t('monitoring.plannedLabel', 'Kế hoạch:')}</span>
                                    <strong className="text-slate-900">{time}</strong>
                                    <span className="text-slate-300">•</span>
                                    <span>{t('monitoring.datePrefix', 'Ngày {date}', { date })}</span>
                                  </span>
                                );
                              })()}
                              {m.actualTime && (() => {
                                const { time, date } = formatDateTime(m.actualTime);
                                return (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-200">
                                    <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                                    <span>{t('monitoring.actualLabel', 'Thực tế:')}</span>
                                    <strong className="text-emerald-950 font-bold">{time}</strong>
                                    <span className="text-emerald-300">•</span>
                                    <span>{t('monitoring.datePrefix', 'Ngày {date}', { date })}</span>
                                  </span>
                                );
                              })()}
                              {m.updatedBy && (
                                <span className="text-[#181A17] bg-[#FAF8F4] px-2 py-0.5 rounded font-medium text-[11px]">
                                  {m.updatedBy}
                                </span>
                              )}
                            </div>

                            {m.notes && (
                              <div className="mt-2.5 bg-amber-50/90 border border-amber-200/90 rounded-lg p-2.5 text-xs text-amber-950 flex items-start gap-2 shadow-sm">
                                <FileText size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <span className="font-bold text-amber-800 text-[11px] uppercase tracking-wide block">
                                    {t('monitoring.fieldObservationNotes', 'Ghi chú thực địa:')}
                                  </span>
                                  <p className="mt-0.5 m-0 text-slate-800 font-medium italic">
                                    &ldquo;{m.notes}&rdquo;
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {!isCompleted && (
                          <div className="shrink-0 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setOverrideMilestone(m);
                                if (m.itemType === 'leg_start') setOverrideAction('start_leg');
                                else if (m.itemType === 'leg_end') setOverrideAction('complete_leg');
                                else setOverrideAction('arrived');
                                setOverrideReasonCode('lost_signal');
                                setOverrideNotes('');
                              }}
                              className="text-[#181A17] border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-xs font-bold"
                            >
                              <Edit3 size={13} className="mr-1.5 text-[#A67C2E]" />
                              <span>{t('monitoring.overrideDriverBtn', 'Cập nhật thay Driver')}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                          <span className="text-[10px] text-emerald-600 font-bold">
                            {t('monitoring.temperatureLabel', 'Thân nhiệt: {status}', {
                              status: log.temperatureC && log.temperatureC <= 38.5 ? t('monitoring.tempNormal', 'Bình thường') : t('monitoring.tempMonitor', 'Theo dõi'),
                            })}
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
                {t('monitoring.tripsListSubtitle', 'Chọn chuyến đi để theo dõi dòng telemetry và mốc lộ trình tương ứng.')}
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
                      <span>{t('common.horsesCount', '{count} ngựa', { count: trip.requested_horse_count || 1 })}</span>
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

      {/* Modal 2: Confirm Complete Trip */}
      <Modal
        isOpen={isConfirmCompleteOpen && Boolean(trackingDetails)}
        onClose={() => {
          if (!isCompleting) setIsConfirmCompleteOpen(false);
        }}
        closeDisabled={isCompleting}
        title={t('monitoring.modalCompleteTripTitle', 'Xác Nhận Hoàn Tất Chuyến Đi')}
        maxWidth="460px"
      >
        {trackingDetails && (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
              <p className="font-bold m-0">{t('monitoring.modalBillOfLading', 'Mã vận đơn: {code}', { code: trackingDetails.requestCode })}</p>
              <p className="mt-1 m-0">
                {(trackingDetails.origin || '').split(',')[0]} → {(trackingDetails.destination || '').split(',')[0]}
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed m-0">
              {t('monitoring.modalCompleteTripDesc', 'Xác nhận rằng phương tiện đã đến điểm đích an toàn, tất cả ngựa đua đã được bàn giao cho người nhận và các thủ tục pháp lý/kiểm dịch đã hoàn tất.')}
            </p>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmCompleteOpen(false)}
                disabled={isCompleting}
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleConfirmCompleteSubmit()}
                disabled={isCompleting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isCompleting ? t('common.updating', 'Đang cập nhật...') : t('monitoring.btnConfirmComplete', 'Xác nhận hoàn tất')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 3: Emergency Incident & Reroute Dispatch */}
      <Modal
        isOpen={showIncidentModal}
        onClose={() => setShowIncidentModal(false)}
        title={t('monitoring.reportIncidentTitle', 'Báo cáo Sự cố Lộ trình')}
        maxWidth="480px"
      >
        <div className="flex flex-col gap-4">
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
            <p className="font-bold m-0 flex items-center gap-1.5">
              <AlertTriangle size={15} className="text-red-600 shrink-0" />
              {t('monitoring.rescueCenterTitle', 'Trung tâm Điều phối Cứu hộ Khẩn cấp')}
            </p>
            <p className="mt-1.5 m-0">
              {t('monitoring.rescueBody1', 'Tính năng xử lý biến cố lộ trình (đổi tuyến xe, chuyển viện thú y khẩn cấp, chuyến bay trễ).')}
            </p>
          </div>

          <p className="text-xs text-slate-600 m-0 leading-relaxed">
            {t('monitoring.rescueBody2', 'Hiện tại, nếu ngựa có dấu hiệu mệt mỏi, stress hoặc bỏ ăn, hệ thống đã tự động gửi cảnh báo cho Điều phối viên và Khách hàng để theo dõi sát.')}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              {selectedShipmentId && (
                <Link
                  href={`/coordinator/routes?shipmentId=${selectedShipmentId}`}
                  onClick={() => setShowIncidentModal(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E] text-xs font-bold no-underline"
                >
                  <span>{language === 'en' ? 'Reroute / Adjust Legs' : 'Hiệu chỉnh lộ trình'}</span>
                  <ArrowRight size={13} />
                </Link>
              )}
              <Link
                href="/coordinator/alerts"
                onClick={() => setShowIncidentModal(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#181A17] text-xs font-bold no-underline"
              >
                <span>{language === 'en' ? 'Open Ops Alerts' : 'Mở Cảnh báo Vận hành'}</span>
              </Link>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowIncidentModal(false)}>
              {t('common.close', 'Đóng')}
            </Button>
          </div>
        </div>
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
