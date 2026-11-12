import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { createHash, randomInt } from 'node:crypto';
import { PAYABLE_SHIPMENT_STATUSES, SepayConfig, SepayPayment, SepayTransaction } from './sepay-payment.types';
import { paymentGate } from './payment-gate';

@Injectable()
export class SepayPaymentStore implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  onModuleInit() {
    this.pool = createPool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '', connectionLimit: 5, supportBigNumbers: true, bigNumberStrings: true });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  private async transaction<T>(action: (db: PoolConnection) => Promise<T>): Promise<T> {
    const db = await this.pool.getConnection();
    try { await db.beginTransaction(); const result = await action(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  async latest(shipmentId: number, customerId: number | null): Promise<SepayPayment | null> {
    const [orders] = await this.pool.execute<RowDataPacket[]>('SELECT customer_id FROM shipment WHERE shipment_id = ?', [shipmentId]);
    if (!orders.length) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (customerId !== null && Number(orders[0].customer_id) !== customerId) throw new ForbiddenException('Đơn hàng không thuộc tài khoản của bạn');
    const [rows] = await this.pool.execute<SepayPayment[]>(`SELECT p.*, s.status AS shipment_status,
      s.total_cost AS current_amount, s.customer_id AS shipment_customer_id
      FROM shipment_sepay_payment p JOIN shipment s ON s.shipment_id = p.shipment_id WHERE p.shipment_id = ?`, [shipmentId]);
    if (!rows[0]) return null;
    const gate = await paymentGate(this.pool, shipmentId);
    return { ...rows[0], payment_unlocked: gate.paymentUnlocked, gate_blocked_reason: gate.blockedReason };
  }

  async billing(shipmentId: number) {
    return paymentGate(this.pool, shipmentId);
  }

  async reserve(shipmentId: number, customerId: number, config: SepayConfig): Promise<SepayPayment> {
    return this.transaction(async db => {
      const [orders] = await db.execute<RowDataPacket[]>('SELECT customer_id, status, total_cost FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      if (!orders.length) throw new NotFoundException('Không tìm thấy đơn hàng');
      const order = orders[0];
      if (Number(order.customer_id) !== customerId) throw new ForbiddenException('Đơn hàng không thuộc tài khoản của bạn');
      const [existing] = await db.execute<SepayPayment[]>('SELECT * FROM shipment_sepay_payment WHERE shipment_id = ?', [shipmentId]);
      if (existing[0]?.status === 'succeeded') return existing[0];
      const gate = await paymentGate(db, shipmentId);
      if (!gate.paymentUnlocked) throw new BadRequestException(gate.blockedReason!);
      if (!PAYABLE_SHIPMENT_STATUSES.includes(order.status)) throw new BadRequestException('Đơn hàng phải được duyệt trước khi thanh toán');
      const amount = Number(order.total_cost);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9999999999999) throw new BadRequestException('Báo giá phải là số nguyên VND lớn hơn 0');
      if (existing.length) {
        const previous = existing[0];
        if (Number(previous.amount) !== amount || previous.account_number !== config.accountNumber || previous.bank_code !== config.bankCode ||
            !new RegExp(`^${config.prefix}[0-9]{${config.suffixLength}}$`).test(previous.payment_code)) {
          throw new ConflictException('Báo giá hoặc tài khoản nhận đã thay đổi. Vui lòng liên hệ bộ phận vận chuyển để đối soát trước khi thanh toán.');
        }
        return previous;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = config.prefix + String(randomInt(10 ** config.suffixLength)).padStart(config.suffixLength, '0');
        try {
          const [result] = await db.execute<ResultSetHeader>(`INSERT INTO shipment_sepay_payment
            (shipment_id, customer_id, payment_code, amount, bank_code, account_number, account_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [shipmentId, customerId, code, amount, config.bankCode, config.accountNumber, config.accountName]);
          const [rows] = await db.execute<SepayPayment[]>('SELECT * FROM shipment_sepay_payment WHERE payment_id = ?', [result.insertId]);
          return rows[0];
        } catch (error) { if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error; }
      }
      throw new ConflictException('Chưa tạo được mã thanh toán. Vui lòng thử lại.');
    });
  }

  async receive(payload: SepayTransaction, paymentCode: string | null, config: SepayConfig): Promise<number | null> {
    // Stable identity permits a retry with different JSON whitespace or key ordering.
    const hash = createHash('sha256').update(JSON.stringify([payload.id, payload.gateway.toUpperCase(), payload.accountNumber,
      payload.transferType, payload.transferAmount, paymentCode, payload.content, payload.referenceCode ?? ''])).digest('hex');
    try { return await this.transaction(async db => {
      const [known] = await db.execute<RowDataPacket[]>(`SELECT r.identity_hash, p.shipment_id FROM sepay_webhook_receipt r
        LEFT JOIN shipment_sepay_payment p ON p.payment_id = r.payment_id WHERE r.transaction_id = ?`, [payload.id]);
      if (known.length) {
        if (known[0].identity_hash !== hash) throw new ConflictException('Mã giao dịch đã tồn tại với dữ liệu khác');
        return known[0].shipment_id ? Number(known[0].shipment_id) : null;
      }
      // Always lock shipment before payment, matching reserve() to avoid lock inversion.
      const [matches] = paymentCode ? await db.execute<SepayPayment[]>('SELECT * FROM shipment_sepay_payment WHERE payment_code = ?', [paymentCode]) : [[]];
      let payment: SepayPayment | undefined = matches[0];
      let order: RowDataPacket | undefined;
      if (payment) {
        const [orders] = await db.execute<RowDataPacket[]>('SELECT customer_id, status, total_cost FROM shipment WHERE shipment_id = ? FOR UPDATE', [payment.shipment_id]);
        order = orders[0];
        const [locked] = await db.execute<SepayPayment[]>('SELECT * FROM shipment_sepay_payment WHERE payment_id = ? FOR UPDATE', [payment.payment_id]);
        payment = locked[0];
      }
      let outcome = 'unmatched';
      if (payload.transferType !== 'in' || payload.accountNumber !== config.accountNumber ||
          payload.gateway.replace(/[^A-Z0-9]/gi, '').toUpperCase() !== config.bankCode.replace(/[^A-Z0-9]/gi, '').toUpperCase()) outcome = 'ignored';
      else if (payment) {
        if (payment.status === 'succeeded') outcome = 'already_paid';
        else if (payment.status === 'review') outcome = 'review_required';
        else if (payment.account_number !== payload.accountNumber || payment.bank_code !== config.bankCode) outcome = 'account_mismatch';
        else if (!order || !PAYABLE_SHIPMENT_STATUSES.includes(order.status) || Number(order.customer_id) !== Number(payment.customer_id) || !(await paymentGate(db, payment.shipment_id)).paymentUnlocked) outcome = 'order_unavailable';
        else if (Number(order.total_cost) !== Number(payment.amount)) outcome = 'quote_changed';
        else if (Number(payment.amount) !== payload.transferAmount) outcome = 'amount_mismatch';
        else outcome = 'paid';
      }
      // Receipt uniqueness and settlement are committed together.
      await db.execute(`INSERT INTO sepay_webhook_receipt (transaction_id, payment_id, identity_hash, outcome, payload) VALUES (?, ?, ?, ?, ?)`,
        [payload.id, payment?.payment_id ?? null, hash, outcome, JSON.stringify(payload)]);
      if (payment && outcome === 'paid') {
        await db.execute(`UPDATE shipment_sepay_payment SET status = 'succeeded', transaction_id = ?, paid_at = CURRENT_TIMESTAMP(3) WHERE payment_id = ?`, [payload.id, payment.payment_id]);
        await db.execute(`INSERT INTO notification (user_id, shipment_id, title, message, notif_type, is_read)
          VALUES (?, ?, ?, ?, 'status_update', FALSE)`, [payment.customer_id, payment.shipment_id, 'Đã nhận thanh toán',
          `Đã nhận ${payload.transferAmount.toLocaleString('vi-VN')} VND qua SePay, mã ${payment.payment_code}.`]);
      } else if (payment && !['ignored', 'already_paid'].includes(outcome)) {
        await db.execute("UPDATE shipment_sepay_payment SET status = 'review' WHERE payment_id = ? AND status <> 'succeeded'", [payment.payment_id]);
      }
      return payment ? Number(payment.shipment_id) : null;
    }); } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
      const [known] = await this.pool.execute<RowDataPacket[]>(`SELECT r.identity_hash, p.shipment_id FROM sepay_webhook_receipt r
        LEFT JOIN shipment_sepay_payment p ON p.payment_id = r.payment_id WHERE r.transaction_id = ?`, [payload.id]);
      if (!known.length) throw error;
      if (known[0].identity_hash !== hash) throw new ConflictException('Mã giao dịch đã tồn tại với dữ liệu khác');
      return known[0].shipment_id ? Number(known[0].shipment_id) : null;
    }
  }
}
