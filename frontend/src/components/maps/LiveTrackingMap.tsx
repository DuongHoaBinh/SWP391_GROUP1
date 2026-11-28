'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Navigation } from 'lucide-react';
import type { LiveTrackingDetails } from '@/features/tracking/api/tracking.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const liveOsrmCache = new Map<string, Array<[number, number]>>();

function buildOsrmKey(points: Array<[number, number]>): string {
  return points.map(([lat, lng]) => `${lng.toFixed(4)},${lat.toFixed(4)}`).join(';');
}

function sampleWaypoints(points: Array<[number, number]>, maxPoints = 25): Array<[number, number]> {
  const deduped: Array<[number, number]> = [];
  for (const pt of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev[0] - pt[0]) > 0.0002 || Math.abs(prev[1] - pt[1]) > 0.0002) {
      deduped.push(pt);
    }
  }
  if (deduped.length <= maxPoints) return deduped;
  const sampled: Array<[number, number]> = [deduped[0]];
  const step = (deduped.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    sampled.push(deduped[Math.round(i * step)]);
  }
  sampled.push(deduped[deduped.length - 1]);
  return sampled;
}

async function fetchOsrmSegment(
  points: Array<[number, number]>,
  signal?: AbortSignal,
): Promise<Array<[number, number]> | null> {
  if (points.length < 2) return null;
  const key = buildOsrmKey(points);
  if (liveOsrmCache.has(key)) return liveOsrmCache.get(key)!;
  try {
    const coordParam = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordParam}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code !== 'Ok' || !Array.isArray(data?.routes) || !data.routes.length) return null;
    const coords: Array<[number, number]> = data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
    );
    if (coords.length < 2) return null;
    liveOsrmCache.set(key, coords);
    return coords;
  } catch {
    return null;
  }
}

async function fetchOsrmSnappedRoad(
  rawPoints: Array<[number, number]>,
  signal?: AbortSignal,
): Promise<Array<[number, number]> | null> {
  const waypoints = sampleWaypoints(rawPoints, 25);
  if (waypoints.length < 2) return null;
  const fullKey = buildOsrmKey(waypoints);
  if (liveOsrmCache.has(fullKey)) return liveOsrmCache.get(fullKey)!;

  const direct = await fetchOsrmSegment(waypoints, signal);
  if (direct) return direct;

  if (waypoints.length > 2) {
    const merged: Array<[number, number]> = [];
    let anySnapped = false;
    for (let i = 0; i < waypoints.length - 1; i++) {
      if (signal?.aborted) return null;
      const seg = await fetchOsrmSegment([waypoints[i], waypoints[i + 1]], signal);
      if (seg) {
        if (merged.length > 0) merged.push(...seg.slice(1));
        else merged.push(...seg);
        anySnapped = true;
      } else {
        if (merged.length === 0) merged.push(waypoints[i]);
        merged.push(waypoints[i + 1]);
      }
    }
    if (anySnapped && merged.length > 1) {
      liveOsrmCache.set(fullKey, merged);
      return merged;
    }
  }
  return null;
}

export interface LiveTrackingMapProps {
  details?: LiveTrackingDetails | null;
  liveData?: LiveTrackingDetails | null;
  className?: string;
  height?: string | number;
  autoCenter?: boolean;
}

export function LiveTrackingMap({
  details,
  liveData,
  className = '',
  height = '480px',
  autoCenter = true,
}: LiveTrackingMapProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const activeDetails = liveData ?? details ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const pathLayerRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(autoCenter);

  // Initialize Leaflet Map
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [14.0583, 108.2772], // Vietnam center
        zoom: 6,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const primaryTiles = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 },
      ).addTo(map);

      let fallbackAdded = false;
      primaryTiles.on('tileerror', () => {
        if (fallbackAdded || !mounted) return;
        fallbackAdded = true;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);
      });

      const pathGroup = L.layerGroup().addTo(map);
      const markersGroup = L.layerGroup().addTo(map);

      mapRef.current = map;
      pathLayerRef.current = pathGroup;
      markersLayerRef.current = markersGroup;

      if (mounted) setReady(true);

      timer = setTimeout(() => {
        if (mounted && map) map.invalidateSize();
      }, 250);

      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        ro = new ResizeObserver(() => {
          if (mounted && mapRef.current) {
            mapRef.current.invalidateSize();
          }
        });
        ro.observe(containerRef.current);
        (map as any)._eqResizeObserver = ro;
      }
    })();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (mapRef.current) {
        try {
          (mapRef.current as any)._eqResizeObserver?.disconnect();
        } catch {
          // ignore
        }
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map contents when activeDetails change
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const pathGroup = pathLayerRef.current;
    const markersGroup = markersLayerRef.current;

    if (!ready || !L || !map || !pathGroup || !markersGroup || !activeDetails) return;

    pathGroup.clearLayers();
    markersGroup.clearLayers();

    const abortController = new AbortController();
    const boundsPoints: Array<[number, number]> = [];

    const normalizePolylineCoords = (raw: unknown): Array<[number, number]> | null => {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const out: Array<[number, number]> = [];
      for (const item of raw) {
        if (Array.isArray(item) && item.length >= 2) {
          const lat = Number(item[0]);
          const lng = Number(item[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
        } else if (item && typeof item === 'object' && 'lat' in item && 'lng' in item) {
          const lat = Number((item as { lat: unknown }).lat);
          const lng = Number((item as { lng: unknown }).lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
        }
      }
      return out.length > 1 ? out : null;
    };

    // 1. Draw Legs / Polylines (styled by leg type: road, flight, sea; snap sparse road legs via OSRM)
    for (const leg of activeDetails.legs || []) {
      let polyCoords: Array<[number, number]> | null = normalizePolylineCoords(leg.polyline);
      if (!polyCoords && leg.polylineJson) {
        try {
          polyCoords = normalizePolylineCoords(JSON.parse(leg.polylineJson));
        } catch {}
      }
      if (polyCoords && polyCoords.length > 0) {
        const legKind = leg.type || leg.legType || 'road';
        const lineStyle =
          legKind === 'sea'
            ? { color: '#0E7490', weight: 3.5, dashArray: '6, 8', opacity: 0.92 }
            : legKind === 'flight'
              ? { color: '#B49A68', weight: 3, dashArray: '8, 8', opacity: 0.85 }
              : { color: '#94A3B8', weight: 3, dashArray: '6, 6', opacity: 0.8 };

        const cachedRoad =
          legKind === 'road' && polyCoords.length <= 25
            ? liveOsrmCache.get(buildOsrmKey(sampleWaypoints(polyCoords, 25)))
            : undefined;
        const initialCoords = cachedRoad ?? polyCoords;
        const legLine = L.polyline(initialCoords, lineStyle).addTo(pathGroup);
        initialCoords.forEach((pt: [number, number]) => boundsPoints.push(pt));

        if (legKind === 'road' && !cachedRoad && polyCoords.length <= 25) {
          fetchOsrmSnappedRoad(polyCoords, abortController.signal).then((snapped) => {
            if (snapped && !abortController.signal.aborted) {
              try {
                legLine.setLatLngs(snapped);
              } catch {}
            }
          });
        }
      }
    }

    // 2. Draw actual Ping Path (snap road trips onto real highway geometry via OSRM)
    const legsList = activeDetails.legs || [];
    const isNonRoadOnly =
      legsList.length > 0 &&
      legsList.every((l) => {
        const kind = l.type || l.legType || 'road';
        return kind === 'flight' || kind === 'sea';
      });

    if (Array.isArray(activeDetails.path) && activeDetails.path.length > 1) {
      const pingCoords: Array<[number, number]> = activeDetails.path
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => [Number(p.lat), Number(p.lng)]);

      if (pingCoords.length > 1) {
        const shouldSnapRoad = !isNonRoadOnly;
        const cachedPingPath = shouldSnapRoad
          ? liveOsrmCache.get(buildOsrmKey(sampleWaypoints(pingCoords, 25)))
          : undefined;
        const initialPingCoords = cachedPingPath ?? pingCoords;

        const pingLine = L.polyline(initialPingCoords, {
          color: '#2563EB',
          weight: 4,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(pathGroup);
        initialPingCoords.forEach((pt) => boundsPoints.push(pt));

        if (shouldSnapRoad && !cachedPingPath) {
          fetchOsrmSnappedRoad(pingCoords, abortController.signal).then((snapped) => {
            if (snapped && !abortController.signal.aborted) {
              try {
                pingLine.setLatLngs(snapped);
              } catch {}
            }
          });
        }
      }
    }

    // 3. Draw Stops & Geofences
    for (const stop of activeDetails.stops || []) {
      if (stop.lat == null || stop.lng == null) continue;
      const lat = Number(stop.lat);
      const lng = Number(stop.lng);
      boundsPoints.push([lat, lng]);

      const isCompleted = stop.status === 'departed' || stop.status === 'completed';
      const isCurrent = stop.status === 'arrived' || stop.status === 'customs_cleared';
      const stopColor = isCompleted ? '#10B981' : isCurrent ? '#F59E0B' : '#64748B';

      // Geofence Circle
      const radiusM = stop.geofenceRadiusM || (['border_check', 'quarantine'].includes(stop.stopType || '') ? 1000 : 300);
      L.circle([lat, lng], {
        radius: radiusM,
        color: stopColor,
        fillColor: stopColor,
        fillOpacity: 0.12,
        weight: 1,
        dashArray: isCurrent ? undefined : '4, 4',
      }).addTo(markersGroup);

      const stopHtml = `
        <div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${stopColor}; border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; font-weight: bold; font-size: 11px;
        ">
          ${stop.sequenceNo || '•'}
        </div>
      `;

      const icon = L.divIcon({
        html: stopHtml,
        className: 'stop-custom-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(markersGroup);
      const stopLabel = escapeHtml(
        stop.name || stop.locationName || (isEn ? `Stop #${stop.sequenceNo}` : `Trạm dừng #${stop.sequenceNo}`),
      );
      const stopTypeMap: Record<string, string> = isEn
        ? {
            rest: 'Rest Stop',
            quarantine: 'Veterinary Quarantine',
            border_check: 'Border / Customs',
            refuel: 'Refuel Stop',
            transfer_hub: 'Transfer Hub',
            seaport: 'Seaport',
          }
        : {
            rest: 'Trạm nghỉ ngựa',
            quarantine: 'Kiểm dịch thú y',
            border_check: 'Cửa khẩu / Hải quan',
            refuel: 'Tiếp nhiên liệu',
            transfer_hub: 'Trạm trung chuyển',
            seaport: 'Cảng biển',
          };
      const rawType = String(stop.type || stop.stopType || '');
      const stopTypeText = escapeHtml(stopTypeMap[rawType] || rawType || (isEn ? 'Checkpoint' : 'Trạm dừng'));
      const stopStatusMap: Record<string, string> = isEn
        ? {
            pending: 'Pending',
            arrived: 'Arrived',
            customs_cleared: 'Customs Cleared',
            cleared: 'Customs Cleared',
            departed: 'Departed',
            completed: 'Completed',
          }
        : {
            pending: 'Chờ tới',
            arrived: 'Đã tới trạm',
            customs_cleared: 'Đã thông quan',
            cleared: 'Đã thông quan',
            departed: 'Đã rời trạm',
            completed: 'Hoàn thành',
          };
      const stopStatusText = escapeHtml(
        stopStatusMap[String(stop.status || '').toLowerCase()] || String(stop.status || '').toUpperCase(),
      );
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <div style="font-weight: bold; color: #1E293B;">${stopLabel}</div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">${isEn ? 'Type' : 'Loại'}: ${stopTypeText}</div>
          <div style="margin-top: 4px; font-size: 12px;">
            ${isEn ? 'Status' : 'Trạng thái'}: <span style="font-weight: 600; color: ${stopColor};">${stopStatusText}</span>
          </div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">${isEn ? 'Geofence radius' : 'Bán kính kiểm soát'}: ${radiusM}m</div>
        </div>
      `);
    }

    // 4. Draw Vehicle Marker
    const vehicle = activeDetails.currentPosition || activeDetails.vehiclePosition || activeDetails.vehicle;
    if (vehicle && vehicle.lat != null && vehicle.lng != null) {
      const vLat = Number(vehicle.lat);
      const vLng = Number(vehicle.lng);
      boundsPoints.push([vLat, vLng]);

      const isSim = vehicle.source === 'simulated' || activeDetails.isSimulated;
      const vehicleColor = isSim ? '#D97706' : '#2563EB';

      const truckHtml = `
        <div style="
          width: 38px; height: 38px; border-radius: 50%;
          background: ${vehicleColor}; border: 3px solid #ffffff;
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
          color: #ffffff;
          transform: rotate(${vehicle.headingDeg || 0}deg);
          transition: all 0.3s ease;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>
      `;

      const vIcon = L.divIcon({
        html: truckHtml,
        className: 'vehicle-live-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const vMarker = L.marker([vLat, vLng], { icon: vIcon, zIndexOffset: 1000 }).addTo(markersGroup);
      const vehicleTitle = isSim
        ? isEn
          ? '🚚 TRANSPORT VEHICLE (SIMULATED)'
          : '🚚 XE VẬN CHUYỂN (GIẢ LẬP)'
        : isEn
        ? '🚚 TRANSPORT VEHICLE'
        : '🚚 XE VẬN CHUYỂN';
      const speedText = vehicle.speedKmh
        ? `${Math.round(vehicle.speedKmh)} km/h`
        : isEn
        ? 'Stopped / updating'
        : 'Đang dừng / cập nhật';
      const updatedTimeText = escapeHtml(
        new Date(vehicle.recordedAt).toLocaleTimeString(isEn ? 'en-US' : 'vi-VN'),
      );
      vMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <div style="font-weight: bold; color: ${vehicleColor}; display: flex; align-items: center; gap: 4px;">
            <span>${vehicleTitle}</span>
          </div>
          <div style="margin-top: 4px; color: #334155;">
            ${isEn ? 'Speed' : 'Tốc độ'}: <b>${escapeHtml(speedText)}</b>
          </div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">
            ${isEn ? 'Updated' : 'Cập nhật'}: ${updatedTimeText}
          </div>
          ${vehicle.accuracyM ? `<div style="color: #64748B; font-size: 11px;">${isEn ? 'GPS accuracy' : 'Độ chính xác GPS'}: ±${Math.round(vehicle.accuracyM)}m</div>` : ''}
        </div>
      `);
      vehicleMarkerRef.current = vMarker;

      if (following) {
        map.setView([vLat, vLng], Math.max(map.getZoom(), 12), { animate: true });
      }
    }

    // Initial bounds fitting if not following
    if (!following && boundsPoints.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40], maxZoom: 14 });
      } catch {}
    }

    return () => {
      abortController.abort();
    };
  }, [activeDetails, ready, following, isEn]);

  const handleCenterVehicle = useCallback(() => {
    const vehicle = activeDetails?.currentPosition || activeDetails?.vehiclePosition || activeDetails?.vehicle;
    if (vehicle && mapRef.current) {
      setFollowing(true);
      mapRef.current.setView([Number(vehicle.lat), Number(vehicle.lng)], 13, { animate: true });
    }
  }, [activeDetails]);

  const isSim = Boolean(activeDetails?.isSimulated || activeDetails?.simulation);

  return (
    <div className={`relative w-full rounded-2xl overflow-hidden border border-[#D8CEBE] shadow-sm bg-[#F5F2EB] ${className}`} style={{ height }}>
      {/* Map Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Floating Header Badges */}
      <div className="absolute top-3 left-3 right-14 z-[1000] flex flex-wrap gap-2 items-center">
        {isSim && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-md animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white inline-block" />
            {isEn ? 'SIMULATION MODE' : 'ĐANG GIẢ LẬP'}
          </div>
        )}
        {activeDetails?.progressPct !== undefined && (
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-[#181A17] border border-[#D8CEBE] shadow-sm">
            {isEn ? 'Progress:' : 'Tiến độ:'} <b className="text-[#A67C2E]">{activeDetails.progressPct}%</b>
          </div>
        )}
        {activeDetails?.estimatedArrival && (
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-[#181A17] border border-[#D8CEBE] shadow-sm">
            ETA: <b>{new Date(activeDetails.estimatedArrival).toLocaleTimeString(isEn ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit' })}</b>
          </div>
        )}
      </div>

      {/* Map Action Floating Controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCenterVehicle}
          title={isEn ? 'Center on vehicle' : 'Tập trung vào xe'}
          aria-label={isEn ? 'Center on vehicle' : 'Tập trung vào xe'}
          className={`p-2.5 rounded-xl shadow-md border transition-all cursor-pointer ${
            following
              ? 'bg-[#A67C2E] text-white border-[#8c6521]'
              : 'bg-white text-[#181A17] border-[#D8CEBE] hover:bg-[#FDFCFB]'
          }`}
        >
          <Navigation size={18} className={following ? 'rotate-45' : ''} />
        </button>
      </div>

      {/* Legend / Status Pill at bottom */}
      <div className="absolute bottom-3 left-3 right-3 z-[1000] pointer-events-none flex justify-center">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-3 sm:px-4 py-2 rounded-xl border border-[#D8CEBE] shadow-lg flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-[11px] sm:text-xs font-medium text-[#181A17] max-w-full">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block shrink-0" />
            <span>{isEn ? 'Completed' : 'Đã hoàn thành'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block shrink-0" />
            <span>{isEn ? 'In Progress' : 'Đang diễn ra'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#64748B] inline-block shrink-0" />
            <span>{isEn ? 'Upcoming' : 'Chờ tới'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#2563EB] inline-block shrink-0" />
            <span>{isEn ? 'Live GPS Track' : 'Vệt đường thực tế'}</span>
          </div>
          {(activeDetails?.legs || []).some((l) => (l.type || l.legType) === 'sea') && (
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t-2 border-dashed border-[#0E7490] inline-block shrink-0" />
              <span>{isEn ? 'Maritime Route' : 'Tuyến đường thủy'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveTrackingMap;
