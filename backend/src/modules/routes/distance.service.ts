import { Injectable, Logger } from '@nestjs/common';
import { GeoPoint, haversineKm } from './geo-policy';

export { GeoPoint, haversineKm };

export interface DistanceResult {
  distanceKm: number;
  durationHours: number;
  source: 'ors' | 'estimated' | 'table';
}

interface CacheEntry {
  result: DistanceResult;
  expiresAt: number;
}

@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);
  private static hasLoggedMissingKey = false;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE_SIZE = 5000;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Tính khoảng cách đường bộ bằng OpenRouteService (profile driving-hgv cho xe tải).
   * Dự phòng bằng ước lượng Haversine × DISTANCE_FALLBACK_FACTOR khi không có key hoặc lỗi mạng/timeout.
   */
  async getRoadDistance(
    from: GeoPoint,
    to: GeoPoint,
    averageSpeedKmh = 50,
  ): Promise<DistanceResult> {
    const cacheKey = this.buildCacheKey(from, to);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    const apiKey = process.env.ORS_API_KEY?.trim();
    const baseUrl = process.env.ORS_BASE_URL?.trim() || 'https://api.openrouteservice.org';
    const fallbackFactor = Number(process.env.DISTANCE_FALLBACK_FACTOR) || 1.3;

    if (!apiKey) {
      if (!DistanceService.hasLoggedMissingKey) {
        this.logger.warn(
          'ORS_API_KEY chưa được cấu hình. Hệ thống sẽ sử dụng khoảng cách ước lượng (Haversine × hệ số).',
        );
        DistanceService.hasLoggedMissingKey = true;
      }
      const fallback = this.calculateEstimatedDistance(from, to, fallbackFactor, averageSpeedKmh);
      this.setCache(cacheKey, fallback);
      return fallback;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // OpenRouteService nhận thứ tự [longitude, latitude]
      const body = {
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      };

      const res = await fetch(`${baseUrl}/v2/directions/driving-hgv`, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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
      const durationHours = Number((summary.duration / 3600).toFixed(2));

      const result: DistanceResult = {
        distanceKm,
        durationHours: durationHours > 0 ? durationHours : Number((distanceKm / averageSpeedKmh).toFixed(2)),
        source: 'ors',
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (err: any) {
      this.logger.warn(
        `OpenRouteService không khả dụng (${err?.message || 'unknown error'}). Chuyển sang ước lượng Haversine.`,
      );
      const fallback = this.calculateEstimatedDistance(from, to, fallbackFactor, averageSpeedKmh);
      this.setCache(cacheKey, fallback);
      return fallback;
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

  private buildCacheKey(from: GeoPoint, to: GeoPoint): string {
    const p1 = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}`;
    const p2 = `${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    return [p1, p2].sort().join('::');
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
