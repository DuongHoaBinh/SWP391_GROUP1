'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Clock,
  Truck,
  User,
  ShieldCheck,
  MapPin,
  Search,
  RefreshCw,
  Play,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Eye,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { trackingApi, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

export default function TripSchedulePage() {
  const { t, language, translateStatus } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;

  const [trips, setTrips] = useState<TripTrackingDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ready_to_depart');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'start' | 'complete';
    trip: TripTrackingDetails | null;
  }>({
    isOpen: false,
    type: 'start',
    trip: null,
  });

  // Load real trips from Tracking API
  const loadScheduleData = useCallback(async () => {
    try {
      setRefreshing(true);
      setLoadError(null);
      const summaryList = await trackingApi.getMyTrips();

      const validDetails: TripTrackingDetails[] = [];
      const chunkSize = 5;
      for (let i = 0; i < summaryList.length; i += chunkSize) {
        const chunk = summaryList.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map(async (item) => {
            try {
              return await trackingApi.getTrackingDetails(item.shipment_id);
            } catch {
              return null;
            }
          })
        );
        for (const res of chunkResults) {
          if (res) validDetails.push(res);
        }
      }
      setTrips(validDetails);
    } catch (err: any) {
      console.error('Error loading schedule trips:', err);
      const msg =
        err?.message ||
        tRef.current('coordinator.schedule.errLoadTrips', 'Không thể tải danh sách lịch trình chuyến đi');
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadScheduleData();
  }, [loadScheduleData]);

  const handleStartTrip = (trip: TripTrackingDetails) => {
    const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
    if (!firstLeg) {
      toast.error(t('coordinator.schedule.errNoFirstLeg', 'Không tìm thấy chặng đầu tiên để xuất phát'));
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'start',
      trip,
    });
  };

  const handleCompleteTrip = (trip: TripTrackingDetails) => {
    setConfirmModal({
      isOpen: true,
      type: 'complete',
      trip,
    });
  };

  const closeConfirmModal = () => {
    if (actionLoadingId !== null) return;
    setConfirmModal({ isOpen: false, type: 'start', trip: null });
  };

  const handleConfirmAction = async () => {
    if (!confirmModal.trip || actionLoadingId !== null) return;
    const trip = confirmModal.trip;

    if (confirmModal.type === 'start') {
      const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
      if (!firstLeg) {
        toast.error(t('coordinator.schedule.errNoFirstLeg', 'Không tìm thấy chặng đầu tiên để xuất phát'));
        return;
      }
      try {
        setActionLoadingId(trip.shipmentId);
        await trackingApi.checkInLegStart(trip.shipmentId, firstLeg.legId, {
          notes:
            language === 'en'
              ? 'Coordinator issued departure order for Leg 1'
              : 'Điều phối viên phát lệnh xuất bến chặng 1',
        });
        toast.success(
          t('coordinator.schedule.tripStartedSuccess', 'Chuyến đi {code} đã chính thức xuất phát!', {
            code: trip.requestCode,
          })
        );
        setConfirmModal({ isOpen: false, type: 'start', trip: null });
        await loadScheduleData();
      } catch (err: any) {
        toast.error(err?.message || t('coordinator.schedule.errStartTrip', 'Không thể bắt đầu chuyến đi'));
      } finally {
        setActionLoadingId(null);
      }
    } else {
      try {
        setActionLoadingId(trip.shipmentId);
        await trackingApi.completeShipment(trip.shipmentId, {
          notes:
            language === 'en'
              ? 'Coordinator confirmed safe arrival and handover of racehorses.'
              : 'Điều phối viên xác nhận kết thúc chuyến đi sau khi nhận báo cáo bàn giao ngựa an toàn.',
        });
        toast.success(
          t('coordinator.schedule.tripCompletedSuccess', 'Chuyến đi {code} đã hoàn thành an toàn!', {
            code: trip.requestCode,
          })
        );
        setConfirmModal({ isOpen: false, type: 'complete', trip: null });
        await loadScheduleData();
      } catch (err: any) {
        toast.error(err?.message || t('coordinator.schedule.errCompleteTrip', 'Không thể hoàn tất chuyến đi'));
      } finally {
        setActionLoadingId(null);
      }
    }
  };

  const formatDeparture = (trip: TripTrackingDetails) => {
    const locale = language === 'en' ? 'en-US' : 'vi-VN';
    const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
    if (firstLeg?.actualTime) {
      const act = new Date(firstLeg.actualTime);
      return {
        date: act.toLocaleDateString(locale),
        time: act.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        isActual: true,
      };
    }
    if (firstLeg?.plannedTime) {
      const plan = new Date(firstLeg.plannedTime);
      return {
        date: plan.toLocaleDateString(locale),
        time: plan.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        isActual: false,
      };
    }
    return {
      date: t('coordinator.schedule.notScheduled', 'Chưa xếp lịch'),
      time: '--:--',
      isActual: false,
    };
  };

  const formatEstimatedArrivalDate = (trip: TripTrackingDetails) => {
    const locale = language === 'en' ? 'en-US' : 'vi-VN';
    const lastLeg = [...trip.milestones].reverse().find((m) => m.itemType === 'leg_end');
    if (lastLeg?.actualTime) {
      const act = new Date(lastLeg.actualTime);
      return t('coordinator.schedule.arrivedPrefix', 'Đã đến: {date}', { date: act.toLocaleDateString(locale) });
    }
    if (lastLeg?.plannedTime) {
      const plan = new Date(lastLeg.plannedTime);
      return t('coordinator.schedule.estimatedPrefix', 'Dự kiến: {date}', { date: plan.toLocaleDateString(locale) });
    }
    if (trip.eta) {
      const parts = trip.eta.split(' ');
      const datePart = parts.find((p) => p.includes('/') || p.includes('-')) || trip.eta;
      return t('coordinator.schedule.estimatedPrefix', 'Dự kiến: {date}', { date: datePart });
    }
    return t('coordinator.schedule.estimatedOnSchedule', 'Dự kiến: Theo tiến độ');
  };

  const filteredTrips = trips.filter((trip) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      trip.requestCode.toLowerCase().includes(q) ||
      (trip.assignedDriver && trip.assignedDriver.toLowerCase().includes(q)) ||
      (trip.assignedVehicle && trip.assignedVehicle.toLowerCase().includes(q)) ||
      trip.assignedHorses.some((h) => h.name.toLowerCase().includes(q)) ||
      trip.origin.toLowerCase().includes(q) ||
      trip.destination.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'ALL' ||
      trip.shipmentStatus === statusFilter ||
      (statusFilter === 'in_transit' && (trip.shipmentStatus === 'in_transit' || trip.shipmentStatus === 'arrived'));

    return matchesSearch && matchesStatus;
  });

  const readyToDepartCount = trips.filter((item) => item.shipmentStatus === 'ready_to_depart').length;
  const inTransitCount = trips.filter((item) => item.shipmentStatus === 'in_transit' || item.shipmentStatus === 'arrived').length;
  const completedCount = trips.filter((item) => item.shipmentStatus === 'completed').length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('coordinator.schedule.title', 'Lịch Điều độ & Xuất bến Chuyến đi')}
            </h1>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#F3EFE4] text-[#181A17]">
              {t('coordinator.schedule.awaitingDepartureCount', '{count} Chuyến chờ xuất phát', { count: readyToDepartCount })}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t('coordinator.schedule.subtitle', 'Trạng thái chuyến đi tự động đồng bộ theo thời gian thực khi Bác sĩ thú y / Tài xế bấm xuất phát tại trang trại của khách.')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadScheduleData()}
            disabled={refreshing}
            className="shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#A67C2E]' : 'text-slate-600'} />
            <span>{refreshing ? t('common.syncing', 'Đang đồng bộ...') : t('common.refresh', 'Làm mới')}</span>
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
            disabled={refreshing}
            onClick={() => void loadScheduleData()}
            className="border-red-200 bg-white text-red-700 hover:bg-red-100 text-xs"
          >
            <RotateCcw size={13} className="mr-1" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* Search & Filter Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row flex-wrap gap-4 md:items-center justify-between">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full sm:w-80">
          <Search size={16} className="text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            aria-label={t('common.searchPlaceholder', 'Tìm theo mã đơn, tài xế, ngựa, xe...')}
            placeholder={t('common.searchPlaceholder', 'Tìm theo mã đơn, tài xế, ngựa, xe...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('ready_to_depart')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'ready_to_depart'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {translateStatus('ready_to_depart')} ({readyToDepartCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('in_transit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'in_transit'
                ? 'bg-[#181A17] text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {translateStatus('in_transit')} ({inTransitCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {translateStatus('completed')} ({completedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('common.all', 'Tất cả')} ({trips.length})
          </button>
        </div>
      </div>

      {/* Schedule Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <RefreshCw size={32} className="animate-spin text-[#A67C2E] mx-auto mb-3" />
          <p className="text-slate-600 font-semibold text-sm m-0">
            {t('coordinator.schedule.loadingSchedule', 'Đang tải lịch điều độ từ cơ sở dữ liệu...')}
          </p>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center">
          <Truck size={40} className="text-slate-300 mb-3" />
          <h2 className="text-base font-bold text-slate-800 m-0">
            {t('coordinator.schedule.noMatchingTrips', 'Không có chuyến đi nào phù hợp')}
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {t('coordinator.schedule.noMatchingTripsDesc', 'Hiện tại không có chuyến đi nào trong mục lọc này. Các chuyến đã hoàn tất lập kế hoạch lộ trình sẽ xuất hiện tại đây.')}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">{t('coordinator.schedule.colOrderTrip', 'Mã đơn / Chuyến')}</th>
                  <th className="p-4">{t('coordinator.schedule.colHorses', 'Chiến mã')}</th>
                  <th className="p-4">{t('coordinator.schedule.colDepArr', 'Khởi hành & Đến đích')}</th>
                  <th className="p-4">{t('coordinator.schedule.colVehicle', 'Phương tiện')}</th>
                  <th className="p-4">{t('coordinator.schedule.colDriverEscort', 'Tài xế & Bác sĩ thú y')}</th>
                  <th className="p-4">{t('coordinator.schedule.colRoute', 'Lộ trình vận chuyển')}</th>
                  <th className="p-4">{t('coordinator.schedule.colStatus', 'Trạng thái')}</th>
                  <th className="p-4 text-right">{t('common.actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.map((trip) => {
                  const dep = formatDeparture(trip);
                  const arrDateStr = formatEstimatedArrivalDate(trip);
                  const isActionLoading = actionLoadingId === trip.shipmentId;
                  const isReady = trip.shipmentStatus === 'ready_to_depart';
                  const isInTransit = trip.shipmentStatus === 'in_transit' || trip.shipmentStatus === 'arrived';
                  const isCompleted = trip.shipmentStatus === 'completed';

                  return (
                    <tr key={trip.shipmentId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4">
                        <span className="font-extrabold text-[#A67C2E] block">{trip.requestCode}</span>
                        {trip.customerRequestCode && trip.customerRequestCode !== trip.requestCode && (
                          <span className="text-[10px] text-slate-400 block font-normal">
                            {t('coordinator.schedule.clientCodeLabel', 'Mã khách: {code}', { code: trip.customerRequestCode })}
                          </span>
                        )}
                        {trip.requestTitle && (
                          <p className="text-xs font-semibold text-slate-800 mt-0.5 m-0 line-clamp-1">
                            {trip.requestTitle}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5 m-0">
                          {t('coordinator.schedule.clientLabel', 'Khách: {name}', { name: trip.customerName })}
                        </p>
                      </td>

                      <td className="p-4">
                        {trip.assignedHorses.length > 0 ? (
                          <div>
                            <p className="font-bold text-slate-900 m-0">
                              {trip.assignedHorses.map((h) => h.name).join(', ')}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 m-0">
                              {t('coordinator.schedule.horseCountLabel', '{count} con ngựa thi đấu', { count: trip.assignedHorses.length })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            {t('coordinator.schedule.profileAssigned', 'Đã gán hồ sơ')}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-slate-800">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Clock size={13} className="text-[#A67C2E] shrink-0" />
                          <span>
                            {dep.date} • {dep.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 m-0 flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400 shrink-0" />
                          <span>{arrDateStr}</span>
                        </p>
                      </td>

                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded text-xs font-bold text-slate-800">
                          <Truck size={13} className="text-slate-500" />
                          <span>{trip.assignedVehicle || t('coordinator.schedule.specializedVehicle', 'Xe chuyên dụng')}</span>
                        </span>
                      </td>

                      <td className="p-4 text-slate-700">
                        <p className="font-semibold text-xs text-slate-900 m-0 flex items-center gap-1">
                          <User size={13} className="text-[#A67C2E] shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {trip.assignedDriver || t('coordinator.schedule.driverAssigned', 'Đã chỉ định tài xế')}
                          </span>
                        </p>
                        <p className="text-xs text-emerald-700 font-medium mt-0.5 m-0 flex items-center gap-1">
                          <ShieldCheck size={12} className="shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {trip.assignedEscort || t('coordinator.schedule.vetEscort', 'Bác sĩ thú y áp tải')}
                          </span>
                        </p>
                      </td>

                      <td className="p-4">
                        <p className="font-semibold text-slate-800 text-xs m-0 max-w-[200px] truncate" title={`${trip.origin} → ${trip.destination}`}>
                          {(trip.origin || '').split(',')[0] || '—'} → {(trip.destination || '').split(',')[0] || '—'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 m-0 flex items-center gap-1">
                          <MapPin size={11} /> {trip.totalDistanceKm || 0} km
                        </p>
                      </td>

                      <td className="p-4">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            {translateStatus('ready_to_depart')}
                          </span>
                        ) : isInTransit ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-[#A67C2E] animate-pulse" />
                            {translateStatus('in_transit')}
                          </span>
                        ) : (
                          <StatusBadge
                            label={translateStatus(trip.shipmentStatus)}
                            variant={isCompleted ? 'success' : 'pending'}
                            hasDot={false}
                          />
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {isReady && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartTrip(trip)}
                              disabled={isActionLoading}
                              className="text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold shadow-sm whitespace-nowrap"
                            >
                              <Play size={13} className="mr-1.5 fill-current" />
                              <span>{t('coordinator.schedule.overrideDepartureBtn', 'Ghi đè xuất bến')}</span>
                            </Button>
                          </div>
                        )}

                        {isInTransit && (
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/manager/monitoring?shipmentId=${trip.shipmentId}`}
                              className="px-3 py-1.5 bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#181A17] font-bold text-xs rounded-lg border border-[#EAE5DA] inline-flex items-center gap-1.5 transition-colors shadow-sm no-underline whitespace-nowrap"
                            >
                              <Eye size={13} />
                              <span>{t('coordinator.schedule.liveMonitorBtn', 'Giám sát trực tiếp')}</span>
                            </Link>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCompleteTrip(trip)}
                              disabled={isActionLoading}
                              className="text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold shadow-sm whitespace-nowrap"
                            >
                              <CheckCircle2 size={13} className="mr-1.5" />
                              <span>{t('coordinator.schedule.confirmCompleteBtn', 'Xác nhận hoàn thành')}</span>
                            </Button>
                          </div>
                        )}

                        {isCompleted && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 size={13} /> {translateStatus('completed')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        closeDisabled={actionLoadingId !== null}
        title={
          confirmModal.type === 'start'
            ? t('coordinator.schedule.modalStartTitle', 'Xác Nhận Ghi Đè Xuất Bến Thủ Công')
            : t('coordinator.schedule.modalCompleteTitle', 'Xác Nhận Kết Thúc Chuyến Đi')
        }
        subtitle={
          confirmModal.trip
            ? t('coordinator.schedule.orderCodeSubtitle', 'Mã đơn vận chuyển: {code}', { code: confirmModal.trip.requestCode })
            : undefined
        }
        maxWidth="max-w-md"
      >
        {confirmModal.trip && (
          <div className="flex flex-col gap-4">
            {/* Summary card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('coordinator.schedule.transportCorridor', 'Hành lang vận chuyển')}
                </span>
                <span className="text-xs font-extrabold text-[#A67C2E] px-2 py-0.5 rounded bg-[#FAF8F4] border border-[#EAE5DA]">
                  {confirmModal.trip.requestCode}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-800 flex flex-wrap items-center gap-2">
                <span>{(confirmModal.trip.origin || '').split(',')[0] || '—'}</span>
                <span className="text-slate-400">→</span>
                <span className="text-[#181A17]">{(confirmModal.trip.destination || '').split(',')[0] || '—'}</span>
              </div>
              {confirmModal.trip.requestTitle && (
                <div className="text-xs text-slate-500 font-medium">{confirmModal.trip.requestTitle}</div>
              )}
            </div>

            {/* Impact Details */}
            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#D4C5A3] flex flex-col gap-2 text-xs text-slate-700">
              <span className="font-bold text-[#181A17] flex items-center gap-1.5">
                <AlertCircle size={14} className="text-[#A67C2E]" />
                {confirmModal.type === 'start'
                  ? t('coordinator.schedule.startNoticeTitle', 'Lưu ý khi ghi đè xuất bến từ Điều phối viên:')
                  : t('coordinator.schedule.completeNoticeTitle', 'Lưu ý khi hoàn tất chuyến:')}
              </span>
              <ul className="list-disc pl-5 m-0 space-y-1 text-slate-600">
                {confirmModal.type === 'start' ? (
                  <>
                    <li className="text-amber-800 font-semibold">
                      {t('coordinator.schedule.startNotice1', 'Quyền bấm xuất phát chính thức ưu tiên cho Bác sĩ thú y / Tài xế tại trang trại khách. Chỉ ghi đè khi nhân sự gặp sự cố thiết bị.')}
                    </li>
                    <li>
                      {t('coordinator.schedule.startNotice2', 'Chuyển trạng thái chuyến đi sang Đang di chuyển.')}
                    </li>
                    <li>
                      {t('coordinator.schedule.startNotice3', 'Kích hoạt tính năng giám sát trực tiếp và định vị hành trình thời gian thực.')}
                    </li>
                    <li>
                      {t('coordinator.schedule.startNotice4', 'Gửi thông báo xuất bến chặng 1 đến khách hàng, tài xế và bác sĩ hộ tống.')}
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      {t('coordinator.schedule.completeNotice1', 'Xác nhận ngựa đã được kiểm tra sức khỏe và bàn giao an toàn tại điểm đích.')}
                    </li>
                    <li>
                      {t('coordinator.schedule.completeNotice2', 'Chuyển trạng thái chuyến đi sang Đã hoàn thành.')}
                    </li>
                    <li>
                      {t('coordinator.schedule.completeNotice3', 'Lưu trữ nhật ký hành trình vào báo cáo tổng kết.')}
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Footer buttons */}
            <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-slate-100 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={closeConfirmModal}
                disabled={actionLoadingId !== null}
                className="text-xs px-4 py-2"
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmAction()}
                disabled={actionLoadingId !== null}
                className={`text-xs px-5 py-2 font-bold text-white flex items-center gap-1.5 ${
                  confirmModal.type === 'start'
                    ? 'bg-[#181A17] hover:bg-[#242722]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {actionLoadingId !== null ? (
                  <>
                    <RefreshCw size={13} className="animate-spin mr-1" />
                    <span>{t('common.processing', 'Đang xử lý...')}</span>
                  </>
                ) : confirmModal.type === 'start' ? (
                  <>
                    <Play size={13} fill="currentColor" />
                    <span>{t('coordinator.schedule.btnConfirmDepart', 'Xác nhận xuất phát')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    <span>{t('coordinator.schedule.btnConfirmComplete', 'Xác nhận hoàn tất')}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
