'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Thermometer,
  Wind,
  ShieldCheck,
  MapPin,
  Clock,
  Heart,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Activity,
  Plane,
  RefreshCw,
  Edit3,
  Check,
  X,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import {
  trackingApi,
  TripTrackingDetails,
  AssignedTripSummary,
  TrackingMilestoneItem,
} from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';
import { useTracking } from '@/features/tracking/useTracking';
import { TrackingLoadState } from '@/features/tracking/components/TrackingLoadState';
import { JourneyHistory } from '@/features/tracking/components/JourneyHistory';
import { TrackingTelemetry } from '@/features/tracking/components/TrackingTelemetry';
import { HealthLogHistory } from '@/features/tracking/components/HealthLogHistory';


export default function TripMonitoringPage() {
  const { t, translateStatus } = useTranslation();

  const { trips, selectedShipmentId, setSelectedShipmentId, trackingDetails, loading, refreshing, detailLoading, error: trackingError, refresh, refreshTrips } = useTracking();
  const fetchTrackingDetails = async (_id: number) => { await refresh(); };
  const fetchTrips = async (_keep = true) => { await refreshTrips(); };
  // Coordinator Override Modal State
  const [overrideMilestone, setOverrideMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [overrideAction, setOverrideAction] = useState<string>('arrive_stop');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState<boolean>(false);

  useEffect(() => { setOverrideMilestone(null); setOverrideReason(''); setOverrideNotes(''); }, [selectedShipmentId]);

  // Flow 5 Incident Modal Placeholder
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);

  const handleManualRefresh = async () => {
    if (selectedShipmentId) {
      await fetchTrackingDetails(selectedShipmentId);
    }
  };

  const handleExportCSV = () => {
    if (!trackingDetails) return;
    const header = 'Type,Milestone,Location,Planned,Actual,Status,UpdatedBy\n';
    const cell = (value: string) => '"' + (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
    const rows = trackingDetails.milestones.map(m => [m.itemType, m.title, m.location, m.plannedTime ?? '', m.actualTime ?? '', m.status, m.updatedBy ?? ''].map(cell).join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `telemetry_${trackingDetails.requestCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất báo cáo CSV cho chuyến ${trackingDetails.requestCode}`);
  };

  // Submit Coordinator Override
  const handleSubmitOverride = async () => {
    if (!trackingDetails || !overrideMilestone || !overrideReason.trim()) { toast.error('Vui lòng chọn lý do can thiệp'); return; }
    if (!trackingDetails.milestones.some(m => m.id === overrideMilestone.id && m.allowedActions.includes(overrideAction))) { toast.error('Mốc đã thay đổi. Vui lòng tải lại.'); return; }

    try {
      setIsSubmittingOverride(true);
      await trackingApi.coordinatorOverride(trackingDetails.shipmentId, {
        milestoneId: overrideMilestone.id,
        action: overrideAction,
        notes: overrideNotes || `Điều phối viên xác nhận (${overrideReason})`,
        reason: overrideReason,
      });

      toast.success(`Đã cập nhật mốc "${overrideMilestone.title}" thay tài xế.`);
      setOverrideMilestone(null);
      setOverrideNotes('');
      await fetchTrackingDetails(trackingDetails.shipmentId);
      await fetchTrips(true);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể cập nhật mốc lộ trình');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const completedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalCount = trackingDetails?.milestones.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              {t('nav.monitoring', 'Giám sát Hành trình & Nhật ký Lộ trình (Flow 4)')}
            </h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              Coordinator Control
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi mốc hành trình và số đo do tổ vận hành cập nhật; tự đồng bộ mỗi 5 giây.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            aria-label="Làm mới hành trình" disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            <span>{refreshing ? 'Đang đồng bộ...' : 'Làm mới'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowIncidentModal(true)}
            className="text-red-700 border-red-200 bg-red-50 hover:bg-red-100 font-bold"
          >
            <AlertTriangle size={15} className="mr-1.5 text-red-600" /> Liên hệ khi có sự cố
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!trackingDetails}>
            <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600" /> Xuất CSV
          </Button>
        </div>
      </div>

      <TrackingLoadState loading={false} error={trackingError} retry={refresh} />
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">Đang tải danh sách chuyến đi...</p>
        </div>
      ) : trackingError && !trips.length ? null : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Truck size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-lg">Chưa có chuyến đi nào sẵn sàng hoặc đang vận chuyển</p>
          <p className="text-slate-500 text-sm mt-1">
            Các chuyến đi ở trạng thái Sẵn sàng xuất phát (ready_to_depart) hoặc Đang di chuyển sẽ hiển thị tại đây.
          </p>
        </div>
      ) : (
        /* Main Grid: Telemetry & Sidebar */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Active Telemetry Data (2 Cols) */}
          <div className="min-w-0 lg:col-span-2 flex flex-col gap-6">
            {!trackingDetails ? <TrackingLoadState loading={detailLoading && !trackingError} retry={refresh} /> : <>
            {/* Active Trip Telemetry Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-blue-600 uppercase tracking-wider">
                      {trackingDetails?.requestCode || 'Chưa chọn chuyến'}
                    </span>
                    {trackingDetails?.requestTitle && (
                      <span className="text-xs font-semibold text-slate-500">
                        • {trackingDetails.requestTitle}
                      </span>
                    )}
                    <StatusBadge
                      label={translateStatus(trackingDetails?.shipmentStatus || 'unknown')}
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
                      Khách hàng: <strong>{trackingDetails?.customerName}</strong>
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 mt-1.5 m-0 flex flex-wrap items-center gap-2">
                    <span>{trackingDetails?.origin.split(',')[0]}</span>
                    <span className="text-slate-400 font-normal">→</span>
                    <span>{trackingDetails?.destination.split(',')[0]}</span>
                  </h2>

                  {/* Transport Crew & Vehicle Summary */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-2">
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Truck size={13} className="text-slate-500" />
                      Phương tiện: <strong>{trackingDetails?.assignedVehicle || 'Chưa phân công'}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <UserCheck size={13} className="text-blue-600" />
                      Tài xế: <strong>{trackingDetails?.assignedDriver || 'Chưa phân công'}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Heart size={13} className="text-red-500" />
                      Áp tải/Thú y: <strong>{trackingDetails?.assignedEscort || 'Chưa phân công'}</strong>
                    </span>
                  </div>

                  {/* Assigned Horses Badges */}
                  {trackingDetails?.assignedHorses && trackingDetails.assignedHorses.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Ngựa thi đấu:</span>
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

                <div className="text-right shrink-0">
                  <div className="bg-blue-50 text-blue-900 border border-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5">
                    <Activity size={14} className="text-blue-600" />
                    <span>Lộ trình: {trackingDetails?.totalDistanceKm == null ? 'Chưa có khoảng cách' : `${trackingDetails.totalDistanceKm} km`}</span>
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Cập nhật: {new Date(trackingDetails?.lastUpdated || Date.now()).toLocaleTimeString('vi-VN')}
                  </span>
                </div>
              </div>

              <TrackingTelemetry details={trackingDetails} />
          <JourneyHistory details={trackingDetails} />
            </div>

            {/* Simulated Derived GPS Radar Banner */}
            <div className="bg-slate-900 rounded-xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-lg relative overflow-hidden min-h-[220px]">
              <div className="relative z-10">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Mốc hành trình ghi nhận gần nhất
                  </span>
                  <span className="text-xs text-slate-400">
                    Mốc đã hoàn thành: <strong className="text-white">{completedCount} / {totalCount}</strong> ({progressPct}%)
                  </span>
                </div>
                <h3 className="text-2xl font-bold mt-2 mb-2 text-white flex items-center gap-2">
                  <MapPin size={24} className="text-emerald-400 shrink-0" />
                  <span>{trackingDetails?.currentMilestone || 'Chờ xuất phát'}</span>
                </h3>
                <p className="text-sm text-slate-400 flex items-center gap-2 m-0">
                  <Clock size={16} /> Dự kiến đến đích (ETA):{' '}
                  <strong className="text-emerald-300">{trackingDetails?.eta ? new Date(trackingDetails.eta).toLocaleString('vi-VN') : 'Chưa có lịch đến'}</strong>
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-blue-500 h-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Visual Waypoint Progress Steps */}
              <div className="relative z-10 mt-5 grid grid-cols-1 sm:grid-cols-4 gap-2">
                {trackingDetails?.milestones.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                        : m.status === 'CURRENT'
                        ? 'bg-blue-900/80 border-blue-600 text-blue-100 ring-2 ring-blue-500/50'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between mb-1">
                      <span className="font-extrabold text-[10px]">#{idx + 1}</span>
                      <span className="text-[10px] font-bold">
                        {m.status === 'COMPLETED' ? '✓ Đã qua' : m.status === 'CURRENT' ? '● Hiện tại' : 'Chờ'}
                      </span>
                    </div>
                    <span className="font-semibold break-words">{m.title}</span>
                    <span className="text-[10px] text-slate-400 break-words mt-0.5">{m.location}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Milestones Timeline with Coordinator Override capability */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Truck size={18} className="text-blue-600" />
                    Lộ trình & Các mốc kiểm soát (Legs & Checkpoints)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Điều phối viên có thể cập nhật thay tài xế nếu mất tín hiệu hoặc nhận tin qua điện thoại/bộ đàm.
                  </p>
                </div>

              </div>

              <div className="flex flex-col gap-3">
                {trackingDetails?.milestones.map((m, idx) => {
                  const isCurrent = m.status === 'CURRENT';
                  const isCompleted = m.status === 'COMPLETED';
                  const isLeg = m.itemType === 'leg_start' || m.itemType === 'leg_end';

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-blue-50/50 border-blue-400 shadow-xs'
                          : isCompleted
                          ? 'bg-slate-50/80 border-slate-200'
                          : 'bg-white border-slate-200 opacity-80'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                ? 'bg-blue-600 text-white animate-pulse'
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
                                  <Plane size={11} /> Chặng bay
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                  <Truck size={11} /> Đường bộ
                                </span>
                              )}
                              {m.isCustomsBorder && (
                                <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded">
                                  Kiểm dịch / Hải quan
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isCurrent
                                    ? 'bg-blue-100 text-blue-900 font-extrabold'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isCompleted ? 'Hoàn thành' : isCurrent ? (m.actualTime ? 'Đã đến · chờ xác nhận tiếp' : 'Mốc tiếp theo') : 'Chờ xuất phát'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-1 m-0">
                              <MapPin size={12} className="text-slate-400" /> {m.location}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                              {m.plannedTime && (
                                <span>Kế hoạch: {new Date(m.plannedTime).toLocaleString('vi-VN')}</span>
                              )}
                              {m.actualTime && (
                                <span className="text-emerald-700 font-semibold">
                                  Thực tế: {new Date(m.actualTime).toLocaleString('vi-VN')}
                                </span>
                              )}
                              {m.updatedBy && (
                                <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                                  {m.updatedBy}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Coordinator Override Button */}
                        {m.allowedActions.length > 0 && (
                          <div className="shrink-0 flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setOverrideMilestone(m); setOverrideReason(''); setOverrideNotes('');
                                setOverrideAction(m.allowedActions[0]);
                              }}
                              className="text-blue-700 border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-xs font-bold"
                            >
                              <Edit3 size={13} className="mr-1.5 text-blue-600" /> Cập nhật thay Driver
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {trackingDetails && <HealthLogHistory key={trackingDetails.shipmentId} shipmentId={trackingDetails.shipmentId} horses={trackingDetails.assignedHorses} />}
            </>}
          </div>

          {/* Right: Active Fleet Quick Switcher */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4 h-fit">
            <div>
              <h3 className="text-base font-bold text-slate-900 m-0">Danh sách Chuyến đi</h3>
              <p className="text-xs text-slate-500 mt-1">
                Chọn chuyến đi để theo dõi dòng telemetry và mốc lộ trình tương ứng.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {trips.map((trip) => {
                const isSelected = trip.shipment_id === selectedShipmentId;

                return (
                  <button type="button" aria-pressed={isSelected}
                    key={trip.shipment_id}
                    onClick={() => {
                      setSelectedShipmentId(trip.shipment_id);
                      toast.success(`Đã chuyển sang chuyến ${trip.request_code}`);
                    }}
                    className={`text-left p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap gap-2 justify-between items-center mb-1">
                      <span className="text-xs font-black text-blue-700">{trip.request_code}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isSelected
                            ? 'bg-blue-200 text-blue-900'
                            : trip.shipment_status === 'in_transit'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'Đang xem' : translateStatus(trip.shipment_status)}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 m-0">
                      {trip.request_title || trip.route_name || `${trip.origin_location.split(',')[0]} → ${trip.destination_location.split(',')[0]}`}
                    </p>

                    <div className="flex flex-wrap gap-2 items-center justify-between text-xs text-slate-500 mt-2">
                      <span>
                        Khách: <strong className="text-slate-700">{trip.contact_name}</strong>
                      </span>
                      <span>{trip.requested_horse_count || 1} ngựa</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Coordinator Override Modal */}
      {overrideMilestone && (
        <Modal isOpen={Boolean(overrideMilestone)} onClose={() => { if (!isSubmittingOverride) setOverrideMilestone(null); }} title="Cập nhật mốc thay tài xế">
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900">
              <p className="font-bold m-0">Mốc: {overrideMilestone.title}</p>
              <p className="text-blue-700 mt-0.5 m-0">Vị trí: {overrideMilestone.location}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Hành động cập nhật:</label>
                <select aria-label="Hành động cập nhật"
                  value={overrideAction}
                  onChange={(e) => setOverrideAction(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-500"
                >
                  {overrideMilestone.allowedActions.map(action => <option key={action} value={action}>{({ start_leg: 'Khởi hành chặng', arrive_leg: 'Đến đích chặng', complete_leg: 'Hoàn tất chặng', arrive_stop: 'Đến trạm', depart_stop: 'Rời trạm', clear_customs: 'Hoàn tất thông quan' } as Record<string, string>)[action] ?? action}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Lý do Coordinator can thiệp:</label>
                <select aria-label="Lý do can thiệp"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-500"
                >
                  <option value="">Chọn lý do can thiệp</option>
                  <option value="Tài xế mất sóng 4G, xác nhận qua bộ đàm">Tài xế mất sóng 4G, xác nhận qua bộ đàm</option>
                  <option value="Tài xế hết pin điện thoại, gọi từ trạm dừng chân">Tài xế hết pin điện thoại, gọi từ trạm dừng chân</option>
                  <option value="Cửa khẩu xác nhận thông quan trực tiếp cho điều phối viên">Cửa khẩu xác nhận thông quan trực tiếp cho điều phối viên</option>
                  <option value="Lý do nghiệp vụ điều phối đặc biệt khác">Lý do nghiệp vụ điều phối đặc biệt khác</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Ghi chú bổ sung (tùy chọn):</label>
                <textarea
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder="Nhập chi tiết ghi nhận từ tài xế hoặc hải quan..."
                  aria-label="Ghi chú can thiệp" maxLength={2000} rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOverrideMilestone(null)}
                disabled={isSubmittingOverride}
              >
                Hủy bỏ
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                onClick={handleSubmitOverride}
                disabled={isSubmittingOverride || !overrideReason.trim()}
              >
                {isSubmittingOverride ? 'Đang lưu...' : 'Xác nhận cập nhật'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Flow 5 Incident Modal Placeholder */}
      {showIncidentModal && (
        <Modal isOpen={showIncidentModal} onClose={() => setShowIncidentModal(false)} title="Thông tin sự cố">
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
              <p className="font-bold m-0">Trung tâm Điều phối Cứu hộ Khẩn cấp</p>
              <p className="mt-1 m-0">
                Tính năng xử lý biến cố lộ trình (đổi tuyến xe, chuyển viện thú y khẩn cấp, chuyến bay trễ) thuộc Flow 5.
              </p>
            </div>

            <p className="text-xs text-slate-600">
              Kênh xử lý sự cố trực tuyến chưa được kết nối. Liên hệ trực tiếp tổ vận hành và bác sĩ thú y để xử lý khẩn cấp.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button size="sm" onClick={() => setShowIncidentModal(false)} className="bg-slate-800 text-white font-bold">
                Đã hiểu
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
