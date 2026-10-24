'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plane, Truck, Navigation, Info, ShieldCheck, Clock, MapPin, Layers } from 'lucide-react';

import {
  buildEquineRoute,
  calculateHaversine,
  geocodeAddress,
  GeocodedLocation,
  RouteCalculationResult,
  Waypoint,
} from '@/lib/geo-corridors';

export interface RoutePreset {
  id: string;
  name: string;
  flag: string;
  origin: string;
  destination: string;
  suggestedMode: 'air' | 'road';
  type: 'International' | 'Domestic';
}

export const ROUTE_PRESETS: RoutePreset[] = [
  {
    id: 'sg',
    name: 'TP.HCM ➔ Singapore (Turf Club)',
    flag: '🇸🇬',
    origin: 'Trang trại Củ Chi, TP.HCM',
    destination: 'Singapore Turf Club, Kranji, Singapore',
    suggestedMode: 'air',
    type: 'International',
  },
  {
    id: 'my',
    name: 'TP.HCM ➔ Malaysia (Selangor)',
    flag: '🇲🇾',
    origin: 'Trang trại Củ Chi, TP.HCM',
    destination: 'Selangor Turf Club, Kuala Lumpur, Malaysia',
    suggestedMode: 'air',
    type: 'International',
  },
  {
    id: 'th',
    name: 'TP.HCM ➔ Thái Lan (Bangkok)',
    flag: '🇹🇭',
    origin: 'Trang trại Củ Chi, TP.HCM',
    destination: 'Royal Bangkok Sports Club, Bangkok, Thái Lan',
    suggestedMode: 'road',
    type: 'International',
  },
  {
    id: 'vn-domestic',
    name: 'TP.HCM ➔ Hà Nội (Nội địa)',
    flag: '🇻🇳',
    origin: 'Trang trại Củ Chi, TP.HCM',
    destination: 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội',
    suggestedMode: 'road',
    type: 'Domestic',
  },
];

export interface RoutePlanningMapProps {
  originText?: string;
  destinationText?: string;
  transportType?: 'International' | 'Domestic';
  onRouteCalculated?: (data: { distanceKm: number; durationHours: number; mode: 'air' | 'road' }) => void;
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
  originText = 'Trang trại Củ Chi, TP.HCM',
  destinationText = 'Singapore Turf Club, Singapore',
  transportType,
  onRouteCalculated,
  onApplyPreset,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);

  const [mode, setMode] = useState<'air' | 'road'>('air');
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [osrmDistanceKm, setOsrmDistanceKm] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [customOriginGeo, setCustomOriginGeo] = useState<GeocodedLocation | null>(null);
  const [customDestGeo, setCustomDestGeo] = useState<GeocodedLocation | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Dynamic OpenStreetMap / Photon Geocoding for arbitrary addresses
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      let isFetching = false;

      if (originText && originText.trim().length >= 3) {
        isFetching = true;
        setIsGeocoding(true);
        const geoOrigin = await geocodeAddress(originText, controller.signal);
        if (active) {
          setCustomOriginGeo(geoOrigin);
        }
      } else if (active) {
        setCustomOriginGeo(null);
      }

      if (destinationText && destinationText.trim().length >= 3) {
        isFetching = true;
        setIsGeocoding(true);
        const geoDest = await geocodeAddress(destinationText, controller.signal);
        if (active) {
          setCustomDestGeo(geoDest);
        }
      } else if (active) {
        setCustomDestGeo(null);
      }

      if (active && isFetching) {
        setIsGeocoding(false);
      }
    }, 400);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [originText, destinationText]);

  // Dynamic Equine Route Computation for ANY input text
  const routeResult: RouteCalculationResult = React.useMemo(() => {
    return buildEquineRoute(
      originText,
      destinationText,
      mode,
      transportType,
      customOriginGeo?.coords ?? null,
      customDestGeo?.coords ?? null,
      customOriginGeo,
      customDestGeo
    );
  }, [originText, destinationText, mode, transportType, customOriginGeo, customDestGeo]);

  const waypoints = routeResult.waypoints;
  const totalDistanceKm = routeResult.distanceKm;
  const estimatedHours = routeResult.durationHours;
  const customsCount = routeResult.customsCount;

  // Reset osrmDistanceKm when inputs change
  useEffect(() => {
    setOsrmDistanceKm(null);
  }, [originText, destinationText, mode, transportType, customOriginGeo, customDestGeo]);

  useEffect(() => {
    if (onRouteCalculated) {
      const finalDist = osrmDistanceKm ?? totalDistanceKm;
      onRouteCalculated({ distanceKm: finalDist, durationHours: estimatedHours, mode });
    }
  }, [mode, originText, destinationText, transportType, totalDistanceKm, estimatedHours, osrmDistanceKm]);

  const leafletRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  // Leaflet initialization - ONCE on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

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
      const tileUrl =
        mapStyle === 'satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: 'Esri, HERE, Garmin, METI/NASA, USGS',
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      const layersGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layersGroup;
      mapInstanceRef.current = map;

      // Initial render
      renderRoute(L, map, layersGroup);
    };

    initMap();

    return () => {
      isMounted = false;
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

  // Update tile layer url when mapStyle changes
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const tileUrl =
      mapStyle === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
    tileLayerRef.current.setUrl(tileUrl);
  }, [mapStyle]);

  // Update route layers smoothly without destroying the map
  useEffect(() => {
    if (!mapInstanceRef.current || !layersGroupRef.current || !leafletRef.current) return;
    renderRoute(leafletRef.current, mapInstanceRef.current, layersGroupRef.current);
  }, [waypoints, mode]);

  const renderRoute = (L: any, map: any, group: any) => {
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
      let bgColor = '#2563eb';
      let iconSymbol = '📍';
      let badgeLabel = '';

      if (type === 'origin') {
        bgColor = '#16a34a';
        iconSymbol = '🟢';
        badgeLabel = 'XUẤT PHÁT';
      } else if (type === 'destination') {
        bgColor = '#dc2626';
        iconSymbol = '🏁';
        badgeLabel = 'ĐÍCH ĐẾN';
      } else if (type === 'airport') {
        bgColor = '#7c3aed';
        iconSymbol = '✈️';
        badgeLabel = 'SÂN BAY';
      } else if (type === 'checkpoint') {
        bgColor = '#d97706';
        iconSymbol = '🛂';
        badgeLabel = 'CỬA KHẨU';
      } else if (type === 'rest') {
        bgColor = '#0284c7';
        iconSymbol = '🏨';
        badgeLabel = 'TRẠM NGHỈ';
      }

      return L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.25));">
            <div style="background-color: ${bgColor}; color: #ffffff; padding: 4px 8px; border-radius: 12px; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; gap: 4px; border: 2px solid #ffffff; white-space: nowrap;">
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

    // Add Markers with prioritized zIndex
    wps.forEach((wp) => {
      bounds.extend(wp.coords);
      const zIndex = wp.type === 'origin' || wp.type === 'destination' ? 2000 : wp.type === 'checkpoint' ? 1500 : 1000;
      const marker = L.marker(wp.coords, {
        icon: createCustomIcon(wp.type),
        zIndexOffset: zIndex,
      }).addTo(group);

      marker.on('click', () => {
        setSelectedWaypoint(wp);
      });

      marker.bindTooltip(`<strong>${wp.name}</strong><br/><span style="color:#64748b;font-size:11px;">${wp.label}</span>`, {
        direction: 'top',
        offset: [0, -24],
        opacity: 0.95,
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.5; min-width: 220px;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">${wp.name}</div>
          <div style="font-size: 11.5px; color: #2563eb; font-weight: 600; margin-bottom: 6px;">${wp.label} • ${wp.country}</div>
          <div style="font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            ${wp.details}
          </div>
        </div>
      `);
    });

    // Draw Route Lines with Instant Baseline + Async OSRM Curve Refinement
    if (mode === 'air' && wps.length >= 4) {
      // Leg 1: Farm to Origin Airport (Driving - Solid Blue)
      const leg1Coords = [wps[0].coords, wps[1].coords];
      const leg1Polyline = L.polyline(leg1Coords, {
        color: '#2563eb',
        weight: 4.5,
        opacity: 0.85,
      }).addTo(group);
      leg1Polyline.bindTooltip('Chặng 1: Đường bộ tới Sân bay', { sticky: true });

      // Leg 2: Airport to Airport (Flight Path - Curved / Geodesic Dashed Purple)
      const p1 = wps[1].coords;
      const p2 = wps[2].coords;
      const flightArc: [number, number][] = [];
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = p1[0] + (p2[0] - p1[0]) * t + Math.sin(t * Math.PI) * 1.5;
        const lng = p1[1] + (p2[1] - p1[1]) * t;
        flightArc.push([lat, lng]);
      }

      const flightPolyline = L.polyline(flightArc, {
        color: '#8b5cf6',
        weight: 3.5,
        dashArray: '8, 8',
        opacity: 0.95,
      }).addTo(group);
      flightPolyline.bindTooltip('Chặng 2: Hành lang bay quốc tế (IATA LAR)', { sticky: true });

      // Leg 3: Destination Airport to Turf Club (Driving - Solid Blue)
      const leg3Coords = [wps[2].coords, wps[3].coords];
      const leg3Polyline = L.polyline(leg3Coords, {
        color: '#2563eb',
        weight: 4.5,
        opacity: 0.85,
      }).addTo(group);
      leg3Polyline.bindTooltip('Chặng 3: Đường bộ từ Sân bay tới Đích đến', { sticky: true });

      // Asynchronously refine road driving curves via OSRM
      setIsNavigating(true);
      Promise.all([
        fetchOsrmDrivingRoute([wps[0].coords, wps[1].coords], abortController.signal),
        fetchOsrmDrivingRoute([wps[2].coords, wps[3].coords], abortController.signal),
      ])
        .then(([resLeg1, resLeg3]) => {
          if (currentReqId !== requestIdRef.current) return;
          setIsNavigating(false);

          if (resLeg1 && resLeg1.coordinates.length > 0) {
            leg1Polyline.setLatLngs(resLeg1.coordinates);
          }
          if (resLeg3 && resLeg3.coordinates.length > 0) {
            const directLeg3 = calculateHaversine(wps[2].coords, wps[3].coords);
            if (resLeg3.distanceKm <= Math.max(80, directLeg3 * 3.5)) {
              leg3Polyline.setLatLngs(resLeg3.coordinates);
            }
          }

          const leg1Dist = resLeg1 ? resLeg1.distanceKm : calculateHaversine(wps[0].coords, wps[1].coords);
          const flightDist = calculateHaversine(wps[1].coords, wps[2].coords);
          const leg3Dist = resLeg3 ? resLeg3.distanceKm : calculateHaversine(wps[2].coords, wps[3].coords);
          const totalAirRealKm = Math.round(leg1Dist + flightDist + leg3Dist);

          setOsrmDistanceKm(totalAirRealKm);
          if (onRouteCalculated) {
            onRouteCalculated({ distanceKm: totalAirRealKm, durationHours: estimatedHours, mode: 'air' });
          }
        })
        .catch(() => {
          if (currentReqId === requestIdRef.current) {
            setIsNavigating(false);
          }
        });
    } else {
      // Overland Road Route (Full Highway Navigation)
      const roadCoords = wps.map((w) => w.coords);
      const roadPolyline = L.polyline(roadCoords, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.9,
      }).addTo(group);
      roadPolyline.bindTooltip('Lộ trình đường bộ liên vận / quốc gia', { sticky: true });

      // Asynchronously fetch real highway curve navigation via OSRM
      setIsNavigating(true);
      fetchOsrmFullRoute(roadCoords, abortController.signal)
        .then((res) => {
          if (currentReqId !== requestIdRef.current) return;
          setIsNavigating(false);

          if (res && res.coordinates.length > 0) {
            roadPolyline.setLatLngs(res.coordinates);
            setOsrmDistanceKm(res.distanceKm);
            if (onRouteCalculated) {
              onRouteCalculated({ distanceKm: res.distanceKm, durationHours: estimatedHours, mode: 'road' });
            }
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
  };

  return (
    <div
      style={{
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #dbeafe',
        backgroundColor: '#ffffff',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header & Mode Switcher */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
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
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Navigation size={18} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              Bản đồ Lộ trình Vận chuyển & Cửa khẩu Hải quan
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Tích hợp hành lang kiểm dịch quốc tế (IATA LAR & ASEAN Veterinary Transit)
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#e2e8f0',
              padding: '3px',
              borderRadius: '8px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setMode('air')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: mode === 'air' ? '#ffffff' : 'transparent',
                color: mode === 'air' ? '#7c3aed' : '#475569',
                boxShadow: mode === 'air' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Plane size={14} />
              <span>Đường Hàng không (Air)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('road')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: mode === 'road' ? '#ffffff' : 'transparent',
                color: mode === 'road' ? '#0284c7' : '#475569',
                boxShadow: mode === 'road' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Truck size={14} />
              <span>Đường Bộ liên vận (Road)</span>
            </button>
          </div>

          {/* Map Layer Switcher */}
          <button
            type="button"
            onClick={() => setMapStyle(mapStyle === 'streets' ? 'satellite' : 'streets')}
            title="Đổi kiểu bản đồ Vệ tinh / Đường phố"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '12px',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={13} />
            <span>{mapStyle === 'streets' ? 'Đường phố' : 'Vệ tinh'}</span>
          </button>
        </div>
      </div>

      {/* Route Presets Quick Bar */}
      <div
        style={{
          padding: '10px 18px',
          backgroundColor: '#f1f5f9',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
          Gợi ý tuyến:
        </span>
        {ROUTE_PRESETS.map((p) => {
          const isActive =
            destinationText.toLowerCase().includes(p.id === 'sg' ? 'singapore' : p.id === 'my' ? 'malaysia' : p.id === 'th' ? 'bangkok' : 'sóc sơn');
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setMode(p.suggestedMode);
                if (onApplyPreset) onApplyPreset(p);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: isActive ? '1px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                color: isActive ? '#1d4ed8' : '#334155',
                boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{p.flag}</span>
              <span>{p.name}</span>
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
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: isGeocoding ? '#fef3c7' : '#eff6ff',
            border: isGeocoding ? '1px solid #fde68a' : '1px solid #bfdbfe',
            fontSize: '11.5px',
            color: isGeocoding ? '#b45309' : '#1d4ed8',
            fontWeight: 600,
            transition: 'all 0.2s ease',
          }}
        >
          <MapPin size={12} color={isGeocoding ? '#d97706' : '#2563eb'} />
          <span>
            {isGeocoding ? (
              'Đang tra cứu toạ độ thực tế...'
            ) : (
              <>
                Nhận diện: <strong>{routeResult.origin.name}</strong> ➔ <strong>{routeResult.destination.name}</strong> (
                {routeResult.isDomestic ? 'Nội địa' : 'Quốc tế'}
                {customDestGeo || customOriginGeo ? ' • GPS Dynamic' : ''})
              </>
            )}
          </span>
        </div>
      </div>

      {/* Map Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '360px', backgroundColor: '#e2e8f0' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Legend Overlay at bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            borderRadius: '10px',
            padding: '10px 14px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 1000,
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            color: '#334155',
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>Ký hiệu hành lang:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
            <span>Trang trại xuất phát</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#d97706' }} />
            <span>Cửa khẩu / Sân bay kiểm dịch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0284c7' }} />
            <span>Trạm nghỉ & Bác sĩ thú y (Vet Stop)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
            <span>Trường đua / Chuồng đích đến</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #cbd5e1' }}>
            <span style={{ width: '16px', height: '4px', backgroundColor: '#0284c7', borderRadius: '2px' }} />
            <span style={{ fontWeight: 600 }}>Tuyến đường bộ (Cao tốc / Quốc lộ thực tế)</span>
          </div>
          {mode === 'air' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '0px', borderTop: '2.5px dashed #8b5cf6' }} />
              <span style={{ fontWeight: 600 }}>Hành lang hàng không (IATA LAR)</span>
            </div>
          )}
        </div>

        {/* Selected Waypoint Detail Card (if clicked) */}
        {selectedWaypoint && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              maxWidth: '300px',
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '14px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 1000,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{selectedWaypoint.name}</div>
                <div style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600 }}>{selectedWaypoint.label}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWaypoint(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '16px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '0 4px',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '8px', lineHeight: 1.5 }}>
              {selectedWaypoint.details}
            </div>
          </div>
        )}
      </div>

      {/* Live Route Metrics Summary Bar */}
      <div
        style={{
          padding: '12px 18px',
          backgroundColor: '#eff6ff',
          borderTop: '1px solid #dbeafe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={16} color="#2563eb" />
            <span style={{ fontSize: '12.5px', color: '#475569' }}>Tổng quãng đường:</span>
            <strong style={{ fontSize: '14px', color: '#1e40af' }}>
              {(osrmDistanceKm ?? totalDistanceKm).toLocaleString()} km
            </strong>
            {osrmDistanceKm !== null ? (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #86efac',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Đã tính toán chính xác theo mạng lưới đường bộ & cao tốc thực tế (OSRM Navigation Engine)"
              >
                <span>✨</span>
                <span>Lộ trình đường bộ thực tế</span>
              </span>
            ) : isNavigating ? (
              <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⏳</span>
                <span>Đang nắn tuyến cao tốc...</span>
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} color="#2563eb" />
            <span style={{ fontSize: '12.5px', color: '#475569' }}>Thời gian ước tính:</span>
            <strong style={{ fontSize: '14px', color: '#1e40af' }}>
              {mode === 'air' ? `~${estimatedHours} tiếng` : `~${Math.round(estimatedHours / 24)} ngày (${estimatedHours}h)`}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="#059669" />
            <span style={{ fontSize: '12.5px', color: '#475569' }}>Trạm hải quan & kiểm dịch:</span>
            <strong style={{ fontSize: '14px', color: '#065f46' }}>{customsCount} trạm bắt buộc</strong>
          </div>
        </div>

        <div style={{ fontSize: '11.5px', color: '#3b82f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Info size={13} />
          <span>Nhấn vào các trạm trên bản đồ để xem chi tiết thủ tục kiểm dịch</span>
        </div>
      </div>
    </div>
  );
};

export default RoutePlanningMap;
