/**
 * Hàm địa lý thuần cho lập tuyến: chuẩn hóa mã quốc gia và xác định "khối đất liền" (landmass).
 * Xe chở ngựa chỉ chạy được giữa hai điểm cùng khối đất liền; sang đảo phải đi phà/tàu hoặc máy bay.
 * Đa giác đảo là gần đúng ở mức tỉnh, đủ để phân biệt đất liền / đảo cho khu vực ĐNA + Trung Quốc.
 */
import { LatLng } from './route-network.types';

export const MAINLAND = 'mainland_asia';

const LANDMASS_POLYGONS: Array<{ id: string; polygon: LatLng[] }> = [
  { id: 'phu_quoc', polygon: [[10.46, 103.83], [10.46, 104.1], [9.98, 104.1], [9.98, 103.9]] },
  { id: 'con_dao', polygon: [[8.8, 106.5], [8.8, 106.75], [8.55, 106.75], [8.55, 106.5]] },
  { id: 'cat_ba', polygon: [[20.87, 106.95], [20.87, 107.15], [20.7, 107.15], [20.7, 106.95]] },
  { id: 'samui', polygon: [[9.6, 99.92], [9.6, 100.1], [9.4, 100.1], [9.4, 99.92]] },
  { id: 'langkawi', polygon: [[6.47, 99.63], [6.47, 99.93], [6.2, 99.93], [6.2, 99.63]] },
  {
    id: 'hainan',
    polygon: [[20.15, 110.0], [20.05, 111.05], [19.5, 111.1], [18.6, 110.55], [18.1, 109.55], [18.45, 108.6], [19.5, 108.6], [20.0, 109.2]],
  },
  { id: 'taiwan', polygon: [[25.35, 121.5], [25.0, 122.05], [22.0, 120.9], [22.9, 120.1], [24.3, 120.4]] },
  {
    id: 'borneo',
    polygon: [
      [7.1, 116.8], [5.0, 119.3], [4.2, 117.9], [1.0, 118.9], [-1.0, 117.0], [-4.2, 116.0], [-3.7, 114.0],
      [-3.0, 111.0], [-2.9, 110.2], [-1.0, 109.0], [1.0, 108.9], [2.1, 109.6], [2.9, 111.4], [4.6, 113.9], [6.0, 115.8],
    ],
  },
  {
    id: 'sumatra',
    polygon: [
      [5.9, 95.2], [5.2, 97.5], [3.8, 98.8], [2.0, 100.9], [1.6, 101.5], [1.1, 102.6], [0.5, 103.5], [-1.0, 104.5],
      [-2.4, 106.0], [-3.0, 106.0], [-5.95, 105.85], [-5.95, 104.5], [-4.0, 102.3], [-1.0, 100.3], [1.0, 98.8], [3.0, 96.5], [5.5, 95.0],
    ],
  },
  {
    id: 'java',
    polygon: [
      [-5.85, 105.9], [-5.85, 107.0], [-6.3, 108.3], [-6.4, 110.7], [-6.35, 111.0], [-6.8, 112.6], [-7.6, 114.415],
      [-8.8, 114.415], [-8.3, 111.0], [-7.7, 108.0], [-7.0, 106.4], [-6.75, 105.2],
    ],
  },
  { id: 'bali', polygon: [[-8.05, 114.42], [-8.1, 115.75], [-8.9, 115.25], [-8.6, 114.42]] },
  {
    id: 'luzon',
    polygon: [
      [18.65, 120.55], [18.55, 122.35], [16.0, 122.25], [14.2, 124.1], [12.55, 124.15], [13.0, 123.0], [13.5, 122.0],
      [13.6, 121.4], [13.65, 121.0], [13.7, 120.6], [14.3, 120.55], [14.5, 120.4], [15.2, 119.8], [16.4, 119.75], [18.0, 120.4],
    ],
  },
  { id: 'mindoro', polygon: [[13.55, 120.3], [13.55, 121.55], [12.15, 121.35], [12.25, 120.55]] },
];

/** Ray casting point-in-polygon trên mặt phẳng lat/lng (đủ chính xác cho đa giác cỡ đảo). */
function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function landmassOf(point: LatLng): string {
  for (const lm of LANDMASS_POLYGONS) {
    if (pointInPolygon(point, lm.polygon)) return lm.id;
  }
  return MAINLAND;
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function polylineKm(points: LatLng[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversine(points[i - 1], points[i]);
  return km;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  VN: ['vietnam', 'viet nam'],
  KH: ['cambodia', 'campuchia', 'kampuchea'],
  LA: ['laos', 'lao', 'lao pdr'],
  TH: ['thailand', 'thai lan'],
  MM: ['myanmar', 'burma', 'mien dien'],
  MY: ['malaysia', 'ma lai'],
  SG: ['singapore', 'xin ga po', 'singapo'],
  ID: ['indonesia', 'in do ne xi a'],
  PH: ['philippines', 'phi lip pin', 'philippin'],
  BN: ['brunei', 'bru nay', 'brunei darussalam'],
  TL: ['timor leste', 'dong timor', 'east timor'],
  CN: ['china', 'trung quoc', 'peoples republic of china', 'prc'],
  HK: ['hong kong', 'hongkong', 'hong kong sar'],
  MO: ['macau', 'macao', 'ma cao'],
  TW: ['taiwan', 'dai loan'],
  JP: ['japan', 'nhat ban'],
  KR: ['korea', 'south korea', 'han quoc'],
  IN: ['india', 'an do'],
  AU: ['australia', 'uc'],
  AE: ['uae', 'united arab emirates'],
  US: ['usa', 'united states', 'hoa ky', 'my'],
  DE: ['germany', 'duc'],
  FR: ['france', 'phap'],
};

/** Chuẩn hóa tên quốc gia (VI có/không dấu, EN) hoặc mã ISO2 về ISO2 viết hoa. Không nhận ra → ''. */
export function toCountryCode(country?: string | null, countryCode?: string | null): string {
  const code = String(countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  const raw = String(country || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const f = fold(raw);
  for (const [cc, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((a) => f === a || f.endsWith(` ${a}`) || f.startsWith(`${a} `))) return cc;
  }
  return '';
}

export const COUNTRY_NAMES: Record<string, { vi: string; en: string }> = {
  VN: { vi: 'Việt Nam', en: 'Vietnam' },
  KH: { vi: 'Campuchia', en: 'Cambodia' },
  LA: { vi: 'Lào', en: 'Laos' },
  TH: { vi: 'Thái Lan', en: 'Thailand' },
  MM: { vi: 'Myanmar', en: 'Myanmar' },
  MY: { vi: 'Malaysia', en: 'Malaysia' },
  SG: { vi: 'Singapore', en: 'Singapore' },
  ID: { vi: 'Indonesia', en: 'Indonesia' },
  PH: { vi: 'Philippines', en: 'Philippines' },
  BN: { vi: 'Brunei', en: 'Brunei' },
  CN: { vi: 'Trung Quốc', en: 'China' },
  HK: { vi: 'Hồng Kông', en: 'Hong Kong' },
  MO: { vi: 'Ma Cao', en: 'Macau' },
  TW: { vi: 'Đài Loan', en: 'Taiwan' },
};

export function countryName(cc: string, lang: 'vi' | 'en' = 'vi'): string {
  return COUNTRY_NAMES[cc]?.[lang] ?? cc;
}

/**
 * Khu vực phục vụ: Đông Nam Á + Trung Quốc (gồm Hồng Kông, Ma Cao).
 * lat [-11, 54], lng [73, 141]
 */
export const SERVICE_AREA = { minLat: -11, maxLat: 54, minLng: 73, maxLng: 141 };

export function isInServiceArea(lat: number, lng: number): boolean {
  return lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;
}
