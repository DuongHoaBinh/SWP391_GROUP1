import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { createPool, Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import {
  ALLOWED_OPERATIONAL_CANCEL_FROM,
  calculateOperationalRefund,
  CancellationCategory,
  CREDIT_VALIDITY_DAYS,
  RefundMode,
} from './refund-policy';
import { computeGraceDueAt, computePaymentDueAt } from './sla-timeline.policy';
import { releaseShipmentReservations } from '../fleet/vehicle-reservation';
import { transitionShipment } from './order-state-machine';

export interface DisbursementItem {
  id: number;
  shipmentId: number;
  authorityName: string;
  feeType: string;
  amount: number;
  authorityReceiptUrl: string | null;
  notes: string | null;
  settledStatus: string;
  recordedBy: number;
  recordedByName?: string;
  createdAt: string;
}

export interface RefundRecordItem {
  id: number;
  shipmentId: number;
  requestCode: string;
  customerId: number;
  customerName?: string;
  customerEmail?: string;
  cancellationCategory: string;
  refundMode: RefundMode;
  freightRefundAmount: number;
  insuranceRefundAmount: number;
  nonRefundableAirDeduction: number;
  disbursementDeduction: number;
  amount: number;
  receivableExcessAmount: number;
  status: string;
  requiresDualApproval: boolean;
  requestedBy: number;
  approvedBy: number | null;
  approvedAt: string | null;
  secondApprovedBy: number | null;
  secondApprovedAt: string | null;
  transferredBy: number | null;
  transferredAt: string | null;
  recipientBankAccount: string | null;
  recipientBankName: string | null;
  recipientAccountHolder: string | null;
  customerNote: string | null;
  formSubmittedAt: string | null;
  slaDueAt: string | null;
  bankTransactionRef: string | null;
  transferReceiptUrl: string | null;
  creditExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OrdersOpsStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) {
      this.pool = injectedPool;
    }
  }

  onModuleInit(): void {
    if (!this.pool) {
      this.pool = createPool({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 3306),
        database: process.env.DB_NAME ?? 'horse_transport_system',
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        connectionLimit: 10,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
      await this.pool.end();
    }
  }

  private async tx<T>(fn: (db: PoolConnection) => Promise<T>): Promise<T> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();
      const res = await fn(db);
      await db.commit();
      return res;
    } catch (err) {
      await db.rollback();
      throw err;
    } finally {
      db.release();
    }
  }

  async findOrderOwner(shipmentId: number): Promise<{ id: number; customerId: number; status: string; bookingType: string; totalCost: number; transportCost: number | null; insuranceFee: number } | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT shipment_id, customer_id, status, booking_type, total_cost, transport_cost, insurance_fee FROM shipment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.shipment_id),
      customerId: Number(r.customer_id),
      status: String(r.status),
      bookingType: String(r.booking_type || 'dedicated_charter'),
      totalCost: Number(r.total_cost || 0),
      transportCost: r.transport_cost == null ? null : Number(r.transport_cost),
      insuranceFee: Number(r.insurance_fee || 0),
    };
  }

  async createDisbursement(
    shipmentId: number,
    recordedBy: number,
    data: {
      authorityName: string;
      feeType: string;
      amount: number;
      authorityReceiptUrl?: string | null;
      notes?: string | null;
    },
  ): Promise<DisbursementItem> {
    const [orderRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT shipment_id, status FROM shipment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    if (!orderRows[0]) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    if (['cancelled', 'rejected'].includes(String(orderRows[0].status))) {
      throw new ConflictException('Không thể ghi nhận phí ứng trước cho đơn hàng đã hủy hoặc từ chối.');
    }

    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO shipment_disbursement (
        shipment_id, authority_name, fee_type, amount, authority_receipt_url, notes, settled_status, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'advanced', ?)`,
      [
        shipmentId,
        data.authorityName.trim(),
        data.feeType.trim(),
        Math.round(Number(data.amount)),
        data.authorityReceiptUrl ?? null,
        data.notes ?? null,
        recordedBy,
      ],
    );
    const list = await this.findDisbursementsByShipment(shipmentId);
    return list.find((d) => d.id === Number(res.insertId))!;
  }

  async findDisbursementsByShipment(shipmentId: number): Promise<DisbursementItem[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT d.*, u.full_name AS recorded_by_name
       FROM shipment_disbursement d
       LEFT JOIN \`user\` u ON u.user_id = d.recorded_by
       WHERE d.shipment_id = ?
       ORDER BY d.disbursement_id DESC`,
      [shipmentId],
    );
    return rows.map((r) => ({
      id: Number(r.disbursement_id),
      shipmentId: Number(r.shipment_id),
      authorityName: r.authority_name,
      feeType: r.fee_type,
      amount: Number(r.amount),
      authorityReceiptUrl: r.authority_receipt_url ?? null,
      notes: r.notes ?? null,
      settledStatus: r.settled_status,
      recordedBy: Number(r.recorded_by),
      recordedByName: r.recorded_by_name ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async findDisbursementById(disbursementId: number): Promise<(DisbursementItem & { customerId: number }) | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT d.*, s.customer_id, u.full_name AS recorded_by_name
       FROM shipment_disbursement d
       JOIN shipment s ON s.shipment_id = d.shipment_id
       LEFT JOIN \`user\` u ON u.user_id = d.recorded_by
       WHERE d.disbursement_id = ? LIMIT 1`,
      [disbursementId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.disbursement_id),
      shipmentId: Number(r.shipment_id),
      customerId: Number(r.customer_id),
      authorityName: r.authority_name,
      feeType: r.fee_type,
      amount: Number(r.amount),
      authorityReceiptUrl: r.authority_receipt_url ?? null,
      notes: r.notes ?? null,
      settledStatus: r.settled_status,
      recordedBy: Number(r.recorded_by),
      recordedByName: r.recorded_by_name ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async operationalCancel(
    actorId: number | null,
    shipmentId: number,
    data: {
      category: CancellationCategory;
      reason: string;
      refundMode?: RefundMode;
      nonRefundableAirCost?: number;
    },
  ): Promise<{
    shipmentId: number;
    customerId: number;
    status: 'cancelled_operational';
    paidAmount: number;
    refundRecord: RefundRecordItem | null;
  }> {
    return this.tx(async (db) => {
      const [orders] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [shipmentId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);

      const curStatus = String(order.status);
      if (curStatus === 'in_transit' || curStatus === 'return_pending') {
        throw new ConflictException(
          'Đơn hàng đang vận chuyển (in_transit / return_pending), cấm hủy vận hành. Vui lòng xử lý qua quy trình sự cố Flow 5.',
        );
      }
      if (!ALLOWED_OPERATIONAL_CANCEL_FROM.includes(curStatus as any)) {
        throw new ConflictException(
          `Không thể hủy vận hành khi đơn hàng đang ở trạng thái "${curStatus}". Chỉ cho phép từ: ${ALLOWED_OPERATIONAL_CANCEL_FROM.join(', ')}.`,
        );
      }

      const [paidRows] = await db.execute<RowDataPacket[]>(
        "SELECT COALESCE(SUM(amount), 0) AS paid_amount FROM shipment_sepay_payment WHERE shipment_id = ? AND status = 'succeeded'",
        [shipmentId],
      );
      let paidAmount = Math.round(Number(paidRows[0]?.paid_amount || 0));
      if (paidAmount <= 0) {
        const [paidInvRows] = await db.execute<RowDataPacket[]>(
          "SELECT COALESCE(SUM(amount), 0) AS inv_paid FROM shipment_invoice WHERE shipment_id = ? AND status = 'paid'",
          [shipmentId],
        );
        paidAmount = Math.round(Number(paidInvRows[0]?.inv_paid || 0));
      }

      const [disbRows] = await db.execute<RowDataPacket[]>(
        "SELECT COALESCE(SUM(amount), 0) AS total_disb FROM shipment_disbursement WHERE shipment_id = ? AND settled_status = 'advanced'",
        [shipmentId],
      );
      const verifiedDisbAmount = Math.round(Number(disbRows[0]?.total_disb || 0));

      const calc = calculateOperationalRefund({
        category: data.category,
        refundMode: data.refundMode,
        transportCost: Number(order.transport_cost ?? order.total_cost ?? 0),
        insuranceFee: Number(order.insurance_fee ?? 0),
        paidAmount,
        verifiedDisbursementAmount: verifiedDisbAmount,
        nonRefundableAirCost: data.nonRefundableAirCost ?? 0,
        departureAt: order.departure_date || order.requested_date,
        cancelledAt: new Date(),
      });

      await db.execute(
        `UPDATE shipment
         SET status = 'cancelled_operational',
             cancellation_category = ?,
             cancellation_reason = ?,
             cancelled_by = ?,
             cancelled_at = NOW(),
             payment_overdue = FALSE
         WHERE shipment_id = ?`,
        [data.category, data.reason.trim(), actorId, shipmentId],
      );

      // Step 9: nhả xe đã giữ chỗ của đơn
      await releaseShipmentReservations(db, shipmentId, 'cancelled_operational');

      // Cancel active route cleanly (route.plan_status ENUM ends at 'cancelled')
      await db.execute(
        "UPDATE route SET status = 'cancelled', plan_status = 'cancelled' WHERE shipment_id = ? AND status <> 'completed'",
        [shipmentId],
      );

      // Return horses back to active pool so they can be booked again immediately
      await db.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
           AND status NOT IN ('retired', 'deceased')`,
        [shipmentId],
      );

      // Release vehicles exclusively held by this shipment
      const [vehRows] = await db.execute<RowDataPacket[]>(
        `SELECT DISTINCT vehicle_id FROM (
          SELECT sv.vehicle_id FROM shipment_vehicle sv WHERE sv.shipment_id = ?
          UNION
          SELECT rl.vehicle_id FROM route_leg rl JOIN route r ON r.route_id = rl.route_id WHERE r.shipment_id = ? AND rl.vehicle_id IS NOT NULL
        ) t`,
        [shipmentId, shipmentId],
      );
      for (const vr of vehRows) {
        await db.execute(
          `UPDATE vehicle v
           SET v.status = 'available'
           WHERE v.vehicle_id = ?
             AND v.status = 'in_use'
             AND NOT EXISTS (
               SELECT 1 FROM shipment_vehicle sv
               JOIN shipment s ON s.shipment_id = sv.shipment_id
               WHERE sv.vehicle_id = v.vehicle_id
                 AND s.shipment_id <> ?
                 AND s.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded')
             )
             AND NOT EXISTS (
               SELECT 1 FROM route_leg rl
               JOIN route r ON r.route_id = rl.route_id
               JOIN shipment s ON s.shipment_id = r.shipment_id
               WHERE rl.vehicle_id = v.vehicle_id
                 AND s.shipment_id <> ?
                 AND rl.status <> 'completed'
                 AND s.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded')
             )`,
          [vr.vehicle_id, shipmentId, shipmentId],
        );
      }

      // Preserve succeeded payments & paid invoices immutably; cancel pending QRs and void unpaid invoices
      await db.execute(
        "UPDATE shipment_sepay_payment SET status = 'cancelled' WHERE shipment_id = ? AND status = 'pending'",
        [shipmentId],
      );
      await db.execute(
        "UPDATE shipment_invoice SET status = 'void' WHERE shipment_id = ? AND status IN ('active', 'overdue')",
        [shipmentId],
      );

      // Settle disbursements transparently
      if (verifiedDisbAmount > 0) {
        if (data.category === CancellationCategory.COMPANY_FAULT) {
          await db.execute(
            "UPDATE shipment_disbursement SET settled_status = 'absorbed_company_fault' WHERE shipment_id = ? AND settled_status = 'advanced'",
            [shipmentId],
          );
          const absorberUserId = actorId ?? Number(order.approved_by || order.customer_id);
          await db.execute(
            `INSERT INTO shipment_operating_cost (shipment_id, cost_category, amount, notes, recorded_by)
             VALUES (?, 'disbursement_absorbed_on_company_fault', ?, ?, ?)`,
            [
              shipmentId,
              verifiedDisbAmount,
              `Công ty tự chịu 100% phí cơ quan đã ứng trước do hủy lỗi vận hành (${data.category}).`,
              absorberUserId,
            ],
          );
        } else if (paidAmount > 0) {
          await db.execute(
            "UPDATE shipment_disbursement SET settled_status = 'deducted_from_refund' WHERE shipment_id = ? AND settled_status = 'advanced'",
            [shipmentId],
          );
        }
      }

      let refundId: number | null = null;
      if (paidAmount > 0 && calc.netRefundAmount > 0) {
        const requester = actorId ?? Number(order.approved_by || order.customer_id);
        const [refRes] = await db.execute<ResultSetHeader>(
          `INSERT INTO shipment_refund_record (
            shipment_id, customer_id, cancellation_category, refund_mode,
            freight_refund_amount, insurance_refund_amount, non_refundable_air_deduction,
            disbursement_deduction, amount, receivable_excess_amount,
            status, requires_dual_approval, requested_by, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)`,
          [
            shipmentId,
            Number(order.customer_id),
            data.category,
            calc.refundMode,
            calc.freightRefundAmount,
            calc.insuranceRefundAmount,
            calc.nonRefundableAirDeduction,
            calc.disbursementDeduction,
            calc.netRefundAmount,
            calc.receivableExcessAmount,
            0,
            requester,
            data.reason.trim(),
          ],
        );
        refundId = Number(refRes.insertId);
      }

      const refundRecord = refundId ? await this.findRefundByIdWithConn(db, refundId) : null;
      return {
        shipmentId,
        customerId: Number(order.customer_id),
        status: 'cancelled_operational' as const,
        paidAmount,
        refundRecord,
      };
    });
  }

  private mapRefundRow(r: RowDataPacket): RefundRecordItem {
    return {
      id: Number(r.refund_id),
      shipmentId: Number(r.shipment_id),
      requestCode: r.request_code || `REQ-${String(r.shipment_id).padStart(3, '0')}`,
      customerId: Number(r.customer_id),
      customerName: r.customer_name ?? undefined,
      customerEmail: r.customer_email ?? undefined,
      cancellationCategory: r.cancellation_category,
      refundMode: r.refund_mode as RefundMode,
      freightRefundAmount: Number(r.freight_refund_amount || 0),
      insuranceRefundAmount: Number(r.insurance_refund_amount || 0),
      nonRefundableAirDeduction: Number(r.non_refundable_air_deduction || 0),
      disbursementDeduction: Number(r.disbursement_deduction || 0),
      amount: Number(r.amount || 0),
      receivableExcessAmount: Number(r.receivable_excess_amount || 0),
      status: r.status,
      requiresDualApproval: Boolean(r.requires_dual_approval),
      requestedBy: Number(r.requested_by),
      approvedBy: r.approved_by == null ? null : Number(r.approved_by),
      approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      secondApprovedBy: r.second_approved_by == null ? null : Number(r.second_approved_by),
      secondApprovedAt: r.second_approved_at ? new Date(r.second_approved_at).toISOString() : null,
      transferredBy: r.transferred_by == null ? null : Number(r.transferred_by),
      transferredAt: r.transferred_at ? new Date(r.transferred_at).toISOString() : null,
      recipientBankAccount: r.recipient_bank_account ?? null,
      recipientBankName: r.recipient_bank_name ?? null,
      recipientAccountHolder: r.recipient_account_holder ?? null,
      customerNote: r.customer_note ?? null,
      formSubmittedAt: r.form_submitted_at ? new Date(r.form_submitted_at).toISOString() : null,
      slaDueAt: r.sla_due_at ? new Date(r.sla_due_at).toISOString() : null,
      bankTransactionRef: r.bank_transaction_ref ?? null,
      transferReceiptUrl: r.transfer_receipt_url ?? null,
      creditExpiresAt: r.credit_expires_at ? new Date(r.credit_expires_at).toISOString() : null,
      notes: r.notes ?? null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private async findRefundByIdWithConn(db: PoolConnection | Pool, refundId: number): Promise<RefundRecordItem | null> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT rr.*, u.full_name AS customer_name, u.email AS customer_email,
              CONCAT('REQ-', LPAD(rr.shipment_id, 3, '0')) AS request_code
       FROM shipment_refund_record rr
       LEFT JOIN \`user\` u ON u.user_id = rr.customer_id
       WHERE rr.refund_id = ? LIMIT 1`,
      [refundId],
    );
    return rows[0] ? this.mapRefundRow(rows[0]) : null;
  }

  async findRefundById(refundId: number): Promise<RefundRecordItem | null> {
    return this.findRefundByIdWithConn(this.pool, refundId);
  }

  async findRefunds(shipmentId?: number): Promise<RefundRecordItem[]> {
    let sql = `SELECT rr.*, u.full_name AS customer_name, u.email AS customer_email,
                      CONCAT('REQ-', LPAD(rr.shipment_id, 3, '0')) AS request_code
               FROM shipment_refund_record rr
               LEFT JOIN \`user\` u ON u.user_id = rr.customer_id`;
    const params: any[] = [];
    if (shipmentId !== undefined) {
      sql += ' WHERE rr.shipment_id = ?';
      params.push(shipmentId);
    }
    sql += ' ORDER BY rr.refund_id DESC';
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map((r) => this.mapRefundRow(r));
  }

  async approveRefund(
    refundId: number,
    approverId: number,
    decision: 'approve' | 'reject' = 'approve',
    notes?: string,
  ): Promise<RefundRecordItem> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE',
        [refundId],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException(`Không tìm thấy hồ sơ hoàn tiền #${refundId}`);

      if (decision === 'reject') {
        if (!['pending_approval', 'pending_second_approval'].includes(r.status)) {
          throw new ConflictException(`Không thể từ chối hồ sơ hoàn tiền đang ở trạng thái "${r.status}".`);
        }
        await db.execute(
          "UPDATE shipment_refund_record SET status = 'rejected', approved_by = COALESCE(approved_by, ?), approved_at = COALESCE(approved_at, NOW()), notes = COALESCE(?, notes) WHERE refund_id = ?",
          [approverId, notes ?? null, refundId],
        );
        return (await this.findRefundByIdWithConn(db, refundId))!;
      }

      if (r.status === 'pending_approval') {
        if (
          r.cancellation_category === 'insurance_claim' &&
          (!r.form_submitted_at || !String(r.recipient_bank_account || '').trim())
        ) {
          throw new ConflictException(
            'Khách hàng chưa điền thông tin tài khoản ngân hàng nhận bồi thường bảo hiểm. Vui lòng chờ khách hàng nộp biểu mẫu nhận tiền trước khi phê duyệt chi trả.',
          );
        }
        if (r.refund_mode === RefundMode.CREDIT_30D) {
          await db.execute(
            `UPDATE shipment_refund_record
             SET status = 'converted_to_credit',
                 approved_by = ?,
                 approved_at = NOW(),
                 credit_expires_at = DATE_ADD(NOW(), INTERVAL ${CREDIT_VALIDITY_DAYS} DAY),
                 notes = COALESCE(?, notes)
             WHERE refund_id = ?`,
            [approverId, notes ?? null, refundId],
          );
        } else {
          // 1 Logistics Manager duyệt là chuyển thẳng sang approved_for_transfer
          await db.execute(
            `UPDATE shipment_refund_record
             SET status = 'approved_for_transfer',
                 requires_dual_approval = 0,
                 approved_by = ?,
                 approved_at = NOW(),
                 notes = COALESCE(?, notes)
             WHERE refund_id = ?`,
            [approverId, notes ?? null, refundId],
          );
        }
        return (await this.findRefundByIdWithConn(db, refundId))!;
      }

      if (r.status === 'pending_second_approval') {
        // Giữ tương thích ngược cho bản ghi cũ còn treo ở pending_second_approval
        await db.execute(
          `UPDATE shipment_refund_record
           SET status = 'approved_for_transfer',
               requires_dual_approval = 0,
               second_approved_by = ?,
               second_approved_at = NOW(),
               notes = COALESCE(?, notes)
           WHERE refund_id = ?`,
          [approverId, notes ?? null, refundId],
        );
        return (await this.findRefundByIdWithConn(db, refundId))!;
      }

      throw new ConflictException(`Hồ sơ hoàn tiền #${refundId} đang ở trạng thái "${r.status}", không thể phê duyệt lại.`);
    });
  }

  async submitRefundBankInfo(
    refundId: number,
    customerId: number,
    dto: { bankName: string; accountNumber: string; accountHolder: string; note?: string },
  ): Promise<RefundRecordItem> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE',
        [refundId],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException(`Không tìm thấy hồ sơ hoàn tiền #${refundId}`);
      if (Number(r.customer_id) !== Number(customerId)) {
        throw new ForbiddenException('Bạn chỉ được điền thông tin tài khoản nhận hoàn tiền cho đơn hàng của mình.');
      }
      if (r.refund_mode !== RefundMode.CASH_REFUND || Number(r.amount || 0) <= 0) {
        throw new ConflictException('Hồ sơ hoàn tiền này không thuộc diện hoàn chuyển khoản ngân hàng.');
      }
      if (!['pending_approval', 'approved_for_transfer'].includes(String(r.status))) {
        throw new ConflictException(`Không thể nộp thông tin tài khoản ở trạng thái "${r.status}".`);
      }
      if (r.form_submitted_at && String(r.recipient_bank_account || '').trim()) {
        throw new ConflictException('Hồ sơ hoàn tiền này đã có thông tin tài khoản ngân hàng do chủ ngựa cung cấp.');
      }

      const slaDays = Math.max(1, Number(process.env.REFUND_SLA_BUSINESS_DAYS || 3));
      const slaDueAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

      await db.execute(
        `UPDATE shipment_refund_record
         SET recipient_bank_name = ?,
             recipient_bank_account = ?,
             recipient_account_holder = ?,
             customer_note = ?,
             form_submitted_at = NOW(),
             sla_due_at = COALESCE(sla_due_at, ?)
         WHERE refund_id = ?`,
        [
          dto.bankName.trim(),
          dto.accountNumber.trim(),
          dto.accountHolder.trim().toUpperCase(),
          dto.note?.trim() ?? null,
          slaDueAt,
          refundId,
        ],
      );

      return (await this.findRefundByIdWithConn(db, refundId))!;
    });
  }

  async transferRefund(
    refundId: number,
    transferrerId: number,
    data: {
      recipientBankAccount?: string;
      bankTransactionRef: string;
      transferReceiptUrl: string;
      notes?: string;
      actorRole?: string;
    },
  ): Promise<RefundRecordItem> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE',
        [refundId],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException(`Không tìm thấy hồ sơ hoàn tiền #${refundId}`);

      if (r.status !== 'approved_for_transfer') {
        throw new ConflictException(
          `Hồ sơ hoàn tiền phải ở trạng thái "approved_for_transfer" trước khi xác nhận chuyển khoản (hiện tại: "${r.status}").`,
        );
      }

      // Cách 1: Bắt buộc chủ ngựa đã điền form STK trước khi Manager chuyển khoản
      const existingAccount = String(r.recipient_bank_account || '').trim();
      if (r.refund_mode === RefundMode.CASH_REFUND && (!r.form_submitted_at || !existingAccount)) {
        throw new ConflictException(
          'Chủ ngựa chưa điền thông tin tài khoản ngân hàng nhận hoàn tiền. Vui lòng chờ khách hàng nộp biểu mẫu STK trước khi xác nhận chuyển khoản.',
        );
      }

      const effectiveBankAccount = existingAccount || String(data.recipientBankAccount || '').trim();
      if (!effectiveBankAccount) {
        throw new BadRequestException('Thiếu số tài khoản ngân hàng thụ hưởng để ghi nhận chuyển khoản.');
      }

      await db.execute(
        `UPDATE shipment_refund_record
         SET status = 'transferred',
             transferred_by = ?,
             transferred_at = NOW(),
             recipient_bank_account = ?,
             bank_transaction_ref = ?,
             transfer_receipt_url = ?,
             notes = COALESCE(?, notes)
         WHERE refund_id = ?`,
        [
          transferrerId,
          effectiveBankAccount,
          data.bankTransactionRef.trim(),
          data.transferReceiptUrl.trim(),
          data.notes ?? null,
          refundId,
        ],
      );

      // Step 6: If this refund belongs to an insurance_claim, transition claim to 'paid' and record claim event
      try {
        const [claimRows] = await db.execute<RowDataPacket[]>(
          'SELECT claim_id FROM insurance_claim WHERE refund_record_id = ?',
          [refundId],
        );
        if (claimRows && claimRows.length > 0) {
          const claimId = Number(claimRows[0].claim_id);
          await db.execute(
            "UPDATE insurance_claim SET status = 'paid' WHERE claim_id = ?",
            [claimId],
          );
          await db.execute(
            `INSERT INTO insurance_claim_event (claim_id, from_status, to_status, actor_id, note)
             VALUES (?, 'approved', 'paid', ?, 'Quản lý vận hành đã thực hiện chuyển tiền bồi thường bảo hiểm')`,
            [claimId, transferrerId],
          );
        }
      } catch (e) {
        // Continue if insurance_claim table not yet present in old tests
      }

      // Step 7: If this refund belongs to 'company_cannot_fulfil', transition shipment to 'refunded' and release horses
      if (r.cancellation_category === 'company_cannot_fulfil') {
        const sid = Number(r.shipment_id);
        try {
          await transitionShipment(db, {
            shipmentId: sid,
            to: 'refunded',
            actorId: transferrerId,
            actorRole: data.actorRole || 'LOGISTICS_MANAGER',
            reasonCode: 'refund_transferred',
            note: `Đã hoàn tất chuyển khoản hoàn tiền ${Number(r.amount).toLocaleString('vi-VN')} VND kèm UNC ${data.bankTransactionRef}`,
          });
        } catch {
          await db.execute("UPDATE shipment SET status = 'refunded' WHERE shipment_id = ?", [sid]);
          await releaseShipmentReservations(db, sid, 'refunded');
        }

        // Release horses
        await db.execute(
          `UPDATE horse h
           SET h.status = 'active'
           WHERE h.horse_id IN (
             SELECT sh.horse_id FROM shipment_horse sh WHERE sh.shipment_id = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM shipment_horse sh2
             JOIN shipment s2 ON s2.shipment_id = sh2.shipment_id
             WHERE sh2.horse_id = h.horse_id
               AND s2.shipment_id <> ?
               AND s2.status NOT IN ('cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded', 'completed')
           )`,
          [sid, sid],
        );

        // Notify Customer
        await db.execute(
          `INSERT INTO notification (user_id, shipment_id, title, message, notif_type, is_read)
           VALUES (?, ?, 'Hoàn tiền thành công', ?, 'status_update', FALSE)`,
          [
            r.customer_id,
            sid,
            `Khoản hoàn tiền 100% (${Number(r.amount).toLocaleString('vi-VN')} VND) của đơn #${sid} đã được chuyển khoản thành công. Quý khách có thể xem ủy nhiệm chi tại trang chi tiết đơn hàng.`,
          ],
        );
      }

      return (await this.findRefundByIdWithConn(db, refundId))!;
    });
  }

  async grantPaymentGrace(
    managerId: number,
    shipmentId: number,
    reason?: string,
  ): Promise<{ shipmentId: number; customerId: number; invoiceId: number; graceDueAt: string; graceCount: number }> {
    return this.tx(async (db) => {
      const [orders] = await db.execute<RowDataPacket[]>(
        'SELECT shipment_id, customer_id, status, departure_date, requested_date FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [shipmentId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
      if (!['awaiting_payment', 'confirmed', 'planning', 'ready_to_depart'].includes(order.status)) {
        throw new ConflictException(`Không thể gia hạn thanh toán khi đơn hàng đang ở trạng thái "${order.status}".`);
      }

      const [invRows] = await db.execute<RowDataPacket[]>(
        "SELECT * FROM shipment_invoice WHERE shipment_id = ? AND status IN ('active', 'overdue') ORDER BY invoice_id DESC LIMIT 1 FOR UPDATE",
        [shipmentId],
      );
      const inv = invRows[0];
      if (!inv) {
        throw new ConflictException('Không có hóa đơn chưa thanh toán nào đủ điều kiện gia hạn.');
      }

      if (Number(inv.grace_count || 0) >= 1) {
        throw new ConflictException('Đơn hàng đã sử dụng tối đa 1 lần gia hạn thanh toán (BR-F3-07). Không thể gia hạn thêm.');
      }

      const isOverdue =
        inv.status === 'overdue' ||
        (inv.payment_due_at && new Date(inv.payment_due_at).getTime() <= Date.now());
      if (!isOverdue) {
        throw new ConflictException('Chỉ được cấp gia hạn khi hóa đơn đã quá hạn payment_due_at.');
      }

      const now = new Date();
      const departureAt = order.departure_date || order.requested_date;
      const graceDueAt = computeGraceDueAt(now, departureAt);

      await db.execute(
        `UPDATE shipment_invoice
         SET status = 'overdue',
             grace_granted_at = ?,
             grace_due_at = ?,
             grace_count = grace_count + 1,
             grace_granted_by = ?
         WHERE invoice_id = ?`,
        [now, graceDueAt, managerId, inv.invoice_id],
      );
      await db.execute('UPDATE shipment SET payment_overdue = TRUE WHERE shipment_id = ?', [shipmentId]);

      return {
        shipmentId,
        customerId: Number(order.customer_id),
        invoiceId: Number(inv.invoice_id),
        graceDueAt: graceDueAt.toISOString(),
        graceCount: Number(inv.grace_count || 0) + 1,
        reason,
      };
    });
  }

  async runSlaSweepQueries() {
    const db = await this.pool.getConnection();
    try {
      // 1. Primary Driver SLA reminders (50%) and breaches -> Backup Pool Escalation
      const [pendingPrimary] = await db.execute<RowDataPacket[]>(
        `SELECT sa.assignment_id, sa.shipment_id, sa.user_id, sa.assigned_date, sa.sla_due_at,
                sa.sla_reminder_sent_at, sa.sla_escalated_at, s.customer_id
         FROM shipment_assignment sa
         JOIN shipment s ON s.shipment_id = sa.shipment_id
         WHERE sa.role_in_shipment IN ('driver', 'escort')
           AND sa.is_confirmed = FALSE
           AND COALESCE(sa.is_backup_pool, 0) = 0
           AND sa.sla_due_at IS NOT NULL
           AND s.status IN ('approved', 'planning')`,
      );

      const primaryReminders: Array<{ assignmentId: number; shipmentId: number; userId: number }> = [];
      const primaryBreaches: Array<{ assignmentId: number; shipmentId: number; userId: number }> = [];
      const nowMs = Date.now();

      for (const row of pendingPrimary) {
        const assignedMs = new Date(row.assigned_date).getTime();
        const dueMs = new Date(row.sla_due_at).getTime();
        const midMs = assignedMs + (dueMs - assignedMs) / 2;

        if (!row.sla_escalated_at && nowMs >= dueMs) {
          await db.execute(
            'UPDATE shipment_assignment SET sla_escalated_at = NOW() WHERE assignment_id = ? AND sla_escalated_at IS NULL',
            [row.assignment_id],
          );
          await db.execute(
            `UPDATE shipment
             SET sla_escalation_status = COALESCE(sla_escalation_status, 'backup_pool_escalated')
             WHERE shipment_id = ?`,
            [row.shipment_id],
          );
          primaryBreaches.push({
            assignmentId: Number(row.assignment_id),
            shipmentId: Number(row.shipment_id),
            userId: Number(row.user_id),
          });
        } else if (!row.sla_reminder_sent_at && !row.sla_escalated_at && nowMs >= midMs) {
          await db.execute(
            'UPDATE shipment_assignment SET sla_reminder_sent_at = NOW() WHERE assignment_id = ? AND sla_reminder_sent_at IS NULL',
            [row.assignment_id],
          );
          primaryReminders.push({
            assignmentId: Number(row.assignment_id),
            shipmentId: Number(row.shipment_id),
            userId: Number(row.user_id),
          });
        }
      }

      // 2. Hard Cap T - 52h breach without issued invoice -> BR-F3-06 HIGH alert
      const [hardCapRows] = await db.execute<RowDataPacket[]>(
        `SELECT s.shipment_id, COALESCE(s.departure_date, s.requested_date) AS dep_at
         FROM shipment s
         WHERE s.status IN ('approved', 'planning')
           AND COALESCE(s.departure_date, s.requested_date) IS NOT NULL
           AND COALESCE(s.departure_date, s.requested_date) <= DATE_ADD(NOW(), INTERVAL 52 HOUR)
           AND COALESCE(s.sla_escalation_status, '') <> 'hard_cap_breached'
           AND NOT EXISTS (
             SELECT 1 FROM shipment_invoice i WHERE i.shipment_id = s.shipment_id AND COALESCE(i.status, 'active') <> 'void'
           )`,
      );
      const hardCapShipmentIds: number[] = [];
      for (const hr of hardCapRows) {
        const sid = Number(hr.shipment_id);
        await db.execute(
          "UPDATE shipment SET sla_escalation_status = 'hard_cap_breached' WHERE shipment_id = ?",
          [sid],
        );
        hardCapShipmentIds.push(sid);
      }

      // 3. Payment reminders (-6h) & overdue transition
      const [invoiceRows] = await db.execute<RowDataPacket[]>(
        `SELECT i.invoice_id, i.shipment_id, i.customer_id, i.status, i.payment_due_at,
                i.grace_due_at, i.grace_count, i.payment_reminder_sent_at, s.status AS shipment_status
         FROM shipment_invoice i
         JOIN shipment s ON s.shipment_id = i.shipment_id
         WHERE i.status IN ('active', 'overdue')
           AND (
             s.status IN ('confirmed', 'planning', 'ready_to_depart')
             OR (i.invoice_type = 'supplemental' AND s.status IN ('in_transit', 'return_pending'))
           )
           AND i.payment_due_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM shipment_sepay_payment p
             WHERE p.shipment_id = s.shipment_id
               AND (p.invoice_id IS NULL OR p.invoice_id = i.invoice_id)
               AND p.status = 'succeeded'
           )`,
      );

      const paymentReminders: Array<{ shipmentId: number; customerId: number }> = [];
      const overdueMarked: Array<{ shipmentId: number; customerId: number }> = [];
      const expiredGraceShipmentIds: number[] = [];

      for (const inv of invoiceRows) {
        const sid = Number(inv.shipment_id);
        const cid = Number(inv.customer_id);
        const dueMs = new Date(inv.payment_due_at).getTime();

        if (inv.grace_count > 0 && inv.grace_due_at && nowMs >= new Date(inv.grace_due_at).getTime()) {
          expiredGraceShipmentIds.push(sid);
          continue;
        }

        if (inv.status === 'active' && nowMs >= dueMs) {
          await db.execute("UPDATE shipment_invoice SET status = 'overdue' WHERE invoice_id = ?", [inv.invoice_id]);
          await db.execute('UPDATE shipment SET payment_overdue = TRUE WHERE shipment_id = ?', [sid]);
          overdueMarked.push({ shipmentId: sid, customerId: cid });
        } else if (inv.status === 'active' && !inv.payment_reminder_sent_at && dueMs - nowMs <= 6 * 3600_000 && dueMs > nowMs) {
          await db.execute('UPDATE shipment_invoice SET payment_reminder_sent_at = NOW() WHERE invoice_id = ?', [inv.invoice_id]);
          paymentReminders.push({ shipmentId: sid, customerId: cid });
        }
      }

      // 4. Prepaid flow: check expired awaiting_payment shipments
      const prepaidAutoCancelled: Array<{ shipmentId: number; customerId: number }> = [];
      const prepaidReviewAlerts: Array<{ shipmentId: number; customerId: number }> = [];
      try {
        const [expiredPrepaidRows] = await db.execute<RowDataPacket[]>(
          `SELECT s.shipment_id, s.customer_id, s.status, s.payment_flow, s.payment_due_at
           FROM shipment s
           WHERE s.payment_flow = 'prepaid'
             AND s.status = 'awaiting_payment'
             AND s.payment_due_at IS NOT NULL
             AND s.payment_due_at < NOW()`,
        );

        for (const prep of expiredPrepaidRows) {
          const sid = Number(prep.shipment_id);
          const cid = Number(prep.customer_id);

          const [payRows] = await db.execute<RowDataPacket[]>(
            `SELECT status FROM shipment_sepay_payment WHERE shipment_id = ?`,
            [sid],
          );
          const hasSucceeded = payRows.some((p) => p.status === 'succeeded');
          const hasReview = payRows.some((p) => p.status === 'review');

          if (hasSucceeded) {
            continue;
          }

          if (hasReview) {
            prepaidReviewAlerts.push({ shipmentId: sid, customerId: cid });
            continue;
          }

          try {
            const windowHours = Math.max(1, Math.round((Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 720) / 60));
            await transitionShipment(db, {
              shipmentId: sid,
              to: 'cancelled',
              actorId: null,
              actorRole: 'SYSTEM',
              reasonCode: 'payment_expired',
              note: `Hết hạn thời gian thanh toán (${windowHours}h). Hệ thống tự động hủy đơn, nhả xe và hoàn trả ngựa.`,
            });

            await db.execute(
              `UPDATE shipment
               SET cancelled_at = COALESCE(cancelled_at, NOW()),
                   cancel_reason_code = 'payment_expired',
                   cancellation_reason = 'Hết hạn thời gian thanh toán (payment_expired)'
               WHERE shipment_id = ?`,
              [sid],
            );

            await db.execute(
              "UPDATE shipment_invoice SET status = 'void' WHERE shipment_id = ? AND status <> 'void'",
              [sid],
            );

            await db.execute(
              "UPDATE shipment_sepay_payment SET status = 'cancelled' WHERE shipment_id = ? AND status = 'pending'",
              [sid],
            );

            await db.execute(
              `UPDATE horse h
               SET h.status = 'active'
               WHERE h.horse_id IN (
                 SELECT sh.horse_id FROM shipment_horse sh WHERE sh.shipment_id = ?
               )
               AND NOT EXISTS (
                 SELECT 1 FROM shipment_horse sh2
                 JOIN shipment s2 ON s2.shipment_id = sh2.shipment_id
                 WHERE sh2.horse_id = h.horse_id
                   AND s2.shipment_id <> ?
                   AND s2.status NOT IN ('cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded', 'completed')
               )`,
              [sid, sid],
            );

            prepaidAutoCancelled.push({ shipmentId: sid, customerId: cid });
          } catch {
            // Ignore error per shipment
          }
        }
      } catch {
        // Table or columns might not exist in old unit test DB
      }

      return {
        primaryReminders,
        primaryBreaches,
        hardCapShipmentIds,
        paymentReminders,
        overdueMarked,
        expiredGraceShipmentIds: [...new Set(expiredGraceShipmentIds)],
        prepaidAutoCancelled,
        prepaidReviewAlerts,
      };
    } finally {
      db.release();
    }
  }
}
