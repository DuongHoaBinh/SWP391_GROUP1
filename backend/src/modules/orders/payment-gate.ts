import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export const WAITING_FOR_PLAN = 'Lộ trình và chuyến xe đang được bộ phận điều phối thiết lập chi tiết. Cổng thanh toán sẽ tự động mở sau khi lịch trình được xác nhận.';
export const CONFIRMED_PLAN_STATUSES = ['confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed'];

export async function paymentGate(db: Pool | PoolConnection, shipmentId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT s.customer_id, s.status, s.total_cost, s.payment_overdue,
    r.route_id, r.plan_status, i.invoice_id, i.amount AS invoice_amount, i.issued_at, i.snapshot,
    i.status AS invoice_status, i.payment_due_at, i.grace_due_at, i.grace_count,
    supp.invoice_id AS supp_invoice_id, supp.amount AS supp_amount, supp.issued_at AS supp_issued_at,
    supp.status AS supp_status, supp.payment_due_at AS supp_payment_due_at, supp.snapshot AS supp_snapshot,
    (SELECT COUNT(*) FROM shipment_assignment a WHERE a.shipment_id = s.shipment_id
      AND a.role_in_shipment IN ('driver', 'escort')) AS staff_count,
    (SELECT COUNT(*) FROM shipment_assignment a WHERE a.shipment_id = s.shipment_id
      AND a.role_in_shipment IN ('driver', 'escort') AND a.is_confirmed = FALSE) AS unconfirmed_count
    FROM shipment s
    LEFT JOIN route r ON r.route_id = (SELECT MAX(r2.route_id) FROM route r2 WHERE r2.shipment_id = s.shipment_id)
    LEFT JOIN shipment_invoice i ON i.invoice_id = (
      SELECT i2.invoice_id FROM shipment_invoice i2
      WHERE i2.route_id = r.route_id AND i2.shipment_id = s.shipment_id
        AND COALESCE(i2.invoice_type, 'primary') = 'primary' AND COALESCE(i2.status, 'active') <> 'void'
      ORDER BY i2.invoice_id DESC LIMIT 1
    )
    LEFT JOIN shipment_invoice supp ON supp.invoice_id = (
      SELECT i3.invoice_id FROM shipment_invoice i3
      WHERE i3.route_id = r.route_id AND i3.shipment_id = s.shipment_id
        AND i3.invoice_type = 'supplemental' AND COALESCE(i3.status, 'active') <> 'void'
      ORDER BY i3.invoice_id DESC LIMIT 1
    )
    WHERE s.shipment_id = ?`, [shipmentId]);
  const row = rows[0];
  const amount = Number(row?.total_cost);
  const invoicedTotal = Number(row?.invoice_amount ?? 0) + Number(row?.supp_amount ?? 0);
  let blockedReason: string | null = null;
  if (!row || ['requested', 'change_requested', 'rejected', 'cancelled', 'cancelled_operational'].includes(row.status)) {
    blockedReason = 'Đơn hàng hiện không đủ điều kiện thanh toán.';
  } else if (!CONFIRMED_PLAN_STATUSES.includes(row.plan_status) || !Number(row.staff_count) || Number(row.unconfirmed_count)) {
    blockedReason = WAITING_FOR_PLAN;
  } else if (!row.invoice_id || !Number.isSafeInteger(amount) || amount <= 0 || invoicedTotal !== amount) {
    blockedReason = 'Hóa đơn chưa sẵn sàng hoặc báo giá đã thay đổi. Vui lòng liên hệ bộ phận vận chuyển để đối soát.';
  }
  return {
    paymentUnlocked: blockedReason === null,
    blockedReason,
    paymentOverdue: Boolean(row?.payment_overdue),
    paymentDueAt: row?.payment_due_at ? new Date(row.payment_due_at).toISOString() : null,
    graceDueAt: row?.grace_due_at ? new Date(row.grace_due_at).toISOString() : null,
    graceCount: Number(row?.grace_count ?? 0),
    invoiceStatus: (row?.invoice_status as string | undefined) ?? 'active',
    invoice: row?.invoice_id ? {
      id: Number(row.invoice_id), code: `INV-${String(row.invoice_id).padStart(6, '0')}`,
      shipmentId, routeId: Number(row.route_id), amount: Number(row.invoice_amount), currency: 'VND' as const,
      invoiceType: 'primary' as const,
      status: (row.invoice_status as string | undefined) ?? 'active',
      issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
      paymentDueAt: row.payment_due_at ? new Date(row.payment_due_at).toISOString() : null,
      graceDueAt: row.grace_due_at ? new Date(row.grace_due_at).toISOString() : null,
      graceCount: Number(row.grace_count ?? 0),
      snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    } : null,
    supplementalInvoice: row?.supp_invoice_id ? {
      id: Number(row.supp_invoice_id), code: `SUP-${String(row.supp_invoice_id).padStart(6, '0')}`,
      shipmentId, routeId: Number(row.route_id), amount: Number(row.supp_amount), currency: 'VND' as const,
      invoiceType: 'supplemental' as const,
      status: (row.supp_status as string | undefined) ?? 'active',
      issuedAt: row.supp_issued_at ? new Date(row.supp_issued_at).toISOString() : null,
      paymentDueAt: row.supp_payment_due_at ? new Date(row.supp_payment_due_at).toISOString() : null,
      snapshot: typeof row.supp_snapshot === 'string' ? JSON.parse(row.supp_snapshot) : row.supp_snapshot,
    } : null,
  };
}
