import { Injectable, Logger } from '@nestjs/common';
import { GeoPoint, haversineKm } from './geo-policy';

export { GeoPoint, haversineKm };

export interface DistanceResult {
  distanceKm: number;
  durationHours: number;
  source: 'ors' | 'osrm' | 'air' | 'table' | 'estimated';
  unreachable?: boolean;
}

const ISLAND_OR_SEPARATED_GROUPS: Record<string, string> = {
  // Island nations / archipelagos separated by ocean from continental mainland
  japan: 'island:jp',
  'nhật bản': 'island:jp',
  'nhat ban': 'island:jp',
  australia: 'island:au',
  'úc': 'island:au',
  uc: 'island:au',
  'new zealand': 'island:nz',
  philippines: 'island:ph',
  indonesia: 'island:id',
  taiwan: 'island:tw',
  'đài loan': 'island:tw',
  'dai loan': 'island:tw',
  'united kingdom': 'island:uk',
  uk: 'island:uk',
  england: 'island:uk',
  anh: 'island:uk',
  ireland: 'island:ie',
  iceland: 'island:is',
  'sri lanka': 'island:lk',
  // Americas (separated from Afro-Eurasia by oceans)
  usa: 'americas',
  'united states': 'americas',
  'mỹ': 'americas',
  'hoa kỳ': 'americas',
  'hoa ky': 'americas',
  canada: 'americas',
  mexico: 'americas',
  brazil: 'americas',
  argentina: 'americas',
  // Mainland Asia / Europe / Middle East
  vietnam: 'eurasia',
  'việt nam': 'eurasia',
  'viet nam': 'eurasia',
  cambodia: 'eurasia',
  campuchia: 'eurasia',
  laos: 'eurasia',
  'lào': 'eurasia',
  thailand: 'eurasia',
  'thái lan': 'eurasia',
  malaysia: 'eurasia',
  singapore: 'eurasia',
  china: 'eurasia',
  'trung quốc': 'eurasia',
  'hong kong': 'eurasia',
  'hồng kông': 'eurasia',
  'south korea': 'eurasia',
  korea: 'eurasia',
  'hàn quốc': 'eurasia',
  india: 'eurasia',
  uae: 'eurasia',
  dubai: 'eurasia',
  qatar: 'eurasia',
  'saudi arabia': 'eurasia',
  france: 'eurasia',
  germany: 'eurasia',
  italy: 'eurasia',
  spain: 'eurasia',
  netherlands: 'eurasia',
};

function detectLandmassRegion(country?: string, point?: GeoPoint): string | null {
  const norm = String(country || '').trim().toLowerCase();
  if (norm) {
    for (const [k, region] of Object.entries(ISLAND_OR_SEPARATED_GROUPS)) {
      if (norm === k || norm.includes(k)) return region;
    }
  }
  if (!point) return null;
  const { lat, lng } = point;
  // Quick bounding boxes for major island/overseas destinations when country text is omitted
  if (lng < -30) return 'americas';
  if (lat < -10 && lng >= 110 && lng <= 156) return 'island:au';
  if (lat < -30 && lng > 165) return 'island:nz';
  if (lat >= 30 && lat <= 46 && lng >= 129 && lng <= 146) return 'island:jp';
  if (lat >= 4.5 && lat <= 21 && lng >= 117 && lng <= 127) return 'island:ph';
  if (lat >= 21.5 && lat <= 25.5 && lng >= 119.5 && lng <= 122.5) return 'island:tw';
  if (lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141 && !(lat > 0.8 && lng >= 99 && lng <= 105)) return 'island:id';
  if (lat >= 49.5 && lat <= 61 && lng >= -8.5 && lng <= 2) return 'island:uk';
  return 'eurasia';
}

export function isRoadSeparatedByOcean(
  from: GeoPoint & { country?: string; address?: string },
  to: GeoPoint & { country?: string; address?: string },
): boolean {
  const r1 = detectLandmassRegion(from.country || from.address, from);
  const r2 = detectLandmassRegion(to.country || to.address, to);
  if (r1 && r2 && r1 !== r2) return true;
  // Separate island check: Phú Quốc island vs mainland Vietnam if > 30km straight line across water
  const addr1 = `${from.address || ''} ${from.country || ''}`.toLowerCase();
  const addr2 = `${to.address || ''} ${to.country || ''}`.toLowerCase();
  const isPq1 = addr1.includes('phú quốc') || addr1.includes('phu quoc');
  const isPq2 = addr2.includes('phú quốc') || addr2.includes('phu quoc');
  if (isPq1 !== isPq2) return true;
  return false;
}

interface CacheEntry {
  result: DistanceResult;
  expiresAt: number;
}

@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE_SIZE = 5000;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Tính khoảng cách đường bộ thực tế theo chuỗi ưu tiên:
   * 1. OpenRouteService (profile driving-hgv cho xe tải nặng) nếu có ORS_API_KEY.
   * 2. OSRM công cộng (driving) — miễn phí, trả khoảng cách đường bộ thực tế; thời gian chặn dưới theo vận tốc xe chở ngựa.
   * 3. Fallback Haversine × DISTANCE_FALLBACK_FACTOR chỉ khi cả 2 dịch vụ lỗi/timeout hoặc không có tuyến đường bộ.
   */
  async getRoadDistance(
    from: GeoPoint,
    to: GeoPoint,
    averageSpeedKmh = 50,
  ): Promise<DistanceResult> {
    const cacheKey = this.buildCacheKey(from, to, averageSpeedKmh);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    const apiKey = process.env.ORS_API_KEY?.trim();
    const orsBaseUrl = process.env.ORS_BASE_URL?.trim() || 'https://api.openrouteservice.org';
    const osrmBaseUrl = process.env.OSRM_BASE_URL?.trim() || 'https://router.project-osrm.org';
    const osrmDisabled = process.env.OSRM_DISABLED === 'true';
    const fallbackFactor = Number(process.env.DISTANCE_FALLBACK_FACTOR) || 1.3;

    // 1. OpenRouteService (nếu có API key)
    if (apiKey) {
      const orsResult = await this.fetchOrsDistance(orsBaseUrl, apiKey, from, to, averageSpeedKmh);
      if (orsResult) {
        this.setCache(cacheKey, orsResult);
        return orsResult;
      }
    }

    // 2. OSRM đường bộ thực tế (không cần API key)
    if (!osrmDisabled) {
      const osrmResult = await this.fetchOsrmDistance(osrmBaseUrl, from, to, averageSpeedKmh);
      if (osrmResult) {
        this.setCache(cacheKey, osrmResult);
        return osrmResult;
      }
    }

    // 3. Fallback ước lượng khi không thể gọi dịch vụ tuyến đường
    const fallback = this.calculateEstimatedDistance(from, to, fallbackFactor, averageSpeedKmh);
    this.setCache(cacheKey, fallback);
    return fallback;
  }

  private async fetchOrsDistance(
    baseUrl: string,
    apiKey: string,
    from: GeoPoint,
    to: GeoPoint,
    averageSpeedKmh: number,
  ): Promise<DistanceResult | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // OpenRouteService nhận thứ tự [longitude, latitude]
      const res = await fetch(`${baseUrl}/v2/directions/driving-hgv`, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`ORS API returned HTTP status ${res.status}`);
      }

      const data = (await res.json()) as any;
      const summary = data?.routes?.[0]?.summary;

      if (!summary || typeof summary.distance !== 'number') {
        throw new Error('ORS response missing route summary distance');
      }

      const distanceKm = Number((summary.distance / 1000).toFixed(2));
      const orsDurationHours = Number((summary.duration / 3600).toFixed(2));
      const truckMinHours = Number((distanceKm / Math.max(1, averageSpeedKmh)).toFixed(2));

      return {
        distanceKm,
        durationHours: orsDurationHours > 0 ? Math.max(orsDurationHours, truckMinHours) : truckMinHours,
        source: 'ors',
      };
    } catch (err: any) {
      this.logger.warn(
        `OpenRouteService không khả dụng (${err?.message || 'unknown error'}). Thử chuyển sang OSRM.`,
      );
      return null;
    }
  }

  private async fetchOsrmDistance(
    baseUrl: string,
    from: GeoPoint,
    to: GeoPoint,
    averageSpeedKmh: number,
  ): Promise<DistanceResult | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const res = await fetch(`${baseUrl}/route/v1/driving/${coords}?overview=false`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await res.json()) as any;
      if (data?.code === 'NoRoute' || data?.code === 'NoSegment') {
        this.logger.warn(`OSRM xác nhận không có tuyến đường bộ nối liền (code=${data.code}).`);
        return {
          distanceKm: 0,
          durationHours: 0,
          source: 'estimated',
          unreachable: true,
        };
      }
      if (!res.ok) {
        throw new Error(`OSRM returned HTTP status ${res.status}`);
      }
      const route = data?.code === 'Ok' ? data?.routes?.[0] : null;
      if (!route || typeof route.distance !== 'number' || route.distance <= 0) {
        throw new Error(`OSRM returned code=${data?.code || 'unknown'}`);
      }

      const distanceKm = Number((route.distance / 1000).toFixed(2));
      const osrmDurationHours = Number((route.duration / 3600).toFixed(2));
      // Xe chở ngựa chạy chậm hơn xe con trong profile OSRM: chặn dưới theo averageSpeedKmh của bảng giá
      const horseTruckHours = Number((distanceKm / Math.max(1, averageSpeedKmh)).toFixed(2));

      return {
        distanceKm,
        durationHours: Number(Math.max(osrmDurationHours, horseTruckHours).toFixed(2)),
        source: 'osrm',
      };
    } catch (err: any) {
      this.logger.warn(
        `OSRM không khả dụng (${err?.message || 'unknown error'}). Chuyển sang ước lượng Haversine.`,
      );
      return null;
    }
  }

  private calculateEstimatedDistance(
    from: GeoPoint,
    to: GeoPoint,
    factor: number,
    averageSpeedKmh: number,
  ): DistanceResult {
    const rawHaversine = haversineKm(from, to);
    const distanceKm = Number((rawHaversine * factor).toFixed(2));
    const durationHours = Number((distanceKm / Math.max(1, averageSpeedKmh)).toFixed(2));

    return {
      distanceKm,
      durationHours,
      source: 'estimated',
    };
  }

  private buildCacheKey(from: GeoPoint, to: GeoPoint, averageSpeedKmh: number): string {
    const p1 = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}`;
    const p2 = `${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    return `${[p1, p2].sort().join('::')}@${Math.round(averageSpeedKmh)}`;
  }

  private setCache(key: string, result: DistanceResult): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }
}
