'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Navigation } from 'lucide-react';
import type { LiveTrackingDetails } from '@/features/tracking/api/tracking.api';

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

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
      }).addTo(map);

      const pathGroup = L.layerGroup().addTo(map);
      const markersGroup = L.layerGroup().addTo(map);

      mapRef.current = map;
      pathLayerRef.current = pathGroup;
      markersLayerRef.current = markersGroup;

      if (mounted) setReady(true);

      timer = setTimeout(() => {
        if (mounted && map) map.invalidateSize();
      }, 300);
    })();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (mapRef.current) {
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

    const boundsPoints: Array<[number, number]> = [];

    // 1. Draw Legs / Polylines
    for (const leg of activeDetails.legs || []) {
      if (leg.polylineJson) {
        try {
          const polyCoords = JSON.parse(leg.polylineJson);
          if (Array.isArray(polyCoords) && polyCoords.length > 0) {
            L.polyline(polyCoords, {
              color: '#94A3B8',
              weight: 3,
              dashArray: '6, 6',
              opacity: 0.8,
            }).addTo(pathGroup);
            polyCoords.forEach((pt: [number, number]) => boundsPoints.push(pt));
          }
        } catch {}
      }
    }

    // 2. Draw actual Ping Path
    if (Array.isArray(activeDetails.path) && activeDetails.path.length > 1) {
      const pingCoords: Array<[number, number]> = activeDetails.path
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => [Number(p.lat), Number(p.lng)]);

      if (pingCoords.length > 1) {
        L.polyline(pingCoords, {
          color: '#2563EB',
          weight: 4,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(pathGroup);
        pingCoords.forEach((pt) => boundsPoints.push(pt));
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
      const stopLabel = stop.name || stop.locationName || `Trạm dừng #${stop.sequenceNo}`;
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <div style="font-weight: bold; color: #1E293B;">${stopLabel}</div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">Loại: ${stop.type || stop.stopType || 'Trạm'}</div>
          <div style="margin-top: 4px; font-size: 12px;">
            Trạng thái: <span style="font-weight: 600; color: ${stopColor};">${stop.status.toUpperCase()}</span>
          </div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">Bán kính kiểm soát: ${radiusM}m</div>
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
      vMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <div style="font-weight: bold; color: ${vehicleColor}; display: flex; align-items: center; gap: 4px;">
            <span>${isSim ? '🚚 XE VẬN CHUYỂN (GIẢ LẬP)' : '🚚 XE VẬN CHUYỂN'}</span>
          </div>
          <div style="margin-top: 4px; color: #334155;">
            Tốc độ: <b>${vehicle.speedKmh ? `${Math.round(vehicle.speedKmh)} km/h` : 'Đang dừng / cập nhật'}</b>
          </div>
          <div style="color: #64748B; font-size: 11px; margin-top: 2px;">
            Cập nhật: ${new Date(vehicle.recordedAt).toLocaleTimeString('vi-VN')}
          </div>
          ${vehicle.accuracyM ? `<div style="color: #64748B; font-size: 11px;">Độ chính xác GPS: ±${Math.round(vehicle.accuracyM)}m</div>` : ''}
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
  }, [activeDetails, ready, following]);

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
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 items-center">
        {isSim && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-md animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white inline-block" />
            ĐANG GIẢ LẬP (SIMULATION)
          </div>
        )}
        {activeDetails?.progressPct !== undefined && (
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-[#181A17] border border-[#D8CEBE] shadow-sm">
            Tiến độ: <b className="text-[#A67C2E]">{activeDetails.progressPct}%</b>
          </div>
        )}
        {activeDetails?.estimatedArrival && (
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-[#181A17] border border-[#D8CEBE] shadow-sm">
            ETA: <b>{new Date(activeDetails.estimatedArrival).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</b>
          </div>
        )}
      </div>

      {/* Map Action Floating Controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCenterVehicle}
          title="Tập trung vào xe"
          className={`p-2.5 rounded-xl shadow-md border transition-all ${
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
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl border border-[#D8CEBE] shadow-lg flex items-center gap-4 text-xs font-medium text-[#181A17]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#10B981] inline-block" />
            <span>Đã hoàn thành</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#F59E0B] inline-block" />
            <span>Đang diễn ra</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#64748B] inline-block" />
            <span>Chờ tới</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#2563EB] inline-block" />
            <span>Vệt đường thực tế</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveTrackingMap;
