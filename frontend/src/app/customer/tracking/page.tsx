'use client';

import React, { useState, useEffect } from 'react';
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
import { useTracking } from '@/features/tracking/useTracking';
import { TrackingLoadState } from '@/features/tracking/components/TrackingLoadState';
import { JourneyHistory } from '@/features/tracking/components/JourneyHistory';
import { TrackingTelemetry } from '@/features/tracking/components/TrackingTelemetry';
import { HealthLogHistory } from '@/features/tracking/components/HealthLogHistory';


export default function CustomerTrackingPage() {
  const { t, translateStatus } = useTranslation();

  const { trips, selectedShipmentId, setSelectedShipmentId, trackingDetails, loading, refreshing, detailLoading, error: trackingError, refresh, refreshTrips } = useTracking();
  const fetchTrackingDetails = async (_id: number) => { await refresh(); };
  const fetchTrips = async (_keep = true) => { await refreshTrips(); };
  const handleManualRefresh = async () => {
    if (selectedShipmentId) {
      await fetchTrackingDetails(selectedShipmentId);
    }
  };

  const completedCount = trackingDetails?.milestones.filter((m) => m.status === 'COMPLETED').length || 0;
  const totalCount = trackingDetails?.milestones.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link
            href="/customer" aria-label="Về trang khách hàng"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 m-0">
                {t('tracking.liveTitle', 'Theo dõi Chuyến đi Trực tiếp')}
              </h1>
              <span className={`flex items-center gap-1.5 text-xs font-bold border px-3 py-1 rounded-full ${trackingError ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                <span className={`w-2 h-2 rounded-full ${trackingError ? 'bg-red-500' : 'bg-emerald-500'}`} />
                {trackingError ? 'Chưa đồng bộ' : loading || detailLoading || refreshing ? 'Đang đồng bộ' : trackingDetails ? 'Đã đồng bộ' : 'Chưa có dữ liệu'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('tracking.observedSubtitle', 'Mốc hành trình và số đo do tổ vận hành cập nhật; tự đồng bộ mỗi 5 giây.')}
            </p>
          </div>
        </div>

        {/* Shipment Selector & Refresh */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {trips.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label className="text-xs font-bold text-slate-500 hidden sm:block">
                {t('tracking.selectShipment', 'Đơn hàng')}:
              </label>
              <select
                value={selectedShipmentId || ''}
                onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
                aria-label="Chọn chuyến đi" className="min-w-0 max-w-full flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm outline-none focus:border-blue-500 shadow-sm"
              >
                {selectedShipmentId == null && <option value="" disabled>Chọn chuyến đi</option>}
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
            aria-label="Làm mới hành trình" disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            <span className="hidden sm:inline">{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </Button>
        </div>
      </div>

      <TrackingLoadState loading={false} error={trackingError} retry={refresh} />
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">Đang tải dữ liệu chuyến đi của bạn...</p>
        </div>
      ) : trackingError && !trips.length ? null : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 flex flex-col items-center">
          <Truck size={44} className="text-slate-300 mb-3" />
          <h3 className="text-lg font-bold text-slate-800 m-0">Bạn chưa có chuyến đi nào đang vận chuyển</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Khi đơn vận chuyển của bạn được phê duyệt kế hoạch và bàn giao cho đội xe xuất phát, bạn có thể theo dõi trực tiếp tại đây.
          </p>
          <Link href="/customer/requests" className="mt-4">
            <Button size="sm">Xem danh sách đơn vận chuyển</Button>
          </Link>
        </div>
      ) : !trackingDetails ? <TrackingLoadState loading={detailLoading && !trackingError} retry={refresh} /> : (
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
                <span>Khoảng cách: <strong>{trackingDetails?.totalDistanceKm == null ? 'Chưa có khoảng cách' : `${trackingDetails.totalDistanceKm} km`}</strong></span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                Phương tiện: <strong className="text-slate-800">{trackingDetails?.assignedVehicle || 'Chưa phân công'}</strong>
              </span>
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
            </div>
          </div>

          <TrackingTelemetry details={trackingDetails} />
          <JourneyHistory details={trackingDetails} />

          {/* Route Radar Banner: Derived position */}
          <div className="bg-slate-950 text-white rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-lg border border-slate-800">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Radio size={16} className="text-emerald-400 animate-pulse" />
                <span className="text-xs font-extrabold tracking-widest text-emerald-400 uppercase">
                  {t('tracking.recordedMilestones', 'HÀNH TRÌNH THEO MỐC ĐÃ GHI NHẬN')}
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
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-center mt-3">
                  <span className="bg-blue-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-2 shadow-md">
                    <MapPin size={14} className="text-emerald-300" />
                    <span>Mốc ghi nhận gần nhất: {trackingDetails?.currentMilestone}</span>
                  </span>
                </div>
              </div>

              <div className="text-center sm:text-right">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-600 mb-1.5 mx-auto sm:ml-auto" />
                <div className="font-bold text-base text-white">{trackingDetails?.destination.split(',')[0]}</div>
                <div className="text-xs text-slate-400">Dự kiến đến: {trackingDetails?.eta ? new Date(trackingDetails.eta).toLocaleString('vi-VN') : 'Chưa có lịch đến'}</div>
              </div>
            </div>
          </div>

          {/* Milestones Timeline */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 justify-between items-center">
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
                            {isCompleted ? 'Đã hoàn tất' : isCurrent ? (m.actualTime ? 'Đã đến · chờ xác nhận tiếp' : 'Mốc tiếp theo') : 'Sắp tới'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-1.5 m-0">
                          <MapPin size={13} className="text-slate-400" /> {m.location}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                          {m.plannedTime && (
                            <span>Kế hoạch: {new Date(m.plannedTime).toLocaleString('vi-VN')}</span>
                          )}
                          {m.actualTime && (
                            <span className="text-emerald-700 font-bold">
                              Thực tế: {new Date(m.actualTime).toLocaleString('vi-VN')}
                            </span>
                          )}
                          {m.updatedBy && (
                            <span className="text-slate-400 italic">Xác nhận bởi: {m.updatedBy}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {trackingDetails && <HealthLogHistory key={trackingDetails.shipmentId} shipmentId={trackingDetails.shipmentId} horses={trackingDetails.assignedHorses} />}
        </div>
      )}
    </div>
  );
}
