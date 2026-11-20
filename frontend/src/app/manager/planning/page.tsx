'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plane,
  Truck,
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
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  routesApi,
  AirlineItem,
  AirportItem,
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
  specialRequirements?: string;
  routePlan?: RouteDetail | null;
  readiness?: TripPlanReadiness | null;
  totalCost?: number;
  transportCost?: number;
  insuranceFee?: number;
  bookingType?: string;
  stallUnitPrice?: number;
}

const CANONICAL_VEHICLE_TYPES = [
  'Xe thùng chuyên dụng điều hòa 18°C',
  'Xe van chuyên dụng 2-4 Stall',
  'Xe tải hạng nặng điều hòa 6-8 Stall',
  'Thùng container chuyên dụng cho ngựa',
] as const;

function normalizeVehicleTypeOption(raw?: string | null): string {
  const val = (raw || '').trim();
  if ((CANONICAL_VEHICLE_TYPES as readonly string[]).includes(val)) return val;
  const lower = val.toLowerCase();
  if (lower.includes('van') || lower.includes('2-4')) return 'Xe van chuyên dụng 2-4 Stall';
  if (lower.includes('heavy') || lower.includes('6-8') || lower.includes('hạng nặng')) {
    return 'Xe tải hạng nặng điều hòa 6-8 Stall';
  }
  if (lower.includes('container')) return 'Thùng container chuyên dụng cho ngựa';
  return 'Xe thùng chuyên dụng điều hòa 18°C';
}

export default function ManagerPlanningPage() {
  const { t, language, translateVehicleType, translateStopType, translateCountry } = useLanguage();
  const isEn = language === 'en';

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterTab, setFilterTab] = useState<
    'ALL' | 'NEED_FRAMEWORK' | 'PENDING_APPROVAL' | 'APPROVED' | 'READY' | 'IN_TRANSIT'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Master Data
  const [airlines, setAirlines] = useState<AirlineItem[]>([]);
  const [airports, setAirports] = useState<AirportItem[]>([]);
  const [coordinators, setCoordinators] = useState<any[]>([]);

  // Modal 1: Step 1a - Strategic Framework Modal
  const [isFrameworkModalOpen, setIsFrameworkModalOpen] = useState(false);
  const [selectedOrderForFramework, setSelectedOrderForFramework] = useState<OrderItem | null>(null);
  const [enableAirCargo, setEnableAirCargo] = useState(false);
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

  const getAirlineDescription = (code: string) => {
    if (isEn) {
      switch (code) {
        case 'CX':
          return 'International Live Animal & Competition Horse Transport';
        case 'EK':
          return 'First-Class In-Flight Equine Stalls & Transport';
        case 'QR':
          return 'Specialized Air Cargo for Live Animals & Breeding Horses';
        case 'SQ':
          return 'Premier Asian Racehorse Transit Service';
        case 'VN':
          return 'National Flag Carrier - Dedicated Care & Domestic Routes';
        default:
          return 'Specialized Equine Air Cargo Service';
      }
    }
    switch (code) {
      case 'CX':
        return 'Dịch vụ Chuyên chở Động vật sống & Ngựa thi đấu quốc tế';
      case 'EK':
        return 'Dịch vụ Khoang bay Đẳng cấp cho Ngựa đua Quốc tế';
      case 'QR':
        return 'Dịch vụ Hàng không Đặc biệt cho Động vật sống & Ngựa giống';
      case 'SQ':
        return 'Dịch vụ Vận chuyển Ngựa đua Chuyên nghiệp Hàng đầu Châu Á';
      case 'VN':
        return 'Hãng Hàng không Quốc gia - Chăm sóc Đặc biệt & Tuyến Nội địa';
      default:
        return 'Dịch vụ Hàng không Vận chuyển Ngựa Chuyên dụng';
    }
  };

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
      // 1. Load Master Data
      try {
        const master = await routesApi.getMasterData();
        if (master) {
          setAirlines(master.airlines || []);
          setAirports(master.airports || []);
        }
      } catch (masterErr) {
        console.warn('Failed to load master data:', masterErr);
      }

      // 2. Load Staff list
      try {
        const staffList = await apiClient<any[]>('/fleet/staff');
        if (Array.isArray(staffList)) {
          const coords = staffList.filter((s) =>
            (s.roleName || '').toLowerCase().includes('coordinator')
          );
          const drivers = staffList.filter(
            (s) =>
              (s.roleName || '').toLowerCase().includes('driver') ||
              (s.roleName || '').toLowerCase().includes('escort')
          );
          setCoordinators(coords);
          setAvailableDrivers(drivers);
        }
      } catch (staffErr) {
        console.warn('Failed to load staff list from backend:', staffErr);
      }

      // 3. Load Orders that are approved or planning
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
          o.status === 'completed'
      );

      // Enhance orders with route and readiness info with concurrency batching
      const enhanceOrder = async (o: any): Promise<OrderItem> => {
        let routePlan: RouteDetail | null = null;
        let readiness: TripPlanReadiness | null = null;
        try {
          routePlan = await routesApi.findRouteByShipmentId(o.id);
        } catch {
          // Order may not have a route framework yet
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

      if (filterTab === 'NEED_FRAMEWORK') {
        return (
          (!o.routePlan || o.routePlan.planStatus === 'draft') &&
          o.status !== 'in_transit' &&
          o.status !== 'completed'
        );
      }
      if (filterTab === 'PENDING_APPROVAL') {
        return o.routePlan?.planStatus === 'pending_approval';
      }
      if (filterTab === 'APPROVED') {
        return (
          (o.routePlan?.planStatus === 'approved' || o.routePlan?.planStatus === 'confirmed') &&
          o.status !== 'in_transit' &&
          o.status !== 'completed'
        );
      }
      if (filterTab === 'READY') {
        return (
          (o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart') &&
          o.status !== 'in_transit' &&
          o.status !== 'completed'
        );
      }
      if (filterTab === 'IN_TRANSIT') {
        return o.status === 'in_transit' || o.routePlan?.planStatus === 'in_transit';
      }
      return true;
    });
  }, [orders, searchQuery, filterTab]);

  // KPI Metrics & Tab counts
  const needFrameworkCount = orders.filter(
    (o) =>
      (!o.routePlan || o.routePlan.planStatus === 'draft') &&
      o.status !== 'in_transit' &&
      o.status !== 'completed'
  ).length;
  const pendingApprovalCount = orders.filter(
    (o) => o.routePlan?.planStatus === 'pending_approval'
  ).length;
  const approvedCount = orders.filter(
    (o) =>
      (o.routePlan?.planStatus === 'approved' || o.routePlan?.planStatus === 'confirmed') &&
      o.status !== 'in_transit' &&
      o.status !== 'completed'
  ).length;
  const readyToDepartCount = orders.filter(
    (o) =>
      (o.routePlan?.planStatus === 'ready_to_depart' || o.status === 'ready_to_depart') &&
      o.status !== 'in_transit' &&
      o.status !== 'completed'
  ).length;
  const inTransitCount = orders.filter(
    (o) => o.status === 'in_transit' || o.routePlan?.planStatus === 'in_transit'
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
        'hong kong',
        'malaysia',
        'thailand',
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
        'korea',
        'cambodia',
        'laos',
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
    if (tt.includes('domestic') || tt.includes('nội địa') || tt.includes('road') || tt.includes('đường bộ')) {
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

  // --- Handlers for Step 1a: Strategic Framework ---
  const handleOpenFrameworkModal = (order: OrderItem) => {
    setSelectedOrderForFramework(order);
    const existing = order.routePlan;
    const isIntl = isInternational(order);

    const isExistingAir = Boolean(
      existing?.managerAirlineId ||
        existing?.managerDepartureAirportId ||
        order.transportType === 'air' ||
        (order.specialRequirements || '').toLowerCase().includes('bay') ||
        (order.specialRequirements || '').toLowerCase().includes('hàng không')
    );
    const initialAirEnabled = isIntl || isExistingAir;
    setEnableAirCargo(initialAirEnabled);

    const oLower = (order.originLocation || '').toLowerCase();
    const dLower = (order.destinationLocation || '').toLowerCase();

    let bestDepAirport = airports.find((a) => a.iataCode === 'SGN');
    if (oLower.includes('hà nội') || oLower.includes('ha noi') || oLower.includes('nội bài')) {
      bestDepAirport = airports.find((a) => a.iataCode === 'HAN') || bestDepAirport;
    } else if (oLower.includes('đà nẵng') || oLower.includes('da nang')) {
      bestDepAirport = airports.find((a) => a.iataCode === 'DAD') || bestDepAirport;
    } else if (oLower.includes('cần thơ') || oLower.includes('can tho')) {
      bestDepAirport = airports.find((a) => a.iataCode === 'VCA') || bestDepAirport;
    }
    const defaultDepId = bestDepAirport?.id
      ? String(bestDepAirport.id)
      : airports[0]?.id
      ? String(airports[0].id)
      : '';

    let bestArrAirport: AirportItem | undefined = undefined;
    if (isIntl) {
      if (dLower.includes('kalimantan') || dLower.includes('borneo')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'BDJ') || airports.find((a) => a.iataCode === 'CGK');
      } else if (dLower.includes('indonesia') || dLower.includes('jakarta')) {
        bestArrAirport =
          airports.find((a) => a.iataCode === 'CGK') ||
          airports.find((a) => a.iataCode === 'SUB') ||
          airports.find((a) => a.iataCode === 'DPS') ||
          airports.find((a) => (a.country || '').toLowerCase().includes('indonesia'));
      } else if (dLower.includes('campuchia') || dLower.includes('cambodia') || dLower.includes('phnom penh')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'PNH');
      } else if (dLower.includes('singapore')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'SIN');
      } else if (dLower.includes('malaysia') || dLower.includes('kuala lumpur')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'KUL');
      } else if (dLower.includes('thailand') || dLower.includes('thái') || dLower.includes('bangkok')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'BKK');
      } else if (dLower.includes('japan') || dLower.includes('nhật') || dLower.includes('tokyo')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'NRT');
      } else if (dLower.includes('australia') || dLower.includes('úc') || dLower.includes('melbourne')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'MEL' || a.iataCode === 'SYD');
      } else if (dLower.includes('hong kong')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'HKG');
      } else if (dLower.includes('uae') || dLower.includes('dubai')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'DXB');
      } else if (dLower.includes('đức') || dLower.includes('germany') || dLower.includes('frankfurt')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'FRA');
      } else if (dLower.includes('pháp') || dLower.includes('france') || dLower.includes('paris')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'CDG');
      } else if (dLower.includes('mỹ') || dLower.includes('usa') || dLower.includes('new york')) {
        bestArrAirport = airports.find((a) => a.iataCode === 'JFK');
      }
    } else {
      if (bestDepAirport?.iataCode === 'SGN' || bestDepAirport?.iataCode === 'VCA') {
        bestArrAirport = airports.find((a) => a.iataCode === 'HAN') || airports.find((a) => a.iataCode === 'DAD');
      } else {
        bestArrAirport = airports.find((a) => a.iataCode === 'SGN') || airports.find((a) => a.iataCode === 'VCA');
      }
    }

    const intlFallback = airports.find((a) => !(a.country || '').toLowerCase().includes('vietnam'));
    const defaultArrId = bestArrAirport?.id
      ? String(bestArrAirport.id)
      : intlFallback?.id
      ? String(intlFallback.id)
      : airports[1]?.id
      ? String(airports[1].id)
      : '';

    const depCode =
      airports.find(
        (a) =>
          String(a.id) ===
          (existing?.managerDepartureAirportId ? String(existing.managerDepartureAirportId) : defaultDepId)
      )?.iataCode || 'SGN';
    const arrCode =
      airports.find(
        (a) =>
          String(a.id) ===
          (existing?.managerArrivalAirportId ? String(existing.managerArrivalAirportId) : defaultArrId)
      )?.iataCode || (isIntl ? 'DEST' : 'HAN');

    const defaultCorridor = initialAirEnabled
      ? isEn
        ? `Air Cargo Corridor (${isIntl ? 'International' : 'Domestic'}): Airport ${depCode} -> Airport ${arrCode}`
        : `Hành lang Hàng không ${isIntl ? 'Quốc tế' : 'Nội địa'}: Sân bay ${depCode} -> Sân bay ${arrCode}`
      : isEn
      ? 'Highway road corridor with mandatory rest stops'
      : 'Tuyến đường bộ cao tốc kết hợp trạm nghỉ';

    const defaultAirline = isIntl
      ? airlines[0]?.id
        ? String(airlines[0].id)
        : ''
      : airlines.find((a) => a.code === 'VN')?.id
      ? String(airlines.find((a) => a.code === 'VN')!.id)
      : airlines[0]?.id
      ? String(airlines[0].id)
      : '';

    setFrameworkForm({
      managerVehicleType: normalizeVehicleTypeOption(existing?.managerVehicleType),
      managerAirlineId:
        initialAirEnabled && existing?.managerAirlineId
          ? String(existing.managerAirlineId)
          : initialAirEnabled
          ? defaultAirline
          : '',
      managerDepartureAirportId:
        initialAirEnabled && existing?.managerDepartureAirportId
          ? String(existing.managerDepartureAirportId)
          : initialAirEnabled
          ? defaultDepId
          : '',
      managerArrivalAirportId:
        initialAirEnabled && existing?.managerArrivalAirportId
          ? String(existing.managerArrivalAirportId)
          : initialAirEnabled
          ? defaultArrId
          : '',
      managerMainCorridor: existing?.managerMainCorridor || defaultCorridor,
      assignedCoordinatorId: existing?.assignedCoordinatorId
        ? String(existing.assignedCoordinatorId)
        : coordinators[0]?.id
        ? String(coordinators[0].id)
        : '',
      strategicNotes:
        existing?.strategicNotes ||
        (initialAirEnabled
          ? isEn
            ? 'Maintain cabin temp at 18°C, provide timothy hay bedding and pre-flight electrolytes.'
            : 'Bảo đảm nhiệt độ khoang 18°C, chuẩn bị đệm rơm timothy và bổ sung điện giải trước giờ cất cánh.'
          : isEn
          ? 'Maintain truck stall temp at 18°C - 20°C, inspect equine vitals and supply electrolyte water at stops.'
          : 'Bảo đảm nhiệt độ thùng xe 18°C - 20°C, kiểm tra thể trạng ngựa và bổ sung nước điện giải tại các trạm dừng.'),
    });
    setIsFrameworkModalOpen(true);
  };

  const handleSaveFramework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForFramework || isSubmittingFramework) return;
    setIsSubmittingFramework(true);
    const isIntl = isInternational(selectedOrderForFramework);
    const hasAir = isIntl || enableAirCargo;
    try {
      await routesApi.setStrategicFramework(selectedOrderForFramework.id, {
        managerVehicleType: frameworkForm.managerVehicleType,
        managerAirlineId:
          hasAir && frameworkForm.managerAirlineId ? Number(frameworkForm.managerAirlineId) : undefined,
        managerDepartureAirportId:
          hasAir && frameworkForm.managerDepartureAirportId
            ? Number(frameworkForm.managerDepartureAirportId)
            : undefined,
        managerArrivalAirportId:
          hasAir && frameworkForm.managerArrivalAirportId
            ? Number(frameworkForm.managerArrivalAirportId)
            : undefined,
        managerMainCorridor: frameworkForm.managerMainCorridor,
        assignedCoordinatorId: frameworkForm.assignedCoordinatorId
          ? Number(frameworkForm.assignedCoordinatorId)
          : undefined,
        strategicNotes: frameworkForm.strategicNotes,
      });

      toast.success(
        t(
          'manager.planning.toastSaveFrameworkSuccess',
          `Đã thiết lập khung chiến lược và giao nhiệm vụ cho Coordinator cho đơn ${selectedOrderForFramework.requestCode}!`,
          { code: selectedOrderForFramework.requestCode }
        )
      );
      setIsFrameworkModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || (isEn ? 'Failed to save framework plan' : 'Không thể lưu khung kế hoạch'));
    } finally {
      setIsSubmittingFramework(false);
    }
  };

  // --- Handlers for Step 2: Manager Review ---
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
      await routesApi.reviewTripPlan(selectedOrderForReview.id, {
        status: 'approved',
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
      (['in_transit', 'completed'].includes(selectedOrderForAssign.status) ||
        ['in_transit', 'completed'].includes(selectedOrderForAssign.routePlan?.planStatus || '') ||
        (['confirmed', 'ready_to_depart'].includes(selectedOrderForAssign.status) && !hasPendingOrDeclinedStaff))
  );

  const assignEffectiveLegs =
    assignRouteLegs.length > 0 ? assignRouteLegs : selectedOrderForAssign?.routePlan?.legs || [];

  const isConsigneePickupPlate = (plate?: string | null) => {
    const p = String(plate || '').toLowerCase();
    return p.includes('đến đón') || p.includes('đến rước') || p.includes('bên nhận') || p.includes('consignee');
  };

  const isAssignAirShipment = Boolean(
    assignEffectiveLegs.some((l: any) => l.legType === 'flight' || l.mode === 'air') ||
      selectedOrderForAssign?.routePlan?.managerAirlineId ||
      selectedOrderForAssign?.routePlan?.managerDepartureAirportId ||
      (selectedOrderForAssign && isInternational(selectedOrderForAssign))
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
  const isEscortRequiredForAssign = isAssignAirShipment;

  const handleSaveStaffAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForAssign || isSubmittingAssign || isAssignReadOnly) return;

    if (isDriverRequiredForAssign && !selectedDriverId) {
      toast.error(
        isAssignAirShipment
          ? isEn
            ? 'Please select an available Truck Driver for the departure airport transfer leg!'
            : 'Vui lòng chọn Tài xế phụ trách chặng xe thùng trung chuyển ra sân bay xuất cảnh!'
          : t('manager.planning.toastSelectDriver', 'Vui lòng chọn 1 tài xế chính đang rảnh!')
      );
      return;
    }

    if (isEscortRequiredForAssign && !selectedEscortId) {
      toast.error(
        isEn
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
          ? `Assigned staff for order ${selectedOrderForAssign.requestCode} (and auto-synced across shared-stall orders)!`
          : `Đã phân công nhân sự cho đơn ${selectedOrderForAssign.requestCode} (và tự động đồng bộ cho các đơn ghép chung chuyến)!`
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
    key: 'ALL' | 'NEED_FRAMEWORK' | 'PENDING_APPROVAL' | 'APPROVED' | 'READY' | 'IN_TRANSIT';
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
      key: 'NEED_FRAMEWORK',
      label: t('manager.planning.tabUnplanned', 'Chưa lập kế hoạch'),
      count: needFrameworkCount,
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

  const renderCorridorSubtitle = (isIntl: boolean) =>
    t(
      'manager.planning.airSectionTitle',
      `2. Định hướng Chặng bay ${isIntl ? (isEn ? 'International' : 'Quốc tế') : isEn ? 'Domestic' : 'Nội địa'}`,
      { type: isIntl ? (isEn ? 'International' : 'Quốc tế') : isEn ? 'Domestic' : 'Nội địa' }
    );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('manager.planning.pageTitle', 'Master Trip Planning & Dispatch Control')}
          </h1>
          <p className="text-sm text-[#5C6658] mt-1">
            {t(
              'manager.planning.pageSubtitle',
              'Quy trình phê duyệt lộ trình đa phương thức, phân công nhân sự và kiểm soát cổng xuất phát.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-2 bg-white border border-[#D8CEBE] hover:bg-[#FAF8F4] text-[#242722] text-xs font-semibold rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-[#A67C2E]' : 'text-[#5C6658]'} />
          {t('manager.common.refresh', 'Làm mới')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#D8CEBE] rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#5C6658] uppercase tracking-wider m-0">
              {t('manager.planning.kpiUnplanned', 'Chờ lập kế hoạch')}
            </p>
            <p className="text-2xl font-black text-[#A67C2E] mt-1 m-0">{needFrameworkCount}</p>
            <p className="text-[11px] text-[#7E867B] mt-0.5 m-0">
              {t('manager.planning.kpiUnplannedDesc', 'Cần thiết lập loại xe và định hướng chặng')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F8F0DF] text-[#966516] flex items-center justify-center shrink-0">
            <Truck size={20} />
          </div>
        </div>

        <div className="bg-white border border-[#D8CEBE] rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#5C6658] uppercase tracking-wider m-0">
              {t('manager.planning.kpiPendingReview', 'Chờ phê duyệt')}
            </p>
            <p className="text-2xl font-black text-[#181A17] mt-1 m-0">{pendingApprovalCount}</p>
            <p className="text-[11px] text-[#7E867B] mt-0.5 m-0">
              {t('manager.planning.kpiPendingReviewDesc', 'Coordinator đã hoàn thiện kế hoạch chi tiết')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#FAF8F4] text-[#A67C2E] border border-[#EAE5DA] flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white border border-[#D8CEBE] rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#5C6658] uppercase tracking-wider m-0">
              {t('manager.planning.kpiReadyToDepart', 'Đủ điều kiện xuất phát')}
            </p>
            <p className="text-2xl font-black text-[#287653] mt-1 m-0">{readyToDepartCount}</p>
            <p className="text-[11px] text-[#7E867B] mt-0.5 m-0">
              {t('manager.planning.kpiReadyToDepartDesc', 'Kế hoạch đã chốt & kiểm dịch hoàn tất')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#E8F2EB] text-[#287653] flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
        </div>
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
          <div role="tablist" aria-label={t('manager.planning.pageTitle', 'Bộ lọc kế hoạch')} className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
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

          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-lg px-3 py-1.5 w-full md:w-64 focus-within:border-[#181A17]">
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
          <table className="w-full text-left text-sm border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-[#FAF9F5] border-b border-[#D8CEBE] text-xs font-bold text-[#5C6658] uppercase tracking-wider">
                <th className="p-4">{t('manager.planning.colOrder', 'Đơn vận chuyển')}</th>
                <th className="p-4">{t('manager.planning.colRoute', 'Hành trình & Loại chuyến')}</th>
                <th className="p-4">{t('manager.planning.colFramework', 'Kế hoạch chiến lược')}</th>
                <th className="p-4">{t('manager.planning.colStatus', 'Trạng thái lộ trình')}</th>
                <th className="p-4">{t('manager.planning.colGate', 'Điều kiện xuất phát')}</th>
                <th className="p-4 text-right">{t('manager.planning.colActions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EEE8]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#5C6658] font-medium">
                    <Loader2 size={24} className="animate-spin text-[#A67C2E] mx-auto mb-2" />
                    {t('manager.planning.loadingTrips', 'Đang tải dữ liệu kế hoạch chuyến đi...')}
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const plan = order.routePlan;
                  const isIntl = isInternational(order);
                  const planStatus = plan?.planStatus || 'draft';

                  return (
                    <tr key={order.id} className="hover:bg-[#FAF9F5] transition-colors">
                      {/* Code & Horse */}
                      <td className="p-4 align-middle">
                        <span className="font-bold text-[#A67C2E] text-xs">{order.requestCode}</span>
                        {order.customerRequestCode && order.customerRequestCode !== order.requestCode && (
                          <span className="text-[10px] text-[#7E867B] block font-normal">
                            ({t('manager.planning.customerCode', 'Mã khách: {code}', { code: order.customerRequestCode })})
                          </span>
                        )}
                        <p className="text-xs text-[#181A17] font-semibold m-0 mt-0.5">
                          {order.customerName || (isEn ? 'Customer' : 'Khách hàng')}
                        </p>
                        <p className="text-[11px] text-[#7E867B] m-0">
                          {order.requestedHorseCount} {t('manager.common.horses', 'cá thể ngựa')}
                        </p>
                      </td>

                      {/* Route Corridor */}
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#181A17] leading-normal">
                          <span className="truncate max-w-[140px]" title={order.originLocation}>
                            {order.originLocation}
                          </span>
                          <span className="text-[#7E867B] font-bold shrink-0 text-sm">→</span>
                          <span className="truncate max-w-[140px] text-[#181A17]" title={order.destinationLocation}>
                            {order.destinationLocation}
                          </span>
                        </div>
                        {(() => {
                          const isAir = Boolean(
                            order.routePlan?.managerAirlineId ||
                              order.routePlan?.managerAirlineName ||
                              (order.transportType || '').toLowerCase().includes('air') ||
                              (order.specialRequirements || '').toLowerCase().includes('hàng không') ||
                              (order.specialRequirements || '').toLowerCase().includes('air flight') ||
                              (order.specialRequirements || '').toLowerCase().includes('bay')
                          );
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold mt-1.5 ${
                                isIntl
                                  ? 'bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE]'
                                  : isAir
                                  ? 'bg-[#F8F0DF] text-[#7A591C] border border-[#DFCA9A]'
                                  : 'bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]'
                              }`}
                            >
                              {isIntl || isAir ? <Plane size={10} /> : <Truck size={10} />}
                              {isIntl
                                ? t('manager.planning.intlMultimodal', 'Vận chuyển Quốc tế')
                                : isAir
                                ? t('manager.planning.domesticAir', 'Nội địa (Hàng không)')
                                : t('manager.planning.domesticRoad', 'Vận chuyển Nội địa')}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Strategic Framework */}
                      <td className="p-4 align-middle">
                        {plan?.managerVehicleType ? (
                          <div className="text-xs">
                            <p className="font-semibold text-[#181A17] m-0">
                              {translateVehicleType(plan.managerVehicleType)}
                            </p>
                            {plan.managerAirlineName && isIntl && (
                              <p className="text-[11px] text-[#A67C2E] font-medium m-0 flex items-center gap-1 mt-0.5">
                                <Plane size={11} /> {plan.managerAirlineName} ({plan.managerDepartureAirportCode} →{' '}
                                {plan.managerArrivalAirportCode})
                              </p>
                            )}
                            <p className="text-[10px] text-[#5C6658] m-0 mt-0.5">
                              {t('manager.planning.assignedTo', 'Phụ trách: {name}', {
                                name: plan.assignedCoordinatorName || t('manager.planning.unassigned', 'Chưa chỉ định'),
                              })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-[#966516] font-semibold italic bg-[#F8F0DF] px-2.5 py-1 rounded border border-[#DFCA9A] inline-block">
                            {t('manager.planning.unplannedNotice', 'Chưa thiết lập kế hoạch')}
                          </span>
                        )}
                      </td>

                      {/* Plan Status */}
                      <td className="p-4 align-middle">
                        {planStatus === 'in_transit' || order.status === 'in_transit' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]">
                            <Truck size={12} className="text-[#A67C2E] animate-pulse" />{' '}
                            {t('manager.planning.statusInTransit', 'Đang di chuyển')}
                          </span>
                        ) : planStatus === 'completed' || order.status === 'completed' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#F0EEE8] text-[#242722] border border-[#D8CEBE]">
                            <CheckCircle2 size={12} className="text-[#287653]" />{' '}
                            {t('manager.planning.statusCompleted', 'Đã hoàn thành')}
                          </span>
                        ) : planStatus === 'draft' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                            <Clock size={12} /> {t('manager.planning.statusDraft', 'Bản nháp')}
                          </span>
                        ) : planStatus === 'pending_approval' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#FAF8F4] text-[#181A17] border border-[#B49A68] animate-pulse">
                            <Clock size={12} className="text-[#A67C2E]" />{' '}
                            {t('manager.planning.statusPendingApproval', 'Chờ phê duyệt')}
                          </span>
                        ) : planStatus === 'approved' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE]">
                            <Check size={12} className="text-[#287653]" />{' '}
                            {t('manager.planning.statusApproved', 'Đã duyệt')}
                          </span>
                        ) : planStatus === 'confirmed' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
                            <CheckCircle2 size={12} /> {t('manager.planning.statusConfirmed', 'Đã nhận chuyến')}
                          </span>
                        ) : planStatus === 'ready_to_depart' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#287653] text-white shadow-sm">
                            <CheckCircle2 size={12} /> {t('manager.planning.statusReadyToDepart', 'Sẵn sàng xuất phát')}
                          </span>
                        ) : null}
                      </td>

                      {/* Gate Readiness */}
                      <td className="p-4 align-middle">
                        {order.status === 'in_transit' || planStatus === 'in_transit' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]">
                            <CheckCircle2 size={13} /> {t('manager.planning.gateDeparted', 'Đã xuất phát cổng')}
                          </span>
                        ) : order.status === 'completed' || planStatus === 'completed' ? (
                          <span className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#F0EEE8] text-[#242722] border border-[#D8CEBE]">
                            <CheckCircle2 size={13} className="text-[#287653]" />{' '}
                            {t('manager.planning.gateArrived', 'Đã cập bến đích')}
                          </span>
                        ) : order.readiness?.isReadyToDepart ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentReadiness(order.readiness || null);
                              setIsReadinessModalOpen(true);
                            }}
                            className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4] hover:bg-[#d7eadc] transition-colors shadow-sm cursor-pointer"
                          >
                            <ShieldCheck size={13} /> {t('manager.planning.gateReady', '100% Đủ điều kiện')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentReadiness(order.readiness || null);
                              setIsReadinessModalOpen(true);
                            }}
                            className="inline-flex items-center px-3 py-1.5 whitespace-nowrap gap-1.5 rounded-md text-xs font-bold bg-[#FAF9F5] text-[#242722] hover:bg-[#F0EEE8] border border-[#D8CEBE] transition-colors cursor-pointer"
                          >
                            <AlertCircle size={12} className="text-[#A67C2E]" />
                            {t('manager.planning.gatePending', 'Đang chờ ({count} điều kiện)', {
                              count: order.readiness?.pendingConditions?.length || 1,
                            })}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 align-middle text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {/* Strategic Plan Button */}
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
                                onClick={() => handleOpenFrameworkModal(order)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer border ${
                                  hasActiveIncident
                                    ? 'bg-rose-100 hover:bg-rose-200 text-[#B33E3E] border-rose-300 animate-pulse'
                                    : plan?.managerVehicleType
                                    ? 'bg-[#FAF9F5] hover:bg-[#F0EEE8] text-[#242722] border-[#D8CEBE]'
                                    : 'bg-[#181A17] hover:bg-[#242722] text-white border-transparent'
                                }`}
                                title={
                                  hasActiveIncident
                                    ? isEn
                                      ? 'Route incident reported - Click to adjust framework'
                                      : 'Lộ trình gặp sự cố - Bấm để hiệu chỉnh lại định hướng kế hoạch'
                                    : isEn
                                    ? 'Set overall transport plan framework'
                                    : 'Thiết lập kế hoạch vận chuyển tổng thể'
                                }
                              >
                                {hasActiveIncident ? (
                                  <AlertCircle size={13} className="text-[#B33E3E]" />
                                ) : (
                                  <Truck size={13} />
                                )}
                                {hasActiveIncident
                                  ? t('manager.planning.btnEditFrameworkIncident', 'Điều chỉnh do sự cố')
                                  : plan?.managerVehicleType
                                  ? t('manager.planning.btnEditFramework', 'Sửa kế hoạch')
                                  : t('manager.planning.btnSetupFramework', 'Thiết lập kế hoạch')}
                              </button>
                            );
                          })()}

                          {/* Completed Trip View Route Button */}
                          {(order.status === 'completed' || planStatus === 'completed') && (
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(order)}
                              className="px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#F0EEE8] text-[#242722] text-xs font-semibold rounded-lg border border-[#D8CEBE] shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              title={
                                isEn
                                  ? 'Trip safely arrived at destination - Click to view route details'
                                  : 'Chuyến đi đã cập bến đích an toàn - Bấm để xem chi tiết lộ trình'
                              }
                            >
                              <Eye size={13} className="text-[#5C6658]" />{' '}
                              {t('manager.planning.btnViewRoute', 'Xem lộ trình')}
                            </button>
                          )}

                          {/* Review Button */}
                          {planStatus === 'pending_approval' && (
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(order)}
                              className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer border-0 ${
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
                              <Eye size={13} />
                              {Boolean(plan?.activeIncident)
                                ? t('manager.planning.btnReviewPlanIncident', 'Duyệt điều chỉnh sự cố')
                                : t('manager.planning.btnReviewPlan', 'Duyệt kế hoạch')}
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
                                    className="px-3 py-1.5 bg-[#242722] hover:bg-[#181A17] text-[#FAF8F4] text-xs font-bold rounded-lg border border-[#B49A68] shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                    title={
                                      isEn
                                        ? 'View crew assigned to active trip'
                                        : 'Xem nhân sự đang phụ trách chuyến đi'
                                    }
                                  >
                                    <UserCheck size={13} className="text-[#B49A68]" />{' '}
                                    {t('manager.planning.btnViewCrew', 'Xem nhân sự')}
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
                                    className="px-3 py-1.5 bg-[#287653] hover:bg-[#1f5e42] text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer border-0"
                                    title={
                                      isEn
                                        ? 'Crew assigned and 100% departure ready - Click to view or update crew'
                                        : 'Đã phân công đầy đủ nhân sự và đạt 100% điều kiện xuất phát - Bấm để xem hoặc cập nhật nhân sự'
                                    }
                                  >
                                    <CheckCircle2 size={13} />{' '}
                                    {t('manager.planning.btnCrewAssigned', 'Phân công thành công')}
                                  </button>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(order)}
                                  className="px-3 py-1.5 bg-[#181A17] hover:bg-[#242722] text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer border-0"
                                  title={
                                    isEn
                                      ? 'Assign driver and escort veterinarian'
                                      : 'Phân công tài xế và bác sĩ hộ tống'
                                  }
                                >
                                  <UserCheck size={13} />{' '}
                                  {t('manager.planning.btnAssignCrew', 'Phân công nhân sự')}
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
                  <td colSpan={6} className="p-12 text-center text-[#5C6658] font-medium">
                    {t('manager.planning.noOrdersFound', 'Không tìm thấy chuyến đi nào phù hợp với bộ lọc.')}
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
        onClose={() => { if (!isSubmittingFramework) setIsFrameworkModalOpen(false); }}
        closeDisabled={isSubmittingFramework}
        title={t(
          'manager.planning.modalFrameworkTitle',
          `Thiết lập khung kế hoạch vận chuyển - ${selectedOrderForFramework?.requestCode}`,
          { code: selectedOrderForFramework?.requestCode || '' }
        )}
      >
        <form onSubmit={handleSaveFramework} className="flex flex-col gap-4 text-xs">
          {/* Customer Request Summary Card */}
          {selectedOrderForFramework && (
            <div className="bg-[#FAF9F5] border border-[#D8CEBE] p-3.5 rounded-xl flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#181A17] text-xs flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-[#F3EFE4] text-[#181A17] font-extrabold text-[11px]">
                    {selectedOrderForFramework.customerRequestCode || selectedOrderForFramework.requestCode}
                  </span>
                  <span>
                    {t('manager.common.customer', 'Khách hàng')}:{' '}
                    <strong>{selectedOrderForFramework.customerName || '—'}</strong>
                  </span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isInternational(selectedOrderForFramework)
                      ? 'bg-[#F3EFE4] text-[#181A17]'
                      : 'bg-[#E8F2EB] text-[#287653]'
                  }`}
                >
                  {isInternational(selectedOrderForFramework)
                    ? t('manager.planning.intlMultimodal', 'Vận chuyển Quốc tế')
                    : t('manager.planning.domesticRoad', 'Vận chuyển Nội địa')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#181A17] bg-white p-2.5 rounded-lg border border-[#EAE5DA]">
                <span className="text-[#5C6658] truncate">{selectedOrderForFramework.originLocation}</span>
                <ArrowRight size={14} className="text-[#7E867B] shrink-0" />
                <span className="text-[#181A17] font-bold truncate">
                  {selectedOrderForFramework.destinationLocation}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C6658] pt-0.5">
                <span>
                  {isEn ? 'Horses count:' : 'Số lượng ngựa:'}{' '}
                  <strong className="text-[#181A17]">
                    {selectedOrderForFramework.requestedHorseCount}{' '}
                    {t('manager.common.horses', 'chiến mã')}
                  </strong>
                </span>
                <span>
                  {t('manager.common.departureDate', 'Ngày xuất phát')}:{' '}
                  <strong className="text-[#181A17]">
                    {selectedOrderForFramework.requestedDate
                      ? new Date(selectedOrderForFramework.requestedDate).toLocaleDateString(
                          isEn ? 'en-US' : 'vi-VN'
                        )
                      : '—'}
                  </strong>
                </span>
              </div>
              {selectedOrderForFramework.specialRequirements && (
                <div className="text-[11px] text-[#7A591C] bg-[#F8F0DF] p-2 rounded border border-[#DFCA9A]">
                  <span className="font-bold">
                    {t('manager.common.specialRequirements', 'Ghi chú & Lộ trình yêu cầu:')}{' '}
                  </span>
                  {selectedOrderForFramework.specialRequirements}
                </div>
              )}
            </div>
          )}

          <div className="bg-[#FAF8F4] border border-[#EAE5DA] p-3 rounded-lg text-[#181A17] leading-relaxed">
            <strong>{t('manager.planning.modalFrameworkTipTitle', 'Vai trò Logistics Manager:')}</strong>{' '}
            {t(
              'manager.planning.modalFrameworkTipDesc',
              'Bạn định hướng loại phương tiện, hãng hàng không, cặp sân bay và chỉ định Coordinator. Coordinator sẽ căn cứ vào đây để chọn xe cụ thể, đặt booking và dựng từng chặng chi tiết.'
            )}
          </div>

          <div>
            <label htmlFor="planning-vehicle-type" className="font-bold text-[#242722] block mb-1">
              {t('manager.planning.fieldVehicleType', '1. Loại phương tiện đường bộ yêu cầu *')}
            </label>
            <select
              id="planning-vehicle-type"
              value={frameworkForm.managerVehicleType}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, managerVehicleType: e.target.value })}
              className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17]"
              required
            >
              <option value="Xe thùng chuyên dụng điều hòa 18°C">
                {t('manager.planning.optTruckClimate', 'Xe thùng chuyên dụng điều hòa nhiệt độ (18°C - 20°C)')}
              </option>
              <option value="Xe van chuyên dụng 2-4 Stall">
                {t('manager.planning.optVanSpecial', 'Xe van chuyên dụng vận tải ngựa thể thao (2 - 4 khoang)')}
              </option>
              <option value="Xe tải hạng nặng điều hòa 6-8 Stall">
                {t('manager.planning.optHeavyTruck', 'Xe tải hạng nặng điều hòa (6 - 8 khoang)')}
              </option>
              <option value="Thùng container chuyên dụng cho ngựa">
                {t('manager.planning.optContainer', 'Thùng container đường bộ chuyên dụng')}
              </option>
            </select>
          </div>

          {/* Toggle Air Cargo cho đơn nội địa */}
          {selectedOrderForFramework && !isInternational(selectedOrderForFramework) && (
            <div className="flex items-center justify-between p-2.5 bg-[#FAF8F4] border border-[#D8CEBE] rounded-lg gap-3">
              <div className="flex items-center gap-2">
                <Plane size={15} className="text-[#A67C2E] shrink-0" />
                <div>
                  <label htmlFor="planning-air-toggle" className="font-bold text-[#181A17] text-xs cursor-pointer block">
                    {t('manager.planning.domesticAirCargoToggle', 'Vận chuyển Hàng không Nội địa')}
                  </label>
                  <div className="text-[11px] text-[#5C6658]">
                    {t(
                      'manager.planning.domesticAirCargoDesc',
                      'Tích chọn nếu chuyến đi kết hợp chặng bay nội địa (VD: SGN -> HAN, DAD)'
                    )}
                  </div>
                </div>
              </div>
              <input
                id="planning-air-toggle"
                type="checkbox"
                checked={enableAirCargo}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setEnableAirCargo(enabled);
                  if (enabled) {
                    const oLower = (selectedOrderForFramework.originLocation || '').toLowerCase();
                    let dep = airports.find((a) => a.iataCode === 'SGN');
                    let arr = airports.find((a) => a.iataCode === 'HAN');
                    if (oLower.includes('hà nội') || oLower.includes('ha noi')) {
                      dep = airports.find((a) => a.iataCode === 'HAN');
                      arr = airports.find((a) => a.iataCode === 'SGN');
                    }
                    const depId = dep ? String(dep.id) : airports[0]?.id ? String(airports[0].id) : '';
                    const arrId = arr ? String(arr.id) : airports[1]?.id ? String(airports[1].id) : '';
                    const vnAirline = airlines.find((a) => a.code === 'VN') || airlines[0];
                    setFrameworkForm((prev) => ({
                      ...prev,
                      managerAirlineId: prev.managerAirlineId || (vnAirline ? String(vnAirline.id) : ''),
                      managerDepartureAirportId: depId,
                      managerArrivalAirportId: arrId,
                      managerMainCorridor: isEn
                        ? `Domestic Air Corridor: Airport ${dep?.iataCode || 'SGN'} -> Airport ${arr?.iataCode || 'HAN'}`
                        : `Hành lang Hàng không Nội địa: Sân bay ${dep?.iataCode || 'SGN'} -> Sân bay ${arr?.iataCode || 'HAN'}`,
                    }));
                  } else {
                    setFrameworkForm((prev) => ({
                      ...prev,
                      managerAirlineId: '',
                      managerDepartureAirportId: '',
                      managerArrivalAirportId: '',
                      managerMainCorridor: isEn
                        ? 'Highway road corridor with mandatory rest stops'
                        : 'Tuyến đường bộ cao tốc / Quốc lộ kết hợp trạm nghỉ',
                    }));
                  }
                }}
                className="w-4 h-4 text-[#A67C2E] rounded border-[#D8CEBE] focus:ring-[#C4B38E] cursor-pointer shrink-0"
              />
            </div>
          )}

          {selectedOrderForFramework && (isInternational(selectedOrderForFramework) || enableAirCargo) && (
            <div className="p-3 bg-[#FAF8F4] border border-[#D8CEBE] rounded-lg flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#181A17] flex items-center gap-1.5 text-xs">
                  <Plane size={14} className="text-[#A67C2E]" />{' '}
                  {renderCorridorSubtitle(isInternational(selectedOrderForFramework))}
                </span>
                <span className="text-[10px] bg-[#F3EFE4] text-[#181A17] font-bold px-2 py-0.5 rounded-full">
                  IATA Live Animals Regulations (LAR)
                </span>
              </div>

              <div>
                <label htmlFor="planning-airline" className="font-bold text-[#242722] block mb-1">
                  {t('manager.planning.airAirlineLabel', 'Hãng hàng không vận chuyển ngựa *')}
                </label>
                <select
                  id="planning-airline"
                  value={frameworkForm.managerAirlineId}
                  onChange={(e) => setFrameworkForm({ ...frameworkForm, managerAirlineId: e.target.value })}
                  className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17]"
                >
                  {airlines.map((al) => (
                    <option key={al.id} value={al.id}>
                      {al.name} ({al.code}) — {al.cargoServiceName} [{getAirlineDescription(al.code)}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="planning-dep-airport" className="font-bold text-[#242722] block mb-1">
                    {t('manager.planning.airDepAirport', 'Sân bay xuất phát *')}
                  </label>
                  <select
                    id="planning-dep-airport"
                    value={frameworkForm.managerDepartureAirportId}
                    onChange={(e) => {
                      const newDepId = e.target.value;
                      const depAp = airports.find((a) => String(a.id) === newDepId);
                      const arrAp = airports.find((a) => String(a.id) === frameworkForm.managerArrivalAirportId);
                      const intlFlag = isInternational(selectedOrderForFramework);
                      setFrameworkForm({
                        ...frameworkForm,
                        managerDepartureAirportId: newDepId,
                        managerMainCorridor: isEn
                          ? `Air Cargo Corridor (${intlFlag ? 'International' : 'Domestic'}): Airport ${
                              depAp?.iataCode || 'DEP'
                            } -> Airport ${arrAp?.iataCode || 'ARR'}`
                          : `Hành lang Hàng không ${intlFlag ? 'Quốc tế' : 'Nội địa'}: Sân bay ${
                              depAp?.iataCode || 'DEP'
                            } -> Sân bay ${arrAp?.iataCode || 'ARR'}`,
                      });
                    }}
                    className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17]"
                  >
                    <optgroup label={t('manager.planning.airHubGroupVn', 'Sân bay Việt Nam (Xuất phát)')}>
                      {airports
                        .filter(
                          (ap) =>
                            (ap.country || '').toLowerCase().includes('vietnam') ||
                            (ap.country || '').toLowerCase().includes('việt nam') ||
                            ['SGN', 'HAN', 'DAD', 'VCA'].includes(ap.iataCode)
                        )
                        .map((ap) => (
                          <option key={ap.id} value={ap.id}>
                            {ap.iataCode} - {ap.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label={t('manager.planning.airHubGroupIntl', 'Sân bay Quốc tế')}>
                      {airports
                        .filter(
                          (ap) =>
                            !(
                              (ap.country || '').toLowerCase().includes('vietnam') ||
                              (ap.country || '').toLowerCase().includes('việt nam')
                            ) && !['SGN', 'HAN', 'DAD', 'VCA'].includes(ap.iataCode)
                        )
                        .map((ap) => (
                          <option key={ap.id} value={ap.id}>
                            {ap.iataCode} - {ap.name} ({ap.country})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label htmlFor="planning-arr-airport" className="font-bold text-[#242722] block mb-1">
                    {t('manager.planning.airArrAirport', 'Sân bay hạ cánh *')}
                  </label>
                  <select
                    id="planning-arr-airport"
                    value={frameworkForm.managerArrivalAirportId}
                    onChange={(e) => {
                      const newArrId = e.target.value;
                      const depAp = airports.find((a) => String(a.id) === frameworkForm.managerDepartureAirportId);
                      const arrAp = airports.find((a) => String(a.id) === newArrId);
                      const intlFlag = isInternational(selectedOrderForFramework);
                      setFrameworkForm({
                        ...frameworkForm,
                        managerArrivalAirportId: newArrId,
                        managerMainCorridor: isEn
                          ? `Air Cargo Corridor (${intlFlag ? 'International' : 'Domestic'}): Airport ${
                              depAp?.iataCode || 'DEP'
                            } -> Airport ${arrAp?.iataCode || 'ARR'}`
                          : `Hành lang Hàng không ${intlFlag ? 'Quốc tế' : 'Nội địa'}: Sân bay ${
                              depAp?.iataCode || 'DEP'
                            } -> Sân bay ${arrAp?.iataCode || 'ARR'}`,
                      });
                    }}
                    className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17]"
                  >
                    <optgroup
                      label={t('manager.planning.airHubGroupVnArrival', 'Sân bay Việt Nam (Hạ cánh Nội địa)')}
                    >
                      {airports
                        .filter(
                          (ap) =>
                            (ap.country || '').toLowerCase().includes('vietnam') ||
                            (ap.country || '').toLowerCase().includes('việt nam') ||
                            ['SGN', 'HAN', 'DAD', 'VCA'].includes(ap.iataCode)
                        )
                        .map((ap) => (
                          <option key={ap.id} value={ap.id}>
                            {ap.iataCode} - {ap.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label={t('manager.planning.airHubGroupIntl', 'Sân bay Quốc tế')}>
                      {airports
                        .filter(
                          (ap) =>
                            !(
                              (ap.country || '').toLowerCase().includes('vietnam') ||
                              (ap.country || '').toLowerCase().includes('việt nam')
                            ) && !['SGN', 'HAN', 'DAD', 'VCA'].includes(ap.iataCode)
                        )
                        .map((ap) => (
                          <option key={ap.id} value={ap.id}>
                            {ap.iataCode} - {ap.name} ({ap.country})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="text-[11px] text-[#7A591C] bg-[#F8F0DF] p-2.5 rounded border border-[#DFCA9A] leading-snug">
                <strong>
                  {isEn ? 'International Hub Standard:' : 'Quy chuẩn Hub trung chuyển quốc tế:'}
                </strong>{' '}
                {t(
                  'manager.planning.airHubNotice',
                  'Máy bay chở ngựa chỉ hạ cánh tại các Cảng hàng không trung chuyển động vật sống đạt chuẩn IATA có trạm kiểm dịch thú y. Nếu địa phương/quốc gia đích chưa có sân bay trực tiếp, chuyến bay sẽ hạ cánh tại Hub gần nhất của khu vực, sau đó Coordinator sẽ phân công xe thùng điều hòa chuyên dụng chở tiếp chặng cuối về tận chuồng nuôi đích.'
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="planning-corridor" className="font-bold text-[#242722] block mb-1">
              {t('manager.planning.fieldCorridor', '3. Tuyến đường chính định hướng')}
            </label>
            <input
              id="planning-corridor"
              type="text"
              placeholder={t(
                'manager.planning.fieldCorridorPlaceholder',
                'VD: Tuyến cao tốc Trung Lương - Cảng SGN Cargo'
              )}
              value={frameworkForm.managerMainCorridor}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, managerMainCorridor: e.target.value })}
              className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none text-xs text-[#181A17]"
            />
          </div>

          <div>
            <label htmlFor="planning-coordinator" className="font-bold text-[#242722] block mb-1">
              {t('manager.planning.fieldCoordinator', '4. Chỉ định Fleet & Route Coordinator phụ trách *')}
            </label>
            <select
              id="planning-coordinator"
              value={frameworkForm.assignedCoordinatorId}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, assignedCoordinatorId: e.target.value })}
              className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none font-medium text-xs bg-white text-[#181A17]"
              required
            >
              <option value="">
                {t('manager.planning.coordinatorPlaceholder', '-- Chọn điều phối viên --')}
              </option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="planning-notes" className="font-bold text-[#242722] block mb-1">
              {t('manager.planning.fieldNotes', '5. Ghi chú & Yêu cầu đặc biệt cho Coordinator')}
            </label>
            <textarea
              id="planning-notes"
              rows={3}
              value={frameworkForm.strategicNotes}
              onChange={(e) => setFrameworkForm({ ...frameworkForm, strategicNotes: e.target.value })}
              className="w-full p-2 border border-[#D8CEBE] rounded-lg outline-none text-xs text-[#181A17]"
              placeholder={t(
                'manager.planning.notesPlaceholder',
                'Ghi chú về chăm sóc y tế, nhiệt độ xe, trạm dừng chân...'
              )}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#EAE5DA] pt-3 mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmittingFramework}
              onClick={() => setIsFrameworkModalOpen(false)}
            >
              {t('manager.common.cancel', 'Hủy')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="bg-[#181A17] hover:bg-[#242722] text-white font-bold px-4 py-2"
              disabled={isSubmittingFramework}
            >
              {isSubmittingFramework ? (
                <Loader2 size={14} className="animate-spin mr-1.5" />
              ) : (
                <Send size={14} className="mr-1.5" />
              )}
              {t('manager.planning.assignFrameworkBtn', 'Giao kế hoạch cho Coordinator')}
            </Button>
          </div>
        </form>
      </Modal>

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
                              : t('manager.planning.legRoad', 'ĐƯỜNG BỘ')}
                          </span>
                        </div>
                        {leg.legType === 'road' ? (
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
                          ? 'Locked Freight Quote (Flow 1 Reference)'
                          : 'Đối chiếu cước vận chuyển đã chốt (từ Flow 1)'}
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
                          {isEn ? 'Transport Freight (Locked, VND)' : 'Cước vận chuyển đã chốt (VNĐ)'}
                        </label>
                        <input
                          id="review-freight-cost"
                          type="number"
                          readOnly
                          disabled
                          value={reviewTransportCost}
                          className="w-full px-3 py-1.5 text-xs font-bold text-[#5C6658] bg-[#F7F4EE] border border-[#D8CEBE] rounded-lg cursor-not-allowed"
                        />
                        <span className="text-[10px] text-[#5C6658] mt-0.5 block">
                          {isEn ? 'Actual distance:' : 'Quãng đường thực tế:'}{' '}
                          {detailedRoute.totalDistanceKm || 0} km •{' '}
                          {isEn ? 'Immutable after Flow 1 approval' : 'Cố định từ phê duyệt Flow 1'}
                        </span>
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

              <div className="bg-[#FAF8F4] border border-[#EAE5DA] p-3.5 rounded-xl text-[#181A17] leading-relaxed">
                {isAssignAirShipment ? (
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-[#966516] mb-1">
                      <Plane size={14} className="shrink-0" />
                      <span>
                        {isEn
                          ? 'Multimodal Air Cargo Personnel Allocation'
                          : 'Quy tắc phân bổ nhân sự Vận chuyển Hàng không (Đa phương thức)'}
                      </span>
                    </div>
                    <p className="m-0 text-[#5C6658]">
                      {isEn
                        ? '• Road Truck Driver: Operates Leg 1 (specialized truck transfer from farm/stable to departure airport cargo terminal). Released after airport handover.'
                        : '• Tài xế xe thùng (Driver): Chỉ điều khiển xe chuyên dụng chở ngựa từ trang trại ra sân bay xuất cảnh (Chặng 1). Sau khi bàn giao tại sân bay, tài xế hoàn tất nhiệm vụ chặng đường bộ.'}
                    </p>
                    <p className="mt-1 mb-0 text-[#181A17] font-semibold">
                      {isEn
                        ? '• Equine Vet / Flight Escort (Mandatory *): Accompanies horses inside the aircraft cargo cabin, monitors vitals in-flight, and handles arrival customs clearance & final handover.'
                        : '• Bác sĩ thú y / Hộ tống bay (Bắt buộc *): Trực tiếp đi cùng khoang bay chăm sóc ngựa, ghi nhận sinh hiệu trên không, làm thủ tục thông quan tại sân bay đến và bàn giao tại đích.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {t(
                      'manager.planning.assignTip',
                      'Phân công nhân sự: Chọn tài xế chính và người hộ tống. Sau khi bạn bấm lưu, hệ thống sẽ tự động gửi thông báo đến tài xế để họ bấm xác nhận nhận chuyến trên ứng dụng.'
                    )}
                    <p className="mt-1.5 text-[#287653] font-semibold mb-0">
                      <strong>{isEn ? 'Shared-stall auto-sync:' : 'Tự động đồng bộ ghép chuồng:'}</strong>{' '}
                      {isEn
                        ? 'Assigning crew to this shipment automatically syncs the crew to sibling orders consolidated on the same vehicle trip.'
                        : 'Khi bạn phân công tài xế cho đơn này, hệ thống sẽ tự động áp dụng luôn cho các đơn hàng khác đi cùng chuyến xe mà bạn không cần phải phân công lại!'}
                    </p>
                  </>
                )}
              </div>

              {assignEffectiveLegs.length > 0 && (
                <div className="border border-[#E5DDD0] bg-white rounded-xl p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] block mb-2">
                    {isEn ? 'Responsibility by Route Leg' : 'Phân nhiệm nhân sự theo từng chặng lộ trình'}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {assignEffectiveLegs.map((leg: any, idx: number) => {
                      const isFlight = leg.legType === 'flight' || leg.mode === 'air';
                      const isConsigneeRoad =
                        !isFlight &&
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
                                : isConsigneeRoad
                                ? 'bg-[#F3EFE4] text-[#7A591C] border border-[#DFCA9A]'
                                : 'bg-white text-[#181A17] border border-[#D8CEBE]'
                            }`}
                          >
                            {isFlight
                              ? isEn
                                ? 'Vet / Flight Escort (In-Flight)'
                                : 'Bác sĩ thú y / Hộ tống bay'
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
                    const freeDrivers = availableDrivers.filter((d) => {
                      const isDriverRole =
                        d.specialization === 'driver' ||
                        (!d.specialization &&
                          !d.fullName?.toLowerCase().includes('thú y') &&
                          !d.email?.includes('escort'));
                      if (!isDriverRole) return false;
                      const isCurrentDriver = String(d.id) === selectedDriverId;
                      return Number(d.activeTrips || 0) === 0 || isCurrentDriver;
                    });

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

                      return (
                        <option key={d.id} value={d.id} disabled={hasDeclined}>
                          {d.fullName} ({d.phone || d.email}){' '}
                          {hasDeclined
                            ? `— ${t('manager.planning.statusDeclined', 'ĐÃ TỪ CHỐI CHUYẾN NÀY (Không khả dụng)')}`
                            : isCurrentDriver
                            ? `— (${t('manager.planning.statusCurrentlySelected', 'Đang chọn')})`
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
                        : cond.includes('thanh toán') || cond.includes('MoMo') || cond.includes('SePay')
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
