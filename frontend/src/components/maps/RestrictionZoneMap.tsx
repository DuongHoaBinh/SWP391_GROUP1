'use client';

import React, { useEffect, useRef, useState } from 'react';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ZoneCircle {
  id: number;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  bannedFrom: string;
  bannedTo: string;
  isActive: boolean;
}

interface RestrictionZoneMapProps {
  zones: ZoneCircle[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  className?: string;
}

/** Bản đồ vùng cấm xe tải nội đô (Step 9): vòng tròn đỏ = đang áp dụng, xám = tạm tắt. */
export default function RestrictionZoneMap({ zones, selectedId, onSelect, className }: RestrictionZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [focusCity, setFocusCity] = useState<'ALL' | 'HN' | 'HCM'>('ALL');

  const focusPreset = (city: 'ALL' | 'HN' | 'HCM') => {
    setFocusCity(city);
    const map = mapRef.current;
    if (!map) return;
    if (city === 'HN') {
      map.setView([21.0285, 105.8542], 11);
      return;
    }
    if (city === 'HCM') {
      map.setView([10.7769, 106.7009], 11);
      return;
    }
    const pts: [number, number][] = zones
      .filter((z) => Number.isFinite(z.centerLat) && Number.isFinite(z.centerLng))
      .map((z) => [z.centerLat, z.centerLng]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 9 });
    else if (pts.length === 1) map.setView(pts[0], 11);
  };

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { center: [16, 106], zoom: 5, zoomControl: false, attributionControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri, HERE, Garmin, METI/NASA, USGS',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      timer = setTimeout(() => map.invalidateSize(), 250);
    })();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      try {
        mapRef.current?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const z of zones) {
      if (!Number.isFinite(z.centerLat) || !Number.isFinite(z.centerLng)) continue;
      const color = z.isActive ? '#B33E3E' : '#9AA1A9';
      const circle = L.circle([z.centerLat, z.centerLng], {
        radius: z.radiusKm * 1000,
        color,
        weight: z.id === selectedId ? 3 : 1.5,
        fillColor: color,
        fillOpacity: z.id === selectedId ? 0.25 : 0.12,
      });
      circle.bindTooltip(
        `<strong>${escapeHtml(z.city)}</strong><br/>Cấm xe tải nặng ${escapeHtml(z.bannedFrom)}–${escapeHtml(z.bannedTo)}<br/>Bán kính ${escapeHtml(z.radiusKm)} km`,
        { direction: 'top' },
      );
      circle.on('click', () => onSelect?.(z.id));
      circle.addTo(layer);
      bounds.push([z.centerLat, z.centerLng]);
    }
    if (selectedId) {
      const z = zones.find((x) => x.id === selectedId);
      if (z) {
        map.setView([z.centerLat, z.centerLng], 10);
        return;
      }
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    else if (bounds.length === 1) map.setView(bounds[0], 10);
  }, [ready, zones, selectedId, onSelect]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#5C6658]">
          Phóng nhanh khu vực đô thị:
        </span>
        <div className="inline-flex items-center gap-1 bg-[#FAF8F4] border border-[#D8CEBE] rounded-lg p-0.5">
          {[
            { key: 'ALL' as const, label: 'Toàn quốc' },
            { key: 'HCM' as const, label: 'TP.HCM' },
            { key: 'HN' as const, label: 'Hà Nội' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => focusPreset(item.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer border-0 whitespace-nowrap ${
                focusCity === item.key
                  ? 'bg-[#181A17] text-[#FAF8F4]'
                  : 'bg-transparent text-[#5C6658] hover:text-[#181A17]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        role="region"
        aria-label="Bản đồ vùng cấm xe tải"
        className={className ?? 'w-full h-[340px] rounded-2xl border border-[#E5DDD0] overflow-hidden'}
      />
    </div>
  );
}
