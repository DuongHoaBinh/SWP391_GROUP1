import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { SandboxPayment, SandboxPaymentStatus } from './momo-payment.types';
import { paymentGate } from './payment-gate';

@Injectable()
export class MomoPaymentStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  onModuleInit() {
    this.pool = createPool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '', connectionLimit: 5 });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  private async transaction<T>(action: (db: PoolConnection) => Promise<T>): Promise<T> {
    const db = await this.pool.getConnection();
    try { await db.beginTransaction(); const result = await action(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  async latest(shipmentId: number, customerId: number): Promise<SandboxPayment | null> {
    const [orders] = await this.pool.execute<any[]>('SELECT customer_id FROM shipment WHERE shipment_id = ?', [shipmentId]);
    if (!orders.length) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (Number(orders[0].customer_id) !== customerId) throw new ForbiddenException('Đơn hàng không thuộc tài khoản của bạn');
    const [rows] = await this.pool.execute<any[]>("SELECT * FROM shipment_sandbox_payment WHERE shipment_id = ? AND (request_type = 'payWithATM' OR status = 'succeeded') ORDER BY (status = 'succeeded') DESC, payment_id DESC LIMIT 1", [shipmentId]);
    return rows[0] ?? null;
  }

  async byOrderId(orderId: string): Promise<SandboxPayment> {
    const [rows] = await this.pool.execute<any[]>('SELECT * FROM shipment_sandbox_payment WHERE order_id = ?', [orderId]);
    if (!rows.length) throw new NotFoundException('Không tìm thấy giao dịch sandbox');
    return rows[0];
  }

  async reserve(shipmentId: number, customerId: number, partnerCode: string): Promise<{ payment: SandboxPayment; created: boolean }> {
    return this.transaction(async db => {
      const [orders] = await db.execute<any[]>('SELECT customer_id, status, total_cost FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      if (!orders.length) throw new NotFoundException('Không tìm thấy đơn hàng');
      const order = orders[0];
      if (Number(order.customer_id) !== customerId) throw new ForbiddenException('Đơn hàng không thuộc tài khoản của bạn');
      const gate = await paymentGate(db, shipmentId);
      if (!gate.paymentUnlocked) throw new BadRequestException(gate.blockedReason!);
      if (!['approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed'].includes(order.status)) throw new BadRequestException('Đơn hàng cần được duyệt và có báo giá trước khi thanh toán thử');
      const rawCost = Number(order.total_cost);
      const amount = rawCost > 0 && rawCost < 100000 ? Math.round(rawCost * 25400) : Math.round(rawCost);
      if (!Number.isSafeInteger(amount) || amount < 10000) throw new BadRequestException('Số tiền thanh toán tối thiểu là 10.000 VND');
      const [existing] = await db.execute<any[]>("SELECT * FROM shipment_sandbox_payment WHERE shipment_id = ? AND (request_type = 'payWithATM' OR status = 'succeeded') ORDER BY (status = 'succeeded') DESC, payment_id DESC LIMIT 1", [shipmentId]);
      if (existing.length && existing[0].status !== 'failed') {
        if (Number(existing[0].amount) === amount && existing[0].partner_code === partnerCode) {
          return { payment: existing[0], created: false };
        }
      }
      const orderId = `EQ${shipmentId}-${randomUUID()}`;
      const requestId = randomUUID();
      await db.execute(`INSERT INTO shipment_sandbox_payment (shipment_id, customer_id, partner_code, order_id, request_id, order_info, amount, request_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'payWithATM')`, [shipmentId, customerId, partnerCode, orderId, requestId, `EquiTransit shipment ${shipmentId} sandbox`, amount]);
      const [rows] = await db.execute<any[]>('SELECT * FROM shipment_sandbox_payment WHERE order_id = ?', [orderId]);
      await db.execute(`INSERT INTO shipment_sandbox_payment_event (payment_id, event_key, source, new_status) VALUES (?, 'reserved', 'create', 'creating')`, [rows[0].payment_id]);
      return { payment: rows[0], created: true };
    });
  }

  async apply(paymentId: number, update: { status: SandboxPaymentStatus; source: string; eventKey: string; code?: number; message: string; transId?: string; payUrl?: string; qrContent?: string }): Promise<SandboxPayment> {
    return this.transaction(async db => {
      const [rows] = await db.execute<any[]>('SELECT * FROM shipment_sandbox_payment WHERE payment_id = ? FOR UPDATE', [paymentId]);
      if (!rows.length) throw new NotFoundException();
      const payment: SandboxPayment = rows[0];
      const [events] = await db.execute<any[]>('SELECT event_id FROM shipment_sandbox_payment_event WHERE payment_id = ? AND event_key = ?', [paymentId, update.eventKey]);
      if (events.length) return payment;
      // A delayed create/query/IPN must never downgrade a verified successful payment.
      const status = payment.status === 'succeeded' || (payment.status === 'failed' && update.status !== 'succeeded') ? payment.status : update.status;
      const preserveResult = payment.status === 'succeeded' || (payment.status === 'failed' && status === 'failed');
      await db.execute(`UPDATE shipment_sandbox_payment SET status = ?, result_code = ?, result_message = ?, trans_id = ?,
        pay_url = COALESCE(?, pay_url), qr_content = COALESCE(?, qr_content), updated_at = CURRENT_TIMESTAMP(3) WHERE payment_id = ?`,
        [status, preserveResult ? payment.result_code : update.code ?? null, preserveResult ? payment.result_message : update.message,
          preserveResult ? payment.trans_id : update.transId ?? payment.trans_id, update.payUrl ?? null, update.qrContent ?? null, paymentId]);
      await db.execute(`INSERT INTO shipment_sandbox_payment_event (payment_id, event_key, source, new_status, result_code, result_message)
        VALUES (?, ?, ?, ?, ?, ?)`, [paymentId, update.eventKey, update.source, status, update.code ?? null, update.message]);
      if (status === 'succeeded') {
        // Auto-promote shipment and route to 'ready_to_depart' if route plan is already confirmed and all documents are approved
        const [routes] = await db.execute<any[]>('SELECT route_id, plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [payment.shipment_id]);
        if (routes.length > 0 && routes[0].plan_status === 'confirmed') {
          const [docs] = await db.execute<any[]>(
            'SELECT COUNT(*) as total, SUM(CASE WHEN status = \'approved\' THEN 1 ELSE 0 END) as approved FROM transport_document WHERE shipment_id = ?',
            [payment.shipment_id],
          );
          const totalDocs = Number(docs[0]?.total || 0);
          const approvedDocs = Number(docs[0]?.approved || 0);
          if (totalDocs > 0 && totalDocs === approvedDocs) {
            await db.execute("UPDATE route SET plan_status = 'ready_to_depart' WHERE route_id = ?", [routes[0].route_id]);
            await db.execute("UPDATE shipment SET status = 'ready_to_depart' WHERE shipment_id = ? AND status IN ('approved', 'planning', 'confirmed')", [payment.shipment_id]);
          }
        }
      }
      const [updated] = await db.execute<any[]>('SELECT * FROM shipment_sandbox_payment WHERE payment_id = ?', [paymentId]);
      return updated[0];
    });
  }

  async claimRefresh(paymentId: number): Promise<boolean> {
    const [result] = await this.pool.execute<any>(`UPDATE shipment_sandbox_payment SET last_checked_at = CURRENT_TIMESTAMP(3)
      WHERE payment_id = ? AND (last_checked_at IS NULL OR last_checked_at < CURRENT_TIMESTAMP(3) - INTERVAL 5 SECOND)`, [paymentId]);
    return result.affectedRows === 1;
  }

  async isPaymentSucceeded(shipmentId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT payment_id FROM shipment_sandbox_payment WHERE shipment_id = ? AND status = 'succeeded' LIMIT 1",
      [shipmentId]
    );
    return rows.length > 0;
  }
}

