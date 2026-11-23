'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { 
  Map, Plus, Search, Edit, Trash2, MapPin, 
  Clock, Navigation, ShieldCheck, CheckCircle2, Eye, Layers,
  Plane, Truck, AlertCircle, Send, RefreshCw, Sparkles,
  BookmarkPlus, Compass, RotateCcw
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
import { 
  buildEquineRoute, 
  isAirportLocationText, 
  normalizeVietnamese,
  estimateLegDistanceAndDuration,
  geocodeAddress,
  type GeocodedLocation,
} from '@/lib/geo-corridors';
import { AddressAutocompleteInput } from '@/components/ui/AddressAutocompleteInput';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';
import { RoadTripPicker, LegScheduleFields } from '@/features/routes/components/RoadTripPicker';

function MapLoadingFallback() {
  const { language } = useLanguage();
  return (
    <div className="h-64 flex items-center justify-center bg-slate-50 text-slate-400 text-sm rounded-xl">
      {language === 'en' ? 'Loading international corridor map...' : 'Đang tải bản đồ số hành lang quốc tế...'}
    </div>
  );
}

const RoutePlanningMap = dynamic(
  () => import('@/components/maps/RoutePlanningMap'),
  {
    ssr: false,
    loading: () => <MapLoadingFallback />,
  }
);

interface PlanningOrder {
  transportMode?: 'road' | 'air' | null;
  bookingType: BookingType;
  id: number;
  requestCode: string;
  customerName?: string;
  horseName: string;
  horseCount: number;
  horses?: Array<{ id?: number; name?: string; breed?: string }>;
  origin: string;
  destination: string;
  departureDate?: string;
  rawRequestedDate?: string;
  hasManagerFramework?: boolean;
  status: string;
  paymentState?: string;
  routeDetail?: RouteDetail;
}

function renderHorseNamesDisplay(horses?: Array<{ name?: string }>, horseCount?: number, tFn?: any) {
  const names = (horses || []).map((h) => h.name?.trim()).filter(Boolean) as string[];
  const count = horseCount || (names.length > 0 ? names.length : 1);
  const unit = tFn ? tFn('common.horsesUnit', 'ngựa') : 'ngựa';

  if (names.length === 0) {
    return <span>{count} {unit}</span>;
  }
  if (names.length === 1) {
    return (
      <span className="flex items-center gap-1.5">
        <span>{names[0]}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">1 {unit}</span>
      </span>
    );
  }
  if (names.length === 2) {
    return (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-900">{names[0]}</span>
        <span className="text-slate-400">&amp;</span>
        <span className="text-slate-900">{names[1]}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF8F4] text-[#181A17] font-bold border border-[#EAE5DA]">2 {unit}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="text-slate-900">{names.slice(0, 2).join(', ')}</span>
      <span 
        title={names.join(', ')} 
        className="text-xs px-2 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] font-bold border border-[#EAE5DA] cursor-help"
      >
        +{names.length - 2} ({count} {unit})
      </span>
    </span>
  );
}

function RoutePlanningContent() {
  const { t, language, translateStatus, translateVehicleType, translateStopType, translateIncident } = useLanguage();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search');
  const urlShipmentId = searchParams.get('shipmentId');
  const { routes, addRoute, deleteRoute, vehicles, refreshVehicles } = useFleetRouteStore();
  const [activeTab, setActiveTab] = useState<'flow3_planning' | 'corridor_catalog'>('flow3_planning');
  
  // Search & Map
  const [searchTerm, setSearchTerm] = useState(urlSearch || '');
  const [activeMapRoute, setActiveMapRoute] = useState<RouteItem | null>(null);
  const [showMap, setShowMap] = useState<boolean>(true);

  // Flow 3: Orders awaiting planning & Master Data
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [airlines, setAirlines] = useState<AirlineItem[]>([]);
  const [airports, setAirports] = useState<AirportItem[]>([]);
  const [masterStops, setMasterStops] = useState<MasterStopItem[]>([]);
  const langRef = useRef(language);
  langRef.current = language;
  const refreshVehiclesRef = useRef(refreshVehicles);
  refreshVehiclesRef.current = refreshVehicles;
  const openedShipmentRef = useRef<string | null>(null);

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
      const origClean = (searchOrigin || '').split(',')[0].trim();
      const destClean = (searchDestination || '').split(',')[0].trim();
      setSaveTemplateName(language === 'en' ? `Corridor: ${origClean} ➔ ${destClean} (${searchMode === 'air' ? 'Air' : 'Road'})` : `Hành lang: ${origClean} ➔ ${destClean} (${searchMode === 'air' ? 'Hàng không' : 'Đường bộ'})`);
      setSaveTemplateOrigin(searchOrigin);
      setSaveTemplateDestination(searchDestination);
      setSaveTemplateDistance(simulatedKm || 1000);

      try {
        const routeData = buildEquineRoute(searchOrigin, searchDestination, searchMode);
        const stopsList: RouteStop[] = (routeData.waypoints || []).slice(1, -1).map((w, i) => ({
          seq: i + 1,
          name: w.name,
          type: (w.type === 'checkpoint' ? 'Border Gate' : w.type === 'rest' ? 'Rest' : 'Quarantine') as RouteStop['type'],
          country: w.country || (language === 'en' ? 'Vietnam' : 'Việt Nam'),
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
      toast.error(language === 'en' ? 'Please enter a template route name!' : 'Vui lòng nhập tên tuyến đường mẫu!');
      return;
    }
    if (!saveTemplateOrigin.trim() || !saveTemplateDestination.trim()) {
      toast.error(language === 'en' ? 'Please enter origin and destination!' : 'Vui lòng nhập điểm xuất phát và điểm đến!');
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

    toast.success(language === 'en' ? 'Saved new template route to Library successfully!' : 'Đã lưu tuyến đường mẫu mới vào Thư viện thành công!');
    setIsSaveModalOpen(false);

    // Apply to map immediately
    setActiveMapRoute(newRoute);
    setSearchOrigin(newRoute.origin);
    setSearchDestination(newRoute.destination);
    setShowMap(true);
  };

  // Load Master Data & Orders
  const loadMasterDataAndOrders = useCallback(async () => {
    const lang = langRef.current;
    setIsLoadingOrders(true);
    setLoadError(null);
    void refreshVehiclesRef.current();
    try {
      // 1. Master Data
      const mData = await routesApi.getMasterData();
      if (mData) {
        setAirlines(mData.airlines || []);
        setAirports(mData.airports || []);
        setMasterStops(mData.masterStops || []);
      }

      // 2. Orders from backend with chunk batching (5 items/batch) to avoid N+1 waterfall
      const rawOrders = await apiClient<any[]>('/orders');
      if (Array.isArray(rawOrders)) {
        const eligibleOrders = rawOrders.filter((o) => {
          const s = String(o.status || '').toLowerCase();
          return s !== 'requested' && s !== 'under_review' && s !== 'rejected' && s !== 'cancelled';
        });

        const enriched: PlanningOrder[] = [];
        const chunkSize = 5;
        for (let i = 0; i < eligibleOrders.length; i += chunkSize) {
          const chunk = eligibleOrders.slice(i, i + chunkSize);
          const chunkResults = await Promise.all(
            chunk.map(async (o) => {
              let routeDetail: RouteDetail | undefined;
              try {
                routeDetail = (await routesApi.findRouteByShipmentId(o.id)) ?? undefined;
              } catch {}

              const s = String(o.status || '').toLowerCase();
              const hasManagerFramework = Boolean(
                routeDetail?.managerVehicleType ||
                routeDetail?.assignedCoordinatorId ||
                routeDetail?.managerAirlineId ||
                s === 'planning' ||
                s === 'confirmed' ||
                s === 'ready_to_depart' ||
                s === 'in_transit' ||
                s === 'completed'
              );

              return {
                id: o.id,
                requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
                customerName: o.customer?.fullName || o.customerName || (lang === 'en' ? 'Customer' : 'Khách hàng'),
                horseName: o.horses?.[0]?.name || 'Racehorse',
                horseCount: Number(o.requestedHorseCount || o.horses?.length || 1),
                horses: o.horses || [],
                origin: o.originLocation || 'Cu Chi Stables, HCMC',
                destination: o.destinationLocation || 'Singapore Turf Club',
                departureDate: o.requestedDate
                  ? new Date(o.requestedDate).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN')
                  : '—',
                rawRequestedDate: o.requestedDate || undefined,
                hasManagerFramework,
                status: o.status,
                transportMode: o.transportMode ?? null,
                bookingType: o.bookingType ?? 'shared_stall',
                paymentState:
                  o.paymentStatus === 'succeeded'
                    ? 'PAID'
                    : o.paymentStatus === 'pending'
                    ? 'PENDING'
                    : o.paymentStatus === 'review'
                    ? 'NEEDS_REVIEW'
                    : 'UNPAID',
                routeDetail,
              } as PlanningOrder;
            })
          );
          for (const item of chunkResults) {
            if (item) enriched.push(item);
          }
        }
        setPlanningOrders(enriched);
      }
    } catch (err: any) {
      console.warn('Failed to load planning data from backend:', err);
      setLoadError(
        err?.message ||
          (lang === 'en'
            ? 'Unable to load route planning orders from server.'
            : 'Không thể tải dữ liệu lập kế hoạch tuyến từ máy chủ.')
      );
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadMasterDataAndOrders();
  }, [loadMasterDataAndOrders]);

  useEffect(() => {
    if (urlSearch !== null) {
      setSearchTerm(urlSearch);
    }
  }, [urlSearch]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (val.trim()) {
        url.searchParams.set('search', val.trim());
      } else {
        url.searchParams.delete('search');
      }
      window.history.replaceState(null, '', url.toString());
    }
  };

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

  // Helper: Đồng bộ hóa thông minh tên sân bay cất cánh & hạ cánh gần nhất từ Manager Plan, Geo Engine & Danh mục sân bay
  const extractIataCode = (label?: string | null): string => {
    const match = String(label || '').match(/\(([A-Z]{3})\b/);
    return match?.[1]?.toUpperCase() || '';
  };

  const resolveAirLegLocations = (
    order?: PlanningOrder | null,
    templateStops?: RouteStop[] | RouteStopItem[]
  ) => {
    const routeDetail = order?.routeDetail;
    const geoPreview =
      order?.origin && order?.destination ? buildEquineRoute(order.origin, order.destination, 'air') : null;

    // 1. Sân bay cất cánh gần điểm xuất phát nhất (ưu tiên lựa chọn của Manager nếu đã chỉ định)
    let depName = language === 'en' ? 'Tan Son Nhat International Airport (SGN)' : 'Sân bay Quốc tế Tân Sơn Nhất (SGN)';
    let depCargoName = language === 'en' ? 'Tan Son Nhat International Airport (SGN Cargo Terminal)' : 'Sân bay Quốc tế Tân Sơn Nhất (SGN Cargo Terminal)';
    const depId = routeDetail?.managerDepartureAirportId;
    const depCode = routeDetail?.managerDepartureAirportCode;
    const depAp = airports.find(
      (a) => (depId && a.id === depId) || (depCode && a.iataCode === depCode)
    );
    if (depAp) {
      depName = `${depAp.name} (${depAp.iataCode})`;
      depCargoName = `${depAp.name} (${depAp.iataCode} Cargo Terminal)`;
    } else if (geoPreview?.origin?.nearestAirport) {
      const nearestDep = geoPreview.origin.nearestAirport;
      const hintCode = extractIataCode(nearestDep.name);
      const matchedDepAp = hintCode
        ? airports.find((a) => a.iataCode.toUpperCase() === hintCode)
        : undefined;
      if (matchedDepAp) {
        depName = `${matchedDepAp.name} (${matchedDepAp.iataCode})`;
        depCargoName = `${matchedDepAp.name} (${matchedDepAp.iataCode} Cargo Terminal)`;
      } else {
        depName = nearestDep.name;
        depCargoName = nearestDep.name;
      }
    }

    // 2. Sân bay hạ cánh gần điểm đến nhất - ƯU TIÊN 1: Manager Plan -> ƯU TIÊN 2: Nearest Airport từ Geo Engine
    let arrName = '';
    const arrId = routeDetail?.managerArrivalAirportId;
    const arrCode = routeDetail?.managerArrivalAirportCode;
    const arrAp = airports.find(
      (a) => (arrId && a.id === arrId) || (arrCode && a.iataCode === arrCode)
    );
    if (arrAp) {
      arrName = `${arrAp.name} (${arrAp.iataCode})`;
    }

    if (!arrName && geoPreview?.destination?.nearestAirport) {
      const nearestArr = geoPreview.destination.nearestAirport;
      const hintCode = extractIataCode(nearestArr.name);
      const matchedArrAp = hintCode
        ? airports.find((a) => a.iataCode.toUpperCase() === hintCode)
        : undefined;
      arrName = matchedArrAp ? `${matchedArrAp.name} (${matchedArrAp.iataCode})` : nearestArr.name;
    }

    if (!arrName) {
      arrName = language === 'en' ? 'Changi International Airport (SIN)' : 'Sân bay Quốc tế Changi (SIN)';
    }

    const airlineName =
      routeDetail?.managerAirlineName ||
      airlines[0]?.name ||
      'Cathay Pacific Cargo (CX)';

    return { depName, depCargoName, arrName, airlineName };
  };

  // Chọn xe đường bộ nội bộ phù hợp nhất theo sức chứa (capacity >= horseCount) và loại xe Manager định hướng
  const pickDefaultRoadVehicle = (order?: PlanningOrder | null): { vehiclePlate: string; vehicleId: number | null } => {
    const requiredHorses = Math.max(1, Number(order?.horseCount || 1));
    const managerType = String(order?.routeDetail?.managerVehicleType || '').toLowerCase();
    const roadFleet = vehicles.filter((v) => !v.type?.toLowerCase().includes('air') && v.status !== 'maintenance');

    const isUsableForOrder = (v: typeof vehicles[number]) => {
      const isCurrentTripVehicle = Boolean(v.assignedTripCode) && v.assignedTripCode === order?.requestCode;
      const isInTransport =
        (v.status === 'in_use' || Boolean(v.assignedTripCode)) && !isCurrentTripVehicle;
      return !isInTransport && v.status !== 'maintenance';
    };

    const chosen =
      roadFleet.find(
        (v) =>
          isUsableForOrder(v) &&
          Number(v.capacity || 0) >= requiredHorses &&
          managerType &&
          String(v.type || '').toLowerCase() === managerType
      ) ||
      roadFleet.find((v) => isUsableForOrder(v) && Number(v.capacity || 0) >= requiredHorses) ||
      roadFleet.find((v) => isUsableForOrder(v)) ||
      roadFleet.find((v) => Number(v.capacity || 0) >= requiredHorses) ||
      roadFleet[0];

    if (!chosen) {
      return { vehiclePlate: 'TRK-VN-089', vehicleId: null };
    }
    const parsedId = Number(String(chosen.id).replace(/\D/g, ''));
    return {
      vehiclePlate: chosen.code,
      vehicleId: Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null,
    };
  };

  // Ánh xạ thông tin Hãng hàng không -> airlineId & airlineName
  const resolveAirlineMeta = (nameOrCode?: string | null, order?: PlanningOrder | null) => {
    const norm = String(nameOrCode || '').trim().toLowerCase();
    const matched =
      (norm
        ? airlines.find(
            (a) =>
              a.name.toLowerCase() === norm ||
              norm.includes(a.name.toLowerCase()) ||
              a.name.toLowerCase().includes(norm) ||
              norm.includes(`(${a.code.toLowerCase()})`)
          )
        : undefined) ||
      (order?.routeDetail?.managerAirlineId
        ? airlines.find((a) => a.id === Number(order.routeDetail?.managerAirlineId))
        : undefined) ||
      airlines[0];

    return {
      airlineId: matched?.id ?? order?.routeDetail?.managerAirlineId ?? null,
      airlineName: nameOrCode || matched?.name || order?.routeDetail?.managerAirlineName || 'Singapore Airlines Cargo',
    };
  };

  // Ánh xạ tên sân bay -> departureAirportId / arrivalAirportId & mã IATA
  const resolveAirportMeta = (
    locationText?: string | null,
    fallbackId?: number | null,
    fallbackCode?: string | null,
    isDeparture = true
  ) => {
    const iataHint = extractIataCode(locationText) || (fallbackCode ? fallbackCode.toUpperCase() : '');
    const normText = String(locationText || '').trim().toLowerCase();
    const matched =
      (iataHint ? airports.find((ap) => ap.iataCode.toUpperCase() === iataHint) : undefined) ||
      (fallbackId ? airports.find((ap) => ap.id === Number(fallbackId)) : undefined) ||
      (normText
        ? airports.find(
            (ap) =>
              normText.includes(ap.name.toLowerCase()) ||
              normText.includes(ap.city.toLowerCase()) ||
              normText.includes(ap.country.toLowerCase())
          )
        : undefined) ||
      (isDeparture
        ? airports.find((ap) => ap.country.toLowerCase().includes('viet'))
        : airports.find((ap) => !ap.country.toLowerCase().includes('viet'))) ||
      airports[0];

    return {
      airportId: matched?.id ?? fallbackId ?? null,
      iataCode: matched?.iataCode ?? (iataHint || fallbackCode || (isDeparture ? 'SGN' : 'SIN')),
    };
  };

  const endpointCoordsRef = useRef<Record<string, [number, number]>>({});

  const applyAutoDistanceToLeg = (legItem: RouteLegItem): RouteLegItem => {
    const oKey = (legItem.originLocation || '').trim().toLowerCase();
    const dKey = (legItem.destinationLocation || '').trim().toLowerCase();
    const est = estimateLegDistanceAndDuration(
      legItem.originLocation,
      legItem.destinationLocation,
      legItem.legType === 'flight' ? 'flight' : 'road',
      endpointCoordsRef.current[oKey] ?? null,
      endpointCoordsRef.current[dKey] ?? null
    );
    if (!est) return legItem;
    return {
      ...legItem,
      distanceKm: est.distanceKm,
      durationHours: est.durationHours,
    };
  };

  const triggerAsyncGeocodeForLeg = (legIndex: number, originText: string, destText: string) => {
    const oTrim = (originText || '').trim();
    const dTrim = (destText || '').trim();
    if (oTrim.length < 3 || dTrim.length < 3) return;
    void (async () => {
      const oKey = oTrim.toLowerCase();
      const dKey = dTrim.toLowerCase();
      if (!endpointCoordsRef.current[oKey]) {
        const g1 = await geocodeAddress(oTrim);
        if (g1?.coords) endpointCoordsRef.current[oKey] = g1.coords;
      }
      if (!endpointCoordsRef.current[dKey]) {
        const g2 = await geocodeAddress(dTrim);
        if (g2?.coords) endpointCoordsRef.current[dKey] = g2.coords;
      }
      setLegs((prev) => {
        const target = prev[legIndex];
        if (!target) return prev;
        const recalculated = applyAutoDistanceToLeg(target);
        if (
          recalculated.distanceKm === target.distanceKm &&
          recalculated.durationHours === target.durationHours
        ) {
          return prev;
        }
        const nextLegs = prev.map((it, i) => (i === legIndex ? recalculated : it));
        setPlanTotalDistanceKm((curTotal) => sumLegsDistanceKm(nextLegs, curTotal));
        return nextLegs;
      });
    })();
  };

  // Tự động điền khung giờ khởi hành / đến dự kiến nối tiếp nhau theo ngày vận chuyển của đơn hàng
  const applyDefaultScheduleToLegs = (rawLegs: RouteLegItem[], order?: PlanningOrder | null): RouteLegItem[] => {
    const now = Date.now();
    let baseTimeMs = now + 24 * 3600_000;
    if (order?.rawRequestedDate) {
      const parsed = new Date(order.rawRequestedDate);
      if (Number.isFinite(parsed.getTime())) {
        const candidate = new Date(parsed);
        candidate.setHours(6, 0, 0, 0);
        baseTimeMs = candidate.getTime() > now ? candidate.getTime() : now + 12 * 3600_000;
      }
    } else {
      const tomorrowMorning = new Date(now + 24 * 3600_000);
      tomorrowMorning.setHours(6, 0, 0, 0);
      baseTimeMs = tomorrowMorning.getTime();
    }

    let cursorMs = baseTimeMs;
    return rawLegs.map((leg, idx) => {
      const durationHours = Math.max(0.5, Number(leg.durationHours || (leg.legType === 'flight' ? 2.5 : 2)));
      const existingDepMs = leg.plannedDeparture ? new Date(leg.plannedDeparture).getTime() : NaN;
      const existingArrMs = leg.plannedArrival ? new Date(leg.plannedArrival).getTime() : NaN;

      if (Number.isFinite(existingDepMs) && Number.isFinite(existingArrMs) && existingArrMs > existingDepMs) {
        cursorMs = existingArrMs + 60 * 60_000;
        return leg;
      }

      // Thêm 1.5h thời gian thủ tục soi chiếu / bàn giao kho Cargo giữa các chặng
      const depMs = idx === 0 ? cursorMs : cursorMs + 90 * 60_000;
      const arrMs = depMs + Math.round(durationHours * 3600_000);
      cursorMs = arrMs;

      return {
        ...leg,
        plannedDeparture: new Date(depMs).toISOString(),
        plannedArrival: new Date(arrMs).toISOString(),
      };
    });
  };

  const sumLegsDistanceKm = (nextLegs: RouteLegItem[], fallbackKm = 500): number => {
    const total = nextLegs.reduce((acc, l) => acc + Math.max(0, Number(l.distanceKm || 0)), 0);
    return total > 0 ? Math.round(total) : fallbackKm;
  };

  const buildMultimodalAirLegs = (
    originText: string,
    destText: string,
    horseCount: number,
    order?: PlanningOrder | null,
    templateStops?: RouteStop[] | RouteStopItem[],
    flightHoursOverride?: number
  ): RouteLegItem[] => {
    const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(order, templateStops);
    const geoRoute = originText && destText ? buildEquineRoute(originText, destText, 'air') : null;
    const previewLegs = geoRoute?.legs ?? [];
    const pickupPreview = previewLegs.length > 0 && previewLegs[0].type === 'road' ? previewLegs[0] : null;
    const flightPreview = previewLegs.find((l) => l.type === 'air');
    const lastPreview = previewLegs.length > 0 ? previewLegs[previewLegs.length - 1] : null;
    const deliveryPreview = lastPreview && lastPreview !== pickupPreview && lastPreview.type === 'road' ? lastPreview : null;

    const result: RouteLegItem[] = [];
    let seq = 1;
    const defaultVehicle = pickDefaultRoadVehicle(order);
    const airlineMeta = resolveAirlineMeta(airlineName, order);
    const depAirportMeta = resolveAirportMeta(
      depName,
      order?.routeDetail?.managerDepartureAirportId,
      order?.routeDetail?.managerDepartureAirportCode,
      true
    );
    const arrAirportMeta = resolveAirportMeta(
      arrName,
      order?.routeDetail?.managerArrivalAirportId,
      order?.routeDetail?.managerArrivalAirportCode,
      false
    );

    if (!isAirportLocationText(originText)) {
      const pickupEst = estimateLegDistanceAndDuration(originText, depCargoName, 'road');
      result.push({
        sequenceNo: seq++,
        legType: 'road',
        originLocation: originText,
        destinationLocation: depCargoName,
        distanceKm: pickupEst?.distanceKm ?? pickupPreview?.distanceKm ?? 20,
        durationHours: pickupEst?.durationHours ?? pickupPreview?.durationHours ?? 1,
        vehiclePlate: defaultVehicle.vehiclePlate,
        vehicleId: defaultVehicle.vehicleId,
      });
    }

    const flightEst = estimateLegDistanceAndDuration(depName, arrName, 'flight');
    const flightDistanceKm =
      flightEst?.distanceKm ??
      flightPreview?.distanceKm ??
      Math.max(500, (geoRoute?.distanceKm || 1200) - (pickupPreview?.distanceKm ?? 20) - (deliveryPreview?.distanceKm ?? 25));

    result.push({
      sequenceNo: seq++,
      legType: 'flight',
      originLocation: depName,
      destinationLocation: arrName,
      airlineId: airlineMeta.airlineId,
      airlineName: airlineMeta.airlineName,
      departureAirportId: depAirportMeta.airportId,
      departureAirportCode: depAirportMeta.iataCode,
      arrivalAirportId: arrAirportMeta.airportId,
      arrivalAirportCode: arrAirportMeta.iataCode,
      flightNumber: `${depAirportMeta.iataCode}-${arrAirportMeta.iataCode}-CARGO`,
      bookingReference: `AWB-${order?.requestCode || 'AIR'}-${arrAirportMeta.iataCode}`,
      stallsBooked: horseCount || 1,
      distanceKm: flightDistanceKm,
      durationHours: flightHoursOverride ?? flightEst?.durationHours ?? flightPreview?.durationHours ?? 2.5,
    });

    if (!isAirportLocationText(destText)) {
      const destClean = destText.split(',')[0].trim();
      const deliveryEst = estimateLegDistanceAndDuration(arrName, destText, 'road');
      const isDomesticArrival = Boolean(geoRoute?.isDomestic);
      result.push({
        sequenceNo: seq++,
        legType: 'road',
        originLocation: arrName,
        destinationLocation: destText,
        distanceKm: deliveryEst?.distanceKm ?? deliveryPreview?.distanceKm ?? 25,
        durationHours: deliveryEst?.durationHours ?? deliveryPreview?.durationHours ?? 1,
        vehicleId: isDomesticArrival ? defaultVehicle.vehicleId : null,
        roadTripId: null,
        vehiclePlate: isDomesticArrival
          ? defaultVehicle.vehiclePlate
          : language === 'en'
            ? `Vehicle from ${destClean} - Consignee pickup`
            : `Xe từ ${destClean} đến đón (Bên nhận tự rước)`,
      });
    }

    return applyDefaultScheduleToLegs(result, order);
  };

  // Synchronize from Route Template while keeping every field 100% editable by Coordinator
  const handleApplyTemplate = (template: RouteItem) => {
    setPlanRouteName(template.name);

    const effectiveOrigin = selectedPlanningOrder?.origin || template.origin;
    const effectiveDest = selectedPlanningOrder?.destination || template.destination;
    const geoCheck = buildEquineRoute(
      effectiveOrigin,
      effectiveDest,
      selectedPlanningOrder?.transportMode === 'road' ? 'road' : 'air'
    );
    const normName = normalizeVietnamese(template.name);
    const isFlight =
      selectedPlanningOrder?.transportMode === 'air' ||
      (selectedPlanningOrder?.transportMode !== 'road' &&
        (normName.includes('hang khong') ||
          normName.includes('air') ||
          normName.includes('bay') ||
          geoCheck.mode === 'air'));

    if (!isFlight) {
      const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
      const singleRoadLeg: RouteLegItem = {
        sequenceNo: 1,
        legType: 'road',
        originLocation: effectiveOrigin,
        destinationLocation: effectiveDest,
        distanceKm: template.distanceKm,
        durationHours: Math.max(1, Math.round(template.distanceKm / 60)),
        vehiclePlate: defaultVehicle.vehiclePlate,
        vehicleId: defaultVehicle.vehicleId,
      };
      const scheduled = applyDefaultScheduleToLegs([singleRoadLeg], selectedPlanningOrder);
      setLegs(scheduled);
      setPlanTotalDistanceKm(sumLegsDistanceKm(scheduled, template.distanceKm));
    } else {
      const built = buildMultimodalAirLegs(
        effectiveOrigin,
        effectiveDest,
        selectedPlanningOrder?.horseCount || 1,
        selectedPlanningOrder,
        template.stops
      );
      setLegs(built);
      setPlanTotalDistanceKm(sumLegsDistanceKm(built, template.distanceKm));
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

    toast.success(language === 'en' ? `Synced route "${template.name}"! You can edit vehicle plate and details below.` : `Đã đồng bộ tuyến "${template.name}"! Bạn có thể chỉnh sửa biển số xe và mọi thông tin bên dưới.`);
  };

  // Tự động gợi ý tuyến đường, chặng bay và chặng đường bộ từ Điểm đón, Điểm đến & Phương thức vận chuyển
  const applySmartRouteSuggestion = (
    order: PlanningOrder,
    modeOverride?: 'road' | 'air',
    showToast = false
  ) => {
    const hasManagerAirConfig = Boolean(
      order.routeDetail?.managerAirlineId ||
      order.routeDetail?.managerAirlineName ||
      order.routeDetail?.managerDepartureAirportId ||
      order.routeDetail?.managerArrivalAirportId ||
      order.routeDetail?.managerDepartureAirportCode ||
      order.routeDetail?.managerArrivalAirportCode
    );
    const preferredMode: 'road' | 'air' =
      modeOverride ??
      (hasManagerAirConfig || order.transportMode === 'air'
        ? 'air'
        : order.transportMode === 'road'
          ? 'road'
          : 'air');

    const geoPreview = buildEquineRoute(order.origin, order.destination, preferredMode);
    const shouldUseAir =
      modeOverride !== undefined
        ? modeOverride === 'air'
        : hasManagerAirConfig ||
          order.transportMode === 'air' ||
          (order.transportMode !== 'road' && (geoPreview.mode === 'air' || !geoPreview.isDomestic));

    const originShort = (order.origin || '').split(',')[0].trim() || 'Điểm đón';
    const destShort = (order.destination || '').split(',')[0].trim() || 'Điểm đến';

    if (!shouldUseAir) {
      const defaultVehicle = pickDefaultRoadVehicle(order);
      const roadEst = estimateLegDistanceAndDuration(order.origin, order.destination, 'road');
      const roadDist = roadEst?.distanceKm ?? geoPreview.distanceKm ?? (geoPreview.isDomestic ? 250 : 850);
      const roadDur = roadEst?.durationHours ?? Math.max(1, Math.round(geoPreview.durationHours || 3));
      const singleRoadLeg: RouteLegItem = {
        sequenceNo: 1,
        legType: 'road',
        originLocation: order.origin,
        destinationLocation: order.destination,
        distanceKm: roadDist,
        durationHours: roadDur,
        vehiclePlate: defaultVehicle.vehiclePlate,
        vehicleId: defaultVehicle.vehicleId,
      };
      const scheduled = applyDefaultScheduleToLegs([singleRoadLeg], order);
      setPlanRouteName(`Hành lang Đường bộ: ${originShort} → ${destShort}`);
      setLegs(scheduled);
      setPlanTotalDistanceKm(sumLegsDistanceKm(scheduled, roadDist));
      setStops([]);
      if (showToast) {
        toast.success(
          language === 'en'
            ? `Suggested direct road route: ${originShort} → ${destShort} (${roadDist} km)`
            : `Đã tự động gợi ý lộ trình Đường bộ: ${originShort} → ${destShort} (${roadDist} km)`
        );
      }
    } else {
      const { depName, arrName } = resolveAirLegLocations(order);
      const depCode = extractIataCode(depName) || order.routeDetail?.managerDepartureAirportCode || 'SGN';
      const arrCode = extractIataCode(arrName) || order.routeDetail?.managerArrivalAirportCode || 'SIN';
      const builtLegs = buildMultimodalAirLegs(
        order.origin,
        order.destination,
        order.horseCount,
        order
      );
      const totalKm = sumLegsDistanceKm(builtLegs, geoPreview.distanceKm || 1200);
      setPlanRouteName(`Hành lang Đa phương thức: ${originShort} → ${depCode} ✈️ ${arrCode} → ${destShort}`);
      setLegs(builtLegs);
      setPlanTotalDistanceKm(totalKm);
      setStops([]);
      if (showToast) {
        toast.success(
          language === 'en'
            ? `Suggested multimodal air + road route (${builtLegs.length} legs • ${totalKm} km)`
            : `Đã tự động gợi ý lộ trình Đa phương thức Bay + Đường bộ (${builtLegs.length} chặng • ${totalKm} km)`
        );
      }
    }
  };
  const handleOpenDetailModal = (order: PlanningOrder, templateToApply?: RouteItem) => {
    setSelectedPlanningOrder(order);
    const existingRoute = order.routeDetail;

    setNotes(existingRoute?.strategicNotes || '');

    // If order already has saved legs in DB, preserve them but sanitize any generic airport placeholder
    if (existingRoute?.legs && existingRoute.legs.length > 0) {
      setPlanRouteName(
        existingRoute.routeName ||
          `Hành lang vận chuyển: ${(order.origin || '').split(',')[0]} → ${(order.destination || '').split(',')[0]}`
      );

      const { arrName, depName, airlineName } = resolveAirLegLocations(order, existingRoute.stops);
      const geoRoute = buildEquineRoute(
        order.origin,
        order.destination,
        order.transportMode === 'road' ? 'road' : 'air'
      );
      const flightPreview = geoRoute.legs.find((l) => l.type === 'air');

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
          const airlineMeta = resolveAirlineMeta(leg.airlineName || airlineName, order);
          const depMeta = resolveAirportMeta(orig, leg.departureAirportId ?? existingRoute.managerDepartureAirportId, leg.departureAirportCode ?? existingRoute.managerDepartureAirportCode, true);
          const arrMeta = resolveAirportMeta(dest, leg.arrivalAirportId ?? existingRoute.managerArrivalAirportId, leg.arrivalAirportCode ?? existingRoute.managerArrivalAirportCode, false);
          return {
            ...leg,
            originLocation: orig,
            destinationLocation: dest,
            airlineId: leg.airlineId ?? airlineMeta.airlineId,
            airlineName: leg.airlineName || airlineMeta.airlineName,
            departureAirportId: leg.departureAirportId ?? depMeta.airportId,
            departureAirportCode: leg.departureAirportCode || depMeta.iataCode,
            arrivalAirportId: leg.arrivalAirportId ?? arrMeta.airportId,
            arrivalAirportCode: leg.arrivalAirportCode || arrMeta.iataCode,
            flightNumber: leg.flightNumber || `${depMeta.iataCode}-${arrMeta.iataCode}-CARGO`,
            bookingReference: leg.bookingReference || `AWB-${order.requestCode}-${arrMeta.iataCode}`,
            stallsBooked: Math.max(Number(leg.stallsBooked || 0), Number(order.horseCount || 1)),
            distanceKm: leg.distanceKm || flightPreview?.distanceKm || 1150,
          };
        }
        if (leg.legType === 'road') {
          if (orig.includes('đích đến') || orig.includes('SIN / BKK')) {
            orig = arrName;
          }
        }
        return { ...leg, destinationLocation: dest, originLocation: orig };
      });

      const scheduledExisting = applyDefaultScheduleToLegs(sanitizedLegs, order);
      setLegs(scheduledExisting);
      setPlanTotalDistanceKm(sumLegsDistanceKm(scheduledExisting, existingRoute.totalDistanceKm || 500));
      setStops(existingRoute.stops && existingRoute.stops.length > 0 ? existingRoute.stops : []);
    } else if (templateToApply) {
      handleApplyTemplate(templateToApply);
    } else {
      applySmartRouteSuggestion(order);
    }

    setIsDetailModalOpen(true);
  };

  // Add Leg
  const handleAddLeg = (type: 'road' | 'flight') => {
    const nextSeq = legs.length + 1;
    if (type === 'road') {
      const isAfterFlight = legs.some((l) => l.legType === 'flight');
      const destClean = (selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
      const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
      const defaultPlate = isAfterFlight
        ? (language === 'en' ? `Vehicle from ${destClean} - Consignee pickup` : `Xe từ ${destClean} đến đón (Bên nhận tự rước)`)
        : defaultVehicle.vehiclePlate;
      const nextLegs = applyDefaultScheduleToLegs(
        [
          ...legs,
          {
            sequenceNo: nextSeq,
            legType: 'road',
            originLocation: legs.length > 0 ? legs[legs.length - 1].destinationLocation : (language === 'en' ? 'Assembly Point' : 'Điểm tập kết'),
            destinationLocation: isAfterFlight ? (selectedPlanningOrder?.destination || (language === 'en' ? 'Destination' : 'Địa điểm đích')) : (language === 'en' ? 'Road Leg Destination' : 'Điểm đến chặng đường bộ'),
            distanceKm: isAfterFlight ? 35 : 120,
            durationHours: isAfterFlight ? 1.5 : 3,
            vehiclePlate: defaultPlate,
            vehicleId: isAfterFlight ? null : defaultVehicle.vehicleId,
            roadTripId: isAfterFlight ? null : undefined,
          },
        ],
        selectedPlanningOrder
      );
      setLegs(nextLegs);
      setPlanTotalDistanceKm(sumLegsDistanceKm(nextLegs, planTotalDistanceKm));
    } else {
      const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(
        selectedPlanningOrder,
        stops
      );
      const airlineMeta = resolveAirlineMeta(airlineName, selectedPlanningOrder);
      const depMeta = resolveAirportMeta(
        depName,
        selectedPlanningOrder?.routeDetail?.managerDepartureAirportId,
        selectedPlanningOrder?.routeDetail?.managerDepartureAirportCode,
        true
      );
      const arrMeta = resolveAirportMeta(
        arrName,
        selectedPlanningOrder?.routeDetail?.managerArrivalAirportId,
        selectedPlanningOrder?.routeDetail?.managerArrivalAirportCode,
        false
      );
      const flightBase = {
        legType: 'flight' as const,
        originLocation: depName,
        destinationLocation: arrName,
        airlineId: airlineMeta.airlineId,
        airlineName: airlineMeta.airlineName,
        departureAirportId: depMeta.airportId,
        departureAirportCode: depMeta.iataCode,
        arrivalAirportId: arrMeta.airportId,
        arrivalAirportCode: arrMeta.iataCode,
        flightNumber: `${depMeta.iataCode}-${arrMeta.iataCode}-CARGO`,
        bookingReference: `AWB-${selectedPlanningOrder?.requestCode || 'AIR'}-${arrMeta.iataCode}`,
        stallsBooked: selectedPlanningOrder?.horseCount || 1,
        distanceKm: 1150,
        durationHours: 3,
      };

      if (legs.length === 0 && selectedPlanningOrder?.origin && !isAirportLocationText(selectedPlanningOrder.origin)) {
        const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
        const nextLegs = applyDefaultScheduleToLegs(
          [
            {
              sequenceNo: 1,
              legType: 'road',
              originLocation: selectedPlanningOrder.origin,
              destinationLocation: depCargoName,
              distanceKm: 45,
              durationHours: 2,
              vehiclePlate: defaultVehicle.vehiclePlate,
              vehicleId: defaultVehicle.vehicleId,
            },
            {
              sequenceNo: 2,
              ...flightBase,
            },
          ],
          selectedPlanningOrder
        );
        setLegs(nextLegs);
        setPlanTotalDistanceKm(sumLegsDistanceKm(nextLegs, planTotalDistanceKm));
        toast.success(
          language === 'en'
            ? 'Automatically added Leg 1 (Horse Truck transfer to airport) before the flight leg.'
            : 'Đã tự động thêm Chặng 1 (Xe thùng chở ngựa ra sân bay) trước chặng bay.'
        );
      } else {
        const nextLegs = applyDefaultScheduleToLegs(
          [
            ...legs,
            {
              sequenceNo: nextSeq,
              ...flightBase,
            },
          ],
          selectedPlanningOrder
        );
        setLegs(nextLegs);
        setPlanTotalDistanceKm(sumLegsDistanceKm(nextLegs, planTotalDistanceKm));
      }
    }
  };

  // Remove Leg
  const handleRemoveLeg = (idx: number) => {
    const updated = legs.filter((_, i) => i !== idx).map((l, i) => ({ ...l, sequenceNo: i + 1 }));
    setLegs(updated);
    setPlanTotalDistanceKm(sumLegsDistanceKm(updated, planTotalDistanceKm));
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
      toast.success(language === 'en' ? `Added stop "${masterStop.name}" to route!` : `Đã thêm trạm "${masterStop.name}" vào lộ trình!`);
    } else {
      setStops([
        ...stops,
        {
          sequenceNo: nextSeq,
          stopType: 'rest',
          locationName: '',
          country: '',
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
    const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
    setPlanRouteName(`Lộ trình: ${(selectedPlanningOrder.origin || '').split(',')[0]} → ${(selectedPlanningOrder.destination || '').split(',')[0]}`);
    const manualLegs = applyDefaultScheduleToLegs(
      [
        {
          sequenceNo: 1,
          legType: 'road',
          originLocation: selectedPlanningOrder.origin,
          destinationLocation: selectedPlanningOrder.destination,
          distanceKm: 180,
          durationHours: 3.5,
          vehiclePlate: defaultVehicle.vehiclePlate,
          vehicleId: defaultVehicle.vehicleId,
        },
      ],
      selectedPlanningOrder
    );
    setLegs(manualLegs);
    setPlanTotalDistanceKm(sumLegsDistanceKm(manualLegs, 180));
    setStops([]);
    toast.success(language === 'en' ? 'Reset route plan form. You can freely fill in all details!' : 'Đã làm mới form kế hoạch. Bạn có thể tự do điền và chỉnh sửa mọi thông tin!');
  };

  // Lưu lộ trình đang điền thành một Tuyến mẫu mới vào Thư viện ngay trong Modal
  const handleSaveCurrentPlanAsTemplate = () => {
    if (!planRouteName.trim()) {
      toast.error(language === 'en' ? 'Please enter route template name before saving to library!' : 'Vui lòng nhập tên lộ trình trước khi lưu vào Thư viện mẫu!');
      return;
    }
    const orig = legs[0]?.originLocation || selectedPlanningOrder?.origin || (language === 'en' ? 'Origin' : 'Điểm xuất phát');
    const dest = legs[legs.length - 1]?.destinationLocation || selectedPlanningOrder?.destination || (language === 'en' ? 'Destination' : 'Điểm đích');

    const newTemplate = addRoute({
      name: planRouteName.trim(),
      orderCode: `TEMPLATE-${Date.now().toString().slice(-4)}`,
      origin: orig,
      destination: dest,
      distanceKm: Number(planTotalDistanceKm) || 300,
      stops: stops.map((s, idx) => ({
        seq: idx + 1,
        name: s.locationName || (language === 'en' ? `Stop ${idx + 1}` : `Trạm dừng ${idx + 1}`),
        type: s.stopType === 'quarantine' ? 'Quarantine' : s.stopType === 'border_check' ? 'Border Gate' : 'Rest',
        country: s.country || (language === 'en' ? 'Vietnam' : 'Việt Nam'),
      })),
      status: 'active',
    });

    toast.success(language === 'en' ? `Saved "${newTemplate.name}" to Route Templates Library successfully!` : `Đã lưu "${newTemplate.name}" vào Thư viện Tuyến Mẫu thành công! Các đơn hàng sau có thể tái sử dụng.`);
  };

  // Save Plan as Draft (Bước 1b)
  const handleSaveDraft = async () => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    setIsSubmittingPlan(true);
    try {
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || sumLegsDistanceKm(legs, 500),
        legs,
        stops,
        notes: notes.trim() || undefined,
      });
      toast.success(t('coordinator.routes.saveDraftSuccess', 'Đã lưu bản nháp lộ trình chi tiết thành công!'));
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || t('coordinator.routes.errSaveDraft', 'Lỗi khi lưu bản nháp lộ trình'));
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Submit Plan for Approval (Bước 1b -> Manager duyệt Bước 2)
  const handleSubmitForApproval = async () => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    if (legs.length === 0) {
      toast.error(t('coordinator.routes.errNeedOneLeg', 'Vui lòng dựng ít nhất 1 chặng vận chuyển trước khi gửi duyệt!'));
      return;
    }

    const sortedLegs = [...legs].sort((a, b) => Number(a.sequenceNo) - Number(b.sequenceNo));
    const firstFlightIdx = sortedLegs.findIndex((l) => l.legType === 'flight');
    if (firstFlightIdx !== -1) {
      let lastFlightIdx = firstFlightIdx;
      for (let i = sortedLegs.length - 1; i >= 0; i--) {
        if (sortedLegs[i].legType === 'flight') {
          lastFlightIdx = i;
          break;
        }
      }
      if (!isAirportLocationText(selectedPlanningOrder.origin)) {
        const hasPickupRoadLeg = sortedLegs.slice(0, firstFlightIdx).some((l) => l.legType === 'road');
        if (!hasPickupRoadLeg) {
          toast.error(
            language === 'en'
              ? 'Air shipments from a farm/stable require a Horse Truck road leg to the departure airport before the flight leg.'
              : 'Đơn đi hàng không bắt buộc phải có chặng Xe thùng đường bộ chở ngựa từ điểm xuất phát ra sân bay đi trước chặng bay!',
            { duration: 6000 }
          );
          return;
        }
      }
      if (!isAirportLocationText(selectedPlanningOrder.destination)) {
        const hasDeliveryRoadLeg = sortedLegs.slice(lastFlightIdx + 1).some((l) => l.legType === 'road');
        if (!hasDeliveryRoadLeg) {
          toast.error(
            language === 'en'
              ? 'Air shipments to a non-airport destination require a Horse Truck road leg from the arrival airport to the final destination after landing.'
              : 'Đơn đi hàng không bắt buộc phải có chặng Xe thùng đường bộ từ sân bay hạ cánh đưa ngựa về đích đến sau chặng bay!',
            { duration: 6000 }
          );
          return;
        }
      }
    }

    // Kiểm tra giờ khởi hành / đến dự kiến, thông tin xe đường bộ nội bộ và thông tin chuyến bay trước khi gửi duyệt
    for (let i = 0; i < sortedLegs.length; i++) {
      const l = sortedLegs[i];
      const seqLabel = l.sequenceNo || i + 1;
      const depMs = l.plannedDeparture ? new Date(l.plannedDeparture).getTime() : NaN;
      const arrMs = l.plannedArrival ? new Date(l.plannedArrival).getTime() : NaN;
      if (!Number.isFinite(depMs) || !Number.isFinite(arrMs) || arrMs <= depMs) {
        toast.error(
          language === 'en'
            ? `Leg #${seqLabel}: Please enter valid Planned Departure and Planned Arrival times (arrival must be after departure).`
            : `Chặng #${seqLabel}: Vui lòng kiểm tra Giờ khởi hành và Giờ đến dự kiến (giờ đến phải sau giờ khởi hành)!`,
          { duration: 6000 }
        );
        return;
      }

      const isPostFlightRoad = l.legType === 'road' && firstFlightIdx !== -1 && i > firstFlightIdx;
      if (l.legType === 'road' && !isPostFlightRoad) {
        if (!l.vehiclePlate && !l.vehicleId && !l.roadTripId) {
          toast.error(
            language === 'en'
              ? `Leg #${seqLabel}: Please select a specialized horse truck for the domestic road leg.`
              : `Chặng #${seqLabel}: Vui lòng chọn phương tiện / xe chuyên dụng cho chặng đường bộ nội địa!`,
            { duration: 6000 }
          );
          return;
        }

        if (l.vehiclePlate && !l.roadTripId) {
          const matchedVehicle = vehicles.find((v) => v.code === l.vehiclePlate || (l.vehicleId && String(v.id) === String(l.vehicleId)));
          if (matchedVehicle) {
            const isCurrentTrip = Boolean(matchedVehicle.assignedTripCode) && matchedVehicle.assignedTripCode === selectedPlanningOrder?.requestCode;
            const isInTransport =
              (matchedVehicle.status === 'in_use' || Boolean(matchedVehicle.assignedTripCode)) &&
              !isCurrentTrip;
            if (isInTransport) {
              toast.error(
                language === 'en'
                  ? `Leg #${seqLabel}: Vehicle "${matchedVehicle.code}" is currently in transport (${matchedVehicle.assignedTripCode || 'running another trip'}). Please select an available vehicle.`
                  : `Chặng #${seqLabel}: Xe "${matchedVehicle.code}" hiện đang trong quá trình vận chuyển (${matchedVehicle.assignedTripCode || 'đang chạy chuyến khác'})! Vui lòng chọn xe khác sẵn sàng.`,
                { duration: 6000 }
              );
              return;
            }
            const requiredStalls = Math.max(1, Number(selectedPlanningOrder?.horseCount || 1));
            if (Number(matchedVehicle.capacity || 0) < requiredStalls) {
              toast.error(
                language === 'en'
                  ? `Leg #${seqLabel}: Vehicle "${matchedVehicle.code}" has insufficient stalls (${matchedVehicle.capacity}/${requiredStalls} horses).`
                  : `Chặng #${seqLabel}: Xe "${matchedVehicle.code}" không đủ sức chứa (${matchedVehicle.capacity}/${requiredStalls} ngựa)!`,
                { duration: 6000 }
              );
              return;
            }
          }
        }
      }

      if (l.legType === 'flight') {
        if (!l.airlineName?.trim() || !l.flightNumber?.trim() || !l.bookingReference?.trim()) {
          toast.error(
            language === 'en'
              ? `Leg #${seqLabel} (Flight): Please enter Airline, Flight Number, and Booking Reference (AWB) before submitting for approval.`
              : `Chặng #${seqLabel} (Hàng không): Vui lòng điền đủ Hãng bay, Số hiệu chuyến bay và Mã đặt chỗ (AWB) trước khi gửi duyệt!`,
            { duration: 6000 }
          );
          return;
        }
      }
    }

    // Kiểm tra an toàn sức khỏe ngựa trên chặng đường bộ dài (> 350km hoặc > 4.5 giờ)
    const hasSharedRoadTrip = legs.some((leg) => leg.legType === 'road' && Boolean(leg.roadTripId));
    const hasLongRoadLeg = legs.some(
      (leg) => leg.legType === 'road' && (Number(leg.distanceKm) > 350 || Number(leg.durationHours) > 4.5)
    );
    const hasRestStop = stops.some((s) => s.stopType === 'rest');
    if (hasLongRoadLeg && !hasRestStop && !(hasSharedRoadTrip && stops.length === 0)) {
      toast.error(
        language === 'en'
          ? 'Equine Welfare Check: Any road leg exceeding 350km or 4.5 hours requires at least 1 Rest stop for hydration and vital checks!'
          : 'Đảm bảo an toàn sức khỏe cho ngựa: Chặng đường bộ vượt quá 350km hoặc 4.5 giờ bắt buộc phải có ít nhất 1 Trạm dừng nghỉ để kiểm tra thể trạng và tiếp nước cho ngựa!',
        { duration: 6000 }
      );
      return;
    }

    setIsSubmittingPlan(true);
    try {
      // 1. Save detailed plan
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || sumLegsDistanceKm(legs, 500),
        legs,
        stops,
        notes: notes.trim() || undefined,
      });

      // 2. Submit for approval
      await routesApi.submitPlanForApproval(selectedPlanningOrder.id);
      toast.success(t('coordinator.routes.submitManagerSuccess', 'Đã gửi kế hoạch chi tiết cho Logistics Manager phê duyệt!'));
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || t('coordinator.routes.errSubmitManager', 'Lỗi khi gửi duyệt kế hoạch'));
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
        description: language === 'en' ? 'Driver reports: Main route blocked / traffic incident, vehicle cannot proceed. Reroute requested.' : 'Tài xế báo cáo: Tuyến đường chính bị phong tỏa / sự cố giao thông, xe không thể tiếp tục di chuyển. Yêu cầu Coordinator hiệu chỉnh lại chặng đường vòng tránh!',
        severity: 'critical',
      });
      toast.success(t('coordinator.routes.incidentTriggerSuccess', 'Đã kích hoạt báo cáo sự cố từ tài xế! Quyền hiệu chỉnh chặng khẩn cấp đã mở.'));
      await loadMasterDataAndOrders();
      try {
        const updatedRoute = await routesApi.getRouteByShipmentId(order.id);
        setSelectedPlanningOrder((prev) => prev ? { ...prev, routeDetail: updatedRoute } : null);
      } catch {}
    } catch (err: any) {
      toast.error(err?.message || t('coordinator.routes.errRecordIncident', 'Không thể ghi nhận sự cố'));
    }
  };

  // Flow 5: Save Emergency Reroute & Optionally Submit for Manager Approval under single loading guard
  const handleSaveEmergencyReroute = async (submitForApproval = true) => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    if (legs.length === 0) {
      toast.error(t('coordinator.routes.errNeedOneLegGeneral', 'Vui lòng dựng ít nhất 1 chặng vận chuyển!'));
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
        notes: notes.trim() || undefined,
      });

      // 2. Resolve the active incident
      if (selectedPlanningOrder.routeDetail?.activeIncident?.id) {
        await routesApi.resolveIncident(selectedPlanningOrder.routeDetail.activeIncident.id);
      }

      // 3. Submit detour plan for Manager re-approval
      if (submitForApproval) {
        await routesApi.submitPlanForApproval(selectedPlanningOrder.id);
      }

      toast.success(
        submitForApproval
          ? t('coordinator.routes.submitDetourSuccess', 'Đã gửi kế hoạch hiệu chỉnh do sự cố cho Manager duyệt!')
          : t('coordinator.routes.saveDetourSuccess', 'Đã lưu lộ trình tránh sự cố thành công! Tài xế đã nhận lộ trình cập nhật mới.')
      );
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || t('coordinator.routes.errSaveDetour', 'Lỗi khi lưu lộ trình sự cố'));
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Auto-open shipment if ?shipmentId= is supplied in URL
  const openDetailRef = useRef(handleOpenDetailModal);
  openDetailRef.current = handleOpenDetailModal;
  useEffect(() => {
    if (!urlShipmentId || planningOrders.length === 0 || openedShipmentRef.current === urlShipmentId) {
      return;
    }
    const target = planningOrders.find((o) => String(o.id) === String(urlShipmentId));
    if (target) {
      openedShipmentRef.current = urlShipmentId;
      openDetailRef.current(target);
    }
  }, [urlShipmentId, planningOrders]);

  // Flow 5: Resolve Incident directly
  const handleResolveIncidentOnly = async (incidentId?: number) => {
    if (!incidentId) return;
    try {
      await routesApi.resolveIncident(incidentId);
      toast.success(t('coordinator.routes.resolveIncidentSuccess', 'Đã đánh dấu giải quyết sự cố thành công!'));
      await loadMasterDataAndOrders();
      if (selectedPlanningOrder) {
        try {
          const updatedRoute = await routesApi.getRouteByShipmentId(selectedPlanningOrder.id);
          setSelectedPlanningOrder((prev) => prev ? { ...prev, routeDetail: updatedRoute } : null);
        } catch {}
      }
    } catch (err: any) {
      toast.error(err?.message || t('coordinator.routes.errResolveIncident', 'Không thể giải quyết sự cố'));
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
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 shadow-sm animate-pulse">
          <AlertCircle size={13} className="text-rose-600" />
          <span>⚠️ {t('coordinator.routes.incidentRerouteRequired', 'Sự cố lộ trình: Cần hiệu chỉnh tuyến')}</span>
        </span>
      );
    }

    switch (status) {
      case 'in_transit':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            <Truck size={13} className="text-sky-600" />
            <span>{translateStatus('in_transit')}</span>
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span>{translateStatus('completed')}</span>
          </span>
        );
      case 'pending_approval':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F3EFE4] text-[#181A17] border border-[#EAE5DA] flex items-center gap-1">
            <Clock size={12} className="animate-spin text-[#A67C2E]" /> {translateStatus('pending_approval')}
          </span>
        );
      case 'approved':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" /> {translateStatus('approved')}
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-teal-600" /> {translateStatus('confirmed')}
          </span>
        );
      case 'ready_to_depart':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F3EFE4] text-[#181A17] border border-[#EAE5DA] flex items-center gap-1">
            <Sparkles size={12} className="text-[#A67C2E]" /> {translateStatus('ready_to_depart')}
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
            <AlertCircle size={12} className="text-red-600" /> {translateStatus('rejected')}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
            <Edit size={12} className="text-slate-500" /> {translateStatus('draft')}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">{t('coordinator.routes.title', 'Lập Kế Hoạch Tuyến Đường Vận Chuyển')}</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17]">
              {t('coordinator.routes.badge', 'Điều Phối Tuyến & Kế Hoạch Thực Thi')}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t('coordinator.routes.subtitle', 'Dựng chi tiết từng chặng vận chuyển (đường bộ, chuyến bay), chọn xe có biển số, trạm dừng nghỉ & gửi duyệt cho Manager.')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMasterDataAndOrders()}
            disabled={isLoadingOrders}
            className="shadow-sm"
          >
            <RefreshCw size={15} className={`mr-1.5 text-[#A67C2E] ${isLoadingOrders ? 'animate-spin' : ''}`} />
            {t('coordinator.routes.refreshBtn', 'Làm mới dữ liệu')}
          </Button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoadingOrders}
            onClick={() => void loadMasterDataAndOrders()}
            className="border-red-200 bg-white text-red-700 hover:bg-red-100 text-xs"
          >
            <RotateCcw size={13} className="mr-1" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* TABS */}
      <div className="flex flex-wrap border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('flow3_planning')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'flow3_planning'
              ? 'border-[#181A17] text-[#A67C2E]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Navigation size={17} />
          {t('coordinator.routes.tabPlanning', 'Lập kế hoạch lộ trình chi tiết')}
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#FAF8F4] text-[#181A17] font-extrabold">
            {planningOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('corridor_catalog')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'corridor_catalog'
              ? 'border-[#181A17] text-[#A67C2E]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers size={17} />
          {t('coordinator.routes.tabCatalog', 'Thư viện Tuyến đường & Bản đồ số')}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600 font-extrabold">
            {routes.length}
          </span>
        </button>
      </div>

      {/* TAB 1: FLOW 3 DETAILED PLANNING */}
      {activeTab === 'flow3_planning' && (
        <div className="flex flex-col gap-5">
          {/* Search bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-96">
              <Search size={16} className="text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                aria-label={t('coordinator.routes.searchPlaceholder', 'Tìm mã đơn, tên ngựa, điểm đi, điểm đến...')}
                placeholder={t('coordinator.routes.searchPlaceholder', 'Tìm mã đơn, tên ngựa, điểm đi, điểm đến...')}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="border-none outline-none text-sm w-full bg-transparent"
              />
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>{t('coordinator.routes.stepGuide', 'Định hướng từ Manager → Dựng chặng chi tiết → Gửi duyệt')}</span>
            </div>
          </div>

          {/* Orders Cards Grid */}
          <div className="flex flex-col gap-4">
            {isLoadingOrders && planningOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm text-slate-500">
                <RefreshCw size={28} className="animate-spin text-[#A67C2E] mx-auto mb-2.5" />
                <p className="text-sm font-medium m-0">
                  {t('coordinator.routes.loadingOrders', language === 'en' ? 'Loading route planning orders...' : 'Đang tải danh sách đơn hàng cần lập lộ trình...')}
                </p>
              </div>
            ) : filteredOrders.map((order) => {
              const route = order.routeDetail;
              const planStatus = route?.planStatus || (order.status === 'in_transit' ? 'in_transit' : 'draft');
              const activeIncident = route?.activeIncident;
              const isInTransit = planStatus === 'in_transit' || order.status === 'in_transit';
              const isRejected = planStatus === 'rejected' || (planStatus === 'draft' && Boolean(route?.rejectionReason));

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:border-[#D4C5A3] transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-[#A67C2E] text-sm bg-[#FAF8F4] px-2.5 py-1 rounded-md">
                        {order.requestCode}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-base m-0 flex items-center gap-2">
                          {renderHorseNamesDisplay(order.horses, order.horseCount, t)}
                        </div>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">{t('coordinator.routes.clientPrefix', 'Khách hàng: {name}', { name: order.customerName || '' })}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      {renderPlanStatusBadge(isInTransit ? 'in_transit' : planStatus, activeIncident)}
                      {order.paymentState === 'PAID' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          💳 {language === 'en' ? 'Paid' : 'Đã thanh toán'}
                        </span>
                      )}
                      {order.paymentState === 'PENDING' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA]">
                          ⏳ {language === 'en' ? 'Awaiting QR Payment' : 'Chờ thanh toán QR'}
                        </span>
                      )}
                      {order.paymentState === 'AWAITING_CONFIRMATION' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          🕒 {language === 'en' ? 'Awaiting Confirmation' : 'Chờ xác nhận CK'}
                        </span>
                      )}
                      {order.paymentState === 'NEEDS_REVIEW' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                          ⚠️ {language === 'en' ? 'Payment Review' : 'Cần kiểm tra TT'}
                        </span>
                      )}
                      {order.paymentState === 'EXPIRED' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                          {language === 'en' ? 'Payment Expired' : 'Hết hạn TT'}
                        </span>
                      )}
                      {(order.paymentState === 'WAITING_FLOW2' || order.paymentState === 'DOCUMENTS_APPROVED') && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          {language === 'en' ? 'Invoice Not Issued' : 'Chưa gửi YC TT'}
                        </span>
                      )}

                      {/* Phân loại nút hành động */}
                      {(() => {
                        const isCompleted = order.status === 'completed' || planStatus === 'completed';
                        const isPlanApproved = planStatus === 'approved' || planStatus === 'confirmed' || planStatus === 'ready_to_depart' || isInTransit || isCompleted;

                        if (activeIncident && !isCompleted) {
                          return (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 animate-pulse"
                              title={t('coordinator.routes.driverIncidentTitle', 'Tài xế báo sự cố - Bấm để hiệu chỉnh lại chặng khẩn cấp')}
                            >
                              <AlertCircle size={14} />
                              <span>{t('coordinator.routes.incidentRerouteBtn', 'Hiệu chỉnh chặng do sự cố')}</span>
                            </Button>
                          );
                        }

                        if (isCompleted) {
                          return (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1.5"
                              title={t('coordinator.routes.completedTripTitle', 'Chuyến đi đã cập bến hoàn thành - Bấm để xem lại lộ trình chi tiết')}
                            >
                              <Eye size={14} className="text-slate-500" />
                              <span>{t('coordinator.routes.viewRouteBtn', 'Xem lộ trình')}</span>
                            </Button>
                          );
                        }

                        if (isPlanApproved) {
                          return (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetailModal(order)}
                              className="shadow-sm font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1.5"
                              title={t('coordinator.routes.approvedTripTitle', 'Kế hoạch đã được Manager phê duyệt - Bấm để xem chi tiết lộ trình')}
                            >
                              <Eye size={14} className="text-slate-500" />
                              <span>{t('coordinator.routes.viewRouteBtn', 'Xem lộ trình')}</span>
                            </Button>
                          );
                        }

                        return (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenDetailModal(order)}
                            className="shadow-sm font-semibold bg-[#181A17] hover:bg-[#242722] text-white"
                          >
                            <Edit size={14} className="mr-1.5" />
                            {planStatus === 'draft' || isRejected
                              ? t('coordinator.routes.buildPlanBtn', 'Dựng kế hoạch chi tiết')
                              : t('coordinator.routes.viewEditLegsBtn', 'Xem & Hiệu chỉnh chặng')}
                          </Button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Manager Strategic Framework Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-[#C4B38E]/70 to-[#C4B38E]/50 rounded-xl border border-[#EAE5DA] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-extrabold text-[#181A17] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-[#181A17]" />
                        {t('coordinator.routes.frameworkTitle', 'Khung Kế Hoạch Định Hướng (Từ Logistics Manager)')}
                      </span>
                      {order.hasManagerFramework ? (
                        <>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                            <span>
                              {t('coordinator.routes.requiredVehicle', 'Loại xe yêu cầu:')} <strong className="text-[#181A17]">{route?.managerVehicleType ? translateVehicleType(route.managerVehicleType) : translateVehicleType('truck')}</strong>
                            </span>
                            {order.transportMode !== 'road' && route?.managerAirlineName && (
                              <span>
                                {t('coordinator.routes.airline', 'Hãng bay:')} <strong className="text-[#181A17]">{route.managerAirlineName}</strong>
                              </span>
                            )}
                            {order.transportMode !== 'road' && route?.managerDepartureAirportCode && route?.managerArrivalAirportCode && (
                              <span>
                                {t('coordinator.routes.airportPair', 'Sân bay:')} <strong className="text-[#181A17]">{route.managerDepartureAirportCode} → {route.managerArrivalAirportCode}</strong>
                              </span>
                            )}
                            {route?.managerMainCorridor && (
                              <span>
                                {t('coordinator.routes.corridor', 'Hành lang:')} <strong className="text-slate-800">{route.managerMainCorridor}</strong>
                              </span>
                            )}
                          </div>
                          {route?.strategicNotes && (
                            <p className="text-[11px] text-slate-600 m-0 mt-0.5 italic">
                              {t('coordinator.routes.managerDirective', 'Chỉ thị của Manager:')} &quot;{route.strategicNotes}&quot;
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-amber-900 font-medium m-0 mt-0.5">
                          {language === 'en'
                            ? '⏳ Quote approved — Awaiting Manager Strategic Framework (Step 1a) or Coordinator can pre-draft the detailed route.'
                            : '⏳ Đơn đã duyệt báo giá — Đang chờ Manager thiết lập khung định hướng (Bước 1a) hoặc Điều phối viên có thể dựng sẵn lộ trình chi tiết.'}
                        </p>
                      )}
                    </div>

                    {route?.assignedCoordinatorName && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('coordinator.routes.assignedCoordinator', 'Điều phối viên chỉ định')}</span>
                        <span className="font-bold text-slate-800">{route.assignedCoordinatorName}</span>
                      </div>
                    )}
                  </div>

                  {/* Rejection Alert if rejected */}
                  {isRejected && route?.rejectionReason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>{t('coordinator.routes.rejectionAlertTitle', 'Yêu cầu chỉnh sửa từ Manager:')}</strong> {route.rejectionReason}
                      </div>
                    </div>
                  )}

                  {/* Route & Legs Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px] block">{t('coordinator.routes.generalRoute', 'Lộ trình tổng quát')}</span>
                      <p className="font-semibold text-slate-800 m-0 mt-0.5">
                        {order.origin} → {order.destination}
                      </p>
                      <p className="text-slate-500 m-0 mt-1">
                        {t('coordinator.routes.routeNameLabel', 'Tên tuyến:')} <strong>{route?.routeName || t('coordinator.routes.unnamed', 'Chưa đặt tên')}</strong> • {t('coordinator.routes.distanceLabel', 'Cự ly:')} <strong>{route?.totalDistanceKm || 850} km</strong>
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[10px] block">
                        {t('coordinator.routes.legsConfigured', 'Các chặng chi tiết đã dựng ({legs} chặng, {stops} trạm dừng)', { legs: route?.legs?.length || 0, stops: route?.stops?.length || 0 })}
                      </span>
                      {route?.legs && route.legs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {route.legs.map((leg) => (
                            <span
                              key={leg.sequenceNo}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                leg.legType === 'flight'
                                  ? 'bg-[#FAF8F4] text-[#181A17] border-[#EAE5DA]'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {leg.legType === 'flight' ? '✈️ Bay: ' : '🚚 Xe: '}
                              {leg.legType === 'flight'
                                ? `${leg.flightNumber || 'Flight'} (${leg.departureAirportCode || 'SGN'} → ${leg.arrivalAirportCode || 'SIN'})`
                                : `${leg.vehiclePlate || (language === 'en' ? 'Truck' : 'Xe tải')}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic m-0 mt-1">{t('coordinator.routes.noLegsBuilt', 'Chưa có chặng nào được dựng. Vui lòng bấm "Dựng kế hoạch chi tiết".')}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredOrders.length === 0 && !isLoadingOrders && (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
                {t('coordinator.routes.noOrdersFound', 'Không tìm thấy đơn vận chuyển nào cần lập kế hoạch.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CORRIDOR CATALOG & MAP */}
      {activeTab === 'corridor_catalog' && (
        <div className="flex flex-col gap-6">
          {/* Interactive Free Route Search & Simulation Bar */}
          <div className="bg-white rounded-xl border border-[#EAE5DA] shadow-sm p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Compass className="text-[#A67C2E] shrink-0" size={20} />
                <span className="font-bold text-base text-slate-900">
                  {t('coordinator.routes.freeSimulationTitle', 'Công Cụ Tra Cứu & Mô Phỏng Lộ Trình Tự Do')}
                </span>
                <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <span>✨</span> {t('coordinator.routes.osrmBadge', 'Định tuyến đường bộ thực tế')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenSaveTemplateModal(true)}
                  className="bg-[#181A17] hover:bg-[#242722] text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                  title={t('coordinator.routes.saveCatalogTitle', 'Lưu lộ trình đang tra cứu thành tuyến mẫu trong Thư viện để tái sử dụng sau này')}
                >
                  <BookmarkPlus size={15} />
                  <span>{t('coordinator.routes.saveToCatalogBtn', 'Lưu Tuyến Này Vào Thư Viện')}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMap(!showMap)}
                  className="text-xs h-8"
                >
                  {showMap ? t('coordinator.routes.collapseMap', 'Thu gọn bản đồ') : t('coordinator.routes.expandMap', 'Mở bản đồ số')}
                </Button>
              </div>
            </div>

            {/* Origin & Destination Free Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-[#C4B38E] focus-within:bg-white transition-all shadow-sm">
                <span className="mr-2 text-base shrink-0">🟢</span>
                <div className="flex flex-col w-full">
                  <label htmlFor="sim-origin-input" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {t('coordinator.routes.originLabel', 'Điểm xuất phát')}
                  </label>
                  <input
                    id="sim-origin-input"
                    type="text"
                    value={searchOrigin}
                    onChange={(e) => setSearchOrigin(e.target.value)}
                    placeholder={t('coordinator.routes.originPlaceholder', 'Gõ địa chỉ hoặc trang trại (VD: Trang trại Củ Chi, Đà Lạt, Đà Nẵng...')}
                    className="text-xs font-bold text-slate-800 outline-none bg-transparent w-full"
                  />
                </div>
              </div>

              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-[#C4B38E] focus-within:bg-white transition-all shadow-sm">
                <span className="mr-2 text-base shrink-0">🏁</span>
                <div className="flex flex-col w-full">
                  <label htmlFor="sim-dest-input" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {t('coordinator.routes.destinationLabel', 'Điểm đến')}
                  </label>
                  <input
                    id="sim-dest-input"
                    type="text"
                    value={searchDestination}
                    onChange={(e) => setSearchDestination(e.target.value)}
                    placeholder={t('coordinator.routes.destinationPlaceholder', 'Gõ địa điểm đích (VD: Singapore Turf Club, Royal Bangkok, Sóc Sơn...')}
                    className="text-xs font-bold text-slate-800 outline-none bg-transparent w-full"
                  />
                </div>
              </div>
            </div>

            {/* Quick Suggestion Chips & Auto-Detected Scope Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5 border-t border-slate-100 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase">{t('coordinator.routes.quickSuggestions', 'Gợi ý nhanh:')}</span>
                {[
                  { label: language === 'en' ? 'HCMC ➔ Singapore' : 'TP.HCM ➔ Singapore', orig: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM', dest: 'Singapore Turf Club, Kranji, Singapore' },
                  { label: language === 'en' ? 'HCMC ➔ Bangkok' : 'TP.HCM ➔ Bangkok', orig: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM', dest: language === 'en' ? 'Royal Bangkok Sports Club, Bangkok, Thailand' : 'Royal Bangkok Sports Club, Bangkok, Thái Lan' },
                  { label: language === 'en' ? 'HCMC ➔ Malaysia' : 'TP.HCM ➔ Malaysia', orig: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM', dest: 'Selangor Turf Club, Kuala Lumpur, Malaysia' },
                  { label: language === 'en' ? 'HCMC ➔ Hanoi' : 'TP.HCM ➔ Hà Nội', orig: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM', dest: language === 'en' ? 'Soc Son Equestrian Farm, Hanoi' : 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội' },
                  { label: language === 'en' ? 'Da Lat ➔ HCMC' : 'Đà Lạt ➔ TP.HCM', orig: language === 'en' ? 'Da Lat Highlands Horse Farm, Lam Dong' : 'Trang trại Ngựa Cao nguyên Đà Lạt, Lâm Đồng', dest: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM' },
                  { label: language === 'en' ? 'Da Nang ➔ HCMC' : 'Đà Nẵng ➔ TP.HCM', orig: language === 'en' ? 'Da Nang Horse Training Center' : 'Trung tâm Huấn luyện Ngựa Đà Nẵng', dest: language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM' },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchOrigin(chip.orig);
                      setSearchDestination(chip.dest);
                      setTransportTypeChoice('auto');
                      toast.success(language === 'en' ? `Loaded corridor: ${chip.label}` : `Đã nạp hành lang: ${chip.label}`);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#FAF8F4] hover:text-[#181A17] text-slate-600 font-semibold border border-slate-200 transition-colors cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Automatic Corridor Scope Indicator */}
              {(() => {
                const isDom =
                  searchOrigin && searchDestination
                    ? buildEquineRoute(searchOrigin, searchDestination).isDomestic
                    : true;
                return (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      {t('coordinator.routes.scope', 'Phạm vi tuyến:')}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${
                        isDom
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-[#FAF8F4] text-[#181A17] border-[#D4C5A3]'
                      }`}
                    >
                      {isDom
                        ? language === 'en'
                          ? '🚚 Domestic Corridor'
                          : '🚚 Tuyến Nội Địa'
                        : language === 'en'
                        ? '✈️ International Corridor'
                        : '✈️ Tuyến Quốc Tế'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Map Canvas */}
            {showMap && (
              <div id="map-section" className="rounded-xl overflow-hidden border border-slate-200 mt-2">
                <RoutePlanningMap
                  originText={searchOrigin}
                  destinationText={searchDestination}
                  onApplyPreset={(preset) => {
                    setSearchOrigin(language === 'en' && preset.originEn ? preset.originEn : preset.origin);
                    setSearchDestination(language === 'en' && preset.destinationEn ? preset.destinationEn : preset.destination);
                    setTransportTypeChoice('auto');
                  }}
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
                <Layers className="text-[#A67C2E]" size={20} />
                <h2 className="text-lg font-bold text-slate-900 m-0">
                  {t('coordinator.routes.catalogTitle', 'Thư Viện Tuyến Đường Mẫu Chuẩn ({count})', { count: routes.length })}
                </h2>
              </div>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                {t('coordinator.routes.catalogSubtitle', 'Các tuyến đường đã được khảo sát & lưu trữ. Khi khách hàng mới có cùng lộ trình, bạn chỉ cần xem và áp dụng trực tiếp.')}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-60 shadow-sm">
                <Search size={14} className="text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  aria-label={t('coordinator.routes.catalogSearchPlaceholder', 'Tìm tuyến mẫu trong kho...')}
                  placeholder={t('coordinator.routes.catalogSearchPlaceholder', 'Tìm tuyến mẫu trong kho...')}
                  value={catalogSearchTerm}
                  onChange={(e) => setCatalogSearchTerm(e.target.value)}
                  className="border-none outline-none text-xs w-full bg-transparent font-medium"
                />
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleOpenSaveTemplateModal(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>{t('coordinator.routes.createNewTemplateBtn', 'Tạo Tuyến Mẫu Mới').replace(/^\+\s*/, '')}</span>
              </Button>
            </div>
          </div>

          {/* Catalog list cards */}
          <div className="flex flex-col gap-4">
            {(() => {
              const filteredCatalogRoutes = routes.filter(
                (r) =>
                  r.name.toLowerCase().includes(catalogSearchTerm.toLowerCase()) ||
                  r.origin.toLowerCase().includes(catalogSearchTerm.toLowerCase()) ||
                  r.destination.toLowerCase().includes(catalogSearchTerm.toLowerCase())
              );

              if (filteredCatalogRoutes.length === 0) {
                return (
                  <div className="p-10 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
                    {language === 'en'
                      ? 'No saved route templates match your search.'
                      : 'Không có tuyến đường mẫu nào khớp với tìm kiếm hoặc thư viện hiện đang trống.'}
                  </div>
                );
              }

              return filteredCatalogRoutes.map((route) => (
                <div
                  key={route.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:border-[#D4C5A3] transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 m-0">{route.name}</h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {translateStatus('available')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 m-0 flex flex-wrap items-center gap-2">
                        <span>{t('coordinator.routes.generalRoute', 'Lộ trình')}: <strong className="text-slate-700">{route.origin}</strong> ➔ <strong className="text-slate-700">{route.destination}</strong></span>
                        <span>•</span>
                        <span>{t('coordinator.routes.distanceLabel', 'Cự ly')}: <strong className="text-[#181A17] font-bold">{route.distanceKm} km</strong></span>
                        <span>•</span>
                        <span>{route.stops?.length || 0} {language === 'en' ? 'quarantine stops' : 'trạm dừng kiểm dịch'}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setViewingCatalogRoute(route)}
                        className="bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#181A17] border border-[#EAE5DA] font-semibold text-xs shadow-sm flex items-center gap-1"
                      >
                        <Eye size={14} />
                        <span>{t('coordinator.routes.viewDetailsBtn', 'Xem chi tiết')}</span>
                      </Button>

                      <Button
                        type="button"
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
                          toast.success(language === 'en' ? `Loaded route "${route.name}" on digital map!` : `Đã nạp lộ trình "${route.name}" lên bản đồ số!`);
                        }}
                        className="text-slate-700 hover:bg-slate-50 font-semibold text-xs shadow-sm flex items-center gap-1"
                      >
                        <MapPin size={14} className="text-[#A67C2E]" />
                        <span>{t('coordinator.routes.loadToMapBtn', 'Nạp lên bản đồ')}</span>
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
                          <span className="font-bold text-slate-500 text-[10px] uppercase">{t('coordinator.routes.stopNumber', 'Trạm #{seq}', { seq: stop.seq })}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              stop.type === 'Quarantine'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#F3EFE4] text-[#181A17]'
                            }`}
                          >
                            {stop.type === 'Quarantine' ? translateStopType('quarantine') : stop.type === 'Border Gate' ? translateStopType('border_check') : t('coordinator.routes.vetRestStop', 'Nghỉ thú y')}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 m-0 line-clamp-1">{stop.name}</p>
                        <p className="text-[11px] text-slate-400 m-0">{stop.country}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
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
            onClose={() => {
              if (!isSubmittingPlan) setIsDetailModalOpen(false);
            }}
            closeDisabled={isSubmittingPlan}
            title={
              isCompleted
                ? t('coordinator.routes.modalCompletedTitle', 'Chi Tiết Lộ Trình Vận Chuyển (Chuyến đi đã hoàn tất 🏁)')
                : isReadOnlyModal
                ? t('coordinator.routes.modalSafeViewTitle', 'Chi Tiết Kế Hoạch Lộ Trình (Chế độ xem an toàn)')
                : t('coordinator.routes.modalBuildPlanTitle', 'Xây Dựng / Hiệu Chỉnh Kế Hoạch Lộ Trình Chi Tiết')
            }
            subtitle={t('coordinator.routes.modalSubtitle', 'Đơn hàng: {code} • {horse} ({count} ngựa)', { code: selectedPlanningOrder.requestCode, horse: selectedPlanningOrder.horseName, count: selectedPlanningOrder.horseCount })}
            maxWidth="920px"
          >
            <div className="flex flex-col gap-6">
              <p className="rounded-lg bg-[#FAF8F4] p-3 font-semibold text-[#181A17] m-0 text-xs sm:text-sm">
                {bookingName(selectedPlanningOrder.bookingType)} · {selectedPlanningOrder.horseCount}{' '}
                {t('coordinator.stallsUnit', 'buồng')}
                {selectedPlanningOrder.transportMode
                  ? ` · ${
                      selectedPlanningOrder.transportMode === 'road'
                        ? t('manager.requests.modeRoad', language === 'en' ? 'Road Transit' : 'Đường bộ')
                        : t('manager.requests.modeAir', language === 'en' ? 'Air Cargo' : 'Hàng không')
                    }`
                  : ''}
              </p>
              {/* IN-TRANSIT & INCIDENT & APPROVAL & COMPLETED BANNERS */}
              {isCompleted ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl flex items-start gap-3 text-slate-800 shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm m-0 text-slate-900">
                      {t('coordinator.routes.bannerCompletedTitle', 'Chuyến đi đã cập bến đích an toàn — Khóa chỉnh sửa (Chế độ lưu trữ & đối soát)')}
                    </h4>
                    <p className="text-xs text-slate-600 m-0 mt-0.5">
                      {t('coordinator.routes.bannerCompletedDesc', 'Toàn bộ các chặng đường bộ và chặng bay đã hoàn thành. Kế hoạch lộ trình được lưu trữ nguyên trạng để phục vụ kiểm toán, đối soát chi phí và tra cứu lịch sử vận chuyển.')}
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
                          {t('coordinator.routes.bannerIncidentTitle', '🚨 Báo cáo sự cố từ tài xế')}
                        </span>
                        <span className="bg-rose-200 text-rose-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          {t('coordinator.routes.incidentTypeLabel', 'Loại')}: {translateIncident(activeIncident.incidentType)}
                        </span>
                      </div>
                      <p className="text-xs text-rose-950 m-0 mt-1 font-semibold">
                        {activeIncident.description}
                      </p>
                      <p className="text-[11px] text-rose-700 m-0 mt-0.5">
                        {t('coordinator.routes.incidentReportedAt', 'Thời gian báo: ')}{new Date(activeIncident.reportedAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
                      </p>
                    </div>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="text-xs font-extrabold text-rose-700 block">
                      {t('coordinator.routes.emergencyRerouteUnlocked', 'ĐÃ MỞ QUYỀN HIỆU CHỈNH CHẶNG KHẨN CẤP')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {t('coordinator.routes.emergencyRerouteDesc', 'Bạn có thể sửa chặng hoặc trạm dừng để vòng tránh sự cố')}
                    </span>
                  </div>
                </div>
              ) : isReadOnlyModal ? (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-start gap-3 text-emerald-950 shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm m-0 text-emerald-900">
                      {t('coordinator.routes.bannerApprovedTitle', 'Kế hoạch lộ trình đã được Logistics Manager phê duyệt — Chế độ xem an toàn')}
                    </h4>
                    <p className="text-xs text-emerald-800 m-0 mt-0.5">
                      {t('coordinator.routes.bannerApprovedDesc', 'Lộ trình này đã được phê duyệt chính thức và khóa chỉnh sửa để phục vụ điều phối và vận chuyển. Hệ thống chỉ mở lại quyền hiệu chỉnh khi có báo cáo sự cố.')}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* 1. Manager Framework Banner */}
              <div className="p-4 bg-[#FAF8F4] border border-[#D4C5A3] rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[#181A17] font-extrabold text-xs uppercase tracking-wide">
                <ShieldCheck size={16} className="text-[#A67C2E]" />
                {t('coordinator.routes.managerComplianceTitle', 'Khung Định Hướng Của Logistics Manager (Cần tuân thủ)')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('coordinator.routes.managerVehicleChoice', 'Loại xe Manager chọn:')}</span>
                  <strong className="text-[#181A17]">
                    {selectedPlanningOrder.routeDetail?.managerVehicleType
                      ? translateVehicleType(selectedPlanningOrder.routeDetail.managerVehicleType)
                      : translateVehicleType('truck')}
                  </strong>
                </div>
                {selectedPlanningOrder.transportMode !== 'road' && selectedPlanningOrder.routeDetail?.managerAirlineName && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('coordinator.routes.airline', 'Hãng hàng không:')}</span>
                    <strong className="text-[#181A17]">
                      {selectedPlanningOrder.routeDetail.managerAirlineName}
                    </strong>
                  </div>
                )}
                {selectedPlanningOrder.transportMode !== 'road' &&
                  selectedPlanningOrder.routeDetail?.managerDepartureAirportCode &&
                  selectedPlanningOrder.routeDetail?.managerArrivalAirportCode && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('coordinator.routes.airportPair', 'Cặp Sân bay:')}</span>
                    <strong className="text-[#181A17]">
                      {selectedPlanningOrder.routeDetail.managerDepartureAirportCode} → {selectedPlanningOrder.routeDetail.managerArrivalAirportCode}
                    </strong>
                  </div>
                )}
              </div>
              {selectedPlanningOrder.routeDetail?.strategicNotes && (
                <div className="text-[11px] text-slate-600 italic border-t border-[#EAE5DA] pt-1.5 mt-0.5">
                  {t('coordinator.routes.managerNotes', 'Ghi chú của Manager:')} &quot;{selectedPlanningOrder.routeDetail.strategicNotes}&quot;
                </div>
              )}
            </div>

            {/* 1b. Coordinator Flexibility & Template Tools */}
            {!isReadOnlyModal && (
              <div className="p-4 bg-gradient-to-r from-slate-50 to-[#FAF8F4] border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wide">
                      <Compass size={15} className="text-[#A67C2E]" />
                      {t('coordinator.routes.coordinatorSetupMode', 'Chế Độ Thiết Lập Tuyến Cho Điều Phối Viên')}
                    </div>
                    <p className="text-[11px] text-slate-600 m-0 mt-1">
                      <strong>{language === 'en' ? 'Pickup:' : 'Điểm đón:'}</strong> {selectedPlanningOrder.origin}{' '}
                      <span className="text-[#A67C2E] font-bold">➔</span>{' '}
                      <strong>{language === 'en' ? 'Destination:' : 'Điểm đến:'}</strong> {selectedPlanningOrder.destination}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applySmartRouteSuggestion(selectedPlanningOrder, 'air', true)}
                      className="text-xs text-[#181A17] border-[#D4C5A3] bg-white hover:bg-[#FAF5EB] flex items-center gap-1 font-bold shadow-sm"
                    >
                      <Plane size={12} className="text-[#A67C2E]" />
                      <span>{language === 'en' ? 'Suggest Air + Road' : 'Gợi ý Bay + Đường bộ'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applySmartRouteSuggestion(selectedPlanningOrder, 'road', true)}
                      className="text-xs text-emerald-800 border-emerald-300 bg-white hover:bg-emerald-50 flex items-center gap-1 font-bold shadow-sm"
                    >
                      <Truck size={12} className="text-emerald-700" />
                      <span>{language === 'en' ? 'Suggest Road Only' : 'Gợi ý Đường bộ'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetToManualForm}
                      className="text-xs text-slate-700 border-slate-300 hover:bg-white flex items-center gap-1 font-semibold shadow-sm"
                      title={t('coordinator.routes.resetFormTitle', 'Thiết lập lại form để tự do điền thông số từ đầu')}
                    >
                      <RotateCcw size={12} />
                      <span>{t('coordinator.routes.resetToManualBtn', 'Làm Mới / Tự Điền')}</span>
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
                                <span>{t('coordinator.routes.templateMatchFound', 'Phát hiện Tuyến Mẫu Trùng Điểm Đi & Điểm Đến:')}</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-extrabold text-[11px]">
                                  {matchedTemplate.name}
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-800 m-0 mt-0.5">
                                {t('coordinator.routes.templateDistanceLabel', 'Cự ly mẫu: {km} km • {stops} trạm dừng kiểm dịch chuẩn hóa.', { km: matchedTemplate.distanceKm, stops: matchedTemplate.stops?.length || 0 })}
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
                            <span>{t('coordinator.routes.syncThisTemplateBtn', '⚡ Đồng Bộ Tuyến Mẫu Này')}</span>
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <BookmarkPlus size={14} className="text-[#A67C2E] shrink-0" />
                          <span className="font-bold text-slate-700 whitespace-nowrap">
                            {t('coordinator.routes.orApplyOtherTemplate', 'Hoặc áp dụng tuyến mẫu khác từ Thư viện:')}
                          </span>
                        </div>
                        <select
                          aria-label={t('coordinator.routes.orApplyOtherTemplate', 'Chọn tuyến mẫu từ thư viện')}
                          onChange={(e) => {
                            const tpl = routes.find((r) => r.id === e.target.value);
                            if (tpl) handleApplyTemplate(tpl);
                          }}
                          defaultValue=""
                          className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold outline-none flex-1 max-w-md"
                        >
                          <option value="" disabled>
                            {t('coordinator.routes.selectTemplatePlaceholder', '-- Chọn một tuyến mẫu trong thư viện ({count} tuyến) --', { count: routes.length })}
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
                <label htmlFor="plan-route-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  {t('coordinator.routes.planRouteNameLabel', 'Tên Lộ Trình Vận Chuyển')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="plan-route-name"
                  type="text"
                  disabled={isReadOnlyModal}
                  value={planRouteName}
                  onChange={(e) => setPlanRouteName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:border-[#C4B38E] outline-none disabled:bg-slate-50 disabled:text-slate-600"
                  placeholder={t('coordinator.routes.planRouteNamePlaceholder', 'Ví dụ: Hành lang Củ Chi - Tân Sơn Nhất - Singapore Turf Club')}
                />
              </div>
              <div>
                <label htmlFor="plan-total-distance" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  {t('coordinator.routes.totalEstDistanceKm', 'Tổng cự ly dự kiến (km)')}
                </label>
                <input
                  id="plan-total-distance"
                  type="number"
                  disabled={isReadOnlyModal}
                  value={planTotalDistanceKm}
                  onChange={(e) => setPlanTotalDistanceKm(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:border-[#C4B38E] outline-none disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>
            </div>

            {/* 3. Multi-modal Legs Builder */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <Navigation size={16} className="text-[#A67C2E]" />
                    {t('coordinator.routes.multimodalLegsTitle', 'Các Chặng Vận Chuyển Đa Phương Thức (Đường bộ / Đường bay)')}
                  </h4>
                  <p className="text-xs text-slate-500 m-0">
                    {t('coordinator.routes.multimodalLegsSubtitle', 'Điều phối viên chọn xe có biển số cụ thể và nhập thông tin đặt chỗ chuyến bay thực tế.')}
                  </p>
                </div>
                {!isReadOnlyModal && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddLeg('road')}
                      className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <Truck size={13} className="mr-1" /> {t('coordinator.routes.addRoadLegBtn', 'Thêm Chặng Đường Bộ').replace(/^\+\s*/, '')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddLeg('flight')}
                      className="text-xs text-[#181A17] border-[#D4C5A3] hover:bg-[#FAF8F4]"
                    >
                      <Plane size={13} className="mr-1" /> {t('coordinator.routes.addFlightLegBtn', 'Thêm Chặng Bay').replace(/^\+\s*/, '')}
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
                        ? 'bg-[#FAF8F4] border-[#D4C5A3]'
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
                              ? 'bg-[#F3EFE4] text-[#181A17]'
                              : 'bg-emerald-200 text-emerald-900'
                          }`}
                        >
                          {leg.legType === 'flight' ? t('coordinator.routes.flightLegTitle', '✈️ Chặng Đường Hàng Không') : t('coordinator.routes.roadLegTitle', '🚚 Chặng Đường Bộ')}
                        </span>
                      </div>
                      {!isReadOnlyModal && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLeg(idx)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={13} /> {t('coordinator.routes.deleteLegBtn', 'Xóa chặng')}
                        </button>
                      )}
                    </div>

                    {(() => {
                      const firstFlightIndex = legs.findIndex((l) => l.legType === 'flight');
                      const isOverseasConsigneeRoadLeg =
                        leg.legType === 'road' &&
                        ((firstFlightIndex !== -1 && idx > firstFlightIndex) ||
                          Boolean(
                            leg.vehiclePlate &&
                              (leg.vehiclePlate.includes('đến đón') ||
                                leg.vehiclePlate.includes('đến rước') ||
                                leg.vehiclePlate.includes('Consignee') ||
                                leg.vehiclePlate.includes('pickup'))
                          ));
                      return (
                        leg.legType === 'road' &&
                        !isOverseasConsigneeRoadLeg && (
                          <RoadTripPicker
                            leg={leg}
                            bookingType={selectedPlanningOrder.bookingType}
                            readOnly={isReadOnlyModal}
                            language={language}
                            onChange={(next) =>
                              setLegs((current) => current.map((item, index) => (index === idx ? next : item)))
                            }
                          />
                        )
                      );
                    })()}
                    <fieldset disabled={isReadOnlyModal || Boolean(leg.roadTripId)} className="m-0 p-0 border-0">
                    {/* Road Leg details */}
                    {leg.legType === 'road' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.vehicleDedicated', 'Phương Tiện / Xe Chuyên Dụng *')}</label>
                          {(() => {
                            const destClean = (leg.destinationLocation || selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
                            const receiverOption = leg.vehiclePlate && (leg.vehiclePlate.includes('đến đón') || leg.vehiclePlate.includes('đến rước'))
                              ? leg.vehiclePlate
                              : (language === 'en' ? `Vehicle from ${destClean} - Consignee pickup` : `Xe từ ${destClean} đến đón (Bên nhận tự rước)`);
                            const isOverseasOrLastMile = leg.sequenceNo > 1 || legs.some((l) => l.legType === 'flight');

                            return (
                              <>
                                <select
                                  value={leg.vehiclePlate ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const matchedVehicle = vehicles.find((v) => v.code === val);
                                    const parsed = matchedVehicle ? Number(String(matchedVehicle.id).replace(/\D/g, '')) : NaN;
                                    const resolvedVehicleId = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
                                    setLegs((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              vehiclePlate: val,
                                              vehicleId: resolvedVehicleId,
                                              roadTripId: resolvedVehicleId ? item.roadTripId : null,
                                            }
                                          : item
                                      )
                                    );
                                  }}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 text-xs disabled:bg-slate-50"
                                >
                                  <option value="">{t('coordinator.routes.selectVehiclePlaceholder', '-- Chọn xe / phương tiện --')}</option>
                                  {isOverseasOrLastMile && (
                                    <optgroup label={t('coordinator.routes.overseasVehicleGroup', 'Phương tiện địa điểm đích (Nước ngoài)')}>
                                      <option value={receiverOption}>
                                        🚗 {receiverOption}
                                      </option>
                                    </optgroup>
                                  )}
                                  <optgroup label={t('coordinator.routes.domesticFleetGroup', 'Đội xe chuyên dụng nội bộ (Việt Nam)')}>
                                    {(() => {
                                      const availableRoadFleet = vehicles
                                        .filter((v) => !v.type?.toLowerCase().includes('air'))
                                        .filter((v) => {
                                          const isCurrentLegVehicle = v.code === leg.vehiclePlate;
                                          const isCurrentTripVehicle =
                                            Boolean(v.assignedTripCode) &&
                                            v.assignedTripCode === selectedPlanningOrder?.requestCode;
                                          const isInTransport =
                                            (v.status === 'in_use' || Boolean(v.assignedTripCode)) &&
                                            !isCurrentLegVehicle &&
                                            !isCurrentTripVehicle;
                                          // Ẩn các xe đang trong quá trình vận chuyển chuyến khác
                                          return !isInTransport;
                                        });

                                      if (availableRoadFleet.length === 0) {
                                        return (
                                          <option disabled value="">
                                            {language === 'en'
                                              ? '⚠️ All specialized vehicles are currently in transit'
                                              : '⚠️ Tất cả xe chuyên dụng đều đang trong quá trình vận chuyển'}
                                          </option>
                                        );
                                      }

                                      const requiredStalls = Math.max(1, Number(selectedPlanningOrder?.horseCount || 1));

                                      return availableRoadFleet.map((v) => {
                                        const isUnderCapacity = Number(v.capacity || 0) < requiredStalls;
                                        const isCurrentTrip =
                                          v.code === leg.vehiclePlate ||
                                          (Boolean(v.assignedTripCode) && v.assignedTripCode === selectedPlanningOrder?.requestCode);
                                        return (
                                          <option key={v.id} value={v.code} disabled={Boolean(isUnderCapacity)}>
                                            {v.code} — {translateVehicleType(v.type)} ({v.capacity} stall, {v.location}){' '}
                                            {isUnderCapacity
                                              ? `— ⚠️ ${language === 'en' ? `Insufficient stalls (${v.capacity}/${requiredStalls})` : `Không đủ chuồng (${v.capacity}/${requiredStalls} ngựa)`}`
                                              : isCurrentTrip && v.status === 'in_use'
                                              ? `— (${language === 'en' ? 'In use for this trip' : 'Đang dùng cho chuyến này'})`
                                              : `— ${language === 'en' ? 'Available' : 'Sẵn sàng'}`}
                                          </option>
                                        );
                                      });
                                    })()}
                                  </optgroup>
                                </select>
                                {leg.vehiclePlate && (leg.vehiclePlate.includes('đến đón') || leg.vehiclePlate.includes('đến rước') || leg.vehiclePlate.includes('pickup') || leg.vehiclePlate.includes('Consignee')) && (
                                  <p className="mt-1 text-[11px] text-[#181A17] bg-[#FAF8F4] px-2 py-1 rounded border border-[#EAE5DA]">
                                    {t('coordinator.routes.overseasNotice', 'ℹ️ Chặng nước ngoài: Bên nhận tự điều xe đến đón tại sân bay (không yêu cầu xe nội bộ).')}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.legOriginLabel', 'Điểm Xuất Phát Chặng')}</label>
                          <AddressAutocompleteInput
                            id={`leg-road-origin-${idx}`}
                            value={leg.originLocation}
                            icon="origin"
                            language={language}
                            placeholder={t('coordinator.routes.legOriginLabel', 'Điểm Xuất Phát Chặng')}
                            onChangeText={(val) => {
                              const targetSeq = leg.sequenceNo - 1;
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) return applyAutoDistanceToLeg({ ...item, originLocation: val });
                                  if (item.sequenceNo === targetSeq && item.legType === 'flight') {
                                    const arrMeta = resolveAirportMeta(val, item.arrivalAirportId, item.arrivalAirportCode, false);
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val,
                                      arrivalAirportId: arrMeta.airportId,
                                      arrivalAirportCode: arrMeta.iataCode,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onSelectSuggestion={(val, geo: GeocodedLocation) => {
                              if (geo?.coords) {
                                endpointCoordsRef.current[val.trim().toLowerCase()] = geo.coords;
                              }
                              const targetSeq = leg.sequenceNo - 1;
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) return applyAutoDistanceToLeg({ ...item, originLocation: val });
                                  if (item.sequenceNo === targetSeq && item.legType === 'flight') {
                                    const arrMeta = resolveAirportMeta(val, item.arrivalAirportId, item.arrivalAirportCode, false);
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val,
                                      arrivalAirportId: arrMeta.airportId,
                                      arrivalAirportCode: arrMeta.iataCode,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onBlur={() => triggerAsyncGeocodeForLeg(idx, leg.originLocation, leg.destinationLocation)}
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.legDestLabel', 'Điểm Đến Chặng')}</label>
                          <AddressAutocompleteInput
                            id={`leg-road-dest-${idx}`}
                            value={leg.destinationLocation}
                            icon="destination"
                            language={language}
                            placeholder={t('coordinator.routes.legDestLabel', 'Điểm Đến Chặng')}
                            onChangeText={(val) => {
                              const targetSeq = leg.sequenceNo + 1;
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) return applyAutoDistanceToLeg({ ...item, destinationLocation: val });
                                  if (item.sequenceNo === targetSeq && item.legType === 'flight') {
                                    const cleanOrigin = val.replace(' Cargo Terminal', '');
                                    const depMeta = resolveAirportMeta(cleanOrigin, item.departureAirportId, item.departureAirportCode, true);
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      originLocation: cleanOrigin,
                                      departureAirportId: depMeta.airportId,
                                      departureAirportCode: depMeta.iataCode,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onSelectSuggestion={(val, geo: GeocodedLocation) => {
                              if (geo?.coords) {
                                endpointCoordsRef.current[val.trim().toLowerCase()] = geo.coords;
                              }
                              const targetSeq = leg.sequenceNo + 1;
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) return applyAutoDistanceToLeg({ ...item, destinationLocation: val });
                                  if (item.sequenceNo === targetSeq && item.legType === 'flight') {
                                    const cleanOrigin = val.replace(' Cargo Terminal', '');
                                    const depMeta = resolveAirportMeta(cleanOrigin, item.departureAirportId, item.departureAirportCode, true);
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      originLocation: cleanOrigin,
                                      departureAirportId: depMeta.airportId,
                                      departureAirportCode: depMeta.iataCode,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onBlur={() => triggerAsyncGeocodeForLeg(idx, leg.originLocation, leg.destinationLocation)}
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.legDistKm', 'Khoảng cách chặng (km)')}</label>
                          <input
                            type="number"
                            value={leg.distanceKm || 0}
                            onChange={(e) => {
                              const num = Number(e.target.value);
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => (i === idx ? { ...item, distanceKm: num } : item));
                                setPlanTotalDistanceKm(sumLegsDistanceKm(updated, planTotalDistanceKm));
                                return updated;
                              });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.legDurationHours', 'Thời gian chạy dự kiến (giờ)')}</label>
                          <input
                            type="number"
                            step="0.5"
                            value={leg.durationHours || 0}
                            onChange={(e) => {
                              const num = Number(e.target.value);
                              setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, durationHours: num } : item)));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:bg-slate-50"
                          />
                        </div>
                      </div>
                    )}

                    </fieldset>
                    <LegScheduleFields leg={leg} readOnly={isReadOnlyModal} language={language} onChange={next => setLegs(current => current.map((item, index) => index === idx ? next : item))} />
                    {/* Flight Leg details */}
                    {leg.legType === 'flight' && (
                      <fieldset disabled={isReadOnlyModal} className="m-0 p-0 border-0">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.airlineLabel', 'Hãng Hàng Không *')}</label>
                          <select
                            value={leg.airlineName || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const airlineMeta = resolveAirlineMeta(val, selectedPlanningOrder);
                              setLegs((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, airlineName: val, airlineId: airlineMeta.airlineId } : item
                                )
                              );
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 disabled:bg-slate-50"
                          >
                            <option value="">{t('coordinator.routes.selectAirlinePlaceholder', '-- Chọn hãng bay --')}</option>
                            {airlines.map((a) => (
                              <option key={a.id} value={a.name}>
                                {a.name} ({a.code})
                              </option>
                            ))}
                            {leg.airlineName && !airlines.some((a) => a.name === leg.airlineName) && (
                              <option value={leg.airlineName}>{leg.airlineName}</option>
                            )}
                            {airlines.length === 0 && (
                              <>
                                <option value="Cathay Pacific Cargo (CX)">Cathay Pacific Cargo (CX)</option>
                                <option value="Singapore Airlines Cargo">Singapore Airlines Cargo (SQ)</option>
                                <option value="Emirates SkyCargo">Emirates SkyCargo (EK)</option>
                                <option value="Qatar Airways Cargo">Qatar Airways Cargo (QR)</option>
                                <option value="Vietnam Airlines Cargo">Vietnam Airlines Cargo (VN)</option>
                              </>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.flightNumberLabel', 'Số Hiệu Chuyến Bay *')}</label>
                          <input
                            type="text"
                            placeholder={t('coordinator.routes.flightNumberPlaceholder', 'Ví dụ: SQ711 hoặc EK981')}
                            value={leg.flightNumber || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, flightNumber: val } : item)));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.bookingRefLabel', 'Mã Đặt Chỗ (AWB)')}</label>
                          <input
                            type="text"
                            placeholder={t('coordinator.routes.bookingRefPlaceholder', 'Ví dụ: BK-SQ-88192')}
                            value={leg.bookingReference || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, bookingReference: val } : item)));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.depAirportLabel', 'Sân bay cất cánh')}</label>
                          <AddressAutocompleteInput
                            id={`leg-air-origin-${idx}`}
                            value={leg.originLocation}
                            icon="origin"
                            language={language}
                            placeholder={t('coordinator.routes.depAirportPlaceholder', 'Ví dụ: Sân bay Tân Sơn Nhất (SGN)')}
                            onChangeText={(val) => {
                              const prevSeq = leg.sequenceNo - 1;
                              const depMeta = resolveAirportMeta(val, leg.departureAirportId, leg.departureAirportCode, true);
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      originLocation: val,
                                      departureAirportId: depMeta.airportId,
                                      departureAirportCode: depMeta.iataCode,
                                    });
                                  }
                                  if (item.sequenceNo === prevSeq && item.legType === 'road') {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val.includes('Cargo') ? val : `${val} Cargo Terminal`,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onSelectSuggestion={(val, geo: GeocodedLocation) => {
                              if (geo?.coords) {
                                endpointCoordsRef.current[val.trim().toLowerCase()] = geo.coords;
                              }
                              const prevSeq = leg.sequenceNo - 1;
                              const depMeta = resolveAirportMeta(val, leg.departureAirportId, leg.departureAirportCode, true);
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      originLocation: val,
                                      departureAirportId: depMeta.airportId,
                                      departureAirportCode: depMeta.iataCode,
                                    });
                                  }
                                  if (item.sequenceNo === prevSeq && item.legType === 'road') {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val.includes('Cargo') ? val : `${val} Cargo Terminal`,
                                    });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onBlur={() => triggerAsyncGeocodeForLeg(idx, leg.originLocation, leg.destinationLocation)}
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.arrAirportLabel', 'Sân bay hạ cánh')}</label>
                          <AddressAutocompleteInput
                            id={`leg-air-dest-${idx}`}
                            value={leg.destinationLocation}
                            icon="destination"
                            language={language}
                            placeholder={t('coordinator.routes.arrAirportPlaceholder', 'Ví dụ: Sân bay Changi (SIN Cargo Terminal)')}
                            onChangeText={(val) => {
                              const nextSeq = leg.sequenceNo + 1;
                              const arrMeta = resolveAirportMeta(val, leg.arrivalAirportId, leg.arrivalAirportCode, false);
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val,
                                      arrivalAirportId: arrMeta.airportId,
                                      arrivalAirportCode: arrMeta.iataCode,
                                    });
                                  }
                                  if (item.sequenceNo === nextSeq && item.legType === 'road') {
                                    return applyAutoDistanceToLeg({ ...item, originLocation: val });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onSelectSuggestion={(val, geo: GeocodedLocation) => {
                              if (geo?.coords) {
                                endpointCoordsRef.current[val.trim().toLowerCase()] = geo.coords;
                              }
                              const nextSeq = leg.sequenceNo + 1;
                              const arrMeta = resolveAirportMeta(val, leg.arrivalAirportId, leg.arrivalAirportCode, false);
                              setLegs((prev) => {
                                const updated = prev.map((item, i) => {
                                  if (i === idx) {
                                    return applyAutoDistanceToLeg({
                                      ...item,
                                      destinationLocation: val,
                                      arrivalAirportId: arrMeta.airportId,
                                      arrivalAirportCode: arrMeta.iataCode,
                                    });
                                  }
                                  if (item.sequenceNo === nextSeq && item.legType === 'road') {
                                    return applyAutoDistanceToLeg({ ...item, originLocation: val });
                                  }
                                  return item;
                                });
                                setPlanTotalDistanceKm((cur) => sumLegsDistanceKm(updated, cur));
                                return updated;
                              });
                            }}
                            onBlur={() => triggerAsyncGeocodeForLeg(idx, leg.originLocation, leg.destinationLocation)}
                          />
                        </div>
                        <div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.stallsBookedLabel', 'Stall Đã Book')}</label>
                              <input
                                type="number"
                                min={1}
                                value={leg.stallsBooked || selectedPlanningOrder.horseCount}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, stallsBooked: num } : item)));
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.legDistKm', 'Cự ly bay (km)')}</label>
                              <input
                                type="number"
                                min={50}
                                value={leg.distanceKm || 1150}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  setLegs((prev) => {
                                    const updated = prev.map((item, i) => (i === idx ? { ...item, distanceKm: num } : item));
                                    setPlanTotalDistanceKm(sumLegsDistanceKm(updated, planTotalDistanceKm));
                                    return updated;
                                  });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.flightHoursLabel', 'Giờ bay (h)')}</label>
                              <input
                                type="number"
                                step="0.5"
                                value={leg.durationHours || 2.5}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, durationHours: num } : item)));
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      </fieldset>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Stops & Quarantine Stations Catalog */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-amber-600" />
                    {t('coordinator.routes.stopsTitle', 'Trạm Dừng Nghỉ, Kiểm Dịch & Cửa Khẩu')}
                  </h4>
                  <p className="text-xs text-slate-500 m-0">
                    {t('coordinator.routes.stopsSubtitle', 'Bổ sung các trạm kiểm tra thú y và trạm nạp nước / cỏ khô dọc tuyến (tự điền hoặc chọn mẫu).')}
                  </p>
                </div>
                {!isReadOnlyModal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddStop()}
                    className="text-xs text-amber-900 border-amber-300 hover:bg-amber-100 flex items-center gap-1 font-bold shadow-sm"
                  >
                    <Plus size={13} /> {t('coordinator.routes.addNewStopBtn', 'Thêm Trạm Mới (Tự Điền)').replace(/^\+\s*/, '')}
                  </Button>
                )}
              </div>

              {/* Stops Table */}
              <fieldset disabled={isReadOnlyModal} className="m-0 p-0 border-0">
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[620px]">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">{t('coordinator.routes.stopNameCol', 'Tên Trạm / Điểm Kiểm Dịch')}</th>
                      <th className="p-2.5 w-36">{t('coordinator.routes.stopTypeCol', 'Loại Trạm')}</th>
                      <th className="p-2.5 w-32">{t('coordinator.routes.countryCol', 'Quốc Gia')}</th>
                      <th className="p-2.5 w-16 text-center">{t('common.delete', 'Xóa')}</th>
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
                            disabled={isReadOnlyModal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, locationName: val } : item))
                              );
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-medium disabled:bg-slate-50 disabled:text-slate-600"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={stop.stopType}
                            disabled={isReadOnlyModal}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, stopType: val } : item))
                              );
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-semibold disabled:bg-slate-50 disabled:text-slate-600"
                          >
                            <option value="rest">{translateStopType('rest')}</option>
                            <option value="quarantine">{translateStopType('quarantine')}</option>
                            <option value="border_check">{translateStopType('border_check')}</option>
                            <option value="transfer_hub">{language === 'en' ? 'Shared Consolidation Hub (Transfer Hub)' : 'Điểm đón/trả ghép (Transfer Hub)'}</option>
                            <option value="refuel">{translateStopType('refuel')}</option>
                            <option value="other">{translateStopType('other')}</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={stop.country ?? ''}
                            placeholder={language === 'en' ? 'Country...' : 'Nhập quốc gia...'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, country: val } : item))
                              );
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
                              aria-label={language === 'en' ? `Delete stop ${stop.sequenceNo}` : `Xóa trạm #${stop.sequenceNo}`}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
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
              </fieldset>
            </div>

            {/* 5. Dispatch Instructions & Notes */}
            <div>
              <label htmlFor="plan-operational-notes" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.routes.operationalNotesLabel', 'Hướng dẫn vận hành & Chăm sóc ngựa trên đường')}
              </label>
              <textarea
                id="plan-operational-notes"
                rows={2}
                value={notes}
                disabled={isReadOnlyModal}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('coordinator.routes.operationalNotesPlaceholder', 'Nhiệt độ khoang xe, lịch tiêm/kiểm tra thú y FEI, hướng dẫn bàn giao tại cửa khẩu...')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:border-[#181A17] outline-none resize-none disabled:bg-slate-50 disabled:text-slate-600"
              />
            </div>
            </div>

          {/* Sticky Modal Actions Footer */}
          {(() => {
            if (isReadOnlyModal) {
              return (
                <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 z-10">
                  <span className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                    {t('coordinator.routes.planApprovedSafeView', 'Kế hoạch đã được phê duyệt. Đang hiển thị ở chế độ xem an toàn (Khóa chỉnh sửa).')}
                  </span>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setIsDetailModalOpen(false)}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 text-xs whitespace-nowrap"
                    >{t('common.close', 'Đóng')}</Button>
                  </div>
                </div>
              );
            }

            if (activeIncident) {
              return (
                <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-rose-50/95 backdrop-blur-sm border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 z-10">
                  <span className="text-xs text-rose-900 font-semibold flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-rose-600 shrink-0" />
                    {t('coordinator.routes.incidentRerouteNotice', 'Đang hiệu chỉnh lộ trình thay thế do sự cố trên đường. Lộ trình mới sẽ được gửi đến Logistics Manager duyệt lại.')}
                  </span>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailModalOpen(false)}
                      disabled={isSubmittingPlan}
                      className="border-slate-300 text-slate-600 hover:bg-white font-medium px-4 py-2 text-xs"
                    >
                      {t('common.cancel', 'Hủy bỏ')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleResolveIncidentOnly(activeIncident.id)}
                      disabled={isSubmittingPlan}
                      className="border-rose-300 text-rose-700 bg-white hover:bg-rose-50 font-semibold px-3 py-2 text-xs"
                    >
                      {t('coordinator.routes.markIncidentResolvedBtn', 'Đánh dấu hết sự cố')}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void handleSaveEmergencyReroute(true)}
                      disabled={isSubmittingPlan || legs.length === 0}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 shadow-sm text-xs flex items-center gap-1.5"
                    >
                      <Send size={14} />
                      <span>{isSubmittingPlan ? t('coordinator.routes.submittingApproval', 'Đang gửi duyệt...') : t('coordinator.routes.saveRerouteSubmitBtn', 'Lưu Lộ Trình Mới & Gửi Manager Duyệt')}</span>
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-end gap-3 mt-4 z-10">
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDetailModalOpen(false)}
                    disabled={isSubmittingPlan}
                    className="border-slate-300 text-slate-600 hover:bg-slate-50 font-medium px-4 py-2 text-xs whitespace-nowrap"
                  >{t('common.close', 'Đóng')}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSaveDraft()}
                    disabled={isSubmittingPlan}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold px-4 py-2 text-xs whitespace-nowrap"
                  >
                    {t('coordinator.routes.saveDraftBtn', 'Lưu Bản Nháp')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSubmitForApproval()}
                    disabled={isSubmittingPlan || legs.length === 0}
                    className="bg-[#181A17] hover:bg-[#242722] text-white font-bold px-5 py-2 shadow-sm text-xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Send size={14} />
                    <span>{isSubmittingPlan ? t('coordinator.routes.submittingApproval', 'Đang gửi duyệt...') : t('coordinator.routes.submitForApprovalBtn', 'Gửi Duyệt Cho Manager')}</span>
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
          title={t('coordinator.routes.catalogDetailTitle', 'Chi Tiết Tuyến Đường Mẫu')}
          subtitle={t('coordinator.routes.catalogDetailSub', 'Hành lang chuẩn hóa: {name}', { name: viewingCatalogRoute.name })}
          maxWidth="720px"
        >
          <div className="flex flex-col gap-5">
            {/* Overview Card */}
            <div className="p-4 bg-gradient-to-r from-[#FAF8F4] to-[#FAF8F4] border border-[#EAE5DA] rounded-xl flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-[#181A17] flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-[#A67C2E]" />
                  {t('coordinator.routes.validatedCorridorBadge', 'Hành Lang Vận Chuyển Đã Kiểm Chuẩn')}
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {t('coordinator.routes.catalogStatusActive', 'Trạng thái: Hoạt động')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('coordinator.routes.originStationLabel', 'Điểm xuất phát:')}</span>
                  <strong className="text-slate-800 text-sm">{viewingCatalogRoute.origin}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('coordinator.routes.destStationLabel', 'Điểm đích đến:')}</span>
                  <strong className="text-slate-800 text-sm">{viewingCatalogRoute.destination}</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-xs border-t border-[#EAE5DA] pt-2 text-slate-700">
                <div>
                  {t('coordinator.routes.estDistLabel', 'Cự ly ước tính:')} <strong className="text-[#181A17] font-bold">{viewingCatalogRoute.distanceKm} km</strong>
                </div>
                <div>
                  {t('coordinator.routes.totalStopsLabel', 'Tổng số trạm dừng:')} <strong className="text-[#181A17] font-bold">{viewingCatalogRoute.stops?.length || 0} {language === 'en' ? 'stops' : 'trạm'}</strong>
                </div>
              </div>
            </div>

            {/* Stops list table */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider m-0">
                {t('coordinator.routes.stopsListHeading', 'Danh Sách Các Điểm Dừng Chân, Kiểm Dịch & Cửa Khẩu:')}
              </h4>

              <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-xs text-left min-w-[560px]">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 w-14 text-center">{t('coordinator.routes.seqCol', 'Thứ tự')}</th>
                      <th className="p-2.5">{t('coordinator.routes.stopNameCol', 'Tên Trạm / Điểm Kiểm Dịch')}</th>
                      <th className="p-2.5 w-36">{t('coordinator.routes.natureCol', 'Tính Chất Trạm')}</th>
                      <th className="p-2.5 w-32">{t('coordinator.routes.countryRegionCol', 'Quốc Gia / Khu Vực')}</th>
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
                                : 'bg-[#F3EFE4] text-[#181A17]'
                            }`}
                          >
                            {stop.type === 'Quarantine' ? translateStopType('quarantine') : stop.type === 'Border Gate' ? translateStopType('border_check') : translateStopType('rest')}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 font-medium">{stop.country}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sticky Actions */}
            <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2 z-10">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRouteToDelete(viewingCatalogRoute);
                }}
                className="text-red-600 border-red-200 hover:bg-red-50 text-xs font-semibold"
              >
                <Trash2 size={13} className="mr-1" />
                {t('coordinator.routes.deleteTemplateBtn', 'Xóa tuyến mẫu này')}
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setViewingCatalogRoute(null)}
                  className="text-xs"
                >{t('common.close', 'Đóng')}</Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const templateToUse = viewingCatalogRoute;
                    setActiveTab('flow3_planning');
                    setViewingCatalogRoute(null);

                    const matchedOrder = planningOrders.find((o) => isRouteMatchingOrder(templateToUse, o));
                    if (matchedOrder) {
                      toast.success(
                        language === 'en' ? `Found order ${matchedOrder.requestCode} matching route! Opened and synced template.` : `Tìm thấy đơn ${matchedOrder.requestCode} trùng khớp lộ trình! Đã mở và đồng bộ tuyến mẫu.`
                      );
                      handleOpenDetailModal(matchedOrder, templateToUse);
                    } else {
                      toast.success(
                        language === 'en' ? `Selected route template "${templateToUse.name}". Please click "Build Detailed Plan" on the order.` : `Đã chọn tuyến mẫu "${templateToUse.name}". Vui lòng bấm "Dựng kế hoạch chi tiết" ở đơn hàng bạn muốn áp dụng.`
                      );
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs"
                >
                  <Navigation size={13} className="mr-1 text-[#A67C2E]" />
                  {t('coordinator.routes.useForPlanningBtn', 'Dùng Cho Lập Kế Hoạch')}
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
                    toast.success(language === 'en' ? `Loaded route "${viewingCatalogRoute.name}" on digital map!` : `Đã nạp tuyến "${viewingCatalogRoute.name}" lên bản đồ số!`);
                  }}
                  className="bg-[#181A17] hover:bg-[#242722] text-white font-bold text-xs shadow-sm"
                >
                  <MapPin size={13} className="mr-1" />
                  {t('coordinator.routes.loadToMapBtn', 'Tải Lên Bản Đồ Số')}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL XÁC NHẬN XÓA TUYẾN ĐƯỜNG MẪU */}
      {routeToDelete && (
        <Modal
          isOpen={Boolean(routeToDelete)}
          onClose={() => setRouteToDelete(null)}
          title={t('coordinator.routes.confirmDeleteTemplateTitle', 'Xác Nhận Xóa Tuyến Mẫu')}
          subtitle={t('coordinator.routes.confirmDeleteTemplateSub', 'Hành động này sẽ gỡ bỏ tuyến đường mẫu khỏi Thư viện số.')}
          maxWidth="480px"
        >
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h4 className="font-bold text-red-900 text-xs m-0">{t('coordinator.routes.confirmDeleteTemplateHeading', 'Xóa vĩnh viễn tuyến đường mẫu này?')}</h4>
                <p className="text-xs text-red-700 m-0 mt-1 leading-relaxed">
                  {t('coordinator.routes.confirmDeleteTemplateDesc', 'Bạn có chắc muốn xóa tuyến "{name}" khỏi Thư viện không? Hành động này không thể hoàn tác.', { name: routeToDelete.name })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRouteToDelete(null)}
                className="text-xs font-medium px-4 py-2 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                {t('common.cancel', 'Hủy Bỏ')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  deleteRoute(routeToDelete.id);
                  toast.success(t('coordinator.routes.deleteTemplateSuccess', 'Đã xóa tuyến đường mẫu khỏi thư viện!'));
                  setRouteToDelete(null);
                  setViewingCatalogRoute(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                {t('common.delete', 'Xác Nhận Xóa')}
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
          title={t('coordinator.routes.saveTemplateModalTitle', 'Lưu Tuyến Đường Mẫu Vào Thư Viện')}
          subtitle={t('coordinator.routes.saveTemplateModalSub', 'Tạo mới hoặc lưu hành lang vận chuyển chuẩn để tái sử dụng nhanh cho các đơn hàng tiếp theo.')}
          maxWidth="760px"
        >
          <div className="flex flex-col gap-4">
            {/* Form Fields */}
            <div>
              <label htmlFor="save-tpl-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.routes.templateNameLabel', 'Tên Tuyến Đường Mẫu *')}
              </label>
              <input
                id="save-tpl-name"
                type="text"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder={t('coordinator.routes.templateNamePlaceholder', 'VD: Hành lang TP.HCM ➔ Singapore Turf Club (Hàng không)')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-[#C4B38E]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="save-tpl-orig" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  {t('coordinator.routes.originLabel', 'Điểm xuất phát')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="save-tpl-orig"
                  type="text"
                  value={saveTemplateOrigin}
                  onChange={(e) => setSaveTemplateOrigin(e.target.value)}
                  placeholder={language === 'en' ? 'e.g. Cu Chi Farm, HCMC' : 'VD: Trang trại Củ Chi, TP.HCM'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:border-[#C4B38E]"
                />
              </div>

              <div>
                <label htmlFor="save-tpl-dest" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  {t('coordinator.routes.destinationLabel', 'Điểm đích đến')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="save-tpl-dest"
                  type="text"
                  value={saveTemplateDestination}
                  onChange={(e) => setSaveTemplateDestination(e.target.value)}
                  placeholder="VD: Singapore Turf Club, Kranji, Singapore"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:border-[#C4B38E]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="save-tpl-dist" className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.routes.totalEstDistanceKm', 'Tổng cự ly ước tính (km)')}
              </label>
              <input
                id="save-tpl-dist"
                type="number"
                value={saveTemplateDistance}
                onChange={(e) => setSaveTemplateDistance(Number(e.target.value))}
                className="w-full sm:w-48 px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-[#181A17] outline-none focus:border-[#C4B38E]"
              />
            </div>

            {/* Stops Editor */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider m-0">
                    {t('coordinator.routes.templateStopsHeader', 'Các trạm kiểm dịch & trạm dừng chân mẫu ({count} trạm)', { count: saveTemplateStops.length })}
                  </h4>
                  <p className="text-[11px] text-slate-400 m-0">
                    {t('coordinator.routes.templateStopsDesc', 'Có thể thêm/xóa trạm để chuẩn hóa lộ trình cho chú ngựa.')}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaveTemplateStops((prev) => [
                      ...prev,
                      {
                        seq: prev.length + 1,
                        name: language === 'en' ? 'New Quarantine Station' : 'Trạm kiểm dịch mới',
                        type: 'Quarantine',
                        country: language === 'en' ? 'Vietnam' : 'Việt Nam',
                      },
                    ]);
                  }}
                  className="text-xs font-semibold text-[#181A17] border-[#EAE5DA] bg-[#FAF8F4] hover:bg-[#F3EFE4] flex items-center gap-1"
                >
                  <Plus size={13} /> {t('coordinator.routes.addStopBtn', 'Thêm trạm').replace(/^\+\s*/, '')}
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-xs text-left min-w-[560px]">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2 w-10 text-center">#</th>
                      <th className="p-2">{t('coordinator.routes.stopNameCol', 'Tên Trạm')}</th>
                      <th className="p-2 w-36">{t('coordinator.routes.stopTypeCol', 'Loại Trạm')}</th>
                      <th className="p-2 w-28">{t('coordinator.routes.countryCol', 'Quốc Gia')}</th>
                      <th className="p-2 w-12 text-center">{t('common.delete', 'Xóa')}</th>
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
                              const val = e.target.value;
                              setSaveTemplateStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                              );
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={stop.type}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setSaveTemplateStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, type: val } : item))
                              );
                            }}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs font-semibold"
                          >
                            <option value="Quarantine">{translateStopType('quarantine')}</option>
                            <option value="Rest">{translateStopType('rest')}</option>
                            <option value="Border Gate">{translateStopType('border_check')}</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={stop.country}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSaveTemplateStops((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, country: val } : item))
                              );
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSaveTemplateStops((prev) =>
                                prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 }))
                              );
                            }}
                            aria-label={language === 'en' ? `Delete template stop ${stop.seq}` : `Xóa trạm mẫu #${stop.seq}`}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
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

            {/* Sticky Modal Actions */}
            <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 mt-2 z-10">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-xs font-medium"
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveTemplateSubmit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <BookmarkPlus size={14} />
                <span>{t('coordinator.routes.saveTemplateBtn', 'Lưu Tuyến Mẫu Vào Thư Viện')}</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


export default function RoutePlanningPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">{t('coordinator.routes.loadingCoordinationCenter', 'Đang tải Trung tâm Điều phối Tuyến đường...')}</div>}>
      <RoutePlanningContent />
    </Suspense>
  );
}
