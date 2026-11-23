import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { PricingStore, TariffRecord } from './pricing.store';
import { CreateTariffDto, PreviewPricingDto } from './dto/pricing.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DistanceService } from '../routes/distance.service';
import { haversineKm, GeoPoint } from '../routes/geo-policy';
import { computeRequiredStallSlots } from '../fleet/capacity-policy';
import {
  validateTariffParams,
  calculateFreight,
  FreightResult,
  FreightInput,
  RoadTariff,
  AirTariff,
  SeaTariff,
  VehicleOptionInput,
} from './pricing-policy';

export interface QuoteLeg {
  key: string;
  from: string;
  to: string;
  distanceKm: number;
  durationHours: number;
  source: string;
}

export interface RouteContext {
  legs: QuoteLeg[];
  requiredStallSlots: number;
  freightBase: Omit<FreightInput, 'vehicles'>;
  /** Sân bay/cảng đến (air/sea) để tìm trạm đối tác gần điểm giao */
  arrivalHub: GeoPoint | null;
  tariffs: {
    road: RoadTariff & { version?: number };
    air?: AirTariff & { version?: number };
    sea?: SeaTariff & { version?: number };
    partnerRoad?: RoadTariff & { version?: number };
  };
}

@Injectable()
export class PricingService {
  constructor(
    private readonly pricingStore: PricingStore,
    private readonly distanceService: DistanceService,
  ) {}

  async getActiveTariffs(region = 'VN'): Promise<Record<'road' | 'air' | 'sea', TariffRecord | null>> {
    return this.pricingStore.getActiveTariffs(region);
  }

  async getTariffHistory(mode: 'road' | 'air' | 'sea', region = 'VN'): Promise<TariffRecord[]> {
    return this.pricingStore.getTariffHistory(mode, region);
  }

  async createTariffVersion(user: AuthenticatedUser, dto: CreateTariffDto): Promise<TariffRecord> {
    const region = dto.region?.trim() || 'VN';
    validateTariffParams(dto.mode, dto.params);
    const userId = Number(user.id);
    return this.pricingStore.createTariffVersion(
      dto.mode,
      region,
      dto.params,
      dto.notes?.trim() || null,
      userId,
    );
  }

  /**
   * Tính phương án xe mặc định cho số chỗ chuồng yêu cầu (Step 4, review 11/2026).
   */
  async resolveDefaultVehicleOption(
    origin: GeoPoint,
    requiredSlots: number,
  ): Promise<{ vehicles: VehicleOptionInput[]; nearestDepotName?: string; warnings: string[] }> {
    const warnings: string[] = [];
    const roadClasses = await this.pricingStore.getRoadVehicleClasses();

    if (!roadClasses.length) {
      throw new BadRequestException('Hệ thống chưa cấu hình loại phương tiện đường bộ (vehicle_class)');
    }

    const depots = await this.pricingStore.getActiveOwnDepots();
    let deadheadKm = 0;
    let nearestDepotName: string | undefined;

    if (!depots.length) {
      warnings.push('NO_DEPOT');
    } else {
      let minDistance = Infinity;
      let nearest = depots[0];
      for (const d of depots) {
        const dist = haversineKm({ lat: d.lat, lng: d.lng }, origin);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = d;
        }
      }
      nearestDepotName = nearest.name;
      // Cho phép dùng ước lượng khoảng cách Haversine × hệ số cho deadhead để nhanh
      deadheadKm = Number((minDistance * 1.3).toFixed(1));
    }

    const vehicles: VehicleOptionInput[] = [];

    if (requiredSlots <= 6) {
      // Chọn loại nhỏ nhất có capacity >= requiredSlots
      const candidate = roadClasses.find((c) => c.horseCapacity >= requiredSlots);
      const chosen = candidate || roadClasses[roadClasses.length - 1];
      vehicles.push({
        classCode: chosen.code,
        className: chosen.nameVi,
        priceCoefficient: chosen.priceCoefficient,
        capacity: chosen.horseCapacity,
        deadheadKm,
      });
    } else {
      // Nếu slots > 6: dùng ceil(slots / 6) xe truck_6
      const truck6 = roadClasses.find((c) => c.code === 'truck_6') || roadClasses[roadClasses.length - 1];
      const count = Math.ceil(requiredSlots / (truck6.horseCapacity || 6));
      for (let i = 0; i < count; i++) {
        vehicles.push({
          classCode: truck6.code,
          className: truck6.nameVi,
          priceCoefficient: truck6.priceCoefficient,
          capacity: truck6.horseCapacity,
          deadheadKm,
        });
      }
    }

    return { vehicles, nearestDepotName, warnings };
  }

  /**
   * Tính thử nghiệm báo giá (preview) cho Manager (phương án xe mặc định theo loại xe, không xét xe rảnh).
   */
  async previewPricing(
    dto: PreviewPricingDto,
  ): Promise<
    FreightResult & {
      legs: QuoteLeg[];
      requiredStallSlots: number;
      vehicles: VehicleOptionInput[];
    }
  > {
    const ctx = await this.buildRouteContext(dto);
    const vehicleRes = await this.resolveDefaultVehicleOption(dto.sample.origin, ctx.requiredStallSlots);
    const calcResult = calculateFreight({ ...ctx.freightBase, vehicles: vehicleRes.vehicles }, ctx.tariffs);
    return {
      ...calcResult,
      warnings: [...calcResult.warnings, ...vehicleRes.warnings],
      legs: ctx.legs,
      requiredStallSlots: ctx.requiredStallSlots,
      vehicles: vehicleRes.vehicles,
    };
  }

  /**
   * Bảng giá + các chặng (khoảng cách, thời gian) + đầu vào tính cước chưa gắn xe.
   * Dùng chung cho preview và báo giá có phân bổ xe (Step 9).
   */
  async buildRouteContext(dto: PreviewPricingDto): Promise<RouteContext> {
    const { mode, seaMode, sample } = dto;
    const origin = sample.origin;
    const destination = sample.destination;

    if (!sample.horses || !sample.horses.length) {
      throw new BadRequestException('Mẫu thử nghiệm phải có ít nhất 1 con ngựa');
    }

    // 1. Lấy hoặc kiểm tra bảng giá
    const activeTariffs = await this.pricingStore.getActiveTariffs('VN');
    let roadTariff = activeTariffs.road?.params as RoadTariff;
    let airTariff = activeTariffs.air?.params as AirTariff | undefined;
    let seaTariff = activeTariffs.sea?.params as SeaTariff | undefined;

    if (dto.params) {
      validateTariffParams(mode, dto.params);
      if (mode === 'road') roadTariff = dto.params as RoadTariff;
      if (mode === 'air') airTariff = dto.params as AirTariff;
      if (mode === 'sea') seaTariff = dto.params as SeaTariff;
    }

    if (!roadTariff) {
      throw new NotFoundException('Chưa có bảng giá đường bộ đang kích hoạt');
    }

    // 2. Tính số chỗ chuồng yêu cầu
    const requiredStallSlots = computeRequiredStallSlots(
      sample.horses.map((h) => ({
        quantity: h.quantity || 1,
        requiresPrivateStall: Boolean(h.requiresPrivateStall),
      })),
    );

    const legs: Array<{
      key: string;
      from: string;
      to: string;
      distanceKm: number;
      durationHours: number;
      source: string;
    }> = [];

    const borderCrossings =
      origin.country && destination.country && origin.country.toLowerCase() !== destination.country.toLowerCase()
        ? 1
        : 0;

    let freightInput: Omit<FreightInput, 'vehicles'>;
    let arrivalHub: GeoPoint | null = null;

    if (mode === 'road') {
      const roadDist = await this.distanceService.getRoadDistance(origin, destination, roadTariff.averageSpeedKmh);
      legs.push({
        key: 'main',
        from: origin.address,
        to: destination.address,
        distanceKm: roadDist.distanceKm,
        durationHours: roadDist.durationHours,
        source: roadDist.source,
      });

      freightInput = {
        mode: 'road',
        horses: sample.horses.map((h, i) => ({
          horseId: i + 1,
          quantity: h.quantity || 1,
          requiresPrivateStall: Boolean(h.requiresPrivateStall),
        })),
        roadLegs: [
          {
            key: 'main',
            distanceKm: roadDist.distanceKm,
            borderCrossings,
          },
        ],
      };
    } else if (mode === 'air') {
      if (!airTariff) throw new NotFoundException('Chưa có bảng giá đường hàng không');

      const airports = await this.pricingStore.getAirportsWithEquineRamp();
      if (airports.length < 2) {
        throw new BadRequestException('Hệ thống cần ít nhất 2 sân bay có ram dốc ngựa');
      }

      // Sân bay gần origin nhất và gần dest nhất
      let deptAirport = airports[0];
      let arrAirport = airports[1];
      let minDeptDist = Infinity;
      let minArrDist = Infinity;

      for (const a of airports) {
        const d1 = haversineKm(origin, { lat: a.lat, lng: a.lng });
        if (d1 < minDeptDist) {
          minDeptDist = d1;
          deptAirport = a;
        }
        const d2 = haversineKm(destination, { lat: a.lat, lng: a.lng });
        if (d2 < minArrDist) {
          minArrDist = d2;
          arrAirport = a;
        }
      }

      // Chặng bộ 1: origin -> deptAirport
      const legToHub = await this.distanceService.getRoadDistance(
        origin,
        { lat: deptAirport.lat, lng: deptAirport.lng },
        roadTariff.averageSpeedKmh,
      );
      legs.push({
        key: 'to_hub',
        from: origin.address,
        to: deptAirport.name,
        distanceKm: legToHub.distanceKm,
        durationHours: legToHub.durationHours,
        source: legToHub.source,
      });

      // Chặng bay: deptAirport -> arrAirport
      const airKm = Number(
        haversineKm({ lat: deptAirport.lat, lng: deptAirport.lng }, { lat: arrAirport.lat, lng: arrAirport.lng }).toFixed(1),
      );
      const airDuration = Number((airKm / (airTariff.averageSpeedKmh || 700)).toFixed(2));
      legs.push({
        key: 'flight',
        from: deptAirport.name,
        to: arrAirport.name,
        distanceKm: airKm,
        durationHours: airDuration,
        source: 'estimated',
      });

      // Chặng bộ 2: arrAirport -> destination
      const legFromHub = await this.distanceService.getRoadDistance(
        { lat: arrAirport.lat, lng: arrAirport.lng },
        destination,
        roadTariff.averageSpeedKmh,
      );
      legs.push({
        key: 'from_hub',
        from: arrAirport.name,
        to: destination.address,
        distanceKm: legFromHub.distanceKm,
        durationHours: legFromHub.durationHours,
        source: legFromHub.source,
      });

      arrivalHub = { lat: arrAirport.lat, lng: arrAirport.lng };
      freightInput = {
        mode: 'air',
        horses: sample.horses.map((h, i) => ({
          horseId: i + 1,
          quantity: h.quantity || 1,
          requiresPrivateStall: Boolean(h.requiresPrivateStall),
        })),
        roadLegs: [
          { key: 'to_hub', distanceKm: legToHub.distanceKm, borderCrossings: 0 },
          { key: 'from_hub', distanceKm: legFromHub.distanceKm, borderCrossings: 0 },
        ],
        airKm,
      };
    } else {
      // mode === 'sea'
      if (!seaTariff) throw new NotFoundException('Chưa có bảng giá đường thủy');
      if (!seaMode) throw new BadRequestException('Vui lòng chọn hình thức đường thủy (ferry hoặc vessel)');

      const seaRoutes = await this.pricingStore.getActiveSeaRoutes(seaMode);
      if (!seaRoutes.length) {
        throw new UnprocessableEntityException('Chưa có tuyến biển phù hợp cho hình thức này');
      }

      // Tuyến biển 2 chiều: tìm cặp cảng sao cho dist(origin, port1) + dist(port2, dest) nhỏ nhất
      let bestRoute: (typeof seaRoutes)[0] | null = null;
      let minTotalKm = Infinity;
      let isReversed = false;

      for (const sr of seaRoutes) {
        // Hướng 1: fromPort -> toPort
        const d1From = haversineKm(origin, { lat: sr.fromLat, lng: sr.fromLng });
        const d1To = haversineKm(destination, { lat: sr.toLat, lng: sr.toLng });
        if (d1From <= 400 && d1To <= 400) {
          const total1 = d1From + d1To;
          if (total1 < minTotalKm) {
            minTotalKm = total1;
            bestRoute = sr;
            isReversed = false;
          }
        }

        // Hướng 2 (đảo chiều): toPort -> fromPort
        const d2From = haversineKm(origin, { lat: sr.toLat, lng: sr.toLng });
        const d2To = haversineKm(destination, { lat: sr.fromLat, lng: sr.fromLng });
        if (d2From <= 400 && d2To <= 400) {
          const total2 = d2From + d2To;
          if (total2 < minTotalKm) {
            minTotalKm = total2;
            bestRoute = sr;
            isReversed = true;
          }
        }
      }

      if (!bestRoute) {
        throw new UnprocessableEntityException('Chưa có tuyến biển phù hợp cho hai địa điểm này (chặng bộ ra/vào cảng vượt quá 400 km)');
      }

      if (seaMode === 'ferry' && bestRoute.typicalHours > 12) {
        throw new BadRequestException('Phà RoRo chỉ áp dụng cho tuyến có thời gian di chuyển dưới 12 giờ');
      }

      const departurePort = isReversed
        ? { code: bestRoute.toPortCode, name: bestRoute.toPortName, lat: bestRoute.toLat, lng: bestRoute.toLng }
        : { code: bestRoute.fromPortCode, name: bestRoute.fromPortName, lat: bestRoute.fromLat, lng: bestRoute.fromLng };

      const arrivalPort = isReversed
        ? { code: bestRoute.fromPortCode, name: bestRoute.fromPortName, lat: bestRoute.fromLat, lng: bestRoute.fromLng }
        : { code: bestRoute.toPortCode, name: bestRoute.toPortName, lat: bestRoute.toLat, lng: bestRoute.toLng };

      const legToPort = await this.distanceService.getRoadDistance(
        origin,
        { lat: departurePort.lat, lng: departurePort.lng },
        roadTariff.averageSpeedKmh,
      );
      legs.push({
        key: 'to_hub',
        from: origin.address,
        to: departurePort.name,
        distanceKm: legToPort.distanceKm,
        durationHours: legToPort.durationHours,
        source: legToPort.source,
      });

      legs.push({
        key: 'sea',
        from: departurePort.name,
        to: arrivalPort.name,
        distanceKm: bestRoute.distanceKm,
        durationHours: bestRoute.typicalHours,
        source: 'table',
      });

      const legFromPort = await this.distanceService.getRoadDistance(
        { lat: arrivalPort.lat, lng: arrivalPort.lng },
        destination,
        roadTariff.averageSpeedKmh,
      );
      legs.push({
        key: 'from_hub',
        from: arrivalPort.name,
        to: destination.address,
        distanceKm: legFromPort.distanceKm,
        durationHours: legFromPort.durationHours,
        source: legFromPort.source,
      });

      arrivalHub = { lat: arrivalPort.lat, lng: arrivalPort.lng };
      freightInput = {
        mode: 'sea',
        seaMode,
        horses: sample.horses.map((h, i) => ({
          horseId: i + 1,
          quantity: h.quantity || 1,
          requiresPrivateStall: Boolean(h.requiresPrivateStall),
        })),
        roadLegs: [
          { key: 'to_hub', distanceKm: legToPort.distanceKm, borderCrossings: 0 },
          { key: 'from_hub', distanceKm: legFromPort.distanceKm, borderCrossings: 0 },
        ],
        seaKm: bestRoute.distanceKm,
      };
    }

    return {
      legs,
      requiredStallSlots,
      freightBase: freightInput,
      arrivalHub,
      tariffs: {
        road: { ...roadTariff, version: activeTariffs.road?.version || 1 },
        air: airTariff ? { ...airTariff, version: activeTariffs.air?.version || 1 } : undefined,
        sea: seaTariff ? { ...seaTariff, version: activeTariffs.sea?.version || 1 } : undefined,
      },
    };
  }
}
