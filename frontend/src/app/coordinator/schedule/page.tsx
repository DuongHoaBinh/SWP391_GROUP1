'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
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
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Plane,
  Radio,
  Eye,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { trackingApi, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

type CalendarMode = 'week' | 'month';
type ScheduleView = 'calendar' | 'list';

function getTripRange(trip: TripTrackingDetails): { start: Date; end: Date } | null {
  const startMilestone = trip.milestones.find((milestone) => milestone.itemType === 'leg_start');
  const endMilestone = [...trip.milestones].reverse().find((milestone) => milestone.itemType === 'leg_end');
  const startValue = startMilestone?.actualTime || startMilestone?.plannedTime;
  const endValue = endMilestone?.actualTime || endMilestone?.plannedTime || startValue;
  if (!startValue || !endValue) return null;

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end: end < start ? start : end };
}

function escapePrintText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character];
  });
}

export default function TripSchedulePage() {
  const { t, translateStatus } = useTranslation();

  const [trips, setTrips] = useState<TripTrackingDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [scheduleView, setScheduleView] = useState<ScheduleView>('calendar');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');
  const [calendarDate, setCalendarDate] = useState(() => new Date());

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
      const summaryList = await trackingApi.getMyTrips();

      // Fetch tracking details for each trip in parallel to get full vehicle, staff, horse and leg times
      const detailsList = await Promise.all(
        summaryList.map(async (item) => {
          try {
            return await trackingApi.getTrackingDetails(item.shipment_id);
          } catch {
            return null;
          }
        })
      );

      const validDetails = detailsList.filter((d): d is TripTrackingDetails => d !== null);
      setTrips(validDetails);
    } catch (err: any) {
      console.error('Error loading schedule trips:', err);
      toast.error('Không thể tải danh sách lịch trình chuyến đi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // Handle Start Trip (Khởi hành chặng 1) - Opens custom Modal
  const handleStartTrip = (trip: TripTrackingDetails) => {
    const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
    if (!firstLeg) {
      toast.error('Không tìm thấy chặng đầu tiên để xuất phát');
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'start',
      trip,
    });
  };

  // Handle Complete Trip - Opens custom Modal
  const handleCompleteTrip = (trip: TripTrackingDetails) => {
    setConfirmModal({
      isOpen: true,
      type: 'complete',
      trip,
    });
  };

  // Perform confirmed action from custom Modal
  const handleConfirmAction = async () => {
    if (!confirmModal.trip) return;
    const trip = confirmModal.trip;

    if (confirmModal.type === 'start') {
      const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
      if (!firstLeg) {
        toast.error('Không tìm thấy chặng đầu tiên để xuất phát');
        return;
      }
      try {
        setActionLoadingId(trip.shipmentId);
        await trackingApi.checkInLegStart(trip.shipmentId, firstLeg.legId, {
          notes: 'Điều phối viên phát lệnh xuất bến chặng 1',
        });
        toast.success(`Chuyến đi ${trip.requestCode} đã chính thức xuất phát!`);
        setConfirmModal({ isOpen: false, type: 'start', trip: null });
        await loadScheduleData();
      } catch (err: any) {
        toast.error(err?.message || 'Không thể bắt đầu chuyến đi');
      } finally {
        setActionLoadingId(null);
      }
    } else {
      try {
        setActionLoadingId(trip.shipmentId);
        await trackingApi.completeShipment(trip.shipmentId, {
          notes: 'Điều phối viên xác nhận kết thúc chuyến đi sau khi nhận báo cáo bàn giao ngựa an toàn.',
        });
        toast.success(`Chuyến đi ${trip.requestCode} đã hoàn thành an toàn!`);
        setConfirmModal({ isOpen: false, type: 'complete', trip: null });
        await loadScheduleData();
      } catch (err: any) {
        toast.error(err?.message || 'Không thể hoàn tất chuyến đi');
      } finally {
        setActionLoadingId(null);
      }
    }
  };

  // Helper format Departure: Ngày + Giờ cụ thể của chặng 1
  const formatDeparture = (trip: TripTrackingDetails) => {
    const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
    if (firstLeg?.actualTime) {
      const act = new Date(firstLeg.actualTime);
      return {
        date: act.toLocaleDateString('vi-VN'),
        time: act.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isActual: true,
      };
    }
    if (firstLeg?.plannedTime) {
      const plan = new Date(firstLeg.plannedTime);
      return {
        date: plan.toLocaleDateString('vi-VN'),
        time: plan.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isActual: false,
      };
    }
    return {
      date: 'Chưa xếp lịch',
      time: '--:--',
      isActual: false,
    };
  };

  // Helper format Arrival: Chỉ Ngày dự kiến (không kèm giờ theo đề xuất)
  const formatEstimatedArrivalDate = (trip: TripTrackingDetails) => {
    // Nếu có ETA dạng chuỗi hoặc ngày kế hoạch chặng cuối
    const lastLeg = [...trip.milestones].reverse().find((m) => m.itemType === 'leg_end');
    if (lastLeg?.actualTime) {
      const act = new Date(lastLeg.actualTime);
      return `Đã đến: ${act.toLocaleDateString('vi-VN')}`;
    }
    if (lastLeg?.plannedTime) {
      const plan = new Date(lastLeg.plannedTime);
      return `Dự kiến: ${plan.toLocaleDateString('vi-VN')}`;
    }
    if (trip.eta) {
      // Trích xuất phần ngày từ chuỗi ETA nếu có
      const parts = trip.eta.split(' ');
      const datePart = parts.find((p) => p.includes('/') || p.includes('-')) || trip.eta;
      return `Dự kiến: ${datePart}`;
    }
    return 'Dự kiến: Theo tiến độ';
  };

  // Filter trips by search and status
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

  const calendarDates = (() => {
    const anchor = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate());
    if (calendarMode === 'week') {
      const weekday = (anchor.getDay() + 6) % 7;
      anchor.setDate(anchor.getDate() - weekday);
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(anchor);
        date.setDate(anchor.getDate() + index);
        return date;
      });
    }

    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const weekday = (firstOfMonth.getDay() + 6) % 7;
    const firstVisibleDate = new Date(firstOfMonth);
    firstVisibleDate.setDate(firstOfMonth.getDate() - weekday);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstVisibleDate);
      date.setDate(firstVisibleDate.getDate() + index);
      return date;
    });
  })();

  const isVehicleConflict = (trip: TripTrackingDetails) => {
    const tripRange = getTripRange(trip);
    if (!tripRange || !trip.assignedVehicle || trip.shipmentStatus === 'completed' || trip.shipmentStatus === 'cancelled') {
      return false;
    }

    return trips.some((otherTrip) => {
      if (
        otherTrip.shipmentId === trip.shipmentId ||
        otherTrip.assignedVehicle !== trip.assignedVehicle ||
        otherTrip.shipmentStatus === 'completed' ||
        otherTrip.shipmentStatus === 'cancelled'
      ) {
        return false;
      }
      const otherRange = getTripRange(otherTrip);
      return Boolean(
        otherRange &&
          tripRange.start < otherRange.end &&
          otherRange.start < tripRange.end,
      );
    });
  };

  const exportDispatchOrder = (trip: TripTrackingDetails) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đã chặn cửa sổ xuất PDF. Vui lòng cho phép cửa sổ bật lên rồi thử lại.');
      return;
    }

    const safe = escapePrintText;
    const milestones = trip.milestones
      .map((milestone) => {
        const planned = milestone.actualTime || milestone.plannedTime;
        const time = planned ? new Date(planned).toLocaleString('vi-VN') : 'Chưa xếp lịch';
        return `<tr><td>${milestone.seq}</td><td>${safe(milestone.title)}</td><td>${safe(milestone.location)}</td><td>${safe(time)}</td></tr>`;
      })
      .join('');
    const horses = trip.assignedHorses.map((horse) => safe(horse.name)).join(', ') || 'Chưa có thông tin';

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <title>Lệnh điều động ${safe(trip.requestCode)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #172033; margin: 32px; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .subtitle { color: #536174; margin-bottom: 24px; }
            .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 24px; }
            .field { border-bottom: 1px solid #d6dce5; padding: 8px 0; }
            .label { display: block; color: #536174; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #cbd3df; padding: 8px; text-align: left; }
            th { background: #eef2f7; }
            .signatures { display: flex; justify-content: space-between; margin-top: 56px; text-align: center; }
            .signatures div { width: 42%; }
            @media print { body { margin: 16mm; } }
          </style>
        </head>
        <body>
          <h1>LỆNH ĐIỀU ĐỘNG VẬN CHUYỂN</h1>
          <div class="subtitle">Mã chuyến: ${safe(trip.requestCode)} · Ngày lập: ${safe(new Date().toLocaleDateString('vi-VN'))}</div>
          <div class="summary">
            <div class="field"><span class="label">Điểm xuất phát</span>${safe(trip.origin)}</div>
            <div class="field"><span class="label">Điểm đến</span>${safe(trip.destination)}</div>
            <div class="field"><span class="label">Phương tiện</span>${safe(trip.assignedVehicle || 'Chưa phân bổ')}</div>
            <div class="field"><span class="label">Tài xế</span>${safe(trip.assignedDriver || 'Chưa phân công')}</div>
            <div class="field"><span class="label">Hộ tống</span>${safe(trip.assignedEscort || 'Chưa phân công')}</div>
            <div class="field"><span class="label">Ngựa vận chuyển</span>${horses}</div>
          </div>
          <h2>Chặng đường và trạm dừng</h2>
          <table>
            <thead><tr><th>Thứ tự</th><th>Chặng / trạm</th><th>Địa điểm</th><th>Thời gian</th></tr></thead>
            <tbody>${milestones || '<tr><td colspan="4">Chưa có dữ liệu chặng hoặc trạm dừng.</td></tr>'}</tbody>
          </table>
          <div class="signatures">
            <div>Điều phối viên<br /><br /><br />________________________</div>
            <div>Tài xế nhận chuyến<br /><br /><br />________________________</div>
          </div>
          <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  const moveCalendar = (direction: number) => {
    setCalendarDate((date) => {
      const next = new Date(date);
      if (calendarMode === 'week') {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction);
      }
      return next;
    });
  };

  const calendarTitle = calendarMode === 'week'
    ? `${calendarDates[0].toLocaleDateString('vi-VN')} – ${calendarDates[6].toLocaleDateString('vi-VN')}`
    : calendarDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  const readyToDepartCount = trips.filter((t) => t.shipmentStatus === 'ready_to_depart').length;
  const inTransitCount = trips.filter((t) => t.shipmentStatus === 'in_transit' || t.shipmentStatus === 'arrived').length;
  const completedCount = trips.filter((t) => t.shipmentStatus === 'completed').length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              {t('coordinator.schedule.title', 'Lịch Điều độ & Xuất bến Chuyến đi')}
            </h1>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
              {readyToDepartCount} Chuyến chờ xuất phát
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Trạng thái chuyến đi tự động đồng bộ theo thời gian thực khi Bác sĩ thú y / Tài xế bấm xuất phát tại trang trại của khách.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadScheduleData}
            disabled={refreshing}
            className="shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            <span>{refreshing ? 'Đang đồng bộ...' : 'Làm mới'}</span>
          </Button>
        </div>
      </div>

      {/* Search & Filter Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-80">
          <Search size={16} className="text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tài xế, ngựa, xe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('ready_to_depart')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'ready_to_depart'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Chờ xuất phát ({readyToDepartCount})
          </button>

          <button
            onClick={() => setStatusFilter('in_transit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'in_transit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Đang di chuyển ({inTransitCount})
          </button>

          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Đã hoàn thành ({completedCount})
          </button>

          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả ({trips.length})
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setScheduleView('calendar')}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${scheduleView === 'calendar' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Lịch trực quan
          </button>
          <button
            type="button"
            onClick={() => setScheduleView('list')}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${scheduleView === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Danh sách
          </button>
        </div>
        {scheduleView === 'calendar' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setCalendarMode('week')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${calendarMode === 'week' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Tuần
              </button>
              <button
                type="button"
                onClick={() => setCalendarMode('month')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${calendarMode === 'month' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Tháng
              </button>
            </div>
            <button
              type="button"
              onClick={() => moveCalendar(-1)}
              aria-label="Khoảng thời gian trước"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft size={17} />
            </button>
            <strong className="min-w-36 text-center text-sm text-slate-700">{calendarTitle}</strong>
            <button
              type="button"
              onClick={() => moveCalendar(1)}
              aria-label="Khoảng thời gian tiếp theo"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => setCalendarDate(new Date())}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Hôm nay
            </button>
          </div>
        )}
      </div>

      {/* Schedule Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold text-sm">Đang tải lịch điều độ từ cơ sở dữ liệu...</p>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center">
          <Truck size={40} className="text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-800 m-0">Không có chuyến đi nào phù hợp</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Hiện tại không có chuyến đi nào trong mục lọc này. Các chuyến đã hoàn thành Flow 3 (Route Planning) sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : scheduleView === 'calendar' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays size={17} className="text-blue-600" />
              Lịch xe và tài xế theo {calendarMode === 'week' ? 'tuần' : 'tháng'}
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
              <AlertCircle size={14} /> Cảnh báo khi cùng xe có chuyến bị trùng thời gian
            </span>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-bold text-slate-500">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDates.map((date) => {
              const dayTrips = filteredTrips
                .filter((trip) => {
                  const range = getTripRange(trip);
                  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  const dayEnd = new Date(dayStart);
                  dayEnd.setDate(dayEnd.getDate() + 1);
                  return Boolean(
                    range &&
                      range.start < dayEnd &&
                      range.end >= dayStart,
                  );
                })
                .sort((a, b) => (getTripRange(a)?.start.getTime() || 0) - (getTripRange(b)?.start.getTime() || 0));
              const isOutsideMonth = date.getMonth() !== calendarDate.getMonth();
              return (
                <div
                  key={date.toISOString()}
                  className={`min-h-36 border-b border-r border-slate-100 p-2 ${isOutsideMonth && calendarMode === 'month' ? 'bg-slate-50/70' : ''}`}
                >
                  <div className={`mb-2 text-xs font-bold ${isOutsideMonth && calendarMode === 'month' ? 'text-slate-300' : 'text-slate-600'}`}>
                    {date.getDate()}
                  </div>
                  <div className="flex flex-col gap-2">
                    {dayTrips.map((trip) => {
                      const range = getTripRange(trip);
                      const hasConflict = isVehicleConflict(trip);
                      const isDepartureDate = Boolean(
                        range &&
                          range.start.getFullYear() === date.getFullYear() &&
                          range.start.getMonth() === date.getMonth() &&
                          range.start.getDate() === date.getDate(),
                      );
                      return (
                        <div
                          key={trip.shipmentId}
                          className={`rounded-lg border p-2 text-xs ${hasConflict ? 'border-rose-300 bg-rose-50' : 'border-blue-100 bg-blue-50/70'}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-extrabold text-slate-800">{trip.requestCode}</span>
                            {hasConflict && <AlertCircle size={14} className="shrink-0 text-rose-600" aria-label="Trùng lịch xe" />}
                          </div>
                          <div className="mt-1 text-slate-600">
                            {isDepartureDate
                              ? range?.start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) || 'Chưa xếp giờ'
                              : 'Đang trên hành trình'}
                            {isDepartureDate && range?.end && range.end.getTime() !== range.start.getTime()
                              ? ` – ${range.end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </div>
                          <div className="mt-1 truncate font-semibold text-slate-700" title={trip.assignedVehicle || 'Chưa phân bổ xe'}>
                            <Truck size={12} className="mr-1 inline" />{trip.assignedVehicle || 'Chưa phân bổ xe'}
                          </div>
                          <div className="mt-0.5 truncate text-slate-600" title={trip.assignedDriver || 'Chưa phân công tài xế'}>
                            <User size={12} className="mr-1 inline" />{trip.assignedDriver || 'Chưa phân công tài xế'}
                          </div>
                          {hasConflict && (
                            <div className="mt-1 font-bold text-rose-700">Trùng lịch phương tiện</div>
                          )}
                          <button
                            type="button"
                            onClick={() => exportDispatchOrder(trip)}
                            className="mt-2 inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900"
                          >
                            <Download size={12} /> Lệnh điều động
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Mã đơn / Chuyến</th>
                  <th className="p-4">Chiến mã</th>
                  <th className="p-4">Khởi hành (Có Giờ) &amp; Đến đích</th>
                  <th className="p-4">Phương tiện</th>
                  <th className="p-4">Tài xế &amp; Bác sĩ thú y</th>
                  <th className="p-4">Lộ trình vận chuyển</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
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
                      {/* Code & Title */}
                      <td className="p-4">
                        <span className="font-extrabold text-blue-600 block">{trip.requestCode}</span>
                        {trip.customerRequestCode && trip.customerRequestCode !== trip.requestCode && (
                          <span className="text-[10px] text-slate-400 block font-normal">
                            (Mã khách: {trip.customerRequestCode})
                          </span>
                        )}
                        {trip.requestTitle && (
                          <p className="text-xs font-semibold text-slate-800 mt-0.5 m-0 line-clamp-1">
                            {trip.requestTitle}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5 m-0">Khách: {trip.customerName}</p>
                      </td>

                      {/* Horses */}
                      <td className="p-4">
                        {trip.assignedHorses.length > 0 ? (
                          <div>
                            <p className="font-bold text-slate-900 m-0">
                              {trip.assignedHorses.map((h) => h.name).join(', ')}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 m-0">
                              {trip.assignedHorses.length} con ngựa thi đấu
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Đã gán hồ sơ</span>
                        )}
                      </td>

                      {/* Departure (Date + Time) & Arrival (Date only) */}
                      <td className="p-4 text-slate-800">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Clock size={13} className="text-blue-600 shrink-0" />
                          <span>{dep.date} • {dep.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 m-0 flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400 shrink-0" />
                          <span>{arrDateStr}</span>
                        </p>
                      </td>

                      {/* Vehicle */}
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded text-xs font-bold text-slate-800">
                          <Truck size={13} className="text-slate-500" />
                          <span>{trip.assignedVehicle || 'Xe chuyên dụng'}</span>
                        </span>
                      </td>

                      {/* Driver & Escort */}
                      <td className="p-4 text-slate-700">
                        <p className="font-semibold text-xs text-slate-900 m-0 flex items-center gap-1">
                          <User size={13} className="text-blue-600 shrink-0" />
                          <span className="truncate max-w-[160px]">{trip.assignedDriver || 'Đã chỉ định tài xế'}</span>
                        </p>
                        <p className="text-xs text-emerald-700 font-medium mt-0.5 m-0 flex items-center gap-1">
                          <ShieldCheck size={12} className="shrink-0" />
                          <span className="truncate max-w-[160px]">{trip.assignedEscort || 'Bác sĩ thú y áp tải'}</span>
                        </p>
                      </td>

                      {/* Route */}
                      <td className="p-4">
                        <p className="font-semibold text-slate-800 text-xs m-0 max-w-[200px] truncate" title={`${trip.origin} → ${trip.destination}`}>
                          {trip.origin.split(',')[0]} → {trip.destination.split(',')[0]}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 m-0 flex items-center gap-1">
                          <MapPin size={11} /> {trip.totalDistanceKm || 0} km
                        </p>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Chờ nhân sự xuất phát
                          </span>
                        ) : isInTransit ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            Đang di chuyển
                          </span>
                        ) : (
                          <StatusBadge
                            label={translateStatus(trip.shipmentStatus)}
                            variant={isCompleted ? 'success' : 'pending'}
                            hasDot={false}
                          />
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => exportDispatchOrder(trip)}
                          className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Download size={13} />
                          Xuất lệnh PDF
                        </button>
                        {isReady && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium">
                            <Radio size={13} className="text-amber-500 animate-pulse" />
                            <span>Chờ tín hiệu từ hiện trường</span>
                          </div>
                        )}

                        {isInTransit && (
                          <Link
                            href={`/coordinator/monitoring?shipmentId=${trip.shipmentId}`}
                            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                          >
                            <Eye size={13} />
                            <span>Giám sát trực tiếp</span>
                          </Link>
                        )}

                        {isCompleted && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1">
                            <CheckCircle2 size={13} /> Đã hoàn thành
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

      {/* Modern Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.type === 'start' ? 'Xác Nhận Ghi Đè Xuất Bến Thủ Công' : 'Xác Nhận Kết Thúc Chuyến Đi'}
        subtitle={confirmModal.trip ? `Mã đơn vận chuyển: ${confirmModal.trip.requestCode}` : undefined}
        maxWidth="max-w-md"
      >
        {confirmModal.trip && (
          <div className="flex flex-col gap-4 p-5">
            {/* Summary card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hành lang vận chuyển</span>
                <span className="text-xs font-extrabold text-blue-600 px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                  {confirmModal.trip.requestCode}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>{confirmModal.trip.origin.split(',')[0]}</span>
                <span className="text-slate-400">→</span>
                <span className="text-blue-700">{confirmModal.trip.destination.split(',')[0]}</span>
              </div>
              {confirmModal.trip.requestTitle && (
                <div className="text-xs text-slate-500 font-medium">
                  {confirmModal.trip.requestTitle}
                </div>
              )}
            </div>

            {/* Impact Details */}
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex flex-col gap-2 text-xs text-slate-700">
              <span className="font-bold text-blue-900 flex items-center gap-1.5">
                <AlertCircle size={14} className="text-blue-600" />
                {confirmModal.type === 'start' ? 'Lưu ý khi ghi đè xuất bến từ Coordinator:' : 'Lưu ý khi hoàn tất chuyến:'}
              </span>
              <ul className="list-disc pl-5 m-0 space-y-1 text-slate-600">
                {confirmModal.type === 'start' ? (
                  <>
                    <li className="text-amber-800 font-semibold">Quyền bấm xuất phát chính thức ưu tiên cho Bác sĩ thú y / Tài xế tại trang trại khách. Chỉ ghi đè khi nhân sự gặp sự cố thiết bị.</li>
                    <li>Chuyển trạng thái chuyến đi sang <strong>Đang di chuyển (in_transit)</strong>.</li>
                    <li>Kích hoạt tính năng <strong>Live Monitoring</strong> và định vị hành trình thời gian thực.</li>
                    <li>Gửi thông báo xuất bến chặng 1 đến khách hàng, tài xế và bác sĩ hộ tống.</li>
                  </>
                ) : (
                  <>
                    <li>Xác nhận ngựa đã được kiểm tra sức khỏe và bàn giao an toàn tại điểm đích.</li>
                    <li>Chuyển trạng thái chuyến đi sang <strong>Đã hoàn thành (completed)</strong>.</li>
                    <li>Lưu trữ nhật ký hành trình vào báo cáo tổng kết.</li>
                  </>
                )}
              </ul>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                disabled={actionLoadingId !== null}
                className="text-xs px-4 py-2"
              >
                Hủy bỏ
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmAction}
                disabled={actionLoadingId !== null}
                className={`text-xs px-5 py-2 font-bold text-white flex items-center gap-1.5 ${
                  confirmModal.type === 'start'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {actionLoadingId !== null ? (
                  <>
                    <RefreshCw size={13} className="animate-spin mr-1" />
                    <span>Đang xử lý...</span>
                  </>
                ) : confirmModal.type === 'start' ? (
                  <>
                    <Play size={13} fill="currentColor" />
                    <span>Xác nhận xuất phát</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    <span>Xác nhận hoàn tất</span>
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
