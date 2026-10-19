'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  AlertCircle,
  Plane,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { trackingApi, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

export default function TripSchedulePage() {
  const { t, translateStatus } = useTranslation();

  const [trips, setTrips] = useState<TripTrackingDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ready_to_depart'); // Default: Chờ xuất phát
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

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

  // Handle Start Trip (Khởi hành chặng 1)
  const handleStartTrip = async (trip: TripTrackingDetails) => {
    const firstLeg = trip.milestones.find((m) => m.itemType === 'leg_start');
    if (!firstLeg) {
      toast.error('Không tìm thấy chặng đầu tiên để xuất phát');
      return;
    }

    if (!confirm(`Xác nhận bắt đầu chuyến đi #${trip.requestCode}? Hệ thống sẽ thông báo cho khách hàng và đội xe.`)) {
      return;
    }

    try {
      setActionLoadingId(trip.shipmentId);
      await trackingApi.checkInLegStart(trip.shipmentId, firstLeg.legId, {
        notes: 'Điều phối viên phát lệnh xuất bến chặng 1',
      });
      toast.success(`Chuyến đi ${trip.requestCode} đã chính thức xuất phát!`);
      await loadScheduleData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể bắt đầu chuyến đi');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Complete Trip (Kết thúc chuyến đi khi nhân viên y tế / tài xế báo hoàn thành)
  const handleCompleteTrip = async (trip: TripTrackingDetails) => {
    if (!confirm(`Xác nhận hoàn tất chuyến đi #${trip.requestCode} sau khi nhân viên y tế và tài xế đã bàn giao ngựa an toàn?`)) {
      return;
    }

    try {
      setActionLoadingId(trip.shipmentId);
      await trackingApi.completeShipment(trip.shipmentId, {
        notes: 'Điều phối viên xác nhận kết thúc chuyến đi sau khi nhận báo cáo bàn giao ngựa an toàn.',
      });
      toast.success(`Chuyến đi ${trip.requestCode} đã hoàn thành an toàn!`);
      await loadScheduleData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể hoàn tất chuyến đi');
    } finally {
      setActionLoadingId(null);
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
            Quản lý giờ xuất bến chặng 1, phát lệnh khởi hành và kết thúc chuyến khi nhân viên y tế báo hoàn thành.
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
                      {/* Code */}
                      <td className="p-4">
                        <p className="font-extrabold text-blue-600 m-0">{trip.requestCode}</p>
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
                        <StatusBadge
                          label={translateStatus(trip.shipmentStatus)}
                          variant={
                            isInTransit ? 'transit' : isCompleted ? 'success' : 'pending'
                          }
                          hasDot={isInTransit}
                        />
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {isReady && (
                          <button
                            onClick={() => handleStartTrip(trip)}
                            disabled={isActionLoading}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Play size={13} fill="currentColor" />
                            <span>{isActionLoading ? 'Đang gửi...' : 'Bắt đầu chuyến đi'}</span>
                          </button>
                        )}

                        {isInTransit && (
                          <button
                            onClick={() => handleCompleteTrip(trip)}
                            disabled={isActionLoading}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            <span>{isActionLoading ? 'Đang lưu...' : 'Kết thúc chuyến đi'}</span>
                          </button>
                        )}

                        {isCompleted && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1">
                            <CheckCircle2 size={13} /> Đã cập bến
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
    </div>
  );
}
