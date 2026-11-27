'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plane,
  Truck,
  Ship,
  Navigation,
  Info,
  Clock,
  MapPin,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

import {
  buildEquineRoute,
  calculateHaversine,
  estimateLegPriceVnd,
  geocodeAddress,
  GeocodedLocation,
  normalizeVietnamese,
  RouteCalculationResult,
  RouteLegPreview,
  Waypoint,
} from '@/lib/geo-corridors';

function escapeMapHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RoutePreset {
  id: string;
  name: string;
  nameEn?: string;
  flag: string;
  origin: string;
  originEn?: string;
  destination: string;
  destinationEn?: string;
  suggestedMode: 'air' | 'road';
  type: 'International' | 'Domestic';
}

export const ROUTE_PRESETS: RoutePreset[] = [
  {
    id: 'sg',
    name: 'TP.HCM ➔ Singapore (Turf Club)',
    nameEn: 'HCMC ➔ Singapore (Turf Club)',
    flag: '🇸🇬',
    origin: 'Trang trại Củ Chi, TP.HCM',
    originEn: 'Cu Chi Horse Farm, HCMC',
    destination: 'Singapore Turf Club, Kranji, Singapore',
    destinationEn: 'Singapore Turf Club, Kranji, Singapore',
    suggestedMode: 'air',
    type: 'International',
  },
  {
    id: 'my',
    name: 'TP.HCM ➔ Malaysia (Selangor)',
    nameEn: 'HCMC ➔ Malaysia (Selangor)',
    flag: '🇲🇾',
    origin: 'Trang trại Củ Chi, TP.HCM',
    originEn: 'Cu Chi Horse Farm, HCMC',
    destination: 'Selangor Turf Club, Kuala Lumpur, Malaysia',
    destinationEn: 'Selangor Turf Club, Kuala Lumpur, Malaysia',
    suggestedMode: 'air',
    type: 'International',
  },
  {
    id: 'th',
    name: 'TP.HCM ➔ Thái Lan (Bangkok)',
    nameEn: 'HCMC ➔ Thailand (Bangkok)',
    flag: '🇹🇭',
    origin: 'Trang trại Củ Chi, TP.HCM',
    originEn: 'Cu Chi Horse Farm, HCMC',
    destination: 'Royal Bangkok Sports Club, Bangkok, Thái Lan',
    destinationEn: 'Royal Bangkok Sports Club, Bangkok, Thailand',
    suggestedMode: 'road',
    type: 'International',
  },
  {
    id: 'vn-domestic',
    name: 'TP.HCM ➔ Hà Nội (Nội địa)',
    nameEn: 'HCMC ➔ Hanoi (Domestic)',
    flag: '🇻🇳',
    origin: 'Trang trại Củ Chi, TP.HCM',
    originEn: 'Cu Chi Horse Farm, HCMC',
    destination: 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội',
    destinationEn: 'Soc Son Equestrian Center, Hanoi',
    suggestedMode: 'road',
    type: 'Domestic',
  },
];

export interface RoutePlanningMapProps {
  originText?: string;
  destinationText?: string;
  transportType?: 'International' | 'Domestic';
  mode?: 'air' | 'road' | 'sea';
  seaMode?: 'vessel';
  tripType?: 'one_way' | 'round_trip';
  horseCount?: number;
  showPricing?: boolean;
  selectedOriginGeo?: GeocodedLocation | null;
  selectedDestGeo?: GeocodedLocation | null;
  onRouteCalculated?: (data: {
    distanceKm: number;
    durationHours: number;
    mode: 'air' | 'road' | 'sea';
    isDomestic: boolean;
    estimatedTotalPriceVnd: number;
    legs?: RouteLegPreview[];
    seaUnavailableNotice?: { vi: string; en: string } | null;
  }) => void;
  onApplyPreset?: (preset: RoutePreset) => void;
  onRequestModeChange?: (mode: 'air' | 'road' | 'sea') => void;
}

interface OsrmResult {
  coordinates: [number, number][]; // [lat, lng] for Leaflet
  distanceKm: number;
  durationHours: number;
}

const osrmCache = new Map<string, OsrmResult>();

/**
 * Fetch driving navigation geometry and true road distance from OSRM public service
 */
async function fetchOsrmDrivingRoute(
  points: [number, number][],
  signal?: AbortSignal
): Promise<OsrmResult | null> {
  if (points.length < 2) return null;

  // Format: {lng},{lat};{lng},{lat}
  const key = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');

  if (osrmCache.has(key)) {
    return osrmCache.get(key)!;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      return null;
    }

    const route = data.routes[0];
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationHours = Math.round((route.duration / 3600) * 10) / 10;

    const result: OsrmResult = { coordinates, distanceKm, durationHours };
    osrmCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Robust multi-waypoint road route fetcher with fallback segmentation
 */
async function fetchOsrmFullRoute(
  points: [number, number][],
  signal?: AbortSignal
): Promise<OsrmResult | null> {
  // 1. Try single multi-waypoint call
  const direct = await fetchOsrmDrivingRoute(points, signal);
  if (direct) return direct;

  // 2. Fallback: chain segment by segment if multi-stop
  if (points.length > 2) {
    const allCoords: [number, number][] = [];
    let totalDist = 0;
    let totalDur = 0;
    let successCount = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const seg = await fetchOsrmDrivingRoute([points[i], points[i + 1]], signal);
      if (seg) {
        allCoords.push(...seg.coordinates);
        totalDist += seg.distanceKm;
        totalDur += seg.durationHours;
        successCount++;
      } else {
        allCoords.push(points[i], points[i + 1]);
        totalDist += calculateHaversine(points[i], points[i + 1]);
      }
    }

    if (successCount > 0) {
      return {
        coordinates: allCoords,
        distanceKm: Math.round(totalDist * 10) / 10,
        durationHours: Math.round(totalDur * 10) / 10,
      };
    }
  }

  return null;
}

export const RoutePlanningMap: React.FC<RoutePlanningMapProps> = ({
  originText: originTextProp,
  destinationText = 'Singapore Turf Club, Singapore',
  transportType,
  mode: controlledMode,
  seaMode = 'vessel',
  tripType = 'one_way',
  horseCount = 1,
  showPricing = true,
  selectedOriginGeo,
  selectedDestGeo,
  onRouteCalculated,
  onApplyPreset,
  onRequestModeChange,
}) => {
  const { language, t } = useLanguage();
  const originText = originTextProp || (language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);

  const [internalMode, setInternalMode] = useState<'air' | 'road' | 'sea'>('road');
  const mode = controlledMode ?? internalMode;
  const setMode = setInternalMode;
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);
  const [showLegDetails, setShowLegDetails] = useState<boolean>(false);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const [osrmDistanceKm, setOsrmDistanceKm] = useState<number | null>(null);
  const [osrmLegMetrics, setOsrmLegMetrics] = useState<Record<number, { distanceKm: number; durationHours: number }>>({});
  const [focusedLegSeq, setFocusedLegSeq] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [customOriginGeo, setCustomOriginGeo] = useState<GeocodedLocation | null>(null);
  const [customDestGeo, setCustomDestGeo] = useState<GeocodedLocation | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onRouteCalculatedRef = useRef(onRouteCalculated);

  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated;
  }, [onRouteCalculated]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsLegendOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedWaypoint) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedWaypoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWaypoint]);

  // Dynamic OpenStreetMap / Photon Geocoding for arbitrary addresses (skipped when autocomplete already supplied exact geo)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const needsOriginGeocode = !selectedOriginGeo && Boolean(originText && originText.trim().length >= 3);
    const needsDestGeocode = !selectedDestGeo && Boolean(destinationText && destinationText.trim().length >= 3);

    if (selectedOriginGeo) setCustomOriginGeo(null);
    if (selectedDestGeo) setCustomDestGeo(null);

    if (!needsOriginGeocode && !needsDestGeocode) {
      setIsGeocoding(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    const timer = setTimeout(async () => {
      setIsGeocoding(true);
      if (needsOriginGeocode) {
        const geoOrigin = await geocodeAddress(originText, controller.signal);
        if (active) setCustomOriginGeo(geoOrigin);
      } else if (active) {
        setCustomOriginGeo(null);
      }

      if (needsDestGeocode) {
        const geoDest = await geocodeAddress(destinationText, controller.signal);
        if (active) setCustomDestGeo(geoDest);
      } else if (active) {
        setCustomDestGeo(null);
      }

      if (active) setIsGeocoding(false);
    }, 400);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [originText, destinationText, selectedOriginGeo, selectedDestGeo]);

  const resolvedOriginGeo = selectedOriginGeo ?? customOriginGeo;
  const resolvedDestGeo = selectedDestGeo ?? customDestGeo;

  // Dynamic Equine Route Computation for ANY input text
  const routeResult: RouteCalculationResult = React.useMemo(() => {
    return buildEquineRoute(
      originText,
      destinationText,
      mode,
      transportType,
      resolvedOriginGeo?.coords ?? null,
      resolvedDestGeo?.coords ?? null,
      resolvedOriginGeo,
      resolvedDestGeo,
      { seaMode, horseCount }
    );
  }, [originText, destinationText, mode, transportType, resolvedOriginGeo, resolvedDestGeo, seaMode, horseCount]);

  const waypoints = routeResult.waypoints;
  const effectiveMode = routeResult.mode;
  const totalDistanceKm = routeResult.distanceKm;
  const estimatedHours = routeResult.durationHours;

  const effectiveLegs: RouteLegPreview[] = React.useMemo(() => {
    return routeResult.legs.map((leg) => {
      if (effectiveMode === 'road' && osrmDistanceKm !== null && leg.type === 'road') {
        const liveKm = osrmDistanceKm;
        return {
          ...leg,
          distanceKm: liveKm,
          durationHours: Math.max(1, Math.round((liveKm / 55) * 1.25 * 10) / 10),
          estimatedPriceVnd: estimateLegPriceVnd('road', liveKm, { horseCount }),
        };
      }
      const live = osrmLegMetrics[leg.sequenceNo];
      if (!live || leg.type !== 'road') return leg;
      return {
        ...leg,
        distanceKm: live.distanceKm,
        durationHours: Math.max(0.5, Math.round((live.durationHours + 0.5) * 10) / 10),
        estimatedPriceVnd: estimateLegPriceVnd('road', live.distanceKm, { horseCount }),
      };
    });
  }, [routeResult.legs, effectiveMode, osrmDistanceKm, osrmLegMetrics, horseCount]);

  const effectiveTotalDistanceKm = React.useMemo(() => {
    if (effectiveMode === 'air' || effectiveMode === 'sea') {
      return Math.round(effectiveLegs.reduce((sum, leg) => sum + leg.distanceKm, 0));
    }
    return osrmDistanceKm ?? totalDistanceKm;
  }, [effectiveMode, effectiveLegs, osrmDistanceKm, totalDistanceKm]);

  const effectiveEstimatedHours = React.useMemo(() => {
    if (routeResult.seaUnavailableNotice && effectiveLegs.length === 0) {
      return 0;
    }
    if (effectiveLegs.length > 0) {
      const summed = Math.round(effectiveLegs.reduce((sum, leg) => sum + leg.durationHours, 0) * 10) / 10;
      return effectiveMode === 'air' || effectiveMode === 'sea' ? Math.max(2, summed) : Math.max(1, summed);
    }
    return estimatedHours;
  }, [routeResult.seaUnavailableNotice, effectiveMode, effectiveLegs, estimatedHours]);

  // Antimeridian longitude alignment for trans-Pacific sea routes so markers, polylines, and bounds align seamlessly
  const antimeridianMeta = React.useMemo(() => {
    const seaLeg = routeResult.legs.find((l) => l.type === 'sea' && l.crossesAntimeridian && l.pathCoords && l.pathCoords.length > 1);
    if (!seaLeg || !seaLeg.pathCoords) {
      return { seaSeq: null as number | null, postSeaLngShift: 0 };
    }
    const endUnwrappedLng = seaLeg.pathCoords[seaLeg.pathCoords.length - 1][1];
    const shift = Math.round((endUnwrappedLng - seaLeg.toCoords[1]) / 360) * 360;
    return { seaSeq: seaLeg.sequenceNo, postSeaLngShift: shift };
  }, [routeResult.legs]);

  const shiftCoord = useCallback(
    (coord: [number, number], applyShift: boolean): [number, number] => {
      if (!applyShift || antimeridianMeta.postSeaLngShift === 0) return coord;
      return [coord[0], coord[1] + antimeridianMeta.postSeaLngShift];
    },
    [antimeridianMeta.postSeaLngShift]
  );

  const outboundEstimatedTotalPriceVnd = React.useMemo(() => {
    return effectiveLegs.reduce((sum, leg) => sum + (leg.estimatedPriceVnd || 0), 0);
  }, [effectiveLegs]);

  const effectiveEstimatedTotalPriceVnd = React.useMemo(() => {
    if (tripType !== 'round_trip') return outboundEstimatedTotalPriceVnd;
    const discountedReturnPriceVnd = Math.ceil((outboundEstimatedTotalPriceVnd * 0.9) / 1000) * 1000;
    return outboundEstimatedTotalPriceVnd + discountedReturnPriceVnd;
  }, [outboundEstimatedTotalPriceVnd, tripType]);

  // Reset OSRM overrides and leg focus when route inputs change
  useEffect(() => {
    setOsrmDistanceKm(null);
    setOsrmLegMetrics({});
    setFocusedLegSeq(null);
  }, [originText, destinationText, mode, seaMode, transportType, resolvedOriginGeo, resolvedDestGeo]);

  useEffect(() => {
    if (onRouteCalculatedRef.current) {
      onRouteCalculatedRef.current({
        distanceKm: effectiveTotalDistanceKm,
        durationHours: effectiveEstimatedHours,
        mode: effectiveMode,
        isDomestic: routeResult.isDomestic,
        estimatedTotalPriceVnd: effectiveEstimatedTotalPriceVnd,
        legs: effectiveLegs,
        seaUnavailableNotice: routeResult.seaUnavailableNotice ?? null,
      });
    }
  }, [
    effectiveMode,
    effectiveTotalDistanceKm,
    effectiveEstimatedHours,
    effectiveEstimatedTotalPriceVnd,
    routeResult.isDomestic,
    routeResult.seaUnavailableNotice,
    effectiveLegs,
  ]);

  const leafletRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  // Leaflet initialization - ONCE on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (!isMounted || !mapContainerRef.current) return;
      leafletRef.current = L;

      // Clean up previous instance
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }

      // Initialize map centered between Vietnam and Singapore
      const map = L.map(mapContainerRef.current, {
        center: [6.5, 104.5],
        zoom: 6,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Tile layers: Esri World Street Map & Satellite (100% Free, No Watermark, No API Key Required)
      const tileLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution: 'Esri, HERE, Garmin, METI/NASA, USGS',
        }
      ).addTo(map);
      tileLayerRef.current = tileLayer;

      const layersGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layersGroup;
      mapInstanceRef.current = map;
      setIsMapReady(true);

      // Invalidate map size after delay to prevent gray Leaflet tiles in modals/tabs
      invalidateTimer = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 100);
    };

    void initMap();

    return () => {
      isMounted = false;
      setIsMapReady(false);
      if (invalidateTimer) clearTimeout(invalidateTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Invalidate map size when container resizes or page becomes visible
  useEffect(() => {
    const handleInvalidate = () => {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.invalidateSize();
          } catch {
            // ignore
          }
        }
      }, 100);
    };

    window.addEventListener('resize', handleInvalidate);
    document.addEventListener('visibilitychange', handleInvalidate);

    let observer: ResizeObserver | null = null;
    if (mapContainerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleInvalidate);
      observer.observe(mapContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleInvalidate);
      document.removeEventListener('visibilitychange', handleInvalidate);
      if (observer) observer.disconnect();
    };
  }, []);

  // Update tile layer url when mapStyle or readiness changes
  useEffect(() => {
    if (!isMapReady || !tileLayerRef.current) return;
    const tileUrl =
      mapStyle === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
    tileLayerRef.current.setUrl(tileUrl);
  }, [mapStyle, isMapReady]);

  const renderRoute = useCallback(
    (L: any, map: any, group: any) => {
      group.clearLayers();

      // Abort previous in-flight OSRM request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const currentReqId = ++requestIdRef.current;

      const wps = waypoints;
      const bounds = L.latLngBounds([]);

      // Custom Icon Generator
      const createCustomIcon = (type: Waypoint['type']) => {
        let bgColor = '#A67C2E';
        let iconSymbol = '📍';
        let badgeLabel = '';

        if (type === 'origin') {
          bgColor = '#287653';
          iconSymbol = '🟢';
          badgeLabel = language === 'en' ? 'ORIGIN' : 'XUẤT PHÁT';
        } else if (type === 'destination') {
          bgColor = '#B33E3E';
          iconSymbol = '🏁';
          badgeLabel = language === 'en' ? 'DESTINATION' : 'ĐÍCH ĐẾN';
        } else if (type === 'airport') {
          bgColor = '#A67C2E';
          iconSymbol = '✈️';
          badgeLabel = language === 'en' ? 'AIRPORT' : 'SÂN BAY';
        } else if (type === 'seaport') {
          bgColor = '#0E7490';
          iconSymbol = '⚓';
          badgeLabel = language === 'en' ? 'SEAPORT' : 'CẢNG BIỂN';
        } else if (type === 'checkpoint') {
          bgColor = '#966516';
          iconSymbol = '🛂';
          badgeLabel = language === 'en' ? 'CUSTOMS' : 'CỬA KHẨU';
        } else if (type === 'rest') {
          bgColor = '#181A17';
          iconSymbol = '🏨';
          badgeLabel = language === 'en' ? 'VET STOP' : 'TRẠM NGHỈ';
        }

        return L.divIcon({
          className: 'custom-map-marker',
          html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 3px 6px rgba(24,26,23,0.28));">
            <div style="background-color: ${bgColor}; color: #ffffff; padding: 4px 8px; border-radius: 10px; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; gap: 4px; border: 2px solid #ffffff; white-space: nowrap;">
              <span>${iconSymbol}</span>
              <span>${badgeLabel}</span>
            </div>
            <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid ${bgColor}; margin-top: -1px;"></div>
          </div>
        `,
          iconSize: [90, 36],
          iconAnchor: [45, 34],
        });
      };

      // Determine waypoint index threshold after which coordinates belong to the arrival side of an antimeridian crossing
      const seaLegForShift =
        antimeridianMeta.postSeaLngShift !== 0
          ? routeResult.legs.find((l) => l.sequenceNo === antimeridianMeta.seaSeq)
          : null;
      const isArrivalSideCoord = (coord: [number, number]): boolean => {
        if (!seaLegForShift || antimeridianMeta.postSeaLngShift === 0) return false;
        const dOrig = calculateHaversine(coord, seaLegForShift.fromCoords);
        const dDest = calculateHaversine(coord, seaLegForShift.toCoords);
        return dDest < dOrig;
      };

      // Add Markers with prioritized zIndex (single floating card interaction + hover tooltip)
      wps.forEach((wp) => {
        const displayCoords = shiftCoord(wp.coords, isArrivalSideCoord(wp.coords));
        bounds.extend(displayCoords);
        const zIndex =
          wp.type === 'origin' || wp.type === 'destination'
            ? 2000
            : wp.type === 'checkpoint'
            ? 1500
            : 1000;
        const marker = L.marker(displayCoords, {
          icon: createCustomIcon(wp.type),
          zIndexOffset: zIndex,
        }).addTo(group);

        marker.on('click', () => {
          setSelectedWaypoint(wp);
        });

        marker.bindTooltip(
          `<strong>${escapeMapHtml(wp.name)}</strong><br/><span style="color:#57564E;font-size:11px;">${escapeMapHtml(wp.label)}</span>`,
          {
            direction: 'top',
            offset: [0, -24],
            opacity: 0.96,
          }
        );
      });

      // Draw Route Lines with Instant Baseline + Async OSRM Curve Refinement
      if (effectiveMode === 'air' || effectiveMode === 'sea') {
        const roadLegPromises: Array<
          Promise<{
            sequenceNo: number;
            polyline: any;
            directKm: number;
            applyShift: boolean;
            res: OsrmResult | null;
          }>
        > = [];

        routeResult.legs.forEach((leg) => {
          const isPostSea =
            antimeridianMeta.seaSeq !== null && leg.sequenceNo > antimeridianMeta.seaSeq;
          if (leg.type === 'road') {
            const fromDisp = shiftCoord(leg.fromCoords, isPostSea);
            const toDisp = shiftCoord(leg.toCoords, isPostSea);
            bounds.extend(fromDisp);
            bounds.extend(toDisp);
            const roadPolyline = L.polyline([fromDisp, toDisp], {
              color: '#A67C2E',
              weight: 4.5,
              opacity: 0.92,
            }).addTo(group);
            roadPolyline.bindTooltip(
              language === 'en'
                ? `Leg ${leg.sequenceNo} · Horse Truck: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`
                : `Chặng ${leg.sequenceNo} · Xe thùng chuyên dụng: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`,
              { sticky: true }
            );

            roadLegPromises.push(
              fetchOsrmDrivingRoute([leg.fromCoords, leg.toCoords], abortController.signal).then((res) => ({
                sequenceNo: leg.sequenceNo,
                polyline: roadPolyline,
                directKm: calculateHaversine(leg.fromCoords, leg.toCoords),
                applyShift: isPostSea,
                res,
              }))
            );
          } else if (leg.type === 'sea') {
            const seaCoords: [number, number][] =
              leg.pathCoords && leg.pathCoords.length >= 2
                ? leg.pathCoords
                : [leg.fromCoords, leg.toCoords];
            seaCoords.forEach((pt) => bounds.extend(pt));

            const seaPolyline = L.polyline(seaCoords, {
              color: '#0E7490',
              weight: 3.5,
              dashArray: '6, 8',
              opacity: 0.95,
            }).addTo(group);
            seaPolyline.bindTooltip(
              language === 'en'
                ? `Leg ${leg.sequenceNo} · ${escapeMapHtml(leg.vehicleLabelEn)}: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`
                : `Chặng ${leg.sequenceNo} · ${escapeMapHtml(leg.vehicleLabelVi)}: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`,
              { sticky: true }
            );
          } else {
            const p1 = leg.fromCoords;
            const p2 = leg.toCoords;
            const arcPoints: [number, number][] = [];
            const steps = 30;
            const curveFactor = 1.5;
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const lat = p1[0] + (p2[0] - p1[0]) * t + Math.sin(t * Math.PI) * curveFactor;
              const lng = p1[1] + (p2[1] - p1[1]) * t;
              arcPoints.push([lat, lng]);
            }
            arcPoints.forEach((pt) => bounds.extend(pt));

            const transitPolyline = L.polyline(arcPoints, {
              color: '#B49A68',
              weight: 3.5,
              dashArray: '8, 8',
              opacity: 0.95,
            }).addTo(group);
            transitPolyline.bindTooltip(
              language === 'en'
                ? `Leg ${leg.sequenceNo} · Equine Flight: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`
                : `Chặng ${leg.sequenceNo} · Hàng không: ${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}`,
              { sticky: true }
            );
          }
        });

        if (roadLegPromises.length > 0) {
          setIsNavigating(true);
          Promise.all(roadLegPromises)
            .then((results) => {
              if (currentReqId !== requestIdRef.current) return;
              setIsNavigating(false);

              const nextMetrics: Record<number, { distanceKm: number; durationHours: number }> = {};
              results.forEach(({ sequenceNo, polyline, directKm, applyShift, res }) => {
                if (res && res.coordinates.length > 0 && res.distanceKm <= Math.max(120, directKm * 3.5)) {
                  const displayCoords = applyShift
                    ? res.coordinates.map((pt) => shiftCoord(pt, true))
                    : res.coordinates;
                  polyline.setLatLngs(displayCoords);
                  nextMetrics[sequenceNo] = {
                    distanceKm: Math.round(res.distanceKm),
                    durationHours: res.durationHours,
                  };
                }
              });

              if (Object.keys(nextMetrics).length > 0) {
                setOsrmLegMetrics(nextMetrics);
                const refinedTotal = Math.round(
                  routeResult.legs.reduce(
                    (sum, leg) => sum + (nextMetrics[leg.sequenceNo]?.distanceKm ?? leg.distanceKm),
                    0
                  )
                );
                setOsrmDistanceKm(refinedTotal);
              }
            })
            .catch(() => {
              if (currentReqId === requestIdRef.current) {
                setIsNavigating(false);
              }
            });
        } else {
          setIsNavigating(false);
        }
      } else {
        // Overland Road Route (Full Highway Navigation)
        const roadCoords = wps.map((w) => w.coords);
        const roadPolyline = L.polyline(roadCoords, {
          color: '#A67C2E',
          weight: 5,
          opacity: 0.92,
        }).addTo(group);
        roadPolyline.bindTooltip(
          language === 'en'
            ? 'Cross-Border Road Transit Corridor'
            : 'Lộ trình đường bộ liên vận / quốc gia',
          { sticky: true }
        );

        // Asynchronously fetch real highway curve navigation via OSRM
        setIsNavigating(true);
        fetchOsrmFullRoute(roadCoords, abortController.signal)
          .then((res) => {
            if (currentReqId !== requestIdRef.current) return;
            setIsNavigating(false);

            if (res && res.coordinates.length > 0) {
              roadPolyline.setLatLngs(res.coordinates);
              setOsrmDistanceKm(res.distanceKm);
            }
          })
          .catch(() => {
            if (currentReqId === requestIdRef.current) {
              setIsNavigating(false);
            }
          });
      }

      if (bounds.isValid() && map) {
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: false });
        } catch {
          // ignore
        }
      }

      setTimeout(() => {
        try {
          if (map) map.invalidateSize();
        } catch {
          // ignore
        }
      }, 100);
    },
    [waypoints, effectiveMode, routeResult.legs, language, antimeridianMeta, shiftCoord]
  );

  // Render initial route & update smoothly when route parameters change
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !layersGroupRef.current || !leafletRef.current) return;
    renderRoute(leafletRef.current, mapInstanceRef.current, layersGroupRef.current);
  }, [isMapReady, renderRoute]);

  const handleFocusLeg = useCallback(
    (leg: RouteLegPreview) => {
      setFocusedLegSeq(leg.sequenceNo);
      const map = mapInstanceRef.current;
      const L = leafletRef.current;
      if (!map || !L) return;
      try {
        const isPostSea =
          antimeridianMeta.seaSeq !== null && leg.sequenceNo > antimeridianMeta.seaSeq;
        const points: [number, number][] =
          leg.pathCoords && leg.pathCoords.length >= 2
            ? leg.pathCoords
            : [shiftCoord(leg.fromCoords, isPostSea), shiftCoord(leg.toCoords, isPostSea)];
        const legBounds = L.latLngBounds(points);
        map.fitBounds(legBounds, { padding: [55, 55], maxZoom: 13, animate: true });
      } catch {
        // ignore
      }
    },
    [antimeridianMeta.seaSeq, shiftCoord]
  );

  const handleResetZoom = useCallback(() => {
    setFocusedLegSeq(null);
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L || waypoints.length === 0) return;
    try {
      const seaLegForShift =
        antimeridianMeta.postSeaLngShift !== 0
          ? routeResult.legs.find((l) => l.sequenceNo === antimeridianMeta.seaSeq)
          : null;
      const allPts: [number, number][] = [];
      waypoints.forEach((w) => {
        const isArrivalSide =
          seaLegForShift &&
          calculateHaversine(w.coords, seaLegForShift.toCoords) <
            calculateHaversine(w.coords, seaLegForShift.fromCoords);
        allPts.push(shiftCoord(w.coords, Boolean(isArrivalSide)));
      });
      routeResult.legs.forEach((leg) => {
        if (leg.pathCoords && leg.pathCoords.length >= 2) {
          allPts.push(...leg.pathCoords);
        } else {
          const isPostSea =
            antimeridianMeta.seaSeq !== null && leg.sequenceNo > antimeridianMeta.seaSeq;
          allPts.push(shiftCoord(leg.fromCoords, isPostSea), shiftCoord(leg.toCoords, isPostSea));
        }
      });
      const fullBounds = L.latLngBounds(allPts);
      map.fitBounds(fullBounds, { padding: [50, 50], maxZoom: 12, animate: true });
    } catch {
      // ignore
    }
  }, [waypoints, routeResult.legs, antimeridianMeta, shiftCoord]);

  const formattedDuration = React.useMemo(() => {
    if (effectiveMode === 'air' || effectiveEstimatedHours < 24) {
      return language === 'en' ? `~${effectiveEstimatedHours} hours` : `~${effectiveEstimatedHours} tiếng`;
    }
    const days = Math.round(effectiveEstimatedHours / 24);
    if (language === 'en') {
      return `~${days} ${days === 1 ? 'day' : 'days'} (${effectiveEstimatedHours}h)`;
    }
    return `~${days} ngày (${effectiveEstimatedHours}h)`;
  }, [effectiveMode, effectiveEstimatedHours, language]);

  const normalizedDestText = normalizeVietnamese(destinationText);

  return (
    <div
      style={{
        isolation: 'isolate',
        position: 'relative',
        zIndex: 0,
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid #D8CEBE',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 4px 16px rgba(24, 26, 23, 0.06)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Compact Single Map Toolbar */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: '#181A17',
          borderBottom: '1px solid #2D312C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 220px' }}>
          <MapPin size={15} color="#B49A68" aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#F7F7F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isGeocoding ? (
              t('routes.map.geocoding', 'Đang tra cứu toạ độ...')
            ) : (
              <>
                <strong>{routeResult.origin.name}</strong>{' '}
                <span style={{ color: '#B49A68' }}>→</span>{' '}
                <strong>{routeResult.destination.name}</strong>
              </>
            )}
          </div>
          {!isGeocoding && (
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: '#242722',
                border: '1px solid rgba(180, 154, 104, 0.35)',
                color: '#C4B38E',
                flexShrink: 0,
              }}
            >
              {routeResult.isDomestic ? (language === 'en' ? 'Domestic' : 'Nội địa') : (language === 'en' ? 'International' : 'Quốc tế')}
            </span>
          )}
        </div>

        {/* Map Layer Switcher */}
        <button
          type="button"
          aria-pressed={mapStyle === 'satellite'}
          aria-label={language === 'en' ? 'Toggle satellite or street map layer' : 'Đổi kiểu bản đồ Vệ tinh hoặc Đường phố'}
          onClick={() => setMapStyle(mapStyle === 'streets' ? 'satellite' : 'streets')}
          title={language === 'en' ? 'Toggle Satellite / Street view' : 'Đổi kiểu bản đồ Vệ tinh / Đường phố'}
          style={{
            padding: '5px 10px',
            borderRadius: '8px',
            border: '1px solid #2D312C',
            backgroundColor: '#242722',
            fontSize: '11.5px',
            color: '#F7F7F4',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <Layers size={13} color="#B49A68" aria-hidden="true" />
          <span>{mapStyle === 'streets' ? (language === 'en' ? 'Streets' : 'Đường phố') : (language === 'en' ? 'Satellite' : 'Vệ tinh')}</span>
        </button>
      </div>

      {/* Map Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '360px', backgroundColor: '#EAE6DC' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Collapsible Legend Overlay at bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            borderRadius: '10px',
            padding: isLegendOpen ? '10px 14px' : '6px 10px',
            border: '1px solid #D8CEBE',
            boxShadow: '0 4px 12px rgba(24, 26, 23, 0.14)',
            zIndex: 400,
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: isLegendOpen ? '6px' : '0px',
            color: '#181A17',
            maxWidth: 'calc(100% - 70px)',
          }}
        >
          <button
            type="button"
            aria-expanded={isLegendOpen}
            onClick={() => setIsLegendOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 700,
              color: '#181A17',
              fontSize: '11.5px',
              textAlign: 'left',
            }}
          >
            <span>{t('routes.map.legendTitle', 'Ký hiệu hành lang:')}</span>
            {isLegendOpen ? (
              <ChevronDown size={14} color="#57564E" aria-hidden="true" />
            ) : (
              <ChevronUp size={14} color="#57564E" aria-hidden="true" />
            )}
          </button>

          {isLegendOpen && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#287653', flexShrink: 0 }} />
                <span>{t('routes.map.legendOrigin', 'Điểm xuất phát')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#966516', flexShrink: 0 }} />
                <span>{t('routes.map.legendCustoms', 'Cửa khẩu / Sân bay kiểm dịch')}</span>
              </div>
              {effectiveMode === 'sea' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0E7490', flexShrink: 0 }} />
                  <span>{t('routes.map.legendSeaport', 'Cảng biển kiểm dịch')}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#181A17', flexShrink: 0 }} />
                <span>{t('routes.map.legendVet', 'Trạm nghỉ & Bác sĩ thú y (Vet Stop)')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#B33E3E', flexShrink: 0 }} />
                <span>{t('routes.map.legendDest', 'Điểm đến')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #D8CEBE' }}>
                <span style={{ width: '16px', height: '4px', backgroundColor: '#A67C2E', borderRadius: '2px', flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{t('routes.map.roadNetwork', 'Tuyến đường bộ (Cao tốc / Quốc lộ thực tế)')}</span>
              </div>
              {effectiveMode === 'air' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '16px', height: '0px', borderTop: '2.5px dashed #B49A68', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{t('routes.map.flightCorridor', 'Hành lang bay quốc tế')}</span>
                </div>
              )}
              {effectiveMode === 'sea' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '16px', height: '0px', borderTop: '2.5px dashed #0E7490', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{t('routes.map.seaCorridor', 'Tuyến đường thủy (Tàu biển)')}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Selected Waypoint Detail Card (if clicked) */}
        {selectedWaypoint && (
          <div
            role="dialog"
            aria-label={selectedWaypoint.name}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              maxWidth: '300px',
              width: 'calc(100% - 24px)',
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '14px',
              border: '1px solid #D8CEBE',
              boxShadow: '0 8px 24px rgba(24, 26, 23, 0.16)',
              zIndex: 410,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#181A17' }}>{selectedWaypoint.name}</div>
                <div style={{ fontSize: '11.5px', color: '#A67C2E', fontWeight: 600 }}>{selectedWaypoint.label}</div>
              </div>
              <button
                type="button"
                aria-label={language === 'en' ? 'Close waypoint details' : 'Đóng chi tiết trạm'}
                onClick={() => setSelectedWaypoint(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#57564E',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#57564E', marginTop: '8px', lineHeight: 1.5 }}>
              {selectedWaypoint.details}
            </div>
          </div>
        )}
      </div>

      {/* Notices (only shown if fallback/warning exists) */}
      {(routeResult.seaUnavailableNotice || routeResult.airFallbackNotice) && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#FAF8F4',
            borderTop: '1px solid #E5DDD0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {routeResult.seaUnavailableNotice && (
            <div
              role="alert"
              style={{
                fontSize: '12px',
                color: '#991B1B',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '10px',
                padding: '9px 12px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 260px' }}>
                <Info size={15} color="#B91C1C" aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 600, lineHeight: 1.45 }}>
                  {language === 'en' ? routeResult.seaUnavailableNotice.en : routeResult.seaUnavailableNotice.vi}
                </span>
              </div>
              {onRequestModeChange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => onRequestModeChange('air')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: '1px solid #181A17',
                      backgroundColor: '#181A17',
                      color: '#FFFFFF',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Plane size={12} aria-hidden="true" />
                    <span>{language === 'en' ? 'Switch to Air' : 'Chuyển Hàng không'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestModeChange('road')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: '1px solid #D8CEBE',
                      backgroundColor: '#FFFFFF',
                      color: '#181A17',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Truck size={12} aria-hidden="true" />
                    <span>{language === 'en' ? 'Switch to Road' : 'Chuyển Đường bộ'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {routeResult.airFallbackNotice && (
            <div
              role="status"
              style={{
                fontSize: '12px',
                color: '#8C6621',
                backgroundColor: '#F8F0DF',
                border: '1px solid #DFCA9A',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Info size={14} color="#966516" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{language === 'en' ? routeResult.airFallbackNotice.en : routeResult.airFallbackNotice.vi}</span>
            </div>
          )}
        </div>
      )}

      {/* Live Route Metrics Summary Bar (1 clean row + collapsible legs toggle) */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: '#F0EEE8',
          borderTop: '1px solid #D8CEBE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Navigation size={14} color="#A67C2E" aria-hidden="true" />
            <span style={{ fontSize: '12px', color: '#57564E' }}>{t('routes.map.totalDist', 'Quãng đường:')}</span>
            <strong style={{ fontSize: '13.5px', color: '#181A17' }}>
              {routeResult.seaUnavailableNotice ? '—' : `${effectiveTotalDistanceKm.toLocaleString()} km`}
            </strong>
            {osrmDistanceKm === null && isNavigating ? (
              <span style={{ fontSize: '11px', color: '#57564E', fontStyle: 'italic' }}>
                ({t('routes.map.optimizing', 'Đang tính...')})
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} color="#A67C2E" aria-hidden="true" />
            <span style={{ fontSize: '12px', color: '#57564E' }}>{t('routes.map.estDuration', 'Dự kiến:')}</span>
            <strong style={{ fontSize: '13.5px', color: '#181A17' }}>
              {routeResult.seaUnavailableNotice ? '—' : formattedDuration}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {showPricing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D8CEBE',
                borderRadius: '8px',
                padding: '4px 10px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#57564E', fontWeight: 600 }}>
                {language === 'en' ? 'Est. Fare:' : 'Ước tính:'}
              </span>
              <strong
                style={{
                  fontSize: '13px',
                  color: '#8C6621',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {routeResult.seaUnavailableNotice ? '—' : `${effectiveEstimatedTotalPriceVnd.toLocaleString('vi-VN')} đ`}
              </strong>
            </div>
          )}

          {effectiveLegs.length > 0 && (
            <button
              type="button"
              aria-expanded={showLegDetails}
              onClick={() => setShowLegDetails((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #D8CEBE',
                backgroundColor: '#FFFFFF',
                color: '#181A17',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>
                {language === 'en' ? `${effectiveLegs.length} legs` : `Chi tiết ${effectiveLegs.length} chặng`}
              </span>
              {showLegDetails ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Door-to-Door Leg Breakdown */}
      {showLegDetails && effectiveLegs.length > 0 && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: '#FAF8F4',
            borderTop: '1px solid #E5DDD0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {focusedLegSeq !== null && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleResetZoom}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#A67C2E',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D4C5A3',
                  borderRadius: '999px',
                  padding: '2px 10px',
                  cursor: 'pointer',
                }}
              >
                {language === 'en' ? 'Show full route' : 'Xem toàn tuyến'}
              </button>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                effectiveLegs.length >= 3
                  ? 'repeat(auto-fit, minmax(210px, 1fr))'
                  : effectiveLegs.length === 2
                    ? 'repeat(auto-fit, minmax(240px, 1fr))'
                    : '1fr',
              gap: '8px',
            }}
          >
            {effectiveLegs.map((leg) => {
              const isFocused = focusedLegSeq === leg.sequenceNo;
              const isAir = leg.type === 'air';
              const isSea = leg.type === 'sea';
              return (
                <button
                  key={`${leg.sequenceNo}-${leg.type}`}
                  type="button"
                  onClick={() => handleFocusLeg(leg)}
                  style={{
                    textAlign: 'left',
                    backgroundColor: isFocused ? '#F8F0DF' : '#FFFFFF',
                    border: isFocused ? '1.5px solid #A67C2E' : '1px solid #D8CEBE',
                    borderRadius: '10px',
                    padding: '9px 11px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', width: '100%' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: isAir ? '#181A17' : isSea ? '#0E7490' : '#8C6621',
                      }}
                    >
                      {isAir ? <Plane size={11} aria-hidden="true" /> : isSea ? <Ship size={11} aria-hidden="true" /> : <Truck size={11} aria-hidden="true" />}
                      <span>{language === 'en' ? `Leg ${leg.sequenceNo}` : `Chặng ${leg.sequenceNo}`} · {language === 'en' ? leg.vehicleLabelEn : leg.vehicleLabelVi}</span>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#57564E', whiteSpace: 'nowrap' }}>
                      {leg.distanceKm.toLocaleString()} km · ~{leg.durationHours}h
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#181A17', lineHeight: 1.35 }}>
                    {leg.fromName} <span style={{ color: '#A67C2E' }}>→</span> {leg.toName}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanningMap;
