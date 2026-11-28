import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RoutesStore } from './routes.store';
import { OrdersStore } from '../orders/orders.store';
import { FleetStore } from '../fleet/fleet.store';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import {
  AirlineEntity,
  AirportEntity,
  FullTripPlan,
  MasterStopEntity,
  PlanStatus,
  RouteEntity,
  RouteStatus,
  RouteStopEntity,
  RouteStopType,
  StopLocationRefType,
  TripPlanReadiness,
} from './routes.types';
import { haversine, toCountryCode } from './route-network.geo';
import { resolveLocationCoords } from '../../common/road-trip-sequencing';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { PublishTripDto } from './dto/publish-trip.dto';
import { SetStrategicFrameworkDto } from './dto/set-strategic-framework.dto';
import { BuildDetailedPlanDto } from './dto/build-detailed-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { ConfirmAssignmentDto } from './dto/confirm-assignment.dto';
import { ShipmentStatus } from '../orders/orders.types';
import { ShipmentLifecycle } from '../../common/shipment-lifecycle';
import { applyConvoyCapacity, assertRoadCapacity } from '../fleet/capacity-policy';
import { jetStallCount } from '../fleet/allocation-policy';

@Injectable()
export class RoutesService implements OnModuleInit {
  constructor(
    private readonly routesStore: RoutesStore,
    private readonly ordersStore: OrdersStore,
    private readonly fleetStore: FleetStore,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    private readonly lifecycle: ShipmentLifecycle,
  ) {}

  onModuleInit() {
    this.lifecycle.onChange(shipmentId => this.evaluateReadyToDepartGate(shipmentId));
  }

  // --- Master Data for Flow 3 ---
  async getMasterData(): Promise<{
    airlines: AirlineEntity[];
    airports: AirportEntity[];
    masterStops: MasterStopEntity[];
  }> {
    const [airlines, airports, masterStops] = await Promise.all([
      this.routesStore.findAllAirlines(),
      this.routesStore.findAllAirports(),
      this.routesStore.findAllMasterStops(),
    ]);
    return { airlines, airports, masterStops };
  }

  /**
   * Tự dựng đề xuất lộ trình chi tiết cho Flow 3 từ dữ liệu khách hàng đã đặt
   * (shipment_quote.result_json.routePlan / legs + vehicle_reservation + pickup_at + trip_type).
   */
  async getDraftSuggestion(user: AuthenticatedUser, shipmentId: number): Promise<{
    shipmentId: number;
    source: 'quote_route_plan' | 'quote_legs' | 'shipment_fallback';
    transportMode: 'road' | 'air' | 'sea';
    tripType: 'one_way' | 'round_trip';
    routeName: string;
    totalDistanceKm: number;
    pickupAt: string;
    returnDepartureAt: string | null;
    reservedOutboundVehicleIds: number[];
    reservedReturnVehicleIds: number[];
    partnerDepot?: {
      depotId?: number;
      id?: number;
      name?: string;
      depotName?: string;
      country?: string;
      deadheadKm?: number;
    } | null;
    legs: Array<{
      sequenceNo: number;
      direction: 'outbound' | 'return';
      legType: 'road' | 'flight' | 'sea';
      originLocation: string;
      destinationLocation: string;
      distanceKm: number;
      durationHours: number;
      plannedDeparture: string;
      plannedArrival: string;
      vehicleId: number | null;
      isOverseasPartnerRoad?: boolean;
      partnerDepotName?: string | null;
      partnerDepotId?: number | null;
      departureAirportId: number | null;
      departureAirportCode: string | null;
      arrivalAirportId: number | null;
      arrivalAirportCode: string | null;
      stallsBooked: number;
    }>;
    stops: Array<{
      sequenceNo: number;
      direction: 'outbound' | 'return';
      legSequenceNo: number;
      stopType: 'rest' | 'quarantine' | 'border_check' | 'refuel';
      locationName: string;
      country: string | null;
      plannedArrival: string;
      plannedDeparture: string;
      lat: number | null;
      lng: number | null;
      geofenceRadiusM: number | null;
      locationRefType: StopLocationRefType | null;
      locationRefId: number | null;
    }>;
  }> {
    if (user.role !== UserRole.LOGISTICS_MANAGER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Logistics Manager hoặc Admin mới được lấy gợi ý lập lộ trình');
    }
    const ctx = await this.routesStore.findDraftSuggestionContext(shipmentId);
    if (!ctx) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }
    const [airports, masterStops] = await Promise.all([
      typeof this.routesStore.findAllAirports === 'function' ? this.routesStore.findAllAirports() : Promise.resolve([]),
      typeof this.routesStore.findAllMasterStops === 'function' ? this.routesStore.findAllMasterStops() : Promise.resolve([]),
    ]);
    return RoutesService.composeDraftSuggestion(ctx, airports, masterStops);
  }

  private static foldText(value?: string | null): string {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static readonly LOCATION_COUNTRY_HINTS: ReadonlyArray<[string, readonly string[]]> = [
    ['KH', ['cambodia', 'campuchia', 'phnom penh', 'siem reap', 'sihanoukville', 'bavet', 'poipet', 'takeo']],
    ['LA', ['laos', 'lao', 'vientiane', 'luang prabang', 'pakse', 'savannakhet']],
    ['TH', ['thailand', 'thai lan', 'bangkok', 'chiang mai', 'pattaya', 'phuket', 'aranyaprathet']],
    ['SG', ['singapore', 'changi', 'kranji', 'tuas', 'pasir panjang']],
    ['MY', ['malaysia', 'kuala lumpur', 'penang', 'johor', 'selangor', 'klia']],
    ['CN', ['china', 'trung quoc', 'beijing', 'bac kinh', 'shanghai', 'thuong hai', 'guangzhou', 'quang chau', 'conghua', 'nanning', 'nam ninh']],
    ['HK', ['hong kong', 'hongkong']],
    ['ID', ['indonesia', 'jakarta', 'bali', 'surabaya']],
    ['PH', ['philippines', 'manila', 'cebu']],
    ['MM', ['myanmar', 'yangon', 'mandalay']],
    ['AU', ['australia', 'sydney', 'melbourne', 'eastern creek']],
    ['JP', ['japan', 'nhat ban', 'tokyo', 'osaka']],
    ['KR', ['korea', 'han quoc', 'seoul', 'incheon']],
    ['AE', ['uae', 'dubai', 'abu dhabi']],
    ['QA', ['qatar', 'doha']],
    ['VN', [
      'vietnam', 'viet nam', 'tp hcm', 'tphcm', 'ho chi minh', 'sai gon', 'saigon',
      'thu duc', 'cu chi', 'tan son nhat', 'ha noi', 'hanoi', 'noi bai', 'da nang',
      'da lat', 'lam dong', 'binh duong', 'dong nai', 'tay ninh', 'long an',
      'can tho', 'hai phong', 'nha trang', 'khanh hoa', 'vung tau', 'hue', 'phu quoc', 'cat lai',
    ]],
  ];

  static inferCountryCodeFromLocation(location?: string | null): string {
    const raw = String(location || '').trim();
    if (!raw) return '';
    const direct = toCountryCode(raw);
    if (direct) return direct;

    // Check parenthesized fragments & comma-separated tokens first (e.g. "Phnom Penh (Campuchia)")
    const parenMatches = raw.match(/\(([^)]+)\)/g) || [];
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1).trim();
      const cc = toCountryCode(inner);
      if (cc) return cc;
    }
    const commaParts = raw.split(',').map((p) => p.trim()).reverse();
    for (const part of commaParts) {
      const cc = toCountryCode(part);
      if (cc) return cc;
    }

    const folded = RoutesService.foldText(raw);
    if (!folded) return '';
    for (const [cc, tokens] of RoutesService.LOCATION_COUNTRY_HINTS) {
      if (tokens.some((tok) => folded === tok || folded.includes(` ${tok} `) || folded.startsWith(`${tok} `) || folded.endsWith(` ${tok}`))) {
        return cc;
      }
    }
    return '';
  }

  static pickBestCrossBorderStop(
    masterStops: MasterStopEntity[],
    originCoords: [number, number] | null,
    destCoords: [number, number] | null,
    originCC: string,
    destCC: string,
  ): MasterStopEntity | null {
    const eligible = masterStops.filter(
      (ms) => ms.stopType === 'border_check' || ms.stopType === 'quarantine',
    );
    if (eligible.length === 0) return null;

    const isLandBorderStop = (ms: MasterStopEntity): boolean => {
      if (ms.stopType === 'border_check') return true;
      const f = RoutesService.foldText(ms.name);
      return f.includes('cua khau') || f.includes('border') || f.includes('checkpoint');
    };

    const landBorderPool = eligible.filter(isLandBorderStop);
    const pool = landBorderPool.length > 0 ? landBorderPool : eligible;

    // 1. If we have origin & destination coordinates, pick the checkpoint with shortest corridor detour
    if (originCoords && destCoords) {
      let best: MasterStopEntity | null = null;
      let bestTotalKm = Infinity;
      for (const ms of pool) {
        if (ms.lat === null || ms.lat === undefined || ms.lng === null || ms.lng === undefined) continue;
        const lat = Number(ms.lat);
        const lng = Number(ms.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const totalKm = haversine(originCoords, [lat, lng]) + haversine([lat, lng], destCoords);
        if (totalKm < bestTotalKm) {
          bestTotalKm = totalKm;
          best = ms;
        }
      }
      if (best) return best;
    }

    // 2. Corridor heuristics by country pair when coordinates aren't available
    const pair = new Set([originCC, destCC].filter(Boolean));
    if (pair.has('VN') && (pair.has('KH') || pair.has('TH'))) {
      const mocBai = pool.find((ms) => {
        const f = RoutesService.foldText(ms.name);
        return f.includes('moc bai') || f.includes('tinh bien');
      });
      if (mocBai) return mocBai;
    }
    if (pair.has('VN') && pair.has('CN')) {
      const huuNghi = pool.find((ms) => RoutesService.foldText(ms.name).includes('huu nghi'));
      if (huuNghi) return huuNghi;
    }
    if (pair.has('SG') || pair.has('MY')) {
      const tuas = pool.find((ms) => RoutesService.foldText(ms.name).includes('tuas'));
      if (tuas) return tuas;
    }

    // 3. Fallback: prefer stop in origin or destination country, else first in pool
    const byCountry = pool.find((ms) => {
      const msCC = RoutesService.inferCountryCodeFromLocation(ms.country);
      return Boolean(msCC) && pair.has(msCC);
    });
    return byCountry ?? pool[0] ?? null;
  }

  static composeDraftSuggestion(
    ctx: NonNullable<Awaited<ReturnType<RoutesStore['findDraftSuggestionContext']>>>,
    airports: AirportEntity[],
    masterStops: MasterStopEntity[],
  ) {
    const { shipment, quote, reservations } = ctx;
    const horseCount = Math.max(1, shipment.requestedHorseCount || 1);
    const airStalls = Math.max(1, Math.ceil(horseCount / 3));

    const inferMode = (): 'road' | 'air' | 'sea' => {
      if (quote?.transportMode) return quote.transportMode;
      if (shipment.transportMode) return shipment.transportMode;
      const t = String(shipment.transportationType || '').toLowerCase();
      if (t.includes('sea') || t.includes('thủy') || t.includes('biển') || t.includes('vessel')) return 'sea';
      if (t.includes('air') || t.includes('bay') || t.includes('hàng không') || t.includes('flight')) return 'air';
      return 'road';
    };
    const transportMode = inferMode();
    const tripType = quote?.tripType || shipment.tripType || 'one_way';

    const reservedOutboundVehicleIds = reservations
      .filter((r) => r.direction === 'outbound')
      .map((r) => r.vehicleId);
    const reservedReturnVehicleIds = reservations
      .filter((r) => r.direction === 'return')
      .map((r) => r.vehicleId);

    // Fallback to allocationSnapshot selected vehicles if reservation rows aren't present
    if (reservedOutboundVehicleIds.length === 0 && shipment.allocationSnapshot) {
      const snapIds =
        shipment.allocationSnapshot.vehicleIds ||
        shipment.allocationSnapshot.vehicles?.map((v: any) => Number(v.vehicleId)).filter((n: number) => Number.isFinite(n));
      if (Array.isArray(snapIds)) {
        for (const id of snapIds) {
          if (Number.isFinite(Number(id)) && Number(id) > 0) reservedOutboundVehicleIds.push(Number(id));
        }
      }
    }

    const outboundVehicleId = reservedOutboundVehicleIds[0] ?? null;
    const returnVehicleId = reservedReturnVehicleIds[0] ?? outboundVehicleId;

    const resolveStartIso = (): string => {
      if (shipment.pickupAt) return new Date(shipment.pickupAt).toISOString();
      if (quote?.inputJson?.pickupAt) return new Date(quote.inputJson.pickupAt).toISOString();
      if (shipment.departureDate) {
        const d = new Date(shipment.departureDate);
        if (!Number.isNaN(d.getTime())) {
          // Default 08:00 local (+07:00) = 01:00 UTC if date-only
          if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
            d.setUTCHours(1, 0, 0, 0);
          }
          return d.toISOString();
        }
      }
      const tomorrow = new Date(Date.now() + 2 * 24 * 3600 * 1000);
      tomorrow.setUTCHours(1, 0, 0, 0);
      return tomorrow.toISOString();
    };
    const pickupAtIso = resolveStartIso();

    const findAirport = (code?: string | null, name?: string | null): AirportEntity | null => {
      if (code) {
        const upper = String(code).trim().toUpperCase();
        const byCode = airports.find((a) => String(a.iataCode).toUpperCase() === upper);
        if (byCode) return byCode;
      }
      if (name) {
        const raw = String(name);
        const codeMatch = raw.match(/\(([A-Z]{3})\)/);
        if (codeMatch) {
          const byParen = airports.find((a) => String(a.iataCode).toUpperCase() === codeMatch[1]);
          if (byParen) return byParen;
        }
        const lower = raw.toLowerCase();
        const byName = airports.find(
          (a) =>
            lower.includes(String(a.name).toLowerCase()) ||
            lower.includes(String(a.city).toLowerCase()),
        );
        if (byName) return byName;
      }
      return null;
    };

    const haversineEstimateKm = (): number => {
      if (
        shipment.originLat !== null &&
        shipment.originLng !== null &&
        shipment.destinationLat !== null &&
        shipment.destinationLng !== null
      ) {
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(shipment.destinationLat - shipment.originLat);
        const dLng = toRad(shipment.destinationLng - shipment.originLng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(shipment.originLat)) * Math.cos(toRad(shipment.destinationLat)) * Math.sin(dLng / 2) ** 2;
        const direct = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.max(20, Math.round(direct * (transportMode === 'air' ? 1.05 : 1.25)));
      }
      return transportMode === 'road' ? 240 : 1150;
    };

    type RawStopDraft = {
      stopType?: string;
      type?: string;
      name: string;
      countryCode?: string | null;
      country?: string | null;
      coords?: [number, number] | null;
      lat?: number | null;
      lng?: number | null;
    };

    type RawLegDraft = {
      legType: 'road' | 'flight' | 'sea';
      originLocation: string;
      destinationLocation: string;
      distanceKm: number;
      durationHours: number;
      fromCode?: string | null;
      toCode?: string | null;
      stops?: RawStopDraft[];
    };

    let source: 'quote_route_plan' | 'quote_legs' | 'shipment_fallback' = 'shipment_fallback';
    const rawOutbound: RawLegDraft[] = [];
    const routePlanLegs: any[] | null = Array.isArray(quote?.resultJson?.routePlan?.legs) && quote.resultJson.routePlan.legs.length > 0
      ? quote.resultJson.routePlan.legs
      : null;
    const quoteLegs: any[] | null = Array.isArray(quote?.resultJson?.legs) && quote.resultJson.legs.length > 0
      ? quote.resultJson.legs
      : null;

    if (routePlanLegs) {
      source = 'quote_route_plan';
      for (const rl of routePlanLegs) {
        const mappedType: 'road' | 'flight' | 'sea' =
          rl.type === 'air' ? 'flight' : rl.type === 'sea' ? 'sea' : 'road';
        rawOutbound.push({
          legType: mappedType,
          originLocation: rl.fromName || shipment.originLocation,
          destinationLocation: rl.toName || shipment.destinationLocation,
          distanceKm: Math.max(1, Math.round(Number(rl.distanceKm || 0))),
          durationHours: Math.max(0.5, Number(Number(rl.durationHours || 1).toFixed(2))),
          fromCode: rl.fromCode ?? null,
          toCode: rl.toCode ?? null,
          stops: Array.isArray(rl.stops) ? rl.stops : [],
        });
      }
    } else if (quoteLegs) {
      source = 'quote_legs';
      for (const ql of quoteLegs) {
        const key = String(ql.key || '').toLowerCase();
        const mappedType: 'road' | 'flight' | 'sea' =
          key === 'flight' || key === 'air' ? 'flight' : key === 'sea' ? 'sea' : 'road';
        rawOutbound.push({
          legType: mappedType,
          originLocation: ql.from || shipment.originLocation,
          destinationLocation: ql.to || shipment.destinationLocation,
          distanceKm: Math.max(1, Math.round(Number(ql.distanceKm || 0))),
          durationHours: Math.max(0.5, Number(Number(ql.durationHours || 1).toFixed(2))),
        });
      }
    } else {
      source = 'shipment_fallback';
      const estKm = haversineEstimateKm();
      if (transportMode === 'road') {
        rawOutbound.push({
          legType: 'road',
          originLocation: shipment.originLocation,
          destinationLocation: shipment.destinationLocation,
          distanceKm: estKm,
          durationHours: Math.max(1, Number((estKm / 50).toFixed(1))),
        });
      } else if (transportMode === 'air') {
        const depApt = findAirport(null, shipment.originLocation) || airports.find((a) => a.iataCode === 'SGN') || null;
        const arrApt = findAirport(null, shipment.destinationLocation) || airports.find((a) => a.iataCode === 'SIN') || null;
        const depName = depApt ? `${depApt.name} (${depApt.iataCode})` : 'Sân bay xuất phát';
        const arrName = arrApt ? `${arrApt.name} (${arrApt.iataCode})` : 'Sân bay đến';
        rawOutbound.push(
          { legType: 'road', originLocation: shipment.originLocation, destinationLocation: depName, distanceKm: 35, durationHours: 1.5 },
          {
            legType: 'flight',
            originLocation: depName,
            destinationLocation: arrName,
            distanceKm: Math.max(200, estKm - 70),
            durationHours: Math.max(4, Number(((estKm / 700) + 6.5).toFixed(1))),
            fromCode: depApt?.iataCode ?? null,
            toCode: arrApt?.iataCode ?? null,
          },
          { legType: 'road', originLocation: arrName, destinationLocation: shipment.destinationLocation, distanceKm: 35, durationHours: 1.5 },
        );
      } else {
        rawOutbound.push(
          { legType: 'road', originLocation: shipment.originLocation, destinationLocation: 'Cảng biển xuất phát', distanceKm: 35, durationHours: 1.5 },
          { legType: 'sea', originLocation: 'Cảng biển xuất phát', destinationLocation: 'Cảng biển đích', distanceKm: Math.max(150, estKm), durationHours: Math.max(12, Number((estKm / 25 + 4.5).toFixed(1))) },
          { legType: 'road', originLocation: 'Cảng biển đích', destinationLocation: shipment.destinationLocation, distanceKm: 35, durationHours: 1.5 },
        );
      }
    }

    const legs: Array<{
      sequenceNo: number;
      direction: 'outbound' | 'return';
      legType: 'road' | 'flight' | 'sea';
      originLocation: string;
      destinationLocation: string;
      distanceKm: number;
      durationHours: number;
      plannedDeparture: string;
      plannedArrival: string;
      vehicleId: number | null;
      isOverseasPartnerRoad?: boolean;
      partnerDepotName?: string | null;
      partnerDepotId?: number | null;
      departureAirportId: number | null;
      departureAirportCode: string | null;
      arrivalAirportId: number | null;
      arrivalAirportCode: string | null;
      stallsBooked: number;
    }> = [];

    const stops: Array<{
      sequenceNo: number;
      direction: 'outbound' | 'return';
      legSequenceNo: number;
      stopType: 'rest' | 'quarantine' | 'border_check' | 'refuel';
      locationName: string;
      country: string | null;
      plannedArrival: string;
      plannedDeparture: string;
      lat: number | null;
      lng: number | null;
      geofenceRadiusM: number | null;
      locationRefType: StopLocationRefType | null;
      locationRefId: number | null;
    }> = [];

    const originCC =
      toCountryCode(null, quote?.inputJson?.originCountryCode) ||
      RoutesService.inferCountryCodeFromLocation(shipment.originLocation);
    const destCC =
      toCountryCode(null, quote?.inputJson?.destinationCountryCode) ||
      RoutesService.inferCountryCodeFromLocation(shipment.destinationLocation);
    const tTypeLower = String(shipment.transportationType || '').toLowerCase();
    const explicitInternational =
      tTypeLower.includes('international') ||
      tTypeLower.includes('liên vận') ||
      tTypeLower.includes('quốc tế') ||
      quote?.resultJson?.routePlan?.isDomestic === false ||
      quote?.resultJson?.isInternational === true;
    const explicitDomestic = tTypeLower.includes('domestic') || tTypeLower.includes('nội địa');
    const inferredCrossBorder =
      (Boolean(originCC) && Boolean(destCC) && originCC !== destCC) ||
      (!explicitDomestic && Boolean(destCC) && destCC !== 'VN');
    const isCrossBorderShipment = explicitInternational || inferredCrossBorder;

    const originCoords: [number, number] | null =
      shipment.originLat !== null && shipment.originLng !== null
        ? [Number(shipment.originLat), Number(shipment.originLng)]
        : resolveLocationCoords(shipment.originLocation).coords;
    const destCoords: [number, number] | null =
      shipment.destinationLat !== null && shipment.destinationLng !== null
        ? [Number(shipment.destinationLat), Number(shipment.destinationLng)]
        : resolveLocationCoords(shipment.destinationLocation).coords;

    const matchMasterStopByName = (name?: string | null): MasterStopEntity | null => {
      const target = String(name || '').trim().toLowerCase();
      if (!target) return null;
      return masterStops.find((ms) => String(ms.name || '').trim().toLowerCase() === target) ?? null;
    };

    const routePlanCheckpoints: Array<{
      name: string;
      countryCode: string | null;
      lat: number | null;
      lng: number | null;
    }> = Array.isArray(quote?.resultJson?.routePlan?.waypoints)
      ? quote.resultJson.routePlan.waypoints
          .filter((wp: any) => wp && wp.type === 'checkpoint' && wp.name)
          .map((wp: any) => ({
            name: String(wp.name),
            countryCode: wp.countryCode ? String(wp.countryCode) : null,
            lat: Array.isArray(wp.coords) && Number.isFinite(Number(wp.coords[0])) ? Number(wp.coords[0]) : null,
            lng: Array.isArray(wp.coords) && Number.isFinite(Number(wp.coords[1])) ? Number(wp.coords[1]) : null,
          }))
      : [];

    const appendDirectionLegs = (
      rawList: RawLegDraft[],
      direction: 'outbound' | 'return',
      startMs: number,
      companyVehicleId: number | null,
    ): number => {
      let cursorMs = startMs;
      const firstCrossBorderIdx = rawList.findIndex((l) => l.legType === 'flight' || l.legType === 'sea');
      const isInternationalRoadOnly = firstCrossBorderIdx < 0 && isCrossBorderShipment;
      const directionStartStopCount = stops.length;

      const quotePartnerDepot = quote?.resultJson?.partnerDepot ?? null;
      const partnerDepotInfo = quotePartnerDepot
        ? {
            depotId: Number(quotePartnerDepot.depotId ?? quotePartnerDepot.id ?? 0) || null,
            name: String(quotePartnerDepot.name || quotePartnerDepot.depotName || ''),
            country: quotePartnerDepot.country ? String(quotePartnerDepot.country) : null,
            deadheadKm: quotePartnerDepot.deadheadKm != null ? Number(quotePartnerDepot.deadheadKm) : null,
          }
        : null;

      rawList.forEach((raw, idx) => {
        const seq = legs.length + 1;
        const depMs = cursorMs;
        const durMs = Math.max(0.5, raw.durationHours) * 3600 * 1000;
        const arrMs = depMs + durMs;

        const isOverseasPartnerRoad =
          raw.legType === 'road' &&
          firstCrossBorderIdx >= 0 &&
          (direction === 'outbound' ? idx > firstCrossBorderIdx : idx < firstCrossBorderIdx);

        let departureAirportId: number | null = null;
        let departureAirportCode: string | null = null;
        let arrivalAirportId: number | null = null;
        let arrivalAirportCode: string | null = null;

        if (raw.legType === 'flight') {
          const depApt = findAirport(raw.fromCode, raw.originLocation);
          const arrApt = findAirport(raw.toCode, raw.destinationLocation);
          departureAirportId = depApt?.id ?? null;
          departureAirportCode = depApt?.iataCode ?? raw.fromCode ?? null;
          arrivalAirportId = arrApt?.id ?? null;
          arrivalAirportCode = arrApt?.iataCode ?? raw.toCode ?? null;
        }

        legs.push({
          sequenceNo: seq,
          direction,
          legType: raw.legType,
          originLocation: raw.originLocation,
          destinationLocation: raw.destinationLocation,
          distanceKm: raw.distanceKm,
          durationHours: raw.durationHours,
          plannedDeparture: new Date(depMs).toISOString(),
          plannedArrival: new Date(arrMs).toISOString(),
          vehicleId: raw.legType === 'road' && !isOverseasPartnerRoad ? companyVehicleId : null,
          isOverseasPartnerRoad,
          partnerDepotName: isOverseasPartnerRoad && partnerDepotInfo?.name ? partnerDepotInfo.name : null,
          partnerDepotId: isOverseasPartnerRoad ? partnerDepotInfo?.depotId ?? null : null,
          departureAirportId,
          departureAirportCode,
          arrivalAirportId,
          arrivalAirportCode,
          stallsBooked: raw.legType === 'flight' ? airStalls : horseCount,
        });

        // Map stops from routePlan (if any)
        const legStops = Array.isArray(raw.stops) ? raw.stops : [];
        if (legStops.length > 0) {
          legStops.forEach((st, sIdx) => {
            const frac = (sIdx + 1) / (legStops.length + 1);
            const stArrMs = depMs + durMs * frac;
            const rawStopType = String(st.stopType || st.type || '').toLowerCase();
            const stopTypeNorm =
              rawStopType === 'quarantine'
                ? 'quarantine'
                : rawStopType === 'border_check'
                  ? 'border_check'
                  : rawStopType === 'refuel'
                    ? 'refuel'
                    : 'rest';
            const matchedMs = matchMasterStopByName(st.name);
            const coordLat =
              Array.isArray(st.coords) && Number.isFinite(Number(st.coords[0]))
                ? Number(st.coords[0])
                : st.lat !== null && st.lat !== undefined && Number.isFinite(Number(st.lat))
                  ? Number(st.lat)
                  : matchedMs?.lat ?? null;
            const coordLng =
              Array.isArray(st.coords) && Number.isFinite(Number(st.coords[1]))
                ? Number(st.coords[1])
                : st.lng !== null && st.lng !== undefined && Number.isFinite(Number(st.lng))
                  ? Number(st.lng)
                  : matchedMs?.lng ?? null;
            stops.push({
              sequenceNo: stops.length + 1,
              direction,
              legSequenceNo: seq,
              stopType: stopTypeNorm,
              locationName: st.name,
              country: st.country ?? matchedMs?.country ?? st.countryCode ?? null,
              plannedArrival: new Date(stArrMs).toISOString(),
              plannedDeparture: new Date(stArrMs + 45 * 60 * 1000).toISOString(),
              lat: coordLat,
              lng: coordLng,
              geofenceRadiusM: stopTypeNorm === 'border_check' || stopTypeNorm === 'quarantine' ? 1000 : 300,
              locationRefType: matchedMs ? 'master_stop' : coordLat !== null && coordLng !== null ? 'address' : null,
              locationRefId: matchedMs?.id ?? null,
            });
          });
        }

        // Advance cursor with sensible handoff buffer (1h before flight/sea or 30m between legs)
        const bufferMs = raw.legType === 'road' && firstCrossBorderIdx === idx + 1 ? 60 * 60 * 1000 : 30 * 60 * 1000;
        cursorMs = arrMs + bufferMs;
      });

      // Ensure international road-only shipments include a border/quarantine checkpoint with GPS coordinates (BR-F3-03)
      if (isInternationalRoadOnly) {
        const directionStops = stops.slice(directionStartStopCount);
        const hasBorderOrQuarantine = directionStops.some(
          (s) => s.stopType === 'border_check' || s.stopType === 'quarantine',
        );
        if (!hasBorderOrQuarantine && rawList.length > 0) {
          const firstDirLegIdx = legs.length - rawList.length;
          const anchorLeg = legs[firstDirLegIdx];
          const depMs = new Date(anchorLeg.plannedDeparture).getTime();
          const arrMs = new Date(anchorLeg.plannedArrival).getTime();
          const midMs = depMs + (arrMs - depMs) * 0.5;

          const planCp = routePlanCheckpoints[0] ?? null;
          if (planCp) {
            const matchedMs = matchMasterStopByName(planCp.name);
            stops.push({
              sequenceNo: stops.length + 1,
              direction,
              legSequenceNo: anchorLeg.sequenceNo,
              stopType: 'border_check',
              locationName: planCp.name,
              country: matchedMs?.country ?? planCp.countryCode ?? null,
              plannedArrival: new Date(midMs).toISOString(),
              plannedDeparture: new Date(midMs + 60 * 60 * 1000).toISOString(),
              lat: planCp.lat ?? matchedMs?.lat ?? null,
              lng: planCp.lng ?? matchedMs?.lng ?? null,
              geofenceRadiusM: 1000,
              locationRefType: matchedMs ? 'master_stop' : planCp.lat !== null && planCp.lng !== null ? 'address' : null,
              locationRefId: matchedMs?.id ?? null,
            });
          } else {
            const borderCandidate = RoutesService.pickBestCrossBorderStop(
              masterStops,
              direction === 'outbound' ? originCoords : destCoords,
              direction === 'outbound' ? destCoords : originCoords,
              direction === 'outbound' ? originCC : destCC,
              direction === 'outbound' ? destCC : originCC,
            );
            if (borderCandidate) {
              stops.push({
                sequenceNo: stops.length + 1,
                direction,
                legSequenceNo: anchorLeg.sequenceNo,
                stopType: borderCandidate.stopType === 'quarantine' ? 'quarantine' : 'border_check',
                locationName: borderCandidate.name,
                country: borderCandidate.country,
                plannedArrival: new Date(midMs).toISOString(),
                plannedDeparture: new Date(midMs + 60 * 60 * 1000).toISOString(),
                lat: borderCandidate.lat ?? null,
                lng: borderCandidate.lng ?? null,
                geofenceRadiusM: 1000,
                locationRefType: 'master_stop',
                locationRefId: borderCandidate.id,
              });
            }
          }
        }
      }

      return cursorMs;
    };

    const outboundEndMs = appendDirectionLegs(rawOutbound, 'outbound', new Date(pickupAtIso).getTime(), outboundVehicleId);

    let returnDepartureAtIso: string | null = null;
    if (tripType === 'round_trip') {
      const retStartMs = shipment.returnDepartureAt
        ? new Date(shipment.returnDepartureAt).getTime()
        : quote?.inputJson?.returnDepartureAt
          ? new Date(quote.inputJson.returnDepartureAt).getTime()
          : outboundEndMs + 48 * 3600 * 1000;
      returnDepartureAtIso = new Date(retStartMs).toISOString();

      const quoteReturnLegs: any[] | null =
        Array.isArray(quote?.resultJson?.return?.legs) && quote.resultJson.return.legs.length > 0
          ? quote.resultJson.return.legs
          : null;

      const rawReturn: RawLegDraft[] = quoteReturnLegs
        ? quoteReturnLegs.map((ql) => {
            const key = String(ql.key || '').toLowerCase();
            return {
              legType: key === 'flight' || key === 'air' ? 'flight' : key === 'sea' ? 'sea' : 'road',
              originLocation: ql.from || shipment.destinationLocation,
              destinationLocation: ql.to || shipment.originLocation,
              distanceKm: Math.max(1, Math.round(Number(ql.distanceKm || 0))),
              durationHours: Math.max(0.5, Number(Number(ql.durationHours || 1).toFixed(2))),
            };
          })
        : [...rawOutbound].reverse().map((l) => ({
            legType: l.legType,
            originLocation: l.destinationLocation,
            destinationLocation: l.originLocation,
            distanceKm: l.distanceKm,
            durationHours: l.durationHours,
            fromCode: l.toCode ?? null,
            toCode: l.fromCode ?? null,
            stops: l.stops ? [...l.stops].reverse() : [],
          }));

      appendDirectionLegs(rawReturn, 'return', retStartMs, returnVehicleId);
    }

    const totalDistanceKm = Math.round(legs.reduce((sum, l) => sum + Number(l.distanceKm || 0), 0));
    const modeLabel = transportMode === 'air' ? 'Hàng không' : transportMode === 'sea' ? 'Đường thủy' : 'Đường bộ';
    const routeName = `Tuyến ${modeLabel}${tripType === 'round_trip' ? ' (Khứ hồi)' : ''}: ${shipment.originLocation} → ${shipment.destinationLocation}`.slice(0, 200);

    return {
      shipmentId: shipment.shipmentId,
      source,
      transportMode,
      tripType,
      routeName,
      totalDistanceKm,
      pickupAt: pickupAtIso,
      returnDepartureAt: returnDepartureAtIso,
      reservedOutboundVehicleIds,
      reservedReturnVehicleIds,
      partnerDepot: quote?.resultJson?.partnerDepot ?? null,
      legs,
      stops,
    };
  }

  private redactRouteForCustomer(route: RouteEntity, order: { originLocation: string; destinationLocation: string }): RouteEntity {
    const visibleStops = (route.stops || [])
      .filter((s) => s.stopType !== RouteStopType.TRANSFER_HUB)
      .map((s, idx) => ({ ...s, sequenceNo: idx + 1 }));
    const rawLegs = route.legs || [];
    const maskedLegs = rawLegs.map((leg, idx) => {
      if (!leg.roadTripId) return leg;
      return {
        ...leg,
        roadTripId: null,
        originLocation: idx === 0 ? order.originLocation : leg.originLocation,
        destinationLocation: idx === rawLegs.length - 1 ? order.destinationLocation : leg.destinationLocation,
      };
    });
    return {
      ...route,
      stops: visibleStops,
      legs: maskedLegs,
    };
  }

  private async assertDriverAssignedToShipment(shipmentId: number, userId: number, message: string): Promise<void> {
    if (typeof this.fleetStore?.findAssignedStaff !== 'function') {
      throw new ForbiddenException(message);
    }
    const assigned = await this.fleetStore.findAssignedStaff(shipmentId);
    const isAssigned = assigned.some((s) => Number(s.userId) === Number(userId));
    if (!isAssigned) {
      throw new ForbiddenException(message);
    }
  }

  private async resolveRouteForViewer(
    shipmentId: number,
    user?: AuthenticatedUser,
  ): Promise<RouteEntity | null> {
    let customerOrder: { originLocation: string; destinationLocation: string; customerId: number } | undefined;
    if (user?.role === UserRole.CUSTOMER) {
      const order = await this.ordersStore.findById(shipmentId);
      if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
      if (order.customerId !== Number(user.id)) throw new ForbiddenException('Bạn chỉ được xem lộ trình đơn của mình');
      customerOrder = order;
    } else if (user?.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem lộ trình của chuyến đi được phân công cho mình',
      );
    }
    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) return null;
    return customerOrder ? this.redactRouteForCustomer(route, customerOrder) : route;
  }

  async getRouteByShipmentId(shipmentId: number, user?: AuthenticatedUser): Promise<RouteEntity> {
    const route = await this.resolveRouteForViewer(shipmentId, user);
    if (!route) {
      throw new NotFoundException(`Chưa có lộ trình nào được lập cho đơn vận chuyển #${shipmentId}`);
    }
    return route;
  }

  async findOptionalRouteByShipmentId(
    shipmentId: number,
    user?: AuthenticatedUser,
  ): Promise<{ route: RouteEntity | null }> {
    const route = await this.resolveRouteForViewer(shipmentId, user);
    return { route };
  }

  async getFullTripPlan(shipmentId: number, user?: AuthenticatedUser): Promise<FullTripPlan> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (user?.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem kế hoạch đơn của mình');
    }
    if (user?.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem kế hoạch của chuyến đi được phân công cho mình',
      );
    }

    const rawRoute = await this.routesStore.findRouteByShipmentId(shipmentId);
    const route = rawRoute && user?.role === UserRole.CUSTOMER ? this.redactRouteForCustomer(rawRoute, order) : rawRoute;
    const assignedVehicles = await this.fleetStore.findAssignedVehicles(shipmentId);
    const assignedStaff = await this.fleetStore.findAssignedStaff(shipmentId);

    const totalCapacity = assignedVehicles.reduce((sum, v) => sum + v.vehicle.capacity, 0);

    const missingRequirements: string[] = [];

    if (
      order.status !== ShipmentStatus.APPROVED &&
      order.status !== ShipmentStatus.PLANNING &&
      (order.status as any) !== 'confirmed' &&
      (order.status as any) !== 'ready_to_depart'
    ) {
      missingRequirements.push('Đơn vận chuyển phải được phê duyệt trước khi lập và xuất bản lịch trình');
    }

    if (!route || (!route.legs || route.legs.length === 0)) {
      missingRequirements.push('Cần dựng ít nhất 1 chặng vận chuyển cho kế hoạch');
    }

    const requiredSlots = typeof this.fleetStore.findRequiredStallSlots === 'function'
      ? await this.fleetStore.findRequiredStallSlots(shipmentId, order.requestedHorseCount)
      : order.requestedHorseCount;

    if (assignedVehicles.length === 0 && (!route?.legs || route.legs.some((l) => l.legType === 'road'))) {
      missingRequirements.push('Chưa phân công phương tiện vận chuyển cho các chặng đường bộ');
    } else if (totalCapacity < requiredSlots && totalCapacity > 0) {
      missingRequirements.push(
        `Sức chứa của phương tiện (${totalCapacity} chỗ) chưa đủ cho nhu cầu chuồng của đơn (${requiredSlots} chỗ)`,
      );
    }

    const hasDriverOrEscort = assignedStaff.some(
      (s) => s.roleInShipment === 'driver' || s.roleInShipment === 'escort',
    );
    if (!hasDriverOrEscort) {
      missingRequirements.push('Cần phân công ít nhất một tài xế (driver) hoặc hộ tống (escort) cho chuyến đi');
    }

    return {
      order,
      route: route ?? null,
      assignedVehicles,
      assignedStaff,
      totalCapacity,
      isReadyToPublish: missingRequirements.length === 0,
      missingRequirements,
    };
  }

  // --- Step 1a: Manager Sets Strategic Framework ---
  async setStrategicFramework(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: SetStrategicFrameworkDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const existing = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (existing && ['confirmed', 'ready_to_depart', 'in_transit', 'completed'].includes(existing.planStatus)) {
      throw new ConflictException('Lộ trình đã xác nhận và phát hành hóa đơn; cần xử lý thay đổi qua quy trình điều chỉnh.');
    }
    const routeId = await this.routesStore.saveStrategicFramework(shipmentId, dto);

    // Cập nhật trạng thái shipment sang planning nếu đang là approved
    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    // Thông báo cho Coordinator được chỉ định
    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    if (dto.assignedCoordinatorId) {
      await this.notificationsService.createNotification(
        dto.assignedCoordinatorId,
        `Giao nhiệm vụ lập chi tiết lộ trình - Đơn ${code}`,
        `Quản lý đã thiết lập khung chiến lược cho chuyến đi ${code} (${dto.managerVehicleType}${dto.managerMainCorridor ? ` qua ${dto.managerMainCorridor}` : ''}). Vui lòng dựng các chặng và điểm dừng chi tiết.`,
        'status_update',
        shipmentId,
      );
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  // --- Step 1b: Coordinator Builds Detailed Plan ---
  async buildDetailedPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: BuildDetailedPlanDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let route = await this.routesStore.findRouteByShipmentId(shipmentId);

    if (dto.legs.some(l => l.legType === 'road' && !l.vehicleId && l.vehiclePlate && !l.roadTripId)) {
      const vehicles = await this.fleetStore.findAllVehicles();
      dto = { ...dto, legs: dto.legs.map(leg => {
        if (leg.legType !== 'road' || leg.vehicleId || leg.roadTripId || !leg.vehiclePlate) return leg;
        const vehicle = vehicles.find(v => v.plateOrCode.toLowerCase() === leg.vehiclePlate!.trim().toLowerCase());
        return vehicle ? { ...leg, vehicleId: vehicle.id } : leg;
      }) };
    }

    // Step 9: số jet stall cho chặng bay (3 ngựa/stall)
    const stallHorses = dto.legs.some(l => l.legType === 'flight') && typeof (this.fleetStore as any).findShipmentStallHorses === 'function'
      ? await (this.fleetStore as any).findShipmentStallHorses(shipmentId)
      : null;
    const jetStalls = stallHorses && stallHorses.length ? jetStallCount(stallHorses) : undefined;

    if (
      dto.legs.some(l => l.legType === 'flight') &&
      typeof (this.routesStore as any).findAllAirlines === 'function' &&
      typeof (this.routesStore as any).findAllAirports === 'function'
    ) {
      const [airlines, airports] = await Promise.all([
        this.routesStore.findAllAirlines(),
        this.routesStore.findAllAirports(),
      ]);
      dto = {
        ...dto,
        legs: dto.legs.map((leg) => {
          if (leg.legType !== 'flight') return leg;
          let airlineId = leg.airlineId ?? route?.managerAirlineId ?? undefined;
          let airlineName = leg.airlineName;
          if (!airlineId && airlineName) {
            const norm = airlineName.trim().toLowerCase();
            const matchedAirline = airlines.find(
              (a) =>
                a.name.toLowerCase() === norm ||
                norm.includes(a.name.toLowerCase()) ||
                a.name.toLowerCase().includes(norm) ||
                norm.includes(`(${a.code.toLowerCase()})`),
            );
            if (matchedAirline) {
              airlineId = matchedAirline.id;
              airlineName = matchedAirline.name;
            }
          }
          if (!airlineId && airlines.length > 0) {
            airlineId = airlines[0].id;
            if (!airlineName) airlineName = airlines[0].name;
          }

          const matchAirport = (text?: string, code?: string, fallbackId?: number | null) => {
            if (code) {
              const byCode = airports.find((ap) => ap.iataCode.toLowerCase() === code.trim().toLowerCase());
              if (byCode) return byCode;
            }
            if (text) {
              const normText = text.trim().toLowerCase();
              const byIataInText = airports.find(
                (ap) =>
                  normText.includes(`(${ap.iataCode.toLowerCase()}`) ||
                  normText.includes(` ${ap.iataCode.toLowerCase()} `) ||
                  normText.endsWith(` ${ap.iataCode.toLowerCase()}`),
              );
              if (byIataInText) return byIataInText;
              const byNameOrCity = airports.find(
                (ap) =>
                  normText.includes(ap.name.toLowerCase()) ||
                  normText.includes(ap.city.toLowerCase()) ||
                  normText.includes(ap.country.toLowerCase()),
              );
              if (byNameOrCity) return byNameOrCity;
            }
            if (fallbackId) {
              return airports.find((ap) => ap.id === Number(fallbackId));
            }
            return undefined;
          };

          const depAp =
            (leg.departureAirportId ? airports.find((ap) => ap.id === Number(leg.departureAirportId)) : undefined) ||
            matchAirport(leg.originLocation, leg.departureAirportCode, route?.managerDepartureAirportId) ||
            airports.find((ap) => ap.country.toLowerCase().includes('viet')) ||
            airports[0];

          const arrAp =
            (leg.arrivalAirportId ? airports.find((ap) => ap.id === Number(leg.arrivalAirportId)) : undefined) ||
            matchAirport(leg.destinationLocation, leg.arrivalAirportCode, route?.managerArrivalAirportId) ||
            matchAirport(order.destinationLocation, undefined, null) ||
            airports.find((ap) => !ap.country.toLowerCase().includes('viet')) ||
            airports[0];

          const minAirStalls = jetStalls ?? Math.max(1, Math.ceil(Number(order.requestedHorseCount || 1) / 3));
          const requiredStalls = Math.max(Number(leg.stallsBooked || 0), minAirStalls);

          return {
            ...leg,
            airlineId: airlineId ?? leg.airlineId,
            airlineName: airlineName ?? leg.airlineName,
            departureAirportId: leg.departureAirportId ?? depAp?.id,
            departureAirportCode: leg.departureAirportCode ?? depAp?.iataCode,
            arrivalAirportId: leg.arrivalAirportId ?? arrAp?.id,
            arrivalAirportCode: leg.arrivalAirportCode ?? arrAp?.iataCode,
            stallsBooked: requiredStalls,
            jetStallCount: jetStalls ?? leg.jetStallCount,
          };
        }),
      };
    }

    const roadVehicles = [...new Set(dto.legs.filter(l => l.legType === 'road' && l.vehicleId && !l.roadTripId).map(l => l.vehicleId!))];
    if (roadVehicles.length) {
      const requiredSlots = typeof this.fleetStore.findRequiredStallSlots === 'function'
        ? await this.fleetStore.findRequiredStallSlots(shipmentId, order.requestedHorseCount)
        : order.requestedHorseCount;
      const reservations = typeof (this.fleetStore as any).findShipmentReservations === 'function'
        ? await (this.fleetStore as any).findShipmentReservations(shipmentId)
        : [];
      assertRoadCapacity(requiredSlots, roadVehicles, applyConvoyCapacity(await this.fleetStore.findVehiclesByIds(roadVehicles), reservations));
    }
    let routeId: number;
    if (!route) {
      routeId = await this.routesStore.createRoute(shipmentId, dto.routeName, dto.totalDistanceKm);
    } else {
      routeId = route.id;
    }

    if (dto.legs.length === 0) {
      throw new BadRequestException('Kế hoạch chuyến đi phải có ít nhất 1 chặng vận chuyển (Leg)');
    }

    // Step 5: Ràng buộc chặng hai chiều (direction) theo loại chuyến đi
    const isRoundTripOrder = order.tripType === 'round_trip';
    const returnLegs = dto.legs.filter((l) => l.direction === 'return');
    if (isRoundTripOrder && returnLegs.length === 0) {
      throw new BadRequestException('Đơn khứ hồi phải có ít nhất 1 chặng về (direction: return)');
    }
    if (!isRoundTripOrder && returnLegs.length > 0) {
      throw new BadRequestException('Đơn vận chuyển một chiều không được có chặng về (direction: return)');
    }
    if (isRoundTripOrder && order.returnDepartureAt) {
      const returnDepMinTime = new Date(order.returnDepartureAt).getTime();
      for (const rLeg of returnLegs) {
        if (rLeg.plannedDeparture) {
          const rDepTime = new Date(rLeg.plannedDeparture).getTime();
          if (rDepTime < returnDepMinTime) {
            throw new BadRequestException(
              `Chặng về #${rLeg.sequenceNo} có giờ xuất phát sớm hơn giờ hẹn đón chặng về (${new Date(returnDepMinTime).toISOString()})`,
            );
          }
        }
      }
    }

    // BR-F3-03: Enforce unique sequenceNo, valid per-leg window & non-overlapping chronological order
    const explicitSeqs = dto.legs.map((l) => l.sequenceNo).filter((s) => s !== undefined && s !== null);
    if (explicitSeqs.length !== new Set(explicitSeqs).size) {
      throw new BadRequestException('Thứ tự các chặng vận chuyển (sequenceNo) không được trùng lặp');
    }
    const orderedLegs = [...dto.legs].sort(
      (a, b) => Number(a.sequenceNo ?? 0) - Number(b.sequenceNo ?? 0),
    );
    for (let i = 0; i < orderedLegs.length; i++) {
      const curr = orderedLegs[i];
      const currStart = curr.plannedDeparture ? new Date(curr.plannedDeparture).getTime() : NaN;
      const currEnd = curr.plannedArrival ? new Date(curr.plannedArrival).getTime() : NaN;
      if (Number.isFinite(currStart) && Number.isFinite(currEnd) && currEnd <= currStart) {
        throw new BadRequestException(
          `Thời điểm đến dự kiến của chặng #${curr.sequenceNo ?? i + 1} phải sau thời điểm xuất phát`,
        );
      }
      if (i + 1 < orderedLegs.length) {
        const next = orderedLegs[i + 1];
        const nextStart = next.plannedDeparture ? new Date(next.plannedDeparture).getTime() : NaN;
        if (Number.isFinite(currEnd) && Number.isFinite(nextStart) && nextStart < currEnd) {
          throw new BadRequestException(
            `Chặng #${next.sequenceNo ?? i + 2} không được xuất phát trước thời điểm đến dự kiến của chặng #${curr.sequenceNo ?? i + 1}`,
          );
        }
      }
    }

    const emergencyReroute = route?.planStatus === PlanStatus.IN_TRANSIT && Boolean(route.activeIncident);
    if (route && !['draft', 'pending_approval'].includes(route.planStatus) && !emergencyReroute) throw new ConflictException('Chỉ sửa kế hoạch khi còn ở giai đoạn lập/duyệt hoặc đang xử lý sự cố trên đường.');

    if (this.isInternationalOrder(order)) {
      const effectiveStops = [
        ...(dto.stops || []),
        ...(emergencyReroute && route?.stops ? route.stops : []),
      ];
      const hasBorderOrQuarantine = effectiveStops.some(
        (s) => s.stopType === RouteStopType.BORDER_CHECK || s.stopType === RouteStopType.QUARANTINE,
      );
      if (!hasBorderOrQuarantine) {
        throw new BadRequestException(
          'Tuyến vận chuyển quốc tế bắt buộc phải có ít nhất 1 điểm dừng cửa khẩu hoặc kiểm dịch (border_check / quarantine) theo quy tắc BR-F3-03',
        );
      }
    }

    if (Array.isArray(dto.stops) && dto.stops.length > 0) {
      dto = {
        ...dto,
        stops: await this.enrichStopsWithMasterData(dto.stops),
      };
    }

    await this.routesStore.saveDetailedPlan(routeId, dto, Number(user.id));

    return (await this.routesStore.findRouteById(routeId))!;
  }

  private async enrichStopsWithMasterData<
    T extends {
      locationName: string;
      country?: string;
      lat?: number;
      lng?: number;
      geofenceRadiusM?: number;
      locationRefType?: StopLocationRefType;
      locationRefId?: number;
    },
  >(stops: T[]): Promise<T[]> {
    const needsMasterLookup = stops.some(
      (s) =>
        s.lat === undefined ||
        s.lat === null ||
        s.lng === undefined ||
        s.lng === null ||
        (s.locationRefType === 'master_stop' && s.locationRefId),
    );
    const masterStops =
      needsMasterLookup && typeof (this.routesStore as any).findAllMasterStops === 'function'
        ? await this.routesStore.findAllMasterStops()
        : [];

    return stops.map((stop) => {
      const matchedById =
        stop.locationRefType === 'master_stop' && stop.locationRefId
          ? masterStops.find((ms) => ms.id === Number(stop.locationRefId))
          : undefined;
      const normName = String(stop.locationName || '').trim().toLowerCase();
      const matchedByName =
        !matchedById && normName
          ? masterStops.find((ms) => String(ms.name || '').trim().toLowerCase() === normName)
          : undefined;
      const matched = matchedById ?? matchedByName;

      const rawLat = stop.lat !== undefined && stop.lat !== null ? Number(stop.lat) : matched?.lat ?? null;
      const rawLng = stop.lng !== undefined && stop.lng !== null ? Number(stop.lng) : matched?.lng ?? null;
      const validCoords =
        rawLat !== null &&
        rawLng !== null &&
        Number.isFinite(rawLat) &&
        Number.isFinite(rawLng) &&
        rawLat >= -90 &&
        rawLat <= 90 &&
        rawLng >= -180 &&
        rawLng <= 180;

      const resolvedRefType: StopLocationRefType | undefined =
        stop.locationRefType ?? (matched ? 'master_stop' : validCoords ? 'address' : undefined);
      const resolvedRefId =
        stop.locationRefId ?? (resolvedRefType === 'master_stop' && matched ? matched.id : undefined);

      return {
        ...stop,
        country: stop.country?.trim() || matched?.country || undefined,
        lat: validCoords ? rawLat : undefined,
        lng: validCoords ? rawLng : undefined,
        geofenceRadiusM:
          stop.geofenceRadiusM !== undefined && stop.geofenceRadiusM !== null && Number(stop.geofenceRadiusM) >= 50
            ? Math.round(Number(stop.geofenceRadiusM))
            : undefined,
        locationRefType: resolvedRefType,
        locationRefId: resolvedRefId,
      };
    });
  }

  private isInternationalOrder(order: {
    transportationType?: string | null;
    originLocation?: string | null;
    destinationLocation?: string | null;
  }): boolean {
    const tType = String(order.transportationType || '').toLowerCase();
    if (tType.includes('international')) return true;
    if (tType.includes('domestic')) return false;
    if (typeof this.documentsService?.detectRecognizedCountry === 'function') {
      const dest = this.documentsService.detectRecognizedCountry(order.destinationLocation);
      const orig = this.documentsService.detectRecognizedCountry(order.originLocation);
      if (dest && dest !== 'Vietnam') return true;
      if (orig && dest && orig !== dest) return true;
    }
    return false;
  }

  // --- Coordinator Submits Plan For Manager Approval ---
  async submitPlanForApproval(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) {
      throw new BadRequestException('Chưa có kế hoạch lộ trình nào được lập cho đơn hàng này');
    }

    if (!route.legs || route.legs.length === 0) {
      throw new BadRequestException('Vui lòng dựng đầy đủ các chặng vận chuyển trước khi gửi duyệt');
    }

    if (route.planStatus !== PlanStatus.DRAFT) throw new BadRequestException('Chỉ gửi duyệt kế hoạch nháp.');
    await this.routesStore.updatePlanStatus(route.id, PlanStatus.PENDING_APPROVAL);

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;
    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `Yêu cầu phê duyệt kế hoạch chuyến đi - Đơn ${code}`,
      `Kế hoạch chi tiết cho đơn ${code} gồm ${route.legs.length} chặng đã hoàn thiện và sẵn sàng phê duyệt.`,
      'status_update',
      shipmentId,
    );

    return (await this.routesStore.findRouteById(route.id))!;
  }

  // --- Step 2: Manager Reviews Plan ---
  async reviewTripPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: ReviewPlanDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const route = await this.routesStore.findRouteByShipmentId(shipmentId);
    if (!route) {
      throw new NotFoundException(`Không tìm thấy kế hoạch chuyến đi #${shipmentId}`);
    }

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    const canApproveDirectly =
      dto.status === 'approved' &&
      route.planStatus === PlanStatus.DRAFT &&
      (user.role === UserRole.LOGISTICS_MANAGER || user.role === UserRole.ADMIN) &&
      route.legs &&
      route.legs.length > 0;
    if (route.planStatus !== PlanStatus.PENDING_APPROVAL && !canApproveDirectly) {
      throw new ConflictException('Chỉ phê duyệt kế hoạch đang chờ duyệt.');
    }

    if (dto.status === 'approved') {
      if (dto.transportCost !== undefined && dto.transportCost !== null) {
        const nextTransportCost = Math.round(Number(dto.transportCost));
        const currentTransportCost = Math.round(
          Number(order.transportCost ?? Math.max(0, Number(order.totalCost || 0) - Number(order.insuranceFee || 0))),
        );
        if (
          Number.isFinite(nextTransportCost) &&
          nextTransportCost >= 0 &&
          nextTransportCost !== currentTransportCost &&
          typeof this.ordersStore.updatePricing === 'function'
        ) {
          const isPaidPrepaid =
            order.paymentFlow === 'prepaid' &&
            (order.paymentStatus === 'succeeded' ||
              ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending'].includes(order.status));
          if (isPaidPrepaid) {
            throw new ConflictException(
              'Đơn hàng trả trước đã thanh toán — không thể chỉnh sửa giá cước gốc. Nếu phát sinh chi phí, vui lòng tạo hóa đơn phụ phí.',
            );
          }
          const insuranceFee = Math.round(Number(order.insuranceFee || 0));
          await this.ordersStore.updatePricing(
            shipmentId,
            nextTransportCost,
            nextTransportCost + insuranceFee,
          );
        }
      }

      await this.routesStore.updatePlanStatus(
        route.id,
        PlanStatus.APPROVED,
        undefined,
        Number(user.id),
      );

      if (route.assignedCoordinatorId) {
        await this.notificationsService.createNotification(
          route.assignedCoordinatorId,
          `Kế hoạch lộ trình đơn ${code} ĐÃ ĐƯỢC DUYỆT`,
          `Quản lý ${user.email} đã phê duyệt kế hoạch chi tiết của chuyến đi ${code}. Kế hoạch sẵn sàng để phân công nhân sự.`,
          'status_update',
          shipmentId,
        );
      }
    } else {
      if (!dto.rejectionReason || dto.rejectionReason.trim().length === 0) {
        throw new BadRequestException('Bắt buộc phải nhập lý do trả về để Coordinator điều chỉnh');
      }

      await this.routesStore.updatePlanStatus(
        route.id,
        PlanStatus.DRAFT,
        dto.rejectionReason,
        Number(user.id),
      );

      if (route.assignedCoordinatorId) {
        await this.notificationsService.createNotification(
          route.assignedCoordinatorId,
          `Kế hoạch chuyến đi ${code} yêu cầu điều chỉnh`,
          `Quản lý đã trả về kế hoạch chuyến đi ${code} với lý do: "${dto.rejectionReason}". Vui lòng cập nhật lại.`,
          'status_update',
          shipmentId,
        );
      }
    }

    return (await this.routesStore.findRouteById(route.id))!;
  }

  // --- Step 3: Driver / Escort Confirms Assignment ---
  async confirmTripAssignment(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: ConfirmAssignmentDto,
  ): Promise<{ success: boolean; message: string; isFullyConfirmed: boolean }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let targetUserId = Number(user.id);
    if (isNaN(targetUserId) || user.role === UserRole.ADMIN || user.role === UserRole.LOGISTICS_MANAGER) {
      if (dto.driverUserId) {
        targetUserId = Number(dto.driverUserId);
      } else {
        const staff = await this.fleetStore.findAssignedStaff(shipmentId);
        const driverOrEscort = staff.find((s) => !s.isConfirmed);
        if (driverOrEscort) {
          targetUserId = driverOrEscort.userId;
        }
      }
    }

    const allConfirmed = await this.routesStore.confirmAndInvoice(shipmentId, targetUserId, dto.confirmationNotes);
    if (allConfirmed) await this.evaluateReadyToDepartGate(shipmentId);

    return {
      success: true,
      message: 'Đã xác nhận nhận nhiệm vụ chuyến đi thành công.',
      isFullyConfirmed: allConfirmed,
    };
  }

  async declineTripAssignment(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: { reason: string; driverUserId?: number },
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    let targetUserId = Number(user.id);
    if (isNaN(targetUserId) || user.role === UserRole.ADMIN || user.role === UserRole.LOGISTICS_MANAGER) {
      if (dto.driverUserId) {
        targetUserId = Number(dto.driverUserId);
      } else {
        const staff = await this.fleetStore.findAssignedStaff(shipmentId);
        const driverOrEscort = staff.find((s) => !s.isConfirmed);
        if (driverOrEscort) {
          targetUserId = driverOrEscort.userId;
        }
      }
    }

    const result = await this.routesStore.declineStaffAssignment(
      shipmentId,
      targetUserId,
      dto.reason || 'Lý do sức khỏe / việc đột xuất',
    );
    if (!result.declined) {
      throw new BadRequestException('Bạn không nằm trong danh sách nhân sự được phân công cho chuyến đi này');
    }

    await this.evaluateReadyToDepartGate(shipmentId);

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    if (result.reverted) {
      const customerCode = order.customerRequestCode || code;
      await this.notificationsService.createNotification(
        order.customerId,
        `Đơn ${customerCode} đang cập nhật nhân sự vận chuyển`,
        `Một nhân sự phụ trách chuyến đi ${customerCode} vừa thay đổi. Chuyến đi tạm chưa đủ điều kiện xuất phát cho đến khi nhân sự thay thế xác nhận. Quý khách không cần thanh toán thêm; hóa đơn hiện tại vẫn giữ nguyên.`,
        'status_update',
        shipmentId,
      );
    }

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `⚠️ Nhân sự TỪ CHỐI chuyến ${code}`,
      `Tài xế/Hộ tống phụ trách chuyến đi ${code} đã TỪ CHỐI nhận nhiệm vụ. Lý do: "${dto.reason}". Vui lòng chỉ định nhân sự thay thế.${result.reverted ? ' Kế hoạch đã chuyển về "đã duyệt – chờ xác nhận nhân sự" và đơn về trạng thái lập kế hoạch cho đến khi người thay thế xác nhận.' : ''}`,
      'incident',
      shipmentId,
    );

    return {
      success: true,
      message: 'Đã từ chối nhận chuyến và thông báo khẩn tới Logistics Manager.',
    };
  }

  // --- Step 4: Ready to Depart Gate Evaluation ---
  async getTripPlanReadiness(
    user: AuthenticatedUser,
    shipmentId: number,
  ): Promise<TripPlanReadiness> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
    if (user.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ được xem đơn của mình');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      await this.assertDriverAssignedToShipment(
        shipmentId,
        Number(user.id),
        'Bạn chỉ được phép xem trạng thái sẵn sàng của chuyến đi được phân công cho mình',
      );
    }
    return this.evaluateReadyToDepartGate(shipmentId);
  }

  private async evaluateReadyToDepartGate(shipmentId: number): Promise<TripPlanReadiness> {
    const isLegalCompliant = await this.documentsService.isFlow2CompletedForPayment(shipmentId);
    const gate = await this.routesStore.applyDepartureReadiness(shipmentId, isLegalCompliant);
    const pendingConditions: string[] = [];
    if (!gate.isPlanConfirmed) pendingConditions.push('Đang chờ lộ trình được xác nhận đầy đủ và hóa đơn chính thức.');
    if (!gate.isLegalCompliant) pendingConditions.push('Hồ sơ pháp lý, xét nghiệm và kiểm dịch (Flow 2) chưa hoàn tất 100%.');
    if (!gate.isPaymentSucceeded) pendingConditions.push('Đang chờ khách hàng hoàn tất thanh toán cước vận chuyển qua SePay.');
    return { shipmentId, orderCode: `REQ-${String(shipmentId).padStart(3, '0')}`, ...gate, pendingConditions };
  }

  // --- Legacy Compatibility Methods ---
  async createOrUpdateRoute(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateRouteDto,
  ): Promise<RouteEntity> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (dto.stops.length < 2) {
      throw new BadRequestException('Lộ trình phải có ít nhất 2 điểm dừng (Điểm xuất phát và Điểm kết thúc)');
    }

    let route = await this.routesStore.findRouteByShipmentId(shipmentId);
    let routeId: number;

    if (route) {
      if (![PlanStatus.DRAFT, PlanStatus.PENDING_APPROVAL].includes(route.planStatus)) {
        throw new ConflictException(
          `Không thể ghi đè lộ trình bằng endpoint cũ khi kế hoạch đang ở trạng thái "${route.planStatus}"`,
        );
      }
      routeId = route.id;
      await this.routesStore.updateRouteDetails(routeId, dto.routeName, dto.totalDistanceKm);
    } else {
      routeId = await this.routesStore.createRoute(shipmentId, dto.routeName, dto.totalDistanceKm);
    }

    const enrichedStops = await this.enrichStopsWithMasterData(dto.stops);
    await this.routesStore.replaceRouteStops(routeId, enrichedStops);

    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    return (await this.routesStore.findRouteById(routeId))!;
  }

  async updateSchedule(
    user: AuthenticatedUser,
    routeId: number,
    dto: UpdateScheduleDto,
  ): Promise<RouteEntity> {
    const route = await this.routesStore.findRouteById(routeId);
    if (!route) {
      throw new NotFoundException(`Không tìm thấy lộ trình #${routeId}`);
    }

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('Bắt buộc phải cung cấp lý do điều chỉnh lịch trình (reason)');
    }

    for (const item of dto.stops) {
      await this.routesStore.updateStopScheduleWithHistory(
        item.stopId,
        item.plannedArrival,
        item.plannedDeparture,
        dto.reason,
        Number(user.id),
      );
    }

    const order = await this.ordersStore.findById(route.shipmentId);
    if (order) {
      await this.notificationsService.createNotification(
        order.customerId,
        'Cập nhật điều chỉnh lịch trình vận chuyển',
        `Lịch trình chuyến đi #${order.requestCode || order.id} đã được điều chỉnh. Lý do: "${dto.reason}".`,
        'status_update',
        route.shipmentId,
      );
    }

    await this.evaluateReadyToDepartGate(route.shipmentId);

    return (await this.routesStore.findRouteById(routeId))!;
  }

  async publishTripPlan(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: PublishTripDto,
  ): Promise<FullTripPlan> {
    const readiness = await this.getTripPlanReadiness(user, shipmentId);
    if (!readiness.isReadyToDepart) {
      throw new UnprocessableEntityException({
        message: readiness.pendingConditions.join('; '),
        missingRequirements: readiness.pendingConditions,
      });
    }
    const plan = await this.getFullTripPlan(shipmentId);

    if (!plan.isReadyToPublish) {
      throw new UnprocessableEntityException({
        message: `Không thể xuất bản kế hoạch chuyến đi do chưa đủ điều kiện: ${plan.missingRequirements.join('; ')}`,
        missingRequirements: plan.missingRequirements,
      });
    }

    await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.IN_TRANSIT);
    await this.routesStore.updateRouteStatus(plan.route!.id, RouteStatus.ACTIVE);
    await this.routesStore.updatePlanStatus(plan.route!.id, PlanStatus.IN_TRANSIT);

    await this.notificationsService.createNotification(
      plan.order.customerId,
      'Kế hoạch chuyến đi đã chính thức xuất phát',
      `Lịch trình vận chuyển cho ${plan.order.requestedHorseCount} con ngựa của bạn đã bắt đầu hành trình.`,
      'status_update',
      shipmentId,
    );

    for (const staff of plan.assignedStaff) {
      await this.notificationsService.createNotification(
        staff.userId,
        'Lịch trình chuyến đi đã xuất phát',
        `Chuyến đi #${plan.order.requestCode || shipmentId} đã chính thức lăn bánh. Vui lòng cập nhật nhật ký hành trình tại các trạm dừng.`,
        'status_update',
        shipmentId,
      );
    }

    return this.getFullTripPlan(shipmentId);
  }

  async recordStopProgress(
    user: AuthenticatedUser,
    stopId: number,
    dto: RecordStopProgressDto,
  ): Promise<RouteStopEntity> {
    const stop = await this.routesStore.findStopById(stopId);
    if (!stop) {
      throw new NotFoundException(`Không tìm thấy điểm dừng #${stopId}`);
    }

    const route = await this.routesStore.findRouteById(stop.routeId);
    if (user.role === UserRole.DRIVER_ESCORT) {
      if (!route) {
        throw new ForbiddenException('Bạn chỉ được phép cập nhật điểm dừng thuộc chuyến đi được phân công cho mình');
      }
      await this.assertDriverAssignedToShipment(
        route.shipmentId,
        Number(user.id),
        'Bạn chỉ được phép cập nhật điểm dừng thuộc chuyến đi được phân công cho mình',
      );
    }

    await this.routesStore.createStopUpdate(stopId, Number(user.id), dto);

    const updatedStop = (await this.routesStore.findStopById(stopId))!;

    if (route) {
      const order = await this.ordersStore.findById(route.shipmentId);
      if (order) {
        await this.notificationsService.createNotification(
          order.customerId,
          `Cập nhật lộ trình: ${stop.locationName}`,
          `Đoàn vận chuyển đã cập nhật trạng thái "${dto.status}" tại ${stop.locationName}${dto.notes ? `: ${dto.notes}` : ''}.`,
          'status_update',
          route.shipmentId,
        );
      }
    }

    return updatedStop;
  }

  // --- Flow 5: Incident Reporting & Emergency Reroute ---
  async reportIncident(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: { incidentType: string; description: string; severity?: string },
  ): Promise<{ success: boolean; incidentId: number }> {
    const allowedRoles = new Set<string>([
      UserRole.DRIVER_ESCORT,
      UserRole.LOGISTICS_MANAGER,
      UserRole.ADMIN,
    ]);
    if (!allowedRoles.has(user.role)) {
      throw new ForbiddenException('Chỉ nhân sự vận hành hoặc điều phối mới có quyền báo cáo sự cố chuyến đi');
    }

    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (user.role === UserRole.DRIVER_ESCORT && typeof this.fleetStore?.findAssignedStaff === 'function') {
      const assigned = await this.fleetStore.findAssignedStaff(shipmentId);
      const isAssigned = assigned.some((s) => Number(s.userId) === Number(user.id));
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ có thể báo cáo sự cố cho chuyến đi được phân công cho mình');
      }
    }

    const incidentId = await this.routesStore.reportIncident({
      shipmentId,
      reportedBy: Number(user.id),
      incidentType: dto.incidentType || 'traffic_delay',
      description: dto.description,
      severity: dto.severity || 'high',
    });

    const code = order.requestCode || `REQ-${String(shipmentId).padStart(3, '0')}`;

    await this.notificationsService.notifyRole(
      'Logistics Manager',
      `🚨 SỰ CỐ TRÊN ĐƯỜNG: Đơn ${code}`,
      `Báo cáo sự cố [${dto.incidentType}]: "${dto.description}". Lộ trình của chuyến đi ${code} đã được mở quyền hiệu chỉnh chặng khẩn cấp.`,
      'incident',
      shipmentId,
    );

    return { success: true, incidentId };
  }

  async resolveIncident(
    user: AuthenticatedUser,
    incidentId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.routesStore.resolveIncident(incidentId);
    return {
      success: true,
      message: 'Đã giải quyết sự cố và hoàn tất điều chỉnh lộ trình an toàn.',
    };
  }

  async getAllIncidents() {
    return this.routesStore.findAllIncidents();
  }
}
