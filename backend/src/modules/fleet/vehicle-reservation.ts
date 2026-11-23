/**
 * Giữ chỗ xe (bảng vehicle_reservation, Step 9). Các hàm nhận một executor DB (pool hoặc connection
 * đang trong transaction) để module khác (orders, routes) gọi ngay trong transaction của mình mà
 * không phải phụ thuộc vòng vào FleetModule.
 *
 * Vòng đời: active (giữ khi tạo đơn) → consumed (kế hoạch chi tiết dùng đúng xe) | released (đơn hủy/
 * hết hạn/hoàn tiền, hoặc Manager đổi xe). Không xóa bản ghi để giữ lịch sử.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';

type Executor = { execute?: (sql: string, params?: any[]) => Promise<any>; query?: (sql: string, params?: any[]) => Promise<any> };

/** Trạng thái đơn mà xe đã giữ phải được nhả. */
export const RESERVATION_RELEASE_STATUSES = ['cancelled', 'refund_requested', 'refunded', 'cancelled_operational', 'rejected'];

/** Đơn ở các trạng thái này không còn chiếm xe (dùng trong SQL). */
export const INACTIVE_SHIPMENT_SQL = `('completed','cancelled','cancelled_operational','rejected','refunded','refund_requested')`;

export const VEHICLE_TAKEN_MESSAGE = 'Xe trong phương án đã được đặt, vui lòng báo giá lại';

async function run(db: Executor, sql: string, params: any[] = []): Promise<any[]> {
  const fn = typeof db.execute === 'function' ? db.execute.bind(db) : db.query!.bind(db);
  const res = await fn(sql, params);
  return Array.isArray(res) ? res : [res];
}

function isMissingTable(err: any): boolean {
  return err?.code === 'ER_NO_SUCH_TABLE' || String(err?.message ?? '').includes("doesn't exist");
}

export interface ReserveInput {
  shipmentId: number;
  vehicleIds: number[];
  start: Date;
  end: Date;
  direction?: 'outbound' | 'return';
  actorId?: number | null;
}

/**
 * Xe (trong danh sách) đang bị đơn KHÁC chiếm trong khoảng [start, end):
 * reservation còn hiệu lực hoặc chặng route_leg của đơn đang hoạt động trùng giờ.
 */
export async function findVehicleConflicts(db: Executor, vehicleIds: number[], start: Date, end: Date, excludeShipmentId: number): Promise<number[]> {
  const ids = [...new Set(vehicleIds.map(Number))].filter((id) => id > 0);
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [resRows] = await run(
    db,
    `SELECT DISTINCT vr.vehicle_id
     FROM vehicle_reservation vr JOIN shipment s ON s.shipment_id = vr.shipment_id
     WHERE vr.vehicle_id IN (${ph}) AND vr.status IN ('active','consumed') AND vr.shipment_id <> ?
       AND s.status NOT IN ${INACTIVE_SHIPMENT_SQL}
       AND vr.start_at < ? AND vr.end_at > ?`,
    [...ids, excludeShipmentId, end, start],
  );
  const [legRows] = await run(
    db,
    `SELECT DISTINCT l.vehicle_id
     FROM route_leg l JOIN route r ON r.route_id = l.route_id JOIN shipment s ON s.shipment_id = r.shipment_id
     WHERE l.vehicle_id IN (${ph}) AND s.shipment_id <> ? AND s.status NOT IN ${INACTIVE_SHIPMENT_SQL}
       AND l.planned_departure IS NOT NULL AND l.planned_arrival IS NOT NULL
       AND l.planned_departure < ? AND l.planned_arrival > ?`,
    [...ids, excludeShipmentId, end, start],
  );
  return [...new Set([...(resRows ?? []), ...(legRows ?? [])].map((r: any) => Number(r.vehicle_id)))];
}

/**
 * Giữ chỗ các xe cho đơn. Gọi TRONG transaction: khóa xe theo vehicle_id ASC (FOR UPDATE) như
 * road-trips.store → prepareLegs để hai giao dịch đồng thời không giữ cùng một xe.
 * Xe đã bị đơn khác giữ → 409 "Xe trong phương án đã được đặt, vui lòng báo giá lại".
 */
export async function reserveVehicles(db: Executor, input: ReserveInput): Promise<number[]> {
  const ids = [...new Set(input.vehicleIds.map(Number))].filter((id) => id > 0).sort((a, b) => a - b);
  if (!ids.length) return [];
  if (!(input.end > input.start)) throw new BadRequestException('Khoảng thời gian giữ chỗ xe không hợp lệ');
  const [vehicles] = await run(
    db,
    `SELECT vehicle_id, status FROM vehicle WHERE vehicle_id IN (${ids.map(() => '?').join(',')}) ORDER BY vehicle_id FOR UPDATE`,
    ids,
  );
  const found = new Map<number, any>((vehicles ?? []).map((v: any) => [Number(v.vehicle_id), v]));
  if (ids.some((id) => !found.has(id) || found.get(id).status === 'maintenance')) {
    throw new ConflictException(VEHICLE_TAKEN_MESSAGE);
  }
  const conflicts = await findVehicleConflicts(db, ids, input.start, input.end, input.shipmentId);
  if (conflicts.length) throw new ConflictException(VEHICLE_TAKEN_MESSAGE);
  for (const id of ids) {
    await run(
      db,
      `INSERT INTO vehicle_reservation (shipment_id, vehicle_id, direction, start_at, end_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [input.shipmentId, id, input.direction ?? 'outbound', input.start, input.end, input.actorId ?? null],
    );
  }
  return ids;
}

/** Nhả xe đã giữ của đơn (toàn bộ hoặc một số xe). Bảng chưa migrate thì bỏ qua. */
export async function releaseShipmentReservations(db: Executor, shipmentId: number, reason: string, vehicleIds?: number[]): Promise<void> {
  const filter = vehicleIds?.length ? ` AND vehicle_id IN (${vehicleIds.map(() => '?').join(',')})` : '';
  try {
    await run(
      db,
      `UPDATE vehicle_reservation SET status = 'released', released_reason = ?, released_at = NOW()
       WHERE shipment_id = ? AND status IN ('active','consumed')${filter}`,
      [reason.slice(0, 50), shipmentId, ...(vehicleIds ?? [])],
    );
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
}

/** Đánh dấu consumed các xe được kế hoạch chi tiết dùng đúng như đã giữ. */
export async function consumeShipmentReservations(db: Executor, shipmentId: number, vehicleIds: number[]): Promise<void> {
  if (!vehicleIds.length) return;
  try {
    await run(
      db,
      `UPDATE vehicle_reservation SET status = 'consumed'
       WHERE shipment_id = ? AND status = 'active' AND vehicle_id IN (${vehicleIds.map(() => '?').join(',')})`,
      [shipmentId, ...vehicleIds],
    );
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
}

export interface ShipmentReservationRow {
  reservationId: number;
  vehicleId: number;
  plate: string | null;
  capacity: number;
  classCode: string | null;
  depotName: string | null;
  direction: 'outbound' | 'return';
  startAt: string;
  endAt: string;
  status: 'active' | 'released' | 'consumed';
  releasedReason: string | null;
}

/** Xe đang giữ (active/consumed) của đơn. Bảng chưa migrate → []. */
export async function findShipmentReservations(db: Executor, shipmentId: number, includeReleased = false): Promise<ShipmentReservationRow[]> {
  try {
    const [rows] = await run(
      db,
      `SELECT vr.*, v.plate_or_code, v.capacity, v.vehicle_class_code, d.name AS depot_name
       FROM vehicle_reservation vr
       JOIN vehicle v ON v.vehicle_id = vr.vehicle_id
       LEFT JOIN depot d ON d.depot_id = v.depot_id
       WHERE vr.shipment_id = ? ${includeReleased ? '' : "AND vr.status IN ('active','consumed')"}
       ORDER BY vr.reservation_id`,
      [shipmentId],
    );
    return (rows ?? []).map((r: any) => ({
      reservationId: Number(r.reservation_id),
      vehicleId: Number(r.vehicle_id),
      plate: r.plate_or_code ?? null,
      capacity: Number(r.capacity ?? 0),
      classCode: r.vehicle_class_code ?? null,
      depotName: r.depot_name ?? null,
      direction: r.direction,
      startAt: new Date(r.start_at).toISOString(),
      endAt: new Date(r.end_at).toISOString(),
      status: r.status,
      releasedReason: r.released_reason ?? null,
    }));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}
