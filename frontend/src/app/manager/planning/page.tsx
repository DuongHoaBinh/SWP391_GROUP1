'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plane,
  Truck,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Filter,
  Search,
  Eye,
  Send,
  UserCheck,
  Check,
  X,
  RefreshCw,
  Loader2,
  Building,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { routesApi, AirlineItem, AirportItem, MasterStopItem, RouteDetail, TripPlanReadiness } from '@/features/routes/api/routes.api';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser, setAuthSession } from '@/lib/auth';
import toast from 'react-hot-toast';

interface OrderItem {
  id: number;
  requestCode: string;
  customerName?: string;
  originLocation: string;
  destinationLocation: string;
  requestedHorseCount: number;
  requestedDate: string;
  status: string;
  routePlan?: RouteDetail | null;
  readiness?: TripPlanReadiness | null;
}

export default function ManagerPlanningPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'ALL' | 'NEED_FRAMEWORK' | 'PENDING_APPROVAL' | 'APPROVED' | 'READY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Master Data
  const [airlines, setAirlines] = useState<AirlineItem[]>([]);
  const [airports, setAirports] = useState<AirportItem[]>([]);
  const [masterStops, setMasterStops] = useState<MasterStopItem[]>([]);
  const [coordinators, setCoordinators] = useState<any[]>([]);

  // Modal 1: Step 1a - Strategic Framework Modal
  const [isFrameworkModalOpen, setIsFrameworkModalOpen] = useState(false);
  const [selectedOrderForFramework, setSelectedOrderForFramework] = useState<OrderItem | null>(null);
  const [frameworkForm, setFrameworkForm] = useState({
    managerVehicleType: 'Xe thùng chuyên dụng điều hòa 18°C',
    managerAirlineId: '',
    managerDepartureAirportId: '',
    managerArrivalAirportId: '',
    managerMainCorridor: '',
    assignedCoordinatorId: '',
    strategicNotes: '',
  });
  const [isSubmittingFramework, setIsSubmittingFramework] = useState(false);

  // Modal 2: Step 2 - Review Detailed Plan Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedOrderForReview, setSelectedOrderForReview] = useState<OrderItem | null>(null);
  const [detailedRoute, setDetailedRoute] = useState<RouteDetail | null>(null);
  const [loadingRouteDetail, setLoadingRouteDetail] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Modal 3: Step 3 - Staff Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<OrderItem | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedEscortId, setSelectedEscortId] = useState('');
  const [assignmentStaffList, setAssignmentStaffList] = useState<any[]>([]);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // Modal 4: Step 4 - Readiness Gate Inspection Modal
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [currentReadiness, setCurrentReadiness] = useState<TripPlanReadiness | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // 0. Ensure Manager session is active
      const user = getCurrentUser();
      if (!user || user.role !== 'LOGISTICS_MANAGER') {
        setAuthSession('mock-jwt-token-manager', {
          id: '2',
          name: 'Alex Morgan',
          email: 'alex.m@racehorse.logistics',
          role: 'LOGISTICS_MANAGER',
          organization: 'RaceHorse Logistics',
          initials: 'AM',
        });
      }

      // 1. Load Master Data
      try {
        const master = await routesApi.getMasterData();
        if (master) {
          setAirlines(master.airlines || []);
          setAirports(master.airports || []);
          setMasterStops(master.masterStops || []);
        }
      } catch (masterErr) {
        console.warn('Failed to load master data:', masterErr);
      }

      // 2. Load Staff list
      try {
        const staffList = await apiClient<any[]>('/fleet/staff');
        if (Array.isArray(staffList)) {
          const coords = staffList.filter((s) => s.roleName.toLowerCase().includes('coordinator'));
          const drivers = staffList.filter(
            (s) => s.roleName.toLowerCase().includes('driver') || s.roleName.toLowerCase().includes('escort')
          );
          setCoordinators(coords);
          setAvailableDrivers(drivers);
        }
      } catch (staffErr) {
        console.warn('Failed to load staff list from backend:', staffErr);
      }

      // 3. Load Orders that are approved or planning
      let rawOrders: any[] = [];
      try {
        rawOrders = await apiClient<any[]>('/orders');
      } catch (ordersErr) {
        console.warn('Failed to load orders from /orders, checking local storage:', ordersErr);
      }

      // Fallback to local storage if backend returned empty or errored
      if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
        try {
          const raw = localStorage.getItem('equitransit_store_requests');
          if (raw) {
            rawOrders = JSON.parse(raw);
          }
        } catch {}
      }

      if (!Array.isArray(rawOrders)) {
        rawOrders = [];
      }

      const filtered = rawOrders.filter(
        (o) =>
          o.status === 'approved' ||
          o.status === 'planning' ||
          o.status === 'confirmed' ||
          o.status === 'ready_to_depart'
      );

      // Enhance orders with route and readiness info
      const enhancedOrders = await Promise.all(
        filtered.map(async (o) => {
          let routePlan: RouteDetail | null = null;
          let readiness: TripPlanReadiness | null = null;
          try {
            routePlan = await routesApi.getRouteByShipmentId(o.id);
          } catch {}
          try {
            readiness = await routesApi.getTripPlanReadiness(o.id);
          } catch {}

          return {
            id: o.id,
            requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
            customerName: o.contactName || o.customer?.fullName || o.customerName || 'Khách hàng',
            originLocation: o.originLocation || o.origin || 'Ho Chi Minh City, Vietnam',
            destinationLocation: o.destinationLocation || o.destination || 'Singapore Turf Club',
            requestedHorseCount: Number(o.requestedHorseCount || o.horseCount || 1),
            requestedDate: o.requestedDate || o.departureDate || '2026-10-20',
            status: o.status,
            routePlan,
            readiness,
          };
        })
      );

      setOrders(enhancedOrders);
    } catch (err) {
      console.error('Failed to load manager planning data:', err);
      toast.error('Không thể tải danh sách kế hoạch vận chuyển');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      o.requestCode.toLowerCase().includes(q) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      o.originLocation.toLowerCase().includes(q) ||
      o.destinationLocation.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (filterTab === 'NEED_FRAMEWORK') {
      return !o.routePlan || o.routePlan.planStatus === 'draft';
    }
    if (filterTab === 'PENDING_APPROVAL') {
      return o.routePlan?.planStatus === 'pending_approval';
    }
    if (filterTab === 'APPROVED') {
      return o.routePlan?.planStatus === 'approved' || o.routePlan?.planStatus === 'confirmed';
    }
    if (filterTab === 'READY') {
      return o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart';
    }
    return true;
  });

  // KPI Metrics
  const needFrameworkCount = orders.filter((o) => !o.routePlan || o.routePlan.planStatus === 'draft').length;
  const pendingApprovalCount = orders.filter((o) => o.routePlan?.planStatus === 'pending_approval').length;
  const readyToDepartCount = orders.filter((o) => o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart').length;

  // --- Handlers for Step 1a: Strategic Framework ---
  const handleOpenFrameworkModal = (order: OrderItem) => {
    setSelectedOrderForFramework(order);
    const existing = order.routePlan;
    setFrameworkForm({
      managerVehicleType: existing?.managerVehicleType || 'Xe thùng chuyên dụng điều hòa 18°C',
      managerAirlineId: existing?.managerAirlineId ? String(existing.managerAirlineId) : (airlines[0]?.id ? String(airlines[0].id) : ''),
      managerDepartureAirportId: existing?.managerDepartureAirportId ? String(existing.managerDepartureAirportId) : (airports[0]?.id ? String(airports[0].id) : ''),
      managerArrivalAirportId: existing?.managerArrivalAirportId ? String(existing.managerArrivalAirportId) : (airports[3]?.id ? String(airports[3].id) : ''),
      managerMainCorridor: existing?.managerMainCorridor || (isInternational(order) ? 'Hành lang Sân bay Quốc tế Tân Sơn Nhất' : 'Tuyến cao tốc liên tỉnh'),
      assignedCoordinatorId: existing?.assignedCoordinatorId ? String(existing.assignedCoordinatorId) : (coordinators[0]?.id ? String(coordinators[0].id) : ''),
      strategicNotes: existing?.strategicNotes || 'Bảo đảm nhiệt độ khoang 18°C, chuẩn bị đệm rơm timothy và bổ sung điện giải trước giờ cất cánh.',
    });
    setIsFrameworkModalOpen(true);
  };

  const handleSaveFramework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForFramework) return;
    setIsSubmittingFramework(true);
    try {
      await routesApi.setStrategicFramework(selectedOrderForFramework.id, {
        managerVehicleType: frameworkForm.managerVehicleType,
        managerAirlineId: frameworkForm.managerAirlineId ? Number(frameworkForm.managerAirlineId) : undefined,
        managerDepartureAirportId: frameworkForm.managerDepartureAirportId ? Number(frameworkForm.managerDepartureAirportId) : undefined,
        managerArrivalAirportId: frameworkForm.managerArrivalAirportId ? Number(frameworkForm.managerArrivalAirportId) : undefined,
        managerMainCorridor: frameworkForm.managerMainCorridor,
        assignedCoordinatorId: frameworkForm.assignedCoordinatorId ? Number(frameworkForm.assignedCoordinatorId) : undefined,
        strategicNotes: frameworkForm.strategicNotes,
      });

      toast.success(`Đã thiết lập khung chiến lược và giao nhiệm vụ cho Coordinator cho đơn ${selectedOrderForFramework.requestCode}!`);
      setIsFrameworkModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể lưu khung kế hoạch');
    } finally {
      setIsSubmittingFramework(false);
    }
  };

  // --- Handlers for Step 2: Manager Review ---
  const handleOpenReviewModal = async (order: OrderItem) => {
    setSelectedOrderForReview(order);
    setIsReviewModalOpen(true);
    setLoadingRouteDetail(true);
    setIsRejecting(false);
    setRejectionReason('');
    try {
      const detail = await routesApi.getRouteByShipmentId(order.id);
      setDetailedRoute(detail);
    } catch (err) {
      toast.error('Không thể tải chi tiết lộ trình');
    } finally {
      setLoadingRouteDetail(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!selectedOrderForReview) return;
    setIsSubmittingReview(true);
    try {
      await routesApi.reviewTripPlan(selectedOrderForReview.id, { status: 'approved' });
      toast.success(`Kế hoạch chuyến đi ${selectedOrderForReview.requestCode} ĐÃ ĐƯỢC PHÊ DUYỆT!`);
      setIsReviewModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể duyệt kế hoạch');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRejectPlan = async () => {
    if (!selectedOrderForReview) return;
    if (!rejectionReason.trim()) {
      toast.error('Vui lòng nhập lý do trả về để Coordinator điều chỉnh');
      return;
    }
    setIsSubmittingReview(true);
    try {
      await routesApi.reviewTripPlan(selectedOrderForReview.id, {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
      });
      toast.success(`Đã trả về kế hoạch ${selectedOrderForReview.requestCode} cho Coordinator điều chỉnh.`);
      setIsReviewModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể trả về kế hoạch');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // --- Handlers for Step 3: Staff Assignment ---
  const handleOpenAssignModal = async (order: OrderItem) => {
    setSelectedOrderForAssign(order);
    setIsAssignModalOpen(true);
    try {
      const plan = await routesApi.getFullTripPlan(order.id);
      setAssignmentStaffList(plan.assignedStaff || []);
      const currentDriver = plan.assignedStaff?.find((s: any) => s.roleInShipment === 'driver');
      const currentEscort = plan.assignedStaff?.find((s: any) => s.roleInShipment === 'escort');
      if (currentDriver) setSelectedDriverId(String(currentDriver.userId));
      if (currentEscort) setSelectedEscortId(String(currentEscort.userId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveStaffAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForAssign) return;
    if (!selectedDriverId) {
      toast.error('Vui lòng chọn ít nhất 1 tài xế chính (Driver)');
      return;
    }
    setIsSubmittingAssign(true);
    try {
      const assignments = [
        { userId: Number(selectedDriverId), roleInShipment: 'driver' },
      ];
      if (selectedEscortId) {
        assignments.push({ userId: Number(selectedEscortId), roleInShipment: 'escort' });
      }

      await apiClient(`/fleet/shipments/${selectedOrderForAssign.id}/assign-staff`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      });

      toast.success(`Đã phân công nhân sự và gửi thông báo nhận chuyến tới tài xế cho đơn ${selectedOrderForAssign.requestCode}!`);
      setIsAssignModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể phân công nhân sự');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  // Helper
  const isInternational = (order: OrderItem) => {
    const o = order.originLocation.toLowerCase();
    const d = order.destinationLocation.toLowerCase();
    return o.includes('singapore') || d.includes('singapore') ||
      o.includes('australia') || d.includes('australia') ||
      o.includes('japan') || d.includes('japan') ||
      o.includes('hong kong') || d.includes('hong kong') ||
      o.includes('malaysia') || d.includes('malaysia') ||
      o.includes('thailand') || d.includes('thailand');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Master Trip Planning & Dispatch Control</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quy trình phê duyệt lộ trình đa phương thức (Flow 3), phân công nhân sự và kiểm soát cổng xuất phát.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : 'text-slate-500'} />
          Làm mới
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">Chờ lập kế hoạch</p>
            <p className="text-2xl font-black text-amber-600 mt-1 m-0">{needFrameworkCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 m-0">Cần thiết lập loại xe và định hướng chặng</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Truck size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">Chờ phê duyệt</p>
            <p className="text-2xl font-black text-blue-600 mt-1 m-0">{pendingApprovalCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 m-0">Coordinator đã hoàn thiện kế hoạch chi tiết</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">Đủ điều kiện xuất phát</p>
            <p className="text-2xl font-black text-emerald-600 mt-1 m-0">{readyToDepartCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 m-0">Kế hoạch đã chốt & kiểm dịch hoàn tất</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filterTab === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả ({orders.length})
            </button>
            <button
              onClick={() => setFilterTab('NEED_FRAMEWORK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filterTab === 'NEED_FRAMEWORK' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Chưa lập kế hoạch ({needFrameworkCount})
            </button>
            <button
              onClick={() => setFilterTab('PENDING_APPROVAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filterTab === 'PENDING_APPROVAL' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Chờ duyệt kế hoạch ({pendingApprovalCount})
            </button>
            <button
              onClick={() => setFilterTab('APPROVED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filterTab === 'APPROVED' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Đã duyệt & Phân công
            </button>
            <button
              onClick={() => setFilterTab('READY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filterTab === 'READY' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Đủ điều kiện xuất phát ({readyToDepartCount})
            </button>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full md:w-64">
            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Tìm mã đơn, nơi đến..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-xs w-full"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Đơn vận chuyển</th>
                <th className="p-4">Hành trình & Loại chuyến</th>
                <th className="p-4">Kế hoạch chiến lược</th>
                <th className="p-4">Trạng thái lộ trình</th>
                <th className="p-4">Điều kiện xuất phát</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">
                    <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
                    Đang tải dữ liệu kế hoạch chuyến đi...
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const plan = order.routePlan;
                  const isIntl = isInternational(order);
                  const planStatus = plan?.planStatus || 'draft';

                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      {/* Code & Horse */}
                      <td className="p-4 align-middle">
                        <span className="font-bold text-blue-600 text-xs">{order.requestCode}</span>
                        <p className="text-xs text-slate-800 font-semibold m-0 mt-0.5">{order.customerName}</p>
                        <p className="text-[11px] text-slate-400 m-0">{order.requestedHorseCount} cá thể ngựa</p>
                      </td>

                      {/* Route Corridor */}
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 leading-normal">
                          <span className="truncate max-w-[140px]" title={order.originLocation}>{order.originLocation}</span>
                          <span className="text-slate-400 font-bold shrink-0 text-sm">→</span>
                          <span className="truncate max-w-[140px] text-blue-700" title={order.destinationLocation}>{order.destinationLocation}</span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold mt-1.5 ${
                            isIntl ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isIntl ? <Plane size={10} /> : <Truck size={10} />}
                          {isIntl ? 'Quốc tế (Đa phương thức)' : 'Nội địa (Đường bộ)'}
                        </span>
                      </td>

                      {/* Strategic Framework */}
                      <td className="p-4 align-middle">
                        {plan?.managerVehicleType ? (
                          <div className="text-xs">
                            <p className="font-semibold text-slate-800 m-0">{plan.managerVehicleType}</p>
                            {plan.managerAirlineName && (
                              <p className="text-[11px] text-blue-600 font-medium m-0 flex items-center gap-1 mt-0.5">
                                <Plane size={11} /> {plan.managerAirlineName} ({plan.managerDepartureAirportCode} → {plan.managerArrivalAirportCode})
                              </p>
                            )}
                            <p className="text-[10px] text-slate-500 m-0 mt-0.5">
                              Phụ trách: <strong>{plan.assignedCoordinatorName || 'Chưa chỉ định'}</strong>
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700 font-semibold italic bg-amber-50 px-2.5 py-1 rounded border border-amber-200 inline-block">
                            Chưa thiết lập kế hoạch
                          </span>
                        )}
                      </td>

                      {/* Plan Status */}
                      <td className="p-4 align-middle">
                        {planStatus === 'draft' && (
                          <span className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} /> Bản nháp (Draft)
                          </span>
                        )}
                        {planStatus === 'pending_approval' && (
                          <span className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                            <Clock size={12} /> Chờ phê duyệt
                          </span>
                        )}
                        {planStatus === 'approved' && (
                          <span className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Check size={12} /> Đã duyệt (Chờ tài xế)
                          </span>
                        )}
                        {planStatus === 'confirmed' && (
                          <span className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Đã nhận chuyến
                          </span>
                        )}
                        {planStatus === 'ready_to_depart' && (
                          <span className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-emerald-600 text-white shadow-xs">
                            <CheckCircle2 size={12} /> Ready to Depart ⚡
                          </span>
                        )}
                      </td>

                      {/* Gate Readiness */}
                      <td className="p-4 align-middle">
                        {order.readiness?.isReadyToDepart ? (
                          <button
                            onClick={() => {
                              setCurrentReadiness(order.readiness || null);
                              setIsReadinessModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-colors shadow-2xs"
                          >
                            <ShieldCheck size={13} /> 100% Đủ điều kiện
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setCurrentReadiness(order.readiness || null);
                              setIsReadinessModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center w-[160px] h-[30px] gap-1.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
                          >
                            <AlertCircle size={12} className="text-amber-500" />
                            Đang chờ ({order.readiness?.pendingConditions?.length || 1} điều kiện)
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Strategic Plan Button */}
                          <button
                            onClick={() => handleOpenFrameworkModal(order)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 ${
                              plan?.managerVehicleType
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                            title="Thiết lập kế hoạch vận chuyển tổng thể"
                          >
                            <Truck size={13} />
                            {plan?.managerVehicleType ? 'Sửa kế hoạch' : 'Thiết lập kế hoạch'}
                          </button>

                          {/* Review Button */}
                          {planStatus === 'pending_approval' && (
                            <button
                              onClick={() => handleOpenReviewModal(order)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                              title="Xem chi tiết các chặng và phê duyệt kế hoạch"
                            >
                              <Eye size={13} /> Duyệt kế hoạch
                            </button>
                          )}

                          {/* Assign Staff Button */}
                          {(planStatus === 'approved' || planStatus === 'confirmed' || planStatus === 'ready_to_depart') && (
                            <button
                              onClick={() => handleOpenAssignModal(order)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                              title="Phân công tài xế và bác sĩ hộ tống"
                            >
                              <UserCheck size={13} /> Phân công nhân sự
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">
                    Không tìm thấy chuyến đi nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: LẬP KHUNG KẾ HOẠCH TỔNG THỂ (MANAGER) */}
      <Modal
        isOpen={isFrameworkModalOpen}
        onClose={() => setIsFrameworkModalOpen(false)}
        title={`Thiết lập khung kế hoạch vận chuyển - ${selectedOrderForFramework?.requestCode}`}
      >
        <form onSubmit={handleSaveFramework} className="flex flex-col gap-4 text-xs">
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-blue-800 leading-relaxed">
            <strong>Vai trò Logistics Manager:</strong> Bạn định hướng loại phương tiện, hãng hàng không,
            cặp sân bay và chỉ định Coordinator. Coordinator sẽ căn cứ vào đây để chọn xe cụ thể, đặt booking và dựng từng chặng chi tiết.
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">1. Loại phương tiện đường bộ yêu cầu *</label>
            <select
              value={frameworkForm.managerVehicleType}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, managerVehicleType: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
              required
            >
              <option value="Xe thùng chuyên dụng điều hòa 18°C">Xe thùng chuyên dụng điều hòa nhiệt độ (18°C - 20°C)</option>
              <option value="Xe van chuyên dụng 2-4 Stall">Xe van chuyên dụng vận tải ngựa thể thao (2 - 4 Stall)</option>
              <option value="Xe tải hạng nặng điều hòa 6-8 Stall">Xe tải hạng nặng điều hòa 6 - 8 Stall</option>
              <option value="Thùng container chuyên dụng cho ngựa">Thùng container đường bộ chuyên dụng</option>
            </select>
          </div>

          {selectedOrderForFramework && isInternational(selectedOrderForFramework) && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex flex-col gap-3">
              <span className="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                <Plane size={14} /> 2. Định hướng Chặng bay Quốc tế (Air Cargo)
              </span>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Hãng hàng không vận chuyển ngựa *</label>
                <select
                  value={frameworkForm.managerAirlineId}
                  onChange={(e) => setFrameworkForm({ ...frameworkForm, managerAirlineId: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
                >
                  {airlines.map((al) => (
                    <option key={al.id} value={al.id}>
                      {al.name} ({al.code}) — {al.cargoServiceName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sân bay xuất phát *</label>
                  <select
                    value={frameworkForm.managerDepartureAirportId}
                    onChange={(e) => setFrameworkForm({ ...frameworkForm, managerDepartureAirportId: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
                  >
                    {airports.map((ap) => (
                      <option key={ap.id} value={ap.id}>
                        {ap.iataCode} - {ap.name} ({ap.country})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sân bay hạ cánh *</label>
                  <select
                    value={frameworkForm.managerArrivalAirportId}
                    onChange={(e) => setFrameworkForm({ ...frameworkForm, managerArrivalAirportId: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
                  >
                    {airports.map((ap) => (
                      <option key={ap.id} value={ap.id}>
                        {ap.iataCode} - {ap.name} ({ap.country})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">3. Tuyến đường chính định hướng</label>
            <input
              type="text"
              placeholder="VD: Tuyến cao tốc Trung Lương - Cảng SGN Cargo"
              value={frameworkForm.managerMainCorridor}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, managerMainCorridor: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none text-xs"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">4. Chỉ định Fleet & Route Coordinator phụ trách *</label>
            <select
              value={frameworkForm.assignedCoordinatorId}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, assignedCoordinatorId: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
              required
            >
              <option value="">-- Chọn điều phối viên --</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">5. Ghi chú & Yêu cầu đặc biệt cho Coordinator</label>
            <textarea
              rows={3}
              value={frameworkForm.strategicNotes}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, strategicNotes: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none text-xs"
              placeholder="Ghi chú về chăm sóc y tế, nhiệt độ xe, trạm dừng chân..."
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 mt-2">
            <Button type="button" variant="outline" onClick={() => setIsFrameworkModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2"
              disabled={isSubmittingFramework}
            >
              {isSubmittingFramework ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}
              Giao kế hoạch cho Coordinator
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: DUYỆT KẾ HOẠCH CHI TIẾT (MANAGER REVIEW) */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title={`Phê duyệt kế hoạch lộ trình chi tiết - ${selectedOrderForReview?.requestCode}`}
      >
        <div className="flex flex-col gap-4 text-xs">
          {loadingRouteDetail ? (
            <div className="p-8 text-center text-slate-500">
              <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
              Đang tải chi tiết các chặng do Coordinator dựng...
            </div>
          ) : detailedRoute ? (
            <>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                <p className="font-bold text-slate-800 text-sm m-0">{detailedRoute.routeName}</p>
                <p className="text-slate-500 text-xs mt-0.5 m-0">
                  Tổng quãng đường: <strong>{detailedRoute.totalDistanceKm || 'N/A'} km</strong> • Điều phối bởi:{' '}
                  <strong>{detailedRoute.assignedCoordinatorName || 'Coordinator'}</strong>
                </p>
              </div>

              {/* Legs list */}
              <div>
                <h5 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 m-0">
                  Danh sách các chặng vận chuyển ({detailedRoute.legs?.length || 0} Chặng)
                </h5>
                <div className="flex flex-col gap-2">
                  {detailedRoute.legs && detailedRoute.legs.length > 0 ? (
                    detailedRoute.legs.map((leg) => (
                      <div key={leg.sequenceNo} className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-slate-800">
                            Chặng {leg.sequenceNo}: {leg.originLocation} → {leg.destinationLocation}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              leg.legType === 'flight' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {leg.legType === 'flight' ? 'HÀNG KHÔNG (BAY)' : 'ĐƯỜNG BỘ (XE THÙNG)'}
                          </span>
                        </div>
                        {leg.legType === 'road' ? (
                          <p className="text-[11px] text-slate-600 m-0">
                            Phương tiện: <strong>{leg.vehiclePlate || 'Chưa gán xe'}</strong> • Dự kiến: {leg.distanceKm || 0} km (~{leg.durationHours || 0}h)
                          </p>
                        ) : (
                          <p className="text-[11px] text-purple-700 m-0 font-medium">
                            Chuyến bay: <strong>{leg.airlineName || 'Airline'} ({leg.flightNumber || 'TBD'})</strong> • Mã đặt chỗ: <strong>{leg.bookingReference || 'Chưa có'}</strong> ({leg.stallsBooked || 1} stalls)
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">Chưa có chặng nào được tạo.</p>
                  )}
                </div>
              </div>

              {/* Stops list */}
              {detailedRoute.stops && detailedRoute.stops.length > 0 && (
                <div>
                  <h5 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 m-0">
                    Trạm dừng nghỉ & Kiểm dịch ({detailedRoute.stops.length} điểm)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detailedRoute.stops.map((s) => (
                      <div key={s.sequenceNo} className="p-2 border border-slate-100 bg-slate-50 rounded text-[11px]">
                        <strong>#{s.sequenceNo} {s.locationName}</strong>
                        <span className="block text-slate-500 text-[10px] uppercase font-semibold">{s.stopType} • {s.country}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="border-t border-slate-200 pt-3 mt-2">
                {!isRejecting ? (
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(true)}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
                    >
                      Trả về yêu cầu điều chỉnh
                    </button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>
                        Đóng
                      </Button>
                      <Button
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2"
                        onClick={handleApprovePlan}
                        disabled={isSubmittingReview}
                      >
                        {isSubmittingReview ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Check size={14} className="mr-1.5" />}
                        Phê duyệt kế hoạch (Approved)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="font-bold text-red-700">Nhập lý do trả về để Coordinator chỉnh sửa *</label>
                    <textarea
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="VD: Cần đổi sang chuyến bay sớm hơn 2 tiếng hoặc bổ sung thêm 1 trạm dừng nghỉ tại Tiền Giang..."
                      className="w-full p-2 border border-red-300 rounded-lg outline-none text-xs"
                      required
                    />
                    <div className="flex justify-end gap-2 mt-1">
                      <Button variant="outline" size="sm" onClick={() => setIsRejecting(false)}>
                        Hủy
                      </Button>
                      <Button variant="danger" size="sm" onClick={handleRejectPlan} disabled={isSubmittingReview}>
                        {isSubmittingReview ? <Loader2 size={14} className="animate-spin mr-1" /> : <X size={14} className="mr-1" />}
                        Xác nhận trả về
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 3: PHÂN CÔNG NHÂN SỰ (MANAGER ASSIGN DRIVER) */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Phân công tài xế & người hộ tống - ${selectedOrderForAssign?.requestCode}`}
      >
        <form onSubmit={handleSaveStaffAssignment} className="flex flex-col gap-4 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-indigo-900 leading-relaxed">
            <strong>Phân công nhân sự:</strong> Chọn tài xế chính (Driver) và người hộ tống (Escort/Vet). Sau khi bạn bấm lưu,
            hệ thống sẽ tự động gửi thông báo đến tài xế để họ bấm <strong>"Xác nhận nhận chuyến"</strong> trên app Driver.
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              🚚 Tài xế chuyên dụng chính (Driver) <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
              required
            >
              <option value="">-- Chọn tài xế điều khiển phương tiện --</option>
              {availableDrivers
                .filter((d) => d.specialization === 'driver' || (!d.specialization && !d.fullName?.toLowerCase().includes('thú y') && !d.email?.includes('escort')))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    🚚 {d.fullName} ({d.phone || d.email})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              🩺 Chuyên viên y tế / Bác sĩ thú y hộ tống (Equine Escort/Vet) (Tùy chọn)
            </label>
            <select
              value={selectedEscortId}
              onChange={(e) => setSelectedEscortId(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none font-medium text-xs bg-white"
            >
              <option value="">-- Chọn chuyên viên y tế / hộ tống đi kèm --</option>
              {availableDrivers
                .filter((d) => d.specialization === 'escort' || (!d.specialization && (d.fullName?.toLowerCase().includes('thú y') || d.email?.includes('escort'))))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    🩺 {d.fullName} ({d.phone || d.email})
                  </option>
                ))}
            </select>
          </div>

          {/* Current Assignment Status */}
          {assignmentStaffList.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <span className="font-bold text-slate-700 block mb-1.5">Tiến độ xác nhận nhận chuyến hiện tại:</span>
              <div className="flex flex-col gap-1.5">
                {assignmentStaffList.map((s: any) => (
                  <div key={s.assignmentId} className="flex justify-between items-center p-2 rounded bg-slate-50 border border-slate-200">
                    <div>
                      <p className="font-bold text-slate-800 m-0">{s.user?.fullName} ({s.roleInShipment})</p>
                      <p className="text-[10px] text-slate-400 m-0">{s.user?.email}</p>
                    </div>
                    {s.isConfirmed ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <Check size={11} /> Đã xác nhận
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                        <Clock size={11} /> Chờ tài xế xác nhận
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 mt-2">
            <Button type="button" variant="outline" onClick={() => setIsAssignModalOpen(false)}>
              Đóng
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2"
              disabled={isSubmittingAssign}
            >
              {isSubmittingAssign ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}
              Lưu phân công & Gửi thông báo
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: CỔNG KIỂM TRA ĐIỀU KIỆN XUẤT PHÁT */}
      <Modal
        isOpen={isReadinessModalOpen}
        onClose={() => setIsReadinessModalOpen(false)}
        title={`Kiểm tra điều kiện xuất phát (Ready to Depart) - ${currentReadiness?.orderCode}`}
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
            <p className="font-bold text-slate-800 text-sm m-0">
              Quy tắc kiểm soát kép (Dual Gate Control)
            </p>
            <p className="text-slate-600 text-xs mt-1 m-0 leading-relaxed">
              Theo quy định vận tải ngựa đua quốc tế, chuyến đi chỉ được chuyển sang <strong>Ready to depart</strong> khi và chỉ khi
              thỏa mãn đồng thời cả 2 điều kiện: Kế hoạch lộ trình đã xác nhận VÀ Toàn bộ hồ sơ kiểm dịch đạt chuẩn 100%.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Condition 1 */}
            <div className={`p-3 rounded-lg border flex items-start gap-3 ${
              currentReadiness?.isPlanConfirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              {currentReadiness?.isPlanConfirmed ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" /> : <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />}
              <div>
                <strong className="block text-xs">Điều kiện 1: Kế hoạch lộ trình & Đội ngũ tài xế đã xác nhận</strong>
                <p className="text-[11px] mt-0.5 m-0">
                  {currentReadiness?.isPlanConfirmed
                    ? 'Kế hoạch đã được phê duyệt và toàn bộ tài xế/hộ tống viên đã bấm xác nhận nhiệm vụ.'
                    : 'Đang chờ hoàn tất dựng chặng, Manager duyệt hoặc chờ tài xế bấm xác nhận nhận chuyến.'}
                </p>
              </div>
            </div>

            {/* Condition 2 */}
            <div className={`p-3 rounded-lg border flex items-start gap-3 ${
              currentReadiness?.isLegalCompliant ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              {currentReadiness?.isLegalCompliant ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />}
              <div>
                <strong className="block text-xs">Điều kiện 2: Hồ sơ pháp lý & Kiểm dịch đạt chuẩn 100%</strong>
                <p className="text-[11px] mt-0.5 m-0">
                  {currentReadiness?.isLegalCompliant
                    ? 'Toàn bộ hộ chiếu ngựa, chứng nhận tiêm phòng, kiểm dịch và hải quan đã được Chuyên viên phê duyệt hợp lệ.'
                    : 'Hồ sơ kiểm dịch chưa hoàn tất hoặc còn tài liệu chờ duyệt / bị từ chối. Chuyến đi chưa được phép xuất cảnh.'}
                </p>
              </div>
            </div>
          </div>

          {currentReadiness?.isReadyToDepart ? (
            <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-900 text-center font-bold">
              🎉 CẢ HAI ĐIỀU KIỆN ĐÃ ĐẠT! Chuyến đi đã đủ điều kiện và sẵn sàng xuất phát (Ready to Depart).
            </div>
          ) : (
            <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
              <strong className="block text-xs text-slate-800 mb-1">Các bước còn thiếu cần hoàn thành:</strong>
              <ul className="m-0 pl-4 list-disc text-[11px] text-slate-600 flex flex-col gap-1">
                {currentReadiness?.pendingConditions?.map((cond, idx) => (
                  <li key={idx}>{cond}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-3">
            <Button variant="outline" onClick={() => setIsReadinessModalOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
