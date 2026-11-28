'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plane,
  Truck,
  Ship,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Eye,
  Send,
  UserCheck,
  Check,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DispatchSectionTabs } from '@/components/layout/DispatchSectionTabs';
import {
  routesApi,
  RouteDetail,
  TripPlanReadiness,
} from '@/features/routes/api/routes.api';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

interface OrderItem {
  id: number;
  requestCode: string;
  customerRequestCode?: string;
  customerName?: string;
  originLocation: string;
  destinationLocation: string;
  requestedHorseCount: number;
  requestedDate: string;
  status: string;
  transportType?: string;
  transportMode?: 'road' | 'air' | 'sea' | null;
  tripType?: 'one_way' | 'round_trip' | string;
  paymentFlow?: 'prepaid' | 'postpaid' | string;
  paymentStatus?: string;
  specialRequirements?: string;
  routePlan?: RouteDetail | null;
  readiness?: TripPlanReadiness | null;
  totalCost?: number;
  transportCost?: number;
  insuranceFee?: number;
  bookingType?: string;
  stallUnitPrice?: number;
}

export default function ManagerPlanningPage() {
  const router = useRouter();
  const { t, language, translateStopType, translateCountry } = useLanguage();
  const isEn = language === 'en';

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterTab, setFilterTab] = useState<
    'ALL' | 'NEED_ROUTE' | 'PENDING_APPROVAL' | 'APPROVED' | 'READY' | 'IN_TRANSIT'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal 2: Step 2 - Review Detailed Plan Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedOrderForReview, setSelectedOrderForReview] = useState<OrderItem | null>(null);
  const [detailedRoute, setDetailedRoute] = useState<RouteDetail | null>(null);
  const [loadingRouteDetail, setLoadingRouteDetail] = useState(false);
  const [routeDetailError, setRouteDetailError] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewTransportCost, setReviewTransportCost] = useState<string>('');

  // Modal 3: Step 3 - Staff Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<OrderItem | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedEscortId, setSelectedEscortId] = useState('');
  const [assignmentStaffList, setAssignmentStaffList] = useState<any[]>([]);
  const [assignRouteLegs, setAssignRouteLegs] = useState<any[]>([]);
  const [loadingAssignModal, setLoadingAssignModal] = useState(false);
  const [assignModalError, setAssignModalError] = useState('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // Modal 4: Step 4 - Readiness Gate Inspection Modal
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [currentReadiness, setCurrentReadiness] = useState<TripPlanReadiness | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // 1. Load Staff list (drivers & veterinary escorts)
      try {
        const staffList = await apiClient<any[]>('/fleet/staff');
        if (Array.isArray(staffList)) {
          const drivers = staffList.filter(
            (s) =>
              (s.roleName || '').toLowerCase().includes('driver') ||
              (s.roleName || '').toLowerCase().includes('escort')
          );
          setAvailableDrivers(drivers);
        }
      } catch (staffErr) {
        console.warn('Failed to load staff list from backend:', staffErr);
      }

      // 2. Load Orders eligible for dispatch & planning (consistent with /manager/dispatch/routes)
      const rawRes = await apiClient<any>('/orders');
      const rawOrders: any[] = Array.isArray(rawRes)
        ? rawRes
        : Array.isArray(rawRes?.data)
        ? rawRes.data
        : [];

      const filtered = rawOrders.filter(
        (o) =>
          o.status === 'approved' ||
          o.status === 'planning' ||
          o.status === 'confirmed' ||
          o.status === 'ready_to_depart' ||
          o.status === 'in_transit' ||
          o.status === 'return_pending' ||
          o.status === 'completed'
      );

      // Enhance orders with route and readiness info with concurrency batching
      const enhanceOrder = async (o: any): Promise<OrderItem> => {
        let routePlan: RouteDetail | null = null;
        let readiness: TripPlanReadiness | null = null;
        try {
          routePlan = await routesApi.findRouteByShipmentId(o.id);
        } catch {
          // Order may not have a route yet
        }
        try {
          readiness = await routesApi.getTripPlanReadiness(o.id);
        } catch {
          // Readiness may not exist yet
        }

        return {
          id: o.id,
          requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
          customerRequestCode: o.customerRequestCode || o.customer_request_code,
          customerName: o.contactName || o.customer?.fullName || o.customerName || '',
          originLocation: o.originLocation || o.origin || '',
          destinationLocation: o.destinationLocation || o.destination || '',
          requestedHorseCount: Number(o.requestedHorseCount || o.horseCount || 1),
          requestedDate: o.requestedDate || o.departureDate || '',
          status: o.status,
          transportType: o.transportType || o.transportationType,
          transportMode: o.transportMode || o.transport_mode || null,
          tripType: o.tripType || o.trip_type || 'one_way',
          paymentFlow: o.paymentFlow || o.payment_flow,
          paymentStatus: o.paymentStatus || o.payment_status,
          specialRequirements: o.specialRequirements || o.special_requirements,
          totalCost: o.totalCost !== undefined && o.totalCost !== null ? Number(o.totalCost) : undefined,
          transportCost:
            o.transportCost !== undefined && o.transportCost !== null ? Number(o.transportCost) : undefined,
          insuranceFee:
            o.insuranceFee !== undefined && o.insuranceFee !== null ? Number(o.insuranceFee) : undefined,
          bookingType: o.bookingType ?? o.booking_type,
          stallUnitPrice:
            o.stallUnitPrice !== undefined && o.stallUnitPrice !== null ? Number(o.stallUnitPrice) : undefined,
          routePlan,
          readiness,
        };
      };

      const enhancedOrders: OrderItem[] = [];
      const CHUNK_SIZE = 5;
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        const chunk = filtered.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(chunk.map(enhanceOrder));
        enhancedOrders.push(...chunkResults);
      }

      setOrders(enhancedOrders);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      console.error('Failed to load manager planning data:', err);
      setLoadError(msg || 'Không thể tải danh sách kế hoạch vận chuyển');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return orders.filter((o) => {
      const matchSearch =
        !q ||
        o.requestCode.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        o.originLocation.toLowerCase().includes(q) ||
        o.destinationLocation.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filterTab === 'NEED_ROUTE') {
        return (
          (!o.routePlan || o.routePlan.planStatus === 'draft') &&
          !['in_transit', 'return_pending', 'completed'].includes(o.status)
        );
      }
      if (filterTab === 'PENDING_APPROVAL') {
        return o.routePlan?.planStatus === 'pending_approval';
      }
      if (filterTab === 'APPROVED') {
        return (
          (o.routePlan?.planStatus === 'approved' || o.routePlan?.planStatus === 'confirmed') &&
          !['in_transit', 'return_pending', 'completed'].includes(o.status)
        );
      }
      if (filterTab === 'READY') {
        return (
          (o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart') &&
          !['in_transit', 'return_pending', 'completed'].includes(o.status)
        );
      }
      if (filterTab === 'IN_TRANSIT') {
        return o.status === 'in_transit' || o.status === 'return_pending' || o.routePlan?.planStatus === 'in_transit';
      }
      return true;
    });
  }, [orders, searchQuery, filterTab]);

  // KPI Metrics & Tab counts
  const needRouteCount = orders.filter(
    (o) =>
      (!o.routePlan || o.routePlan.planStatus === 'draft') &&
      !['in_transit', 'return_pending', 'completed'].includes(o.status)
  ).length;
  const pendingApprovalCount = orders.filter(
    (o) => o.routePlan?.planStatus === 'pending_approval'
  ).length;
  const approvedCount = orders.filter(
    (o) =>
      (o.routePlan?.planStatus === 'approved' || o.routePlan?.planStatus === 'confirmed') &&
      !['in_transit', 'return_pending', 'completed'].includes(o.status)
  ).length;
  const readyToDepartCount = orders.filter(
    (o) =>
      (o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart') &&
      !['in_transit', 'return_pending', 'completed'].includes(o.status)
  ).length;
  const inTransitCount = orders.filter(
    (o) => o.status === 'in_transit' || o.status === 'return_pending' || o.routePlan?.planStatus === 'in_transit'
  ).length;

  // Helper: Detect whether an order is international multi-modal
  const isInternational = (order: OrderItem) => {
    const o = (order.originLocation || '').toLowerCase();
    const d = (order.destinationLocation || '').toLowerCase();

    const isDomesticLoc = (loc: string) => {
      const l = loc.toLowerCase();
      return (
        l.includes('vietnam') ||
        l.includes('việt nam') ||
        l.includes('hồ chí minh') ||
        l.includes('hcm') ||
        l.includes('hà nội') ||
        l.includes('đà lạt') ||
        l.includes('bình dương') ||
        l.includes('cà mau') ||
        l.includes('sóc sơn') ||
        l.includes('đà nẵng') ||
        l.includes('cần thơ') ||
        l.includes('hải phòng') ||
        l.includes('củ chi') ||
        l.includes('long an') ||
        l.includes('đồng nai')
      );
    };

    const hasIntlKeyword = (loc: string) => {
      const intlKeywords = [
        'singapore',
        'australia',
        'japan',
        'nhật bản',
        'hong kong',
        'hồng kông',
        'malaysia',
        'thailand',
        'thái lan',
        'bangkok',
        'indonesia',
        'kalimantan',
        'borneo',
        'jakarta',
        'bali',
        'india',
        'belgium',
        'france',
        'germany',
        'usa',
        'united states',
        'uk',
        'china',
        'trung quốc',
        'korea',
        'hàn quốc',
        'cambodia',
        'campuchia',
        'phnom penh',
        'siem reap',
        'laos',
        'lào',
        'vientiane',
        'dubai',
        'uae',
        'qatar',
        'netherlands',
      ];
      return intlKeywords.some((k) => loc.includes(k));
    };

    if (hasIntlKeyword(d) || hasIntlKeyword(o)) return true;
    if (isDomesticLoc(o) && isDomesticLoc(d)) return false;

    const tt = (order.transportType || '').toLowerCase();
    if (tt.includes('domestic') || tt.includes('nội địa')) {
      return false;
    }
    if (tt.includes('international') || tt.includes('quốc tế') || tt.includes('air')) {
      return true;
    }

    if (order.routePlan?.legs?.some((l) => l.legType === 'flight' || (l as any).mode === 'air')) {
      return true;
    }

    if (!isDomesticLoc(d)) return true;
    return false;
  };

  // --- Handlers for Step 2: Manager Review ---
  const isReviewCostLocked = Boolean(
    selectedOrderForReview &&
      (selectedOrderForReview.paymentFlow === 'prepaid' || selectedOrderForReview.paymentStatus === 'succeeded')
  );

  const handleOpenReviewModal = async (order: OrderItem) => {
    setSelectedOrderForReview(order);
    setIsReviewModalOpen(true);
    setLoadingRouteDetail(true);
    setRouteDetailError('');
    setDetailedRoute(null);
    setIsRejecting(false);
    setRejectionReason('');
    setReviewTransportCost(
      order.transportCost != null
        ? String(order.transportCost)
        : String(Math.max(0, Number(order.totalCost || 0) - Number(order.insuranceFee || 0)))
    );
    try {
      const detail = await routesApi.getRouteByShipmentId(order.id);
      setDetailedRoute(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const errText = msg || t('manager.planning.toastLoadFailed', 'Không thể tải chi tiết lộ trình');
      setRouteDetailError(errText);
      toast.error(errText);
    } finally {
      setLoadingRouteDetail(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!selectedOrderForReview || isSubmittingReview) return;

    setIsSubmittingReview(true);
    try {
      const parsedCost = Number(reviewTransportCost);
      const shouldSendCost = !isReviewCostLocked && Number.isFinite(parsedCost) && parsedCost >= 0;
      await routesApi.reviewTripPlan(selectedOrderForReview.id, {
        status: 'approved',
        ...(shouldSendCost ? { transportCost: Math.round(parsedCost) } : {}),
      });
      toast.success(
        t(
          'manager.planning.toastApprovePlanSuccess',
          `Kế hoạch chuyến đi ${selectedOrderForReview.requestCode} ĐÃ ĐƯỢC PHÊ DUYỆT!`,
          { code: selectedOrderForReview.requestCode }
        )
      );
      setIsReviewModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || (isEn ? 'Failed to approve plan' : 'Không thể duyệt kế hoạch'));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRejectPlan = async () => {
    if (!selectedOrderForReview || isSubmittingReview) return;
    if (rejectionReason.trim().length < 5) {
      toast.error(
        t(
          'manager.planning.errRejectReasonMin',
          'Vui lòng nhập lý do trả về tối thiểu 5 ký tự để Coordinator điều chỉnh.'
        )
      );
      return;
    }
    setIsSubmittingReview(true);
    try {
      await routesApi.reviewTripPlan(selectedOrderForReview.id, {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
      });
      toast.success(
        t(
          'manager.planning.toastRejectPlanSuccess',
          `Đã trả về kế hoạch ${selectedOrderForReview.requestCode} cho Coordinator điều chỉnh.`,
          { code: selectedOrderForReview.requestCode }
        )
      );
      setIsReviewModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || (isEn ? 'Failed to return plan' : 'Không thể trả về kế hoạch'));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // --- Handlers for Step 3: Staff Assignment ---
  const handleOpenAssignModal = async (order: OrderItem) => {
    setSelectedOrderForAssign(order);
    setAssignRouteLegs(order.routePlan?.legs || []);
    setIsAssignModalOpen(true);
    setLoadingAssignModal(true);
    setAssignModalError('');
    try {
      try {
        const staffList = await apiClient<any[]>('/fleet/staff');
        if (Array.isArray(staffList)) {
          const drivers = staffList.filter(
            (s) =>
              (s.roleName || '').toLowerCase().includes('driver') ||
              (s.roleName || '').toLowerCase().includes('escort')
          );
          setAvailableDrivers(drivers);
        }
      } catch (e) {
        console.warn('Failed to refresh staff:', e);
      }

      const plan = await routesApi.getFullTripPlan(order.id);
      if (plan.route?.legs && Array.isArray(plan.route.legs)) {
        setAssignRouteLegs(plan.route.legs);
      }
      const staffList = plan.assignedStaff || [];
      setAssignmentStaffList(staffList);

      const currentDriver = staffList.find((s: any) => s.roleInShipment === 'driver');
      const currentEscort = staffList.find((s: any) => s.roleInShipment === 'escort');

      if (currentDriver) {
        const isDriverDeclined = currentDriver.confirmationNotes?.includes('TỪ CHỐI');
        setSelectedDriverId(isDriverDeclined ? '' : String(currentDriver.userId));
      } else {
        setSelectedDriverId('');
      }

      if (currentEscort) {
        const isEscortDeclined = currentEscort.confirmationNotes?.includes('TỪ CHỐI');
        setSelectedEscortId(isEscortDeclined ? '' : String(currentEscort.userId));
      } else {
        setSelectedEscortId('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setAssignModalError(msg || (isEn ? 'Failed to load staff assignments.' : 'Không thể tải danh sách phân công hiện tại.'));
    } finally {
      setLoadingAssignModal(false);
    }
  };

  const handleCloseAssignModal = () => {
    if (isSubmittingAssign) return;
    setIsAssignModalOpen(false);
    setSelectedOrderForAssign(null);
    setSelectedDriverId('');
    setSelectedEscortId('');
    setAssignmentStaffList([]);
    setAssignRouteLegs([]);
    setAssignModalError('');
  };

  const hasPendingOrDeclinedStaff = assignmentStaffList.some(
    (s: any) => !s.isConfirmed || Boolean(s.confirmationNotes?.includes('TỪ CHỐI')),
  );

  const isAssignReadOnly = Boolean(
    selectedOrderForAssign &&
      (['in_transit', 'return_pending', 'completed'].includes(selectedOrderForAssign.status) ||
        ['in_transit', 'completed'].includes(selectedOrderForAssign.routePlan?.planStatus || ''))
  );

  const assignEffectiveLegs =
    assignRouteLegs.length > 0 ? assignRouteLegs : selectedOrderForAssign?.routePlan?.legs || [];

  const isConsigneePickupPlate = (plate?: string | null) => {
    const p = String(plate || '').toLowerCase();
    return (
      p.includes('đến đón') ||
      p.includes('đến rước') ||
      p.includes('bên nhận') ||
      p.includes('consignee') ||
      p.includes('trạm đối tác') ||
      p.includes('partner depot')
    );
  };

  const isAssignSeaShipment = Boolean(
    assignEffectiveLegs.some((l: any) => l.legType === 'sea' || l.mode === 'sea') ||
      (selectedOrderForAssign as any)?.transportMode === 'sea'
  );

  const isAssignAirShipment = Boolean(
    !isAssignSeaShipment &&
      (assignEffectiveLegs.some((l: any) => l.legType === 'flight' || l.mode === 'air') ||
        selectedOrderForAssign?.routePlan?.managerAirlineId ||
        selectedOrderForAssign?.routePlan?.managerDepartureAirportId ||
        (selectedOrderForAssign as any)?.transportMode === 'air')
  );

  const hasCompanyRoadLegForAssign =
    assignEffectiveLegs.length === 0
      ? true
      : assignEffectiveLegs.some(
          (l: any, idx: number) =>
            l.legType === 'road' &&
            (Boolean(l.vehicleId) ||
              (Boolean(l.vehiclePlate) && !isConsigneePickupPlate(l.vehiclePlate)) ||
              idx === 0)
        );

  const isDriverRequiredForAssign = hasCompanyRoadLegForAssign;
  const isEscortRequiredForAssign = isAssignAirShipment || isAssignSeaShipment;

  const handleSaveStaffAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForAssign || isSubmittingAssign || isAssignReadOnly) return;

    if (isDriverRequiredForAssign && !selectedDriverId) {
      toast.error(
        isAssignSeaShipment
          ? isEn
            ? 'Please select an available Truck Driver for the departure seaport transfer leg!'
            : 'Vui lòng chọn Tài xế phụ trách chặng xe thùng trung chuyển ra cảng biển xuất cảnh!'
          : isAssignAirShipment
            ? isEn
              ? 'Please select an available Truck Driver for the departure airport transfer leg!'
              : 'Vui lòng chọn Tài xế phụ trách chặng xe thùng trung chuyển ra sân bay xuất cảnh!'
            : t('manager.planning.toastSelectDriver', 'Vui lòng chọn 1 tài xế chính đang rảnh!')
      );
      return;
    }

    if (isEscortRequiredForAssign && !selectedEscortId) {
      toast.error(
        isAssignSeaShipment
          ? isEn
            ? 'Sea transport shipments require an Equine Vet / Medical Escort to accompany the vessel and port customs clearance!'
            : 'Đơn vận chuyển đường thủy bắt buộc phải phân công Bác sĩ thú y / Chuyên viên hộ tống đi cùng tàu và thông quan cảng!'
          : isEn
            ? 'Air transport shipments require an Equine Vet / Medical Escort to accompany the flight and destination customs clearance!'
            : 'Đơn vận chuyển hàng không bắt buộc phải phân công Bác sĩ thú y / Chuyên viên hộ tống đi cùng chuyến bay và thông quan đích!'
      );
      return;
    }

    if (!selectedDriverId && !selectedEscortId) {
      toast.error(
        isEn
          ? 'Please select at least one driver or veterinary escort for this shipment!'
          : 'Vui lòng chọn ít nhất 1 nhân sự phụ trách chuyến đi!'
      );
      return;
    }

    if (selectedDriverId) {
      const declinedDriver = assignmentStaffList.find(
        (s: any) =>
          s.roleInShipment === 'driver' &&
          s.userId === Number(selectedDriverId) &&
          s.confirmationNotes?.includes('TỪ CHỐI')
      );
      if (declinedDriver) {
        toast.error(
          isEn
            ? `Driver ${declinedDriver.user?.fullName || ''} previously declined this trip! Please select another available driver.`
            : `Tài xế ${declinedDriver.user?.fullName || ''} đã từ chối chuyến này trước đó! Vui lòng chọn tài xế khác đang rảnh.`
        );
        return;
      }

      const driverObj = availableDrivers.find((d) => String(d.id) === String(selectedDriverId));
      const isCurrentDriver = assignmentStaffList.some(
        (s: any) => s.userId === Number(selectedDriverId) && s.roleInShipment === 'driver'
      );
      if (driverObj && Number(driverObj.activeTrips || 0) > 0 && !isCurrentDriver) {
        toast.error(
          isEn
            ? `Driver ${driverObj.fullName} is currently busy with ${driverObj.activeTrips} active trip(s)! Please select an available driver.`
            : `Tài xế ${driverObj.fullName} hiện đang bận (${driverObj.activeTrips} chuyến)! Vui lòng chọn tài xế đang rảnh.`
        );
        return;
      }
    }

    if (selectedEscortId) {
      const declinedEscort = assignmentStaffList.find(
        (s: any) =>
          s.roleInShipment === 'escort' &&
          s.userId === Number(selectedEscortId) &&
          s.confirmationNotes?.includes('TỪ CHỐI')
      );
      if (declinedEscort) {
        toast.error(
          isEn
            ? `Veterinary escort ${declinedEscort.user?.fullName || ''} previously declined this trip! Please select another available escort.`
            : `Chuyên viên y tế ${declinedEscort.user?.fullName || ''} đã từ chối chuyến này trước đó! Vui lòng chọn người khác đang rảnh.`
        );
        return;
      }

      const escortObj = availableDrivers.find((d) => String(d.id) === String(selectedEscortId));
      const isCurrentEscort = assignmentStaffList.some(
        (s: any) => s.userId === Number(selectedEscortId) && s.roleInShipment === 'escort'
      );
      if (escortObj && Number(escortObj.activeTrips || 0) > 0 && !isCurrentEscort) {
        toast.error(
          isEn
            ? `Medical escort ${escortObj.fullName} is currently busy with ${escortObj.activeTrips} active trip(s)! Please select an available escort.`
            : `Chuyên viên y tế / Hộ tống ${escortObj.fullName} hiện đang bận (${escortObj.activeTrips} chuyến)! Vui lòng chọn người đang rảnh.`
        );
        return;
      }
    }

    const prevDeclinedEscort = assignmentStaffList.find(
      (s: any) => s.roleInShipment === 'escort' && s.confirmationNotes?.includes('TỪ CHỐI')
    );
    if (prevDeclinedEscort && !selectedEscortId) {
      toast.error(
        isEn
          ? `Veterinary escort (${prevDeclinedEscort.user?.fullName || 'previous'}) declined this trip. Please select an available escort to replace!`
          : `Chuyên viên y tế (${prevDeclinedEscort.user?.fullName || 'trước đó'}) đã từ chối nhận chuyến. Vui lòng chọn 1 chuyên viên y tế đang rảnh để thay thế!`
      );
      return;
    }

    setIsSubmittingAssign(true);
    try {
      const assignments: Array<{ userId: number; roleInShipment: 'driver' | 'escort' }> = [];
      if (selectedDriverId) {
        assignments.push({ userId: Number(selectedDriverId), roleInShipment: 'driver' });
      }
      if (selectedEscortId) {
        assignments.push({ userId: Number(selectedEscortId), roleInShipment: 'escort' });
      }

      await apiClient(`/fleet/shipments/${selectedOrderForAssign.id}/assign-staff`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      });

      toast.success(
        isEn
          ? `Assigned personnel for order ${selectedOrderForAssign.requestCode} successfully!`
          : `Đã phân công nhân sự cho đơn ${selectedOrderForAssign.requestCode} thành công!`
      );
      setIsAssignModalOpen(false);
      setSelectedOrderForAssign(null);
      setSelectedDriverId('');
      setSelectedEscortId('');
      setAssignmentStaffList([]);
      setAssignRouteLegs([]);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || (isEn ? 'Failed to assign personnel' : 'Không thể phân công nhân sự'));
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const tabOptions: Array<{
    key: 'ALL' | 'NEED_ROUTE' | 'PENDING_APPROVAL' | 'APPROVED' | 'READY' | 'IN_TRANSIT';
    label: string;
    count: number;
    activeClass: string;
  }> = [
    {
      key: 'ALL',
      label: t('manager.planning.tabAll', 'Tất cả'),
      count: orders.length,
      activeClass: 'bg-[#181A17] text-white shadow-sm border-transparent',
    },
    {
      key: 'NEED_ROUTE',
      label: t('manager.planning.tabUnplanned', 'Chưa lập kế hoạch'),
      count: needRouteCount,
      activeClass: 'bg-[#A67C2E] text-white shadow-sm border-transparent',
    },
    {
      key: 'PENDING_APPROVAL',
      label: t('manager.planning.tabPendingReview', 'Chờ duyệt kế hoạch'),
      count: pendingApprovalCount,
      activeClass: 'bg-[#181A17] text-white shadow-sm border-transparent',
    },
    {
      key: 'APPROVED',
      label: t('manager.planning.tabApproved', 'Đã duyệt & Phân công'),
      count: approvedCount,
      activeClass: 'bg-[#181A17] text-white shadow-sm border-transparent',
    },
    {
      key: 'READY',
      label: t('manager.planning.tabReady', 'Đủ điều kiện xuất phát'),
      count: readyToDepartCount,
      activeClass: 'bg-[#287653] text-white shadow-sm border-transparent',
    },
    {
      key: 'IN_TRANSIT',
      label: t('manager.planning.tabInTransit', 'Đang di chuyển'),
      count: inTransitCount,
      activeClass: 'bg-[#181A17] text-[#B49A68] shadow-sm border-[#B49A68]',
    },
  ];

  return (
    <div className="flex flex-col gap-5 pb-12">
      <DispatchSectionTabs />

      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {t('manager.planning.pageTitle', 'Điều Phối Chuyến Đi & Phân Công')}
        </h1>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-2 bg-white border border-[#D8CEBE] hover:bg-[#FAF8F4] text-[#242722] text-xs font-semibold rounded-lg shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-[#A67C2E]' : 'text-[#5C6658]'} />
          <span>{t('manager.common.refresh', 'Làm mới')}</span>
        </button>
      </div>

      {/* Error Alert Banner */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-[#B33E3E] font-bold hover:bg-rose-100 cursor-pointer"
          >
            {t('manager.common.retry', 'Thử lại')}
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-[#D8CEBE] shadow-sm overflow-hidden">
        {/* Table Filters */}
        <div className="p-4 border-b border-[#EAE5DA] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#FAF9F5]">
          <div role="tablist" aria-label={t('manager.planning.pageTitle', 'Bộ lọc kế hoạch')} className="flex flex-wrap items-center gap-1.5">
            {tabOptions.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={filterTab === tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap border cursor-pointer ${
                  filterTab === tab.key
                    ? tab.activeClass
                    : 'bg-white text-[#5C6658] border-[#D8CEBE] hover:bg-[#F0EEE8]'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-lg px-3 py-1.5 w-full md:w-60 focus-within:border-[#181A17]">
            <Search size={15} className="text-[#7E867B] mr-2 shrink-0" />
            <input
              type="text"
              aria-label={t('manager.planning.searchPlaceholder', 'Tìm mã đơn, nơi đến...')}
              placeholder={t('manager.planning.searchPlaceholder', 'Tìm mã đơn, nơi đến...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-xs w-full bg-transparent text-[#181A17]"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#FAF9F5] border-b border-[#D8CEBE] text-[11px] font-bold text-[#5C6658] uppercase tracking-wider">
                <th className="py-3 px-3 whitespace-nowrap">{t('manager.planning.colOrder', 'Đơn vận chuyển')}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t('manager.planning.colRoute', 'Hành trình')}</th>
                <th className="py-3 px-3 whitespace-nowrap">{isEn ? 'Route Plan' : 'Lộ trình chi tiết'}</th>
                <th className="py-3 px-3 whitespace-nowrap">{isEn ? 'Status & Gate' : 'Trạng thái & Cổng'}</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">{t('manager.planning.colActions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EEE8]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#5C6658] font-medium">
                    <Loader2 size={24} className="animate-spin text-[#A67C2E] mx-auto mb-2" />
                    {t('manager.planning.loadingTrips', 'Đang tải dữ liệu kế hoạch chuyến đi...')}
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const plan = order.routePlan;
                  const isIntl = isInternational(order);
                  const planStatus = plan?.planStatus;
                  const effectiveMode: 'road' | 'air' | 'sea' =
                    order.transportMode === 'sea' || plan?.legs?.some((l) => l.legType === 'sea')
                      ? 'sea'
                      : order.transportMode === 'air' || plan?.legs?.some((l) => l.legType === 'flight')
                      ? 'air'
                      : 'road';

                  return (
                    <tr key={order.id} className="hover:bg-[#FAF9F5] transition-colors">
                      {/* Code & Horse */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <span className="font-bold text-[#A67C2E] text-xs">{order.requestCode}</span>
                        {order.customerRequestCode && order.customerRequestCode !== order.requestCode && (
                          <span className="text-[10px] text-[#7E867B] block font-normal">
                            ({t('manager.planning.customerCode', 'Mã khách: {code}', { code: order.customerRequestCode })})
                          </span>
                        )}
                        <p className="text-xs text-[#181A17] font-semibold m-0 mt-0.5 max-w-[135px] truncate" title={order.customerName || ''}>
                          {order.customerName || (isEn ? 'Customer' : 'Khách hàng')}
                        </p>
                        <p className="text-[11px] text-[#7E867B] m-0">
                          {order.requestedHorseCount} {t('manager.common.horses', 'cá thể ngựa')}
                        </p>
                      </td>

                      {/* Route Corridor */}
                      <td className="py-3 px-3 align-middle max-w-[230px]">
                        <div className="flex items-center gap-1 text-xs font-semibold text-[#181A17] leading-normal">
                          <span className="truncate max-w-[100px]" title={order.originLocation}>
                            {order.originLocation}
                          </span>
                          <span className="text-[#7E867B] font-bold shrink-0">→</span>
                          <span className="truncate max-w-[100px] text-[#181A17]" title={order.destinationLocation}>
                            {order.destinationLocation}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                              effectiveMode === 'sea'
                                ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                                : effectiveMode === 'air'
                                ? 'bg-[#F8F0DF] text-[#7A591C] border border-[#DFCA9A]'
                                : 'bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]'
                            }`}
                          >
                            {effectiveMode === 'sea' ? (
                              <Ship size={10} />
                            ) : effectiveMode === 'air' ? (
                              <Plane size={10} />
                            ) : (
                              <Truck size={10} />
                            )}
                            {effectiveMode === 'sea'
                              ? isEn
                                ? 'Sea Freight'
                                : 'Đường thủy'
                              : effectiveMode === 'air'
                              ? isIntl
                                ? isEn
                                  ? 'Intl Air'
                                  : 'Hàng không QT'
                                : isEn
                                ? 'Domestic Air'
                                : 'Hàng không NĐ'
                              : isIntl
                              ? isEn
                                ? 'Cross-border Road'
                                : 'Đường bộ QT'
                              : isEn
                              ? 'Domestic Road'
                              : 'Đường bộ NĐ'}
                          </span>
                          {order.tripType === 'round_trip' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                              {isEn ? 'Round-trip' : 'Khứ hồi'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Detailed Route Plan Summary */}
                      <td className="py-3 px-3 align-middle max-w-[205px]">
                        {plan && plan.legs && plan.legs.length > 0 ? (
                          <div className="text-xs">
                            <p className="font-semibold text-[#181A17] m-0 line-clamp-1" title={plan.routeName || ''}>
                              {plan.routeName || (isEn ? 'Configured route' : 'Lộ trình đã dựng')}
                            </p>
                            <p className="text-[11px] text-[#5C6658] m-0 mt-0.5 whitespace-nowrap">
                              {plan.legs.length} {isEn ? 'legs' : 'chặng'}
                              {plan.totalDistanceKm ? ` · ${plan.totalDistanceKm.toLocaleString('vi-VN')} km` : ''}
                              {plan.stops && plan.stops.length > 0
                                ? ` · ${plan.stops.length} ${isEn ? 'stops' : 'trạm'}`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#966516] font-semibold bg-[#F8F0DF] px-2.5 py-1 rounded-full border border-[#DFCA9A] whitespace-nowrap">
                            <Clock size={11} className="shrink-0" />
                            <span>{isEn ? 'Awaiting confirmation' : 'Chưa xác nhận tuyến'}</span>
                          </span>
                        )}
                      </td>

                      {/* Plan Status & Departure Gate (Merged cleanly) */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1.5">
                          {planStatus === 'in_transit' || order.status === 'in_transit' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]">
                              <Truck size={11} className="text-[#A67C2E] animate-pulse shrink-0" />
                              {t('manager.planning.statusInTransit', 'Đang di chuyển')}
                            </span>
                          ) : planStatus === 'completed' || order.status === 'completed' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
                              <CheckCircle2 size={11} className="shrink-0" />
                              {t('manager.planning.statusCompleted', 'Đã hoàn thành')}
                            </span>
                          ) : !plan ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                              <Clock size={11} className="shrink-0" />
                              {isEn ? 'Not planned' : 'Chưa lập tuyến'}
                            </span>
                          ) : planStatus === 'draft' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                              <Clock size={11} className="shrink-0" />
                              {t('manager.planning.statusDraft', 'Bản nháp')}
                            </span>
                          ) : planStatus === 'pending_approval' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#181A17] border border-[#B49A68] animate-pulse">
                              <Clock size={11} className="text-[#A67C2E] shrink-0" />
                              {t('manager.planning.statusPendingApproval', 'Chờ xác nhận')}
                            </span>
                          ) : planStatus === 'approved' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE]">
                              <Check size={11} className="text-[#287653] shrink-0" />
                              {isEn ? 'Route Locked' : 'Đã chốt tuyến'}
                            </span>
                          ) : planStatus === 'confirmed' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
                              <CheckCircle2 size={11} className="shrink-0" />
                              {t('manager.planning.statusConfirmed', 'Đã nhận chuyến')}
                            </span>
                          ) : planStatus === 'ready_to_depart' ? (
                            <span className="inline-flex items-center px-2.5 py-1 whitespace-nowrap gap-1.5 rounded-full text-[11px] font-bold bg-[#287653] text-white shadow-sm">
                              <CheckCircle2 size={11} className="shrink-0" />
                              {t('manager.planning.statusReadyToDepart', 'Sẵn sàng xuất phát')}
                            </span>
                          ) : null}

                          {order.status === 'in_transit' || planStatus === 'in_transit' ? (
                            <span className="text-[11px] text-[#7A591C] font-semibold pl-1">
                              • {t('manager.planning.gateDeparted', 'Đã xuất phát cổng')}
                            </span>
                          ) : order.status === 'completed' || planStatus === 'completed' ? (
                            <span className="text-[11px] text-[#287653] font-semibold pl-1">
                              • {t('manager.planning.gateArrived', 'Đã cập bến đích')}
                            </span>
                          ) : order.readiness?.isReadyToDepart ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentReadiness(order.readiness || null);
                                setIsReadinessModalOpen(true);
                              }}
                              className="inline-flex items-center px-2 py-0.5 whitespace-nowrap gap-1 rounded text-[10.5px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4] hover:bg-[#d7eadc] transition-colors cursor-pointer"
                            >
                              <ShieldCheck size={11} className="shrink-0" />
                              {t('manager.planning.gateReady', '100% Đủ điều kiện')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentReadiness(order.readiness || null);
                                setIsReadinessModalOpen(true);
                              }}
                              className="inline-flex items-center px-2 py-0.5 whitespace-nowrap gap-1 rounded text-[10.5px] font-semibold bg-[#FAF9F5] text-[#5C6658] hover:text-[#181A17] hover:bg-[#F0EEE8] border border-[#D8CEBE] transition-colors cursor-pointer"
                            >
                              <AlertCircle size={11} className="text-[#A67C2E] shrink-0" />
                              {t('manager.planning.gatePending', 'Chờ {count} điều kiện', {
                                count: order.readiness?.pendingConditions?.length || 1,
                              })}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* Confirm Route Button */}
                          {(() => {
                            const isCompleted = order.status === 'completed' || planStatus === 'completed';
                            const isPlanApproved =
                              planStatus === 'approved' ||
                              planStatus === 'confirmed' ||
                              planStatus === 'ready_to_depart' ||
                              order.status === 'in_transit' ||
                              isCompleted;
                            const hasActiveIncident = Boolean(plan?.activeIncident) && !isCompleted;

                            if (isPlanApproved && !hasActiveIncident) {
                              return null;
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => router.push(`/manager/dispatch/routes?shipmentId=${order.id}`)}
                                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                                  hasActiveIncident
                                    ? 'bg-rose-100 hover:bg-rose-200 text-[#B33E3E] border-rose-300 animate-pulse'
                                    : plan && plan.legs && plan.legs.length > 0
                                    ? 'bg-[#FAF9F5] hover:bg-[#F0EEE8] text-[#242722] border-[#D8CEBE]'
                                    : 'bg-[#181A17] hover:bg-[#242722] text-white border-transparent'
                                }`}
                                title={
                                  hasActiveIncident
                                    ? isEn
                                      ? 'Route incident reported - Open route editor'
                                      : 'Lộ trình gặp sự cố - Mở trình hiệu chỉnh lộ trình'
                                    : isEn
                                    ? 'Review quote-suggested route legs and confirm plan'
                                    : 'Kiểm tra lộ trình từ báo giá và chốt kế hoạch'
                                }
                              >
                                {hasActiveIncident ? (
                                  <AlertCircle size={13} className="text-[#B33E3E] shrink-0" />
                                ) : (
                                  <Truck size={13} className="shrink-0" />
                                )}
                                <span>
                                  {hasActiveIncident
                                    ? t('manager.planning.btnEditFrameworkIncident', 'Sửa do sự cố')
                                    : isEn
                                    ? 'Confirm Route'
                                    : 'Xác nhận tuyến'}
                                </span>
                              </button>
                            );
                          })()}

                          {/* Completed Trip View Route Button */}
                          {(order.status === 'completed' || planStatus === 'completed') && (
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(order)}
                              className="px-2.5 py-1.5 bg-[#FAF9F5] hover:bg-[#F0EEE8] text-[#242722] text-xs font-semibold rounded-lg border border-[#D8CEBE] shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                              title={
                                isEn
                                  ? 'Trip safely arrived at destination - Click to view route details'
                                  : 'Chuyến đi đã cập bến đích an toàn - Bấm để xem chi tiết lộ trình'
                              }
                            >
                              <Eye size={13} className="text-[#5C6658] shrink-0" />
                              <span>{t('manager.planning.btnViewRoute', 'Xem lộ trình')}</span>
                            </button>
                          )}

                          {/* Review Button */}
                          {planStatus === 'pending_approval' && (
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(order)}
                              className={`px-2.5 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-0 ${
                                Boolean(plan?.activeIncident)
                                  ? 'bg-[#B33E3E] hover:bg-[#963232] animate-pulse'
                                  : 'bg-[#287653] hover:bg-[#1f5e42]'
                              }`}
                              title={
                                isEn
                                  ? 'Review legs detail and approve plan'
                                  : 'Xem chi tiết các chặng và phê duyệt kế hoạch'
                              }
                            >
                              <Eye size={13} className="shrink-0" />
                              <span>
                                {Boolean(plan?.activeIncident)
                                  ? t('manager.planning.btnReviewPlanIncident', 'Duyệt sự cố')
                                  : t('manager.planning.btnReviewPlan', 'Duyệt kế hoạch')}
                              </span>
                            </button>
                          )}

                          {/* Assign Staff Button */}
                          {!(order.status === 'completed' || planStatus === 'completed') &&
                            (planStatus === 'approved' ||
                              planStatus === 'confirmed' ||
                              planStatus === 'ready_to_depart' ||
                              order.status === 'in_transit' ||
                              planStatus === 'in_transit') &&
                            (() => {
                              const isInTransit = order.status === 'in_transit' || planStatus === 'in_transit';

                              if (isInTransit) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssignModal(order)}
                                    className="px-2.5 py-1.5 bg-[#242722] hover:bg-[#181A17] text-[#FAF8F4] text-xs font-bold rounded-lg border border-[#B49A68] shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                    title={
                                      isEn
                                        ? 'View crew assigned to active trip'
                                        : 'Xem nhân sự đang phụ trách chuyến đi'
                                    }
                                  >
                                    <UserCheck size={13} className="text-[#B49A68] shrink-0" />
                                    <span>{t('manager.planning.btnViewCrew', 'Xem nhân sự')}</span>
                                  </button>
                                );
                              }

                              const isFullyReady =
                                Boolean(order.readiness?.isReadyToDepart) || planStatus === 'ready_to_depart';

                              if (isFullyReady) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssignModal(order)}
                                    className="px-2.5 py-1.5 bg-[#287653] hover:bg-[#1f5e42] text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-0"
                                    title={
                                      isEn
                                        ? 'Crew assigned and 100% departure ready - Click to view or update crew'
                                        : 'Đã phân công đầy đủ nhân sự và đạt 100% điều kiện xuất phát - Bấm để xem hoặc cập nhật nhân sự'
                                    }
                                  >
                                    <CheckCircle2 size={13} className="shrink-0" />
                                    <span>{t('manager.planning.btnCrewAssigned', 'Đã phân công')}</span>
                                  </button>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(order)}
                                  className="px-2.5 py-1.5 bg-[#181A17] hover:bg-[#242722] text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-0"
                                  title={
                                    isEn
                                      ? 'Assign driver and escort veterinarian'
                                      : 'Phân công tài xế và bác sĩ hộ tống'
                                  }
                                >
                                  <UserCheck size={13} className="shrink-0" />
                                  <span>{t('manager.planning.btnAssignCrew', 'Phân công')}</span>
                                </button>
                              );
                            })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#5C6658] font-medium">
                    {t('manager.planning.noOrdersFound', 'Không tìm thấy chuyến đi nào phù hợp với bộ lọc.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 2: DUYỆT KẾ HOẠCH CHI TIẾT (MANAGER REVIEW) */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => { if (!isSubmittingReview) setIsReviewModalOpen(false); }}
        closeDisabled={isSubmittingReview}
        title={
          selectedOrderForReview?.status === 'completed' ||
          selectedOrderForReview?.routePlan?.planStatus === 'completed'
            ? t(
                'manager.planning.modalReviewTitleCompleted',
                `Chi tiết lộ trình vận chuyển (Chuyến đi đã hoàn tất) - ${selectedOrderForReview?.requestCode}`,
                { code: selectedOrderForReview?.requestCode || '' }
              )
            : t(
                'manager.planning.modalReviewTitle',
                `Phê duyệt kế hoạch lộ trình chi tiết - ${selectedOrderForReview?.requestCode}`,
                { code: selectedOrderForReview?.requestCode || '' }
              )
        }
      >
        <div className="flex flex-col gap-4 text-xs">
          {loadingRouteDetail ? (
            <div className="p-8 text-center text-[#5C6658]">
              <Loader2 size={24} className="animate-spin text-[#A67C2E] mx-auto mb-2" />
              {t('manager.planning.loadingRouteDetail', 'Đang tải chi tiết các chặng do Coordinator dựng...')}
            </div>
          ) : routeDetailError ? (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-[#B33E3E] flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle size={16} />
                <span>{routeDetailError}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReviewModalOpen(false)}
                >
                  {t('manager.common.close', 'Đóng')}
                </Button>
                {selectedOrderForReview && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenReviewModal(selectedOrderForReview)}
                  >
                    {t('manager.common.retry', 'Thử lại')}
                  </Button>
                )}
              </div>
            </div>
          ) : detailedRoute ? (
            <>
              <div className="bg-[#FAF9F5] border border-[#D8CEBE] p-3 rounded-lg">
                <p className="font-bold text-[#181A17] text-sm m-0">{detailedRoute.routeName}</p>
                <p className="text-[#5C6658] text-xs mt-0.5 m-0">
                  {t('manager.planning.totalDistance', `Tổng quãng đường: ${detailedRoute.totalDistanceKm || 'N/A'} km`, {
                    distance: detailedRoute.totalDistanceKm || 'N/A',
                  })}{' '}
                  •{' '}
                  {t(
                    'manager.planning.coordinatedBy',
                    `Điều phối bởi: ${detailedRoute.assignedCoordinatorName || 'Coordinator'}`,
                    { name: detailedRoute.assignedCoordinatorName || 'Coordinator' }
                  )}
                </p>
              </div>

              {/* Legs list */}
              <div>
                <h3 className="font-bold text-[#242722] uppercase tracking-wider text-[11px] mb-2 m-0">
                  {t(
                    'manager.planning.legsTitle',
                    `Danh sách các chặng vận chuyển (${detailedRoute.legs?.length || 0} Chặng)`,
                    { count: detailedRoute.legs?.length || 0 }
                  )}
                </h3>
                <div className="flex flex-col gap-2">
                  {detailedRoute.legs && detailedRoute.legs.length > 0 ? (
                    detailedRoute.legs.map((leg) => (
                      <div key={leg.sequenceNo} className="border border-[#D8CEBE] rounded-lg p-3 bg-white">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                          <span className="font-bold text-[#181A17]">
                            {isEn ? 'Leg' : 'Chặng'} {leg.sequenceNo}: {leg.originLocation} → {leg.destinationLocation}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F3EFE4] text-[#181A17]">
                            {leg.legType === 'flight'
                              ? t('manager.planning.legFlight', 'HÀNG KHÔNG')
                              : (leg.legType as string) === 'sea'
                                ? t('manager.planning.legSea', isEn ? 'SEA FREIGHT' : 'ĐƯỜNG THỦY')
                                : t('manager.planning.legRoad', 'ĐƯỜNG BỘ')}
                          </span>
                        </div>
                        {(leg.legType as string) === 'sea' ? (
                          <p className="text-[11px] text-[#0E7490] m-0 font-medium">
                            {isEn ? 'Dedicated Equine Vessel' : 'Tàu biển chuyên dụng'}:{' '}
                            <strong>{leg.originLocation} → {leg.destinationLocation}</strong> •{' '}
                            {t(
                              'manager.planning.estDistanceDuration',
                              `Dự kiến: ${leg.distanceKm || 0} km (~${leg.durationHours || 0}h)`,
                              { distance: leg.distanceKm || 0, hours: leg.durationHours || 0 }
                            )}
                          </p>
                        ) : leg.legType === 'road' ? (
                          <p className="text-[11px] text-[#5C6658] m-0">
                            {t('manager.planning.vehicleLabel', 'Phương tiện:')}{' '}
                            {leg.vehiclePlate?.includes('đến đón') ||
                            leg.vehiclePlate?.includes('đến rước') ||
                            leg.vehiclePlate?.includes('Bên nhận') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAF8F4] text-[#181A17] font-bold border border-[#EAE5DA]">
                                {isEn ? 'Consignee self-pickup at destination' : leg.vehiclePlate}
                              </span>
                            ) : !leg.vehiclePlate &&
                              (leg.sequenceNo > 1 || detailedRoute.legs?.some((l) => l.legType === 'flight')) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAF8F4] text-[#181A17] font-bold border border-[#EAE5DA]">
                                {t('manager.planning.vehiclePickupByConsignee', 'Bên nhận tự rước tại điểm đến')}
                              </span>
                            ) : (
                              <strong className="text-[#181A17]">
                                {leg.vehiclePlate || t('manager.planning.unassignedVehicle', 'Chưa gán xe')}
                              </strong>
                            )}{' '}
                            •{' '}
                            {t(
                              'manager.planning.estDistanceDuration',
                              `Dự kiến: ${leg.distanceKm || 0} km (~${leg.durationHours || 0}h)`,
                              { distance: leg.distanceKm || 0, hours: leg.durationHours || 0 }
                            )}
                          </p>
                        ) : (
                          <p className="text-[11px] text-[#181A17] m-0 font-medium">
                            {t(
                              'manager.planning.flightInfo',
                              `Chuyến bay: ${leg.airlineName || 'Airline'} (${leg.flightNumber || 'TBD'})`,
                              { airline: leg.airlineName || 'Airline', flightNo: leg.flightNumber || 'TBD' }
                            )}{' '}
                            •{' '}
                            {t(
                              'manager.planning.bookingRef',
                              `Mã đặt chỗ: ${leg.bookingReference || (isEn ? 'Pending' : 'Chưa có')}`,
                              {
                                ref: leg.bookingReference || (isEn ? 'Pending' : 'Chưa có'),
                                stalls: leg.stallsBooked || 1,
                              }
                            )}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-[#7E867B] italic m-0">
                      {isEn ? 'No legs constructed yet.' : 'Chưa có chặng nào được tạo.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Stops list */}
              {detailedRoute.stops && detailedRoute.stops.length > 0 && (
                <div>
                  <h3 className="font-bold text-[#242722] uppercase tracking-wider text-[11px] mb-2 m-0">
                    {t(
                      'manager.planning.stopsTitle',
                      `Trạm dừng nghỉ & Kiểm dịch (${detailedRoute.stops.length} điểm)`,
                      { count: detailedRoute.stops.length }
                    )}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detailedRoute.stops.map((s) => (
                      <div key={s.sequenceNo} className="p-2 border border-[#EAE5DA] bg-[#FAF9F5] rounded text-[11px]">
                        <strong className="text-[#181A17]">
                          #{s.sequenceNo} {s.locationName}
                        </strong>
                        <span className="block text-[#5C6658] text-[10px] uppercase font-semibold">
                          {translateStopType(s.stopType)} • {translateCountry(s.country)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing Confirmation Section */}
              {selectedOrderForReview?.status !== 'completed' &&
                selectedOrderForReview?.status !== 'cancelled' &&
                selectedOrderForReview?.routePlan?.planStatus !== 'completed' && (
                  <div className="bg-[#E8F2EB] border border-[#B7DBC4] rounded-xl p-3.5">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-1.5">
                      <span className="font-bold text-[#181A17] text-xs">
                        {isEn
                          ? 'Freight Quote Reconciliation'
                          : 'Đối chiếu cước vận chuyển đã chốt'}
                      </span>
                      <span className="text-[11px] text-[#287653] font-semibold">
                        {selectedOrderForReview?.bookingType === 'dedicated_charter'
                          ? isEn
                            ? 'Dedicated Charter'
                            : 'Bao chuyến'
                          : isEn
                          ? 'Shared Stall'
                          : 'Ghép ô chuồng'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <div>
                        <label
                          htmlFor="review-freight-cost"
                          className="block text-[11px] font-semibold text-[#181A17] mb-1"
                        >
                          {isEn ? 'Transport Freight (VND)' : 'Cước vận chuyển đã chốt (VNĐ)'}
                        </label>
                        <input
                          id="review-freight-cost"
                          type="number"
                          min={0}
                          value={reviewTransportCost}
                          readOnly={isReviewCostLocked}
                          disabled={isReviewCostLocked}
                          onChange={(e) => {
                            if (!isReviewCostLocked) setReviewTransportCost(e.target.value);
                          }}
                          className="w-full px-3 py-1.5 text-xs font-bold text-[#181A17] bg-white border border-[#D8CEBE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#287653]/30 focus:border-[#287653] disabled:bg-[#F3EFE4] disabled:text-[#5C6658] disabled:cursor-not-allowed"
                        />
                        {isReviewCostLocked ? (
                          <span className="text-[10px] text-[#287653] font-semibold mt-0.5 block">
                            {isEn
                              ? 'Prepaid order paid — freight is locked to the original quote.'
                              : 'Đơn trả trước đã thanh toán — cước phí được khóa theo báo giá gốc.'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#5C6658] mt-0.5 block">
                            {isEn ? 'Actual distance:' : 'Quãng đường thực tế:'}{' '}
                            {detailedRoute.totalDistanceKm || 0} km
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#5C6658] space-y-1">
                        <div className="flex justify-between">
                          <span>{isEn ? 'Declared insurance fee:' : 'Phí bảo hiểm đã khai báo:'}</span>
                          <strong className="text-[#181A17]">
                            {Number(selectedOrderForReview?.insuranceFee || 0).toLocaleString('vi-VN')} ₫
                          </strong>
                        </div>
                        <div className="flex justify-between border-t border-[#B7DBC4] pt-1 text-xs">
                          <span className="font-bold text-[#181A17]">
                            {isEn ? 'Total customer invoice:' : 'Tổng hóa đơn khách trả:'}
                          </span>
                          <strong className="font-bold text-[#287653] text-sm">
                            {(
                              (Number(reviewTransportCost) || 0) +
                              Number(selectedOrderForReview?.insuranceFee || 0)
                            ).toLocaleString('vi-VN')}{' '}
                            ₫
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Action Buttons */}
              <div className="border-t border-[#EAE5DA] pt-3 mt-2">
                {selectedOrderForReview?.status === 'completed' ||
                selectedOrderForReview?.routePlan?.planStatus === 'completed' ? (
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <span className="text-xs font-semibold text-[#5C6658] flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-[#287653]" />{' '}
                      {t(
                        'manager.planning.completedNotice',
                        'Chuyến đi đã cập bến đích an toàn (Chế độ lưu trữ & đối soát).'
                      )}
                    </span>
                    <Button type="button" variant="outline" onClick={() => setIsReviewModalOpen(false)}>
                      {t('manager.common.close', 'Đóng')}
                    </Button>
                  </div>
                ) : !isRejecting ? (
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => setIsRejecting(true)}
                      className="px-3 py-1.5 text-xs font-bold text-[#B33E3E] hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {t('manager.planning.requestRevisionBtn', 'Trả về yêu cầu điều chỉnh')}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmittingReview}
                        onClick={() => setIsReviewModalOpen(false)}
                      >
                        {t('manager.common.close', 'Đóng')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        className="bg-[#287653] hover:bg-[#1f5e42] text-white font-bold px-4 py-2"
                        onClick={handleApprovePlan}
                        disabled={isSubmittingReview}
                      >
                        {isSubmittingReview ? (
                          <Loader2 size={14} className="animate-spin mr-1.5" />
                        ) : (
                          <Check size={14} className="mr-1.5" />
                        )}
                        {t('manager.planning.btnApprovePlan', 'Phê duyệt kế hoạch')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="planning-reject-reason" className="font-bold text-[#B33E3E]">
                        {t('manager.planning.revisionReasonLabel', 'Nhập lý do trả về để Coordinator chỉnh sửa *')}
                      </label>
                      <span className="text-[11px] text-[#7E867B]">{rejectionReason.trim().length} / 5+</span>
                    </div>
                    <textarea
                      id="planning-reject-reason"
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder={t(
                        'manager.planning.revisionReasonPlaceholder',
                        'VD: Cần đổi sang chuyến bay sớm hơn 2 tiếng hoặc bổ sung thêm 1 trạm dừng nghỉ...'
                      )}
                      className="w-full p-2 border border-rose-300 rounded-lg outline-none text-xs"
                      required
                    />
                    <div className="flex flex-wrap justify-end gap-2 mt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSubmittingReview}
                        onClick={() => setIsRejecting(false)}
                      >
                        {t('manager.common.cancel', 'Hủy')}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={handleRejectPlan}
                        disabled={isSubmittingReview || rejectionReason.trim().length < 5}
                      >
                        {isSubmittingReview ? (
                          <Loader2 size={14} className="animate-spin mr-1" />
                        ) : (
                          <X size={14} className="mr-1" />
                        )}
                        {t('manager.planning.confirmReject', 'Xác nhận trả về')}
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
        onClose={handleCloseAssignModal}
        closeDisabled={isSubmittingAssign}
        title={t(
          'manager.planning.modalAssignTitle',
          `Phân công tài xế & người hộ tống - ${selectedOrderForAssign?.requestCode}`,
          { code: selectedOrderForAssign?.requestCode || '' }
        )}
      >
        <form onSubmit={handleSaveStaffAssignment} className="flex flex-col gap-4 text-xs">
          {loadingAssignModal ? (
            <div className="p-8 text-center text-[#5C6658]">
              <Loader2 size={24} className="animate-spin text-[#A67C2E] mx-auto mb-2" />
              {t('manager.planning.loadingCrew', 'Đang tải danh sách nhân sự...')}
            </div>
          ) : (
            <>
              {assignModalError && (
                <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs">
                  {assignModalError}
                </div>
              )}

              {isAssignReadOnly && (
                <div className="p-3 rounded-lg bg-[#F8F0DF] border border-[#DFCA9A] text-[#7A591C] text-xs font-semibold">
                  {t(
                    'manager.planning.crewReadOnlyNotice',
                    'Chuyến đi đang vận chuyển hoặc đã hoàn tất. Danh sách nhân sự ở chế độ chỉ xem.'
                  )}
                </div>
              )}

              {assignEffectiveLegs.length > 0 && (
                <div className="border border-[#E5DDD0] bg-white rounded-xl p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] block mb-2">
                    {isEn ? 'Responsibility by Route Leg' : 'Phân nhiệm nhân sự theo từng chặng lộ trình'}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {assignEffectiveLegs.map((leg: any, idx: number) => {
                      const isFlight = leg.legType === 'flight' || leg.mode === 'air';
                      const isSea = leg.legType === 'sea' || leg.mode === 'sea';
                      const isConsigneeRoad =
                        !isFlight &&
                        !isSea &&
                        (isConsigneePickupPlate(leg.vehiclePlate) ||
                          (!leg.vehicleId && !leg.vehiclePlate && idx > 0 && isAssignAirShipment));
                      return (
                        <div
                          key={leg.sequenceNo || idx}
                          className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#FAF8F4] border border-[#EAE5DA]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isFlight ? (
                              <Plane size={13} className="text-[#966516] shrink-0" />
                            ) : isSea ? (
                              <Ship size={13} className="text-cyan-700 shrink-0" />
                            ) : (
                              <Truck size={13} className="text-[#181A17] shrink-0" />
                            )}
                            <span className="font-semibold text-[#181A17] truncate">
                              {isEn ? 'Leg' : 'Chặng'} {leg.sequenceNo || idx + 1}: {leg.originLocation} →{' '}
                              {leg.destinationLocation}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold shrink-0 ${
                              isFlight
                                ? 'bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]'
                                : isSea
                                ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                                : isConsigneeRoad
                                ? 'bg-[#F3EFE4] text-[#7A591C] border border-[#DFCA9A]'
                                : 'bg-white text-[#181A17] border border-[#D8CEBE]'
                            }`}
                          >
                            {isFlight
                              ? isEn
                                ? 'Vet / Flight Escort (In-Flight)'
                                : 'Bác sĩ thú y / Hộ tống bay'
                              : isSea
                              ? isEn
                                ? 'Vet / Sea Voyage Escort'
                                : 'Bác sĩ thú y / Hộ tống tàu biển'
                              : isConsigneeRoad
                              ? isEn
                                ? 'Escort Handover & Consignee Vehicle'
                                : 'Hộ tống bàn giao & Xe bên nhận'
                              : isEn
                              ? 'Company Truck Driver (Road)'
                              : 'Tài xế xe thùng (Đường bộ)'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="assign-driver-select" className="font-bold text-[#242722] block mb-1">
                  {isAssignAirShipment
                    ? isDriverRequiredForAssign
                      ? isEn
                        ? 'Airport Transfer Truck Driver (Leg 1 - Road) *'
                        : 'Tài xế xe thùng trung chuyển ra sân bay (Chặng đường bộ) *'
                      : isEn
                      ? 'Airport Transfer Truck Driver (Optional — Direct Airport Departure)'
                      : 'Tài xế xe thùng trung chuyển (Tùy chọn — Xuất phát thẳng từ sân bay)'
                    : t('manager.planning.fieldDriver', 'Tài xế chuyên dụng chính *')}
                </label>
                <select
                  id="assign-driver-select"
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  disabled={isAssignReadOnly}
                  className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17] disabled:bg-[#F0EEE8] disabled:opacity-75"
                  required={isDriverRequiredForAssign}
                >
                  <option value="">
                    {isAssignAirShipment && !isDriverRequiredForAssign
                      ? isEn
                        ? '-- No company truck leg required (Direct airport departure) --'
                        : '-- Không cần xe trung chuyển (Khách giao ngựa thẳng tại sân bay) --'
                      : t(
                          'manager.planning.selectDriverPlaceholder',
                          '-- Chọn tài xế điều khiển phương tiện (Đang rảnh) --'
                        )}
                  </option>
                  {(() => {
                    const freeDrivers = availableDrivers
                      .filter((d) => {
                        const isDriverRole =
                          d.specialization === 'driver' ||
                          (!d.specialization &&
                            !d.fullName?.toLowerCase().includes('thú y') &&
                            !d.email?.includes('escort'));
                        return isDriverRole;
                      })
                      .sort((a, b) => Number(a.activeTrips || 0) - Number(b.activeTrips || 0));

                    if (freeDrivers.length === 0) {
                      return (
                        <option disabled value="">
                          {isEn
                            ? '⚠️ No drivers currently available (All drivers are busy on active trips)'
                            : '⚠️ Không có tài xế nào đang rảnh (Tất cả tài xế đều đang bận chuyến)'}
                        </option>
                      );
                    }

                    return freeDrivers.map((d) => {
                      const hasDeclined = assignmentStaffList.some(
                        (s: any) =>
                          s.userId === d.id &&
                          s.roleInShipment === 'driver' &&
                          s.confirmationNotes?.includes('TỪ CHỐI')
                      );
                      const isCurrentDriver = String(d.id) === selectedDriverId;
                      const activeCount = Number(d.activeTrips || 0);

                      return (
                        <option key={d.id} value={d.id} disabled={hasDeclined}>
                          {d.fullName} ({d.phone || d.email}){' '}
                          {hasDeclined
                            ? `— ${t('manager.planning.statusDeclined', 'ĐÃ TỪ CHỐI CHUYẾN NÀY (Không khả dụng)')}`
                            : isCurrentDriver
                            ? `— (${t('manager.planning.statusCurrentlySelected', 'Đang chọn')})`
                            : activeCount > 0
                            ? `— ${isEn ? `Busy (${activeCount} active trip${activeCount > 1 ? 's' : ''})` : `Đang bận (${activeCount} chuyến)`}`
                            : `— ${t('manager.planning.statusAvailableFree', 'Đang rảnh (0 chuyến)')}`}
                        </option>
                      );
                    });
                  })()}
                </select>
              </div>

              <div>
                <label htmlFor="assign-escort-select" className="font-bold text-[#242722] block mb-1">
                  {isAssignAirShipment
                    ? isEn
                      ? 'Equine Vet / In-Flight Medical Escort (Flight & Arrival Clearance) *'
                      : 'Bác sĩ thú y / Hộ tống hàng không (Đi cùng chuyến bay & thông quan đích) *'
                    : isAssignSeaShipment
                    ? isEn
                      ? 'Equine Vet / Sea Voyage Medical Escort (Vessel & Port Clearance) *'
                      : 'Bác sĩ thú y / Hộ tống tàu biển (Đi cùng tàu & thông quan cảng) *'
                    : t('manager.planning.fieldEscort', 'Chuyên viên y tế / Bác sĩ thú y hộ tống (Tùy chọn)')}
                </label>
                <select
                  id="assign-escort-select"
                  value={selectedEscortId}
                  onChange={(e) => setSelectedEscortId(e.target.value)}
                  disabled={isAssignReadOnly}
                  required={isEscortRequiredForAssign}
                  className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17] disabled:bg-[#F0EEE8] disabled:opacity-75"
                >
                  <option value="">
                    {isAssignAirShipment
                      ? isEn
                        ? '-- Select mandatory Veterinary / Flight Escort (Available) --'
                        : '-- Chọn Bác sĩ thú y / Hộ tống bay bắt buộc (Đang rảnh) --'
                      : isAssignSeaShipment
                      ? isEn
                        ? '-- Select mandatory Veterinary / Sea Escort (Available) --'
                        : '-- Chọn Bác sĩ thú y / Hộ tống tàu biển bắt buộc (Đang rảnh) --'
                      : t(
                          'manager.planning.selectEscortPlaceholder',
                          '-- Chọn chuyên viên y tế / hộ tống đi kèm (Đang rảnh) --'
                        )}
                  </option>
                  {(() => {
                    const freeEscorts = availableDrivers.filter((d) => {
                      const isEscortRole =
                        d.specialization === 'escort' ||
                        (!d.specialization &&
                          (d.fullName?.toLowerCase().includes('thú y') || d.email?.includes('escort')));
                      if (!isEscortRole) return false;
                      const isCurrentEscort = String(d.id) === selectedEscortId;
                      return Number(d.activeTrips || 0) === 0 || isCurrentEscort;
                    });

                    if (freeEscorts.length === 0) {
                      return (
                        <option disabled value="">
                          {isEn
                            ? '⚠️ No medical escorts available (All escorts/vets are busy on active trips)'
                            : '⚠️ Không có nhân viên y tế / hộ tống nào đang rảnh (Tất cả đều đang bận chuyến)'}
                        </option>
                      );
                    }

                    return freeEscorts.map((d) => {
                      const hasDeclined = assignmentStaffList.some(
                        (s: any) =>
                          s.userId === d.id &&
                          s.roleInShipment === 'escort' &&
                          s.confirmationNotes?.includes('TỪ CHỐI')
                      );
                      const isCurrentEscort = String(d.id) === selectedEscortId;

                      return (
                        <option key={d.id} value={d.id} disabled={hasDeclined}>
                          {d.fullName} ({d.phone || d.email}){' '}
                          {hasDeclined
                            ? `— ${t('manager.planning.statusDeclined', 'ĐÃ TỪ CHỐI CHUYẾN NÀY (Không khả dụng)')}`
                            : isCurrentEscort
                            ? `— (${t('manager.planning.statusCurrentlySelected', 'Đang chọn')})`
                            : `— ${t('manager.planning.statusAvailableFree', 'Đang rảnh (0 chuyến)')}`}
                        </option>
                      );
                    });
                  })()}
                </select>
              </div>

              {/* Current Assignment Status */}
              {assignmentStaffList.length > 0 && (
                <div className="mt-2 border-t border-[#F0EEE8] pt-2">
                  <span className="font-bold text-[#242722] block mb-1.5">
                    {t('manager.planning.crewConfirmationProgress', 'Tiến độ xác nhận nhận chuyến hiện tại:')}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {assignmentStaffList.map((s: any) => (
                      <div
                        key={s.assignmentId}
                        className="flex flex-wrap justify-between items-center gap-2 p-2 rounded bg-[#FAF9F5] border border-[#D8CEBE]"
                      >
                        <div>
                          <p className="font-bold text-[#181A17] m-0">
                            {s.user?.fullName} (
                            {s.roleInShipment === 'driver'
                              ? isAssignAirShipment
                                ? isEn
                                  ? 'Airport Transfer Driver - Leg 1'
                                  : 'Tài xế xe trung chuyển sân bay - Chặng 1'
                                : t('manager.planning.rolePrimaryDriver', 'Tài xế chính')
                              : isAssignAirShipment
                              ? isEn
                                ? 'Equine Vet / In-Flight Escort'
                                : 'Bác sĩ thú y / Hộ tống bay'
                              : t('manager.planning.roleMedicalEscort', 'Chuyên viên y tế / hộ tống')}
                            )
                          </p>
                          <p className="text-[10px] text-[#7E867B] m-0">{s.user?.email}</p>
                        </div>
                        {s.isConfirmed ? (
                          <span className="text-[11px] font-bold text-[#287653] bg-[#E8F2EB] px-2 py-0.5 rounded border border-[#B7DBC4] flex items-center gap-1">
                            <Check size={11} /> {t('manager.planning.confirmedAgreed', 'Đã xác nhận đồng ý')}
                          </span>
                        ) : s.confirmationNotes?.includes('TỪ CHỐI') ? (
                          <span
                            className="text-[11px] font-bold text-[#B33E3E] bg-[#F8EAEA] px-2 py-0.5 rounded border border-[#E5B8B8] flex items-center gap-1"
                            title={s.confirmationNotes}
                          >
                            <X size={11} />{' '}
                            {t(
                              'manager.planning.declinedTrip',
                              `Đã từ chối: ${s.confirmationNotes.replace('TỪ CHỐI: ', '')}`,
                              { reason: s.confirmationNotes.replace('TỪ CHỐI: ', '') }
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-[#966516] bg-[#F8F0DF] px-2 py-0.5 rounded border border-[#DFCA9A] flex items-center gap-1">
                            <Clock size={11} /> {t('manager.planning.awaitingConfirmation', 'Chờ xác nhận')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {assignmentStaffList.some((s: any) => s.confirmationNotes?.includes('TỪ CHỐI')) && (
                    <div className="mt-2.5 p-3 rounded-lg bg-[#F8EAEA] border border-[#E5B8B8] text-[#B33E3E] text-xs flex flex-col gap-1.5 shadow-sm">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{t('manager.planning.declinedAlert', 'Cảnh báo nhân sự từ chối nhận chuyến:')}</span>
                      </div>
                      {assignmentStaffList
                        .filter((s: any) => s.confirmationNotes?.includes('TỪ CHỐI'))
                        .map((s: any) => (
                          <div key={s.assignmentId} className="pl-6 text-[11px]">
                            •{' '}
                            <strong>
                              {s.roleInShipment === 'driver'
                                ? t('manager.planning.rolePrimaryDriver', 'Tài xế chính')
                                : t('manager.planning.roleMedicalEscort', 'Chuyên viên y tế / hộ tống')}{' '}
                              {s.user?.fullName}
                            </strong>{' '}
                            {t(
                              'manager.planning.declinedAlertDetail',
                              `đã từ chối (${s.confirmationNotes}). Hệ thống đã tự động gỡ bỏ và chỉ cho phép bạn chọn nhân sự đang rảnh khác thay thế!`,
                              {
                                role:
                                  s.roleInShipment === 'driver'
                                    ? t('manager.planning.rolePrimaryDriver', 'Tài xế chính')
                                    : t('manager.planning.roleMedicalEscort', 'Chuyên viên y tế / hộ tống'),
                                name: s.user?.fullName || '',
                                reason: s.confirmationNotes || '',
                              }
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#EAE5DA] pt-3 mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmittingAssign}
              onClick={handleCloseAssignModal}
            >
              {t('manager.common.close', 'Đóng')}
            </Button>
            {!isAssignReadOnly && (
              <Button
                type="submit"
                variant="primary"
                className="bg-[#181A17] hover:bg-[#242722] text-white font-bold px-4 py-2"
                disabled={isSubmittingAssign || loadingAssignModal}
              >
                {isSubmittingAssign ? (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                ) : (
                  <Send size={14} className="mr-1.5" />
                )}
                {t('manager.planning.saveAssignmentBtn', 'Lưu phân công & Gửi thông báo')}
              </Button>
            )}
          </div>
        </form>
      </Modal>

      {/* MODAL 4: CỔNG KIỂM TRA ĐIỀU KIỆN XUẤT PHÁT */}
      <Modal
        isOpen={isReadinessModalOpen}
        onClose={() => setIsReadinessModalOpen(false)}
        title={t(
          'manager.planning.modalGateTitle',
          `Kiểm tra điều kiện xuất phát - ${currentReadiness?.orderCode}`,
          { code: currentReadiness?.orderCode || '' }
        )}
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="bg-[#FAF9F5] border border-[#D8CEBE] p-3 rounded-lg">
            <p className="font-bold text-[#181A17] text-sm m-0">
              {t('manager.planning.dualGateTitle', 'Quy tắc kiểm soát kép')}
            </p>
            <p className="text-[#5C6658] text-xs mt-1 m-0 leading-relaxed">
              {t(
                'manager.planning.dualGateDesc',
                'Theo quy định vận tải ngựa đua quốc tế, chuyến đi chỉ được chuyển sang Sẵn sàng xuất phát khi và chỉ khi thỏa mãn đồng thời cả 3 điều kiện: Kế hoạch lộ trình đã xác nhận, Toàn bộ hồ sơ kiểm dịch đạt chuẩn 100% VÀ Cước phí vận chuyển đã thanh toán thành công.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Condition 1 */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                currentReadiness?.isPlanConfirmed
                  ? 'bg-[#E8F2EB] border-[#B7DBC4] text-[#181A17]'
                  : 'bg-[#F8F0DF] border-[#DFCA9A] text-[#7A591C]'
              }`}
            >
              {currentReadiness?.isPlanConfirmed ? (
                <CheckCircle2 size={18} className="text-[#287653] shrink-0 mt-0.5" />
              ) : (
                <Clock size={18} className="text-[#966516] shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block text-xs">
                  {t('manager.planning.gate1Title', 'Điều kiện 1: Kế hoạch lộ trình & Đội ngũ tài xế đã xác nhận')}
                </strong>
                <p className="text-[11px] mt-0.5 m-0">
                  {currentReadiness?.isPlanConfirmed
                    ? t(
                        'manager.planning.gate1Pass',
                        'Kế hoạch đã được phê duyệt và toàn bộ tài xế/hộ tống viên đã bấm xác nhận nhiệm vụ.'
                      )
                    : t(
                        'manager.planning.gate1Fail',
                        'Đang chờ hoàn tất dựng chặng, Manager duyệt hoặc chờ tài xế bấm xác nhận nhận chuyến.'
                      )}
                </p>
              </div>
            </div>

            {/* Condition 2 */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                currentReadiness?.isLegalCompliant
                  ? 'bg-[#E8F2EB] border-[#B7DBC4] text-[#181A17]'
                  : 'bg-[#F8EAEA] border-[#E5B8B8] text-[#B33E3E]'
              }`}
            >
              {currentReadiness?.isLegalCompliant ? (
                <CheckCircle2 size={18} className="text-[#287653] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="text-[#B33E3E] shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block text-xs">
                  {t('manager.planning.gate2Title', 'Điều kiện 2: Hồ sơ pháp lý & Kiểm dịch đạt chuẩn 100%')}
                </strong>
                <p className="text-[11px] mt-0.5 m-0">
                  {currentReadiness?.isLegalCompliant
                    ? t(
                        'manager.planning.gate2Pass',
                        'Toàn bộ hộ chiếu ngựa, chứng nhận tiêm phòng, kiểm dịch và hải quan đã được Chuyên viên phê duyệt hợp lệ.'
                      )
                    : t(
                        'manager.planning.gate2Fail',
                        'Hồ sơ kiểm dịch chưa hoàn tất hoặc còn tài liệu chờ duyệt / bị từ chối. Chuyến đi chưa được phép xuất cảnh.'
                      )}
                </p>
              </div>
            </div>

            {/* Condition 3 */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                currentReadiness?.isPaymentSucceeded
                  ? 'bg-[#E8F2EB] border-[#B7DBC4] text-[#181A17]'
                  : 'bg-[#FAF8F4] border-[#DFCA9A] text-[#7A591C]'
              }`}
            >
              {currentReadiness?.isPaymentSucceeded ? (
                <CheckCircle2 size={18} className="text-[#287653] shrink-0 mt-0.5" />
              ) : (
                <Clock size={18} className="text-[#A67C2E] shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block text-xs">
                  {t('manager.planning.gate3Title', 'Điều kiện 3: Thanh toán cước vận chuyển (SePay VietQR)')}
                </strong>
                <p className="text-[11px] mt-0.5 m-0">
                  {currentReadiness?.isPaymentSucceeded
                    ? t(
                        'manager.planning.gate3Pass',
                        'Khách hàng đã hoàn tất thanh toán cước phí vận chuyển thành công.'
                      )
                    : t(
                        'manager.planning.gate3Fail',
                        'Đang chờ khách hàng thanh toán cước vận chuyển. Chuyến đi chưa được cấp lệnh xuất bến.'
                      )}
                </p>
              </div>
            </div>
          </div>

          {currentReadiness?.isReadyToDepart ? (
            <div className="p-3 bg-[#E8F2EB] border border-[#B7DBC4] rounded-lg text-[#287653] text-center font-bold">
              {t(
                'manager.planning.allGatesPassed',
                'CẢ 3 ĐIỀU KIỆN ĐÃ ĐẠT! Chuyến đi đã đủ điều kiện và sẵn sàng xuất phát.'
              )}
            </div>
          ) : (
            <div className="p-3 bg-[#FAF9F5] border border-[#D8CEBE] rounded-lg text-[#242722]">
              <strong className="block text-xs text-[#181A17] mb-1">
                {t('manager.planning.pendingStepsRequired', 'Các bước còn thiếu cần hoàn thành:')}
              </strong>
              <ul className="m-0 pl-4 list-disc text-[11px] text-[#5C6658] flex flex-col gap-1">
                {currentReadiness?.pendingConditions?.map((cond, idx) => (
                  <li key={idx}>
                    {isEn
                      ? cond.includes('Nháp') || cond.includes('Draft')
                        ? 'Trip plan is currently in Draft status, not yet submitted for approval.'
                        : cond.includes('Logistics Manager') || cond.includes('PENDING_APPROVAL')
                        ? 'Route plan is pending approval from Logistics Manager.'
                        : cond.includes('tài xế') || cond.includes('Driver/Escort')
                        ? 'Plan is approved but waiting for all drivers & escorts to confirm trip assignment.'
                        : cond.includes('chưa được xác nhận')
                        ? 'Transport route plan is not fully confirmed.'
                        : cond.includes('Hồ sơ pháp lý') || cond.includes('Flow 2')
                        ? 'Legal, testing, and quarantine documentation is not 100% completed and approved.'
                        : cond.includes('thanh toán') || cond.includes('SePay')
                        ? 'Awaiting customer freight payment completion via SePay VietQR.'
                        : cond
                      : cond}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end border-t border-[#EAE5DA] pt-3">
            <Button type="button" variant="outline" onClick={() => setIsReadinessModalOpen(false)}>
              {t('manager.common.close', 'Đóng')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
