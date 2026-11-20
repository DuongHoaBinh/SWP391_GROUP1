'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plane,
  Truck,
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
  selectedOriginGeo?: GeocodedLocation | null;
  selectedDestGeo?: GeocodedLocation | null;
  onRouteCalculated?: (data: {
    distanceKm: number;
    durationHours: number;
    mode: 'air' | 'road';
    legs?: RouteLegPreview[];
  }) => void;
  onApplyPreset?: (preset: RoutePreset) => void;
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
  selectedOriginGeo,
  selectedDestGeo,
  onRouteCalculated,
  onApplyPreset,
}) => {
  const { language, t } = useLanguage();
  const originText = originTextProp || (language === 'en' ? 'Cu Chi Horse Farm, HCMC' : 'Trang trại Củ Chi, TP.HCM');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);

  const [mode, setMode] = useState<'air' | 'road'>('air');
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(true);
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
      resolvedDestGeo
    );
  }, [originText, destinationText, mode, transportType, resolvedOriginGeo, resolvedDestGeo]);

  const waypoints = routeResult.waypoints;
  const effectiveMode = routeResult.mode;
  const totalDistanceKm = routeResult.distanceKm;
  const estimatedHours = routeResult.durationHours;

  const effectiveLegs: RouteLegPreview[] = React.useMemo(() => {
    return routeResult.legs.map((leg) => {
      const live = osrmLegMetrics[leg.sequenceNo];
      if (!live || leg.type !== 'road') return leg;
      return {
        ...leg,
        distanceKm: live.distanceKm,
        durationHours: Math.max(0.5, Math.round((live.durationHours + 0.5) * 10) / 10),
      };
    });
  }, [routeResult.legs, osrmLegMetrics]);

  const effectiveTotalDistanceKm = React.useMemo(() => {
    if (effectiveMode === 'air') {
      return Math.round(effectiveLegs.reduce((sum, leg) => sum + leg.distanceKm, 0));
    }
    return osrmDistanceKm ?? totalDistanceKm;
  }, [effectiveMode, effectiveLegs, osrmDistanceKm, totalDistanceKm]);

  const effectiveEstimatedHours = React.useMemo(() => {
    if (effectiveMode === 'air') {
      return Math.max(2, Math.round(effectiveLegs.reduce((sum, leg) => sum + leg.durationHours, 0) * 10) / 10);
    }
    return estimatedHours;
  }, [effectiveMode, effectiveLegs, estimatedHours]);

  // Reset OSRM overrides and leg focus when route inputs change
  useEffect(() => {
    setOsrmDistanceKm(null);
    setOsrmLegMetrics({});
    setFocusedLegSeq(null);
  }, [originText, destinationText, mode, transportType, resolvedOriginGeo, resolvedDestGeo]);

  useEffect(() => {
    if (onRouteCalculatedRef.current) {
      onRouteCalculatedRef.current({
        distanceKm: effectiveTotalDistanceKm,
        durationHours: effectiveEstimatedHours,
        mode: effectiveMode,
        legs: effectiveLegs,
      });
    }
  }, [effectiveMode, effectiveTotalDistanceKm, effectiveEstimatedHours, effectiveLegs]);

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

      // Add Markers with prioritized zIndex (single floating card interaction + hover tooltip)
      wps.forEach((wp) => {
        bounds.extend(wp.coords);
        const zIndex =
          wp.type === 'origin' || wp.type === 'destination'
            ? 2000
            : wp.type === 'checkpoint'
            ? 1500
            : 1000;
        const marker = L.marker(wp.coords, {
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
      if (effectiveMode === 'air') {
        const roadLegPromises: Array<
          Promise<{
            sequenceNo: number;
            polyline: any;
            directKm: number;
            res: OsrmResult | null;
          }>
        > = [];

        routeResult.legs.forEach((leg) => {
          if (leg.type === 'road') {
            const roadPolyline = L.polyline([leg.fromCoords, leg.toCoords], {
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
                res,
              }))
            );
          } else {
            const p1 = leg.fromCoords;
            const p2 = leg.toCoords;
            const flightArc: [number, number][] = [];
            const steps = 30;
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const lat = p1[0] + (p2[0] - p1[0]) * t + Math.sin(t * Math.PI) * 1.5;
              const lng = p1[1] + (p2[1] - p1[1]) * t;
              flightArc.push([lat, lng]);
            }

            const flightPolyline = L.polyline(flightArc, {
              color: '#B49A68',
              weight: 3.5,
              dashArray: '8, 8',
              opacity: 0.95,
            }).addTo(group);
            flightPolyline.bindTooltip(
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
              results.forEach(({ sequenceNo, polyline, directKm, res }) => {
                if (res && res.coordinates.length > 0 && res.distanceKm <= Math.max(120, directKm * 3.5)) {
                  polyline.setLatLngs(res.coordinates);
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
    [waypoints, effectiveMode, routeResult.legs, language]
  );

  // Render initial route & update smoothly when route parameters change
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !layersGroupRef.current || !leafletRef.current) return;
    renderRoute(leafletRef.current, mapInstanceRef.current, layersGroupRef.current);
  }, [isMapReady, renderRoute]);

  const handleFocusLeg = useCallback((leg: RouteLegPreview) => {
    setFocusedLegSeq(leg.sequenceNo);
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    try {
      const legBounds = L.latLngBounds([leg.fromCoords, leg.toCoords]);
      map.fitBounds(legBounds, { padding: [55, 55], maxZoom: 13, animate: true });
    } catch {
      // ignore
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    setFocusedLegSeq(null);
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L || waypoints.length === 0) return;
    try {
      const fullBounds = L.latLngBounds(waypoints.map((w) => w.coords));
      map.fitBounds(fullBounds, { padding: [50, 50], maxZoom: 12, animate: true });
    } catch {
      // ignore
    }
  }, [waypoints]);

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
      {/* Top Header & Mode Switcher */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#181A17',
          borderBottom: '1px solid #2D312C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              backgroundColor: '#242722',
              border: '1px solid rgba(180, 154, 104, 0.35)',
              color: '#B49A68',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Navigation size={18} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#F7F7F4' }}>
              {t('routes.map.title', 'Bản đồ Lộ trình Vận chuyển & Cửa khẩu Hải quan')}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(247, 247, 244, 0.72)' }}>
              {t('routes.map.subtitle', 'Lộ trình đa phương thức kết hợp xe thùng chuyên dụng và đường bay / trạm kiểm dịch')}
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#121411',
              padding: '3px',
              borderRadius: '9px',
              border: '1px solid #2D312C',
              gap: '2px',
            }}
          >
            <button
              type="button"
              aria-pressed={mode === 'air'}
              onClick={() => setMode('air')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '7px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: mode === 'air' ? '#B49A68' : 'transparent',
                color: mode === 'air' ? '#181A17' : '#D8CEBE',
                boxShadow: mode === 'air' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Plane size={14} aria-hidden="true" />
              <span>{t('routes.map.airMode', 'Xe thùng + Hàng không')}</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === 'road'}
              onClick={() => setMode('road')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '7px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: mode === 'road' ? '#A67C2E' : 'transparent',
                color: mode === 'road' ? '#FFFFFF' : '#D8CEBE',
                boxShadow: mode === 'road' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Truck size={14} aria-hidden="true" />
              <span>{t('routes.map.roadMode', 'Xe thùng đường bộ')}</span>
            </button>
          </div>

          {/* Map Layer Switcher */}
          <button
            type="button"
            aria-pressed={mapStyle === 'satellite'}
            aria-label={language === 'en' ? 'Toggle satellite or street map layer' : 'Đổi kiểu bản đồ Vệ tinh hoặc Đường phố'}
            onClick={() => setMapStyle(mapStyle === 'streets' ? 'satellite' : 'streets')}
            title={language === 'en' ? 'Toggle Satellite / Street view' : 'Đổi kiểu bản đồ Vệ tinh / Đường phố'}
            style={{
              padding: '6px 11px',
              borderRadius: '9px',
              border: '1px solid #2D312C',
              backgroundColor: '#242722',
              fontSize: '12px',
              color: '#F7F7F4',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Layers size={13} color="#B49A68" aria-hidden="true" />
            <span>{mapStyle === 'streets' ? (language === 'en' ? 'Streets' : 'Đường phố') : (language === 'en' ? 'Satellite' : 'Vệ tinh')}</span>
          </button>
        </div>
      </div>

      {/* Route Presets Quick Bar */}
      <div
        style={{
          padding: '10px 18px',
          backgroundColor: '#F0EEE8',
          borderBottom: '1px solid #D8CEBE',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#57564E' }}>
          {t('routes.map.presets', 'Gợi ý tuyến:')}
        </span>
        {ROUTE_PRESETS.map((p) => {
          const isActive =
            p.id === 'sg'
              ? normalizedDestText.includes('singapore') || normalizedDestText.includes('kranji')
              : p.id === 'my'
              ? normalizedDestText.includes('malaysia') ||
                normalizedDestText.includes('selangor') ||
                normalizedDestText.includes('kuala lumpur')
              : p.id === 'th'
              ? normalizedDestText.includes('bangkok') ||
                normalizedDestText.includes('thai lan') ||
                normalizedDestText.includes('thailand')
              : normalizedDestText.includes('soc son') ||
                normalizedDestText.includes('ha noi') ||
                normalizedDestText.includes('hanoi');
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setMode(p.suggestedMode);
                if (onApplyPreset) onApplyPreset(p);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 11px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: isActive ? '1px solid #A67C2E' : '1px solid #D8CEBE',
                backgroundColor: isActive ? '#FAF8F4' : '#FFFFFF',
                color: isActive ? '#A67C2E' : '#181A17',
                boxShadow: isActive ? '0 1px 3px rgba(166, 124, 46, 0.18)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{p.flag}</span>
              <span>{language === 'en' ? (p.nameEn || p.name) : p.name}</span>
            </button>
          );
        })}

        {/* Active Detected Route Pill */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 11px',
            borderRadius: '20px',
            backgroundColor: isGeocoding ? '#F8F0DF' : '#FAF8F4',
            border: isGeocoding ? '1px solid #DFCA9A' : '1px solid #D4C5A3',
            fontSize: '11.5px',
            color: isGeocoding ? '#966516' : '#A67C2E',
            fontWeight: 600,
            maxWidth: '100%',
            transition: 'all 0.2s ease',
          }}
        >
          <MapPin size={12} color={isGeocoding ? '#966516' : '#A67C2E'} aria-hidden="true" />
          <span>
            {isGeocoding ? (
              t('routes.map.geocoding', 'Đang tra cứu toạ độ thực tế...')
            ) : (
              <>
                {t('routes.map.detected', 'Nhận diện:')}{' '}
                <strong>{routeResult.origin.name}</strong> ➔ <strong>{routeResult.destination.name}</strong> (
                {routeResult.isDomestic ? (language === 'en' ? 'Domestic' : 'Nội địa') : (language === 'en' ? 'International' : 'Quốc tế')}
                {resolvedDestGeo || resolvedOriginGeo ? ' • GPS Dynamic' : ''})
              </>
            )}
          </span>
        </div>
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

      {/* Multimodal Door-to-Door Leg Breakdown */}
      {(routeResult.airFallbackNotice || effectiveLegs.length > 0) && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#FAF8F4',
            borderTop: '1px solid #E5DDD0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {(() => {
              const airLeg = effectiveMode === 'air' ? effectiveLegs.find((l) => l.type === 'air') : null;
              const lastLeg = effectiveLegs.length > 0 ? effectiveLegs[effectiveLegs.length - 1] : null;
              const finalRoadLeg = effectiveMode === 'air' && lastLeg?.type === 'road' ? lastLeg : null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#181A17' }}>
                    {language === 'en' ? 'Door-to-Door Route Legs' : 'Lộ trình vận chuyển theo chặng'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#57564E',
                      backgroundColor: '#EFEAE0',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    {effectiveMode === 'air'
                      ? language === 'en'
                        ? `${effectiveLegs.length} legs · Multimodal Truck + Air`
                        : `${effectiveLegs.length} chặng · Xe thùng + Hàng không`
                      : language === 'en'
                        ? `${effectiveLegs.length} leg · Horse Truck`
                        : `${effectiveLegs.length} chặng · Xe thùng đường bộ`}
                  </span>
                  {airLeg && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#8C6621' }}>
                      {finalRoadLeg
                        ? language === 'en'
                          ? `Nearest arrival: ${airLeg.toName} · final truck ~${finalRoadLeg.distanceKm} km`
                          : `Sân bay gần đích nhất: ${airLeg.toName} · xe thùng cuối ~${finalRoadLeg.distanceKm} km`
                        : language === 'en'
                          ? `Direct arrival: ${airLeg.toName}`
                          : `Hạ cánh trực tiếp tại ${airLeg.toName}`}
                    </span>
                  )}
                </div>
              );
            })()}

            {focusedLegSeq !== null && (
              <button
                type="button"
                onClick={handleResetZoom}
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#A67C2E',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D4C5A3',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                {language === 'en' ? 'Show full route' : 'Xem toàn tuyến'}
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                effectiveLegs.length >= 3
                  ? 'repeat(auto-fit, minmax(220px, 1fr))'
                  : effectiveLegs.length === 2
                    ? 'repeat(auto-fit, minmax(260px, 1fr))'
                    : '1fr',
              gap: '10px',
            }}
          >
            {effectiveLegs.map((leg) => {
              const isFocused = focusedLegSeq === leg.sequenceNo;
              const isAir = leg.type === 'air';
              return (
                <button
                  key={`${leg.sequenceNo}-${leg.type}`}
                  type="button"
                  onClick={() => handleFocusLeg(leg)}
                  title={
                    language === 'en'
                      ? 'Click to zoom map to this leg'
                      : 'Nhấn để phóng to bản đồ tại chặng này'
                  }
                  style={{
                    textAlign: 'left',
                    backgroundColor: isFocused ? '#F8F0DF' : '#FFFFFF',
                    border: isFocused ? '1.5px solid #A67C2E' : '1px solid #D8CEBE',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          color: '#181A17',
                          backgroundColor: '#EFEAE0',
                          padding: '2px 7px',
                          borderRadius: '6px',
                        }}
                      >
                        {language === 'en' ? `Leg ${leg.sequenceNo}` : `Chặng ${leg.sequenceNo}`}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: isAir ? '#181A17' : '#FAF8F4',
                          color: isAir ? '#C4B38E' : '#8C6621',
                          border: isAir ? '1px solid #2D312C' : '1px solid #DFCA9A',
                        }}
                      >
                        {isAir ? <Plane size={11} aria-hidden="true" /> : <Truck size={11} aria-hidden="true" />}
                        <span>{language === 'en' ? leg.vehicleLabelEn : leg.vehicleLabelVi}</span>
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#57564E', whiteSpace: 'nowrap' }}>
                      ~{leg.distanceKm.toLocaleString()} km · ~{leg.durationHours}{language === 'en' ? 'h' : 'h'}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#181A17', lineHeight: 1.35 }}>
                    {leg.fromName} <span style={{ color: '#A67C2E' }}>→</span> {leg.toName}
                  </div>

                  <div style={{ fontSize: '11px', color: '#57564E', lineHeight: 1.4 }}>
                    {language === 'en' ? leg.noteEn : leg.noteVi}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Route Metrics Summary Bar */}
      <div
        style={{
          padding: '12px 18px',
          backgroundColor: '#F0EEE8',
          borderTop: '1px solid #D8CEBE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={16} color="#A67C2E" aria-hidden="true" />
            <span style={{ fontSize: '12.5px', color: '#57564E' }}>{t('routes.map.totalDist', 'Tổng quãng đường:')}</span>
            <strong style={{ fontSize: '14px', color: '#181A17' }}>
              {effectiveTotalDistanceKm.toLocaleString()} km
            </strong>
            {osrmDistanceKm !== null ? (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#E8F2EB',
                  color: '#287653',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #B7DBC4',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={language === 'en' ? 'Road legs refined via actual highway network (OSRM)' : 'Chặng đường bộ đã tính theo mạng lưới cao tốc & quốc lộ thực tế'}
              >
                <span>✨</span>
                <span>{t('routes.map.actualRoadRoute', 'Lộ trình đường bộ thực tế')}</span>
              </span>
            ) : isNavigating ? (
              <span style={{ fontSize: '11px', color: '#57564E', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⏳</span>
                <span>{t('routes.map.optimizing', 'Đang nắn tuyến cao tốc...')}</span>
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} color="#A67C2E" aria-hidden="true" />
            <span style={{ fontSize: '12.5px', color: '#57564E' }}>{t('routes.map.estDuration', 'Thời gian ước tính:')}</span>
            <strong style={{ fontSize: '14px', color: '#181A17' }}>
              {formattedDuration}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoutePlanningMap;
