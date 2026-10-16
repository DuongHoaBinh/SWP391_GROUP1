'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { 
  Map, Plus, Search, Filter, Edit, Trash2, MapPin, 
  Clock, Navigation, ShieldCheck, Flag, CheckCircle2, ChevronRight, Eye, Layers,
  Plane, Truck, ArrowRight, AlertCircle, Send, FileCheck, RefreshCw, Sparkles, Building,
  Check, X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useFleetRouteStore, RouteItem } from '@/lib/fleet-route-store';
import { apiClient } from '@/lib/api-client';
import { 
  routesApi, 
  RouteLegItem, 
  RouteStopItem, 
  AirlineItem, 
  AirportItem, 
  MasterStopItem,
  RouteDetail
} from '@/features/routes/api/routes.api';

const RoutePlanningMap = dynamic(
  () => import('@/components/maps/RoutePlanningMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 flex items-center justify-center bg-slate-50 text-slate-400 text-sm rounded-xl">
        Đang tải bản đồ số hành lang quốc tế...
      </div>
    ),
  }
);

interface PlanningOrder {
  id: number;
  requestCode: string;
  customerName?: string;
  horseName: string;
  horseCount: number;
  horses?: Array<{ id?: number; name?: string; breed?: string }>;
  origin: string;
  destination: string;
  departureDate?: string;
  status: string;
  routeDetail?: RouteDetail;
}

function renderHorseNamesDisplay(horses?: Array<{ name?: string }>, horseCount?: number) {
  const names = (horses || []).map((h) => h.name?.trim()).filter(Boolean) as string[];
  const count = horseCount || (names.length > 0 ? names.length : 1);

  if (names.length === 0) {
    return <span>Chiến mã ({count} con)</span>;
  }
  if (names.length === 1) {
    return (
      <span className="flex items-center gap-1.5">
        <span>{names[0]}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">1 con</span>
      </span>
    );
  }
  if (names.length === 2) {
    return (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-900">{names[0]}</span>
        <span className="text-slate-400">&amp;</span>
        <span className="text-slate-900">{names[1]}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">2 ngựa</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="text-slate-900">{names.slice(0, 2).join(', ')}</span>
      <span 
        title={names.join(', ')} 
        className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200 cursor-help"
      >
        +{names.length - 2} con khác ({count} ngựa)
      </span>
    </span>
  );
}

export default function RoutePlanningPage() {
  const { routes, addRoute, updateRoute, deleteRoute, vehicles } = useFleetRouteStore();
  const [activeTab, setActiveTab] = useState<'flow3_planning' | 'corridor_catalog'>('flow3_planning');
  
  // Search & Map
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMapRoute, setActiveMapRoute] = useState<RouteItem | null>(null);
  const [showMap, setShowMap] = useState<boolean>(true);

  // Flow 3: Orders awaiting planning & Master Data
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [airlines, setAirlines] = useState<AirlineItem[]>([]);
  const [airports, setAirports] = useState<AirportItem[]>([]);
  const [masterStops, setMasterStops] = useState<MasterStopItem[]>([]);

  // Detailed Plan Modal (Bước 1b)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPlanningOrder, setSelectedPlanningOrder] = useState<PlanningOrder | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);

  // Detail Plan Form State
  const [planRouteName, setPlanRouteName] = useState('');
  const [planTotalDistanceKm, setPlanTotalDistanceKm] = useState<number>(850);
  const [legs, setLegs] = useState<RouteLegItem[]>([]);
  const [stops, setStops] = useState<RouteStopItem[]>([]);
  const [notes, setNotes] = useState('');

  // Catalog Modals (Legacy support)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);
  const [formData, setFormData] = useState<Partial<RouteItem>>({
    name: '',
    orderCode: '',
    origin: '',
    destination: '',
    distanceKm: 500,
    status: 'planned',
  });

  // Load Master Data & Orders
  const loadMasterDataAndOrders = async () => {
    setIsLoadingOrders(true);
    try {
      // 1. Master Data
      const mData = await routesApi.getMasterData();
      if (mData) {
        setAirlines(mData.airlines || []);
        setAirports(mData.airports || []);
        setMasterStops(mData.masterStops || []);
      }

      // 2. Orders from backend
      const rawOrders = await apiClient<any[]>('/orders');
      if (Array.isArray(rawOrders)) {
        const enriched: PlanningOrder[] = [];
        for (const o of rawOrders) {
          // Fetch route detail for each order
          let routeDetail: RouteDetail | undefined;
          try {
            routeDetail = await routesApi.getRouteByShipmentId(o.id);
          } catch {}

          enriched.push({
            id: o.id,
            requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
            customerName: o.customer?.fullName || o.customerName || 'Khách hàng',
            horseName: o.horses?.[0]?.name || 'Racehorse',
            horseCount: Number(o.requestedHorseCount || o.horses?.length || 1),
            horses: o.horses || [],
            origin: o.originLocation || 'Cu Chi Stables, HCMC',
            destination: o.destinationLocation || 'Singapore Turf Club',
            departureDate: o.requestedDate
              ? new Date(o.requestedDate).toLocaleDateString('vi-VN')
              : 'Oct 20, 2026',
            status: o.status,
            routeDetail,
          });
        }
        setPlanningOrders(enriched);
      }
    } catch (err) {
      console.warn('Failed to load planning data from backend, fallback:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadMasterDataAndOrders();
  }, []);

  // Open Step 1b Detail Plan Builder
  const handleOpenDetailModal = (order: PlanningOrder) => {
    setSelectedPlanningOrder(order);
    const existingRoute = order.routeDetail;

    setPlanRouteName(
      existingRoute?.routeName ||
        `Hành lang vận chuyển: ${order.origin.split(',')[0]} → ${order.destination.split(',')[0]}`
    );
    setPlanTotalDistanceKm(existingRoute?.totalDistanceKm || 850);
    setNotes(existingRoute?.strategicNotes || 'Nhiệt độ khoang xe 18°C. Cung cấp nước điện giải sau mỗi 3 giờ.');

    // Prepopulate existing legs or default 2-leg pattern (Road + Flight)
    if (existingRoute?.legs && existingRoute.legs.length > 0) {
      setLegs(existingRoute.legs);
    } else {
      const defaultLegs: RouteLegItem[] = [
        {
          sequenceNo: 1,
          legType: 'road',
          originLocation: order.origin,
          destinationLocation: 'Sân bay Quốc tế Tân Sơn Nhất (SGN Cargo Terminal)',
          distanceKm: 45,
          durationHours: 2,
          vehiclePlate: vehicles.find(v => v.status === 'available')?.code || 'TRK-VN-089',
        },
        {
          sequenceNo: 2,
          legType: 'flight',
          originLocation: 'Sân bay Quốc tế Tân Sơn Nhất (SGN)',
          destinationLocation: 'Sân bay Quốc tế Singapore Changi (SIN)',
          airlineName: existingRoute?.managerAirlineName || 'Singapore Airlines Cargo',
          flightNumber: 'SQ711',
          bookingReference: 'BK-SQ-2026-9812',
          stallsBooked: order.horseCount,
          durationHours: 2.5,
        },
        {
          sequenceNo: 3,
          legType: 'road',
          originLocation: 'Sân bay Singapore Changi (SIN Cargo Ramp)',
          destinationLocation: order.destination,
          distanceKm: 32,
          durationHours: 1.5,
          vehiclePlate: 'SGP-EQ-004 (Air-Conditioned Stall)',
        },
      ];
      setLegs(defaultLegs);
    }

    // Prepopulate existing stops or defaults
    if (existingRoute?.stops && existingRoute.stops.length > 0) {
      setStops(existingRoute.stops);
    } else {
      setStops([
        {
          sequenceNo: 1,
          stopType: 'rest',
          locationName: 'Trạm dừng chân Củ Chi (Điểm chuẩn bị & tải ngựa)',
          country: 'Vietnam',
        },
        {
          sequenceNo: 2,
          stopType: 'quarantine',
          locationName: 'Trung tâm Kiểm dịch Động vật Cảng Hàng không SGN',
          country: 'Vietnam',
        },
        {
          sequenceNo: 3,
          stopType: 'border_check',
          locationName: 'Trạm Kiểm dịch Cửa khẩu Hàng không Changi (AVS Singapore)',
          country: 'Singapore',
        },
      ]);
    }

    setIsDetailModalOpen(true);
  };

  // Add Leg
  const handleAddLeg = (type: 'road' | 'flight') => {
    const nextSeq = legs.length + 1;
    if (type === 'road') {
      setLegs([
        ...legs,
        {
          sequenceNo: nextSeq,
          legType: 'road',
          originLocation: legs.length > 0 ? legs[legs.length - 1].destinationLocation : 'Điểm tập kết',
          destinationLocation: 'Điểm đến chặng đường bộ',
          distanceKm: 120,
          durationHours: 3,
          vehiclePlate: vehicles[0]?.code || 'TRK-VN-089',
        },
      ]);
    } else {
      setLegs([
        ...legs,
        {
          sequenceNo: nextSeq,
          legType: 'flight',
          originLocation: 'Sân bay xuất phát (SGN)',
          destinationLocation: 'Sân bay hạ cánh (SIN)',
          airlineName: airlines[0]?.name || 'Singapore Airlines Cargo',
          flightNumber: 'SQ-Cargo',
          bookingReference: 'BK-AIR-TBD',
          stallsBooked: selectedPlanningOrder?.horseCount || 1,
          durationHours: 3,
        },
      ]);
    }
  };

  // Remove Leg
  const handleRemoveLeg = (idx: number) => {
    const updated = legs.filter((_, i) => i !== idx).map((l, i) => ({ ...l, sequenceNo: i + 1 }));
    setLegs(updated);
  };

  // Add Stop
  const handleAddStop = (masterStop?: MasterStopItem) => {
    const nextSeq = stops.length + 1;
    if (masterStop) {
      setStops([
        ...stops,
        {
          sequenceNo: nextSeq,
          stopType: masterStop.stopType,
          locationName: masterStop.name,
          country: masterStop.country,
        },
      ]);
      toast.success(`Đã thêm trạm "${masterStop.name}" vào lộ trình!`);
    } else {
      setStops([
        ...stops,
        {
          sequenceNo: nextSeq,
          stopType: 'rest',
          locationName: 'Trạm dừng nghỉ mới',
          country: 'Vietnam',
        },
      ]);
    }
  };

  // Remove Stop
  const handleRemoveStop = (idx: number) => {
    const updated = stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequenceNo: i + 1 }));
    setStops(updated);
  };

  // Save Plan as Draft (Bước 1b)
  const handleSaveDraft = async () => {
    if (!selectedPlanningOrder) return;
    setIsSubmittingPlan(true);
    try {
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || 500,
        legs,
        stops,
      });
      toast.success('Đã lưu bản nháp lộ trình chi tiết thành công!');
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi lưu bản nháp lộ trình');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Submit Plan for Approval (Bước 1b -> Manager duyệt Bước 2)
  const handleSubmitForApproval = async () => {
    if (!selectedPlanningOrder) return;
    if (legs.length === 0) {
      toast.error('Vui lòng dựng ít nhất 1 chặng vận chuyển trước khi gửi duyệt!');
      return;
    }

    setIsSubmittingPlan(true);
    try {
      // 1. Save detailed plan
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || 500,
        legs,
        stops,
      });

      // 2. Submit for approval
      await routesApi.submitPlanForApproval(selectedPlanningOrder.id);
      toast.success('Đã gửi kế hoạch chi tiết cho Logistics Manager phê duyệt!');
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi gửi duyệt kế hoạch');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Filter Orders
  const filteredOrders = planningOrders.filter(
    (o) =>
      o.requestCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.horseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.destination.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Status Badge Helper
  const renderPlanStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending_approval':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <Clock size={12} className="animate-spin text-blue-600" /> Chờ Manager duyệt (Pending)
          </span>
        );
      case 'approved':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" /> Manager đã duyệt (Approved)
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-teal-600" /> Tài xế đã xác nhận (Confirmed)
          </span>
        );
      case 'ready_to_depart':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
            <Sparkles size={12} className="text-purple-600" /> Sẵn sàng xuất phát (Ready to depart)
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
            <AlertCircle size={12} className="text-red-600" /> Bị trả về (Rejected)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
            <Edit size={12} className="text-slate-500" /> Chờ dựng chi tiết (Draft)
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Cross-Border Route Planning</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Điều Phối Tuyến &amp; Kế Hoạch Thực Thi
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Dựng chi tiết từng chặng vận chuyển (đường bộ, chuyến bay), chọn xe có biển số, trạm dừng nghỉ &amp; gửi duyệt cho Manager.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadMasterDataAndOrders}
            disabled={isLoadingOrders}
            className="shadow-sm"
          >
            <RefreshCw size={15} className={`mr-1.5 text-blue-600 ${isLoadingOrders ? 'animate-spin' : ''}`} />
            Làm mới dữ liệu
          </Button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('flow3_planning')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'flow3_planning'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Navigation size={17} />
          Lập kế hoạch lộ trình chi tiết
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 font-extrabold">
            {planningOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('corridor_catalog')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'corridor_catalog'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers size={17} />
          Thư viện Tuyến đường &amp; Bản đồ số
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600 font-extrabold">
            {routes.length}
          </span>
        </button>
      </div>

      {/* TAB 1: FLOW 3 DETAILED PLANNING */}
      {activeTab === 'flow3_planning' && (
        <div className="flex flex-col gap-5">
          {/* Search bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-96">
              <Search size={16} className="text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Tìm mã đơn, tên ngựa, điểm đi, điểm đến..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-none outline-none text-sm w-full bg-transparent"
              />
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>Định hướng từ Manager</span>
              <span className="text-slate-400">→</span>
              <strong className="text-blue-700">Dựng chặng chi tiết</strong>
              <span className="text-slate-400">→</span>
              <span>Gửi duyệt</span>
            </div>
          </div>

          {/* Orders Cards Grid */}
          <div className="flex flex-col gap-4">
            {filteredOrders.map((order) => {
              const route = order.routeDetail;
              const planStatus = route?.planStatus || 'draft';
              const isRejected = planStatus === 'rejected' || (planStatus === 'draft' && Boolean(route?.rejectionReason));

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:border-blue-300 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-blue-600 text-sm bg-blue-50 px-2.5 py-1 rounded-md">
                        {order.requestCode}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-base m-0 flex items-center gap-2">
                          {renderHorseNamesDisplay(order.horses, order.horseCount)}
                        </div>
                        <p className="text-xs text-slate-400 m-0 mt-0.5">Khách hàng: {order.customerName}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {renderPlanStatusBadge(planStatus)}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenDetailModal(order)}
                        className="shadow-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Edit size={14} className="mr-1.5" />
                        {planStatus === 'draft' || isRejected
                          ? 'Dựng kế hoạch chi tiết'
                          : 'Xem & Hiệu chỉnh chặng'}
                      </Button>
                    </div>
                  </div>

                  {/* Manager Strategic Framework Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 rounded-xl border border-blue-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-extrabold text-blue-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-blue-700" />
                        Khung Kế Hoạch Định Hướng (Từ Logistics Manager)
                      </span>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                        <span>
                          Loại xe yêu cầu: <strong className="text-blue-900">{route?.managerVehicleType || 'Xe tải chuyên dụng có stall'}</strong>
                        </span>
                        {route?.managerAirlineName && (
                          <span>
                            Hãng bay: <strong className="text-blue-900">{route.managerAirlineName}</strong>
                          </span>
                        )}
                        {route?.managerDepartureAirportCode && route?.managerArrivalAirportCode && (
                          <span>
                            Sân bay: <strong className="text-blue-900">{route.managerDepartureAirportCode} → {route.managerArrivalAirportCode}</strong>
                          </span>
                        )}
                        {route?.managerMainCorridor && (
                          <span>
                            Hành lang: <strong className="text-slate-800">{route.managerMainCorridor}</strong>
                          </span>
                        )}
                      </div>
                      {route?.strategicNotes && (
                        <p className="text-[11px] text-slate-600 m-0 mt-0.5 italic">
                          Chỉ thị của Manager: &quot;{route.strategicNotes}&quot;
                        </p>
                      )}
                    </div>

                    {route?.assignedCoordinatorName && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Điều phối viên chỉ định</span>
                        <span className="font-bold text-slate-800">{route.assignedCoordinatorName}</span>
                      </div>
                    )}
                  </div>

                  {/* Rejection Alert if rejected */}
                  {isRejected && route?.rejectionReason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Yêu cầu chỉnh sửa từ Manager:</strong> {route.rejectionReason}
                      </div>
                    </div>
                  )}

                  {/* Route & Legs Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px] block">Lộ trình tổng quát</span>
                      <p className="font-semibold text-slate-800 m-0 mt-0.5">
                        {order.origin} → {order.destination}
                      </p>
                      <p className="text-slate-500 m-0 mt-1">
                        Tên tuyến: <strong>{route?.routeName || 'Chưa đặt tên'}</strong> • Cự ly: <strong>{route?.totalDistanceKm || 850} km</strong>
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px] block">
                        Các chặng chi tiết đã dựng ({route?.legs?.length || 0} chặng, {route?.stops?.length || 0} trạm dừng)
                      </span>
                      {route?.legs && route.legs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {route.legs.map((leg) => (
                            <span
                              key={leg.sequenceNo}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                leg.legType === 'flight'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {leg.legType === 'flight' ? '✈️ Bay: ' : '🚚 Xe: '}
                              {leg.legType === 'flight'
                                ? `${leg.flightNumber || 'Flight'} (${leg.departureAirportCode || 'SGN'} → ${leg.arrivalAirportCode || 'SIN'})`
                                : `${leg.vehiclePlate || 'Xe tải'}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic m-0 mt-1">Chưa có chặng nào được dựng. Vui lòng bấm &quot;Dựng kế hoạch chi tiết&quot;.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
                Không tìm thấy đơn vận chuyển nào cần lập kế hoạch.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CORRIDOR CATALOG & MAP */}
      {activeTab === 'corridor_catalog' && (
        <div className="flex flex-col gap-6">
          {/* Interactive Map Visualizer */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="text-blue-600" size={18} />
                <span className="font-bold text-sm text-slate-800">
                  {activeMapRoute
                    ? `Bản đồ lộ trình: ${activeMapRoute.name}`
                    : 'Mô phỏng Bản đồ Tuyến đường & Điểm Kiểm dịch Xuyên Quốc gia'}
                </span>
                {activeMapRoute && (
                  <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                    {activeMapRoute.distanceKm} km
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMap(!showMap)}
                className="text-xs h-8"
              >
                {showMap ? 'Thu gọn bản đồ' : 'Mở bản đồ số'}
              </Button>
            </div>

            {showMap && (
              <div className="rounded-xl overflow-hidden border border-slate-200">
                <RoutePlanningMap
                  originText={activeMapRoute?.origin || 'Trang trại Củ Chi, TP.HCM'}
                  destinationText={activeMapRoute?.destination || 'Singapore Turf Club, Kranji, Singapore'}
                  transportType="International"
                />
              </div>
            )}
          </div>

          {/* Catalog list */}
          <div className="flex flex-col gap-5">
            {routes.map((route) => (
              <div key={route.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 m-0">{route.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 m-0">
                      Khoảng cách ước tính: <strong>{route.distanceKm} km</strong> • {route.stops.length} trạm dừng
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveMapRoute(route);
                      setShowMap(true);
                      window.scrollTo({ top: 180, behavior: 'smooth' });
                    }}
                    className="text-blue-600 hover:bg-blue-50"
                  >
                    <Eye size={14} className="mr-1" /> Xem trên bản đồ
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {route.stops.map((stop) => (
                    <div key={stop.seq} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-500">Stop #{stop.seq}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {stop.type}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900 m-0 line-clamp-1">{stop.name}</p>
                      <p className="text-[11px] text-slate-400 m-0">{stop.country}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: COORDINATOR XÂY DỰNG LỘ TRÌNH CHI TIẾT */}
      {isDetailModalOpen && selectedPlanningOrder && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Xây Dựng Kế Hoạch Lộ Trình Chi Tiết`}
          subtitle={`Đơn hàng: ${selectedPlanningOrder.requestCode} • ${selectedPlanningOrder.horseName} (${selectedPlanningOrder.horseCount} ngựa)`}
          maxWidth="920px"
        >
          <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto pr-1">
            {/* 1. Manager Framework Banner */}
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-blue-900 font-extrabold text-xs uppercase tracking-wide">
                <ShieldCheck size={16} className="text-blue-600" />
                Khung Định Hướng Của Logistics Manager (Cần tuân thủ)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Loại xe Manager chọn:</span>
                  <strong className="text-blue-900">
                    {selectedPlanningOrder.routeDetail?.managerVehicleType || 'Xe chuyên dụng 4 stall'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Hãng hàng không:</span>
                  <strong className="text-blue-900">
                    {selectedPlanningOrder.routeDetail?.managerAirlineName || 'Singapore Airlines Cargo'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Cặp Sân bay:</span>
                  <strong className="text-blue-900">
                    {selectedPlanningOrder.routeDetail?.managerDepartureAirportCode || 'SGN'} → {selectedPlanningOrder.routeDetail?.managerArrivalAirportCode || 'SIN'}
                  </strong>
                </div>
              </div>
              {selectedPlanningOrder.routeDetail?.strategicNotes && (
                <div className="text-[11px] text-slate-600 italic border-t border-blue-100 pt-1.5 mt-0.5">
                  Ghi chú của Manager: &quot;{selectedPlanningOrder.routeDetail.strategicNotes}&quot;
                </div>
              )}
            </div>

            {/* 2. Route Name & Total Distance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Tên Lộ Trình Vận Chuyển <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={planRouteName}
                  onChange={(e) => setPlanRouteName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:border-blue-500 outline-none"
                  placeholder="Ví dụ: Hành lang Củ Chi - Tân Sơn Nhất - Singapore Turf Club"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Tổng cự ly dự kiến (km)
                </label>
                <input
                  type="number"
                  value={planTotalDistanceKm}
                  onChange={(e) => setPlanTotalDistanceKm(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* 3. Multi-modal Legs Builder */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Navigation size={16} className="text-blue-600" />
                    Các Chặng Vận Chuyển Đa Phương Thức (Legs: Đường bộ / Đường bay)
                  </h4>
                  <p className="text-xs text-slate-500 m-0">
                    Coordinator chọn xe có biển số cụ thể và nhập thông tin booking chuyến bay thực tế.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddLeg('road')}
                    className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    <Truck size={13} className="mr-1" /> + Thêm Chặng Đường Bộ
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddLeg('flight')}
                    className="text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
                  >
                    <Plane size={13} className="mr-1" /> + Thêm Chặng Bay
                  </Button>
                </div>
              </div>

              {/* Legs list */}
              <div className="flex flex-col gap-3">
                {legs.map((leg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      leg.legType === 'flight'
                        ? 'bg-purple-50/40 border-purple-200'
                        : 'bg-emerald-50/40 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                          {leg.sequenceNo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            leg.legType === 'flight'
                              ? 'bg-purple-200 text-purple-900'
                              : 'bg-emerald-200 text-emerald-900'
                          }`}
                        >
                          {leg.legType === 'flight' ? '✈️ Chặng Đường Hàng Không' : '🚚 Chặng Đường Bộ'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveLeg(idx)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <Trash2 size={13} /> Xóa chặng
                      </button>
                    </div>

                    {/* Road Leg details */}
                    {leg.legType === 'road' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Chọn Xe Cụ Thể (Biển số / Stall) *</label>
                          <select
                            value={leg.vehiclePlate || ''}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].vehiclePlate = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800"
                          >
                            <option value="">-- Chọn xe chuyên dụng --</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.code}>
                                {v.code} — {v.type} ({v.capacity} stall, Vị trí: {v.location})
                              </option>
                            ))}
                            <option value="TRK-VN-089">TRK-VN-089 (Climate-Controlled 4-Stall)</option>
                            <option value="TRK-VN-102">TRK-VN-102 (Specialized 6-Stall)</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Điểm Xuất Phát Chặng</label>
                          <input
                            type="text"
                            value={leg.originLocation}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].originLocation = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Điểm Đến Chặng</label>
                          <input
                            type="text"
                            value={leg.destinationLocation}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].destinationLocation = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Khoảng cách (km)</label>
                          <input
                            type="number"
                            value={leg.distanceKm || 0}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].distanceKm = Number(e.target.value);
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Thời gian chạy (giờ)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={leg.durationHours || 0}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].durationHours = Number(e.target.value);
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* Flight Leg details */}
                    {leg.legType === 'flight' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Hãng Hàng Không *</label>
                          <select
                            value={leg.airlineName || ''}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].airlineName = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800"
                          >
                            <option value="">-- Chọn hãng bay --</option>
                            {airlines.map((a) => (
                              <option key={a.id} value={a.name}>
                                {a.name} ({a.code})
                              </option>
                            ))}
                            <option value="Singapore Airlines Cargo">Singapore Airlines Cargo (SQ)</option>
                            <option value="Emirates SkyCargo">Emirates SkyCargo (EK)</option>
                            <option value="Qatar Airways Cargo">Qatar Airways Cargo (QR)</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Số Hiệu Chuyến Bay *</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: SQ711 hoặc EK981"
                            value={leg.flightNumber || ''}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].flightNumber = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Mã Đặt Chỗ (AWB / Booking Ref)</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: BK-SQ-88192"
                            value={leg.bookingReference || ''}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].bookingReference = e.target.value;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Số Stall Đã Book</label>
                          <input
                            type="number"
                            min={1}
                            value={leg.stallsBooked || selectedPlanningOrder.horseCount}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].stallsBooked = Number(e.target.value);
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Sân bay cất cánh → hạ cánh</label>
                          <input
                            type="text"
                            value={`${leg.originLocation} → ${leg.destinationLocation}`}
                            onChange={(e) => {
                              const parts = e.target.value.split('→');
                              const updated = [...legs];
                              updated[idx].originLocation = (parts[0] || '').trim();
                              updated[idx].destinationLocation = (parts[1] || '').trim();
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Thời gian bay (giờ)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={leg.durationHours || 2.5}
                            onChange={(e) => {
                              const updated = [...legs];
                              updated[idx].durationHours = Number(e.target.value);
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Stops & Quarantine Stations Catalog */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-amber-600" />
                    Trạm Dừng Nghỉ, Kiểm Dịch &amp; Cửa Khẩu (Stops)
                  </h4>
                  <p className="text-xs text-slate-500 m-0">
                    Bổ sung các trạm kiểm tra thú y và trạm nạp nước / cỏ khô dọc tuyến.
                  </p>
                </div>
              </div>

              {/* Master Stops Quick Picker */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                <span className="text-[11px] font-bold text-amber-900 uppercase block mb-1.5">
                  Chọn nhanh từ Danh mục Trạm Kiểm dịch &amp; Trạm dừng tiêu chuẩn:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {masterStops.map((ms) => (
                    <button
                      key={ms.id}
                      type="button"
                      onClick={() => handleAddStop(ms)}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Plus size={11} /> {ms.name} ({ms.stopType})
                    </button>
                  ))}
                </div>
              </div>

              {/* Stops Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">Tên Trạm / Điểm Kiểm Dịch</th>
                      <th className="p-2.5 w-32">Loại Trạm</th>
                      <th className="p-2.5 w-28">Quốc Gia</th>
                      <th className="p-2.5 w-16 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stops.map((stop, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 text-center font-bold text-slate-500">{stop.sequenceNo}</td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={stop.locationName}
                            onChange={(e) => {
                              const updated = [...stops];
                              updated[idx].locationName = e.target.value;
                              setStops(updated);
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-medium"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={stop.stopType}
                            onChange={(e) => {
                              const updated = [...stops];
                              updated[idx].stopType = e.target.value as any;
                              setStops(updated);
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-semibold"
                          >
                            <option value="rest">Nghỉ ngơi (Rest)</option>
                            <option value="quarantine">Kiểm dịch (Quarantine)</option>
                            <option value="border_check">Cửa khẩu (Border)</option>
                            <option value="refuel">Nhiên liệu (Refuel)</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={stop.country || 'Vietnam'}
                            onChange={(e) => {
                              const updated = [...stops];
                              updated[idx].country = e.target.value;
                              setStops(updated);
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveStop(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Dispatch Instructions & Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Hướng dẫn vận hành &amp; Chăm sóc ngựa trên đường (Notes)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nhiệt độ khoang xe, lịch tiêm/kiểm tra thú y FEI, hướng dẫn bàn giao tại cửa khẩu..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:border-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-4">
            <span className="text-xs text-slate-500">
              Kế hoạch sau khi gửi sẽ được chuyển đến <strong>Logistics Manager</strong> để xem xét và phê duyệt.
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDetailModalOpen(false)}
                disabled={isSubmittingPlan}
                className="border-slate-300 text-slate-600 hover:bg-slate-50 font-medium px-4 py-2"
              >
                Đóng
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSubmittingPlan}
                className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold px-4 py-2"
              >
                Lưu Bản Nháp (Draft)
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmitForApproval}
                disabled={isSubmittingPlan || legs.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 shadow-sm"
              >
                <Send size={14} className="mr-1.5" />
                {isSubmittingPlan ? 'Đang gửi duyệt...' : 'Gửi Duyệt Cho Manager'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
