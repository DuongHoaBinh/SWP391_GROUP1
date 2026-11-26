import { Injectable, Logger, Optional, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { DistanceService } from './distance.service';
import { planNetworkRoute } from './route-network.policy';
import { RouteNetworkStore } from './route-network.store';
import { PlanRouteInput, PlannedRoute, RoutePlanningError, TransportNetwork } from './route-network.types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;

export class RouteNetworkUnavailableError extends Error {
  constructor(cause?: string) {
    super(`Mạng lưới vận tải chưa sẵn sàng (cần chạy migration 040)${cause ? `: ${cause}` : ''}`);
    this.name = 'RouteNetworkUnavailableError';
  }
}

/**
 * Nguồn lập tuyến duy nhất cho bản đồ (preview) và báo giá (pricing): cùng dữ liệu, cùng thuật toán.
 */
@Injectable()
export class RouteNetworkService {
  private readonly logger = new Logger(RouteNetworkService.name);
  private cache: { network: TransportNetwork; loadedAt: number } | null = null;
  private lastFailureAt = 0;
  private lastFailure = '';

  constructor(
    private readonly store: RouteNetworkStore,
    @Optional() private readonly distance?: DistanceService,
  ) {}

  async getNetwork(): Promise<TransportNetwork> {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.network;
    if (!this.cache && now - this.lastFailureAt < FAILURE_RETRY_MS) {
      throw new RouteNetworkUnavailableError(this.lastFailure);
    }
    try {
      const network = await this.store.loadNetwork();
      this.cache = { network, loadedAt: now };
      return network;
    } catch (err: any) {
      this.lastFailureAt = now;
      this.lastFailure = err?.message ?? 'unknown';
      if (this.cache) return this.cache.network; // dùng bản cũ nếu DB lỗi tạm thời
      this.logger.warn(`Không tải được mạng lưới vận tải: ${this.lastFailure}`);
      throw new RouteNetworkUnavailableError(this.lastFailure);
    }
  }

  invalidate(): void {
    this.cache = null;
    this.lastFailureAt = 0;
  }

  /**
   * Lập tuyến. Nếu có ORS_API_KEY, khoảng cách từng chặng đường bộ được hiệu chỉnh theo mạng đường thật
   * (giữ nguyên thời gian nghỉ và thông quan đã tính).
   */
  async plan(input: PlanRouteInput, options: { refineRoad?: boolean } = {}): Promise<PlannedRoute> {
    const network = await this.getNetwork();
    const rules = input.maxDriveHoursBeforeRest ? null : await this.store.getJourneyRules();
    const plan = planNetworkRoute(network, {
      ...input,
      maxDriveHoursBeforeRest: input.maxDriveHoursBeforeRest ?? rules?.maxDriveHoursBeforeRest ?? undefined,
    });
    if (options.refineRoad && this.distance && process.env.ORS_API_KEY?.trim()) {
      await this.refineRoadLegs(plan, input.roadSpeedKmh ?? 50);
    }
    return plan;
  }

  /** Lập tuyến cho API: đổi lỗi nghiệp vụ thành HTTP 422/503 có mã và gợi ý phương thức khác. */
  async planOrThrowHttp(input: PlanRouteInput): Promise<PlannedRoute> {
    try {
      return await this.plan(input, { refineRoad: false });
    } catch (err) {
      throw toHttpError(err);
    }
  }

  private async refineRoadLegs(plan: PlannedRoute, speedKmh: number): Promise<void> {
    for (const leg of plan.legs) {
      if (leg.type !== 'road' || leg.distanceKm < 5) continue;
      const res = await this.distance!.getRoadDistance(
        { lat: leg.fromCoords[0], lng: leg.fromCoords[1] },
        { lat: leg.toCoords[0], lng: leg.toCoords[1] },
        speedKmh,
      );
      if (res.source !== 'ors') continue;
      const fixedHours = leg.durationHours - leg.distanceKm / speedKmh; // nghỉ + thông quan
      leg.distanceKm = Math.round(res.distanceKm);
      leg.durationHours = Math.round((res.durationHours + Math.max(0, fixedHours)) * 10) / 10;
    }
    const roadLegs = plan.legs.filter((l) => l.type === 'road');
    plan.totals.roadKm = roadLegs.reduce((s, l) => s + l.distanceKm, 0);
    plan.totals.roadHours = Math.round(roadLegs.reduce((s, l) => s + l.durationHours, 0) * 10) / 10;
    plan.totals.distanceKm = plan.legs.reduce((s, l) => s + l.distanceKm, 0);
    plan.totals.durationHours = Math.round(plan.legs.reduce((s, l) => s + l.durationHours, 0) * 10) / 10;
  }
}

export function toHttpError(err: unknown): Error {
  if (err instanceof RoutePlanningError) {
    return new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: err.code,
      message: err.vi,
      messageEn: err.en,
      suggestions: err.suggestions,
    });
  }
  if (err instanceof RouteNetworkUnavailableError) {
    return new ServiceUnavailableException({ statusCode: 503, code: 'ROUTE_NETWORK_UNAVAILABLE', message: err.message });
  }
  return err as Error;
}
