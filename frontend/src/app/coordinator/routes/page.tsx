'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { 
  Map, Plus, Search, Filter, Edit, Trash2, MapPin, 
  Clock, Navigation, ShieldCheck, Flag, CheckCircle2, ChevronRight, Eye, Layers,
  Plane, Truck, ArrowRight, AlertCircle, Send, FileCheck, RefreshCw, Sparkles, Building,
  Check, X, BookmarkPlus, Compass, ExternalLink, RotateCcw, Save
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
import { buildEquineRoute, normalizeVietnamese } from '@/lib/geo-corridors';

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
  paymentState?: string;
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
  const [routeToDelete, setRouteToDelete] = useState<RouteItem | null>(null);
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
        setSaveTemplateStops(stopsList);
      } catch {
        setSaveTemplateStops([]);
      }
    } else {
      setSaveTemplateName('');
      setSaveTemplateOrigin('');
      setSaveTemplateDestination('');
      setSaveTemplateDistance(500);
      setSaveTemplateStops([]);
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
      let paymentOverviewList: any[] = [];
      try {
        paymentOverviewList = await apiClient<any[]>('/orders/payments/overview');
      } catch {}
      const paymentMap: Record<number, string> = {};
      if (Array.isArray(paymentOverviewList)) {
        for (const p of paymentOverviewList) {
          paymentMap[Number(p.shipmentId)] = p.paymentState || 'WAITING_FLOW2';
        }
      }
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
            paymentState: o.paymentStatus === 'succeeded' ? 'PAID' : o.paymentStatus === 'pending' ? 'PENDING' : o.paymentStatus === 'review' ? 'NEEDS_REVIEW' : 'UNPAID',
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

  // Helper to extract city/province key for robust matching
  const extractCityKey = (str: string): string => {
    const s = normalizeVietnamese(str || '');
    if (s.includes('cu chi')) return 'cuchi';
    if (s.includes('hcm') || s.includes('ho chi minh') || s.includes('sai gon')) return 'hcm';
    if (s.includes('ha noi') || s.includes('soc son')) return 'hanoi';
    if (s.includes('da lat') || s.includes('lam dong')) return 'dalat';
    if (s.includes('da nang')) return 'danang';
    if (s.includes('tien giang') || s.includes('my tho')) return 'tiengiang';
    if (s.includes('can tho')) return 'cantho';
    if (s.includes('nha trang') || s.includes('khanh hoa')) return 'nhatrang';
    if (s.includes('vinh') || s.includes('nghe an')) return 'nghean';
    if (s.includes('singapore') || s.includes('kranji')) return 'singapore';
    if (s.includes('bangkok') || s.includes('thai lan')) return 'bangkok';
    if (s.includes('kuala lumpur') || s.includes('malaysia') || s.includes('selangor')) return 'malaysia';
    return s.split(' ')[0] || s;
  };

  // Condition: Only match when origin and destination match the route template!
  const isRouteMatchingOrder = (route: RouteItem, order?: PlanningOrder | null): boolean => {
    if (!order || !order.origin || !order.destination || !route.origin || !route.destination) return false;
    const keyRo = extractCityKey(route.origin);
    const keyRd = extractCityKey(route.destination);
    const keyOo = extractCityKey(order.origin);
    const keyOd = extractCityKey(order.destination);

    return keyRo === keyOo && keyRd === keyOd;
  };

  // Helper: Đồng bộ hóa thông minh tên sân bay cất cánh & hạ cánh từ Manager Plan, Trạm kiểm dịch & Danh mục sân bay
  const resolveAirLegLocations = (
    order?: PlanningOrder | null,
    templateStops?: RouteStop[] | RouteStopItem[]
  ) => {
    const routeDetail = order?.routeDetail;

    // 1. Sân bay cất cánh (Origin)
    let depName = 'Sân bay Quốc tế Tân Sơn Nhất (SGN)';
    let depCargoName = 'Sân bay Quốc tế Tân Sơn Nhất (SGN Cargo Terminal)';
    const depId = routeDetail?.managerDepartureAirportId;
    const depCode = routeDetail?.managerDepartureAirportCode;
    const depAp = airports.find(
      (a) => (depId && a.id === depId) || (depCode && a.iataCode === depCode)
    );
    if (depAp) {
      depName = `${depAp.name} (${depAp.iataCode})`;
      depCargoName = `${depAp.name} (${depAp.iataCode} Cargo Terminal)`;
    } else {
      const oLower = (order?.origin || '').toLowerCase();
      if (oLower.includes('hà nội') || oLower.includes('ha noi')) {
        depName = 'Sân bay Quốc tế Nội Bài (HAN)';
        depCargoName = 'Sân bay Quốc tế Nội Bài (HAN North Cargo Hub)';
      } else if (oLower.includes('đà nẵng') || oLower.includes('da nang')) {
        depName = 'Sân bay Quốc tế Đà Nẵng (DAD)';
        depCargoName = 'Sân bay Quốc tế Đà Nẵng (DAD Central Cargo Terminal)';
      }
    }

    // 2. Sân bay hạ cánh (Destination) - ƯU TIÊN 1: Lấy trực tiếp từ Manager đã thiết lập khung kế hoạch
    let arrName = '';
    const arrId = routeDetail?.managerArrivalAirportId;
    const arrCode = routeDetail?.managerArrivalAirportCode;
    const arrAp = airports.find(
      (a) => (arrId && a.id === arrId) || (arrCode && a.iataCode === arrCode)
    );
    if (arrAp) {
      arrName = `${arrAp.name} (${arrAp.iataCode})`;
    }

    // ƯU TIÊN 2: Lấy từ danh sách Trạm kiểm dịch (Stops) phía dưới nếu có trạm sân bay đích
    if (!arrName && templateStops && templateStops.length > 0) {
      const stopList = templateStops as Array<{ name?: string; locationName?: string; country?: string }>;
      const airportStop =
        stopList.find((s) => {
          const n = (s.locationName || s.name || '').toLowerCase();
          return n.includes('sân bay') && !n.includes('tân sơn nhất') && !n.includes('nội bài');
        }) ||
        stopList.find((s) => {
          const c = (s.country || '').toLowerCase();
          return c && !c.includes('việt nam') && !c.includes('vietnam');
        });
      if (airportStop) {
        arrName = airportStop.locationName || airportStop.name || '';
      }
    }

    // ƯU TIÊN 3: Tự động nhận diện từ địa danh đích của khách hàng (Kalimantan, Jakarta, Singapore, v.v.)
    if (!arrName && order?.destination) {
      const dLower = order.destination.toLowerCase();
      if (dLower.includes('kalimantan') || dLower.includes('borneo')) {
        const bdj = airports.find((a) => a.iataCode === 'BDJ');
        arrName = bdj ? `${bdj.name} (${bdj.iataCode})` : 'Sân bay Quốc tế Syamsudin Noor (BDJ Cargo), Kalimantan';
      } else if (dLower.includes('jakarta') || dLower.includes('indonesia')) {
        const cgk = airports.find((a) => a.iataCode === 'CGK');
        arrName = cgk ? `${cgk.name} (${cgk.iataCode})` : 'Sân bay Quốc tế Soekarno-Hatta (CGK Cargo), Jakarta';
      } else if (dLower.includes('singapore')) {
        arrName = 'Sân bay Quốc tế Changi (SIN Live Animal Cargo Hub)';
      } else if (dLower.includes('kuala lumpur') || dLower.includes('malaysia')) {
        arrName = 'Sân bay Quốc tế Kuala Lumpur (KUL KLIA Cargo)';
      } else if (dLower.includes('bangkok') || dLower.includes('thailand') || dLower.includes('thái')) {
        arrName = 'Sân bay Quốc tế Suvarnabhumi (BKK Free Zone Cargo)';
      } else if (dLower.includes('campuchia') || dLower.includes('phnom penh')) {
        arrName = 'Sân bay Quốc tế Phnom Penh (PNH Live Animal Cargo)';
      } else if (dLower.includes('úc') || dLower.includes('australia') || dLower.includes('melbourne')) {
        arrName = 'Sân bay Quốc tế Melbourne (MEL Victoria Cargo Hub)';
      }
    }

    if (!arrName) {
      arrName = 'Sân bay Quốc tế đích đến';
    }

    const airlineName =
      routeDetail?.managerAirlineName ||
      airlines[0]?.name ||
      'Cathay Pacific Cargo (CX)';

    return { depName, depCargoName, arrName, airlineName };
  };

  // Synchronize from Route Template while keeping every field 100% editable by Coordinator
  const handleApplyTemplate = (template: RouteItem) => {
    setPlanRouteName(template.name);
    setPlanTotalDistanceKm(template.distanceKm);

    // Determine if Road or Flight
    const normName = normalizeVietnamese(template.name);
    const isFlight = normName.includes('hang khong') || normName.includes('air') || normName.includes('bay');

    if (!isFlight) {
      // Overland Road: 1 single direct road leg!
      const singleRoadLeg: RouteLegItem = {
        sequenceNo: 1,
        legType: 'road',
        originLocation: selectedPlanningOrder?.origin || template.origin,
        destinationLocation: selectedPlanningOrder?.destination || template.destination,
        distanceKm: template.distanceKm,
        durationHours: Math.max(1, Math.round(template.distanceKm / 60)),
        vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || '60C-555.33',
      };
      setLegs([singleRoadLeg]);
    } else {
      // Air Flight: 3 legs (Road to airport -> Flight -> Road to destination)
      const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(
        selectedPlanningOrder,
        template.stops
      );

      const airLegs: RouteLegItem[] = [
        {
          sequenceNo: 1,
          legType: 'road',
          originLocation: selectedPlanningOrder?.origin || template.origin,
          destinationLocation: depCargoName,
          distanceKm: 45,
          durationHours: 2,
          vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || 'TRK-VN-089',
        },
        {
          sequenceNo: 2,
          legType: 'flight',
          originLocation: depName,
          destinationLocation: arrName,
          airlineName: airlineName,
          flightNumber: '',
          bookingReference: '',
          stallsBooked: selectedPlanningOrder?.horseCount || 1,
          durationHours: 2.5,
        },
        {
          sequenceNo: 3,
          legType: 'road',
          originLocation: arrName,
          destinationLocation: selectedPlanningOrder?.destination || template.destination,
          distanceKm: 35,
          durationHours: 1.5,
          vehiclePlate: `Xe từ ${(selectedPlanningOrder?.destination || template.destination).split(',')[0].trim()} đến đón (Bên nhận tự rước)`,
        },
      ];
      setLegs(airLegs);
    }

    // Sync all stops from template (clears stops if template has 0 stops)
    if (template.stops && template.stops.length > 0) {
      const mappedStops: RouteStopItem[] = template.stops.map((s, idx) => ({
        sequenceNo: idx + 1,
        stopType: s.type === 'Quarantine' ? 'quarantine' : s.type === 'Border Gate' ? 'border_check' : 'rest',
        locationName: s.name,
        country: s.country,
      }));
      setStops(mappedStops);
    } else {
      setStops([]);
    }

    toast.success(`Đã đồng bộ tuyến "${template.name}"! Bạn có thể chỉnh sửa biển số xe và mọi thông tin bên dưới.`);
  };

  // Open Step 1b Detail Plan Builder (with smart template matching when origin & destination match)
  const handleOpenDetailModal = (order: PlanningOrder, templateToApply?: RouteItem) => {
    setSelectedPlanningOrder(order);
    const existingRoute = order.routeDetail;

    setNotes(existingRoute?.strategicNotes || 'Nhiệt độ khoang xe 18°C. Cung cấp nước điện giải sau mỗi 3 giờ.');

    // If order already has saved legs in DB, preserve them but sanitize any generic airport placeholder
    if (existingRoute?.legs && existingRoute.legs.length > 0) {
      setPlanRouteName(
        existingRoute.routeName ||
          `Hành lang vận chuyển: ${order.origin.split(',')[0]} → ${order.destination.split(',')[0]}`
      );
      setPlanTotalDistanceKm(existingRoute.totalDistanceKm || 500);

      const { arrName, depName } = resolveAirLegLocations(order, existingRoute.stops);
      const sanitizedLegs = existingRoute.legs.map((leg) => {
        let dest = leg.destinationLocation;
        let orig = leg.originLocation;

        if (leg.legType === 'flight') {
          if (dest.includes('đích đến') || dest.includes('SIN / BKK') || !dest.trim()) {
            dest = arrName;
          }
          if (orig.includes('Sân bay') && orig.includes('Origin')) {
            orig = depName;
          }
        }
        if (leg.legType === 'road') {
          if (orig.includes('đích đến') || orig.includes('SIN / BKK')) {
            orig = arrName;
          }
        }
        return { ...leg, destinationLocation: dest, originLocation: orig };
      });

      setLegs(sanitizedLegs);
      setStops(existingRoute.stops && existingRoute.stops.length > 0 ? existingRoute.stops : []);
    } else {
      // Check if template was passed OR matches origin and destination!
      const matched = templateToApply || routes.find((r) => isRouteMatchingOrder(r, order));

      if (matched) {
        setPlanRouteName(matched.name);
        setPlanTotalDistanceKm(matched.distanceKm);

        const normName = normalizeVietnamese(matched.name);
        const isFlight = normName.includes('hang khong') || normName.includes('air') || normName.includes('bay');

        if (!isFlight) {
          // 1 Single road leg
          setLegs([
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: order.origin,
              destinationLocation: order.destination,
              distanceKm: matched.distanceKm,
              durationHours: Math.max(1, Math.round(matched.distanceKm / 60)),
              vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || '60C-555.33',
            },
          ]);
        } else {
          // Flight 3 legs (Road to airport -> Flight -> Road to stable)
          const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(
            order,
            matched.stops
          );

          setLegs([
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: order.origin,
              destinationLocation: depCargoName,
              distanceKm: 45,
              durationHours: 2,
              vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || 'TRK-VN-089',
            },
            {
              sequenceNo: 2,
              legType: 'flight',
              originLocation: depName,
              destinationLocation: arrName,
              airlineName: airlineName,
              flightNumber: '',
              bookingReference: '',
              stallsBooked: order.horseCount,
              durationHours: 2.5,
            },
            {
              sequenceNo: 3,
              legType: 'road',
              originLocation: arrName,
              destinationLocation: order.destination,
              distanceKm: 35,
              durationHours: 1.5,
              vehiclePlate: `Xe từ ${order.destination.split(',')[0].trim()} đến đón (Bên nhận tự rước)`,
            },
          ]);
        }

        // Sync stops: match template stops exactly, clear if template has 0 stops
        if (matched.stops && matched.stops.length > 0) {
          setStops(
            matched.stops.map((s, idx) => ({
              sequenceNo: idx + 1,
              stopType: s.type === 'Quarantine' ? 'quarantine' : s.type === 'Border Gate' ? 'border_check' : 'rest',
              locationName: s.name,
              country: s.country,
            }))
          );
        } else {
          setStops([]);
        }
      } else {
        // Fallback default: If both in Vietnam -> 1 road leg!
        const normOo = normalizeVietnamese(order.origin);
        const normOd = normalizeVietnamese(order.destination);
        const isAbroad =
          normOo.includes('singapore') ||
          normOd.includes('singapore') ||
          normOo.includes('bangkok') ||
          normOd.includes('bangkok') ||
          normOo.includes('malaysia') ||
          normOd.includes('malaysia') ||
          normOo.includes('indonesia') ||
          normOd.includes('indonesia') ||
          normOo.includes('kalimantan') ||
          normOd.includes('kalimantan');

        setPlanRouteName(`Hành lang vận chuyển: ${order.origin.split(',')[0]} → ${order.destination.split(',')[0]}`);
        setPlanTotalDistanceKm(isAbroad ? 850 : 250);

        if (!isAbroad) {
          // Pure domestic road default (1 leg!)
          setLegs([
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: order.origin,
              destinationLocation: order.destination,
              distanceKm: 120,
              durationHours: 3,
              vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || '60C-555.33',
            },
          ]);
          setStops([]);
        } else {
          // International default (3 legs)
          const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(order);

          setLegs([
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: order.origin,
              destinationLocation: depCargoName,
              distanceKm: 45,
              durationHours: 2,
              vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || 'TRK-VN-089',
            },
            {
              sequenceNo: 2,
              legType: 'flight',
              originLocation: depName,
              destinationLocation: arrName,
              airlineName: airlineName,
              flightNumber: '',
              bookingReference: '',
              stallsBooked: order.horseCount,
              durationHours: 2.5,
            },
            {
              sequenceNo: 3,
              legType: 'road',
              originLocation: arrName,
              destinationLocation: order.destination,
              distanceKm: 32,
              durationHours: 1.5,
              vehiclePlate: `Xe từ ${order.destination.split(',')[0].trim()} đến đón (Bên nhận tự rước)`,
            },
          ]);
          setStops([
            {
              sequenceNo: 1,
              stopType: 'rest',
              locationName: 'Trạm dừng chân Củ Chi (Điểm chuẩn bị & tải ngựa)',
              country: 'Việt Nam',
            },
            {
              sequenceNo: 2,
              stopType: 'quarantine',
              locationName: 'Trung tâm Kiểm dịch Động vật Cảng Hàng không SGN',
              country: 'Việt Nam',
            },
            {
              sequenceNo: 3,
              stopType: 'border_check',
              locationName: 'Trạm Kiểm dịch Cửa khẩu Hàng không Changi (AVS Singapore)',
              country: 'Singapore',
            },
          ]);
        }
      }
    }

    setIsDetailModalOpen(true);
  };

  // Add Leg
  const handleAddLeg = (type: 'road' | 'flight') => {
    const nextSeq = legs.length + 1;
    if (type === 'road') {
      const isAfterFlight = legs.some((l) => l.legType === 'flight');
      const destClean = (selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
      const defaultPlate = isAfterFlight
        ? `Xe từ ${destClean} đến đón (Bên nhận tự rước)`
        : (vehicles[0]?.code || 'TRK-VN-089');
      setLegs([
        ...legs,
        {
          sequenceNo: nextSeq,
          legType: 'road',
          originLocation: legs.length > 0 ? legs[legs.length - 1].destinationLocation : 'Điểm tập kết',
          destinationLocation: isAfterFlight ? (selectedPlanningOrder?.destination || 'Địa điểm đích') : 'Điểm đến chặng đường bộ',
          distanceKm: isAfterFlight ? 35 : 120,
          durationHours: isAfterFlight ? 1.5 : 3,
          vehiclePlate: defaultPlate,
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

  // Cho phép Coordinator reset về form trống chuẩn để tự điền hoàn toàn từ đầu
  const handleResetToManualForm = () => {
    if (!selectedPlanningOrder) return;
    setPlanRouteName(`Lộ trình: ${selectedPlanningOrder.origin.split(',')[0]} → ${selectedPlanningOrder.destination.split(',')[0]}`);
    setPlanTotalDistanceKm(180);
    setLegs([
      {
        sequenceNo: 1,
        legType: 'road',
        originLocation: selectedPlanningOrder.origin,
        destinationLocation: selectedPlanningOrder.destination,
        distanceKm: 180,
        durationHours: 3.5,
        vehiclePlate: vehicles.find((v) => v.status === 'available')?.code || '60C-555.33',
      },
    ]);
    setStops([]);
    toast.success('Đã làm mới form kế hoạch. Bạn có thể tự do điền và chỉnh sửa mọi thông tin!');
  };

  // Lưu lộ trình đang điền thành một Tuyến mẫu mới vào Thư viện ngay trong Modal
  const handleSaveCurrentPlanAsTemplate = () => {
    if (!planRouteName.trim()) {
      toast.error('Vui lòng nhập tên lộ trình trước khi lưu vào Thư viện mẫu!');
      return;
    }
    const orig = legs[0]?.originLocation || selectedPlanningOrder?.origin || 'Điểm xuất phát';
    const dest = legs[legs.length - 1]?.destinationLocation || selectedPlanningOrder?.destination || 'Điểm đích';

    const newTemplate = addRoute({
      name: planRouteName.trim(),
      orderCode: `TEMPLATE-${Date.now().toString().slice(-4)}`,
      origin: orig,
      destination: dest,
      distanceKm: Number(planTotalDistanceKm) || 300,
      stops: stops.map((s, idx) => ({
        seq: idx + 1,
        name: s.locationName || `Trạm dừng ${idx + 1}`,
        type: s.stopType === 'quarantine' ? 'Quarantine' : s.stopType === 'border_check' ? 'Border Gate' : 'Rest',
        country: s.country || 'Việt Nam',
      })),
      status: 'active',
    });

    toast.success(`Đã lưu "${newTemplate.name}" vào Thư viện Tuyến Mẫu thành công! Các đơn hàng sau có thể tái sử dụng.`);
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

  // Flow 5: Simulate / Report Incident from Driver
  const handleSimulateIncident = async (order?: PlanningOrder | null) => {
    if (!order) return;
    try {
      await routesApi.reportIncident(order.id, {
        incidentType: 'traffic_delay',
        description: 'Tài xế báo cáo: Tuyến đường chính bị phong tỏa / sự cố giao thông, xe không thể tiếp tục di chuyển. Yêu cầu Coordinator hiệu chỉnh lại chặng đường vòng tránh!',
        severity: 'critical',
      });
      toast.success('Đã kích hoạt báo cáo sự cố từ tài xế! Quyền hiệu chỉnh chặng khẩn cấp đã mở.');
      await loadMasterDataAndOrders();
      try {
        const updatedRoute = await routesApi.getRouteByShipmentId(order.id);
        setSelectedPlanningOrder((prev) => prev ? { ...prev, routeDetail: updatedRoute } : null);
      } catch {}
    } catch (err: any) {
      toast.error(err?.message || 'Không thể ghi nhận sự cố');
    }
  };

  // Flow 5: Save Emergency Reroute
  const handleSaveEmergencyReroute = async () => {
    if (!selectedPlanningOrder) return;
    if (legs.length === 0) {
      toast.error('Vui lòng dựng ít nhất 1 chặng vận chuyển!');
      return;
    }

    setIsSubmittingPlan(true);
    try {
      // 1. Save new plan with modified legs
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || 500,
        legs,
        stops,
      });

      // 2. Resolve the active incident
      if (selectedPlanningOrder.routeDetail?.activeIncident?.id) {
        await routesApi.resolveIncident(selectedPlanningOrder.routeDetail.activeIncident.id);
      }

      toast.success('Đã lưu lộ trình tránh sự cố thành công! Tài xế đã nhận lộ trình cập nhật mới.');
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi lưu lộ trình sự cố');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Flow 5: Resolve Incident directly
  const handleResolveIncidentOnly = async (incidentId?: number) => {
    if (!incidentId) return;
    try {
      await routesApi.resolveIncident(incidentId);
      toast.success('Đã đánh dấu giải quyết sự cố thành công!');
      await loadMasterDataAndOrders();
      if (selectedPlanningOrder) {
        try {
          const updatedRoute = await routesApi.getRouteByShipmentId(selectedPlanningOrder.id);
          setSelectedPlanningOrder((prev) => prev ? { ...prev, routeDetail: updatedRoute } : null);
        } catch {}
      }
    } catch (err: any) {
      toast.error(err?.message || 'Không thể giải quyết sự cố');
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
  const renderPlanStatusBadge = (status?: string, activeIncident?: any) => {
    if (activeIncident) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 shadow-2xs animate-pulse">
          <AlertCircle size={13} className="text-rose-600" />
          <span>⚠️ Sự cố lộ trình: Cần hiệu chỉnh tuyến</span>
        </span>
      );
    }

    switch (status) {
      case 'in_transit':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            <Truck size={13} className="text-sky-600" />
            <span>Đang vận chuyển (In Transit)</span>
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span>Đã hoàn thành (Completed)</span>
          </span>
        );
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
              const planStatus = route?.planStatus || (order.status === 'in_transit' ? 'in_transit' : 'draft');
              const activeIncident = route?.activeIncident;
              const isInTransit = planStatus === 'in_transit' || order.status === 'in_transit';
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

                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderPlanStatusBadge(isInTransit ? 'in_transit' : planStatus, activeIncident)}
                      {order.paymentState === 'PAID' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          💳 Đã thanh toán
                        </span>
                      )}
                      {order.paymentState === 'PENDING' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          ⏳ Chờ thanh toán QR
                        </span>
                      )}
                      {order.paymentState === 'AWAITING_CONFIRMATION' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          🕒 Chờ xác nhận CK
                        </span>
                      )}
                      {order.paymentState === 'NEEDS_REVIEW' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                          ⚠️ Cần kiểm tra TT
                        </span>
                      )}
                      {order.paymentState === 'EXPIRED' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                          Hết hạn TT
                        </span>
                      )}
                      {(order.paymentState === 'WAITING_FLOW2' || order.paymentState === 'DOCUMENTS_APPROVED') && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Chưa gửi YC TT
                        </span>
                      )}

                      {/* Phân loại nút hành động: Khi đã duyệt/hoàn thành chỉ xem, chỉ mở lại khi gặp sự cố */}
                      {(() => {
                        const isCompleted = order.status === 'completed' || planStatus === 'completed';
                        const isPlanApproved = planStatus === 'approved' || planStatus === 'confirmed' || planStatus === 'ready_to_depart' || isInTransit || isCompleted;

                        // 1. Trường hợp có sự cố phát sinh từ tài xế (chỉ khi chuyến đi chưa hoàn thành): Mở nút hiệu chỉnh khẩn cấp
                        if (activeIncident && !isCompleted) {
                          return (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 animate-pulse"
                              title="Tài xế báo sự cố - Bấm để hiệu chỉnh lại chặng khẩn cấp"
                            >
                              <AlertCircle size={14} />
                              <span>Hiệu chỉnh chặng do sự cố</span>
                            </Button>
                          );
                        }

                        // 2. Trường hợp ĐÃ HOÀN THÀNH: Không còn hiệu chỉnh chặng, chỉ xem lại lịch sử lộ trình
                        if (isCompleted) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1.5"
                              title="Chuyến đi đã cập bến hoàn thành - Bấm để xem lại lộ trình chi tiết"
                            >
                              <Eye size={14} className="text-slate-500" />
                              <span>Xem lộ trình</span>
                            </Button>
                          );
                        }

                        // 3. Trường hợp Manager đã duyệt kế hoạch hoặc đang vận chuyển (và KHÔNG có sự cố): CHỈ HIỂN THỊ NÚT XEM LỘ TRÌNH
                        if (isPlanApproved) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1.5"
                              title="Kế hoạch đã được Manager phê duyệt - Bấm để xem chi tiết lộ trình"
                            >
                              <Eye size={14} className="text-slate-500" />
                              <span>Xem lộ trình</span>
                            </Button>
                          );
                        }

                        // 4. Trường hợp chưa duyệt (Draft / Rejected / Đang chờ duyệt):
                        return (
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
                        );
                      })()}
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

      {/* MODAL: COORDINATOR XÂY DỰNG / XEM LỘ TRÌNH CHI TIẾT */}
      {isDetailModalOpen && selectedPlanningOrder && (() => {
        const isCompleted = selectedPlanningOrder.status === 'completed' || selectedPlanningOrder.routeDetail?.planStatus === 'completed';
        const isPlanApproved = selectedPlanningOrder.routeDetail?.planStatus === 'approved' ||
                               selectedPlanningOrder.routeDetail?.planStatus === 'confirmed' ||
                               selectedPlanningOrder.routeDetail?.planStatus === 'ready_to_depart' ||
                               selectedPlanningOrder.status === 'in_transit' ||
                               selectedPlanningOrder.routeDetail?.planStatus === 'in_transit' ||
                               isCompleted;
        const activeIncident = isCompleted ? undefined : selectedPlanningOrder.routeDetail?.activeIncident;
        const isReadOnlyModal = (isPlanApproved && !activeIncident) || isCompleted;

        return (
          <Modal
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            title={
              isCompleted
                ? `Chi Tiết Lộ Trình Vận Chuyển (Chuyến đi đã hoàn tất 🏁)`
                : isReadOnlyModal
                ? `Chi Tiết Kế Hoạch Lộ Trình (Chế độ xem an toàn)`
                : `Xây Dựng / Hiệu Chỉnh Kế Hoạch Lộ Trình Chi Tiết`
            }
            subtitle={`Đơn hàng: ${selectedPlanningOrder.requestCode} • ${selectedPlanningOrder.horseName} (${selectedPlanningOrder.horseCount} ngựa)`}
            maxWidth="920px"
          >
            <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto pr-1">
              {/* IN-TRANSIT & INCIDENT & APPROVAL & COMPLETED BANNERS */}
              {isCompleted ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl flex items-start gap-3 text-slate-800 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm m-0 text-slate-900">
                      Chuyến đi đã cập bến đích an toàn — Khóa chỉnh sửa (Chế độ lưu trữ & đối soát)
                    </h4>
                    <p className="text-xs text-slate-600 m-0 mt-0.5">
                      Toàn bộ các chặng đường bộ và chặng bay đã hoàn thành. Kế hoạch lộ trình được lưu trữ nguyên trạng để phục vụ kiểm toán, đối soát chi phí và tra cứu lịch sử vận chuyển.
                    </p>
                  </div>
                </div>
              ) : activeIncident ? (
                <div className="p-4 bg-rose-50 border-2 border-rose-400 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-950 shadow-sm animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <AlertCircle size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm uppercase text-rose-900">
                          🚨 Báo cáo sự cố từ tài xế (Flow 5)
                        </span>
                        <span className="bg-rose-200 text-rose-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          Loại: {activeIncident.incidentType}
                        </span>
                      </div>
                      <p className="text-xs text-rose-950 m-0 mt-1 font-semibold">
                        {activeIncident.description}
                      </p>
                      <p className="text-[11px] text-rose-700 m-0 mt-0.5">
                        Thời gian báo: {new Date(activeIncident.reportedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-rose-700 block">
                      ĐÃ MỞ QUYỀN HIỆU CHỈNH CHẶNG KHẨN CẤP
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Bạn có thể sửa chặng hoặc trạm dừng để vòng tránh sự cố
                    </span>
                  </div>
                </div>
              ) : isReadOnlyModal ? (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-start gap-3 text-emerald-950 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm m-0 text-emerald-900">
                      Kế hoạch lộ trình đã được Logistics Manager phê duyệt — Chế độ xem an toàn
                    </h4>
                    <p className="text-xs text-emerald-800 m-0 mt-0.5">
                      Lộ trình này đã được phê duyệt chính thức và khóa chỉnh sửa để phục vụ điều phối và vận chuyển. 
                      Hệ thống chỉ mở lại quyền hiệu chỉnh chặng khi có báo cáo sự cố (tắc đường, sạt lở, xe hỏng...) từ tài xế.
                    </p>
                  </div>
                </div>
              ) : null}

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

            {/* 1b. Coordinator Flexibility & Template Tools */}
            {!isReadOnlyModal && (
              <div className="p-4 bg-gradient-to-r from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wide">
                      <Compass size={15} className="text-blue-600" />
                      Chế Độ Thiết Lập Tuyến Cho Coordinator
                    </div>
                    <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                      Coordinator có thể <strong>tự do điền mọi thông số</strong> trực tiếp bên dưới, hoặc <strong>đồng bộ từ Tuyến Mẫu</strong> rồi chỉnh sửa theo ý muốn.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetToManualForm}
                      className="text-xs text-slate-700 border-slate-300 hover:bg-white flex items-center gap-1 font-semibold shadow-2xs"
                      title="Thiết lập lại form để tự do điền thông số từ đầu"
                    >
                      <RotateCcw size={12} />
                      <span>Làm Mới / Tự Điền</span>
                    </Button>
                  </div>
                </div>

                {/* Template Match Alert & Dropdown */}
                {(() => {
                  const matchedTemplate = routes.find((r) => isRouteMatchingOrder(r, selectedPlanningOrder));
                  return (
                    <div className="flex flex-col gap-2.5">
                      {matchedTemplate && (
                        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                              <Sparkles size={14} />
                            </div>
                            <div>
                              <div className="font-bold text-emerald-950 text-xs flex items-center gap-1.5 flex-wrap">
                                <span>Phát hiện Tuyến Mẫu Trùng Điểm Đi &amp; Điểm Đến:</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-extrabold text-[11px]">
                                  {matchedTemplate.name}
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-800 m-0 mt-0.5">
                                Cự ly mẫu: <strong>{matchedTemplate.distanceKm} km</strong> • {matchedTemplate.stops?.length || 0} trạm dừng kiểm dịch chuẩn hóa.
                              </p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleApplyTemplate(matchedTemplate)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 shadow-sm flex items-center gap-1"
                          >
                            <Sparkles size={13} />
                            <span>⚡ Đồng Bộ Tuyến Mẫu Này</span>
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <BookmarkPlus size={14} className="text-blue-600 shrink-0" />
                          <span className="font-bold text-slate-700 whitespace-nowrap">
                            Hoặc áp dụng tuyến mẫu khác từ Thư viện:
                          </span>
                        </div>
                        <select
                          onChange={(e) => {
                            const t = routes.find((r) => r.id === e.target.value);
                            if (t) handleApplyTemplate(t);
                          }}
                          defaultValue=""
                          className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold outline-none flex-1 max-w-md"
                        >
                          <option value="" disabled>
                            -- Chọn một tuyến mẫu trong thư viện ({routes.length} tuyến) --
                          </option>
                          {routes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.distanceKm} km • {r.origin} ➔ {r.destination})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

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
                {!isReadOnlyModal && (
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
                )}
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
                      {!isReadOnlyModal && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLeg(idx)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Xóa chặng
                        </button>
                      )}
                    </div>

                    {/* Road Leg details */}
                    {leg.legType === 'road' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Phương Tiện / Xe Chuyên Dụng *</label>
                          {(() => {
                            const destClean = (leg.destinationLocation || selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
                            const receiverOption = leg.vehiclePlate && (leg.vehiclePlate.includes('đến đón') || leg.vehiclePlate.includes('đến rước'))
                              ? leg.vehiclePlate
                              : `Xe từ ${destClean} đến đón (Bên nhận tự rước)`;
                            const isOverseasOrLastMile = leg.sequenceNo > 1 || legs.some((l) => l.legType === 'flight');

                            return (
                              <>
                                <select
                                  value={leg.vehiclePlate ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = [...legs];
                                    const plateToIdMap: Record<string, number> = {
                                      '51C-888.99': 1,
                                      '51D-777.22': 2,
                                      '29B-999.11': 3,
                                      '60C-555.33': 4,
                                      'TRK-VN-089': 3,
                                      'TRK-VN-102': 4,
                                    };
                                    const matchedVehicle = vehicles.find((v) => v.code === val);
                                    let resolvedVehicleId = plateToIdMap[val];
                                    if (!resolvedVehicleId && matchedVehicle) {
                                      const parsed = Number(String(matchedVehicle.id).replace(/\D/g, ''));
                                      if (!isNaN(parsed) && parsed > 0) resolvedVehicleId = parsed;
                                    }
                                    updated[idx].vehiclePlate = val;
                                    updated[idx].vehicleId = resolvedVehicleId || null;
                                    setLegs(updated);
                                  }}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 text-xs"
                                >
                                  <option value="">-- Chọn xe / phương tiện --</option>
                                  {isOverseasOrLastMile && (
                                    <optgroup label="Phương tiện địa điểm đích (Nước ngoài)">
                                      <option value={receiverOption}>
                                        🚗 {receiverOption}
                                      </option>
                                    </optgroup>
                                  )}
                                  <optgroup label="Đội xe chuyên dụng nội bộ (Việt Nam)">
                                    {vehicles
                                      .filter((v) => !v.type?.toLowerCase().includes('air'))
                                      .map((v) => {
                                        const isBusy =
                                          v.status === 'in_use' &&
                                          v.assignedTripCode &&
                                          v.assignedTripCode !== selectedPlanningOrder?.requestCode;
                                        return (
                                          <option key={v.id} value={v.code} disabled={Boolean(isBusy)}>
                                            {v.code} — {v.type} ({v.capacity} stall, {v.location}){' '}
                                            {isBusy
                                              ? `— ⚠️ Đang chạy chuyến ${v.assignedTripCode}`
                                              : v.status === 'in_use'
                                              ? '— (Đang dùng cho chuyến này)'
                                              : '— Sẵn sàng'}
                                          </option>
                                        );
                                      })}
                                  </optgroup>
                                </select>
                                {leg.vehiclePlate && (leg.vehiclePlate.includes('đến đón') || leg.vehiclePlate.includes('đến rước')) && (
                                  <p className="mt-1 text-[11px] text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                                    ℹ️ Chặng nước ngoài: Bên nhận tự điều xe đến đón tại sân bay (không yêu cầu xe nội bộ).
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Điểm Xuất Phát Chặng</label>
                          <input
                            type="text"
                            value={leg.originLocation}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...legs];
                              updated[idx].originLocation = val;

                              // Nếu đây là chặng đường bộ sau chặng bay (Chặng 3), tự động đồng bộ ngược lại Sân bay hạ cánh của chặng bay
                              const prevFlightLeg = updated.find(
                                (l) => l.sequenceNo === updated[idx].sequenceNo - 1 && l.legType === 'flight'
                              );
                              if (prevFlightLeg) {
                                prevFlightLeg.destinationLocation = val;
                              }
                              setLegs(updated);

                              // Đồng bộ sang trạm kiểm dịch sân bay đích nếu có
                              setStops((prevStops) =>
                                prevStops.map((st) => {
                                  const isArrAirportStop =
                                    (st.locationName || '').toLowerCase().includes('sân bay') &&
                                    !(st.locationName || '').toLowerCase().includes('tân sơn nhất') &&
                                    !(st.locationName || '').toLowerCase().includes('nội bài');
                                  if (isArrAirportStop) {
                                    return { ...st, locationName: val };
                                  }
                                  return st;
                                })
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Điểm Đến Chặng</label>
                          <input
                            type="text"
                            value={leg.destinationLocation}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...legs];
                              updated[idx].destinationLocation = val;

                              // Nếu chặng 1 đến sân bay, tự động cập nhật Sân bay cất cánh của chặng 2
                              const nextFlightLeg = updated.find(
                                (l) => l.sequenceNo === updated[idx].sequenceNo + 1 && l.legType === 'flight'
                              );
                              if (nextFlightLeg) {
                                nextFlightLeg.originLocation = val.replace(' Cargo Terminal', '');
                              }
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Khoảng cách chặng (km)</label>
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
                          <label className="font-bold text-slate-700 block mb-1">Thời gian chạy dự kiến (giờ)</label>
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
                            <option value="Cathay Pacific Cargo (CX)">Cathay Pacific Cargo (CX)</option>
                            <option value="Singapore Airlines Cargo">Singapore Airlines Cargo (SQ)</option>
                            <option value="Emirates SkyCargo">Emirates SkyCargo (EK)</option>
                            <option value="Qatar Airways Cargo">Qatar Airways Cargo (QR)</option>
                            <option value="Vietnam Airlines Cargo">Vietnam Airlines Cargo (VN)</option>
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
                          <label className="font-bold text-slate-700 block mb-1">Sân bay cất cánh (Origin)</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: Sân bay Tân Sơn Nhất (SGN)"
                            value={leg.originLocation}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...legs];
                              updated[idx].originLocation = val;

                              // Đồng bộ ngược lại điểm đến của Chặng 1 đường bộ
                              const prevRoadLeg = updated.find(
                                (l) => l.sequenceNo === updated[idx].sequenceNo - 1 && l.legType === 'road'
                              );
                              if (prevRoadLeg) {
                                prevRoadLeg.destinationLocation = val.includes('Cargo') ? val : `${val} Cargo Terminal`;
                              }
                              setLegs(updated);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Sân bay hạ cánh (Destination)</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: Sân bay Quốc tế Syamsudin Noor (BDJ Cargo), Kalimantan"
                            value={leg.destinationLocation}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...legs];
                              updated[idx].destinationLocation = val;

                              // Tự động đồng bộ Điểm xuất phát của Chặng đường bộ liền sau (Leg 3)
                              const nextRoadLeg = updated.find(
                                (l) => l.sequenceNo === updated[idx].sequenceNo + 1 && l.legType === 'road'
                              );
                              if (nextRoadLeg) {
                                nextRoadLeg.originLocation = val;
                              }
                              setLegs(updated);

                              // Tự động đồng bộ sang trạm kiểm dịch sân bay đích ở bảng stops bên dưới
                              setStops((prevStops) =>
                                prevStops.map((st) => {
                                  const isArrAirportStop =
                                    (st.locationName || '').toLowerCase().includes('sân bay') &&
                                    !(st.locationName || '').toLowerCase().includes('tân sơn nhất') &&
                                    !(st.locationName || '').toLowerCase().includes('nội bài');
                                  if (isArrAirportStop) {
                                    return { ...st, locationName: val };
                                  }
                                  return st;
                                })
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                            list="suggested-airports-list"
                          />
                          <datalist id="suggested-airports-list">
                            {airports.map((ap) => (
                              <option key={ap.id} value={`${ap.name} (${ap.iataCode})`}>
                                {ap.iataCode} - {ap.country}
                              </option>
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="font-bold text-slate-700 block mb-1">Stall Đã Book</label>
                              <input
                                type="number"
                                min={1}
                                value={leg.stallsBooked || selectedPlanningOrder.horseCount}
                                onChange={(e) => {
                                  const updated = [...legs];
                                  updated[idx].stallsBooked = Number(e.target.value);
                                  setLegs(updated);
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-slate-700 block mb-1">Giờ bay (h)</label>
                              <input
                                type="number"
                                step="0.5"
                                value={leg.durationHours || 2.5}
                                onChange={(e) => {
                                  const updated = [...legs];
                                  updated[idx].durationHours = Number(e.target.value);
                                  setLegs(updated);
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                              />
                            </div>
                          </div>
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
                    Bổ sung các trạm kiểm tra thú y và trạm nạp nước / cỏ khô dọc tuyến (tự điền hoặc chọn mẫu).
                  </p>
                </div>
                {!isReadOnlyModal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddStop()}
                    className="text-xs text-amber-900 border-amber-300 hover:bg-amber-100 flex items-center gap-1 font-bold shadow-2xs"
                  >
                    <Plus size={13} /> + Thêm Trạm Mới (Tự Điền)
                  </Button>
                )}
              </div>

              {/* Master Stops Quick Picker */}
              {!isReadOnlyModal && (
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
              )}

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
                              const val = e.target.value;
                              const updated = [...stops];
                              updated[idx].locationName = val;
                              setStops(updated);

                              // Nếu là trạm kiểm dịch sân bay đến (ở nước ngoài hoặc trạm thứ 2 trong chặng bay)
                              const isAirportOrAbroad =
                                (val.toLowerCase().includes('sân bay') && !val.toLowerCase().includes('tân sơn nhất') && !val.toLowerCase().includes('nội bài')) ||
                                (stop.country && !stop.country.toLowerCase().includes('việt nam') && !stop.country.toLowerCase().includes('vietnam'));

                              if (isAirportOrAbroad) {
                                setLegs((prevLegs) =>
                                  prevLegs.map((l) => {
                                    if (l.legType === 'flight') {
                                      return { ...l, destinationLocation: val };
                                    }
                                    if (l.legType === 'road' && l.sequenceNo > 1) {
                                      return { ...l, originLocation: val };
                                    }
                                    return l;
                                  })
                                );
                              }
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
                            disabled={isReadOnlyModal}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs disabled:bg-slate-50 disabled:text-slate-600"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          {!isReadOnlyModal ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveStop(idx)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
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
          {(() => {
            if (isReadOnlyModal) {
              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-4">
                  <span className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    Kế hoạch đã được phê duyệt. Đang hiển thị ở chế độ xem an toàn (Khóa chỉnh sửa).
                  </span>

                  <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setIsDetailModalOpen(false)}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 text-xs whitespace-nowrap"
                    >
                      Đóng
                    </Button>
                  </div>
                </div>
              );
            }

            if (activeIncident) {
              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-rose-200 bg-rose-50/50 p-3 rounded-lg mt-4">
                  <span className="text-xs text-rose-900 font-semibold flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-rose-600 shrink-0" />
                    Đang hiệu chỉnh lộ trình thay thế do sự cố trên đường. Lộ trình mới sẽ được gửi đến Logistics Manager duyệt lại.
                  </span>

                  <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailModalOpen(false)}
                      disabled={isSubmittingPlan}
                      className="border-slate-300 text-slate-600 hover:bg-white font-medium px-4 py-2 text-xs"
                    >
                      Hủy bỏ
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleResolveIncidentOnly(activeIncident.id)}
                      disabled={isSubmittingPlan}
                      className="border-rose-300 text-rose-700 bg-white hover:bg-rose-50 font-semibold px-3 py-2 text-xs"
                    >
                      Đánh dấu hết sự cố
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={async () => {
                        await handleSaveEmergencyReroute();
                        try {
                          await routesApi.submitPlanForApproval(selectedPlanningOrder.id);
                          toast.success('Đã gửi kế hoạch hiệu chỉnh do sự cố cho Manager duyệt!');
                        } catch {}
                      }}
                      disabled={isSubmittingPlan || legs.length === 0}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 shadow-sm text-xs flex items-center gap-1.5 animate-pulse"
                    >
                      <Send size={14} />
                      <span>{isSubmittingPlan ? 'Đang gửi duyệt...' : 'Lưu Lộ Trình Mới & Gửi Manager Duyệt'}</span>
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-4">
                <span className="text-xs text-slate-500">
                  Kế hoạch sau khi gửi sẽ được chuyển đến <strong>Logistics Manager</strong> để xem xét và phê duyệt.
                </span>

                <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDetailModalOpen(false)}
                    disabled={isSubmittingPlan}
                    className="border-slate-300 text-slate-600 hover:bg-slate-50 font-medium px-4 py-2 text-xs whitespace-nowrap"
                  >
                    Đóng
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={isSubmittingPlan}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold px-4 py-2 text-xs whitespace-nowrap"
                  >
                    Lưu Bản Nháp (Draft)
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSubmitForApproval}
                    disabled={isSubmittingPlan || legs.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 shadow-sm text-xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Send size={14} />
                    <span>{isSubmittingPlan ? 'Đang gửi duyệt...' : 'Gửi Duyệt Cho Manager'}</span>
                  </Button>
                </div>
              </div>
            );
          })()}
          </Modal>
        );
      })()}

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
                  setRouteToDelete(viewingCatalogRoute);
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
                    const templateToUse = viewingCatalogRoute;
                    setActiveTab('flow3_planning');
                    setViewingCatalogRoute(null);

                    // Check if an order matches origin & destination!
                    const matchedOrder = planningOrders.find((o) => isRouteMatchingOrder(templateToUse, o));
                    if (matchedOrder) {
                      toast.success(
                        `Tìm thấy đơn ${matchedOrder.requestCode} trùng khớp lộ trình! Đã mở và đồng bộ tuyến mẫu.`
                      );
                      handleOpenDetailModal(matchedOrder, templateToUse);
                    } else {
                      toast.success(
                        `Đã chọn tuyến mẫu "${templateToUse.name}". Vui lòng bấm "Dựng kế hoạch chi tiết" ở đơn hàng bạn muốn áp dụng.`
                      );
                    }
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

      {/* MODAL XÁC NHẬN XÓA TUYẾN ĐƯỜNG MẪU (Thay thế browser confirm) */}
      {routeToDelete && (
        <Modal
          isOpen={Boolean(routeToDelete)}
          onClose={() => setRouteToDelete(null)}
          title="Xác Nhận Xóa Tuyến Mẫu"
          subtitle="Hành động này sẽ gỡ bỏ tuyến đường mẫu khỏi Thư viện số."
          maxWidth="480px"
        >
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h4 className="font-bold text-red-900 text-xs m-0">Xóa vĩnh viễn tuyến đường mẫu này?</h4>
                <p className="text-xs text-red-700 m-0 mt-1 leading-relaxed">
                  Bạn có chắc muốn xóa tuyến <strong>&ldquo;{routeToDelete.name}&rdquo;</strong> khỏi Thư viện không? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRouteToDelete(null)}
                className="text-xs font-medium px-4 py-2 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Hủy Bỏ
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  deleteRoute(routeToDelete.id);
                  toast.success('Đã xóa tuyến đường mẫu khỏi thư viện!');
                  setRouteToDelete(null);
                  setViewingCatalogRoute(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Xác Nhận Xóa
              </Button>
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
