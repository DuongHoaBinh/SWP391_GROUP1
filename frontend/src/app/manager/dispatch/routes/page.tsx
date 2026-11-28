'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Search, Edit, Trash2, MapPin,
  Clock, Navigation, ShieldCheck, CheckCircle2, Eye,
  Plane, Truck, Ship, AlertCircle, Send, RefreshCw, Sparkles,
  Compass, RotateCcw, Check, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { apiClient } from '@/lib/api-client';
import {
  routesApi,
  RouteLegItem,
  RouteStopItem,
  AirlineItem,
  AirportItem,
  MasterStopItem,
  RouteDetail,
  DraftSuggestionResult,
} from '@/features/routes/api/routes.api';
import {
  buildEquineRoute,
  isAirportLocationText,
  estimateLegDistanceAndDuration,
  geocodeAddress,
  type GeocodedLocation,
} from '@/lib/geo-corridors';
import { AddressAutocompleteInput } from '@/components/ui/AddressAutocompleteInput';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';
import { LegScheduleFields } from '@/features/routes/components/LegScheduleFields';
import { ReservedVehiclesPanel } from '@/features/fleet/components/ReservedVehiclesPanel';

const DISPATCH_ELIGIBLE_STATUSES = new Set([
  'approved',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'return_pending',
  'completed',
]);

interface PlanningOrder {
  transportMode?: 'road' | 'air' | 'sea' | null;
  tripType?: 'one_way' | 'round_trip' | string;
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
  pickupAt?: string;
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
  const { vehicles, refreshVehicles } = useFleetRouteStore();

  // Search
  const [searchTerm, setSearchTerm] = useState(urlSearch || '');

  // Flow 3: Orders awaiting planning & Master Data
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [airlines, setAirlines] = useState<AirlineItem[]>([]);
  const [airports, setAirports] = useState<AirportItem[]>([]);
  const [masterStops, setMasterStops] = useState<MasterStopItem[]>([]);
  const [stopCatalogTypeFilter, setStopCatalogTypeFilter] = useState<'all' | 'border_check' | 'quarantine' | 'rest' | 'refuel'>('all');
  const [stopCatalogSearch, setStopCatalogSearch] = useState('');
  const [selectedMasterStopId, setSelectedMasterStopId] = useState('');
  const [geocodingStopIdx, setGeocodingStopIdx] = useState<number | null>(null);
  const [editingCoordsStopIdx, setEditingCoordsStopIdx] = useState<number | null>(null);
  const [manualLatInput, setManualLatInput] = useState('');
  const [manualLngInput, setManualLngInput] = useState('');
  const langRef = useRef(language);
  langRef.current = language;
  const refreshVehiclesRef = useRef(refreshVehicles);
  refreshVehiclesRef.current = refreshVehicles;
  const openedShipmentRef = useRef<string | null>(null);

  // Detailed Plan Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPlanningOrder, setSelectedPlanningOrder] = useState<PlanningOrder | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestionSource, setSuggestionSource] = useState<DraftSuggestionResult['source'] | null>(null);

  // Detail Plan Form State
  const [planRouteName, setPlanRouteName] = useState('');
  const [planTotalDistanceKm, setPlanTotalDistanceKm] = useState<number>(850);
  const [legs, setLegs] = useState<RouteLegItem[]>([]);
  const [stops, setStops] = useState<RouteStopItem[]>([]);
  const [notes, setNotes] = useState('');

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

      // 2. Orders eligible for Flow 3 dispatch (strict allowlist matching /manager/planning)
      const rawOrders = await apiClient<any[]>('/orders');
      if (Array.isArray(rawOrders)) {
        const eligibleOrders = rawOrders.filter((o) =>
          DISPATCH_ELIGIBLE_STATUSES.has(String(o.status || '').toLowerCase())
        );

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
                pickupAt: o.pickupAt || o.pickup_at || undefined,
                status: o.status,
                transportMode: o.transportMode ?? o.transport_mode ?? null,
                tripType: o.tripType || o.trip_type || 'one_way',
                bookingType: o.bookingType ?? 'dedicated_charter',
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

  // Helper: Đồng bộ hóa thông minh tên sân bay cất cánh & hạ cánh gần nhất từ Geo Engine & Danh mục sân bay
  const extractIataCode = (label?: string | null): string => {
    const match = String(label || '').match(/\(([A-Z]{3})\b/);
    return match?.[1]?.toUpperCase() || '';
  };

  const resolveAirLegLocations = (
    order?: PlanningOrder | null
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

    // Step 9: xe đã giữ chỗ cho chính đơn này (phương án khách chọn) được ưu tiên, xe lớn nhất dẫn đoàn
    const reservedForOrder = roadFleet
      .filter((v) => Boolean(v.assignedTripCode) && v.assignedTripCode === order?.requestCode)
      .sort((a, b) => Number(b.capacity || 0) - Number(a.capacity || 0));

    const chosen =
      reservedForOrder[0] ||
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
    if (legItem.legType === 'sea') return legItem;
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
    flightHoursOverride?: number
  ): RouteLegItem[] => {
    const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(order);
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
      stallsBooked: Math.max(1, Math.ceil((horseCount || 1) / 3)),
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
        isOverseasPartnerRoad: !isDomesticArrival,
        vehiclePlate: isDomesticArrival
          ? defaultVehicle.vehiclePlate
          : language === 'en'
            ? `Partner Depot Dispatch (${destClean})`
            : `Điều phối qua Trạm Đối tác (${destClean})`,
      });
    }

    return applyDefaultScheduleToLegs(result, order);
  };

  // Tìm biển số xe theo vehicleId từ kho xe hiện có
  const findVehiclePlateById = (vehicleId?: number | null): string | null => {
    if (!vehicleId) return null;
    const match = vehicles.find((v) => {
      const parsed = Number(String(v.id).replace(/\D/g, ''));
      return Number.isSafeInteger(parsed) && parsed === Number(vehicleId);
    });
    return match?.code ?? null;
  };

  // Tự động gợi ý tuyến đường theo phương thức cụ thể (dùng khi Manager chủ động đổi phương thức hoặc fallback)
  const applySmartRouteSuggestion = (
    order: PlanningOrder,
    modeOverride?: 'road' | 'air' | 'sea',
    showToast = false
  ) => {
    const preferredMode: 'road' | 'air' | 'sea' =
      modeOverride ??
      (order.transportMode === 'sea'
        ? 'sea'
        : order.transportMode === 'air'
          ? 'air'
          : order.transportMode === 'road'
            ? 'road'
            : 'road');

    const geoPreview = buildEquineRoute(order.origin, order.destination, preferredMode);
    const shouldUseSea = preferredMode === 'sea' && geoPreview.legs.some((l) => l.type === 'sea');
    const shouldUseAir =
      !shouldUseSea &&
      (modeOverride !== undefined
        ? modeOverride === 'air'
        : order.transportMode === 'air');

    const originShort = (order.origin || '').split(',')[0].trim() || 'Điểm đón';
    const destShort = (order.destination || '').split(',')[0].trim() || 'Điểm đến';

    if (shouldUseSea) {
      const defaultVehicle = pickDefaultRoadVehicle(order);
      const seaBuiltLegs: RouteLegItem[] = geoPreview.legs.map((l, idx) => ({
        sequenceNo: idx + 1,
        direction: 'outbound',
        legType: l.type === 'sea' ? 'sea' : 'road',
        originLocation: l.fromName,
        destinationLocation: l.toName,
        distanceKm: l.distanceKm,
        durationHours: l.durationHours,
        ...(l.type === 'sea'
          ? { stallsBooked: Math.max(1, order.horseCount || 1), bookingReference: '' }
          : l.type === 'road' && idx === 0
            ? { vehiclePlate: defaultVehicle.vehiclePlate, vehicleId: defaultVehicle.vehicleId }
            : l.type === 'road' && !geoPreview.isDomestic
              ? {
                  vehicleId: null,
                  vehiclePlate:
                    language === 'en'
                      ? `Vehicle from ${destShort} - Consignee pickup`
                      : `Xe từ ${destShort} đến đón (Bên nhận tự rước)`,
                }
              : { vehiclePlate: defaultVehicle.vehiclePlate, vehicleId: defaultVehicle.vehicleId }),
      }));
      const scheduled = applyDefaultScheduleToLegs(seaBuiltLegs, order);
      const totalKm = sumLegsDistanceKm(scheduled, geoPreview.distanceKm || 1200);
      setSuggestionSource(null);
      setPlanRouteName(`Hành lang Đường thủy: ${originShort} → ${destShort}`);
      setLegs(scheduled);
      setPlanTotalDistanceKm(totalKm);
      setStops([]);
      if (showToast) {
        toast.success(
          language === 'en'
            ? `Suggested multimodal sea + road route (${scheduled.length} legs • ${totalKm} km)`
            : `Đã gợi ý lộ trình Đa phương thức Đường thủy + Đường bộ (${scheduled.length} chặng • ${totalKm} km)`
        );
      }
      return;
    }

    if (!shouldUseAir) {
      const defaultVehicle = pickDefaultRoadVehicle(order);
      const roadEst = estimateLegDistanceAndDuration(order.origin, order.destination, 'road');
      const roadDist = roadEst?.distanceKm ?? geoPreview.distanceKm ?? (geoPreview.isDomestic ? 250 : 850);
      const roadDur = roadEst?.durationHours ?? Math.max(1, Math.round(geoPreview.durationHours || 3));
      const singleRoadLeg: RouteLegItem = {
        sequenceNo: 1,
        direction: 'outbound',
        legType: 'road',
        originLocation: order.origin,
        destinationLocation: order.destination,
        distanceKm: roadDist,
        durationHours: roadDur,
        vehiclePlate: defaultVehicle.vehiclePlate,
        vehicleId: defaultVehicle.vehicleId,
      };
      const scheduled = applyDefaultScheduleToLegs([singleRoadLeg], order);
      setSuggestionSource(null);
      setPlanRouteName(`Hành lang Đường bộ: ${originShort} → ${destShort}`);
      setLegs(scheduled);
      setPlanTotalDistanceKm(sumLegsDistanceKm(scheduled, roadDist));

      // Keep/suggest a GPS-ready border/quarantine checkpoint for cross-border road routes (BR-F3-03)
      if (!geoPreview.isDomestic && masterStops.length > 0) {
        const eligible = masterStops.filter(
          (ms) => ms.stopType === 'border_check' || ms.stopType === 'quarantine'
        );
        const landBorderPool = eligible.filter(
          (ms) =>
            ms.stopType === 'border_check' ||
            /cửa khẩu|cua khau|border|checkpoint/i.test(ms.name)
        );
        const pool = landBorderPool.length > 0 ? landBorderPool : eligible;
        const oCoords = geoPreview.origin?.coords;
        const dCoords = geoPreview.destination?.coords;
        const haversineDeg = (a: [number, number], b: [number, number]) => {
          const toRad = (deg: number) => (deg * Math.PI) / 180;
          const dLat = toRad(b[0] - a[0]);
          const dLng = toRad(b[1] - a[1]);
          const s =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
          return 2 * 6371 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
        };
        let picked: MasterStopItem | null = null;
        if (oCoords && dCoords) {
          let bestKm = Infinity;
          for (const ms of pool) {
            if (ms.lat == null || ms.lng == null) continue;
            const total = haversineDeg(oCoords, [Number(ms.lat), Number(ms.lng)]) + haversineDeg([Number(ms.lat), Number(ms.lng)], dCoords);
            if (total < bestKm) {
              bestKm = total;
              picked = ms;
            }
          }
        }
        picked = picked ?? pool[0] ?? null;
        if (picked) {
          setStops([
            {
              sequenceNo: 1,
              direction: 'outbound',
              legSequenceNo: 1,
              stopType: picked.stopType === 'quarantine' ? 'quarantine' : 'border_check',
              locationName: picked.name,
              country: picked.country,
              lat: picked.lat != null ? Number(picked.lat) : null,
              lng: picked.lng != null ? Number(picked.lng) : null,
              geofenceRadiusM: 1000,
              locationRefType: 'master_stop',
              locationRefId: picked.id,
            },
          ]);
        } else {
          setStops([]);
        }
      } else {
        setStops([]);
      }
      if (showToast) {
        toast.success(
          language === 'en'
            ? `Suggested direct road route: ${originShort} → ${destShort} (${roadDist} km)`
            : `Đã gợi ý lộ trình Đường bộ: ${originShort} → ${destShort} (${roadDist} km)`
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
      setSuggestionSource(null);
      setPlanRouteName(`Hành lang Đa phương thức: ${originShort} → ${depCode} ✈️ ${arrCode} → ${destShort}`);
      setLegs(builtLegs);
      setPlanTotalDistanceKm(totalKm);
      setStops([]);
      if (showToast) {
        toast.success(
          language === 'en'
            ? `Suggested multimodal air + road route (${builtLegs.length} legs • ${totalKm} km)`
            : `Đã gợi ý lộ trình Đa phương thức Bay + Đường bộ (${builtLegs.length} chặng • ${totalKm} km)`
        );
      }
    }
  };

  // Nạp đề xuất lộ trình từ backend GET /routes/shipment/:id/draft-suggestion (từ shipment_quote + vehicle_reservation)
  const loadDraftSuggestionForOrder = async (order: PlanningOrder, showToast = false) => {
    setIsLoadingSuggestion(true);
    try {
      const suggestion = await routesApi.getDraftSuggestion(order.id);
      const defaultVehicle = pickDefaultRoadVehicle(order);
      const defaultAirline = resolveAirlineMeta(undefined, order);
      const outboundCrossIdx = suggestion.legs.findIndex(
        (l) => (l.direction || 'outbound') === 'outbound' && (l.legType === 'flight' || l.legType === 'sea'),
      );
      const returnCrossIdx = suggestion.legs.findIndex(
        (l) => l.direction === 'return' && (l.legType === 'flight' || l.legType === 'sea'),
      );
      const destClean = (order.destination || 'Địa điểm đích').split(',')[0].trim();
      const suggestedPartnerName =
        (suggestion as any).partnerDepot?.name ||
        (suggestion as any).partnerDepot?.depotName ||
        null;

      const mappedLegs: RouteLegItem[] = suggestion.legs.map((sl, idx) => {
        if (sl.legType === 'flight') {
          const depCode = sl.departureAirportCode || extractIataCode(sl.originLocation) || 'SGN';
          const arrCode = sl.arrivalAirportCode || extractIataCode(sl.destinationLocation) || 'SIN';
          const minJetStalls = Math.max(1, Math.ceil((order.horseCount || 1) / 3));
          return {
            sequenceNo: sl.sequenceNo,
            direction: sl.direction,
            legType: 'flight',
            originLocation: sl.originLocation,
            destinationLocation: sl.destinationLocation,
            distanceKm: sl.distanceKm,
            durationHours: sl.durationHours,
            plannedDeparture: sl.plannedDeparture,
            plannedArrival: sl.plannedArrival,
            airlineId: defaultAirline.airlineId,
            airlineName: defaultAirline.airlineName,
            departureAirportId: sl.departureAirportId,
            departureAirportCode: depCode,
            arrivalAirportId: sl.arrivalAirportId,
            arrivalAirportCode: arrCode,
            flightNumber: `${depCode}-${arrCode}-CARGO`,
            bookingReference: `AWB-${order.requestCode}-${arrCode}`,
            stallsBooked: Math.max(minJetStalls, sl.stallsBooked || minJetStalls),
          };
        }
        if (sl.legType === 'sea') {
          return {
            sequenceNo: sl.sequenceNo,
            direction: sl.direction,
            legType: 'sea',
            originLocation: sl.originLocation,
            destinationLocation: sl.destinationLocation,
            distanceKm: sl.distanceKm,
            durationHours: sl.durationHours,
            plannedDeparture: sl.plannedDeparture,
            plannedArrival: sl.plannedArrival,
            bookingReference: '',
            stallsBooked: Math.max(1, sl.stallsBooked || order.horseCount || 1),
          };
        }
        // Road leg — detect overseas partner road symmetrically for both outbound & return
        const isOverseasPartnerRoad =
          Boolean((sl as any).isOverseasPartnerRoad) ||
          ((sl.direction || 'outbound') === 'outbound' && outboundCrossIdx !== -1 && idx > outboundCrossIdx && !sl.vehicleId) ||
          (sl.direction === 'return' && returnCrossIdx !== -1 && idx < returnCrossIdx && !sl.vehicleId);
        const partnerLabelName = (sl as any).partnerDepotName || suggestedPartnerName;
        const resolvedPlate = sl.vehicleId
          ? findVehiclePlateById(sl.vehicleId) || defaultVehicle.vehiclePlate
          : isOverseasPartnerRoad
            ? partnerLabelName
              ? language === 'en'
                ? `Partner Depot: ${partnerLabelName}`
                : `Trạm Đối tác: ${partnerLabelName}`
              : language === 'en'
                ? `Partner / Consignee Pickup (${destClean})`
                : `Điều phối Trạm Đối tác / Bên nhận đón (${destClean})`
            : defaultVehicle.vehiclePlate;
        const resolvedVehicleId = sl.vehicleId ?? (isOverseasPartnerRoad ? null : defaultVehicle.vehicleId);
        return {
          sequenceNo: sl.sequenceNo,
          direction: sl.direction,
          legType: 'road',
          originLocation: sl.originLocation,
          destinationLocation: sl.destinationLocation,
          distanceKm: sl.distanceKm,
          durationHours: sl.durationHours,
          plannedDeparture: sl.plannedDeparture,
          plannedArrival: sl.plannedArrival,
          vehicleId: resolvedVehicleId,
          vehiclePlate: resolvedPlate,
          isOverseasPartnerRoad,
          partnerDepotName: partnerLabelName || null,
        };
      });

      const mappedStops: RouteStopItem[] = (suggestion.stops || []).map((st) => ({
        sequenceNo: st.sequenceNo,
        direction: st.direction,
        legSequenceNo: st.legSequenceNo,
        stopType: st.stopType,
        locationName: st.locationName,
        country: st.country,
        plannedArrival: st.plannedArrival,
        plannedDeparture: st.plannedDeparture,
        lat: st.lat ?? null,
        lng: st.lng ?? null,
        geofenceRadiusM: st.geofenceRadiusM ?? null,
        locationRefType: st.locationRefType ?? null,
        locationRefId: st.locationRefId ?? null,
      }));

      setSuggestionSource(suggestion.source);
      setPlanRouteName(suggestion.routeName);
      setPlanTotalDistanceKm(suggestion.totalDistanceKm || sumLegsDistanceKm(mappedLegs, 250));
      setLegs(mappedLegs);
      setStops(mappedStops);

      if (showToast) {
        toast.success(
          language === 'en'
            ? `Reloaded route from customer quote (${mappedLegs.length} legs, ${mappedStops.length} stops).`
            : `Đã nạp lại lộ trình từ báo giá khách đặt (${mappedLegs.length} chặng, ${mappedStops.length} trạm dừng).`
        );
      }
    } catch (err) {
      console.warn('Draft suggestion API fallback:', err);
      applySmartRouteSuggestion(order, undefined, showToast);
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  const handleOpenDetailModal = (order: PlanningOrder) => {
    setSelectedPlanningOrder(order);
    const existingRoute = order.routeDetail;
    setSuggestionSource(null);
    setStopCatalogTypeFilter('all');
    setStopCatalogSearch('');
    setSelectedMasterStopId('');
    setGeocodingStopIdx(null);
    setEditingCoordsStopIdx(null);
    setManualLatInput('');
    setManualLngInput('');
    setNotes(existingRoute?.strategicNotes || '');

    // If order already has saved legs in DB, preserve them
    if (existingRoute?.legs && existingRoute.legs.length > 0) {
      setPlanRouteName(
        existingRoute.routeName ||
          `Hành lang vận chuyển: ${(order.origin || '').split(',')[0]} → ${(order.destination || '').split(',')[0]}`
      );

      const { arrName, depName, airlineName } = resolveAirLegLocations(order);
      const geoRoute = buildEquineRoute(
        order.origin,
        order.destination,
        order.transportMode === 'road' ? 'road' : order.transportMode === 'sea' ? 'sea' : 'air'
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
            stallsBooked: Math.max(Number(leg.stallsBooked || 0), Math.max(1, Math.ceil(Number(order.horseCount || 1) / 3))),
            distanceKm: leg.distanceKm || flightPreview?.distanceKm || 1150,
          };
        }
        if (leg.legType === 'sea') {
          return {
            ...leg,
            originLocation: orig,
            destinationLocation: dest,
            stallsBooked: Math.max(Number(leg.stallsBooked || 0), Number(order.horseCount || 1)),
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
      const legSeqById = new Map<number, number>();
      for (const l of existingRoute.legs) {
        if (l.id != null) legSeqById.set(Number(l.id), Number(l.sequenceNo));
      }
      const hydratedStops: RouteStopItem[] =
        existingRoute.stops && existingRoute.stops.length > 0
          ? existingRoute.stops.map((st) => ({
              ...st,
              legSequenceNo:
                st.legSequenceNo ??
                (st.legId != null ? legSeqById.get(Number(st.legId)) : undefined),
            }))
          : [];
      setStops(hydratedStops);
      setIsDetailModalOpen(true);
    } else {
      // Unbuilt order: open modal & auto-fill directly from backend quote suggestion
      setPlanRouteName(`Lộ trình: ${(order.origin || '').split(',')[0]} → ${(order.destination || '').split(',')[0]}`);
      setLegs([]);
      setStops([]);
      setIsDetailModalOpen(true);
      void loadDraftSuggestionForOrder(order, false);
    }
  };

  // Add Leg (supports road, flight, sea and outbound / return)
  const handleAddLeg = (type: 'road' | 'flight' | 'sea', defaultDirection?: 'outbound' | 'return') => {
    const nextSeq = legs.length + 1;
    const legDirection = defaultDirection || (legs.length > 0 && legs[legs.length - 1].direction === 'return' ? 'return' : 'outbound');
    if (type === 'road') {
      const isAfterCrossBorder =
        legDirection === 'outbound' && legs.some((l) => l.legType === 'flight' || l.legType === 'sea');
      const destClean = (selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
      const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
      const defaultPlate = isAfterCrossBorder
        ? (language === 'en' ? `Vehicle from ${destClean} - Consignee pickup` : `Xe từ ${destClean} đến đón (Bên nhận tự rước)`)
        : defaultVehicle.vehiclePlate;
      const nextLegs = applyDefaultScheduleToLegs(
        [
          ...legs,
          {
            sequenceNo: nextSeq,
            direction: legDirection,
            legType: 'road',
            originLocation:
              legs.length > 0
                ? legs[legs.length - 1].destinationLocation
                : legDirection === 'return'
                  ? selectedPlanningOrder?.destination || (language === 'en' ? 'Return Pickup' : 'Điểm đón chiều về')
                  : selectedPlanningOrder?.origin || (language === 'en' ? 'Assembly Point' : 'Điểm tập kết'),
            destinationLocation:
              legDirection === 'return'
                ? selectedPlanningOrder?.origin || (language === 'en' ? 'Return Destination' : 'Điểm trả chiều về')
                : isAfterCrossBorder
                  ? selectedPlanningOrder?.destination || (language === 'en' ? 'Destination' : 'Địa điểm đích')
                  : language === 'en'
                    ? 'Road Leg Destination'
                    : 'Điểm đến chặng đường bộ',
            distanceKm: isAfterCrossBorder ? 35 : 120,
            durationHours: isAfterCrossBorder ? 1.5 : 3,
            vehiclePlate: defaultPlate,
            vehicleId: isAfterCrossBorder ? null : defaultVehicle.vehicleId,
            roadTripId: null,
          },
        ],
        selectedPlanningOrder
      );
      setLegs(nextLegs);
      setPlanTotalDistanceKm(sumLegsDistanceKm(nextLegs, planTotalDistanceKm));
    } else if (type === 'sea') {
      const seaLeg: RouteLegItem = {
        sequenceNo: nextSeq,
        direction: legDirection,
        legType: 'sea',
        originLocation:
          legs.length > 0
            ? legs[legs.length - 1].destinationLocation
            : language === 'en'
              ? 'Departure Seaport (e.g. Cat Lai Port, HCMC)'
              : 'Cảng đi (VD: Cảng Cát Lái, TP.HCM)',
        destinationLocation:
          legDirection === 'return'
            ? language === 'en'
              ? 'Return Arrival Seaport (e.g. Cat Lai Port, HCMC)'
              : 'Cảng đến chiều về (VD: Cảng Cát Lái, TP.HCM)'
            : language === 'en'
              ? 'Destination Seaport (e.g. Pasir Panjang Port, Singapore)'
              : 'Cảng đến (VD: Cảng Pasir Panjang, Singapore)',
        bookingReference: '',
        stallsBooked: Math.max(1, selectedPlanningOrder?.horseCount || 1),
        distanceKm: 1350,
        durationHours: 48,
      };
      const nextLegs = applyDefaultScheduleToLegs([...legs, seaLeg], selectedPlanningOrder);
      setLegs(nextLegs);
      setPlanTotalDistanceKm(sumLegsDistanceKm(nextLegs, planTotalDistanceKm));
    } else {
      const { depName, depCargoName, arrName, airlineName } = resolveAirLegLocations(selectedPlanningOrder);
      const airlineMeta = resolveAirlineMeta(airlineName, selectedPlanningOrder);
      const depMeta = resolveAirportMeta(
        legDirection === 'return' ? arrName : depName,
        legDirection === 'return'
          ? selectedPlanningOrder?.routeDetail?.managerArrivalAirportId
          : selectedPlanningOrder?.routeDetail?.managerDepartureAirportId,
        legDirection === 'return'
          ? selectedPlanningOrder?.routeDetail?.managerArrivalAirportCode
          : selectedPlanningOrder?.routeDetail?.managerDepartureAirportCode,
        legDirection !== 'return'
      );
      const arrMeta = resolveAirportMeta(
        legDirection === 'return' ? depName : arrName,
        legDirection === 'return'
          ? selectedPlanningOrder?.routeDetail?.managerDepartureAirportId
          : selectedPlanningOrder?.routeDetail?.managerArrivalAirportId,
        legDirection === 'return'
          ? selectedPlanningOrder?.routeDetail?.managerDepartureAirportCode
          : selectedPlanningOrder?.routeDetail?.managerArrivalAirportCode,
        legDirection === 'return'
      );
      const flightBase = {
        direction: legDirection,
        legType: 'flight' as const,
        originLocation: legDirection === 'return' ? arrName : depName,
        destinationLocation: legDirection === 'return' ? depName : arrName,
        airlineId: airlineMeta.airlineId,
        airlineName: airlineMeta.airlineName,
        departureAirportId: depMeta.airportId,
        departureAirportCode: depMeta.iataCode,
        arrivalAirportId: arrMeta.airportId,
        arrivalAirportCode: arrMeta.iataCode,
        flightNumber: `${depMeta.iataCode}-${arrMeta.iataCode}-CARGO`,
        bookingReference: `AWB-${selectedPlanningOrder?.requestCode || 'AIR'}-${arrMeta.iataCode}`,
        stallsBooked: Math.max(1, Math.ceil((selectedPlanningOrder?.horseCount || 1) / 3)),
        distanceKm: 1150,
        durationHours: 3,
      };

      if (
        legDirection === 'outbound' &&
        legs.length === 0 &&
        selectedPlanningOrder?.origin &&
        !isAirportLocationText(selectedPlanningOrder.origin)
      ) {
        const defaultVehicle = pickDefaultRoadVehicle(selectedPlanningOrder);
        const nextLegs = applyDefaultScheduleToLegs(
          [
            {
              sequenceNo: 1,
              direction: 'outbound',
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
    const removedSeq = legs[idx]?.sequenceNo;
    const updated = legs.filter((_, i) => i !== idx).map((l, i) => ({ ...l, sequenceNo: i + 1 }));
    setLegs(updated);
    setPlanTotalDistanceKm(sumLegsDistanceKm(updated, planTotalDistanceKm));
    if (removedSeq != null) {
      setStops((prev) =>
        prev.map((st) => {
          if (st.legSequenceNo == null) return st;
          if (st.legSequenceNo === removedSeq) {
            return { ...st, legSequenceNo: updated[0]?.sequenceNo };
          }
          if (st.legSequenceNo > removedSeq) {
            return { ...st, legSequenceNo: st.legSequenceNo - 1 };
          }
          return st;
        })
      );
    }
  };

  const defaultStopGeofenceM = (stopType?: string): number =>
    stopType === 'border_check' || stopType === 'quarantine' ? 1000 : 300;

  // Add Stop (from Master Stop catalog with GPS coords, or manual)
  const handleAddStop = (masterStop?: MasterStopItem) => {
    const nextSeq = stops.length + 1;
    const defaultLegSeq =
      legs.find((l) => l.legType === 'road')?.sequenceNo ?? legs[0]?.sequenceNo;
    if (masterStop) {
      const hasCoords = masterStop.lat !== null && masterStop.lat !== undefined && masterStop.lng !== null && masterStop.lng !== undefined;
      setStops([
        ...stops,
        {
          sequenceNo: nextSeq,
          ...(defaultLegSeq ? { legSequenceNo: defaultLegSeq } : {}),
          stopType: masterStop.stopType,
          locationName: masterStop.name,
          country: masterStop.country,
          lat: hasCoords ? Number(masterStop.lat) : null,
          lng: hasCoords ? Number(masterStop.lng) : null,
          geofenceRadiusM: defaultStopGeofenceM(masterStop.stopType),
          locationRefType: 'master_stop',
          locationRefId: masterStop.id,
        },
      ]);
      toast.success(
        language === 'en'
          ? `Added stop "${masterStop.name}"${hasCoords ? ' (GPS ready)' : ''} to route!`
          : `Đã thêm trạm "${masterStop.name}"${hasCoords ? ' (đã có tọa độ GPS)' : ''} vào lộ trình!`
      );
    } else {
      setStops([
        ...stops,
        {
          sequenceNo: nextSeq,
          ...(defaultLegSeq ? { legSequenceNo: defaultLegSeq } : {}),
          stopType: 'rest',
          locationName: '',
          country: '',
          lat: null,
          lng: null,
          geofenceRadiusM: null,
          locationRefType: 'manual',
          locationRefId: null,
        },
      ]);
    }
  };

  // Resolve GPS coordinates for a manually typed stop (checks masterStops first, then geocoder)
  const handleGeocodeStop = async (idx: number, silent = false) => {
    const target = stops[idx];
    const locName = (target?.locationName || '').trim();
    if (!target || locName.length < 3) return;

    const matchedMaster = masterStops.find(
      (ms) => ms.name.trim().toLowerCase() === locName.toLowerCase()
    );
    if (matchedMaster && matchedMaster.lat != null && matchedMaster.lng != null) {
      setStops((prev) =>
        prev.map((item, i) =>
          i === idx
            ? {
                ...item,
                country: item.country?.trim() || matchedMaster.country,
                lat: Number(matchedMaster.lat),
                lng: Number(matchedMaster.lng),
                geofenceRadiusM: item.geofenceRadiusM ?? defaultStopGeofenceM(item.stopType),
                locationRefType: 'master_stop',
                locationRefId: matchedMaster.id,
              }
            : item
        )
      );
      if (!silent) {
        toast.success(language === 'en' ? 'Matched catalog GPS coordinates!' : 'Đã khớp tọa độ GPS từ danh mục trạm chuẩn!');
      }
      return;
    }

    setGeocodingStopIdx(idx);
    try {
      const query = [locName, (target.country || '').trim()].filter(Boolean).join(', ');
      const geo = await geocodeAddress(query);
      if (geo?.coords && Number.isFinite(geo.coords[0]) && Number.isFinite(geo.coords[1])) {
        const [lat, lng] = geo.coords;
        setStops((prev) =>
          prev.map((item) =>
            item.locationName.trim().toLowerCase() === locName.toLowerCase()
              ? {
                  ...item,
                  lat: Number(lat.toFixed(6)),
                  lng: Number(lng.toFixed(6)),
                  geofenceRadiusM: item.geofenceRadiusM ?? defaultStopGeofenceM(item.stopType),
                  locationRefType: 'address',
                  locationRefId: null,
                }
              : item
          )
        );
        if (!silent) {
          toast.success(
            language === 'en'
              ? `Located GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}) for "${locName}"`
              : `Đã định vị GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}) cho "${locName}"`
          );
        }
      } else if (!silent) {
        toast.error(
          language === 'en'
            ? `Could not find GPS coordinates for "${locName}". Try adding city/country or choose a catalog stop.`
            : `Không tìm thấy tọa độ GPS cho "${locName}". Hãy ghi rõ tỉnh/quốc gia hoặc chọn trạm từ danh mục chuẩn.`
        );
      }
    } finally {
      setGeocodingStopIdx((cur) => (cur === idx ? null : cur));
    }
  };

  // Normalize stops payload before sending to POST /routes/plan/:id/build-detail
  const prepareStopsForSubmission = (rawStops: RouteStopItem[]): RouteStopItem[] =>
    rawStops
      .filter((s) => Boolean(s.locationName && s.locationName.trim().length > 0))
      .map((s, idx) => {
        const hasValidCoords =
          s.lat !== null &&
          s.lat !== undefined &&
          s.lng !== null &&
          s.lng !== undefined &&
          Number.isFinite(Number(s.lat)) &&
          Number.isFinite(Number(s.lng));
        return {
          sequenceNo: idx + 1,
          ...(s.direction ? { direction: s.direction } : {}),
          ...(s.legSequenceNo ? { legSequenceNo: s.legSequenceNo } : {}),
          stopType: s.stopType,
          locationName: s.locationName.trim(),
          ...(s.country?.trim() ? { country: s.country.trim() } : {}),
          ...(s.plannedArrival ? { plannedArrival: s.plannedArrival } : {}),
          ...(s.plannedDeparture ? { plannedDeparture: s.plannedDeparture } : {}),
          ...(hasValidCoords ? { lat: Number(s.lat), lng: Number(s.lng) } : {}),
          ...(s.geofenceRadiusM && Number(s.geofenceRadiusM) >= 50
            ? { geofenceRadiusM: Math.round(Number(s.geofenceRadiusM)) }
            : {}),
          ...(s.locationRefType ? { locationRefType: s.locationRefType } : {}),
          ...(s.locationRefId && Number(s.locationRefId) > 0 ? { locationRefId: Number(s.locationRefId) } : {}),
        };
      });

  // Resolve missing GPS coordinates before submitting (eliminates blur/save race condition)
  const resolveStopsBeforeSubmission = async (rawStops: RouteStopItem[]): Promise<RouteStopItem[]> => {
    let changed = false;
    const resolved = await Promise.all(
      rawStops.map(async (s) => {
        const locName = (s.locationName || '').trim();
        const hasValidCoords =
          s.lat !== null &&
          s.lat !== undefined &&
          s.lng !== null &&
          s.lng !== undefined &&
          Number.isFinite(Number(s.lat)) &&
          Number.isFinite(Number(s.lng));
        if (!locName || hasValidCoords || locName.length < 3) return s;

        const matchedMaster = masterStops.find(
          (ms) => ms.name.trim().toLowerCase() === locName.toLowerCase()
        );
        if (matchedMaster && matchedMaster.lat != null && matchedMaster.lng != null) {
          changed = true;
          return {
            ...s,
            country: s.country?.trim() || matchedMaster.country,
            lat: Number(matchedMaster.lat),
            lng: Number(matchedMaster.lng),
            geofenceRadiusM: s.geofenceRadiusM ?? defaultStopGeofenceM(s.stopType),
            locationRefType: 'master_stop' as const,
            locationRefId: matchedMaster.id,
          };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const query = [locName, (s.country || '').trim()].filter(Boolean).join(', ');
          const geo = await geocodeAddress(query, controller.signal);
          if (geo?.coords && Number.isFinite(geo.coords[0]) && Number.isFinite(geo.coords[1])) {
            changed = true;
            return {
              ...s,
              lat: Number(geo.coords[0].toFixed(6)),
              lng: Number(geo.coords[1].toFixed(6)),
              geofenceRadiusM: s.geofenceRadiusM ?? defaultStopGeofenceM(s.stopType),
              locationRefType: 'address' as const,
              locationRefId: null,
            };
          }
        } catch {
          // Non-blocking fallback: backend still saves stop and allows manual check-in fallback
        } finally {
          clearTimeout(timer);
        }
        return s;
      })
    );
    if (changed) {
      setStops(resolved);
    }
    return prepareStopsForSubmission(resolved);
  };

  // Apply manually entered lat/lng coordinates for a stop when geocoder cannot locate a private site
  const handleSaveManualStopCoords = (idx: number) => {
    const parsedLat = Number(manualLatInput.trim());
    const parsedLng = Number(manualLngInput.trim());
    if (
      !manualLatInput.trim() ||
      !manualLngInput.trim() ||
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      toast.error(
        language === 'en'
          ? 'Please enter valid GPS coordinates (Lat: -90..90, Lng: -180..180).'
          : 'Vui lòng nhập tọa độ GPS hợp lệ (Vĩ độ -90..90, Kinh độ -180..180).'
      );
      return;
    }
    setStops((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              lat: Number(parsedLat.toFixed(6)),
              lng: Number(parsedLng.toFixed(6)),
              geofenceRadiusM: item.geofenceRadiusM ?? defaultStopGeofenceM(item.stopType),
              locationRefType: 'manual',
              locationRefId: null,
            }
          : item
      )
    );
    setEditingCoordsStopIdx(null);
    setManualLatInput('');
    setManualLngInput('');
    toast.success(language === 'en' ? 'Saved manual GPS coordinates for stop.' : 'Đã lưu tọa độ GPS thủ công cho trạm dừng.');
  };

  // Remove Stop
  const handleRemoveStop = (idx: number) => {
    const updated = stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequenceNo: i + 1 }));
    setStops(updated);
    if (editingCoordsStopIdx === idx) {
      setEditingCoordsStopIdx(null);
    }
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

  // Save Plan as Draft
  const handleSaveDraft = async () => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    setIsSubmittingPlan(true);
    try {
      const preparedStops = await resolveStopsBeforeSubmission(stops);
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || sumLegsDistanceKm(legs, 500),
        legs,
        stops: preparedStops,
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

  // 1-Step Save & Approve Plan (no self-submission loop for Logistics Manager)
  const handleSaveAndApprovePlan = async () => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    if (legs.length === 0) {
      toast.error(t('coordinator.routes.errNeedOneLeg', 'Vui lòng dựng ít nhất 1 chặng vận chuyển trước khi chốt kế hoạch!'));
      return;
    }

    const sortedLegs = [...legs].sort((a, b) => Number(a.sequenceNo) - Number(b.sequenceNo));
    const outboundLegs = sortedLegs.filter((l) => (l.direction || 'outbound') !== 'return');
    const firstFlightIdx = outboundLegs.findIndex((l) => l.legType === 'flight');
    if (firstFlightIdx !== -1) {
      let lastFlightIdx = firstFlightIdx;
      for (let i = outboundLegs.length - 1; i >= 0; i--) {
        if (outboundLegs[i].legType === 'flight') {
          lastFlightIdx = i;
          break;
        }
      }
      if (!isAirportLocationText(selectedPlanningOrder.origin)) {
        const hasPickupRoadLeg = outboundLegs.slice(0, firstFlightIdx).some((l) => l.legType === 'road');
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
        const hasDeliveryRoadLeg = outboundLegs.slice(lastFlightIdx + 1).some((l) => l.legType === 'road');
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

    const firstCrossBorderIdx = sortedLegs.findIndex((l) => l.legType === 'flight' || l.legType === 'sea');

    // Kiểm tra giờ khởi hành / đến dự kiến, thông tin xe đường bộ nội bộ, chuyến bay và tàu biển
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

      const outboundCrossIdx = sortedLegs.findIndex(
        (legItem) => (legItem.direction || 'outbound') === 'outbound' && (legItem.legType === 'flight' || legItem.legType === 'sea'),
      );
      const returnCrossIdx = sortedLegs.findIndex(
        (legItem) => legItem.direction === 'return' && (legItem.legType === 'flight' || legItem.legType === 'sea'),
      );
      const isOverseasPartnerRoad =
        l.legType === 'road' &&
        (Boolean(l.isOverseasPartnerRoad) ||
          ((l.direction || 'outbound') === 'outbound' && outboundCrossIdx !== -1 && i > outboundCrossIdx) ||
          (l.direction === 'return' && returnCrossIdx !== -1 && i < returnCrossIdx));
      if (l.legType === 'road' && !isOverseasPartnerRoad) {
        if (!l.vehiclePlate && !l.vehicleId) {
          toast.error(
            language === 'en'
              ? `Leg #${seqLabel}: Please select a specialized horse truck for the domestic road leg.`
              : `Chặng #${seqLabel}: Vui lòng chọn phương tiện / xe chuyên dụng cho chặng đường bộ nội địa!`,
            { duration: 6000 }
          );
          return;
        }

        if (l.vehiclePlate) {
          const matchedVehicle = vehicles.find((v) => v.code === l.vehiclePlate || (l.vehicleId && String(v.id) === String(l.vehicleId)));
          if (matchedVehicle) {
            const isCurrentTrip = Boolean(matchedVehicle.assignedTripCode) && matchedVehicle.assignedTripCode === selectedPlanningOrder?.requestCode;
            const isReservedOnly = Boolean((matchedVehicle as any).isReservedOnly);
            const shipStatus = String((matchedVehicle as any).assignedShipmentStatus || '').toLowerCase();
            const isActuallyInTransit =
              matchedVehicle.status === 'in_use' &&
              !isCurrentTrip &&
              !isReservedOnly &&
              (!shipStatus || shipStatus === 'in_transit' || shipStatus === 'return_pending');
            if (isActuallyInTransit) {
              toast.error(
                language === 'en'
                  ? `Leg #${seqLabel}: Vehicle "${matchedVehicle.code}" is currently in transport (${matchedVehicle.assignedTripCode || 'running another trip'}). Please select an available vehicle.`
                  : `Chặng #${seqLabel}: Xe "${matchedVehicle.code}" hiện đang trong quá trình vận chuyển (${matchedVehicle.assignedTripCode || 'đang chạy chuyến khác'})! Vui lòng chọn xe khác sẵn sàng.`,
                { duration: 6000 }
              );
              return;
            }
            const requiredStalls = Math.max(1, Number(selectedPlanningOrder?.horseCount || 1));
            const convoyTotalCapacity = vehicles
              .filter((v) => Boolean(v.assignedTripCode) && v.assignedTripCode === selectedPlanningOrder?.requestCode)
              .reduce((sum, v) => sum + Number(v.capacity || 0), 0);
            const effectiveCapacity =
              isCurrentTrip && convoyTotalCapacity > Number(matchedVehicle.capacity || 0)
                ? convoyTotalCapacity
                : Number(matchedVehicle.capacity || 0);
            if (effectiveCapacity < requiredStalls) {
              toast.error(
                language === 'en'
                  ? `Leg #${seqLabel}: Vehicle "${matchedVehicle.code}" has insufficient stalls (${effectiveCapacity}/${requiredStalls} horses).`
                  : `Chặng #${seqLabel}: Xe "${matchedVehicle.code}" không đủ sức chứa (${effectiveCapacity}/${requiredStalls} ngựa)!`,
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
              ? `Leg #${seqLabel} (Flight): Please enter Airline, Flight Number, and Booking Reference (AWB) before locking the plan.`
              : `Chặng #${seqLabel} (Hàng không): Vui lòng điền đủ Hãng bay, Số hiệu chuyến bay và Mã đặt chỗ (AWB) trước khi chốt kế hoạch!`,
            { duration: 6000 }
          );
          return;
        }
      }

      if (l.legType === 'sea') {
        if (!l.originLocation?.trim() || !l.destinationLocation?.trim()) {
          toast.error(
            language === 'en'
              ? `Leg #${seqLabel} (Sea): Please specify both Departure Seaport and Arrival Seaport.`
              : `Chặng #${seqLabel} (Đường thủy): Vui lòng nhập đầy đủ Cảng đi và Cảng đến!`,
            { duration: 6000 }
          );
          return;
        }
        if (Number(l.stallsBooked || 0) < 1) {
          toast.error(
            language === 'en'
              ? `Leg #${seqLabel} (Sea): Vessel pen count must be at least 1.`
              : `Chặng #${seqLabel} (Đường thủy): Số ô chuồng tàu (vessel_pen) phải từ 1 trở lên!`,
            { duration: 6000 }
          );
          return;
        }
      }
    }

    // Kiểm tra tên trạm dừng không bị bỏ trống trước khi chốt
    if (stops.some((s) => !s.locationName || !s.locationName.trim())) {
      toast.error(
        language === 'en'
          ? 'Please enter a name for every stop (or remove blank stop rows) before locking the plan.'
          : 'Vui lòng điền tên cho tất cả các trạm dừng (hoặc xóa dòng trạm trống) trước khi chốt kế hoạch!',
        { duration: 5000 }
      );
      return;
    }

    // Kiểm tra an toàn sức khỏe ngựa trên chặng đường bộ dài (> 350km hoặc > 4.5 giờ)
    const hasLongRoadLeg = legs.some(
      (leg) => leg.legType === 'road' && (Number(leg.distanceKm) > 350 || Number(leg.durationHours) > 4.5)
    );
    const hasRestStop = stops.some((s) => s.stopType === 'rest');
    if (hasLongRoadLeg && !hasRestStop) {
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
      const preparedStops = await resolveStopsBeforeSubmission(stops);
      // 1. Save detailed plan
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || sumLegsDistanceKm(legs, 500),
        legs,
        stops: preparedStops,
        notes: notes.trim() || undefined,
      });

      // 2. Directly approve & lock plan in 1 step (canApproveDirectly on backend)
      await routesApi.reviewTripPlan(selectedPlanningOrder.id, {
        status: 'approved',
      });
      toast.success(
        language === 'en'
          ? `Saved & locked route plan for ${selectedPlanningOrder.requestCode}! Ready to assign driver & vet.`
          : `Đã lưu & chốt kế hoạch lộ trình ${selectedPlanningOrder.requestCode}! Sẵn sàng phân công tài xế & bác sĩ thú y.`
      );
      setIsDetailModalOpen(false);
      await loadMasterDataAndOrders();
    } catch (err: any) {
      toast.error(err?.message || (language === 'en' ? 'Failed to save & lock route plan' : 'Lỗi khi lưu & chốt kế hoạch lộ trình'));
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Flow 5: Save Emergency Reroute (never calls submitPlanForApproval when plan is in_transit)
  const handleSaveEmergencyReroute = async () => {
    if (!selectedPlanningOrder || isSubmittingPlan) return;
    if (legs.length === 0) {
      toast.error(t('coordinator.routes.errNeedOneLegGeneral', 'Vui lòng dựng ít nhất 1 chặng vận chuyển!'));
      return;
    }

    const currentPlanStatus = selectedPlanningOrder.routeDetail?.planStatus;
    const isInTransitRoute =
      currentPlanStatus === 'in_transit' || selectedPlanningOrder.status === 'in_transit';

    setIsSubmittingPlan(true);
    try {
      const preparedStops = await resolveStopsBeforeSubmission(stops);
      // 1. Save new plan with modified legs (updates pending legs directly when in_transit)
      await routesApi.buildDetailedPlan(selectedPlanningOrder.id, {
        routeName: planRouteName,
        totalDistanceKm: Number(planTotalDistanceKm) || sumLegsDistanceKm(legs, 500),
        legs,
        stops: preparedStops,
        notes: notes.trim() || undefined,
      });

      // 2. Resolve the active incident
      if (selectedPlanningOrder.routeDetail?.activeIncident?.id) {
        await routesApi.resolveIncident(selectedPlanningOrder.routeDetail.activeIncident.id);
      }

      // 3. Only approve directly if route was still in draft/pending_approval (never submitPlanForApproval on in_transit!)
      if (!isInTransitRoute && (currentPlanStatus === 'draft' || currentPlanStatus === 'pending_approval')) {
        await routesApi.reviewTripPlan(selectedPlanningOrder.id, { status: 'approved' });
      }

      toast.success(
        language === 'en'
          ? 'Saved emergency detour route & resolved incident! Updated legs are now active.'
          : 'Đã lưu lộ trình tránh sự cố & đóng cảnh báo thành công! Tài xế đã nhận lộ trình cập nhật mới.'
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
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {language === 'en' ? 'Confirm & Dispatch Transport Routes' : 'Xác Nhận Lộ Trình & Điều Phối Thực Thi'}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17]">
              {planningOrders.length} {language === 'en' ? 'orders' : 'đơn vận chuyển'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {language === 'en'
              ? 'Review quote-suggested road/air/sea legs and reserved vehicles, fill flight/vessel booking refs, and lock the plan in one step.'
              : 'Kiểm tra lộ trình tự nạp từ báo giá khách đặt (đường bộ / hàng không / đường thủy), điền số chuyến bay hoặc booking tàu và chốt kế hoạch trong 1 bước.'}
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

      {/* FLOW 3 ORDERS LIST */}
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
              <span>
                {language === 'en'
                  ? 'Auto-filled from quote → Verify legs & booking ref → Save & Lock Plan'
                  : 'Tự nạp từ báo giá → Kiểm tra chặng & mã đặt chỗ → Lưu & Chốt kế hoạch'}
              </span>
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
                              ? language === 'en'
                                ? 'Confirm Route'
                                : 'Xác nhận lộ trình'
                              : t('coordinator.routes.viewEditLegsBtn', 'Xem & Hiệu chỉnh chặng')}
                          </Button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Concise Transport & Booking Metadata Bar */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold border ${
                        order.transportMode === 'sea'
                          ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                          : order.transportMode === 'air'
                          ? 'bg-[#FAF8F4] text-[#7A591C] border-[#DFCA9A]'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {order.transportMode === 'sea' ? (
                        <Ship size={13} />
                      ) : order.transportMode === 'air' ? (
                        <Plane size={13} />
                      ) : (
                        <Truck size={13} />
                      )}
                      {order.transportMode === 'sea'
                        ? language === 'en'
                          ? 'Sea Freight (Dedicated Vessel)'
                          : 'Đường thủy (Tàu biển)'
                        : order.transportMode === 'air'
                        ? language === 'en'
                          ? 'Air Cargo'
                          : 'Đường hàng không'
                        : language === 'en'
                        ? 'Road Transit'
                        : 'Đường bộ liên vận'}
                    </span>
                    {order.tripType === 'round_trip' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <RotateCcw size={12} />
                        {language === 'en' ? 'Round-Trip' : 'Khứ hồi'}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-slate-50 text-slate-700 border border-slate-200">
                      <Clock size={12} className="text-slate-400" />
                      {language === 'en' ? 'Departure:' : 'Ngày đi:'} <strong>{order.departureDate || '—'}</strong>
                    </span>
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
                        {t('coordinator.routes.routeNameLabel', 'Tên tuyến:')} <strong>{route?.routeName || t('coordinator.routes.unnamed', 'Chưa đặt tên')}</strong> • {t('coordinator.routes.distanceLabel', 'Cự ly:')} <strong>{route?.totalDistanceKm ? `${route.totalDistanceKm} km` : '—'}</strong>
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
                                  : (leg.legType as string) === 'sea'
                                    ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {leg.legType === 'flight'
                                ? (language === 'en' ? '✈️ Flight: ' : '✈️ Bay: ')
                                : (leg.legType as string) === 'sea'
                                  ? (language === 'en' ? '🚢 Sea: ' : '🚢 Tàu: ')
                                  : (language === 'en' ? '🚚 Truck: ' : '🚚 Xe: ')}
                              {leg.legType === 'flight'
                                ? `${leg.flightNumber || 'Flight'} (${leg.departureAirportCode || 'SGN'} → ${leg.arrivalAirportCode || 'SIN'})`
                                : (leg.legType as string) === 'sea'
                                  ? `${leg.originLocation || ''} → ${leg.destinationLocation || ''}`
                                  : `${leg.vehiclePlate || (language === 'en' ? 'Truck' : 'Xe tải')}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic m-0 mt-1">{t('coordinator.routes.noLegsBuilt', 'Chưa có chặng nào được dựng. Vui lòng bấm "Xác nhận lộ trình".')}</p>
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

      {/* MODAL: XÁC NHẬN / HIỆU CHỈNH LỘ TRÌNH CHI TIẾT */}
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
                        : selectedPlanningOrder.transportMode === 'sea'
                          ? t('manager.requests.modeSea', language === 'en' ? 'Sea Freight' : 'Đường thủy')
                          : t('manager.requests.modeAir', language === 'en' ? 'Air Cargo' : 'Hàng không')
                    }`
                  : ''}
              </p>
              {/* Step 9: phương án xe khách đã chọn + xe đang giữ chỗ, đổi xe bắt buộc lý do */}
              <ReservedVehiclesPanel shipmentId={selectedPlanningOrder.id} onChanged={() => void loadMasterDataAndOrders()} />
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

            {/* 1. Quote-Driven Route Toolbar */}
            {!isReadOnlyModal && (
              <div className="p-4 bg-gradient-to-r from-slate-50 to-[#FAF8F4] border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wide flex-wrap">
                      <Compass size={15} className="text-[#A67C2E]" />
                      <span>{language === 'en' ? 'Quote-Driven Route Setup' : 'Tự Nạp Lộ Trình Từ Báo Giá Khách Đặt'}</span>
                      {suggestionSource && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold normal-case">
                          {suggestionSource === 'quote_route_plan' || suggestionSource === 'quote_legs'
                            ? language === 'en'
                              ? 'Synced from quote'
                              : 'Đã nạp từ báo giá'
                            : language === 'en'
                            ? 'Matched by order mode'
                            : 'Khớp phương thức đơn'}
                        </span>
                      )}
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
                      variant="primary"
                      size="sm"
                      disabled={isLoadingSuggestion}
                      onClick={() => void loadDraftSuggestionForOrder(selectedPlanningOrder, true)}
                      className="text-xs bg-[#181A17] hover:bg-[#242722] text-white flex items-center gap-1.5 font-bold shadow-sm"
                    >
                      {isLoadingSuggestion ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} className="text-[#DFCA9A]" />
                      )}
                      <span>{language === 'en' ? 'Reload from Quote' : 'Nạp lại theo báo giá'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoadingSuggestion}
                      onClick={() => applySmartRouteSuggestion(selectedPlanningOrder, 'road', true)}
                      className="text-xs text-emerald-800 border-emerald-300 bg-white hover:bg-emerald-50 flex items-center gap-1 font-bold shadow-sm"
                    >
                      <Truck size={12} className="text-emerald-700" />
                      <span>{language === 'en' ? 'Road' : 'Đường bộ'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoadingSuggestion}
                      onClick={() => applySmartRouteSuggestion(selectedPlanningOrder, 'air', true)}
                      className="text-xs text-[#181A17] border-[#D4C5A3] bg-white hover:bg-[#FAF5EB] flex items-center gap-1 font-bold shadow-sm"
                    >
                      <Plane size={12} className="text-[#A67C2E]" />
                      <span>{language === 'en' ? 'Air' : 'Hàng không'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoadingSuggestion}
                      onClick={() => applySmartRouteSuggestion(selectedPlanningOrder, 'sea', true)}
                      className="text-xs text-cyan-800 border-cyan-300 bg-white hover:bg-cyan-50 flex items-center gap-1 font-bold shadow-sm"
                    >
                      <Ship size={12} className="text-cyan-700" />
                      <span>{language === 'en' ? 'Sea' : 'Đường thủy'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoadingSuggestion}
                      onClick={handleResetToManualForm}
                      className="text-xs text-slate-700 border-slate-300 hover:bg-white flex items-center gap-1 font-semibold shadow-sm"
                      title={t('coordinator.routes.resetFormTitle', 'Thiết lập lại form để tự do điền thông số từ đầu')}
                    >
                      <RotateCcw size={12} />
                      <span>{language === 'en' ? 'Reset' : 'Làm mới'}</span>
                    </Button>
                  </div>
                </div>
                {isLoadingSuggestion && (
                  <div className="flex items-center gap-2 text-xs text-[#A67C2E] font-semibold">
                    <Loader2 size={14} className="animate-spin" />
                    <span>
                      {language === 'en'
                        ? 'Loading quote-driven route legs, reserved vehicles and stops...'
                        : 'Đang nạp đề xuất chặng, xe đã giữ chỗ và trạm dừng từ báo giá...'}
                    </span>
                  </div>
                )}
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
                    {language === 'en'
                      ? 'Multi-Modal Transport Legs (Road / Air / Sea)'
                      : 'Các Chặng Vận Chuyển Đa Phương Thức (Đường bộ / Hàng không / Đường thủy)'}
                  </h4>
                  <p className="text-xs text-slate-500 m-0">
                    {language === 'en'
                      ? 'Verify vehicle plates, airline flight/AWB details, or sea vessel booking refs & pen counts.'
                      : 'Xác nhận biển số xe chuyên dụng, số chuyến bay/AWB hoặc mã booking tàu biển & số ô chuồng tàu.'}
                  </p>
                </div>
                {!isReadOnlyModal && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddLeg('road', 'outbound')}
                      className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <Truck size={13} className="mr-1" /> {language === 'en' ? 'Add Road Leg' : 'Thêm Chặng Bộ'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddLeg('flight', 'outbound')}
                      className="text-xs text-[#181A17] border-[#D4C5A3] hover:bg-[#FAF8F4]"
                    >
                      <Plane size={13} className="mr-1" /> {language === 'en' ? 'Add Flight Leg' : 'Thêm Chặng Bay'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddLeg('sea', 'outbound')}
                      className="text-xs text-cyan-800 border-cyan-300 hover:bg-cyan-50"
                    >
                      <Ship size={13} className="mr-1" /> {language === 'en' ? 'Add Sea Leg' : 'Thêm Chặng Tàu Biển'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleAddLeg(
                          selectedPlanningOrder.transportMode === 'air'
                            ? 'flight'
                            : selectedPlanningOrder.transportMode === 'sea'
                              ? 'sea'
                              : 'road',
                          'return'
                        )
                      }
                      className="text-xs text-amber-800 border-amber-300 bg-amber-50/50 hover:bg-amber-100"
                    >
                      <RotateCcw size={13} className="mr-1" /> {language === 'en' ? 'Add Return Leg' : 'Thêm Chặng Về'}
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
                        : leg.legType === 'sea'
                        ? 'bg-cyan-50/50 border-cyan-200'
                        : 'bg-emerald-50/40 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                          {leg.sequenceNo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            leg.legType === 'flight'
                              ? 'bg-[#F3EFE4] text-[#181A17]'
                              : leg.legType === 'sea'
                              ? 'bg-cyan-100 text-cyan-900'
                              : 'bg-emerald-200 text-emerald-900'
                          }`}
                        >
                          {leg.legType === 'flight'
                            ? t('coordinator.routes.flightLegTitle', '✈️ Chặng Đường Hàng Không')
                            : leg.legType === 'sea'
                            ? language === 'en'
                              ? '🚢 Sea Freight Leg'
                              : '🚢 Chặng Tàu Biển'
                            : t('coordinator.routes.roadLegTitle', '🚚 Chặng Đường Bộ')}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            leg.direction === 'return'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-100 text-blue-900 border border-blue-300'
                          }`}
                        >
                          {leg.direction === 'return' ? (language === 'en' ? 'Return Leg' : 'Chặng Về') : (language === 'en' ? 'Outbound Leg' : 'Chặng Đi')}
                        </span>
                        {!isReadOnlyModal && (
                          <select
                            aria-label={language === 'en' ? 'Leg direction' : 'Chiều chặng'}
                            value={leg.direction || 'outbound'}
                            onChange={(e) => {
                              const dir = e.target.value as 'outbound' | 'return';
                              setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, direction: dir } : l)));
                            }}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 bg-white cursor-pointer"
                          >
                            <option value="outbound">{language === 'en' ? 'Outbound' : 'Chặng Đi'}</option>
                            <option value="return">{language === 'en' ? 'Return' : 'Chặng Về'}</option>
                          </select>
                        )}
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

                    <fieldset disabled={isReadOnlyModal} className="m-0 p-0 border-0">
                    {/* Road Leg details */}
                    {leg.legType === 'road' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">{t('coordinator.routes.vehicleDedicated', 'Phương Tiện / Xe Chuyên Dụng *')}</label>
                          {(() => {
                            const destClean = (leg.destinationLocation || selectedPlanningOrder?.destination || 'Địa điểm đích').split(',')[0].trim();
                            const partnerOption =
                              leg.vehiclePlate &&
                              (leg.vehiclePlate.includes('Trạm Đối tác') ||
                                leg.vehiclePlate.includes('Partner Depot') ||
                                leg.vehiclePlate.includes('đến đón') ||
                                leg.vehiclePlate.includes('đến rước'))
                                ? leg.vehiclePlate
                                : leg.partnerDepotName
                                  ? language === 'en'
                                    ? `Partner Depot: ${leg.partnerDepotName}`
                                    : `Trạm Đối tác: ${leg.partnerDepotName}`
                                  : language === 'en'
                                    ? `Partner / Consignee Pickup (${destClean})`
                                    : `Điều phối Trạm Đối tác / Bên nhận đón (${destClean})`;
                            const legDir = leg.direction || 'outbound';
                            const dirLegs = legs.filter((l) => (l.direction || 'outbound') === legDir);
                            const firstCrossSeqInDir = dirLegs
                              .filter((l) => l.legType === 'flight' || l.legType === 'sea')
                              .reduce<number | null>(
                                (min, l) => (min === null || l.sequenceNo < min ? l.sequenceNo : min),
                                null,
                              );
                            const isOverseasOrLastMile =
                              Boolean(leg.isOverseasPartnerRoad) ||
                              (firstCrossSeqInDir !== null &&
                                (legDir === 'outbound'
                                  ? leg.sequenceNo > firstCrossSeqInDir
                                  : leg.sequenceNo < firstCrossSeqInDir));

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
                                    <optgroup label={t('coordinator.routes.overseasVehicleGroup', 'Bàn giao Trạm Đối tác / Đầu nước ngoài')}>
                                      <option value={partnerOption}>
                                        🚗 {partnerOption}
                                      </option>
                                    </optgroup>
                                  )}
                                  <optgroup label={t('coordinator.routes.domesticFleetGroup', 'Đội xe tải chuyên dụng nội bộ (Việt Nam)')}>
                                    {(() => {
                                      const availableRoadFleet = vehicles
                                        .filter((v) => {
                                          const typeText = String(v.type || '').toLowerCase();
                                          const classCode = String((v as any).vehicleClassCode || '').toLowerCase();
                                          if (typeText.includes('air') || typeText.includes('máy bay') || typeText.includes('chuồng bay')) return false;
                                          if (typeText.includes('container') || typeText.includes('tàu biển') || classCode === 'vessel_pen' || classCode === 'jet_stall') return false;
                                          return true;
                                        })
                                        .filter((v) => {
                                          const isCurrentLegVehicle = v.code === leg.vehiclePlate;
                                          const isCurrentTripVehicle =
                                            Boolean(v.assignedTripCode) &&
                                            v.assignedTripCode === selectedPlanningOrder?.requestCode;
                                          const isReservedOnly = Boolean((v as any).isReservedOnly);
                                          const shipStatus = String((v as any).assignedShipmentStatus || '').toLowerCase();
                                          const isActuallyInTransit =
                                            v.status === 'in_use' &&
                                            !isCurrentLegVehicle &&
                                            !isCurrentTripVehicle &&
                                            !isReservedOnly &&
                                            (!shipStatus || shipStatus === 'in_transit' || shipStatus === 'return_pending');
                                          return !isActuallyInTransit;
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
                                      const convoyTotalCapacity = vehicles
                                        .filter((v) => Boolean(v.assignedTripCode) && v.assignedTripCode === selectedPlanningOrder?.requestCode)
                                        .reduce((sum, v) => sum + Number(v.capacity || 0), 0);

                                      return availableRoadFleet.map((v) => {
                                        const isCurrentTrip =
                                          v.code === leg.vehiclePlate ||
                                          (Boolean(v.assignedTripCode) && v.assignedTripCode === selectedPlanningOrder?.requestCode);
                                        const effectiveCap =
                                          isCurrentTrip && convoyTotalCapacity > Number(v.capacity || 0)
                                            ? convoyTotalCapacity
                                            : Number(v.capacity || 0);
                                        const isUnderCapacity = effectiveCap < requiredStalls;
                                        return (
                                          <option key={v.id} value={v.code} disabled={Boolean(isUnderCapacity) && !isCurrentTrip}>
                                            {v.code} — {translateVehicleType(v.type)} ({v.capacity} stall, {v.location}){' '}
                                            {isUnderCapacity
                                              ? `— ⚠️ ${language === 'en' ? `Insufficient stalls (${v.capacity}/${requiredStalls})` : `Không đủ chuồng (${v.capacity}/${requiredStalls} ngựa)`}`
                                              : isCurrentTrip && v.status === 'in_use'
                                              ? `— (${language === 'en' ? 'Reserved / In use for this trip' : 'Đã giữ chỗ / Đang dùng cho đơn này'})`
                                              : `— ${language === 'en' ? 'Available' : 'Sẵn sàng'}`}
                                          </option>
                                        );
                                      });
                                    })()}
                                  </optgroup>
                                </select>
                                {(() => {
                                  // Step 9: đơn có xe đã giữ chỗ mà chặng chọn xe khác → bắt buộc lý do
                                  const reservedCodes = vehicles
                                    .filter((v) => Boolean(v.assignedTripCode) && v.assignedTripCode === selectedPlanningOrder?.requestCode)
                                    .map((v) => v.code);
                                  const needsReason = Boolean(leg.vehicleId) && reservedCodes.length > 0 && !reservedCodes.includes(leg.vehiclePlate ?? '');
                                  if (!needsReason) return null;
                                  return (
                                    <div className="mt-1.5">
                                      <label htmlFor={`leg-override-${idx}`} className="block text-[11px] font-semibold text-[#8B6724] mb-0.5">
                                        {language === 'en' ? 'Reason for using a different vehicle than reserved *' : 'Lý do dùng xe khác xe đã giữ chỗ *'}
                                      </label>
                                      <input
                                        id={`leg-override-${idx}`}
                                        value={leg.allocationOverrideReason ?? ''}
                                        maxLength={255}
                                        onChange={(e) =>
                                          setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, allocationOverrideReason: e.target.value } : item)))
                                        }
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#DFCA9A] bg-white text-xs"
                                        placeholder={language === 'en' ? 'e.g. reserved vehicle broke down' : 'VD: xe đã giữ bị hỏng đột xuất'}
                                      />
                                    </div>
                                  );
                                })()}
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
                              <label className="font-bold text-slate-700 block mb-1">
                                {language === 'en' ? 'Jet Stalls (3 horses/stall)' : 'Số thùng bay (Jet Stall — 3 ngựa/thùng)'}
                              </label>
                              <input
                                type="number"
                                min={Math.max(1, Math.ceil((selectedPlanningOrder.horseCount || 1) / 3))}
                                value={leg.stallsBooked || Math.max(1, Math.ceil((selectedPlanningOrder.horseCount || 1) / 3))}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  setLegs((prev) => prev.map((item, i) => (i === idx ? { ...item, stallsBooked: num } : item)));
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                {language === 'en'
                                  ? `Min ${Math.max(1, Math.ceil((selectedPlanningOrder.horseCount || 1) / 3))} stall(s) for ${selectedPlanningOrder.horseCount || 1} horse(s)`
                                  : `Tối thiểu ${Math.max(1, Math.ceil((selectedPlanningOrder.horseCount || 1) / 3))} thùng cho ${selectedPlanningOrder.horseCount || 1} ngựa`}
                              </span>
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

                    {/* Sea Leg details */}
                    {leg.legType === 'sea' && (
                      <fieldset disabled={isReadOnlyModal} className="m-0 p-0 border-0 mt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Departure Seaport *' : 'Cảng đi *'}
                            </label>
                            <input
                              type="text"
                              value={leg.originLocation || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLegs((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, originLocation: val } : item))
                                );
                              }}
                              placeholder={language === 'en' ? 'e.g. Cat Lai Port, HCMC' : 'VD: Cảng Cát Lái, TP.HCM'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white font-semibold disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Arrival Seaport *' : 'Cảng đến *'}
                            </label>
                            <input
                              type="text"
                              value={leg.destinationLocation || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLegs((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, destinationLocation: val } : item))
                                );
                              }}
                              placeholder={language === 'en' ? 'e.g. Pasir Panjang Port, Singapore' : 'VD: Cảng Pasir Panjang, Singapore'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white font-semibold disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Vessel Booking / B/L Ref (Optional)' : 'Mã booking tàu / B/L (Tùy chọn)'}
                            </label>
                            <input
                              type="text"
                              value={leg.bookingReference || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLegs((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, bookingReference: val } : item))
                                );
                              }}
                              placeholder={language === 'en' ? 'e.g. BL-EQV-2026-001' : 'VD: BL-EQV-2026-001'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Vessel Pens Booked (vessel_pen) *' : 'Số ô chuồng tàu (vessel_pen) *'}
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={leg.stallsBooked || selectedPlanningOrder.horseCount || 1}
                              onChange={(e) => {
                                const num = Math.max(1, Number(e.target.value));
                                setLegs((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, stallsBooked: num } : item))
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white font-semibold disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Voyage Distance (km)' : 'Cự ly hải trình (km)'}
                            </label>
                            <input
                              type="number"
                              min={10}
                              value={leg.distanceKm || 1200}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                setLegs((prev) => {
                                  const updated = prev.map((item, i) =>
                                    i === idx ? { ...item, distanceKm: num } : item
                                  );
                                  setPlanTotalDistanceKm(sumLegsDistanceKm(updated, planTotalDistanceKm));
                                  return updated;
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white font-semibold disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              {language === 'en' ? 'Voyage Duration (hours)' : 'Thời gian hải trình (giờ)'}
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={1}
                              value={leg.durationHours || 36}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                setLegs((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, durationHours: num } : item))
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-300 bg-white font-semibold disabled:bg-slate-50"
                            />
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
                    {language === 'en'
                      ? 'Add veterinary checkpoints, border gates, and rest stations (pick from GPS-ready catalog or enter manually — drivers check in via GPS geofence).'
                      : 'Bổ sung trạm kiểm dịch thú y, cửa khẩu và trạm dừng nghỉ (chọn từ danh mục có sẵn tọa độ GPS hoặc tự điền để tài xế check-in bằng GPS).'}
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

              {/* Master Stop Catalog Picker */}
              {!isReadOnlyModal && masterStops.length > 0 && (() => {
                const q = stopCatalogSearch.trim().toLowerCase();
                const filteredCatalog = masterStops.filter((ms) => {
                  if (stopCatalogTypeFilter !== 'all' && ms.stopType !== stopCatalogTypeFilter) return false;
                  if (!q) return true;
                  return (
                    ms.name.toLowerCase().includes(q) ||
                    (ms.country || '').toLowerCase().includes(q) ||
                    (ms.city || '').toLowerCase().includes(q) ||
                    (ms.address || '').toLowerCase().includes(q)
                  );
                });
                const chosenMaster = masterStops.find((ms) => String(ms.id) === selectedMasterStopId);
                return (
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 flex flex-col gap-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5">
                        <MapPin size={13} className="text-amber-700" />
                        {language === 'en'
                          ? `Select from Standard Stop Catalog (${filteredCatalog.length}/${masterStops.length} GPS-ready stops)`
                          : `Chọn nhanh từ Danh mục Trạm chuẩn (${filteredCatalog.length}/${masterStops.length} trạm có sẵn tọa độ GPS)`}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {(['all', 'border_check', 'quarantine', 'rest', 'refuel'] as const).map((tp) => {
                          const count = tp === 'all'
                            ? masterStops.length
                            : masterStops.filter((m) => m.stopType === tp).length;
                          if (tp !== 'all' && count === 0) return null;
                          const label =
                            tp === 'all'
                              ? language === 'en' ? 'All' : 'Tất cả'
                              : translateStopType(tp);
                          return (
                            <button
                              key={tp}
                              type="button"
                              onClick={() => {
                                setStopCatalogTypeFilter(tp);
                                setSelectedMasterStopId('');
                              }}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                                stopCatalogTypeFilter === tp
                                  ? 'bg-amber-700 text-white border-amber-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-100'
                              }`}
                            >
                              {label} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={stopCatalogSearch}
                          onChange={(e) => {
                            setStopCatalogSearch(e.target.value);
                            setSelectedMasterStopId('');
                          }}
                          placeholder={language === 'en' ? 'Filter by name, city, country...' : 'Lọc tên trạm, tỉnh, quốc gia...'}
                          className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-amber-200 bg-white text-xs focus:border-amber-500 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <select
                          aria-label={language === 'en' ? 'Choose a catalog stop' : 'Chọn trạm từ danh mục'}
                          value={selectedMasterStopId}
                          onChange={(e) => setSelectedMasterStopId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white text-xs font-medium text-slate-800 focus:border-amber-500 outline-none"
                        >
                          <option value="">
                            {filteredCatalog.length === 0
                              ? (language === 'en' ? '-- No matching catalog stops --' : '-- Không tìm thấy trạm phù hợp --')
                              : (language === 'en' ? '-- Select a catalog stop to add --' : '-- Chọn trạm mẫu để thêm vào tuyến --')}
                          </option>
                          {filteredCatalog.map((ms) => (
                            <option key={ms.id} value={String(ms.id)}>
                              [{translateStopType(ms.stopType)}] {ms.name} — {ms.country}
                              {ms.city ? ` (${ms.city})` : ''}
                              {ms.lat != null && ms.lng != null ? ' • GPS ✓' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!chosenMaster}
                          onClick={() => {
                            if (!chosenMaster) return;
                            handleAddStop(chosenMaster);
                            setSelectedMasterStopId('');
                          }}
                          className="w-full bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold h-full py-1.5"
                        >
                          <Plus size={13} className="mr-1" />
                          {language === 'en' ? 'Add' : 'Thêm'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Stops Table */}
              <fieldset disabled={isReadOnlyModal} className="m-0 p-0 border-0">
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5 w-10 text-center">#</th>
                      <th className="p-2.5">{t('coordinator.routes.stopNameCol', 'Tên Trạm / Điểm Kiểm Dịch')}</th>
                      <th className="p-2.5 w-36">{t('coordinator.routes.stopTypeCol', 'Loại Trạm')}</th>
                      <th className="p-2.5 w-28">{t('coordinator.routes.countryCol', 'Quốc Gia')}</th>
                      <th className="p-2.5 w-40">{language === 'en' ? 'GPS Geofence' : 'Tọa Độ GPS'}</th>
                      <th className="p-2.5 w-12 text-center">{t('common.delete', 'Xóa')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stops.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                          {language === 'en'
                            ? 'No checkpoints added yet. Pick a GPS-ready stop from the catalog above or add a manual stop.'
                            : 'Chưa có trạm dừng nào. Chọn trạm từ danh mục có sẵn tọa độ GPS ở trên hoặc bấm "Thêm Trạm Mới (Tự Điền)".'}
                        </td>
                      </tr>
                    )}
                    {stops.map((stop, idx) => {
                      const hasGps =
                        stop.lat !== null &&
                        stop.lat !== undefined &&
                        stop.lng !== null &&
                        stop.lng !== undefined &&
                        Number.isFinite(Number(stop.lat)) &&
                        Number.isFinite(Number(stop.lng));
                      const radiusM = stop.geofenceRadiusM || defaultStopGeofenceM(stop.stopType);
                      return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 text-center font-bold text-slate-500">{stop.sequenceNo}</td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={stop.locationName}
                            placeholder={language === 'en' ? 'Enter stop / border / quarantine name...' : 'Nhập tên trạm nghỉ / cửa khẩu / kiểm dịch...'}
                            disabled={isReadOnlyModal}
                            onChange={(e) => {
                              const val = e.target.value;
                              const exactMaster = masterStops.find(
                                (ms) => ms.name.trim().toLowerCase() === val.trim().toLowerCase()
                              );
                              setStops((prev) =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  if (exactMaster) {
                                    return {
                                      ...item,
                                      locationName: val,
                                      country: item.country?.trim() || exactMaster.country,
                                      lat: exactMaster.lat ?? null,
                                      lng: exactMaster.lng ?? null,
                                      locationRefType: 'master_stop',
                                      locationRefId: exactMaster.id,
                                    };
                                  }
                                  const changedFromLinked = item.locationName !== val;
                                  return {
                                    ...item,
                                    locationName: val,
                                    ...(changedFromLinked
                                      ? { lat: null, lng: null, locationRefType: 'manual' as const, locationRefId: null }
                                      : {}),
                                  };
                                })
                              );
                            }}
                            onBlur={() => {
                              if (!isReadOnlyModal && !hasGps && stop.locationName.trim().length >= 4) {
                                void handleGeocodeStop(idx, true);
                              }
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-medium disabled:bg-slate-50 disabled:text-slate-600"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={stop.stopType}
                            disabled={isReadOnlyModal}
                            onChange={(e) => {
                              const val = e.target.value as RouteStopItem['stopType'];
                              setStops((prev) =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const prevDefault = defaultStopGeofenceM(item.stopType);
                                  const nextRadius =
                                    item.geofenceRadiusM == null || item.geofenceRadiusM === prevDefault
                                      ? defaultStopGeofenceM(val)
                                      : item.geofenceRadiusM;
                                  return { ...item, stopType: val, geofenceRadiusM: nextRadius };
                                })
                              );
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-semibold disabled:bg-slate-50 disabled:text-slate-600"
                          >
                            <option value="rest">{translateStopType('rest')}</option>
                            <option value="quarantine">{translateStopType('quarantine')}</option>
                            <option value="border_check">{translateStopType('border_check')}</option>
                            {stop.stopType === 'transfer_hub' && (
                              <option value="transfer_hub" disabled>
                                {language === 'en' ? 'Transfer Hub (Legacy)' : 'Điểm ghép cũ (Transfer Hub)'}
                              </option>
                            )}
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
                            onBlur={() => {
                              if (!isReadOnlyModal && !hasGps && stop.locationName.trim().length >= 4) {
                                void handleGeocodeStop(idx, true);
                              }
                            }}
                            disabled={isReadOnlyModal}
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs disabled:bg-slate-50 disabled:text-slate-600"
                          />
                        </td>
                        <td className="p-2.5">
                          {editingCoordsStopIdx === idx && !isReadOnlyModal ? (
                            <div className="flex flex-col gap-1">
                              <div className="grid grid-cols-2 gap-1">
                                <input
                                  type="number"
                                  step="0.0001"
                                  aria-label={language === 'en' ? 'Latitude' : 'Vĩ độ'}
                                  placeholder="Lat"
                                  value={manualLatInput}
                                  onChange={(e) => setManualLatInput(e.target.value)}
                                  className="w-full px-1.5 py-0.5 rounded border border-slate-300 text-[11px] font-mono bg-white"
                                />
                                <input
                                  type="number"
                                  step="0.0001"
                                  aria-label={language === 'en' ? 'Longitude' : 'Kinh độ'}
                                  placeholder="Lng"
                                  value={manualLngInput}
                                  onChange={(e) => setManualLngInput(e.target.value)}
                                  className="w-full px-1.5 py-0.5 rounded border border-slate-300 text-[11px] font-mono bg-white"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveManualStopCoords(idx)}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] cursor-pointer"
                                >
                                  {language === 'en' ? 'Apply' : 'Lưu'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCoordsStopIdx(null)}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[10px] cursor-pointer"
                                >
                                  {language === 'en' ? 'Cancel' : 'Hủy'}
                                </button>
                              </div>
                            </div>
                          ) : hasGps ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                title={`${Number(stop.lat).toFixed(5)}, ${Number(stop.lng).toFixed(5)} • Geofence ${radiusM}m`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px] w-fit"
                              >
                                <MapPin size={11} />
                                GPS ✓ ({radiusM}m)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {Number(stop.lat).toFixed(4)}, {Number(stop.lng).toFixed(4)}
                                </span>
                                {!isReadOnlyModal && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCoordsStopIdx(idx);
                                      setManualLatInput(String(stop.lat ?? ''));
                                      setManualLngInput(String(stop.lng ?? ''));
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-amber-700 underline cursor-pointer bg-transparent border-0 p-0"
                                  >
                                    {language === 'en' ? 'Edit' : 'Sửa'}
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                title={
                                  language === 'en'
                                    ? 'Without GPS coordinates, driver check-in will be flagged as unverified'
                                    : 'Chưa có tọa độ GPS: tài xế check-in sẽ không đối chiếu được geofence và bị gắn cờ'
                                }
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium text-[11px]"
                              >
                                {language === 'en' ? 'No GPS' : 'Chưa có GPS'}
                              </span>
                              {!isReadOnlyModal && stop.locationName.trim().length >= 3 && (
                                <button
                                  type="button"
                                  disabled={geocodingStopIdx === idx}
                                  onClick={() => void handleGeocodeStop(idx, false)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                                >
                                  {geocodingStopIdx === idx ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <Compass size={10} />
                                  )}
                                  {language === 'en' ? 'Locate' : 'Định vị'}
                                </button>
                              )}
                              {!isReadOnlyModal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCoordsStopIdx(idx);
                                    setManualLatInput('');
                                    setManualLngInput('');
                                  }}
                                  className="text-[10px] text-amber-800 hover:underline font-semibold cursor-pointer bg-transparent border-0 p-0"
                                >
                                  {language === 'en' ? 'Lat/Lng' : 'Nhập tọa độ'}
                                </button>
                              )}
                            </div>
                          )}
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
                      );
                    })}
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
                    {language === 'en'
                      ? 'Updating detour route for active incident. Changes apply immediately to remaining pending legs.'
                      : 'Đang hiệu chỉnh lộ trình tránh sự cố. Thay đổi sẽ được áp dụng ngay cho các chặng kế tiếp.'}
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
                      onClick={() => void handleSaveEmergencyReroute()}
                      disabled={isSubmittingPlan || legs.length === 0}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 shadow-sm text-xs flex items-center gap-1.5"
                    >
                      <Send size={14} />
                      <span>{isSubmittingPlan ? t('coordinator.routes.submittingApproval', 'Đang lưu...') : (language === 'en' ? 'Save & Apply Detour' : 'Lưu & Áp Dụng Lộ Trình Mới')}</span>
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
                    disabled={isSubmittingPlan || isLoadingSuggestion}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold px-4 py-2 text-xs whitespace-nowrap"
                  >
                    {t('coordinator.routes.saveDraftBtn', 'Lưu Bản Nháp')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSaveAndApprovePlan()}
                    disabled={isSubmittingPlan || isLoadingSuggestion || legs.length === 0}
                    className="bg-[#287653] hover:bg-[#1f5e42] text-white font-bold px-5 py-2 shadow-sm text-xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>
                      {isSubmittingPlan
                        ? language === 'en'
                          ? 'Saving & Locking...'
                          : 'Đang lưu & chốt...'
                        : language === 'en'
                        ? 'Save & Lock Plan'
                        : 'Lưu & Chốt Kế Hoạch'}
                    </span>
                  </Button>
                </div>
              </div>
            );
          })()}
          </Modal>
        );
      })()}
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
