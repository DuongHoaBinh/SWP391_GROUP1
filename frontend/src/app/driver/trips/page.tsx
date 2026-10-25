'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Truck, MapPin, Calendar, Clock, ChevronRight, CheckCircle2, Navigation, 
  ShieldCheck, AlertCircle, RefreshCw, Send, Check, Plane, Info, Stethoscope,
  UserCheck, Layers, X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { routesApi, RouteDetail } from '@/features/routes/api/routes.api';
import { getCurrentUser } from '@/lib/auth';
import { trackingApi } from '@/features/tracking/api/tracking.api';

interface DriverTripItem {
  id: number;
  orderCode: string;
  customerName?: string;
  horseName: string;
  horses?: any[];
  horseCount: number;
  origin: string;
  destination: string;
  departureDate?: string;
  shipmentStatus: string;
  planStatus: string;
  routeDetail?: RouteDetail;
  assignedStaff?: any[];
  assignedVehicles?: any[];
  isCurrentDriverConfirmed: boolean;
  confirmedAt?: string;
  driverRoleInTrip?: string;
  isAssignedToMe?: boolean;
}

export default function DriverTripsPage() {
  const [trips, setTrips] = useState<DriverTripItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [partialDetails, setPartialDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'assigned' | 'all'>('assigned');
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);

  const isEscort =
    currentUser?.specialization === 'escort';

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedTripToConfirm, setSelectedTripToConfirm] = useState<DriverTripItem | null>(null);
  const [confirmationNotes, setConfirmationNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Decline Modal
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [selectedTripToDecline, setSelectedTripToDecline] = useState<DriverTripItem | null>(null);
  const [declineReason, setDeclineReason] = useState('Sốt cao đột xuất / Sức khỏe không đảm bảo');
  const [customDeclineReason, setCustomDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  const loadDriverTrips = async () => {
    setIsLoading(true); setLoadError(''); setPartialDetails(false);
    try {
      const assigned = await trackingApi.getMyTrips();
      const userId = String(getCurrentUser().id);
      const enriched = await Promise.all(assigned.map(async summary => {
        const [orderRes, routeRes, assignRes] = await Promise.allSettled([
          apiClient<any>(`/orders/${summary.shipment_id}`), routesApi.getRouteByShipmentId(summary.shipment_id),
          apiClient<any>(`/fleet/shipments/${summary.shipment_id}/assignments`),
        ]);
        if ([orderRes, routeRes, assignRes].some(result => result.status === 'rejected')) setPartialDetails(true);
        const ord = orderRes.status === 'fulfilled' ? orderRes.value : null;
        const routeDetail = routeRes.status === 'fulfilled' ? routeRes.value : undefined;
        const staff = assignRes.status === 'fulfilled' ? assignRes.value?.staff ?? [] : [];
        const myAssignment = staff.find((item: any) => String(item.userId || item.user?.id || '') === userId);
        return {
          id: summary.shipment_id, orderCode: summary.request_code,
          customerName: ord?.customer?.fullName || summary.contact_name,
          horseName: ord?.horses?.[0]?.name || 'Xem danh sách ngựa trong nhật ký sức khỏe', horses: ord?.horses ?? [],
          horseCount: summary.requested_horse_count, origin: summary.origin_location, destination: summary.destination_location,
          departureDate: summary.requested_date ? new Date(summary.requested_date).toLocaleDateString('vi-VN') : 'Chưa có lịch',
          shipmentStatus: summary.shipment_status, planStatus: summary.route_plan_status, routeDetail,
          assignedStaff: staff, assignedVehicles: assignRes.status === 'fulfilled' ? assignRes.value?.vehicles ?? [] : [],
          isCurrentDriverConfirmed: Boolean(summary.is_confirmed), confirmedAt: myAssignment?.confirmedAt,
          driverRoleInTrip: summary.role_in_shipment, isAssignedToMe: true,
        };
      }));
      setTrips(enriched);
    } catch (err) { setLoadError(err instanceof Error ? err.message : 'Không thể tải danh sách chuyến đi.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    loadDriverTrips();
  }, []);

  const handleOpenConfirmModal = (trip: DriverTripItem) => {
    setSelectedTripToConfirm(trip);
    setConfirmationNotes('');
    setConfirmModalOpen(true);
  };

  const handleConfirmAssignment = async () => {
    if (!selectedTripToConfirm) return;
    setIsConfirming(true);

    try {
      const res = await routesApi.confirmTripAssignment(selectedTripToConfirm.id, {
        confirmationNotes,
      });

      toast.success(
        res.isFullyConfirmed
          ? 'Đã xác nhận chuyến đi! Toàn bộ tổ lái đã sẵn sàng, kế hoạch chuyển sang Confirmed.'
          : 'Bạn đã xác nhận nhận chuyến thành công!'
      );

      setConfirmModalOpen(false);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xác nhận nhận chuyến');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleOpenDeclineModal = (trip: DriverTripItem) => {
    setSelectedTripToDecline(trip);
    setDeclineReason('Sốt cao đột xuất / Sức khỏe không đảm bảo');
    setCustomDeclineReason('');
    setDeclineModalOpen(true);
  };

  const handleDeclineAssignment = async () => {
    if (!selectedTripToDecline) return;
    const finalReason = declineReason === 'Khác' ? customDeclineReason.trim() : declineReason;
    if (!finalReason) {
      toast.error('Vui lòng cung cấp lý do từ chối chuyến đi');
      return;
    }
    setIsDeclining(true);

    try {
      await routesApi.declineTripAssignment(selectedTripToDecline.id, {
        reason: finalReason,
      });

      toast.success('Đã gửi thông báo từ chối nhận chuyến đến Quản lý vận hành!');
      setDeclineModalOpen(false);
      await loadDriverTrips();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể gửi phản hồi từ chối');
    } finally {
      setIsDeclining(false);
    }
  };

  const filteredTrips = trips
    .filter((t) => {
      if (viewMode === 'assigned') {
        return Boolean(t.isAssignedToMe);
      }
      return true;
    })
    .filter(
      (t) =>
        t.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.horseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.destination.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Nhiệm Vụ Vận Chuyển Của Tôi (My Trips)</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Nhiệm Vụ Vận Chuyển &amp; Tiếp Nhận Lộ Trình
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Xem lịch trình điều phối, manifest ngựa, lộ trình các chặng đường bộ &amp; xác nhận tiếp nhận chuyến đi.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadDriverTrips}
          disabled={isLoading}
          className="shadow-sm"
        >
          <RefreshCw size={15} className={`mr-1.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới danh sách
        </Button>
      </div>

      {/* Role Context Notification Banner */}
      <div
        className={`p-3.5 rounded-xl border flex flex-wrap gap-3 items-center justify-between text-xs transition-all ${
          isEscort
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-bold">
          {isEscort ? (
            <Stethoscope size={18} className="text-emerald-600 shrink-0" />
          ) : (
            <Truck size={18} className="text-blue-600 shrink-0" />
          )}
          <span>
            {isEscort
              ? 'Vai trò: Bác Sĩ Thú Y / Chuyên Viên Hộ Tống (Escort/Vet) — Bạn được phân quyền theo dõi lâm sàng & ghi nhật ký sức khỏe ngựa.'
              : 'Vai trò: Tài Xế Lái Xe Chuyên Dụng (Driver) — Bạn phụ trách lái xe an toàn, cập nhật mốc hành trình và kiểm soát trạm dừng.'}
          </span>
        </div>
        <span className="font-semibold text-[11px] opacity-80">
          Đăng nhập: {currentUser?.name || 'Đang tải tài khoản'}
        </span>
      </div>

      {/* View Filter Mode Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('assigned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'assigned'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UserCheck size={14} /> Chuyến được phân công cho tôi ({trips.filter(t => t.isAssignedToMe).length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers size={14} /> Tất cả chuyến được phân công ({trips.length})
          </button>
        </div>

        <input
          aria-label="Tìm chuyến đi" type="search"
          placeholder="Tìm theo mã đơn, điểm đi, điểm đến..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-500 w-full sm:w-64"
        />
      </div>

      {/* Trips list or Empty State */}
      {loadError && <p role="alert" className="p-4 bg-red-50 text-red-700 rounded-xl">{loadError}</p>}
      {partialDetails && <p role="status" className="p-4 bg-amber-50 text-amber-800 rounded-xl">Một số chi tiết lộ trình chưa tải được. Danh sách phân công vẫn được giữ; hãy làm mới để thử lại.</p>}
      {isLoading && !trips.length ? <p role="status" className="p-6">Đang tải chuyến đi…</p> : loadError && !trips.length ? null : filteredTrips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
            <Truck size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-800 m-0">{searchTerm ? 'Không có chuyến khớp tìm kiếm' : 'Chưa có chuyến được phân công'}</h3>
          <p className="text-xs text-slate-500 m-0 max-w-md">
            {viewMode === 'assigned'
              ? `Hiện tại chưa có chuyến đi nào được phân công cho bạn (${currentUser?.name || 'Tài xế'}). Khi Logistics Manager phân công bạn vào chuyến xe, chuyến đi sẽ xuất hiện tại đây.`
              : 'Không tìm thấy chuyến đi nào trong hệ thống.'}
          </p>
          {viewMode === 'assigned' && trips.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setViewMode('all')}>
              Xem tất cả {trips.length} chuyến trong hệ thống
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filteredTrips.map((trip) => {
            const isAwaitingConfirmation = !trip.isCurrentDriverConfirmed;
            const legs = trip.routeDetail?.legs || [];
            const stops = trip.routeDetail?.stops || [];

          return (
            <div
              key={trip.id}
              className={`bg-white rounded-xl border p-6 flex flex-col gap-5 shadow-sm transition-all ${
                isAwaitingConfirmation
                  ? 'border-amber-300 ring-2 ring-amber-100'
                  : 'border-slate-200'
              }`}
            >
              {/* Top Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-extrabold text-blue-600 text-base">{trip.orderCode}</span>
                    <span className="text-xs text-slate-400">• Khách hàng: {trip.customerName}</span>

                    {/* Confirmation Status Badges */}
                    {trip.isCurrentDriverConfirmed ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-600" /> Đã xác nhận nhận chuyến (Confirmed)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 animate-pulse">
                        <AlertCircle size={13} className="text-amber-700" /> Cần xác nhận nhận chuyến
                      </span>
                    )}

                    {trip.planStatus === 'ready_to_depart' && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        🚀 Sẵn sàng xuất phát
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mt-1 m-0">
                    {trip.routeDetail?.routeName || `${trip.origin} → ${trip.destination}`}
                  </h3>
                </div>

                {/* Main Action Buttons: ROLE-BASED VISIBILITY */}
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  {/* CONFIRMATION & DECLINE BUTTONS */}
                  {isAwaitingConfirmation && (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => handleOpenConfirmModal(trip)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md text-xs py-2 px-3.5"
                      >
                        <CheckCircle2 size={15} className="mr-1.5" />
                        {isEscort ? 'Xác Nhận Hộ Tống Chuyến Đi' : 'Xác Nhận Lái Xe Chuyến Đi'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeclineModal(trip)}
                        className="inline-flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-3.5 rounded-lg border border-rose-700 shadow-sm transition-all"
                      >
                        <X size={14} className="mr-1 stroke-[2.5]" />
                        Từ chối
                      </button>
                    </>
                  )}

                  {/* Driver gets prominent Journey Update; Escort gets outline view button */}
                  <Link href={`/driver/status?shipmentId=${trip.id}`}>
                    <Button
                      variant={!isEscort ? 'primary' : 'outline'}
                      size="sm"
                      className={`text-xs ${
                        !isEscort ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold' : ''
                      }`}
                    >
                      <Navigation size={13} className="mr-1 text-blue-500" />
                      {!isEscort ? 'Cập nhật hành trình & đến trạm' : 'Xem lộ trình di chuyển'}
                    </Button>
                  </Link>

                  {/* ONLY Escort sees the Health Observation button; Driver does NOT see it! */}
                  {(trip.driverRoleInTrip === 'driver' || trip.driverRoleInTrip === 'escort') && (
                    <Link href={`/driver/health?shipmentId=${trip.id}`}>
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                      >
                        <Stethoscope size={13} className="mr-1" /> Ghi nhật ký sức khỏe ngựa
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Origin -> Destination Flow */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase m-0">Điểm đón ngựa (Pickup Point)</p>
                    <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.origin}</p>
                    <p className="text-xs text-slate-500 m-0 mt-0.5">Khởi hành dự kiến: <strong>{trip.departureDate}</strong></p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase m-0">Điểm bàn giao cuối (Final Delivery)</p>
                    <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.destination}</p>
                    <p className="text-xs text-slate-500 m-0 mt-0.5">
                      Chiến mã: <strong className="text-slate-900">{trip.horses && trip.horses.length > 0 ? trip.horses.map((h: any) => h.name).filter(Boolean).join(', ') : trip.horseName}</strong> ({trip.horseCount} con)
                    </p>
                  </div>
                </div>
              </div>

              {/* Multi-modal Legs Details */}
              {legs.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Lộ trình các chặng vận chuyển ({legs.length} chặng):
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {legs.map((leg) => (
                      <div
                        key={leg.sequenceNo}
                        className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 ${
                          leg.legType === 'flight'
                            ? 'bg-purple-50/50 border-purple-200'
                            : 'bg-emerald-50/50 border-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700">Chặng {leg.sequenceNo}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white border">
                            {leg.legType === 'flight' ? '✈️ Chặng Bay' : '🚚 Đường bộ'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 m-0 line-clamp-1">
                          {leg.originLocation.split(',')[0]} → {leg.destinationLocation.split(',')[0]}
                        </p>
                        {leg.legType === 'flight' ? (
                          <div className="text-[11px] text-purple-900 font-medium">
                            {leg.airlineName || 'Chưa có hãng bay'} • Chuyến: {leg.flightNumber || 'Chưa có số hiệu'}
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-900 font-medium">
                            Phương tiện: {leg.vehiclePlate || 'Xe chuyên dụng'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stops & Rest stations */}
              {stops.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Trạm dừng &amp; Kiểm dịch:</span>
                  {stops.map((st) => (
                    <span key={st.sequenceNo} className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700">
                      #{st.sequenceNo} {st.locationName} ({st.stopType})
                    </span>
                  ))}
                </div>
              )}

              {/* Instructions and confirmation notes */}
              {trip.routeDetail?.strategicNotes && (
                <div className="text-xs bg-blue-50/50 border border-blue-100 p-2.5 rounded-lg text-blue-900 italic">
                  Chỉ đạo vận hành từ điều phối viên: &quot;{trip.routeDetail.strategicNotes}&quot;
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModalOpen && selectedTripToConfirm && (
        <Modal
          isOpen={confirmModalOpen}
          onClose={() => { if (!isConfirming) setConfirmModalOpen(false); }}
          title="Xác Nhận Tiếp Nhận Nhiệm Vụ Chuyến Đi"
          subtitle={`Đơn hàng: ${selectedTripToConfirm.orderCode} • Mã số chuyến đi: #${selectedTripToConfirm.id}`}
          maxWidth="560px"
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
              <p className="font-bold m-0 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-emerald-700" />
                Cam kết tuân thủ quy chuẩn an toàn vận chuyển ngựa đua
              </p>
              <p className="m-0 mt-1">
                Bằng việc bấm xác nhận, tài xế cam kết đã kiểm tra hệ thống điều hòa khoang xe, camera giám sát, bồn nước uống và các thiết bị giảm sốc trên xe.
              </p>
            </div>

            <div className="text-xs text-slate-700 flex flex-col gap-1">
              <div>
                Chiến mã: <strong className="text-slate-900">{selectedTripToConfirm.horseName}</strong> ({selectedTripToConfirm.horseCount} con)
              </div>
              <div>
                Lộ trình: <strong className="text-slate-900">{selectedTripToConfirm.origin} → {selectedTripToConfirm.destination}</strong>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Ghi chú hoặc lời nhắn xác nhận của Tài xế / Hộ tống viên
              </label>
              <textarea
                aria-label="Ghi chú xác nhận" maxLength={2000} rows={3}
                value={confirmationNotes}
                onChange={(e) => setConfirmationNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:border-blue-500 outline-none resize-none font-medium"
                placeholder="Nhập ghi chú tình trạng kiểm tra xe và sức khỏe ngựa trước khi khởi hành..."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModalOpen(false)}
                disabled={isConfirming}
              >
                Hủy bỏ
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmAssignment}
                disabled={isConfirming}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
              >
                <CheckCircle2 size={16} className="mr-1.5" />
                {isConfirming ? 'Đang xác nhận...' : 'Tôi Xác Nhận Nhận Chuyến'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* DECLINE TRIP MODAL */}
      {declineModalOpen && selectedTripToDecline && (
        <Modal
          isOpen={declineModalOpen}
          onClose={() => { if (!isDeclining) setDeclineModalOpen(false); }}
          title="Từ Chối Nhận Nhiệm Vụ Chuyến Đi"
          subtitle={`Đơn hàng: ${selectedTripToDecline.orderCode} • Tuyến: ${selectedTripToDecline.origin} → ${selectedTripToDecline.destination}`}
          maxWidth="560px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 leading-relaxed">
              <p className="font-bold m-0 flex items-center gap-1.5 text-rose-800">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                Lưu ý quan trọng khi từ chối nhận chuyến
              </p>
              <p className="m-0 mt-1">
                Khi bạn từ chối, hệ thống sẽ gỡ bạn khỏi nhiệm vụ chuyến đi này và tự động gửi thông báo khẩn cấp tới <strong>Logistics Manager</strong> để phân công nhân sự thay thế kịp thời.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1.5 uppercase tracking-wider text-[11px]">
                Chọn lý do từ chối nhanh:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Sốt cao đột xuất / Sức khỏe không đảm bảo',
                  'Xe gặp sự cố kỹ thuật chưa kiểm định kịp',
                  'Bận việc gia đình đột xuất',
                  'Trùng lịch kiểm tra thú y định kỳ',
                  'Khác',
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setDeclineReason(reason)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      declineReason === reason
                        ? 'border-rose-500 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {declineReason === 'Khác' && (
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Nhập lý do chi tiết <span className="text-rose-500">*</span>
                </label>
                <textarea
                  aria-label="Ghi chú xác nhận" maxLength={2000} rows={3}
                  required
                  value={customDeclineReason}
                  onChange={(e) => setCustomDeclineReason(e.target.value)}
                  placeholder="Ghi rõ lý do không thể nhận chuyến..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-rose-500 text-xs font-medium"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeclineModalOpen(false)}
                disabled={isDeclining}
              >
                Quay lại
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleDeclineAssignment}
                disabled={isDeclining}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm"
              >
                <X size={15} className="mr-1.5" />
                {isDeclining ? 'Đang gửi từ chối...' : 'Xác Nhận Từ Chối Chuyến Đi'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
