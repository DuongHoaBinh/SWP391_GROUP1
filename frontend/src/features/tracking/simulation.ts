'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { trackingApi, PositionPingItem } from './api/tracking.api';

export type SimulationSpeed = 1 | 10 | 60;

interface GeoCoord {
  lat: number;
  lng: number;
}

function calculateDistanceMeters(p1: GeoCoord, p2: GeoCoord): number {
  const R = 6371e3;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface UseRouteSimulationOptions {
  shipmentId: number;
  routeCoordinates: GeoCoord[];
  enabled: boolean;
  onAutoCheckInProximity?: (lat: number, lng: number) => void;
}

export function useRouteSimulation({
  shipmentId,
  routeCoordinates,
  enabled,
  onAutoCheckInProximity,
}: UseRouteSimulationOptions) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPos, setCurrentPos] = useState<GeoCoord | null>(
    routeCoordinates.length > 0 ? routeCoordinates[0] : null,
  );

  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const isSimulatingRef = useRef(isSimulating);
  isSimulatingRef.current = isSimulating;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const sendPing = useCallback(
    async (lat: number, lng: number, speedKmh: number) => {
      if (!shipmentId) return;
      try {
        const ping: PositionPingItem = {
          lat,
          lng,
          speedKmh,
          headingDeg: 0,
          accuracyM: 5,
          source: 'simulated',
          recordedAt: new Date().toISOString(),
        };
        await trackingApi.sendPositionPings(shipmentId, [ping]);
      } catch (err) {
        console.warn('Simulation ping send error:', err);
      }
    },
    [shipmentId],
  );

  const startSimulation = useCallback(() => {
    if (!enabled || routeCoordinates.length < 2) return;
    setIsSimulating(true);
  }, [enabled, routeCoordinates.length]);

  const pauseSimulation = useCallback(() => {
    setIsSimulating(false);
  }, []);

  const resetSimulation = useCallback(() => {
    setIsSimulating(false);
    setCurrentIndex(0);
    setCurrentPos(routeCoordinates[0] || null);
  }, [routeCoordinates]);

  useEffect(() => {
    if (!isSimulating || !enabled || routeCoordinates.length < 2) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Interval fires every 3 seconds
    const intervalMs = 3000;
    timerRef.current = setInterval(() => {
      const idx = currentIndexRef.current;
      const spd = speedRef.current;

      // Advance by step proportional to speed
      const nextIdx = Math.min(idx + spd, routeCoordinates.length - 1);
      const nextPoint = routeCoordinates[nextIdx];

      if (nextPoint) {
        currentIndexRef.current = nextIdx;
        setCurrentIndex(nextIdx);
        setCurrentPos(nextPoint);

        const simulatedSpeedKmh = 45 * (spd === 1 ? 1 : spd === 10 ? 1.5 : 2);
        sendPing(nextPoint.lat, nextPoint.lng, simulatedSpeedKmh);

        onAutoCheckInProximity?.(nextPoint.lat, nextPoint.lng);
      }

      if (nextIdx >= routeCoordinates.length - 1) {
        setIsSimulating(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSimulating, enabled, routeCoordinates, sendPing, onAutoCheckInProximity]);

  return {
    isSimulating,
    speed,
    setSpeed,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    currentPos,
    progressFraction:
      routeCoordinates.length > 1
        ? currentIndex / (routeCoordinates.length - 1)
        : 0,
  };
}
