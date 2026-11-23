export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Tính khoảng cách cung lớn (Great-Circle Distance) giữa hai tọa độ theo công thức Haversine (km).
 * Hàm thuần (pure function) không phụ thuộc DB hay I/O để dễ kiểm thử đơn vị.
 */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  if (
    !Number.isFinite(from?.lat) ||
    !Number.isFinite(from?.lng) ||
    !Number.isFinite(to?.lat) ||
    !Number.isFinite(to?.lng)
  ) {
    return 0;
  }
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
