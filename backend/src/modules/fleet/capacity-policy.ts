import { BadRequestException } from '@nestjs/common';

export interface StallSlotHorse {
  quantity?: number | null;
}

/** Số chỗ chuồng cần cho một đơn: mỗi ngựa 1 chỗ. */
export function computeRequiredStallSlots(horses: StallSlotHorse[], fallbackHorseCount = 0): number {
  const slots = horses.reduce((sum, h) => {
    const qty = Number.isFinite(Number(h.quantity)) && Number(h.quantity) > 0 ? Number(h.quantity) : 1;
    return sum + qty;
  }, 0);
  return slots > 0 ? slots : Math.max(0, Number(fallbackHorseCount) || 0);
}

type Executor = { execute: (sql: string, params?: any[]) => Promise<any> };

/** Đọc số chỗ chuồng cần của đơn từ DB (dùng được trong transaction). */
export async function loadRequiredStallSlots(db: Executor, shipmentId: number, fallbackHorseCount: number): Promise<number> {
  const [rows] = await db.execute(
    `SELECT sh.quantity
     FROM shipment_horse sh
     WHERE sh.shipment_id = ?`,
    [shipmentId],
  );
  return computeRequiredStallSlots(
    (rows as any[]).map((r) => ({ quantity: r.quantity })),
    fallbackHorseCount,
  );
}

export function assertRoadCapacity(requiredSlots: number, vehicleIds: number[], vehicles: Array<{ id: number; capacity: number }>) {
  if (!Number.isSafeInteger(requiredSlots) || requiredSlots < 1) throw new BadRequestException('Số ngựa của đơn không hợp lệ');
  for (const id of new Set(vehicleIds)) {
    const vehicle = vehicles.find(v => Number(v.id) === id);
    if (!vehicle || Number(vehicle.capacity) < requiredSlots) {
      throw new BadRequestException(
        `Phương tiện của mỗi chặng phải đủ ${requiredSlots} chỗ chuồng cho toàn bộ ngựa của đơn`,
      );
    }
  }
}

/**
 * Step 9: phương án nhiều xe (ví dụ 3 xe 1 chỗ cho 3 ngựa) chạy thành đoàn. Kế hoạch chi tiết vẫn
 * gắn một xe dẫn đầu cho mỗi chặng; xe nằm trong nhóm đã giữ chỗ cùng hướng được tính sức chứa bằng
 * TỔNG sức chứa của cả đoàn. Xe ngoài nhóm giữ chỗ giữ nguyên sức chứa riêng.
 */
export function applyConvoyCapacity<T extends { id: number; capacity: number }>(
  vehicles: T[],
  reservations: Array<{ vehicleId: number; capacity: number; direction?: string | null }>,
): T[] {
  return vehicles.map((v) => {
    const own = reservations.find((r) => Number(r.vehicleId) === Number(v.id));
    if (!own) return v;
    const convoy = reservations
      .filter((r) => (r.direction ?? 'outbound') === (own.direction ?? 'outbound'))
      .reduce((sum, r) => sum + Number(r.capacity || 0), 0);
    return { ...v, capacity: Math.max(Number(v.capacity), convoy) };
  });
}
