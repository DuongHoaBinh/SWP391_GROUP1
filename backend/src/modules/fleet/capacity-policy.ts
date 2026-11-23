import { BadRequestException } from '@nestjs/common';

/** Ngựa cần chuồng riêng (đực giống, khó tính) chiếm 2 chỗ khi tính sức chứa xe (Step 3, review 11/2026). */
export const PRIVATE_STALL_SLOTS = 2;

export interface StallSlotHorse {
  quantity?: number | null;
  requiresPrivateStall?: boolean | number | null;
}

/** Số chỗ chuồng cần cho một đơn: mỗi ngựa 1 chỗ, ngựa cần chuồng riêng 2 chỗ. */
export function computeRequiredStallSlots(horses: StallSlotHorse[], fallbackHorseCount = 0): number {
  const slots = horses.reduce((sum, h) => {
    const qty = Number.isFinite(Number(h.quantity)) && Number(h.quantity) > 0 ? Number(h.quantity) : 1;
    return sum + qty * (h.requiresPrivateStall ? PRIVATE_STALL_SLOTS : 1);
  }, 0);
  return slots > 0 ? slots : Math.max(0, Number(fallbackHorseCount) || 0);
}

type Executor = { execute: (sql: string, params?: any[]) => Promise<any> };

/** Đọc số chỗ chuồng cần của đơn từ DB (dùng được trong transaction). */
export async function loadRequiredStallSlots(db: Executor, shipmentId: number, fallbackHorseCount: number): Promise<number> {
  const [rows] = await db.execute(
    `SELECT sh.quantity, h.requires_private_stall
     FROM shipment_horse sh JOIN horse h ON h.horse_id = sh.horse_id
     WHERE sh.shipment_id = ?`,
    [shipmentId],
  );
  return computeRequiredStallSlots(
    (rows as any[]).map((r) => ({ quantity: r.quantity, requiresPrivateStall: Boolean(r.requires_private_stall) })),
    fallbackHorseCount,
  );
}

export function assertRoadCapacity(requiredSlots: number, vehicleIds: number[], vehicles: Array<{ id: number; capacity: number }>) {
  if (!Number.isSafeInteger(requiredSlots) || requiredSlots < 1) throw new BadRequestException('Số ngựa của đơn không hợp lệ');
  for (const id of new Set(vehicleIds)) {
    const vehicle = vehicles.find(v => Number(v.id) === id);
    if (!vehicle || Number(vehicle.capacity) < requiredSlots) {
      throw new BadRequestException(
        `Phương tiện của mỗi chặng phải đủ ${requiredSlots} chỗ chuồng cho toàn bộ ngựa của đơn (ngựa cần chuồng riêng tính ${PRIVATE_STALL_SLOTS} chỗ)`,
      );
    }
  }
}
