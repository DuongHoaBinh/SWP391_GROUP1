'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DepotOption } from '@/features/fleet/fleet-catalog';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface DepotMapProps {
  depots: DepotOption[];
  selectedId?: number | null;
  onSelect?: (depot: DepotOption) => void;
  /** Khi có: bấm lên bản đồ để chọn tọa độ (dùng trong form tạo/sửa trạm). */
  onPick?: (lat: number, lng: number) => void;
  pickedPoint?: { lat: number; lng: number } | null;
  className?: string;
}

/** Bản đồ trạm xe (Step 3): trạm riêng màu vàng đồng, trạm đối tác màu xanh, trạm tạm ngưng màu xám. */
export default function DepotMap({ depots, selectedId, onSelect, onPick, pickedPoint, className }: DepotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { center: [13.5, 104.5], zoom: 5, zoomControl: false, attributionControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri, HERE, Garmin, METI/NASA, USGS',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on('click', (e: any) => onPickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
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
    for (const d of depots) {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
      const color = !d.isActive ? '#9AA1A9' : d.type === 'partner' ? '#2F6FA3' : '#A67C2E';
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: d.id === selectedId ? 11 : 8,
        color: '#181A17',
        weight: d.id === selectedId ? 3 : 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      });
      marker.bindTooltip(
        `<strong>${escapeHtml(d.name)}</strong><br/>${escapeHtml(d.city)}, ${escapeHtml(d.country)}<br/>${escapeHtml(d.vehicleCount ?? 0)} xe`,
        { direction: 'top' },
      );
      marker.on('click', () => onSelect?.(d));
      marker.addTo(layer);
      bounds.push([d.lat, d.lng]);
    }
    if (pickedPoint && Number.isFinite(pickedPoint.lat) && Number.isFinite(pickedPoint.lng)) {
      L.circleMarker([pickedPoint.lat, pickedPoint.lng], {
        radius: 9,
        color: '#B33E3E',
        weight: 3,
        fillColor: '#FFFFFF',
        fillOpacity: 1,
      }).addTo(layer);
      return; // đang chọn tọa độ: không tự đổi khung nhìn mỗi lần bấm
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
    else if (bounds.length === 1) map.setView(bounds[0], 9);
  }, [ready, depots, selectedId, onSelect, pickedPoint]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Bản đồ trạm xe"
      className={className ?? 'w-full h-[360px] rounded-2xl border border-[#E5DDD0] overflow-hidden'}
    />
  );
}
