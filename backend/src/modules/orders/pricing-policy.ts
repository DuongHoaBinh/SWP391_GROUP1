import { BadRequestException } from '@nestjs/common';

export interface DistanceTier {
  upToKm: number | null;
  pricePerKm: number;
}

export interface RoadTariff {
  openingFeePerVehicle: number;
  distanceTiers: DistanceTier[];
  careFeePerHorse: number;
  deadheadPerKm: number;
  nightSurchargePerVehicle: number;
  borderCrossingFee: number;
  roundingUnit: number;
  averageSpeedKmh: number;
}

export interface AirTariff {
  baseFeePerHorse: number;
  pricePerKmPerHorse: number;
  airportHandlingPerHorse: number;
  privateStallMultiplier: number;
  roundingUnit: number;
  averageSpeedKmh: number;
}

export interface SeaTariff {
  ferry: { ticketPerVehicle: number };
  vessel: { baseFeePerHorse: number; pricePerKmPerHorse: number };
  roundingUnit: number;
}

export interface VehicleOptionInput {
  classCode: string;
  className?: string;
  priceCoefficient: number;
  capacity: number;
  deadheadKm: number;
}

export interface HorseQuoteInput {
  horseId: number;
  quantity: number;
  requiresPrivateStall: boolean;
}

export interface RoadLegInput {
  key: 'main' | 'to_hub' | 'from_hub';
  distanceKm: number;
  borderCrossings: number;
}

export interface FreightInput {
  mode: 'road' | 'air' | 'sea';
  seaMode?: 'ferry' | 'vessel';
  horses: HorseQuoteInput[];
  vehicles: VehicleOptionInput[];
  roadLegs: RoadLegInput[];
  airKm?: number;
  seaKm?: number;
  nightPickup?: boolean;
  /** Step 9: chạy rỗng từ trạm đối tác đến sân bay/cảng đến (chặng from_hub). Mặc định 0. */
  fromHubDeadheadKm?: number;
}

export interface FreightLine {
  code: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  meta?: Record<string, unknown>;
}

export interface FreightResult {
  lines: FreightLine[];
  subtotal: number;
  rounding: number;
  total: number;
  tariffVersions: Record<string, number>;
  warnings: string[];
}

/**
 * Validate cấu hình bảng giá params JSON theo từng mode.
 */
export function validateTariffParams(mode: 'road' | 'air' | 'sea', params: any): void {
  if (!params || typeof params !== 'object') {
    throw new BadRequestException('Tham số bảng giá (params) phải là JSON object');
  }

  const validRounding = [1, 100, 1000, 10000];
  if (!validRounding.includes(params.roundingUnit)) {
    throw new BadRequestException('roundingUnit phải thuộc một trong các giá trị: 1, 100, 1000, 10000');
  }

  if (mode === 'road') {
    if (!Number.isFinite(params.openingFeePerVehicle) || params.openingFeePerVehicle < 0) {
      throw new BadRequestException('openingFeePerVehicle phải là số không âm');
    }
    if (!Number.isFinite(params.careFeePerHorse) || params.careFeePerHorse < 0) {
      throw new BadRequestException('careFeePerHorse phải là số không âm');
    }
    if (!Number.isFinite(params.deadheadPerKm) || params.deadheadPerKm < 0) {
      throw new BadRequestException('deadheadPerKm phải là số không âm');
    }
    if (!Number.isFinite(params.nightSurchargePerVehicle) || params.nightSurchargePerVehicle < 0) {
      throw new BadRequestException('nightSurchargePerVehicle phải là số không âm');
    }
    if (!Number.isFinite(params.borderCrossingFee) || params.borderCrossingFee < 0) {
      throw new BadRequestException('borderCrossingFee phải là số không âm');
    }
    if (!Number.isFinite(params.averageSpeedKmh) || params.averageSpeedKmh <= 0) {
      throw new BadRequestException('averageSpeedKmh phải là số dương');
    }

    if (!Array.isArray(params.distanceTiers) || params.distanceTiers.length === 0) {
      throw new BadRequestException('distanceTiers phải là mảng ít nhất 1 bậc cước');
    }

    let prevLimit = 0;
    for (let i = 0; i < params.distanceTiers.length; i++) {
      const tier = params.distanceTiers[i];
      if (!Number.isFinite(tier.pricePerKm) || tier.pricePerKm <= 0) {
        throw new BadRequestException(`Bậc ${i + 1}: pricePerKm phải là số dương`);
      }
      if (i === params.distanceTiers.length - 1) {
        if (tier.upToKm !== null) {
          throw new BadRequestException('Bậc cước cuối cùng phải có upToKm là null (áp dụng cho mọi km còn lại)');
        }
      } else {
        if (!Number.isFinite(tier.upToKm) || tier.upToKm <= prevLimit) {
          throw new BadRequestException(
            `Bậc ${i + 1}: upToKm phải là số dương tăng dần nghiêm ngặt (lớn hơn bậc trước ${prevLimit})`,
          );
        }
        prevLimit = tier.upToKm;
      }
    }
  } else if (mode === 'air') {
    if (!Number.isFinite(params.baseFeePerHorse) || params.baseFeePerHorse < 0) {
      throw new BadRequestException('baseFeePerHorse phải là số không âm');
    }
    if (!Number.isFinite(params.pricePerKmPerHorse) || params.pricePerKmPerHorse < 0) {
      throw new BadRequestException('pricePerKmPerHorse phải là số không âm');
    }
    if (!Number.isFinite(params.airportHandlingPerHorse) || params.airportHandlingPerHorse < 0) {
      throw new BadRequestException('airportHandlingPerHorse phải là số không âm');
    }
    if (
      !Number.isFinite(params.privateStallMultiplier) ||
      params.privateStallMultiplier < 1 ||
      params.privateStallMultiplier > 3
    ) {
      throw new BadRequestException('privateStallMultiplier phải nằm trong khoảng [1, 3]');
    }
    if (!Number.isFinite(params.averageSpeedKmh) || params.averageSpeedKmh <= 0) {
      throw new BadRequestException('averageSpeedKmh phải là số dương');
    }
  } else if (mode === 'sea') {
    if (!params.ferry || typeof params.ferry !== 'object') {
      throw new BadRequestException('Cấu hình đường thủy thiếu mục ferry');
    }
    if (!Number.isFinite(params.ferry.ticketPerVehicle) || params.ferry.ticketPerVehicle < 0) {
      throw new BadRequestException('ferry.ticketPerVehicle phải là số không âm');
    }
    if (!params.vessel || typeof params.vessel !== 'object') {
      throw new BadRequestException('Cấu hình đường thủy thiếu mục vessel');
    }
    if (!Number.isFinite(params.vessel.baseFeePerHorse) || params.vessel.baseFeePerHorse < 0) {
      throw new BadRequestException('vessel.baseFeePerHorse phải là số không âm');
    }
    if (!Number.isFinite(params.vessel.pricePerKmPerHorse) || params.vessel.pricePerKmPerHorse < 0) {
      throw new BadRequestException('vessel.pricePerKmPerHorse phải là số không âm');
    }
  } else {
    throw new BadRequestException(`Phương thức vận chuyển không hợp lệ: ${mode}`);
  }
}

/**
 * Tính chi phí km theo bậc lũy tiến (marginal tiers) giống thuế thu nhập.
 */
export function tieredDistanceCost(km: number, tiers: DistanceTier[]): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  let remaining = km;
  let prevLimit = 0;
  let cost = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierLimit = tier.upToKm;
    if (tierLimit === null) {
      cost += remaining * tier.pricePerKm;
      remaining = 0;
    } else {
      const span = tierLimit - prevLimit;
      const kmInTier = Math.min(remaining, span);
      cost += kmInTier * tier.pricePerKm;
      remaining -= kmInTier;
      prevLimit = tierLimit;
    }
  }
  return Math.round(cost);
}

/**
 * Tính cước cho các chặng đường bộ (road legs)
 */
function appendRoadLegFreight(
  lines: FreightLine[],
  legKey: 'main' | 'to_hub' | 'from_hub',
  distanceKm: number,
  borderCrossings: number,
  vehicles: VehicleOptionInput[],
  tariff: RoadTariff,
  horseCount: number,
  includeCareFee: boolean,
  nightPickup: boolean,
): void {
  const legPrefix =
    legKey === 'main'
      ? ''
      : legKey === 'to_hub'
        ? '[Chặng ra Hub] '
        : '[Chặng từ Hub] ';

  for (let idx = 0; idx < vehicles.length; idx++) {
    const v = vehicles[idx];
    const vehicleLabel = v.className || v.classCode;
    const vehicleSuffix = vehicles.length > 1 ? ` (Xe #${idx + 1}: ${vehicleLabel})` : ` — ${vehicleLabel}`;

    // 1. Phí mở chuyến
    if (tariff.openingFeePerVehicle > 0) {
      const openingAmount = Math.round(tariff.openingFeePerVehicle);
      lines.push({
        code: `${legKey}_vehicle_${idx + 1}_opening`,
        label: `${legPrefix}Phí mở chuyến${vehicleSuffix}`,
        quantity: 1,
        unit: 'xe',
        unitPrice: openingAmount,
        amount: openingAmount,
        meta: { legKey, vehicleIndex: idx, classCode: v.classCode },
      });
    }

    // 2. Cước km theo bậc × hệ số loại xe
    const baseDistanceCost = tieredDistanceCost(distanceKm, tariff.distanceTiers);
    const distanceAmount = Math.round(baseDistanceCost * (v.priceCoefficient || 1.0));
    lines.push({
      code: `${legKey}_vehicle_${idx + 1}_distance`,
      label: `${legPrefix}Cước vận chuyển (${distanceKm.toFixed(1)} km × hệ số ${(v.priceCoefficient || 1.0).toFixed(2)})${vehicleSuffix}`,
      quantity: 1,
      unit: 'xe',
      unitPrice: distanceAmount,
      amount: distanceAmount,
      meta: {
        legKey,
        vehicleIndex: idx,
        classCode: v.classCode,
        distanceKm,
        priceCoefficient: v.priceCoefficient,
      },
    });

    // 3. Chạy rỗng từ trạm đến điểm đón
    if (v.deadheadKm > 0 && tariff.deadheadPerKm > 0) {
      const deadheadAmount = Math.round(v.deadheadKm * tariff.deadheadPerKm);
      lines.push({
        code: `${legKey}_vehicle_${idx + 1}_deadhead`,
        label: `${legPrefix}Phí điều xe chạy rỗng (${v.deadheadKm.toFixed(1)} km)${vehicleSuffix}`,
        quantity: 1,
        unit: 'xe',
        unitPrice: deadheadAmount,
        amount: deadheadAmount,
        meta: { legKey, vehicleIndex: idx, classCode: v.classCode, deadheadKm: v.deadheadKm },
      });
    }

    // 4. Phụ phí ca đêm
    if (nightPickup && tariff.nightSurchargePerVehicle > 0) {
      const nightAmount = Math.round(tariff.nightSurchargePerVehicle);
      lines.push({
        code: `${legKey}_vehicle_${idx + 1}_night`,
        label: `${legPrefix}Phụ phí ca đêm${vehicleSuffix}`,
        quantity: 1,
        unit: 'xe',
        unitPrice: nightAmount,
        amount: nightAmount,
        meta: { legKey, vehicleIndex: idx },
      });
    }
  }

  // Phụ phí chăm sóc, bốc xếp
  if (includeCareFee && horseCount > 0 && tariff.careFeePerHorse > 0) {
    const careAmount = Math.round(horseCount * tariff.careFeePerHorse);
    lines.push({
      code: `${legKey}_care_fee`,
      label: `${legPrefix}Phụ phí chăm sóc, bốc xếp (${horseCount} con ngựa)`,
      quantity: horseCount,
      unit: 'ngựa',
      unitPrice: tariff.careFeePerHorse,
      amount: careAmount,
      meta: { horseCount },
    });
  }

  // Phí qua cửa khẩu
  if (borderCrossings > 0 && tariff.borderCrossingFee > 0) {
    const borderAmount = Math.round(borderCrossings * tariff.borderCrossingFee);
    lines.push({
      code: `${legKey}_border_crossing`,
      label: `${legPrefix}Phí qua cửa khẩu đường bộ (${borderCrossings} cửa khẩu)`,
      quantity: borderCrossings,
      unit: 'cửa khẩu',
      unitPrice: tariff.borderCrossingFee,
      amount: borderAmount,
      meta: { borderCrossings },
    });
  }
}

/**
 * Hàm thuần tính toán cước vận tải (Freight Calculation)
 */
export function calculateFreight(
  input: FreightInput,
  tariffs: {
    road: RoadTariff & { version?: number };
    air?: AirTariff & { version?: number };
    sea?: SeaTariff & { version?: number };
    /** Step 9: bảng giá trạm đối tác nước ngoài (region PARTNER) cho chặng from_hub của air/sea */
    partnerRoad?: RoadTariff & { version?: number };
  },
): FreightResult {
  if (!input.horses || input.horses.length === 0) {
    throw new BadRequestException('Danh sách ngựa không được để trống');
  }
  const totalHorseCount = input.horses.reduce((sum, h) => sum + (h.quantity || 1), 0);
  if (totalHorseCount <= 0) {
    throw new BadRequestException('Số lượng ngựa phải lớn hơn 0');
  }

  if (!input.vehicles || input.vehicles.length === 0) {
    throw new BadRequestException('Phương án phương tiện không được để trống');
  }

  const lines: FreightLine[] = [];
  const warnings: string[] = [];
  const tariffVersions: Record<string, number> = {};

  if (tariffs.road?.version) tariffVersions.road = tariffs.road.version;
  if (tariffs.air?.version) tariffVersions.air = tariffs.air.version;
  if (tariffs.sea?.version) tariffVersions.sea = tariffs.sea.version;
  if (tariffs.partnerRoad?.version) tariffVersions.partnerRoad = tariffs.partnerRoad.version;
  const fromHubTariff = tariffs.partnerRoad ?? tariffs.road;
  const fromHubDeadheadKm = Math.max(0, Number(input.fromHubDeadheadKm) || 0);

  const roundingUnit =
    input.mode === 'air'
      ? tariffs.air?.roundingUnit ?? 1000
      : input.mode === 'sea'
        ? tariffs.sea?.roundingUnit ?? 1000
        : tariffs.road.roundingUnit ?? 1000;

  if (input.mode === 'road') {
    if (!tariffs.road) throw new BadRequestException('Thiếu cấu hình bảng giá đường bộ');
    const mainLeg = input.roadLegs.find((l) => l.key === 'main') || input.roadLegs[0];
    if (!mainLeg || mainLeg.distanceKm < 0) {
      throw new BadRequestException('Chặng đường bộ không hợp lệ');
    }

    appendRoadLegFreight(
      lines,
      'main',
      mainLeg.distanceKm,
      mainLeg.borderCrossings || 0,
      input.vehicles,
      tariffs.road,
      totalHorseCount,
      true,
      Boolean(input.nightPickup),
    );
  } else if (input.mode === 'air') {
    if (!tariffs.air) throw new BadRequestException('Thiếu cấu hình bảng giá đường hàng không');
    if (!tariffs.road) throw new BadRequestException('Thiếu cấu hình bảng giá đường bộ kết nối sân bay');
    if (!Number.isFinite(input.airKm) || (input.airKm ?? 0) < 0) {
      throw new BadRequestException('Khoảng cách bay không hợp lệ');
    }

    const airKm = input.airKm || 0;
    const airTariff = tariffs.air;

    // Tính phần bay cho từng con ngựa
    for (const h of input.horses) {
      const qty = h.quantity || 1;
      const baseFee = airTariff.baseFeePerHorse;
      const kmFee = airKm * airTariff.pricePerKmPerHorse;
      let flightPart = baseFee + kmFee;

      // Quyết định C3: Ngựa cần chuồng riêng chỉ nhân phần bay, KHÔNG nhân phí xử lý sân bay
      if (h.requiresPrivateStall) {
        flightPart = flightPart * airTariff.privateStallMultiplier;
      }
      const flightAmount = Math.round(flightPart * qty);
      const handlingAmount = Math.round(airTariff.airportHandlingPerHorse * qty);

      lines.push({
        code: `air_flight_horse_${h.horseId}`,
        label: `Cước chặng bay (${airKm.toFixed(0)} km${h.requiresPrivateStall ? ' — Chuồng riêng ×' + airTariff.privateStallMultiplier : ''}) — Ngựa #${h.horseId}${qty > 1 ? ` (×${qty})` : ''}`,
        quantity: qty,
        unit: 'ngựa',
        unitPrice: Math.round(flightPart),
        amount: flightAmount,
        meta: {
          horseId: h.horseId,
          airKm,
          requiresPrivateStall: h.requiresPrivateStall,
        },
      });

      if (airTariff.airportHandlingPerHorse > 0) {
        lines.push({
          code: `air_handling_horse_${h.horseId}`,
          label: `Phí xử lý sân bay và bốc xếp hàng không — Ngựa #${h.horseId}${qty > 1 ? ` (×${qty})` : ''}`,
          quantity: qty,
          unit: 'ngựa',
          unitPrice: airTariff.airportHandlingPerHorse,
          amount: handlingAmount,
          meta: { horseId: h.horseId },
        });
      }
    }

    // 2 chặng đường bộ: to_hub (ra sân bay đi) và from_hub (từ sân bay đến)
    const toHubLeg = input.roadLegs.find((l) => l.key === 'to_hub');
    const fromHubLeg = input.roadLegs.find((l) => l.key === 'from_hub');

    if (toHubLeg && toHubLeg.distanceKm > 0) {
      appendRoadLegFreight(
        lines,
        'to_hub',
        toHubLeg.distanceKm,
        toHubLeg.borderCrossings || 0,
        input.vehicles,
        tariffs.road,
        totalHorseCount,
        true, // Phí chăm sóc tính 1 lần ở chặng to_hub
        Boolean(input.nightPickup),
      );
    }

    if (fromHubLeg && fromHubLeg.distanceKm > 0) {
      appendRoadLegFreight(
        lines,
        'from_hub',
        fromHubLeg.distanceKm,
        fromHubLeg.borderCrossings || 0,
        input.vehicles.map((v) => ({ ...v, deadheadKm: fromHubDeadheadKm })), // Step 9: xe trạm đối tác gần điểm giao
        fromHubTariff,
        totalHorseCount,
        false, // Không tính careFee lần 2
        false,
      );
    }
  } else if (input.mode === 'sea') {
    if (!tariffs.sea) throw new BadRequestException('Thiếu cấu hình bảng giá đường thủy');
    if (!tariffs.road) throw new BadRequestException('Thiếu cấu hình bảng giá đường bộ kết nối cảng');

    const seaTariff = tariffs.sea;
    if (input.seaMode === 'ferry') {
      // Ferry: xe lên phà, ngựa ở trên xe. Cước bộ tính như 1 chuyến liên tục trên tổng km bộ + vé phà × số xe
      const toHubLeg = input.roadLegs.find((l) => l.key === 'to_hub');
      const fromHubLeg = input.roadLegs.find((l) => l.key === 'from_hub');
      const mainLeg = input.roadLegs.find((l) => l.key === 'main');

      const totalRoadKm =
        (toHubLeg?.distanceKm || 0) +
        (fromHubLeg?.distanceKm || 0) +
        (mainLeg?.distanceKm || 0);

      appendRoadLegFreight(
        lines,
        'main',
        totalRoadKm,
        (toHubLeg?.borderCrossings || 0) + (fromHubLeg?.borderCrossings || 0) + (mainLeg?.borderCrossings || 0),
        input.vehicles,
        tariffs.road,
        totalHorseCount,
        true,
        Boolean(input.nightPickup),
      );

      const ticketCost = Math.round(seaTariff.ferry.ticketPerVehicle * input.vehicles.length);
      lines.push({
        code: 'sea_ferry_tickets',
        label: `Vé phà RoRo chuyên chở xe tải ngựa (${input.vehicles.length} xe)`,
        quantity: input.vehicles.length,
        unit: 'xe',
        unitPrice: seaTariff.ferry.ticketPerVehicle,
        amount: ticketCost,
        meta: { seaMode: 'ferry', vehicleCount: input.vehicles.length },
      });
    } else if (input.seaMode === 'vessel') {
      // Vessel: tàu chở gia súc, ngựa đi ô chuồng
      warnings.push('SEA_VESSEL_HEALTH_RISK');
      const seaKm = input.seaKm || 0;

      for (const h of input.horses) {
        const qty = h.quantity || 1;
        const perHorseVesselCost =
          seaTariff.vessel.baseFeePerHorse + seaKm * seaTariff.vessel.pricePerKmPerHorse;
        const totalVesselCost = Math.round(perHorseVesselCost * qty);

        lines.push({
          code: `sea_vessel_horse_${h.horseId}`,
          label: `Cước ô chuồng vận tải biển (${seaKm.toFixed(0)} km) — Ngựa #${h.horseId}${qty > 1 ? ` (×${qty})` : ''}`,
          quantity: qty,
          unit: 'ngựa',
          unitPrice: Math.round(perHorseVesselCost),
          amount: totalVesselCost,
          meta: { horseId: h.horseId, seaKm },
        });
      }

      // 2 chặng đường bộ ra cảng và từ cảng
      const toHubLeg = input.roadLegs.find((l) => l.key === 'to_hub');
      const fromHubLeg = input.roadLegs.find((l) => l.key === 'from_hub');

      if (toHubLeg && toHubLeg.distanceKm > 0) {
        appendRoadLegFreight(
          lines,
          'to_hub',
          toHubLeg.distanceKm,
          toHubLeg.borderCrossings || 0,
          input.vehicles,
          tariffs.road,
          totalHorseCount,
          true,
          Boolean(input.nightPickup),
        );
      }

      if (fromHubLeg && fromHubLeg.distanceKm > 0) {
        appendRoadLegFreight(
          lines,
          'from_hub',
          fromHubLeg.distanceKm,
          fromHubLeg.borderCrossings || 0,
          input.vehicles.map((v) => ({ ...v, deadheadKm: fromHubDeadheadKm })),
          fromHubTariff,
          totalHorseCount,
          false,
          false,
        );
      }
    } else {
      throw new BadRequestException('Phương thức đường thủy phải chọn ferry (phà RoRo) hoặc vessel (tàu biển)');
    }
  }

  // Tính tổng và làm tròn
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const total = Math.ceil(subtotal / roundingUnit) * roundingUnit;
  const rounding = total - subtotal;

  if (rounding > 0) {
    lines.push({
      code: 'rounding',
      label: 'Làm tròn theo đơn vị bảng giá',
      quantity: 1,
      unit: 'đơn',
      unitPrice: rounding,
      amount: rounding,
      meta: { roundingUnit },
    });
  }

  return {
    lines,
    subtotal,
    rounding,
    total,
    tariffVersions,
    warnings,
  };
}
