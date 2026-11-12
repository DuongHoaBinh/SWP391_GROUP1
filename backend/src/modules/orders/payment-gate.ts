import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export const WAITING_FOR_PLAN = 'Lộ trình và chuyến xe đang được bộ phận điều phối thiết lập chi tiết. Cổng thanh toán sẽ tự động mở sau khi lịch trình được xác nhận.';
export const CONFIRMED_PLAN_STATUSES = ['confirmed', 'ready_to_depart', 'in_transit', 'completed'];

export async function paymentGate(db: Pool | PoolConnection, shipmentId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT s.customer_id, s.status, s.total_cost,
    r.route_id, r.plan_status, i.invoice_id, i.amount AS invoice_amount, i.issued_at, i.snapshot,
    (SELECT COUNT(*) FROM shipment_assignment a WHERE a.shipment_id = s.shipment_id
      AND a.role_in_shipment IN ('driver', 'escort')) AS staff_count,
    (SELECT COUNT(*) FROM shipment_assignment a WHERE a.shipment_id = s.shipment_id
      AND a.role_in_shipment IN ('driver', 'escort') AND a.is_confirmed = FALSE) AS unconfirmed_count
    FROM shipment s
    LEFT JOIN route r ON r.route_id = (SELECT MAX(r2.route_id) FROM route r2 WHERE r2.shipment_id = s.shipment_id)
    LEFT JOIN shipment_invoice i ON i.route_id = r.route_id AND i.shipment_id = s.shipment_id
    WHERE s.shipment_id = ?`, [shipmentId]);
  const row = rows[0];
  const amount = Number(row?.total_cost);
  let blockedReason: string | null = null;
  if (!row || ['requested', 'change_requested', 'rejected', 'cancelled'].includes(row.status)) {
    blockedReason = 'Đơn hàng hiện không đủ điều kiện thanh toán.';
  } else if (!CONFIRMED_PLAN_STATUSES.includes(row.plan_status) || !Number(row.staff_count) || Number(row.unconfirmed_count)) {
    blockedReason = WAITING_FOR_PLAN;
  } else if (!row.invoice_id || !Number.isSafeInteger(amount) || amount <= 0 || Number(row.invoice_amount) !== amount) {
    blockedReason = 'Hóa đơn chưa sẵn sàng hoặc báo giá đã thay đổi. Vui lòng liên hệ bộ phận vận chuyển để đối soát.';
  }
  return {
    paymentUnlocked: blockedReason === null,
    blockedReason,
    invoice: row?.invoice_id ? {
      id: Number(row.invoice_id), code: `INV-${String(row.invoice_id).padStart(6, '0')}`,
      shipmentId, routeId: Number(row.route_id), amount: Number(row.invoice_amount), currency: 'VND' as const,
      issuedAt: new Date(row.issued_at).toISOString(),
      snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    } : null,
  };
}
