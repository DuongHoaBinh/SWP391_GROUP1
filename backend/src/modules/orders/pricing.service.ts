import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { PricingStore, TariffRecord } from './pricing.store';
import { CreateTariffDto, PreviewPricingDto } from './dto/pricing.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DistanceService, isRoadSeparatedByOcean } from '../routes/distance.service';
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

const LANDLOCKED_COUNTRY_KEYS = new Set([
  'lao',
  'laos',
  'nuoc lao',
  'thuy si',
  'switzerland',
  'schweiz',
  'suisse',
  'ao',
  'austria',
  'osterreich',
  'mong co',
  'mongolia',
  'nepal',
  'bhutan',
  'hungary',
  'slovakia',
  'czechia',
  'czech republic',
  'belarus',
  'bolivia',
  'paraguay',
  'kazakhstan',
  'uzbekistan',
  'afghanistan',
  'armenia',
  'azerbaijan',
  'kyrgyzstan',
  'tajikistan',
  'turkmenistan',
  'luxembourg',
]);

function isLandlockedCountryName(country?: string | null): boolean {
  if (!country) return false;
  const key = country
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return LANDLOCKED_COUNTRY_KEYS.has(key);
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
      // Lấy khoảng cách đường bộ thực tế từ trạm gần nhất đến điểm đón (fallback Haversine × 1.3 nếu lỗi)
      try {
        const dh = await this.distanceService.getRoadDistance({ lat: nearest.lat, lng: nearest.lng }, origin, 50);
        deadheadKm = Number(dh.distanceKm.toFixed(1));
      } catch {
        deadheadKm = Number((minDistance * 1.3).toFixed(1));
      }
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

    const MAX_EQUINE_SEA_HOURS = 168; // 7 ngày tối đa trên biển cho ngựa đua sống

    const normalizeCountryKey = (country?: string, address?: string): string => {
      const s = `${country || ''} ${address || ''}`.toLowerCase();
      if (s.includes('vietnam') || s.includes('việt nam') || s.includes('hồ chí minh') || s.includes('hà nội') || s.includes('đà nẵng') || s.includes('cần thơ') || s.includes('hải phòng')) return 'VN';
      if (s.includes('cambodia') || s.includes('campuchia') || s.includes('phnom penh') || s.includes('siem reap')) return 'KH';
      if (s.includes('laos') || s.includes('lào') || s.includes('vientiane')) return 'LA';
      if (s.includes('thailand') || s.includes('thái lan') || s.includes('bangkok') || s.includes('pattaya')) return 'TH';
      if (s.includes('malaysia') || s.includes('kuala lumpur') || s.includes('penang') || s.includes('selangor')) return 'MY';
      if (s.includes('singapore') || s.includes('changi') || s.includes('kranji')) return 'SG';
      if (s.includes('china') || s.includes('trung quốc') || s.includes('shanghai') || s.includes('guangzhou') || s.includes('beijing')) return 'CN';
      if (s.includes('hong kong') || s.includes('hồng kông')) return 'HK';
      return (country || '').trim().toUpperCase() || 'OTHER';
    };

    const estimateRoadBorderCrossings = (): number => {
      const c1 = normalizeCountryKey(origin.country, origin.address);
      const c2 = normalizeCountryKey(destination.country, destination.address);
      if (c1 === c2) return 0;
      const pair = [c1, c2].sort().join('-');
      const SEA_BORDER_MAP: Record<string, number> = {
        'KH-VN': 1,
        'LA-VN': 1,
        'CN-VN': 1,
        'TH-VN': 2,
        'MY-VN': 3,
        'SG-VN': 4,
        'KH-TH': 1,
        'KH-MY': 2,
        'KH-SG': 3,
        'LA-TH': 1,
        'LA-MY': 2,
        'LA-SG': 3,
        'MY-TH': 1,
        'SG-TH': 2,
        'MY-SG': 1,
      };
      return SEA_BORDER_MAP[pair] ?? 1;
    };

    const borderCrossings = estimateRoadBorderCrossings();

    let freightInput: Omit<FreightInput, 'vehicles'>;
    let arrivalHub: GeoPoint | null = null;

    if (mode === 'road') {
      if (isRoadSeparatedByOcean(origin, destination)) {
        throw new UnprocessableEntityException(
          'Không có tuyến đường bộ nối liền giữa điểm đón và điểm giao (cách biển/đại dương). Vui lòng chọn phương thức Hàng không hoặc Đường thủy.',
        );
      }
      const roadDist = await this.distanceService.getRoadDistance(origin, destination, roadTariff.averageSpeedKmh);
      if (roadDist.unreachable) {
        throw new UnprocessableEntityException(
          'Không tìm thấy đường bộ khả thi giữa hai địa điểm này (ngăn cách bởi biển hoặc hải đảo). Vui lòng chọn Hàng không hoặc Đường thủy.',
        );
      }
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

      if (deptAirport.id === arrAirport.id) {
        throw new UnprocessableEntityException(
          `Điểm đón và điểm giao cùng dùng chung sân bay gần nhất (${deptAirport.name}). Vui lòng chọn phương thức Đường bộ.`,
        );
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

      // Chặng bay: deptAirport -> arrAirport (cộng thời gian tập kết đóng chuồng jet stall, kiểm tra thú y & thủ tục hải quan)
      const airKm = Number(
        haversineKm({ lat: deptAirport.lat, lng: deptAirport.lng }, { lat: arrAirport.lat, lng: arrAirport.lng }).toFixed(1),
      );
      const isDomesticFlight = normalizeCountryKey(deptAirport.country, deptAirport.name) === normalizeCountryKey(arrAirport.country, arrAirport.name);
      const airportDwellHours = isDomesticFlight ? 3.5 : 6.5;
      const flightOnlyHours = airKm / (airTariff.averageSpeedKmh || 700);
      const airDuration = Number((flightOnlyHours + airportDwellHours).toFixed(2));
      legs.push({
        key: 'flight',
        from: deptAirport.name,
        to: arrAirport.name,
        distanceKm: airKm,
        durationHours: airDuration,
        source: 'air',
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
      if (seaMode && seaMode !== 'vessel') {
        throw new BadRequestException('Phương thức đường thủy chỉ hỗ trợ tàu biển chuyên dụng (vessel)');
      }
      const effectiveSeaMode: 'vessel' = 'vessel';

      if (isLandlockedCountryName(origin.country) || isLandlockedCountryName(destination.country)) {
        throw new UnprocessableEntityException(
          'Không khả dụng tuyến đường thủy do điểm đón hoặc điểm giao nằm ở quốc gia không giáp biển. Vui lòng chọn Hàng không hoặc Đường bộ.',
        );
      }

      const seaRoutes = await this.pricingStore.getActiveSeaRoutes(effectiveSeaMode);
      if (!seaRoutes.length) {
        throw new UnprocessableEntityException('Chưa có tuyến biển phù hợp cho hình thức này');
      }

      // Tuyến biển 2 chiều: ưu tiên tuyến trực tiếp sao cho dist(origin, port1) + dist(port2, dest) nhỏ nhất (mỗi chặng <= 400 km)
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

      let departurePort: { code: string; name: string; lat: number; lng: number };
      let arrivalPort: { code: string; name: string; lat: number; lng: number };
      let resolvedSeaKm: number;
      let resolvedSeaHours: number;

      if (bestRoute) {
        departurePort = isReversed
          ? { code: bestRoute.toPortCode, name: bestRoute.toPortName, lat: bestRoute.toLat, lng: bestRoute.toLng }
          : { code: bestRoute.fromPortCode, name: bestRoute.fromPortName, lat: bestRoute.fromLat, lng: bestRoute.fromLng };
        arrivalPort = isReversed
          ? { code: bestRoute.fromPortCode, name: bestRoute.fromPortName, lat: bestRoute.fromLat, lng: bestRoute.fromLng }
          : { code: bestRoute.toPortCode, name: bestRoute.toPortName, lat: bestRoute.toLat, lng: bestRoute.toLng };
        resolvedSeaKm = bestRoute.distanceKm;
        resolvedSeaHours = bestRoute.typicalHours;
      } else {
        // Fallback: kết nối liên cảng qua đồ thị sea_route (vẫn ràng buộc <= 400 km mỗi đầu và 2 cảng khác nhau)
        type PortInfo = { id: number; code: string; name: string; lat: number; lng: number };
        const portsById = new Map<number, PortInfo>();
        const adj = new Map<number, Array<{ to: number; km: number; hrs: number }>>();
        for (const sr of seaRoutes) {
          portsById.set(sr.fromPortId, { id: sr.fromPortId, code: sr.fromPortCode, name: sr.fromPortName, lat: sr.fromLat, lng: sr.fromLng });
          portsById.set(sr.toPortId, { id: sr.toPortId, code: sr.toPortCode, name: sr.toPortName, lat: sr.toLat, lng: sr.toLng });
          if (!adj.has(sr.fromPortId)) adj.set(sr.fromPortId, []);
          if (!adj.has(sr.toPortId)) adj.set(sr.toPortId, []);
          adj.get(sr.fromPortId)!.push({ to: sr.toPortId, km: sr.distanceKm, hrs: sr.typicalHours });
          adj.get(sr.toPortId)!.push({ to: sr.fromPortId, km: sr.distanceKm, hrs: sr.typicalHours });
        }

        const nearOrigin = [...portsById.values()]
          .map((p) => ({ p, d: haversineKm(origin, { lat: p.lat, lng: p.lng }) }))
          .filter((x) => x.d <= 400)
          .sort((a, b) => a.d - b.d);
        const nearDest = [...portsById.values()]
          .map((p) => ({ p, d: haversineKm(destination, { lat: p.lat, lng: p.lng }) }))
          .filter((x) => x.d <= 400)
          .sort((a, b) => a.d - b.d);

        if (!nearOrigin.length || !nearDest.length) {
          throw new UnprocessableEntityException('Chưa có tuyến biển phù hợp cho hai địa điểm này (chặng bộ ra/vào cảng vượt quá 400 km)');
        }

        const startPort = nearOrigin[0].p;
        const endPort = nearDest[0].p;
        if (startPort.id === endPort.id) {
          throw new UnprocessableEntityException('Điểm đón và điểm giao dùng chung một cảng biển gần nhất, vui lòng chọn vận tải Đường bộ.');
        }

        const distKm = new Map<number, number>();
        const distHrs = new Map<number, number>();
        const visited = new Set<number>();
        for (const id of portsById.keys()) {
          distKm.set(id, Infinity);
          distHrs.set(id, Infinity);
        }
        distKm.set(startPort.id, 0);
        distHrs.set(startPort.id, 0);

        while (true) {
          let cur: number | null = null;
          let best = Infinity;
          for (const [id, d] of distKm.entries()) {
            if (!visited.has(id) && d < best) {
              best = d;
              cur = id;
            }
          }
          if (cur === null || cur === endPort.id) break;
          visited.add(cur);
          for (const edge of adj.get(cur) || []) {
            if (visited.has(edge.to)) continue;
            const altKm = best + edge.km;
            if (altKm < (distKm.get(edge.to) ?? Infinity)) {
              distKm.set(edge.to, altKm);
              distHrs.set(edge.to, (distHrs.get(cur) ?? 0) + edge.hrs);
            }
          }
        }

        const connectedKm = distKm.get(endPort.id) ?? Infinity;
        if (!Number.isFinite(connectedKm)) {
          throw new UnprocessableEntityException('Chưa có tuyến biển phù hợp cho hai địa điểm này (chặng bộ ra/vào cảng vượt quá 400 km)');
        }

        departurePort = startPort;
        arrivalPort = endPort;
        resolvedSeaKm = Number(connectedKm.toFixed(2));
        resolvedSeaHours = Number((distHrs.get(endPort.id) ?? connectedKm / 25).toFixed(2));
      }

      if (resolvedSeaHours > MAX_EQUINE_SEA_HOURS) {
        const seaDays = (resolvedSeaHours / 24).toFixed(1);
        throw new UnprocessableEntityException(
          `Hành trình tàu biển dự kiến mất ${seaDays} ngày (${Math.round(resolvedSeaHours)} giờ), vượt giới hạn an toàn thú y tối đa 7 ngày (168 giờ) đối với ngựa đua sống (nguy cơ say sóng & sốt vận chuyển). Vui lòng chọn phương thức Hàng không.`,
        );
      }

      const isDomesticSea = normalizeCountryKey(origin.country, origin.address) === normalizeCountryKey(destination.country, destination.address);
      const portDwellHours = isDomesticSea ? 2.5 : 4.5;

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
        distanceKm: resolvedSeaKm,
        durationHours: Number((resolvedSeaHours + portDwellHours).toFixed(2)),
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
        seaMode: effectiveSeaMode,
        horses: sample.horses.map((h, i) => ({
          horseId: i + 1,
          quantity: h.quantity || 1,
          requiresPrivateStall: Boolean(h.requiresPrivateStall),
        })),
        roadLegs: [
          { key: 'to_hub', distanceKm: legToPort.distanceKm, borderCrossings: 0 },
          { key: 'from_hub', distanceKm: legFromPort.distanceKm, borderCrossings: 0 },
        ],
        seaKm: resolvedSeaKm,
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
