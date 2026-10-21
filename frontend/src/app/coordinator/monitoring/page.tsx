'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export default function TripMonitoringPage() {
  const { t, translateStatus } = useTranslation();

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Coordinator Override Modal State
  const [overrideMilestone, setOverrideMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [overrideAction, setOverrideAction] = useState<string>('arrive_stop');
  const [overrideReason, setOverrideReason] = useState<string>('Tài xế mất sóng 4G, xác nhận qua bộ đàm');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState<boolean>(false);

  // Flow 5 Incident Modal Placeholder
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);

  // Fetch all active/ready trips
  const fetchTrips = useCallback(async (keepSelected = true) => {
    try {
      const data = await trackingApi.getMyTrips();
      setTrips(data);
      if (data.length > 0) {
        if (!keepSelected || !selectedShipmentId) {
          setSelectedShipmentId(data[0].shipment_id);
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch active trips from API:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedShipmentId]);

  // Fetch tracking details for selected trip
  const fetchTrackingDetails = useCallback(async (shipmentId: number) => {
    try {
      setRefreshing(true);
      const details = await trackingApi.getTrackingDetails(shipmentId);
      setTrackingDetails(details);
    } catch (err: any) {
      console.error('Error fetching tracking details:', err);
      toast.error('Không thể tải dữ liệu chi tiết chuyến đi');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips(false);
  }, []);

  useEffect(() => {
    if (selectedShipmentId) {
      fetchTrackingDetails(selectedShipmentId);
    }
  }, [selectedShipmentId, fetchTrackingDetails]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedShipmentId) {
        fetchTrackingDetails(selectedShipmentId);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedShipmentId, fetchTrackingDetails]);

  const handleManualRefresh = () => {
    if (selectedShipmentId) {
      fetchTrackingDetails(selectedShipmentId);
      toast.success('Đã làm mới dữ liệu hành trình');
    }
  };

  const handleExportCSV = () => {
    if (!trackingDetails) return;
    const header = 'Type,Milestone,Location,Planned,Actual,Status,UpdatedBy\n';
    const rows = trackingDetails.milestones.map((m) =>
      `"${m.itemType}","${m.title}","${m.location}","${m.plannedTime || ''}","${m.actualTime || ''}","${m.status}","${m.updatedBy || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `telemetry_${trackingDetails.requestCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Đã xuất báo cáo CSV cho chuyến ${trackingDetails.requestCode}`);
  };

  // Submit Coordinator Override
  const handleSubmitOverride = async () => {
    if (!trackingDetails || !overrideMilestone) return;

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

  // Complete Shipment when arrived
  const handleCompleteShipment = async () => {
    if (!trackingDetails) return;
    if (!confirm('Xác nhận hoàn tất chuyến đi này và chuyển sang giai đoạn bàn giao?')) return;

    try {
      await trackingApi.completeShipment(trackingDetails.shipmentId, {
        notes: 'Chuyến đi đã cập bến an toàn, hoàn thành toàn bộ lộ trình và thủ tục hải quan/kiểm dịch.',
      });
      toast.success('Đã hoàn tất chuyến đi!');
      await fetchTrackingDetails(trackingDetails.shipmentId);
      await fetchTrips(true);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể hoàn tất chuyến đi');
    }
  };

  const completedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalCount = trackingDetails?.milestones.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allMilestonesCompleted = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              {t('nav.monitoring', 'Giám sát Hành trình & Nhật ký Lộ trình (Flow 4)')}
            </h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              Coordinator Control
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi vị trí suy diễn từ các mốc lộ trình, cảm biến vi khí hậu thùng xe và hồ sơ sinh trắc học ngựa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
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
            <AlertTriangle size={15} className="mr-1.5 text-red-600" /> Báo sự cố (Flow 5)
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!trackingDetails}>
            <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600" /> Xuất CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">Đang tải danh sách chuyến đi...</p>
        </div>
      ) : trips.length === 0 ? (
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
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Active Trip Telemetry Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-blue-600 uppercase tracking-wider">
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
                      Khách hàng: <strong>{trackingDetails?.customerName}</strong>
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 mt-1.5 m-0 flex items-center gap-2">
                    <span>{trackingDetails?.origin.split(',')[0]}</span>
                    <span className="text-slate-400 font-normal">→</span>
                    <span>{trackingDetails?.destination.split(',')[0]}</span>
                  </h2>

                  {/* Transport Crew & Vehicle Summary */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-2">
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Truck size={13} className="text-slate-500" />
                      Phương tiện: <strong>{trackingDetails?.assignedVehicle || 'Xe thùng chuyên dụng'}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <UserCheck size={13} className="text-blue-600" />
                      Tài xế: <strong>{trackingDetails?.assignedDriver || 'Đã phân công'}</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Heart size={13} className="text-red-500" />
                      Áp tải/Thú y: <strong>{trackingDetails?.assignedEscort || 'Chuyên viên thú y'}</strong>
                    </span>
                  </div>

                  {/* Assigned Horses Badges */}
                  {trackingDetails?.assignedHorses && trackingDetails.assignedHorses.length > 0 && (
                    <div className="flex items-center gap-2 mt-2.5">
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
                    <span>Lộ trình: {trackingDetails?.totalDistanceKm || 0} km</span>
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Cập nhật: {new Date(trackingDetails?.lastUpdated || Date.now()).toLocaleTimeString('vi-VN')}
                  </span>
                </div>
              </div>

              {/* Environmental Sensors Strip (Simulated Telemetry from Cabin IoT) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
                <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Thermometer size={20} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Nhiệt độ thùng xe</p>
                    <p className="text-lg font-extrabold text-slate-900 m-0">19.2°C</p>
                    <span className="text-[10px] text-emerald-600 font-bold">Chuẩn điều hòa: 18 - 22°C</span>
                  </div>
                </div>

                <div className="p-4 bg-teal-50/70 border border-teal-100 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                    <Wind size={20} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Độ ẩm & Lưu thông khí</p>
                    <p className="text-lg font-extrabold text-slate-900 m-0">62% RH</p>
                    <span className="text-[10px] text-emerald-600 font-bold">HEPA Airflow Ổn định</span>
                  </div>
                </div>

                <div className="p-4 bg-purple-50/70 border border-purple-100 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Niêm phong kiểm dịch</p>
                    <p className="text-sm font-extrabold text-slate-900 m-0">Intact & Sealed</p>
                    <span className="text-[10px] text-emerald-600 font-bold">Hải quan chấp thuận</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated Derived GPS Radar Banner */}
            <div className="bg-slate-900 rounded-xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-lg relative overflow-hidden min-h-[220px]">
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Vị trí hiện tại (Suy diễn từ mốc cập nhật gần nhất)
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
                  <strong className="text-emerald-300">{trackingDetails?.eta || 'Đúng tiến độ'}</strong>
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-blue-500 h-full transition-all duration-500"
                  style={{ width: `${Math.max(8, progressPct)}%` }}
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-[10px]">#{idx + 1}</span>
                      <span className="text-[10px] font-bold">
                        {m.status === 'COMPLETED' ? '✓ Đã qua' : m.status === 'CURRENT' ? '● Hiện tại' : 'Chờ'}
                      </span>
                    </div>
                    <span className="font-semibold truncate">{m.title}</span>
                    <span className="text-[10px] text-slate-400 truncate mt-0.5">{m.location}</span>
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
                {allMilestonesCompleted && trackingDetails?.shipmentStatus !== 'completed' && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    onClick={handleCompleteShipment}
                  >
                    <CheckCircle2 size={16} className="mr-1.5" /> Hoàn tất chuyến đi
                  </Button>
                )}
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
                                {isCompleted ? 'Hoàn thành' : isCurrent ? 'Đang thực hiện' : 'Chờ xuất phát'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 m-0">
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
                        {!isCompleted && (
                          <div className="shrink-0 flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setOverrideMilestone(m);
                                if (m.itemType === 'leg_start') setOverrideAction('start_leg');
                                else if (m.itemType === 'leg_end') setOverrideAction('complete_leg');
                                else setOverrideAction('arrive_stop');
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

            {/* Equine Health Monitor Stream */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Heart size={18} className="text-red-500" />
                    Nhật ký Thể trạng & Sinh trắc học Ngựa (Equine Vital Stream)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ghi nhận bởi Chuyên viên áp tải / Bác sĩ thú y trong suốt quá trình vận chuyển.
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {trackingDetails?.healthLogs.length || 0} bản ghi
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {!trackingDetails || trackingDetails.healthLogs.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Chưa có nhật ký sức khỏe nào được nhân viên áp tải gửi lên cho chuyến đi này.
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
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900">{log.horseName}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.conditionStatus === 'stable'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {log.conditionStatusVi || log.conditionStatus}
                              </span>
                              {isAlert && (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                                  ⚠️ Cần chú ý
                                </span>
                              )}
                            </div>

                            <p className="text-slate-700 mt-1 m-0 font-medium">
                              {log.notes || 'Thể trạng bình thường, ổn định.'}
                            </p>

                            <div className="text-[11px] text-slate-400 mt-1">
                              Ghi bởi: <strong>{log.recordedByName || 'Bác sĩ thú y'}</strong> ({log.recordedByRole || 'Escort'})
                              {' • '}
                              {new Date(log.recordedAt).toLocaleString('vi-VN')}
                            </div>
                          </div>
                        </div>

                        <div className="sm:text-right shrink-0 bg-white sm:bg-transparent p-2 sm:p-0 rounded border sm:border-0 border-slate-200">
                          <span className="font-extrabold text-slate-900 text-sm block">
                            {log.temperatureC ? `${log.temperatureC}°C` : '--'} • {log.heartRateBpm ? `${log.heartRateBpm} bpm` : '--'}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-bold">
                            Thân nhiệt: {log.temperatureC && log.temperatureC <= 38.5 ? 'Bình thường' : 'Theo dõi'}
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
                  <div
                    key={trip.shipment_id}
                    onClick={() => {
                      setSelectedShipmentId(trip.shipment_id);
                      toast.success(`Đã chuyển sang chuyến ${trip.request_code}`);
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
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

                    <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                      <span>
                        Khách: <strong className="text-slate-700">{trip.contact_name}</strong>
                      </span>
                      <span>{trip.requested_horse_count || 1} ngựa</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Coordinator Override Modal */}
      {overrideMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="text-blue-600" size={20} />
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Cập nhật mốc thay tài xế (Coordinator Override)
                </h3>
              </div>
              <button
                onClick={() => setOverrideMilestone(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900">
              <p className="font-bold m-0">Mốc: {overrideMilestone.title}</p>
              <p className="text-blue-700 mt-0.5 m-0">Vị trí: {overrideMilestone.location}</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Hành động cập nhật:</label>
                <select
                  value={overrideAction}
                  onChange={(e) => setOverrideAction(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-500"
                >
                  {overrideMilestone.itemType === 'leg_start' ? (
                    <option value="start_leg">Khởi hành chặng (Start Leg)</option>
                  ) : overrideMilestone.itemType === 'leg_end' ? (
                    <option value="complete_leg">Hoàn tất chặng (Arrive Destination)</option>
                  ) : (
                    <>
                      <option value="arrive_stop">Đến trạm kiểm soát (Arrive Stop)</option>
                      <option value="depart_stop">Rời trạm kiểm soát (Depart Stop)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Lý do Coordinator can thiệp:</label>
                <select
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-500"
                >
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
                  rows={3}
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
                disabled={isSubmittingOverride}
              >
                {isSubmittingOverride ? 'Đang lưu...' : 'Xác nhận cập nhật'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Flow 5 Incident Modal Placeholder */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-red-600" size={20} />
                <h3 className="text-base font-bold text-slate-900 m-0">Kích hoạt Báo cáo Sự cố (Flow 5)</h3>
              </div>
              <button onClick={() => setShowIncidentModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
              <p className="font-bold m-0">Trung tâm Điều phối Cứu hộ Khẩn cấp</p>
              <p className="mt-1 m-0">
                Tính năng xử lý biến cố lộ trình (đổi tuyến xe, chuyển viện thú y khẩn cấp, chuyến bay trễ) thuộc Flow 5.
              </p>
            </div>

            <p className="text-xs text-slate-600">
              Hiện tại, nếu ngựa có dấu hiệu mệt mỏi, stress hoặc bỏ ăn, hệ thống đã tự động gửi cảnh báo qua Notification
              cho Điều phối viên và Khách hàng để theo dõi sát.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button size="sm" onClick={() => setShowIncidentModal(false)} className="bg-slate-800 text-white font-bold">
                Đã hiểu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
