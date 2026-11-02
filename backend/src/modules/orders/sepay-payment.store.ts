import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  PaymentConfigEntity,
  PaymentHistoryEntity,
  PaymentRecordStatus,
  ShipmentInvoiceEntity,
  ShipmentPaymentEntity,
  UpdatePaymentConfigDto,
} from './sepay-payment.types';

@Injectable()
export class SepayPaymentStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit(): Promise<void> {
    this.pool = createPool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system',
      user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      connectionLimit: 10,
    });
    await this.ensureSchemaAndSeed();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async ensureSchemaAndSeed(): Promise<void> {
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_config (
          config_id INT PRIMARY KEY DEFAULT 1,
          bank_code VARCHAR(50) NOT NULL DEFAULT 'MBBank',
          bank_account_no VARCHAR(50) NOT NULL DEFAULT '0000123456789',
          bank_account_name VARCHAR(150) NOT NULL DEFAULT 'CONG TY VAN CHUYEN NGUA EQUITRANSIT',
          payment_code_prefix VARCHAR(20) NOT NULL DEFAULT 'EQT',
          expire_hours INT NOT NULL DEFAULT 48,
          updated_by INT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);

      const defaultBank = process.env.BANK_CODE || 'MBBank';
      const defaultAccNo = process.env.BANK_ACCOUNT_NO || '0000123456789';
      const defaultAccName = process.env.BANK_ACCOUNT_NAME || 'CONG TY VAN CHUYEN NGUA EQUITRANSIT';
      const defaultPrefix = process.env.PAYMENT_CODE_PREFIX || 'EQT';
      const defaultExpire = Number(process.env.PAYMENT_EXPIRE_HOURS || 48);

      await this.pool.execute(
        `INSERT IGNORE INTO payment_config (config_id, bank_code, bank_account_no, bank_account_name, payment_code_prefix, expire_hours)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [defaultBank, defaultAccNo, defaultAccName, defaultPrefix, defaultExpire],
      );

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS shipment_payment (
          payment_id INT AUTO_INCREMENT PRIMARY KEY,
          shipment_id INT NOT NULL UNIQUE,
          customer_id INT NOT NULL,
          payment_code VARCHAR(50) NOT NULL UNIQUE,
          amount BIGINT UNSIGNED NOT NULL,
          status ENUM('PENDING','AWAITING_CONFIRMATION','PAID','NEEDS_REVIEW','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
          expires_at DATETIME NOT NULL,
          paid_at DATETIME NULL,
          confirmed_by VARCHAR(60) NULL,
          sepay_transaction_id VARCHAR(64) NULL UNIQUE,
          reference_code VARCHAR(100) NULL,
          gateway VARCHAR(100) NULL,
          paid_amount BIGINT UNSIGNED NULL,
          raw_webhook_payload JSON NULL,
          created_by INT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_shipment_payment_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
          CONSTRAINT fk_shipment_payment_customer FOREIGN KEY (customer_id) REFERENCES \`user\`(user_id),
          INDEX idx_shipment_payment_status (status),
          INDEX idx_shipment_payment_code (payment_code)
        ) ENGINE=InnoDB
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS shipment_payment_history (
          history_id INT AUTO_INCREMENT PRIMARY KEY,
          payment_id INT NOT NULL,
          shipment_id INT NOT NULL,
          old_status VARCHAR(40) NULL,
          new_status VARCHAR(40) NOT NULL,
          actor VARCHAR(60) NOT NULL,
          notes VARCHAR(500) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_payment_history_payment FOREIGN KEY (payment_id) REFERENCES shipment_payment(payment_id) ON DELETE CASCADE,
          INDEX idx_payment_history_shipment (shipment_id)
        ) ENGINE=InnoDB
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS shipment_invoice (
          invoice_id INT AUTO_INCREMENT PRIMARY KEY,
          invoice_number VARCHAR(50) NOT NULL UNIQUE,
          payment_id INT NOT NULL UNIQUE,
          shipment_id INT NOT NULL UNIQUE,
          order_code VARCHAR(30) NOT NULL,
          payer_name VARCHAR(150) NOT NULL,
          payer_email VARCHAR(150) NULL,
          paid_at DATETIME NOT NULL,
          amount BIGINT UNSIGNED NOT NULL,
          transfer_content VARCHAR(150) NOT NULL,
          bank_code VARCHAR(50) NOT NULL,
          bank_account_no VARCHAR(50) NOT NULL,
          bank_account_name VARCHAR(150) NOT NULL,
          confirmed_by VARCHAR(60) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_invoice_payment FOREIGN KEY (payment_id) REFERENCES shipment_payment(payment_id) ON DELETE CASCADE,
          CONSTRAINT fk_invoice_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id)
        ) ENGINE=InnoDB
      `);

      await this.seedDemoPayments();
    } catch (err) {
      console.warn('[SepayPaymentStore] Warning during schema initialization:', err);
    }
  }

  private async seedDemoPayments(): Promise<void> {
    try {
      const config = await this.getConfig();
      const [rows] = await this.pool.execute<RowDataPacket[]>(`
        SELECT s.shipment_id, s.customer_id, s.total_cost, s.status, u.full_name, u.email
        FROM shipment s
        JOIN \`user\` u ON u.user_id = s.customer_id
        WHERE s.status IN ('ready_to_depart', 'in_transit', 'completed') AND s.total_cost > 0
      `);

      for (const r of rows) {
        const shipmentId = Number(r.shipment_id);
        const existing = await this.findByShipmentId(shipmentId);
        if (existing) continue;

        const rawCost = Number(r.total_cost || 0);
        const amountVnd = rawCost > 0 && rawCost < 100000 ? Math.round(rawCost * 25400) : Math.round(rawCost);
        if (amountVnd <= 0) continue;

        const paymentCode = `${config.paymentCodePrefix}${String(shipmentId).padStart(3, '0')}`;
        const orderCode = `REQ-${String(shipmentId).padStart(3, '0')}`;
        const invoiceNumber = `INV-2026-${String(shipmentId).padStart(4, '0')}`;
        const sepayTxId = `SEED-${shipmentId}`;

        const [ins] = await this.pool.execute<ResultSetHeader>(
          `INSERT IGNORE INTO shipment_payment
            (shipment_id, customer_id, payment_code, amount, status, expires_at, paid_at, confirmed_by, sepay_transaction_id, reference_code, gateway, paid_amount, created_by)
           VALUES (?, ?, ?, ?, 'PAID', DATE_ADD(NOW(), INTERVAL 48 HOUR), NOW(), 'WEBHOOK', ?, ?, ?, ?, 1)`,
          [shipmentId, r.customer_id, paymentCode, amountVnd, sepayTxId, `FT2600${shipmentId}`, config.bankCode, amountVnd],
        );

        if (ins.insertId) {
          await this.pool.execute(
            `INSERT IGNORE INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
             VALUES (?, ?, 'PENDING', 'PAID', 'WEBHOOK', 'Tự động xác nhận qua SePay Webhook')`,
            [ins.insertId, shipmentId],
          );

          await this.pool.execute(
            `INSERT IGNORE INTO shipment_invoice
              (invoice_number, payment_id, shipment_id, order_code, payer_name, payer_email, paid_at, amount, transfer_content, bank_code, bank_account_no, bank_account_name, confirmed_by)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, 'WEBHOOK')`,
            [
              invoiceNumber,
              ins.insertId,
              shipmentId,
              orderCode,
              r.full_name || 'Khách hàng',
              r.email || null,
              amountVnd,
              paymentCode,
              config.bankCode,
              config.bankAccountNo,
              config.bankAccountName,
            ],
          );
        }
      }
    } catch (err) {
      console.warn('[SepayPaymentStore] Seed demo payments skipped:', err);
    }
  }

  private mapPayment(r: RowDataPacket): ShipmentPaymentEntity {
    return {
      paymentId: Number(r.payment_id),
      shipmentId: Number(r.shipment_id),
      customerId: Number(r.customer_id),
      paymentCode: String(r.payment_code),
      amount: Number(r.amount),
      status: r.status as PaymentRecordStatus,
      expiresAt: new Date(r.expires_at).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
      confirmedBy: r.confirmed_by ?? null,
      sepayTransactionId: r.sepay_transaction_id ?? null,
      referenceCode: r.reference_code ?? null,
      gateway: r.gateway ?? null,
      paidAmount: r.paid_amount != null ? Number(r.paid_amount) : null,
      rawWebhookPayload: r.raw_webhook_payload ?? null,
      createdBy: r.created_by != null ? Number(r.created_by) : null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private mapInvoice(r: RowDataPacket): ShipmentInvoiceEntity {
    return {
      invoiceId: Number(r.invoice_id),
      invoiceNumber: String(r.invoice_number),
      paymentId: Number(r.payment_id),
      shipmentId: Number(r.shipment_id),
      orderCode: String(r.order_code),
      payerName: String(r.payer_name),
      payerEmail: r.payer_email ?? null,
      paidAt: new Date(r.paid_at).toISOString(),
      amount: Number(r.amount),
      transferContent: String(r.transfer_content),
      bankCode: String(r.bank_code),
      bankAccountNo: String(r.bank_account_no),
      bankAccountName: String(r.bank_account_name),
      confirmedBy: String(r.confirmed_by),
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async getConfig(): Promise<PaymentConfigEntity> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM payment_config WHERE config_id = 1 LIMIT 1',
    );
    const r = rows[0];
    if (!r) {
      return {
        configId: 1,
        bankCode: process.env.BANK_CODE || 'MBBank',
        bankAccountNo: process.env.BANK_ACCOUNT_NO || '0000123456789',
        bankAccountName: process.env.BANK_ACCOUNT_NAME || 'CONG TY VAN CHUYEN NGUA EQUITRANSIT',
        paymentCodePrefix: process.env.PAYMENT_CODE_PREFIX || 'EQT',
        expireHours: Number(process.env.PAYMENT_EXPIRE_HOURS || 48),
        updatedBy: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      configId: Number(r.config_id),
      bankCode: String(r.bank_code),
      bankAccountNo: String(r.bank_account_no),
      bankAccountName: String(r.bank_account_name),
      paymentCodePrefix: String(r.payment_code_prefix || 'EQT'),
      expireHours: Number(r.expire_hours || 48),
      updatedBy: r.updated_by != null ? Number(r.updated_by) : null,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  async updateConfig(userId: number, dto: UpdatePaymentConfigDto): Promise<PaymentConfigEntity> {
    const prefix = (dto.paymentCodePrefix || 'EQT').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'EQT';
    const expireHours = dto.expireHours ?? 48;
    await this.pool.execute(
      `UPDATE payment_config
       SET bank_code = ?, bank_account_no = ?, bank_account_name = ?, payment_code_prefix = ?, expire_hours = ?, updated_by = ?, updated_at = NOW()
       WHERE config_id = 1`,
      [
        dto.bankCode.trim(),
        dto.bankAccountNo.trim(),
        dto.bankAccountName.trim().toUpperCase(),
        prefix,
        expireHours,
        userId,
      ],
    );
    return this.getConfig();
  }

  async findByShipmentId(shipmentId: number): Promise<ShipmentPaymentEntity | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM shipment_payment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findByPaymentCode(paymentCode: string): Promise<ShipmentPaymentEntity | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM shipment_payment WHERE UPPER(payment_code) = UPPER(?) LIMIT 1',
      [paymentCode.trim()],
    );
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findAllActivePayments(): Promise<ShipmentPaymentEntity[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM shipment_payment ORDER BY updated_at DESC',
    );
    return rows.map((r) => this.mapPayment(r));
  }

  async findInvoiceByShipmentId(shipmentId: number): Promise<ShipmentInvoiceEntity | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM shipment_invoice WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    return rows[0] ? this.mapInvoice(rows[0]) : null;
  }

  async findHistoryByShipmentId(shipmentId: number): Promise<PaymentHistoryEntity[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM shipment_payment_history WHERE shipment_id = ? ORDER BY history_id DESC',
      [shipmentId],
    );
    return rows.map((r) => ({
      historyId: Number(r.history_id),
      paymentId: Number(r.payment_id),
      shipmentId: Number(r.shipment_id),
      oldStatus: r.old_status ?? null,
      newStatus: String(r.new_status),
      actor: String(r.actor),
      notes: r.notes ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async isPaymentPaid(shipmentId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM shipment_payment WHERE shipment_id = ? AND status = 'PAID' LIMIT 1`,
      [shipmentId],
    );
    if (rows.length > 0) return true;

    try {
      const [momoRows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT 1 FROM shipment_sandbox_payment WHERE shipment_id = ? AND status = 'succeeded' LIMIT 1`,
        [shipmentId],
      );
      return momoRows.length > 0;
    } catch {
      return false;
    }
  }

  async hasExistingSepayTransaction(sepayTxId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM shipment_payment WHERE sepay_transaction_id = ? LIMIT 1',
      [sepayTxId],
    );
    return rows.length > 0;
  }

  async createOrRenewPaymentRequest(params: {
    shipmentId: number;
    customerId: number;
    amount: number;
    paymentCode: string;
    expireHours: number;
    managerId: number;
  }): Promise<ShipmentPaymentEntity> {
    const existing = await this.findByShipmentId(params.shipmentId);
    if (!existing) {
      const [res] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO shipment_payment
          (shipment_id, customer_id, payment_code, amount, status, expires_at, created_by)
         VALUES (?, ?, ?, ?, 'PENDING', DATE_ADD(NOW(), INTERVAL ? HOUR), ?)`,
        [
          params.shipmentId,
          params.customerId,
          params.paymentCode,
          params.amount,
          params.expireHours,
          params.managerId,
        ],
      );
      await this.pool.execute(
        `INSERT INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
         VALUES (?, ?, NULL, 'PENDING', ?, ?)`,
        [
          res.insertId,
          params.shipmentId,
          `MANAGER:${params.managerId}`,
          `Manager gửi yêu cầu thanh toán (Mã: ${params.paymentCode}, Số tiền: ${params.amount.toLocaleString('vi-VN')} VND)`,
        ],
      );
    } else {
      await this.pool.execute(
        `UPDATE shipment_payment
         SET payment_code = ?, amount = ?, status = 'PENDING', expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
             created_by = ?, updated_at = NOW()
         WHERE payment_id = ?`,
        [params.paymentCode, params.amount, params.expireHours, params.managerId, existing.paymentId],
      );
      await this.pool.execute(
        `INSERT INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
         VALUES (?, ?, ?, 'PENDING', ?, ?)`,
        [
          existing.paymentId,
          params.shipmentId,
          existing.status,
          `MANAGER:${params.managerId}`,
          `Manager gửi lại/gia hạn yêu cầu thanh toán (Mã mới: ${params.paymentCode})`,
        ],
      );
    }
    return (await this.findByShipmentId(params.shipmentId))!;
  }

  async updateStatus(params: {
    paymentId: number;
    shipmentId: number;
    oldStatus: string;
    newStatus: PaymentRecordStatus;
    actor: string;
    notes?: string;
  }): Promise<ShipmentPaymentEntity> {
    await this.pool.execute(
      `UPDATE shipment_payment SET status = ?, updated_at = NOW() WHERE payment_id = ?`,
      [params.newStatus, params.paymentId],
    );
    await this.pool.execute(
      `INSERT INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.paymentId,
        params.shipmentId,
        params.oldStatus,
        params.newStatus,
        params.actor,
        params.notes ?? null,
      ],
    );
    return (await this.findByShipmentId(params.shipmentId))!;
  }

  async markNeedsReview(params: {
    paymentId: number;
    shipmentId: number;
    oldStatus: string;
    sepayTxId: string;
    referenceCode: string | null;
    gateway: string | null;
    paidAmount: number;
    rawPayload: any;
  }): Promise<ShipmentPaymentEntity> {
    const conn: PoolConnection = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE shipment_payment
         SET status = 'NEEDS_REVIEW',
             sepay_transaction_id = ?,
             reference_code = ?,
             gateway = ?,
             paid_amount = ?,
             raw_webhook_payload = ?,
             updated_at = NOW()
         WHERE payment_id = ?`,
        [
          params.sepayTxId,
          params.referenceCode,
          params.gateway,
          params.paidAmount,
          JSON.stringify(params.rawPayload ?? {}),
          params.paymentId,
        ],
      );
      await conn.execute(
        `INSERT INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
         VALUES (?, ?, ?, 'NEEDS_REVIEW', 'WEBHOOK', ?)`,
        [
          params.paymentId,
          params.shipmentId,
          params.oldStatus,
          `Nhận chuyển khoản lệch số tiền: Nhận ${params.paidAmount.toLocaleString('vi-VN')} VND (Mã GD SePay: ${params.sepayTxId})`,
        ],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return (await this.findByShipmentId(params.shipmentId))!;
  }

  async markPaidAndCreateInvoice(params: {
    payment: ShipmentPaymentEntity;
    confirmedBy: string;
    sepayTxId?: string | null;
    referenceCode?: string | null;
    gateway?: string | null;
    paidAmount: number;
    rawPayload?: any;
    orderCode: string;
    payerName: string;
    payerEmail: string | null;
    config: PaymentConfigEntity;
    notes?: string;
    isFlow2Completed?: boolean;
  }): Promise<{ payment: ShipmentPaymentEntity; invoice: ShipmentInvoiceEntity; unlockedReadyToDepart: boolean }> {
    const conn: PoolConnection = await this.pool.getConnection();
    let unlockedReadyToDepart = false;
    try {
      await conn.beginTransaction();

      await conn.execute(
        `UPDATE shipment_payment
         SET status = 'PAID',
             paid_at = NOW(),
             confirmed_by = ?,
             sepay_transaction_id = COALESCE(?, sepay_transaction_id),
             reference_code = COALESCE(?, reference_code),
             gateway = COALESCE(?, gateway),
             paid_amount = ?,
             raw_webhook_payload = COALESCE(?, raw_webhook_payload),
             updated_at = NOW()
         WHERE payment_id = ?`,
        [
          params.confirmedBy,
          params.sepayTxId ?? null,
          params.referenceCode ?? null,
          params.gateway ?? params.config.bankCode,
          params.paidAmount,
          params.rawPayload ? JSON.stringify(params.rawPayload) : null,
          params.payment.paymentId,
        ],
      );

      await conn.execute(
        `INSERT INTO shipment_payment_history (payment_id, shipment_id, old_status, new_status, actor, notes)
         VALUES (?, ?, ?, 'PAID', ?, ?)`,
        [
          params.payment.paymentId,
          params.payment.shipmentId,
          params.payment.status,
          params.confirmedBy,
          params.notes || `Xác nhận thanh toán thành công (${params.paidAmount.toLocaleString('vi-VN')} VND)`,
        ],
      );

      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(params.payment.shipmentId).padStart(4, '0')}`;

      await conn.execute(
        `INSERT INTO shipment_invoice
          (invoice_number, payment_id, shipment_id, order_code, payer_name, payer_email, paid_at, amount, transfer_content, bank_code, bank_account_no, bank_account_name, confirmed_by)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          paid_at = NOW(),
          amount = VALUES(amount),
          confirmed_by = VALUES(confirmed_by)`,
        [
          invoiceNumber,
          params.payment.paymentId,
          params.payment.shipmentId,
          params.orderCode,
          params.payerName,
          params.payerEmail,
          params.paidAmount,
          params.payment.paymentCode,
          params.config.bankCode,
          params.config.bankAccountNo,
          params.config.bankAccountName,
          params.confirmedBy,
        ],
      );

      // Bước 7: Nếu kế hoạch lộ trình đã Confirmed VÀ Flow 2 hoàn tất -> Mở khóa cổng Ready to depart
      if (params.isFlow2Completed !== false) {
        const [routeRows] = await conn.execute<RowDataPacket[]>(
          `SELECT route_id, plan_status FROM route WHERE shipment_id = ? LIMIT 1`,
          [params.payment.shipmentId],
        );
        if (routeRows[0] && routeRows[0].plan_status === 'confirmed') {
          await conn.execute(
            `UPDATE route SET plan_status = 'ready_to_depart' WHERE route_id = ?`,
            [routeRows[0].route_id],
          );
          try {
            await conn.execute(
              `UPDATE shipment SET status = 'ready_to_depart', updated_at = NOW() WHERE shipment_id = ?`,
              [params.payment.shipmentId],
            );
          } catch {
            // Ignore if shipment.status ENUM does not include ready_to_depart on older schemas
          }
          unlockedReadyToDepart = true;
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const updatedPayment = (await this.findByShipmentId(params.payment.shipmentId))!;
    const invoice = (await this.findInvoiceByShipmentId(params.payment.shipmentId))!;
    return { payment: updatedPayment, invoice, unlockedReadyToDepart };
  }
}
