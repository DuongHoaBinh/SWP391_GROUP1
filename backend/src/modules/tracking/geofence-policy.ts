export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeofenceConfig {
  defaultRadiusM?: number;
  largeSiteRadiusM?: number;
  maxAccuracyM?: number;
}

export const DEFAULT_GEOFENCE_CONFIG: Required<GeofenceConfig> = {
  defaultRadiusM: 300,
  largeSiteRadiusM: 1000,
  maxAccuracyM: 200,
};

/**
 * Calculates Great-circle distance between two coordinates in meters using the Haversine formula.
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  if (a.lat === b.lat && a.lng === b.lng) return 0;
  const R = 6371000; // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(Number(a.lat));
  const lng1 = toRad(Number(a.lng));
  const lat2 = toRad(Number(b.lat));
  const lng2 = toRad(Number(b.lng));

  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);

  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return R * c;
}

/**
 * Resolves the applicable geofence radius for a given route stop or waypoint.
 */
export function radiusForStop(
  stop: {
    stopType?: string | null;
    geofenceRadiusM?: number | null;
    locationRefType?: string | null;
  },
  cfg?: GeofenceConfig,
): number {
  if (
    stop.geofenceRadiusM !== undefined &&
    stop.geofenceRadiusM !== null &&
    Number(stop.geofenceRadiusM) > 0
  ) {
    return Number(stop.geofenceRadiusM);
  }

  const defaultRadius = cfg?.defaultRadiusM ?? DEFAULT_GEOFENCE_CONFIG.defaultRadiusM;
  const largeRadius = cfg?.largeSiteRadiusM ?? DEFAULT_GEOFENCE_CONFIG.largeSiteRadiusM;

  const sType = String(stop.stopType || '').toLowerCase();
  const refType = String(stop.locationRefType || '').toLowerCase();

  const isLarge =
    sType === 'border_check' ||
    sType === 'quarantine' ||
    refType === 'airport' ||
    refType === 'seaport' ||
    refType === 'border_check' ||
    refType === 'quarantine';

  return isLarge ? largeRadius : defaultRadius;
}

/**
 * Evaluates whether a reported GPS position is within the acceptable geofence of a stop.
 * Allowance: considered 'inside' if distance <= radius + min(accuracy, 100).
 */
export function evaluateGeofence(input: {
  position: GeoPoint & { accuracyM?: number | null };
  stop: GeoPoint | null;
  radiusM: number;
  maxAccuracyM?: number;
}): {
  status: 'inside' | 'outside' | 'low_accuracy' | 'no_stop_coordinates';
  distanceM: number | null;
} {
  const maxAccuracy = input.maxAccuracyM ?? DEFAULT_GEOFENCE_CONFIG.maxAccuracyM;

  if (
    !input.stop ||
    input.stop.lat === undefined ||
    input.stop.lat === null ||
    input.stop.lng === undefined ||
    input.stop.lng === null ||
    isNaN(Number(input.stop.lat)) ||
    isNaN(Number(input.stop.lng))
  ) {
    return { status: 'no_stop_coordinates', distanceM: null };
  }

  const accuracy =
    input.position.accuracyM !== undefined && input.position.accuracyM !== null
      ? Number(input.position.accuracyM)
      : null;

  if (accuracy !== null && accuracy > maxAccuracy) {
    return { status: 'low_accuracy', distanceM: null };
  }

  const dist = distanceMeters(input.position, input.stop);
  const roundedDist = Math.round(dist);

  // Allowance: inside if distance <= radius + min(accuracy, 100)
  const allowedAccuracyBuffer = accuracy !== null ? Math.min(Math.max(0, accuracy), 100) : 0;
  const maxAllowedDistance = Number(input.radiusM) + allowedAccuracyBuffer;

  if (dist <= maxAllowedDistance) {
    return { status: 'inside', distanceM: roundedDist };
  }

  return { status: 'outside', distanceM: roundedDist };
}

/**
 * Interpolates a coordinate along a multi-point polyline given a fraction in [0, 1].
 * Used for vehicle journey simulation.
 */
export function interpolateAlongPolyline(points: GeoPoint[], fraction: number): GeoPoint {
  if (!points || points.length === 0) {
    return { lat: 0, lng: 0 };
  }
  if (points.length === 1 || fraction <= 0) {
    return { lat: Number(points[0].lat), lng: Number(points[0].lng) };
  }
  if (fraction >= 1) {
    const last = points[points.length - 1];
    return { lat: Number(last.lat), lng: Number(last.lng) };
  }

  const segmentDistances: number[] = [];
  let totalDistance = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceMeters(points[i], points[i + 1]);
    segmentDistances.push(d);
    totalDistance += d;
  }

  if (totalDistance === 0) {
    return { lat: Number(points[0].lat), lng: Number(points[0].lng) };
  }

  const targetDist = fraction * totalDistance;
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    const segDist = segmentDistances[i];
    if (accumulated + segDist >= targetDist) {
      const segFraction = segDist > 0 ? (targetDist - accumulated) / segDist : 0;
      const p0 = points[i];
      const p1 = points[i + 1];
      const lat = Number(p0.lat) + segFraction * (Number(p1.lat) - Number(p0.lat));
      const lng = Number(p0.lng) + segFraction * (Number(p1.lng) - Number(p0.lng));
      return { lat, lng };
    }
    accumulated += segDist;
  }

  const last = points[points.length - 1];
  return { lat: Number(last.lat), lng: Number(last.lng) };
}

/**
 * Decimates a path to at most `maxPoints` points, preserving the first and last points.
 */
export function decimatePath<T extends GeoPoint>(points: T[], maxPoints: number): T[] {
  if (!points || points.length <= maxPoints) {
    return points || [];
  }
  if (maxPoints <= 1) {
    return [points[0]];
  }
  if (maxPoints === 2) {
    return [points[0], points[points.length - 1]];
  }

  const result: T[] = [points[0]];
  const total = points.length;
  const intermediateCount = maxPoints - 2;
  const step = (total - 1) / (maxPoints - 1);

  for (let i = 1; i <= intermediateCount; i++) {
    const idx = Math.min(total - 2, Math.max(1, Math.round(i * step)));
    if (!result.includes(points[idx])) {
      result.push(points[idx]);
    }
  }

  result.push(points[total - 1]);
  return result;
}
