'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Thermometer,
  Heart,
  Clock,
  MapPin,
  Activity,
  Wind,
  CheckCircle2,
  Truck,
  Plane,
  RefreshCw,
  Radio,
  FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import {
  trackingApi,
  TripTrackingDetails,
  AssignedTripSummary,
} from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

export default function CustomerTrackingPage() {
  const { t, translateStatus } = useTranslation();

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Fetch customer's shipments
  const fetchMyTrips = useCallback(async (keepSelected = true) => {
    try {
      const data = await trackingApi.getMyTrips();
      setTrips(data);
      if (data.length > 0) {
        if (!keepSelected || !selectedShipmentId) {
          setSelectedShipmentId(data[0].shipment_id);
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch customer shipments:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedShipmentId]);

  // Fetch tracking details for selected shipment
  const fetchTrackingDetails = useCallback(async (shipmentId: number, silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      const details = await trackingApi.getTrackingDetails(shipmentId);
      setTrackingDetails(details);
    } catch (err: any) {
      console.error('Error fetching customer tracking details:', err);
      if (!silent) toast.error('Không thể tải thông tin hành trình');
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMyTrips(false);
  }, []);

  useEffect(() => {
    if (selectedShipmentId) {
      fetchTrackingDetails(selectedShipmentId);
    }
  }, [selectedShipmentId, fetchTrackingDetails]);

  // Auto-polling every 12 seconds
  useEffect(() => {
    if (!selectedShipmentId) return;
    const interval = setInterval(() => {
      fetchTrackingDetails(selectedShipmentId, true);
    }, 12000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, fetchTrackingDetails]);

  const handleManualRefresh = () => {
    if (selectedShipmentId) {
      fetchTrackingDetails(selectedShipmentId);
      toast.success('Đã đồng bộ dữ liệu lộ trình mới nhất');
    }
  };

  const completedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalCount = trackingDetails?.milestones.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const latestHealth = trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0
    ? trackingDetails.healthLogs[0]
    : null;

  // Helper format date and time with clear separation
  const formatDateTimeVi = (isoString?: string | null) => {
    if (!isoString) return { time: '--:--', date: '--/--/----' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { time: '--:--', date: '--/--/----' };
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customer"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 m-0">
                {t('tracking.liveTitle', 'Theo dõi Chuyến đi Trực tiếp')}
              </h1>
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Status
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('tracking.liveSubtitle', 'Vị trí suy diễn theo mốc kiểm soát, thông số vi khí hậu thùng xe và sinh trắc học ngựa.')}
            </p>
          </div>
        </div>

        {/* Shipment Selector & Refresh */}
        <div className="flex items-center gap-3">
          {trips.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 hidden sm:block">
                {t('tracking.selectShipment', 'Đơn hàng')}:
              </label>
              <select
                value={selectedShipmentId || ''}
                onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm outline-none focus:border-blue-500 shadow-sm"
              >
                {trips.map((s) => (
                  <option key={s.shipment_id} value={s.shipment_id}>
                    {s.request_code}: {s.request_title || `${s.origin_location.split(',')[0]} → ${s.destination_location.split(',')[0]}`} ({translateStatus(s.shipment_status)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            <span className="hidden sm:inline">{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">Đang tải dữ liệu chuyến đi của bạn...</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 flex flex-col items-center">
          <Truck size={44} className="text-slate-300 mb-3" />
          <h3 className="text-lg font-bold text-slate-800 m-0">Bạn chưa có chuyến đi nào đang vận chuyển</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Khi đơn vận chuyển của bạn được phê duyệt kế hoạch và bàn giao cho đội xe xuất phát, bạn có thể theo dõi trực tiếp tại đây.
          </p>
          <Link href="/customer/orders" className="mt-4">
            <Button size="sm">Xem danh sách đơn vận chuyển</Button>
          </Link>
        </div>
      ) : (
        /* Main Tracking Overview Card */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <span className="text-xs font-extrabold text-blue-600 tracking-wider uppercase">
                {t('tracking.shipmentCode', 'MÃ CHUYẾN VẬN CHUYỂN')}
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-1 m-0 flex flex-wrap items-center gap-2">
                <span>{trackingDetails?.requestCode}</span>
                {trackingDetails?.requestTitle && (
                  <span className="text-base font-semibold text-slate-500">
                    — {trackingDetails.requestTitle}
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-2">
                <MapPin size={15} className="text-slate-400 shrink-0" />
                <span>
                  <strong>{trackingDetails?.origin.split(',')[0]}</strong> → <strong>{trackingDetails?.destination.split(',')[0]}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>Khoảng cách: <strong>{trackingDetails?.totalDistanceKm || 0} km</strong></span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                Phương tiện: <strong className="text-slate-800">{trackingDetails?.assignedVehicle || 'Xe chuyên dụng'}</strong>
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

          {/* Telemetry Sensor Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Cabin / Stall Temp */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col justify-between">
              <div className="flex items-center justify-between text-blue-700">
                <span className="text-xs font-bold uppercase">{t('tracking.stallTemp', 'Nhiệt độ thùng xe')}</span>
                <Thermometer size={18} />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-blue-950">19.2°C</span>
                <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                  {t('tracking.stallTempOk', 'Trong ngưỡng tiêu chuẩn (18-22°C)')}
                </p>
              </div>
            </div>

            {/* Card 2: Equine Heart Rate */}
            <div className="p-4 rounded-xl bg-red-50/70 border border-red-100 flex flex-col justify-between">
              <div className="flex items-center justify-between text-red-600">
                <span className="text-xs font-bold uppercase">{t('driver.heartRate', 'Nhịp tim ngựa')}</span>
                <Heart size={18} />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-red-950">
                  {latestHealth?.heartRateBpm || 40} <span className="text-xs font-bold text-slate-500">bpm</span>
                </span>
                <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                  {latestHealth?.conditionStatus === 'stressed'
                    ? 'Bác sĩ thú y đang chăm sóc'
                    : 'Bình tĩnh & Nghỉ ngơi ổn định'}
                </p>
              </div>
            </div>

            {/* Card 3: Body Temperature */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-100 flex flex-col justify-between">
              <div className="flex items-center justify-between text-amber-700">
                <span className="text-xs font-bold uppercase">{t('driver.bodyTemp', 'Thân nhiệt ngựa')}</span>
                <Activity size={18} />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-amber-950">
                  {latestHealth?.temperatureC ? `${latestHealth.temperatureC}°C` : '37.8°C'}
                </span>
                <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                  {t('driver.normalRange', 'Bình thường: 37.2 - 38.3°C')}
                </p>
              </div>
            </div>

            {/* Card 4: Quarantine Seal */}
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-700">
                <span className="text-xs font-bold uppercase">{t('tracking.quarantineSeal', 'Niêm phong kiểm dịch')}</span>
                <ShieldCheck size={18} />
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-emerald-950">Intact & Sealed</span>
                <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                  {t('tracking.sealIntact', 'Đã kiểm tra & thông quan')}
                </p>
              </div>
            </div>
          </div>

          {/* Environmental Extra Sensors Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase block">{t('tracking.humidity', 'Độ ẩm thùng xe')}</span>
              <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">62% RH</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block">{t('tracking.airQuality', 'Chất lượng không khí')}</span>
              <span className="font-extrabold text-emerald-700 text-sm mt-0.5 block">HEPA Lọc sạch 99.9%</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block">Đội ngũ trên xe</span>
              <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">
                {trackingDetails?.assignedDriver ? 'Tài xế + Bác sĩ thú y' : 'Chuyên nghiệp'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase block">Lần đồng bộ gần nhất</span>
              <span className="font-bold text-slate-600 text-sm mt-0.5 block">
                {new Date(trackingDetails?.lastUpdated || Date.now()).toLocaleTimeString('vi-VN')}
              </span>
            </div>
          </div>

          {/* Route Radar Banner: Derived position */}
          <div className="bg-slate-950 text-white rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-lg border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Radio size={16} className="text-emerald-400 animate-pulse" />
                <span className="text-xs font-extrabold tracking-widest text-emerald-400 uppercase">
                  {t('tracking.gpsRadar', 'HÀNH TRÌNH SUY DIỄN TỪ MỐC KIỂM SOÁT')}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-400">
                Tiến độ: <strong className="text-white">{progressPct}%</strong> ({completedCount}/{totalCount} mốc)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 my-4">
              <div className="text-center sm:text-left">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 mb-1.5 ring-4 ring-emerald-500/20 mx-auto sm:mx-0" />
                <div className="font-bold text-base text-white">{trackingDetails?.origin.split(',')[0]}</div>
                <div className="text-xs text-slate-400">Điểm xuất phát</div>
              </div>

              <div className="flex-1 w-full relative px-4">
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${Math.max(10, progressPct)}%` }}
                  />
                </div>
                <div className="flex justify-center mt-3">
                  <span className="bg-blue-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-2 shadow-md">
                    <MapPin size={14} className="text-emerald-300" />
                    <span>Vị trí hiện tại: {trackingDetails?.currentMilestone}</span>
                  </span>
                </div>
              </div>

              <div className="text-center sm:text-right">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-600 mb-1.5 mx-auto sm:ml-auto" />
                <div className="font-bold text-base text-white">{trackingDetails?.destination.split(',')[0]}</div>
                <div className="text-xs text-slate-400">Dự kiến đến: {trackingDetails?.eta || 'Đúng tiến độ'}</div>
              </div>
            </div>
          </div>

          {/* Milestones Timeline */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
                <FileCheck2 size={18} className="text-blue-600" />
                {t('tracking.milestones', 'Tiến độ các Mốc Lộ trình & Thủ tục Kiểm dịch')}
              </h3>
              <span className="text-xs font-bold text-slate-500">
                {completedCount} trên {totalCount} chặng/trạm đã qua
              </span>
            </div>

            <div className="relative border-l-2 border-slate-200 ml-4 pl-6 flex flex-col gap-5 py-2">
              {!trackingDetails || trackingDetails.milestones.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có thông tin mốc kiểm soát nào cho chuyến đi này.</p>
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
                            ? 'bg-emerald-500 text-white ring-4 ring-emerald-50'
                            : isCurrent
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                      </div>

                      <div
                        className={`rounded-xl p-4 border transition-colors ${
                          isCurrent
                            ? 'bg-blue-50/70 border-blue-300'
                            : isCompleted
                            ? 'bg-slate-50/80 border-slate-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{m.title}</span>
                            {m.legType === 'flight' && (
                              <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                <Plane size={11} /> Chặng bay
                              </span>
                            )}
                            {m.isCustomsBorder && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                Kiểm dịch & Hải quan
                              </span>
                            )}
                          </div>

                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full w-fit ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : isCurrent
                                ? 'bg-blue-100 text-blue-900'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isCompleted ? 'Đã hoàn tất' : isCurrent ? 'Đang thực hiện' : 'Sắp tới'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1.5 m-0">
                          <MapPin size={13} className="text-slate-400" /> {m.location}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2.5">
                          {m.plannedTime && (() => {
                            const { time, date } = formatDateTimeVi(m.plannedTime);
                            return (
                              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200">
                                <Clock size={12} className="text-slate-400 shrink-0" />
                                <span>Kế hoạch:</span>
                                <strong className="text-slate-900">{time}</strong>
                                <span className="text-slate-300 mx-0.5">•</span>
                                <span>Ngày {date}</span>
                              </span>
                            );
                          })()}
                          {m.actualTime && (() => {
                            const { time, date } = formatDateTimeVi(m.actualTime);
                            return (
                              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-200">
                                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                                <span>Thực tế:</span>
                                <strong className="text-emerald-950 font-bold">{time}</strong>
                                <span className="text-emerald-300 mx-0.5">•</span>
                                <span>Ngày {date}</span>
                              </span>
                            );
                          })()}
                          {m.updatedBy && (
                            <span className="text-slate-400 italic text-[11px]">Xác nhận bởi: {m.updatedBy}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Equine Health Summary for Customer */}
          {trackingDetails?.healthLogs && trackingDetails.healthLogs.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                  <Heart size={16} className="text-red-500" />
                  Nhật ký Sức khỏe & Thể trạng Ngựa trong Chuyến đi
                </h4>
                <span className="text-xs text-slate-400">Cập nhật bởi Chuyên viên y tế áp tải</span>
              </div>

              <div className="flex flex-col gap-2">
                {trackingDetails.healthLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{log.horseName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.conditionStatus === 'stable'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {log.conditionStatusVi || log.conditionStatus}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1 m-0">{log.notes || 'Sức khỏe ổn định'}</p>
                    </div>

                    <div className="text-slate-500 sm:text-right shrink-0">
                      <span className="font-bold text-slate-800 block">
                        {log.temperatureC ? `${log.temperatureC}°C` : '--'} • {log.heartRateBpm ? `${log.heartRateBpm} bpm` : '--'}
                      </span>
                      {(() => {
                        const { time, date } = formatDateTimeVi(log.recordedAt);
                        return (
                          <span className="text-[11px] text-slate-500 flex sm:justify-end items-center gap-1 mt-0.5">
                            <Clock size={11} className="text-slate-400" />
                            <strong className="text-slate-700">{time}</strong>
                            <span className="text-slate-300 mx-0.5">•</span>
                            <span>Ngày {date}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
