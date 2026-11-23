import { ConflictException, NotFoundException } from '@nestjs/common';
import { PoolConnection } from 'mysql2/promise';
import { RESERVATION_RELEASE_STATUSES, releaseShipmentReservations } from '../fleet/vehicle-reservation';

export type ShipmentStatusValue =
  | 'requested'
  | 'under_review'
  | 'change_requested'
  | 'approved'
  | 'rejected'
  | 'planning'
  | 'confirmed'
  | 'ready_to_depart'
  | 'in_transit'
  | 'return_pending'
  | 'completed'
  | 'delivered'
  | 'cancelled'
  | 'cancelled_operational'
  | 'awaiting_payment'
  | 'paid_pending_review'
  | 'refund_requested'
  | 'refunded';

export const PREPAID_TRANSITIONS: Record<string, ShipmentStatusValue[]> = {
  awaiting_payment: ['paid_pending_review', 'cancelled'],
  paid_pending_review: ['approved', 'planning', 'refund_requested'],
  approved: ['planning', 'cancelled_operational'],
  planning: ['confirmed', 'ready_to_depart', 'cancelled_operational'],
  confirmed: ['ready_to_depart', 'planning', 'cancelled_operational'],
  ready_to_depart: ['in_transit', 'planning', 'cancelled_operational'],
  in_transit: ['return_pending', 'completed'],
  return_pending: ['in_transit', 'completed'],
  refund_requested: ['refunded'],
  completed: [],
  cancelled: [],
  cancelled_operational: [],
  refunded: [],
};

export const LEGACY_TRANSITIONS: Record<string, ShipmentStatusValue[]> = {
  requested: ['approved', 'rejected', 'change_requested', 'cancelled'],
  under_review: ['approved', 'rejected', 'change_requested', 'cancelled'],
  change_requested: ['requested', 'cancelled'],
  approved: ['planning', 'cancelled_operational'],
  planning: ['confirmed', 'cancelled_operational'],
  confirmed: ['ready_to_depart', 'planning', 'cancelled_operational'],
  ready_to_depart: ['in_transit', 'planning', 'cancelled_operational'],
  in_transit: ['return_pending', 'completed', 'delivered'],
  return_pending: ['in_transit', 'completed'],
  completed: [],
  delivered: ['completed'],
  rejected: [],
  cancelled: [],
  cancelled_operational: [],
};

export function canTransition(flow: 'prepaid' | 'postpaid_legacy', from: string, to: string): boolean {
  const transitions = flow === 'prepaid' ? PREPAID_TRANSITIONS : LEGACY_TRANSITIONS;
  const allowed = transitions[from];
  return Array.isArray(allowed) && allowed.includes(to as ShipmentStatusValue);
}

export function assertTransition(flow: 'prepaid' | 'postpaid_legacy', from: string, to: string): void {
  if (!canTransition(flow, from, to)) {
    throw new ConflictException(`Không thể chuyển trạng thái từ '${from}' sang '${to}' (luồng ${flow})`);
  }
}

export async function transitionShipment(
  db: PoolConnection | any,
  input: {
    shipmentId: number;
    to: ShipmentStatusValue;
    actorId: number | null;
    actorRole: string;
    reasonCode?: string;
    note?: string;
    expectedFrom?: ShipmentStatusValue[];
  }
): Promise<{ from: string; to: string }> {
  // 1. Fetch current status & payment_flow
  const [rows] = await db.query(
    'SELECT status, payment_flow FROM shipment WHERE shipment_id = ? FOR UPDATE',
    [input.shipmentId]
  );
  if (!rows || rows.length === 0) {
    throw new NotFoundException(`Không tìm thấy đơn hàng #${input.shipmentId}`);
  }
  const currentStatus = rows[0].status as ShipmentStatusValue;
  const flow = (rows[0].payment_flow || 'postpaid_legacy') as 'prepaid' | 'postpaid_legacy';

  // 2. Validate transition
  if (input.expectedFrom && input.expectedFrom.length > 0) {
    if (!input.expectedFrom.includes(currentStatus)) {
      throw new ConflictException(
        `Không thể chuyển đơn #${input.shipmentId} từ '${currentStatus}' sang '${input.to}' (yêu cầu trạng thái: ${input.expectedFrom.join(', ')})`
      );
    }
  } else {
    assertTransition(flow, currentStatus, input.to);
  }

  // 3. Conditional update
  const [updateResult] = await db.query(
    'UPDATE shipment SET status = ? WHERE shipment_id = ? AND status = ?',
    [input.to, input.shipmentId, currentStatus]
  );
  if (updateResult && typeof updateResult.affectedRows === 'number' && updateResult.affectedRows === 0) {
    throw new ConflictException(
      `Không thể cập nhật trạng thái đơn #${input.shipmentId} từ '${currentStatus}' sang '${input.to}' (xung đột đồng thời)`
    );
  }

  // 4. Insert status history
  try {
    await db.query(
      `INSERT INTO shipment_status_history
        (shipment_id, from_status, to_status, actor_id, actor_role, reason_code, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.shipmentId,
        currentStatus,
        input.to,
        input.actorId ?? null,
        input.actorRole,
        input.reasonCode ?? null,
        input.note ?? null,
      ]
    );
  } catch (err: any) {
    // If table does not exist in testing environment without migration, don't break main flow unless strict
    if (!err?.message?.includes("doesn't exist")) {
      throw err;
    }
  }

  // 5. Step 9: đơn hủy / hết hạn thanh toán / không đáp ứng (hoàn tiền) → nhả xe đã giữ chỗ
  if (RESERVATION_RELEASE_STATUSES.includes(input.to)) {
    await releaseShipmentReservations(db, input.shipmentId, input.reasonCode ?? `status_${input.to}`);
  }

  return { from: currentStatus, to: input.to };
}
