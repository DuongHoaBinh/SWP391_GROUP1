import { Injectable } from '@nestjs/common';
import { PricingService, RouteContext } from './pricing.service';
import { calculateFreight, FreightLine, RoadTariff } from './pricing-policy';
import { DistanceService } from '../routes/distance.service';
import { GeoPoint, haversineKm } from '../routes/geo-policy';
import { AllocationStore, DepotWithVehicles } from '../fleet/allocation.store';
import {
  AllocationDepot,
  AllocationOption,
  generateAllocationOptions,
  jetStallCount,
  PricedVehicle,
  vesselPenCount,
} from '../fleet/allocation-policy';
import {
  applicableRules,
  CityRestrictionException,
  CityRestrictionRule,
  DEFAULT_TZ,
  nextAllowedTime,
  toLocal,
} from '../fleet/city-restriction-policy';
import { DEFAULT_JOURNEY_RULES, estimateJourney, normalizeJourneyRules } from '../fleet/journey-time-policy';

const HOUR = 3600 * 1000;
/** Đệm trước/sau khi giữ xe (giờ) */
const WINDOW_PADDING_HOURS = 2;
/** Chỉ gọi ORS cho N trạm gần nhất theo Haversine để tránh hết quota */
const ORS_DEPOT_LIMIT = 3;
const PARTNER_MAX_KM = 300;
const SHORTAGE_LOOKAHEAD_DAYS = 14;

export interface AllocationQuoteInput {
  mode: 'road' | 'air' | 'sea';
  seaMode?: 'vessel';
  origin: GeoPoint & { address: string; country?: string };
  destination: GeoPoint & { address: string; country?: string };
  horses: Array<{ quantity: number; requiresPrivateStall: boolean }>;
  pickupAt: Date;
}

export interface QuoteVehicleGroup {
  classCode: string;
  className?: string;
  count: number;
  capacity: number;
  depotId: number;
  depotName: string;
  deadheadKm: number;
  isHeavyTruck: boolean;
  trips: number;
  vehicleIds: number[];
  plates: string[];
}

export interface QuoteAllocationOption {
  optionCode: string;
  label: string;
  labelVi: string;
  vehicles: QuoteVehicleGroup[];
  vehicleIds: number[];
  extraDays: number;
  requestedPickupAt: string;
  pickupAt: string;
  pickupShifted: boolean;
  shiftReasonVi: string | null;
  nightSurcharge: boolean;
  deliveryAt: string;
  etaHours: number;
  restStops: number;
  mandatoryRests: number;
  journeyBreakdownVi: string[];
  reservationWindow: { start: string; end: string };
  warnings: string[];
  freight: { lines: FreightLine[]; subtotal: number; rounding: number; total: number };
}

export interface AllocationQuoteResult {
  context: RouteContext;
  options: QuoteAllocationOption[];
  recommendedOptionCode: string | null;
  shortage: { slots: number; suggestedDates: string[] } | null;
  jetStallsRequired: number | null;
  vesselPens: number | null;
  partnerDepot: { depotId: number; name: string; country: string; deadheadKm: number } | null;
  warnings: string[];
}

interface ShiftInfo {
  pickup: Date;
  pickupShifted: boolean;
  delivery: Date;
  deliveryShifted: boolean;
  night: boolean;
  reasonVi: string | null;
  warnings: string[];
}

/**
 * Báo giá có phân bổ xe thật (Step 9): xe rảnh theo trạm own gần điểm đón, tối đa 3 phương án,
 * giờ cấm đô thị + phụ phí đêm, ETA có nghỉ, trạm đối tác + bảng giá PARTNER cho chặng giao ở nước ngoài.
 */
@Injectable()
export class QuoteAllocationService {
  constructor(
    private readonly pricing: PricingService,
    private readonly distance: DistanceService,
    private readonly store: AllocationStore,
  ) {}

  async allocate(input: AllocationQuoteInput): Promise<AllocationQuoteResult> {
    const warnings: string[] = [];
    const ctx = await this.pricing.buildRouteContext({
      mode: input.mode,
      seaMode: input.seaMode,
      sample: { origin: input.origin, destination: input.destination, horses: input.horses },
    } as any);

    const [rulesRaw, restrictions, exceptions] = await Promise.all([
      this.store.getSetting('journey.rules'),
      this.store.listRestrictionRules(true).catch(() => [] as CityRestrictionRule[]),
      this.store.listRestrictionExceptions().catch(() => [] as CityRestrictionException[]),
    ]);
    const journeyRules = normalizeJourneyRules(rulesRaw ?? DEFAULT_JOURNEY_RULES);

    // ETA: tính giờ nghỉ riêng cho từng chặng đường bộ (không gộp to_hub + from_hub qua chuyến bay/tàu); chặng bay/biển cộng nguyên thời gian (đã gồm thời gian thủ tục)
    const roadLegs = ctx.legs.filter((l) => ['main', 'to_hub', 'from_hub'].includes(l.key));
    const otherHours = ctx.legs.filter((l) => !['main', 'to_hub', 'from_hub'].includes(l.key)).reduce((s, l) => s + (l.durationHours || 0), 0);
    let totalRoadWithRest = 0;
    let totalRestStops = 0;
    let totalMandatoryRests = 0;
    const journeyBreakdownParts: string[] = [];
    for (const rl of roadLegs) {
      if ((rl.durationHours || 0) <= 0) continue;
      const seg = estimateJourney({ driveHours: rl.durationHours, rules: journeyRules });
      totalRoadWithRest += seg.totalHours;
      totalRestStops += seg.restStops;
      totalMandatoryRests += seg.mandatoryRests;
      if (seg.breakdownVi?.length) {
        journeyBreakdownParts.push(...seg.breakdownVi);
      }
    }
    const journey = {
      totalHours: Number(totalRoadWithRest.toFixed(2)),
      restStops: totalRestStops,
      mandatoryRests: totalMandatoryRests,
      breakdownVi: journeyBreakdownParts,
    };
    const etaHours = Number((journey.totalHours + otherHours).toFixed(2));

    // Trạm đối tác gần điểm giao (chặng from_hub ở nước ngoài) + bảng giá PARTNER
    let fromHubDeadheadKm = 0;
    let partnerDepot: AllocationQuoteResult['partnerDepot'] = null;
    if (ctx.arrivalHub && (await this.isForeignDestination(input.destination))) {
      const partners = await this.store.findActiveDepots('partner');
      const nearest = partners
        .map((p) => ({ p, km: haversineKm(input.destination, { lat: p.lat, lng: p.lng }) }))
        .sort((a, b) => a.km - b.km)[0];
      const partnerTariff = (await this.pricing.getActiveTariffs('PARTNER')).road;
      if (nearest && nearest.km <= PARTNER_MAX_KM) {
        const dh = await this.distance.getRoadDistance({ lat: nearest.p.lat, lng: nearest.p.lng }, ctx.arrivalHub, ctx.tariffs.road.averageSpeedKmh);
        fromHubDeadheadKm = Number(dh.distanceKm.toFixed(1));
        partnerDepot = { depotId: nearest.p.depotId, name: nearest.p.name, country: nearest.p.country, deadheadKm: fromHubDeadheadKm };
        if (partnerTariff) {
          ctx.tariffs.partnerRoad = { ...(partnerTariff.params as RoadTariff), version: partnerTariff.version };
        } else {
          warnings.push('NO_PARTNER_TARIFF');
        }
      } else {
        warnings.push('NO_PARTNER_DEPOT');
      }
    }

    const resolveTimezone = (pt: GeoPoint & { country?: string; address?: string }): string => {
      const text = `${pt.country || ''} ${pt.address || ''}`.toLowerCase();
      if (text.includes('vietnam') || text.includes('việt nam') || text.includes('thailand') || text.includes('thái lan') || text.includes('cambodia') || text.includes('campuchia') || text.includes('laos') || text.includes('lào')) return 'Asia/Ho_Chi_Minh';
      if (text.includes('singapore') || text.includes('malaysia') || text.includes('hong kong') || text.includes('taiwan') || text.includes('china') || text.includes('philippines')) return 'Asia/Singapore';
      if (text.includes('japan') || text.includes('nhật bản') || text.includes('korea') || text.includes('hàn quốc')) return 'Asia/Tokyo';
      if (text.includes('dubai') || text.includes('uae') || text.includes('abu dhabi')) return 'Asia/Dubai';
      if (text.includes('qatar') || text.includes('saudi')) return 'Asia/Riyadh';
      if (text.includes('australia') || text.includes('sydney') || text.includes('melbourne') || text.includes('úc')) return 'Australia/Sydney';
      if (text.includes('new zealand') || text.includes('auckland')) return 'Pacific/Auckland';
      if (text.includes('united kingdom') || text.includes('london') || text.includes('uk') || text.includes('ireland')) return 'Europe/London';
      if (text.includes('france') || text.includes('germany') || text.includes('italy') || text.includes('netherlands') || text.includes('spain') || text.includes('paris')) return 'Europe/Paris';
      if (text.includes('new york') || text.includes('miami') || text.includes('kentucky')) return 'America/New_York';
      if (text.includes('los angeles') || text.includes('california') || text.includes('usa') || text.includes('mỹ')) return 'America/Los_Angeles';
      return DEFAULT_TZ;
    };

    const shiftFor = (heavy: boolean): ShiftInfo => {
      const pickupTz = resolveTimezone(input.origin);
      const deliveryTz = resolveTimezone(input.destination);
      const pickup = nextAllowedTime(input.pickupAt, input.origin, heavy, restrictions, exceptions, pickupTz, journeyRules.nightWindow);
      const arrival = new Date(pickup.allowedAt.getTime() + etaHours * HOUR);
      const delivery = nextAllowedTime(arrival, input.destination, heavy, restrictions, exceptions, deliveryTz, journeyRules.nightWindow);
      const pickupInZone = applicableRules(input.origin, heavy, restrictions).length > 0;
      const deliveryInZone = applicableRules(input.destination, heavy, restrictions).length > 0;
      const w: string[] = [];
      if (pickup.shifted) w.push('PICKUP_SHIFTED_CITY_BAN');
      if (delivery.shifted) w.push('DELIVERY_SHIFTED_CITY_BAN');
      const reasons = [pickup.reasonVi, delivery.shifted ? `Giao hàng: ${delivery.reasonVi}` : ''].filter(Boolean);
      return {
        pickup: pickup.allowedAt,
        pickupShifted: pickup.shifted,
        delivery: delivery.allowedAt,
        deliveryShifted: delivery.shifted,
        // Phụ phí đêm khi quy định giờ cấm buộc xe phải đón/giao trong khung đêm
        night: (pickupInZone && pickup.isNight) || (deliveryInZone && delivery.isNight),
        reasonVi: reasons.length ? reasons.join(' ') : null,
        warnings: w,
      };
    };
    const heavyShift = shiftFor(true);
    const lightShift = shiftFor(false);

    const toVehicleInput = (v: PricedVehicle) => ({
      classCode: v.classCode,
      className: v.className,
      priceCoefficient: v.priceCoefficient,
      capacity: v.capacity,
      deadheadKm: v.deadheadKm,
    });
    const freightFor = (vehicles: PricedVehicle[]) =>
      calculateFreight(
        {
          ...ctx.freightBase,
          vehicles: vehicles.map(toVehicleInput),
          nightPickup: (vehicles.some((v) => v.isHeavyTruck) ? heavyShift : lightShift).night,
          fromHubDeadheadKm,
        },
        ctx.tariffs,
      );
    const mainRoadKm = ctx.legs.find((l) => l.key === 'main' || l.key === 'to_hub')?.distanceKm ?? 0;
    // Chạy rỗng quay đầu giữa các lượt (điểm giao → điểm đón), làm tròn lên 1.000
    const turnaroundCost = () => Math.ceil((mainRoadKm * (ctx.tariffs.road.deadheadPerKm || 0)) / 1000) * 1000;

    const baseWindow = (pickup: Date) => ({
      start: new Date(pickup.getTime() - WINDOW_PADDING_HOURS * HOUR),
      end: new Date(pickup.getTime() + (etaHours + WINDOW_PADDING_HOURS) * HOUR),
    });

    const deadheadCache = new Map<number, number>();
    const toAllocDepots = async (depots: DepotWithVehicles[], useOrs: boolean): Promise<AllocationDepot[]> => {
      const ranked = depots
        .map((d) => ({ d, km: haversineKm(input.origin, { lat: d.lat, lng: d.lng }) }))
        .sort((a, b) => a.km - b.km);
      const out: AllocationDepot[] = [];
      for (let i = 0; i < ranked.length; i++) {
        const { d, km } = ranked[i];
        let deadhead = deadheadCache.get(d.depotId);
        if (deadhead == null) {
          if (useOrs && i < ORS_DEPOT_LIMIT) {
            const res = await this.distance.getRoadDistance({ lat: d.lat, lng: d.lng }, input.origin, ctx.tariffs.road.averageSpeedKmh);
            deadhead = Number(res.distanceKm.toFixed(1));
          } else {
            deadhead = Number((km * 1.3).toFixed(1));
          }
          deadheadCache.set(d.depotId, deadhead);
        }
        out.push({ depotId: d.depotId, depotName: d.depotName, deadheadKm: deadhead, vehicles: d.vehicles });
      }
      return out.sort((a, b) => a.deadheadKm - b.deadheadKm);
    };

    // Lấy xe rảnh theo khung giờ dự kiến; khung rộng theo giờ đã dời của xe nặng để không giữ trùng
    const earliest = new Date(Math.min(input.pickupAt.getTime(), heavyShift.pickup.getTime()));
    const latest = new Date(Math.max(input.pickupAt.getTime(), heavyShift.pickup.getTime()));
    const window = { start: baseWindow(earliest).start, end: baseWindow(latest).end };
    const depots = await toAllocDepots(await this.store.findAvailableVehiclesByDepot(window), true);

    const requiredSlots = ctx.requiredStallSlots;
    const horseCount = input.horses.reduce((s, h) => s + (h.quantity || 1), 0);
    const allocation = generateAllocationOptions({
      requiredSlots,
      horseCount,
      depots,
      priceVehicleSet: (vs) => freightFor(vs).total,
      turnaroundCost,
    });

    const options = allocation.options.map((o) => this.buildOption(o, freightFor, turnaroundCost, heavyShift, lightShift, input.pickupAt, etaHours, journey, baseWindow));

    let shortage: AllocationQuoteResult['shortage'] = null;
    if (!options.length) {
      const suggestedDates: string[] = [];
      for (let day = 1; day <= SHORTAGE_LOOKAHEAD_DAYS && suggestedDates.length < 3; day++) {
        const shifted = { start: new Date(window.start.getTime() + day * 24 * HOUR), end: new Date(window.end.getTime() + day * 24 * HOUR) };
        const dayDepots = await toAllocDepots(await this.store.findAvailableVehiclesByDepot(shifted), false);
        const res = generateAllocationOptions({ requiredSlots, horseCount, depots: dayDepots, priceVehicleSet: () => 0 });
        if (res.options.length) suggestedDates.push(toLocal(new Date(input.pickupAt.getTime() + day * 24 * HOUR)).date);
      }
      shortage = { slots: allocation.shortageSlots, suggestedDates };
      warnings.push('VEHICLE_SHORTAGE');
    }

    return {
      context: ctx,
      options,
      recommendedOptionCode: allocation.recommended,
      shortage,
      jetStallsRequired: input.mode === 'air' ? jetStallCount(input.horses) : null,
      vesselPens: input.mode === 'sea' && input.seaMode === 'vessel' ? vesselPenCount(input.horses) : null,
      partnerDepot,
      warnings,
    };
  }

  private buildOption(
    o: AllocationOption,
    freightFor: (vs: PricedVehicle[]) => ReturnType<typeof calculateFreight>,
    turnaroundCost: () => number,
    heavyShift: ShiftInfo,
    lightShift: ShiftInfo,
    requestedPickup: Date,
    etaHours: number,
    journey: ReturnType<typeof estimateJourney>,
    baseWindow: (pickup: Date) => { start: Date; end: Date },
  ): QuoteAllocationOption {
    const heavy = o.vehicles.some((v) => v.isHeavyTruck);
    const shift = heavy ? heavyShift : lightShift;
    const perTrip: PricedVehicle[] = o.vehicles.flatMap((v) => Array.from({ length: v.trips }, () => ({ ...v })));
    const calc = freightFor(perTrip);
    const lines = [...calc.lines];
    let total = calc.total;
    if (o.extraDays > 0) {
      const turnaround = turnaroundCost() * o.extraDays;
      if (turnaround > 0) {
        lines.push({
          code: 'split_days_turnaround',
          label: `Chạy rỗng quay đầu giữa các lượt (${o.extraDays} lượt)`,
          quantity: o.extraDays,
          unit: 'lượt',
          unitPrice: turnaroundCost(),
          amount: turnaround,
        });
        total += turnaround;
      }
    }

    const groups = new Map<string, QuoteVehicleGroup>();
    for (const v of o.vehicles) {
      const key = `${v.depotId}|${v.classCode}|${v.trips}`;
      const g = groups.get(key) ?? {
        classCode: v.classCode, className: v.className, count: 0, capacity: v.capacity, depotId: v.depotId,
        depotName: v.depotName, deadheadKm: v.deadheadKm, isHeavyTruck: v.isHeavyTruck, trips: v.trips, vehicleIds: [], plates: [],
      };
      g.count += 1;
      g.vehicleIds.push(v.vehicleId);
      g.plates.push(v.plate);
      groups.set(key, g);
    }

    const label = o.optionCode === 'split_days' ? `Chia ${o.extraDays + 1} ngày` : o.labelVi;
    const win = baseWindow(shift.pickup);
    const delivery = new Date(Math.max(shift.delivery.getTime(), shift.pickup.getTime() + etaHours * HOUR) + o.extraDays * 24 * HOUR);
    return {
      optionCode: o.optionCode,
      label,
      labelVi: label,
      vehicles: [...groups.values()],
      vehicleIds: o.vehicles.map((v) => v.vehicleId),
      extraDays: o.extraDays,
      requestedPickupAt: requestedPickup.toISOString(),
      pickupAt: shift.pickup.toISOString(),
      pickupShifted: shift.pickupShifted,
      shiftReasonVi: shift.reasonVi,
      nightSurcharge: shift.night,
      deliveryAt: delivery.toISOString(),
      etaHours: Number((etaHours + o.extraDays * 24).toFixed(2)),
      restStops: journey.restStops,
      mandatoryRests: journey.mandatoryRests,
      journeyBreakdownVi: journey.breakdownVi,
      reservationWindow: {
        start: win.start.toISOString(),
        end: new Date(win.end.getTime() + o.extraDays * 24 * HOUR).toISOString(),
      },
      warnings: [...shift.warnings, ...(o.optionCode === 'split_days' ? ['SPLIT_DAYS_DELAYED_DELIVERY'] : [])],
      freight: { lines, subtotal: calc.subtotal, rounding: calc.rounding, total },
    };
  }

  private async isForeignDestination(destination: { lat: number; lng: number; country?: string }): Promise<boolean> {
    if (destination.country) return !/viet\s*nam|việt\s*nam/i.test(destination.country);
    const own = await this.store.findActiveDepots('own');
    const nearestOwn = Math.min(Infinity, ...own.map((d) => haversineKm(destination, { lat: d.lat, lng: d.lng })));
    return nearestOwn > PARTNER_MAX_KM;
  }
}
