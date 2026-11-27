/**
 * Phân bổ xe cho một đơn (Step 9, review 11/2026). Hàm thuần, không truy cập DB.
 *
 * Trả lời góp ý G11 "3 ngựa mà xe chỉ chở 1 thì sao": hệ thống tự đề xuất các phương án
 * (1 xe lớn, nhiều xe nhỏ, chia nhiều lượt/ngày, ghép xe 2 trạm) kèm giá từng phương án.
 */

export interface AllocationVehicle {
  vehicleId: number;
  plate: string;
  classCode: string;
  className?: string;
  capacity: number;
  priceCoefficient: number;
  isHeavyTruck: boolean;
}

/** Một trạm với các xe RẢNH trong khung giờ chuyến. */
export interface AllocationDepot {
  depotId: number;
  depotName: string;
  deadheadKm: number;
  vehicles: AllocationVehicle[];
}

export type PricedVehicle = AllocationVehicle & { deadheadKm: number };

export interface AllocationInput {
  /** computeRequiredStallSlots (Step 3): ngựa cần chuồng riêng tính 2 chỗ */
  requiredSlots: number;
  horseCount: number;
  /** Đã sắp gần → xa theo deadheadKm */
  depots: AllocationDepot[];
  /** Gọi pricing-policy để ra tổng cước của một tập xe (mỗi phần tử = một xe chạy một lượt) */
  priceVehicleSet: (vehicles: PricedVehicle[]) => number;
  /** Chi phí chạy rỗng quay đầu giữa hai lượt của phương án chia ngày (mặc định 0) */
  turnaroundCost?: (vehicle: PricedVehicle) => number;
  maxVehiclesPerOption?: number;
  maxSplitTrips?: number;
}

export type AllocationOptionCode = 'cheapest' | 'fewest_vehicles' | 'earliest' | 'split_days' | 'two_depots';

export interface AllocationOptionVehicle extends AllocationVehicle {
  depotId: number;
  depotName: string;
  deadheadKm: number;
  trips: number;
}

export interface AllocationOption {
  optionCode: AllocationOptionCode;
  labelVi: string;
  vehicles: AllocationOptionVehicle[];
  totalFreight: number;
  maxDeadheadKm: number;
  extraDays: number;
}

export interface AllocationResult {
  options: AllocationOption[];
  recommended: string | null;
  shortageSlots: number;
}

const LABELS_VI: Record<AllocationOptionCode, string> = {
  cheapest: 'Rẻ nhất',
  fewest_vehicles: 'Ít xe nhất',
  earliest: 'Đến sớm nhất',
  split_days: 'Chia nhiều ngày',
  two_depots: 'Ghép xe 2 trạm',
};

interface Candidate {
  vehicles: AllocationOptionVehicle[];
  totalFreight: number;
  maxDeadheadKm: number;
  extraDays: number;
}

type SourceVehicle = AllocationVehicle & { depotId: number; depotName: string; deadheadKm: number };

/**
 * Liệt kê các tổ hợp xe TỐI THIỂU có tổng sức chứa >= requiredSlots
 * (tối thiểu = bỏ bất kỳ xe nào thì không còn đủ chỗ).
 * Chống nổ tổ hợp: xe cùng trạm + cùng loại + cùng sức chứa/hệ số được coi là tương đương,
 * nên chỉ duyệt "số lượng xe mỗi nhóm" thay vì mọi tập con xe.
 */
export function minimalVehicleCombos(vehicles: SourceVehicle[], requiredSlots: number, maxVehicles: number): SourceVehicle[][] {
  const groupMap = new Map<string, SourceVehicle[]>();
  for (const v of [...vehicles].sort((a, b) => a.vehicleId - b.vehicleId)) {
    if (!(v.capacity > 0)) continue;
    const key = `${v.depotId}|${v.classCode}|${v.capacity}|${v.priceCoefficient}|${v.isHeavyTruck ? 1 : 0}`;
    const list = groupMap.get(key) ?? [];
    list.push(v);
    groupMap.set(key, list);
  }
  const groups = [...groupMap.values()];
  const results: SourceVehicle[][] = [];
  const counts = new Array(groups.length).fill(0);

  const visit = (idx: number, used: number, capacity: number) => {
    if (idx === groups.length) {
      if (used === 0 || capacity < requiredSlots) return;
      // Tối thiểu: bỏ xe nhỏ nhất đang dùng vẫn thiếu chỗ
      let minCap = Infinity;
      groups.forEach((g, i) => { if (counts[i] > 0) minCap = Math.min(minCap, g[0].capacity); });
      if (capacity - minCap >= requiredSlots) return;
      results.push(groups.flatMap((g, i) => g.slice(0, counts[i])));
      return;
    }
    const group = groups[idx];
    for (let k = 0; k <= group.length && used + k <= maxVehicles; k++) {
      counts[idx] = k;
      visit(idx + 1, used + k, capacity + k * group[0].capacity);
    }
    counts[idx] = 0;
  };
  visit(0, 0, 0);
  return results;
}

function vehicleSetKey(vehicles: AllocationOptionVehicle[]): string {
  return vehicles.map((v) => `${v.vehicleId}x${v.trips}`).sort().join(',');
}

function toCandidate(set: SourceVehicle[], input: AllocationInput): Candidate {
  const vehicles = set.map((v) => ({ ...v, trips: 1 }));
  return {
    vehicles,
    totalFreight: input.priceVehicleSet(set.map((v) => ({ ...v }))),
    maxDeadheadKm: Math.max(0, ...set.map((v) => v.deadheadKm)),
    extraDays: 0,
  };
}

function pickBest(cands: Candidate[], better: (a: Candidate, b: Candidate) => number): Candidate | undefined {
  return [...cands].sort(better)[0];
}

export function generateAllocationOptions(input: AllocationInput): AllocationResult {
  const required = Math.max(1, Math.floor(input.requiredSlots));
  const maxVehicles = input.maxVehiclesPerOption ?? 4;
  const maxSplitTrips = input.maxSplitTrips ?? 4;
  const depots = [...input.depots]
    .filter((d) => d.vehicles.length > 0)
    .sort((a, b) => a.deadheadKm - b.deadheadKm);
  const withDepot = (d: AllocationDepot): SourceVehicle[] =>
    d.vehicles.map((v) => ({ ...v, depotId: d.depotId, depotName: d.depotName, deadheadKm: d.deadheadKm }));

  // Bước 1: tổ hợp tối thiểu trong từng trạm (gần → xa)
  const singleDepot: Candidate[] = [];
  for (const d of depots) {
    for (const combo of minimalVehicleCombos(withDepot(d), required, maxVehicles)) singleDepot.push(toCandidate(combo, input));
  }

  const chosen: AllocationOption[] = [];
  const seen = new Set<string>();
  const push = (code: AllocationOptionCode, c?: Candidate) => {
    if (!c || chosen.length >= 3) return;
    const key = vehicleSetKey(c.vehicles);
    if (seen.has(key)) return; // gộp phương án trùng tập xe
    seen.add(key);
    chosen.push({ optionCode: code, labelVi: LABELS_VI[code], ...c });
  };

  const byPrice = (a: Candidate, b: Candidate) => a.totalFreight - b.totalFreight;
  if (singleDepot.length) {
    // Bước 5: Rẻ nhất · Ít xe nhất (hòa → rẻ hơn) · Đến sớm nhất = trạm gần nhất (hòa → rẻ hơn)
    push('cheapest', pickBest(singleDepot, byPrice));
    push('fewest_vehicles', pickBest(singleDepot, (a, b) => a.vehicles.length - b.vehicles.length || byPrice(a, b)));
    push('earliest', pickBest(singleDepot, (a, b) => a.maxDeadheadKm - b.maxDeadheadKm || byPrice(a, b)));
  } else if (depots.length >= 2) {
    // Bước 2: không trạm nào đủ một mình → ghép xe từ 2 trạm gần nhất
    const pool = [...withDepot(depots[0]), ...withDepot(depots[1])];
    const combos = minimalVehicleCombos(pool, required, maxVehicles)
      .filter((c) => new Set(c.map((v) => v.depotId)).size === 2)
      .map((c) => toCandidate(c, input));
    push('two_depots', pickBest(combos, byPrice));
  }

  // Bước 3: chia nhiều ngày bằng xe lớn nhất của trạm gần nhất. Chỉ có ý nghĩa khi xe lớn nhất
  // không chở hết một lượt; kèm theo như phương án thay thế nếu còn chỗ trong 3 phương án.
  const nearest = depots[0];
  if (nearest && chosen.length < 3) {
    const biggest = [...withDepot(nearest)].sort((a, b) => b.capacity - a.capacity || a.vehicleId - b.vehicleId)[0];
    if (biggest.capacity < required) {
      const trips = Math.ceil(required / biggest.capacity);
      if (trips <= maxSplitTrips) {
        // Cước = cước một lượt × số lượt (tính như `trips` xe) + chạy rỗng quay đầu giữa các lượt
        const perTrip = Array.from({ length: trips }, () => ({ ...biggest }));
        const turnaround = input.turnaroundCost ? input.turnaroundCost({ ...biggest }) : 0;
        push('split_days', {
          vehicles: [{ ...biggest, trips }],
          totalFreight: input.priceVehicleSet(perTrip) + Math.round(turnaround) * (trips - 1),
          maxDeadheadKm: biggest.deadheadKm,
          extraDays: trips - 1,
        });
      }
    }
  }

  // Bước 6
  const totalCapacity = depots.reduce((s, d) => s + d.vehicles.reduce((n, v) => n + Math.max(0, v.capacity), 0), 0);
  return {
    options: chosen,
    recommended: chosen.length ? (chosen.find((o) => o.optionCode === 'cheapest')?.optionCode ?? chosen[0].optionCode) : null,
    shortageSlots: chosen.length ? 0 : Math.max(1, required - totalCapacity),
  };
}

export interface StallHorse {
  quantity?: number | null;
  requiresPrivateStall?: boolean | number | null;
}

const qtyOf = (h: StallHorse) => (Number(h.quantity) > 0 ? Number(h.quantity) : 1);

/** Jet stall (máy bay): 3 ngựa thường / stall; ngựa cần chuồng riêng chiếm nguyên 1 stall (B3). */
export function jetStallCount(horses: StallHorse[]): number {
  let privateCount = 0;
  let normal = 0;
  for (const h of horses) {
    if (h.requiresPrivateStall) privateCount += qtyOf(h);
    else normal += qtyOf(h);
  }
  return privateCount + Math.ceil(normal / 3);
}

/** Tàu gia súc: ngựa thường 1 ô chuồng, ngựa cần chuồng riêng chiếm 2 ô chuồng (không gian tách biệt). */
export function vesselPenCount(horses: StallHorse[]): number {
  return horses.reduce((s, h) => s + qtyOf(h) * (h.requiresPrivateStall ? 2 : 1), 0);
}
