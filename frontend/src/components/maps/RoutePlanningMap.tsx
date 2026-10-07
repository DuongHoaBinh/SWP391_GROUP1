'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plane, Truck, Navigation, Info, ShieldCheck, Clock, MapPin, Layers } from 'lucide-react';

import { buildEquineRoute, RouteCalculationResult, Waypoint } from '@/lib/geo-corridors';

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

export const RoutePlanningMap: React.FC<RoutePlanningMapProps> = ({
  originText = 'Trang trại Củ Chi, TP.HCM',
  destinationText = 'Singapore Turf Club, Singapore',
  transportType = 'International',
  onRouteCalculated,
  onApplyPreset,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);

  const [mode, setMode] = useState<'air' | 'road'>('air');
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);

  // Dynamic Equine Route Computation for ANY input text
  const routeResult: RouteCalculationResult = React.useMemo(() => {
    return buildEquineRoute(originText, destinationText, mode, transportType);
  }, [originText, destinationText, mode, transportType]);

  const waypoints = routeResult.waypoints;
  const totalDistanceKm = routeResult.distanceKm;
  const estimatedHours = routeResult.durationHours;
  const customsCount = routeResult.customsCount;

  useEffect(() => {
    if (onRouteCalculated) {
      onRouteCalculated({ distanceKm: totalDistanceKm, durationHours: estimatedHours, mode });
    }
  }, [mode, originText, destinationText, transportType, totalDistanceKm, estimatedHours]);

  // Leaflet initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (!isMounted || !mapContainerRef.current) return;

      // Clean up previous instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
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

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: 'Esri, HERE, Garmin, METI/NASA, USGS',
      }).addTo(map);

      const layersGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layersGroup;
      mapInstanceRef.current = map;

      // Render markers & routes
      renderRoute(L, map, layersGroup);
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mode, mapStyle, originText, destinationText]);

  const renderRoute = (L: any, map: any, group: any) => {
    group.clearLayers();

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

    // Draw Route Lines
    if (mode === 'air' && wps.length >= 4) {
      // Leg 1: Farm to Origin Airport (Driving - Solid Blue)
      const leg1Coords = [wps[0].coords, wps[1].coords];
      L.polyline(leg1Coords, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
      }).addTo(group);

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

      L.polyline(flightArc, {
        color: '#8b5cf6',
        weight: 3.5,
        dashArray: '8, 8',
        opacity: 0.95,
      }).addTo(group);

      // Leg 3: Destination Airport to Turf Club (Driving - Solid Blue)
      const leg3Coords = [wps[2].coords, wps[3].coords];
      L.polyline(leg3Coords, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
      }).addTo(group);
    } else {
      // Overland Road Route or direct line
      const roadCoords = wps.map((w) => w.coords);
      L.polyline(roadCoords, {
        color: '#0284c7',
        weight: 4.5,
        opacity: 0.9,
      }).addTo(group);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
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
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            fontSize: '11.5px',
            color: '#1d4ed8',
            fontWeight: 600,
          }}
        >
          <MapPin size={12} color="#2563eb" />
          <span>
            Nhận diện: <strong>{routeResult.origin.name}</strong> ➔ <strong>{routeResult.destination.name}</strong> ({routeResult.isDomestic ? 'Nội địa' : 'Quốc tế'})
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
            <span>Cửa khẩu / Sân bay có Trạm kiểm dịch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0284c7' }} />
            <span>Trạm nghỉ & Bác sĩ thú y (Vet Stop)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
            <span>Trường đua / Chuồng đích đến</span>
          </div>
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
            <strong style={{ fontSize: '14px', color: '#1e40af' }}>{totalDistanceKm.toLocaleString()} km</strong>
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
