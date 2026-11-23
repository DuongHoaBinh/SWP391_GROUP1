export type BookingType = 'shared_stall' | 'dedicated_charter';
export const bookingNames: Record<BookingType, string> = {
  shared_stall: 'Ghép ô chuồng (Shared Stall)',
  dedicated_charter: 'Bao nguyên xe / Bao chuyến (Dedicated Charter)',
};
export function bookingName(value?: BookingType) { return bookingNames[value ?? 'dedicated_charter']; }

export function previewBookingQuote(
  input: string,
  type: BookingType,
  count: number,
  currency: 'VND' | 'USD' = 'VND',
  usdToVndRate = 25400,
) {
  const value = Number(input);
  const safeRate = Number.isFinite(usdToVndRate) && usdToVndRate > 0 ? usdToVndRate : 25400;
  const unit = currency === 'USD' ? Math.round(value * safeRate) : value;
  const freight = type === 'shared_stall' ? unit * count : unit;
  const valid = input.trim() !== '' && Number.isFinite(value) && Number.isSafeInteger(unit) && unit > 0 &&
    Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(freight) && freight <= 9999999999999;
  return { unit: valid ? unit : 0, freight: valid ? freight : 0, error: valid ? null : 'Vui lòng nhập giá VNĐ nguyên dương hợp lệ, tổng cước không vượt giới hạn đơn hàng.' };
}

export function bookingQuotePayload(
  input: string,
  type: BookingType,
  count: number,
  currency: 'VND' | 'USD',
  usdToVndRate = 25400,
) {
  const quote = previewBookingQuote(input, type, count, currency, usdToVndRate);
  if (quote.error) throw new Error(quote.error);
  return { bookingType: type, quotedHorseCount: count,
    ...(type === 'shared_stall' ? { stallUnitPrice: quote.unit } : { transportCost: quote.freight }) };
}

export interface FreightSuggestionLineItem {
  labelVi: string;
  labelEn: string;
  amountVnd: number;
}

export interface ManagerFreightSuggestion {
  transportMode: 'road' | 'air';
  bookingType: BookingType;
  horseCount: number;
  distanceKm: number;
  customsCount: number;
  capacityBlockLabelVi: string;
  capacityBlockLabelEn: string;
  /** Value to prefill into the Manager's input box (per-stall unit price for shared_stall, flat total freight for dedicated_charter) */
  suggestedInputVnd: number;
  suggestedInputUsd: number;
  /** Suggested per-stall unit price in VND (null for dedicated_charter) */
  suggestedUnitVnd: number | null;
  /** Total base transport freight in VND (before insurance) */
  suggestedTotalFreightVnd: number;
  /** Suggested internal operating cost in VND */
  suggestedOperatingCostVnd: number;
  /** Estimated gross margin percentage */
  estimatedMarginPct: number;
  /** Total freight under the opposite booking type on the same route & transport mode */
  alternateBookingFreightVnd: number;
  breakdown: FreightSuggestionLineItem[];
}

function roundTo100k(val: number): number {
  return Math.max(100_000, Math.round(val / 100_000) * 100_000);
}

function computeModeFreightCore(
  transportMode: 'road' | 'air',
  bookingType: BookingType,
  safeCount: number,
  safeKm: number,
  safeCustoms: number,
): {
  unitVnd: number | null;
  totalFreightVnd: number;
  operatingCostVnd: number;
  capacityBlockLabelVi: string;
  capacityBlockLabelEn: string;
  breakdown: FreightSuggestionLineItem[];
} {
  const checkpoints = Math.max(1, safeCustoms);

  if (transportMode === 'road' && bookingType === 'shared_stall') {
    const dispatchPerStall = 3_500_000;
    const distancePerStall = roundTo100k(safeKm * 12_000);
    const checkpointPerStall = checkpoints * 1_000_000;
    const unitVnd = dispatchPerStall + distancePerStall + checkpointPerStall;
    const totalFreightVnd = unitVnd * safeCount;
    const operatingCostVnd = roundTo100k(totalFreightVnd * 0.66);

    return {
      unitVnd,
      totalFreightVnd,
      operatingCostVnd,
      capacityBlockLabelVi: `Ghép ${safeCount} ô chuồng trên xe chuyên dụng 6 chuồng (Chia sẻ chi phí tuyến)`,
      capacityBlockLabelEn: `Shared ${safeCount} stall(s) on a 6-stall equine truck (Corridor cost-sharing)`,
      breakdown: [
        {
          labelVi: 'Phí xuất bến, vệ sinh khử trùng & đệm chuồng (1 ô)',
          labelEn: 'Dispatch, stall sanitization & bedding (per stall)',
          amountVnd: dispatchPerStall,
        },
        {
          labelVi: `Cước vận hành đường bộ chia sẻ (${safeKm.toLocaleString('vi-VN')} km × 12.000 ₫/km/ô)`,
          labelEn: `Shared road distance tariff (${safeKm.toLocaleString('en-US')} km × 12,000 VND/km/stall)`,
          amountVnd: distancePerStall,
        },
        {
          labelVi: `Phí trạm dừng nghỉ & kiểm dịch dọc tuyến (${checkpoints} trạm/ô)`,
          labelEn: `Rest stop & veterinary checkpoint fee (${checkpoints} stop(s)/stall)`,
          amountVnd: checkpointPerStall,
        },
      ],
    };
  }

  if (transportMode === 'road' && bookingType === 'dedicated_charter') {
    const isHeavyTruck = safeCount >= 4;
    const baseCharter = isHeavyTruck ? 18_000_000 : 12_000_000;
    const perKmCharter = isHeavyTruck ? 42_000 : 32_000;
    const distanceCharter = roundTo100k(safeKm * perKmCharter);
    const horseCareFee = safeCount * 1_500_000;
    const checkpointCharter = checkpoints * 1_500_000;
    const totalFreightVnd = baseCharter + distanceCharter + horseCareFee + checkpointCharter;
    const operatingCostVnd = roundTo100k(totalFreightVnd * 0.68);

    return {
      unitVnd: null,
      totalFreightVnd,
      operatingCostVnd,
      capacityBlockLabelVi: isHeavyTruck
        ? `Bao độc quyền Xe tải hạng nặng điều hòa 6–8 Stall (Chạy thẳng cho đoàn ${safeCount} ngựa)`
        : `Bao độc quyền Xe thùng chuyên dụng 2–4 Stall (Chạy thẳng riêng cho ${safeCount} ngựa)`,
      capacityBlockLabelEn: isHeavyTruck
        ? `Dedicated 6–8 Stall Heavy Climate Truck Charter (${safeCount} horses, direct dispatch)`
        : `Dedicated 2–4 Stall Specialized Van/Truck Charter (${safeCount} horse(s), direct dispatch)`,
      breakdown: [
        {
          labelVi: isHeavyTruck
            ? 'Phí điều động độc quyền nguyên xe tải hạng nặng 6–8 Stall'
            : 'Phí điều động độc quyền nguyên xe chuyên dụng 2–4 Stall',
          labelEn: isHeavyTruck
            ? 'Exclusive charter base fee (6–8 Stall Heavy Equine Truck)'
            : 'Exclusive charter base fee (2–4 Stall Equine Truck)',
          amountVnd: baseCharter,
        },
        {
          labelVi: `Cước chạy thẳng nguyên xe (${safeKm.toLocaleString('vi-VN')} km × ${perKmCharter.toLocaleString('vi-VN')} ₫/km)`,
          labelEn: `Dedicated direct mileage (${safeKm.toLocaleString('en-US')} km × ${perKmCharter.toLocaleString('en-US')} VND/km)`,
          amountVnd: distanceCharter,
        },
        {
          labelVi: `Chăm sóc điện giải, cỏ Timothy & trạm kiểm dịch (${safeCount} ngựa · ${checkpoints} trạm)`,
          labelEn: `Electrolytes, Timothy hay & checkpoint clearance (${safeCount} horse(s) · ${checkpoints} stop(s))`,
          amountVnd: horseCareFee + checkpointCharter,
        },
      ],
    };
  }

  if (transportMode === 'air' && bookingType === 'shared_stall') {
    const airportTransferAndHandling = 18_000_000;
    const airDistancePerStall = roundTo100k(safeKm * 22_000);
    const airQuarantineAndSharedVet = checkpoints * 6_000_000;
    const unitVnd = airportTransferAndHandling + airDistancePerStall + airQuarantineAndSharedVet;
    const totalFreightVnd = unitVnd * safeCount;
    const operatingCostVnd = roundTo100k(totalFreightVnd * 0.72);

    return {
      unitVnd,
      totalFreightVnd,
      operatingCostVnd,
      capacityBlockLabelVi: `Ghép ${safeCount} ô bay trong lồng Jet Stall 3 ngăn (Chia sẻ Pallet Cargo & Bác sĩ hộ tống)`,
      capacityBlockLabelEn: `Shared ${safeCount} air stall(s) in a 3-stall Jet Stall (Shared Air Pallet & Flying Vet)`,
      breakdown: [
        {
          labelVi: 'Xe thùng trung chuyển ra sân bay & Phí phục vụ mặt đất (Cargo Handling / 1 ô)',
          labelEn: 'Airport truck transfer & ground cargo ramp handling (per stall)',
          amountVnd: airportTransferAndHandling,
        },
        {
          labelVi: `Cước bay Cargo động vật sống (${safeKm.toLocaleString('vi-VN')} km × 22.000 ₫/km/ô)`,
          labelEn: `Live-animal air cargo mileage (${safeKm.toLocaleString('en-US')} km × 22,000 VND/km/stall)`,
          amountVnd: airDistancePerStall,
        },
        {
          labelVi: `Phí kiểm dịch sân bay & Chia sẻ Bác sĩ thú y hộ tống bay (${checkpoints} trạm/ô)`,
          labelEn: `Airport quarantine & shared in-flight veterinary escort (${checkpoints} gate(s)/stall)`,
          amountVnd: airQuarantineAndSharedVet,
        },
      ],
    };
  }

  // Air + Dedicated Charter
  const palletCount = Math.max(1, Math.ceil(safeCount / 3));
  const palletAndPrivateTruckBase = palletCount * 55_000_000;
  const charterAirDistance = roundTo100k(safeKm * 60_000 * palletCount);
  const dedicatedVetAndPriorityCustoms = 15_000_000 + checkpoints * 5_000_000 + safeCount * 3_000_000;
  const totalFreightVnd = palletAndPrivateTruckBase + charterAirDistance + dedicatedVetAndPriorityCustoms;
  const operatingCostVnd = roundTo100k(totalFreightVnd * 0.74);

  return {
    unitVnd: null,
    totalFreightVnd,
    operatingCostVnd,
    capacityBlockLabelVi: `Bao trọn ${palletCount} cụm Air Pallet Jet Stall độc quyền (${palletCount * 3} ngăn) + Xe trung chuyển riêng & Bác sĩ thú y áp tải riêng`,
    capacityBlockLabelEn: `Exclusive ${palletCount} Air Pallet Jet Stall Charter (${palletCount * 3} stalls) + Private Airport Truck & Dedicated Flying Vet`,
    breakdown: [
      {
        labelVi: `Thuê độc quyền ${palletCount} cụm Air Pallet Jet Stall (${palletCount * 3} ngăn) & Xe tải riêng ra sân bay`,
        labelEn: `Exclusive ${palletCount} Air Pallet Jet Stall block (${palletCount * 3} stalls) & private airport truck`,
        amountVnd: palletAndPrivateTruckBase,
      },
      {
        labelVi: `Cước bay Charter theo khoang (${safeKm.toLocaleString('vi-VN')} km × ${(60_000 * palletCount).toLocaleString('vi-VN')} ₫/km)`,
        labelEn: `Dedicated air pallet flight tariff (${safeKm.toLocaleString('en-US')} km × ${(60_000 * palletCount).toLocaleString('en-US')} VND/km)`,
        amountVnd: charterAirDistance,
      },
      {
        labelVi: `Bác sĩ thú y áp tải riêng 100% + Thông quan ưu tiên (${checkpoints} cửa khẩu · ${safeCount} ngựa)`,
        labelEn: `Dedicated in-flight Vet Escort + Priority customs clearance (${checkpoints} gate(s) · ${safeCount} horse(s))`,
        amountVnd: dedicatedVetAndPriorityCustoms,
      },
    ],
  };
}

export function suggestManagerFreightQuote(params: {
  transportMode?: 'road' | 'air' | null;
  bookingType?: BookingType | null;
  horseCount?: number | null;
  distanceKm?: number | null;
  customsCount?: number | null;
  usdToVndRate?: number | null;
}): ManagerFreightSuggestion {
  const mode: 'road' | 'air' = params.transportMode === 'air' ? 'air' : 'road';
  const type: BookingType = params.bookingType === 'dedicated_charter' ? 'dedicated_charter' : 'shared_stall';
  const safeCount = Math.max(1, Math.round(Number(params.horseCount) || 1));
  const safeKm = Math.max(30, Math.round(Number(params.distanceKm) || 350));
  const safeCustoms = Math.max(0, Math.round(Number(params.customsCount) || 0));
  const safeRate =
    Number.isFinite(Number(params.usdToVndRate)) && Number(params.usdToVndRate) > 0
      ? Number(params.usdToVndRate)
      : 25400;

  const primary = computeModeFreightCore(mode, type, safeCount, safeKm, safeCustoms);
  const oppositeType: BookingType = type === 'shared_stall' ? 'dedicated_charter' : 'shared_stall';
  const alternate = computeModeFreightCore(mode, oppositeType, safeCount, safeKm, safeCustoms);

  const suggestedInputVnd =
    type === 'shared_stall' ? (primary.unitVnd ?? primary.totalFreightVnd) : primary.totalFreightVnd;
  const suggestedInputUsd = Math.round((suggestedInputVnd / safeRate) * 100) / 100;
  const estimatedMarginPct =
    primary.totalFreightVnd > 0
      ? Math.round(((primary.totalFreightVnd - primary.operatingCostVnd) / primary.totalFreightVnd) * 100)
      : 28;

  return {
    transportMode: mode,
    bookingType: type,
    horseCount: safeCount,
    distanceKm: safeKm,
    customsCount: safeCustoms,
    capacityBlockLabelVi: primary.capacityBlockLabelVi,
    capacityBlockLabelEn: primary.capacityBlockLabelEn,
    suggestedInputVnd,
    suggestedInputUsd,
    suggestedUnitVnd: primary.unitVnd,
    suggestedTotalFreightVnd: primary.totalFreightVnd,
    suggestedOperatingCostVnd: primary.operatingCostVnd,
    estimatedMarginPct,
    alternateBookingFreightVnd: alternate.totalFreightVnd,
    breakdown: primary.breakdown,
  };
}
