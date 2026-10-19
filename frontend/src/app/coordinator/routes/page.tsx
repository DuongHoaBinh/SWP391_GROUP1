'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { 
  Map, Plus, Search, Filter, Edit, Trash2, MapPin, 
  Clock, Navigation, ShieldCheck, Flag, CheckCircle2, ChevronRight, Eye, Layers,
  Plane, Truck, ArrowRight, AlertCircle, Send, FileCheck, RefreshCw, Sparkles, Building,
  Check, X, BookmarkPlus, Compass, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useFleetRouteStore, RouteItem, RouteStop } from '@/lib/fleet-route-store';
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
import { buildEquineRoute } from '@/lib/geo-corridors';

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
  const { routes, addRoute, updateRoute, deleteRoute, vehicles, refreshVehicles } = useFleetRouteStore();
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

  // Tab 2 Simulation & Custom Route State
  const [searchOrigin, setSearchOrigin] = useState<string>('Trang trại Củ Chi, TP.HCM');
  const [searchDestination, setSearchDestination] = useState<string>('Singapore Turf Club, Kranji, Singapore');
  const [searchMode, setSearchMode] = useState<'air' | 'road'>('air');
  const [transportTypeChoice, setTransportTypeChoice] = useState<'auto' | 'Domestic' | 'International'>('auto');
  const [simulatedKm, setSimulatedKm] = useState<number>(1450);
  const [simulatedHours, setSimulatedHours] = useState<number>(6);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState<string>('');

  // Catalog Modals (Xem chi tiết & Tạo tuyến mẫu mới)
  const [viewingCatalogRoute, setViewingCatalogRoute] = useState<RouteItem | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveTemplateName, setSaveTemplateName] = useState<string>('');
  const [saveTemplateOrigin, setSaveTemplateOrigin] = useState<string>('');
  const [saveTemplateDestination, setSaveTemplateDestination] = useState<string>('');
  const [saveTemplateDistance, setSaveTemplateDistance] = useState<number>(1000);
  const [saveTemplateStops, setSaveTemplateStops] = useState<RouteStop[]>([]);

  // Open Save Template Modal
  const handleOpenSaveTemplateModal = (fromCurrentSearch = true) => {
    if (fromCurrentSearch) {
      const origClean = searchOrigin.split(',')[0].trim();
      const destClean = searchDestination.split(',')[0].trim();
      setSaveTemplateName(`Hành lang: ${origClean} ➔ ${destClean} (${searchMode === 'air' ? 'Hàng không' : 'Đường bộ'})`);
      setSaveTemplateOrigin(searchOrigin);
      setSaveTemplateDestination(searchDestination);
      setSaveTemplateDistance(simulatedKm || 1000);

      try {
        const routeData = buildEquineRoute(searchOrigin, searchDestination, searchMode);
        const stopsList: RouteStop[] = (routeData.waypoints || []).slice(1, -1).map((w, i) => ({
          seq: i + 1,
          name: w.name,
          type: (w.type === 'checkpoint' ? 'Border Gate' : w.type === 'rest' ? 'Rest' : 'Quarantine') as RouteStop['type'],
          country: w.country || 'Việt Nam',
        }));
        setSaveTemplateStops(stopsList.length > 0 ? stopsList : [
          { seq: 1, name: 'Trạm kiểm dịch động vật xuất phát', type: 'Quarantine', country: 'Việt Nam' },
          { seq: 2, name: 'Trạm kiểm dịch tiếp nhận đích', type: 'Quarantine', country: 'Quốc tế' },
        ]);
      } catch {
        setSaveTemplateStops([
          { seq: 1, name: 'Trạm kiểm dịch động vật xuất phát', type: 'Quarantine', country: 'Việt Nam' },
          { seq: 2, name: 'Trạm kiểm dịch tiếp nhận đích', type: 'Quarantine', country: 'Quốc tế' },
        ]);
      }
    } else {
      setSaveTemplateName('');
      setSaveTemplateOrigin('');
      setSaveTemplateDestination('');
      setSaveTemplateDistance(500);
      setSaveTemplateStops([
        { seq: 1, name: 'Trạm kiểm dịch động vật xuất phát', type: 'Quarantine', country: 'Việt Nam' },
        { seq: 2, name: 'Trạm dừng chân thú y', type: 'Rest', country: 'Việt Nam' },
      ]);
    }
    setIsSaveModalOpen(true);
  };

  // Submit Save Route Template
  const handleSaveTemplateSubmit = () => {
    if (!saveTemplateName.trim()) {
      toast.error('Vui lòng nhập tên tuyến đường mẫu!');
      return;
    }
    if (!saveTemplateOrigin.trim() || !saveTemplateDestination.trim()) {
      toast.error('Vui lòng nhập điểm xuất phát và điểm đến!');
      return;
    }

    const newRoute = addRoute({
      name: saveTemplateName.trim(),
      orderCode: `TEMPLATE-${Date.now().toString().slice(-4)}`,
      origin: saveTemplateOrigin.trim(),
      destination: saveTemplateDestination.trim(),
      distanceKm: Number(saveTemplateDistance) || 500,
      stops: saveTemplateStops,
      status: 'active',
    });

    toast.success('Đã lưu tuyến đường mẫu mới vào Thư viện thành công!');
    setIsSaveModalOpen(false);

    // Apply to map immediately
    setActiveMapRoute(newRoute);
    setSearchOrigin(newRoute.origin);
    setSearchDestination(newRoute.destination);
    setShowMap(true);
  };

  // Load Master Data & Orders
  const loadMasterDataAndOrders = async () => {
    setIsLoadingOrders(true);
    refreshVehicles();
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
          // Chỉ xét các đơn đã được duyệt hoặc đang lên kế hoạch
          const s = String(o.status || '').toLowerCase();
          if (s === 'requested' || s === 'under_review' || s === 'rejected' || s === 'cancelled') {
            continue;
          }

          // Fetch route detail for each order
          let routeDetail: RouteDetail | undefined;
          try {
            routeDetail = await routesApi.getRouteByShipmentId(o.id);
          } catch {}

          // Ẩn những đơn mà Manager chưa thiết lập kế hoạch định hướng (Framework)
          const hasManagerFramework = Boolean(
            routeDetail?.managerVehicleType ||
            routeDetail?.assignedCoordinatorId ||
            routeDetail?.managerAirlineId ||
            s === 'planning' ||
            s === 'confirmed' ||
            s === 'ready_to_depart'
          );

          if (!hasManagerFramework) {
            continue;
          }

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
          {/* Interactive Free Route Search & Simulation Bar */}
          <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Compass className="text-blue-600 shrink-0" size={20} />
                <span className="font-bold text-base text-slate-900">
                  Công Cụ Tra Cứu &amp; Mô Phỏng Lộ Trình Tự Do
                </span>
                <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <span>✨</span> Định tuyến đường bộ thực tế (OSRM)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenSaveTemplateModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                  title="Lưu lộ trình đang tra cứu thành tuyến mẫu trong Thư viện để tái sử dụng sau này"
                >
                  <BookmarkPlus size={15} />
                  <span>Lưu Tuyến Này Vào Thư Viện</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMap(!showMap)}
                  className="text-xs h-8"
                >
                  {showMap ? 'Thu gọn bản đồ' : 'Mở bản đồ số'}
                </Button>
              </div>
            </div>

            {/* Origin & Destination Free Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-2xs">
                <span className="mr-2 text-base shrink-0">🟢</span>
                <div className="flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Điểm xuất phát (Origin)
                  </label>
                  <input
                    type="text"
                    value={searchOrigin}
                    onChange={(e) => setSearchOrigin(e.target.value)}
                    placeholder="Gõ địa chỉ hoặc trang trại (VD: Trang trại Củ Chi, Đà Lạt, Đà Nẵng...)"
                    className="text-xs font-bold text-slate-800 outline-none bg-transparent w-full"
                  />
                </div>
              </div>

              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-2xs">
                <span className="mr-2 text-base shrink-0">🏁</span>
                <div className="flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Điểm đến (Destination)
                  </label>
                  <input
                    type="text"
                    value={searchDestination}
                    onChange={(e) => setSearchDestination(e.target.value)}
                    placeholder="Gõ địa điểm đích (VD: Singapore Turf Club, Royal Bangkok, Sóc Sơn...)"
                    className="text-xs font-bold text-slate-800 outline-none bg-transparent w-full"
                  />
                </div>
              </div>
            </div>

            {/* Quick Suggestion Chips & Scope Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5 border-t border-slate-100 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Gợi ý nhanh:</span>
                {[
                  { label: '🇸🇬 TP.HCM ➔ Singapore', orig: 'Trang trại Củ Chi, TP.HCM', dest: 'Singapore Turf Club, Kranji, Singapore' },
                  { label: '🇹🇭 TP.HCM ➔ Bangkok (Đường bộ)', orig: 'Trang trại Củ Chi, TP.HCM', dest: 'Royal Bangkok Sports Club, Bangkok, Thái Lan' },
                  { label: '🇲🇾 TP.HCM ➔ Malaysia (Selangor)', orig: 'Trang trại Củ Chi, TP.HCM', dest: 'Selangor Turf Club, Kuala Lumpur, Malaysia' },
                  { label: '🇻🇳 TP.HCM ➔ Hà Nội (Nội địa)', orig: 'Trang trại Củ Chi, TP.HCM', dest: 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội' },
                  { label: '⛰️ Đà Lạt ➔ TP.HCM (Nội địa)', orig: 'Trang trại Ngựa Cao nguyên Đà Lạt, Lâm Đồng', dest: 'Trang trại Củ Chi, TP.HCM' },
                  { label: '🏖️ Đà Nẵng ➔ TP.HCM (Nội địa)', orig: 'Trung tâm Huấn luyện Ngựa Đà Nẵng', dest: 'Trang trại Củ Chi, TP.HCM' },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchOrigin(chip.orig);
                      setSearchDestination(chip.dest);
                      setTransportTypeChoice('auto');
                      toast.success(`Đã nạp hành lang: ${chip.label}`);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 font-semibold border border-slate-200 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Scope Segmented Pill */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Phạm vi:</span>
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setTransportTypeChoice('auto')}
                    className={`px-2 py-0.5 rounded text-[11.5px] font-semibold transition-all ${
                      transportTypeChoice === 'auto'
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Tự động kiểm tra: Nếu 2 điểm cùng trong Việt Nam là Nội địa, khác quốc gia là Quốc tế"
                  >
                    ⚡ Tự động
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportTypeChoice('Domestic')}
                    className={`px-2 py-0.5 rounded text-[11.5px] font-semibold transition-all ${
                      transportTypeChoice === 'Domestic'
                        ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🇻🇳 Nội địa
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportTypeChoice('International')}
                    className={`px-2 py-0.5 rounded text-[11.5px] font-semibold transition-all ${
                      transportTypeChoice === 'International'
                        ? 'bg-white text-purple-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🌐 Quốc tế
                  </button>
                </div>
              </div>
            </div>

            {/* Map Canvas */}
            {showMap && (
              <div id="map-section" className="rounded-xl overflow-hidden border border-slate-200 mt-2">
                <RoutePlanningMap
                  originText={searchOrigin}
                  destinationText={searchDestination}
                  transportType={transportTypeChoice === 'auto' ? undefined : transportTypeChoice}
                  onRouteCalculated={(data) => {
                    setSimulatedKm(data.distanceKm);
                    setSimulatedHours(data.durationHours);
                    setSearchMode(data.mode);
                  }}
                />
              </div>
            )}
          </div>

          {/* Catalog list header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="text-blue-600" size={20} />
                <h2 className="text-lg font-bold text-slate-900 m-0">
                  Thư Viện Tuyến Đường Mẫu Chuẩn ({routes.length})
                </h2>
              </div>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Các tuyến đường đã được khảo sát &amp; lưu trữ. Khi khách hàng mới có cùng lộ trình, bạn chỉ cần xem và áp dụng trực tiếp.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-60 shadow-2xs">
                <Search size={14} className="text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Tìm tuyến mẫu trong kho..."
                  value={catalogSearchTerm}
                  onChange={(e) => setCatalogSearchTerm(e.target.value)}
                  className="border-none outline-none text-xs w-full bg-transparent font-medium"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenSaveTemplateModal(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>+ Tạo Tuyến Mẫu Mới</span>
              </Button>
            </div>
          </div>

          {/* Catalog list cards */}
          <div className="flex flex-col gap-4">
            {routes
              .filter(
                (r) =>
                  r.name.toLowerCase().includes(catalogSearchTerm.toLowerCase()) ||
                  r.origin.toLowerCase().includes(catalogSearchTerm.toLowerCase()) ||
                  r.destination.toLowerCase().includes(catalogSearchTerm.toLowerCase())
              )
              .map((route) => (
                <div
                  key={route.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:border-blue-300 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 m-0">{route.name}</h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Khả dụng (Active)
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 m-0 flex items-center gap-2">
                        <span>Lộ trình: <strong className="text-slate-700">{route.origin}</strong> ➔ <strong className="text-slate-700">{route.destination}</strong></span>
                        <span>•</span>
                        <span>Cự ly: <strong className="text-blue-700 font-bold">{route.distanceKm} km</strong></span>
                        <span>•</span>
                        <span>{route.stops?.length || 0} trạm dừng kiểm dịch</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setViewingCatalogRoute(route)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-xs shadow-2xs flex items-center gap-1"
                      >
                        <Eye size={14} />
                        <span>Xem chi tiết</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchOrigin(route.origin);
                          setSearchDestination(route.destination);
                          setActiveMapRoute(route);
                          setShowMap(true);
                          const el = document.getElementById('map-section');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          } else {
                            window.scrollTo({ top: 180, behavior: 'smooth' });
                          }
                          toast.success(`Đã nạp lộ trình "${route.name}" lên bản đồ số!`);
                        }}
                        className="text-slate-700 hover:bg-slate-50 font-semibold text-xs shadow-2xs flex items-center gap-1"
                      >
                        <MapPin size={14} className="text-blue-600" />
                        <span>Nạp lên bản đồ</span>
                      </Button>
                    </div>
                  </div>

                  {/* Stops preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {route.stops?.map((stop) => (
                      <div
                        key={stop.seq}
                        className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-col justify-between gap-1"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-500 text-[10px] uppercase">Trạm #{stop.seq}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              stop.type === 'Quarantine'
                                ? 'bg-amber-100 text-amber-800'
                                : stop.type === 'Border Gate'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {stop.type === 'Quarantine' ? 'Kiểm dịch' : stop.type === 'Border Gate' ? 'Cửa khẩu' : 'Nghỉ thú y'}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 m-0 line-clamp-1">{stop.name}</p>
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
                              const selectedPlate = e.target.value;
                              const plateToIdMap: Record<string, number> = {
                                '51C-888.99': 1,
                                '51D-777.22': 2,
                                '29B-999.11': 3,
                                '60C-555.33': 4,
                                'TRK-VN-089': 3,
                                'TRK-VN-102': 4,
                              };
                              const matchedVehicle = vehicles.find((v) => v.code === selectedPlate);
                              let resolvedVehicleId = plateToIdMap[selectedPlate];
                              if (!resolvedVehicleId && matchedVehicle) {
                                const parsed = Number(String(matchedVehicle.id).replace(/\D/g, ''));
                                if (!isNaN(parsed) && parsed > 0) resolvedVehicleId = parsed;
                              }

                              const updated = [...legs];
                              updated[idx].vehiclePlate = selectedPlate;
                              updated[idx].vehicleId = resolvedVehicleId || null;
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800"
                          >
                            <option value="">-- Chọn xe chuyên dụng --</option>
                            {leg.vehiclePlate && !vehicles.some((v) => v.code === leg.vehiclePlate) && (
                              <option value={leg.vehiclePlate}>{leg.vehiclePlate}</option>
                            )}
                            {vehicles
                              .filter((v) => !v.type?.toLowerCase().includes('air'))
                              .map((v) => {
                                const isBusy =
                                  v.status === 'in_use' &&
                                  v.assignedTripCode &&
                                  v.assignedTripCode !== selectedPlanningOrder?.requestCode;
                                return (
                                  <option key={v.id} value={v.code} disabled={Boolean(isBusy)}>
                                    {v.code} — {v.type} ({v.capacity} stall, Vị trí: {v.location}){' '}
                                    {isBusy
                                      ? `— ⚠️ Đang chạy chuyến ${v.assignedTripCode} (Không khả dụng)`
                                      : v.status === 'in_use'
                                      ? '— (Đang dùng cho chuyến này)'
                                      : '— Sẵn sàng'}
                                  </option>
                                );
                              })}
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

      {/* MODAL 2: XEM CHI TIẾT TUYẾN MẪU TRONG THƯ VIỆN */}
      {viewingCatalogRoute && (
        <Modal
          isOpen={Boolean(viewingCatalogRoute)}
          onClose={() => setViewingCatalogRoute(null)}
          title={`Chi Tiết Tuyến Đường Mẫu`}
          subtitle={`Hành lang chuẩn hóa: ${viewingCatalogRoute.name}`}
          maxWidth="720px"
        >
          <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Overview Card */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-blue-600" />
                  Hành Lang Vận Chuyển Đã Kiểm Chuẩn
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Trạng thái: Hoạt động (Active)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Điểm xuất phát:</span>
                  <strong className="text-slate-800 text-sm">{viewingCatalogRoute.origin}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Điểm đích đến:</span>
                  <strong className="text-slate-800 text-sm">{viewingCatalogRoute.destination}</strong>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs border-t border-blue-100 pt-2 text-slate-700">
                <div>
                  Cự ly ước tính: <strong className="text-blue-900 font-bold">{viewingCatalogRoute.distanceKm} km</strong>
                </div>
                <div>
                  Tổng số trạm dừng: <strong className="text-blue-900 font-bold">{viewingCatalogRoute.stops?.length || 0} trạm</strong>
                </div>
              </div>
            </div>

            {/* Stops list table */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider m-0">
                Danh Sách Các Điểm Dừng Chân, Kiểm Dịch &amp; Cửa Khẩu:
              </h4>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 w-12 text-center">Thứ tự</th>
                      <th className="p-2.5">Tên Trạm / Điểm Kiểm Dịch</th>
                      <th className="p-2.5 w-36">Tính Chất Trạm</th>
                      <th className="p-2.5 w-32">Quốc Gia / Khu Vực</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingCatalogRoute.stops?.map((stop) => (
                      <tr key={stop.seq} className="hover:bg-slate-50/60">
                        <td className="p-2.5 text-center font-bold text-slate-500">#{stop.seq}</td>
                        <td className="p-2.5 font-bold text-slate-800">{stop.name}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              stop.type === 'Quarantine'
                                ? 'bg-amber-100 text-amber-800'
                                : stop.type === 'Border Gate'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {stop.type === 'Quarantine' ? 'Kiểm dịch động vật' : stop.type === 'Border Gate' ? 'Cửa khẩu quốc tế' : 'Trạm dừng nghỉ'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 font-medium">{stop.country}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirm(`Bạn có chắc muốn xóa tuyến mẫu "${viewingCatalogRoute.name}" khỏi thư viện?`)) {
                    deleteRoute(viewingCatalogRoute.id);
                    toast.success('Đã xóa tuyến đường mẫu khỏi thư viện!');
                    setViewingCatalogRoute(null);
                  }
                }}
                className="text-red-600 border-red-200 hover:bg-red-50 text-xs font-semibold"
              >
                <Trash2 size={13} className="mr-1" />
                Xóa tuyến mẫu này
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setViewingCatalogRoute(null)}
                  className="text-xs"
                >
                  Đóng
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveTab('flow3_planning');
                    setViewingCatalogRoute(null);
                    toast.success('Chuyển sang Lập kế hoạch chi tiết cho đơn hàng!');
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs"
                >
                  <Navigation size={13} className="mr-1 text-blue-600" />
                  Dùng Cho Lập Kế Hoạch
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setSearchOrigin(viewingCatalogRoute.origin);
                    setSearchDestination(viewingCatalogRoute.destination);
                    setActiveMapRoute(viewingCatalogRoute);
                    setShowMap(true);
                    setViewingCatalogRoute(null);
                    const el = document.getElementById('map-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    toast.success(`Đã nạp tuyến "${viewingCatalogRoute.name}" lên bản đồ số!`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                >
                  <MapPin size={13} className="mr-1" />
                  Tải Lên Bản Đồ Số
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: TẠO & LƯU TUYẾN ĐƯỜNG MẪU VÀO THƯ VIỆN */}
      {isSaveModalOpen && (
        <Modal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          title={`Lưu Tuyến Đường Mẫu Vào Thư Viện`}
          subtitle="Tạo mới hoặc lưu hành lang vận chuyển chuẩn để tái sử dụng nhanh cho các đơn hàng tiếp theo."
          maxWidth="760px"
        >
          <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Form Fields */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Tên Tuyến Đường Mẫu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="VD: Hành lang TP.HCM ➔ Singapore Turf Club (Hàng không)"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Điểm xuất phát (Origin) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveTemplateOrigin}
                  onChange={(e) => setSaveTemplateOrigin(e.target.value)}
                  placeholder="VD: Trang trại Củ Chi, TP.HCM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Điểm đích đến (Destination) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveTemplateDestination}
                  onChange={(e) => setSaveTemplateDestination(e.target.value)}
                  placeholder="VD: Singapore Turf Club, Kranji, Singapore"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Tổng cự ly ước tính (km)
              </label>
              <input
                type="number"
                value={saveTemplateDistance}
                onChange={(e) => setSaveTemplateDistance(Number(e.target.value))}
                className="w-full sm:w-48 px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-blue-900 outline-none focus:border-blue-500"
              />
            </div>

            {/* Stops Editor */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider m-0">
                    Các trạm kiểm dịch &amp; trạm dừng chân mẫu ({saveTemplateStops.length} trạm)
                  </h4>
                  <p className="text-[11px] text-slate-400 m-0">
                    Có thể thêm/xóa trạm để chuẩn hóa lộ trình cho chú ngựa.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaveTemplateStops([
                      ...saveTemplateStops,
                      {
                        seq: saveTemplateStops.length + 1,
                        name: 'Trạm kiểm dịch mới',
                        type: 'Quarantine',
                        country: 'Việt Nam',
                      },
                    ]);
                  }}
                  className="text-xs font-semibold text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100 flex items-center gap-1"
                >
                  <Plus size={13} /> Thêm trạm
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2 w-10 text-center">#</th>
                      <th className="p-2">Tên Trạm</th>
                      <th className="p-2 w-36">Loại Trạm</th>
                      <th className="p-2 w-28">Quốc Gia</th>
                      <th className="p-2 w-12 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {saveTemplateStops.map((stop, idx) => (
                      <tr key={idx}>
                        <td className="p-2 text-center font-bold text-slate-400">{stop.seq}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={stop.name}
                            onChange={(e) => {
                              const updated = [...saveTemplateStops];
                              updated[idx].name = e.target.value;
                              setSaveTemplateStops(updated);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={stop.type}
                            onChange={(e) => {
                              const updated = [...saveTemplateStops];
                              updated[idx].type = e.target.value as any;
                              setSaveTemplateStops(updated);
                            }}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs font-semibold"
                          >
                            <option value="Quarantine">Kiểm dịch (Quarantine)</option>
                            <option value="Rest">Nghỉ ngơi (Rest)</option>
                            <option value="Border Gate">Cửa khẩu (Border Gate)</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={stop.country}
                            onChange={(e) => {
                              const updated = [...saveTemplateStops];
                              updated[idx].country = e.target.value;
                              setSaveTemplateStops(updated);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = saveTemplateStops
                                .filter((_, i) => i !== idx)
                                .map((s, i) => ({ ...s, seq: i + 1 }));
                              setSaveTemplateStops(updated);
                            }}
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

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-xs font-medium"
              >
                Hủy bỏ
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveTemplateSubmit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <BookmarkPlus size={14} />
                <span>Lưu Tuyến Mẫu Vào Thư Viện</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
