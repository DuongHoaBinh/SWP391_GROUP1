import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  DEFAULT_PAYOUT_RULES_V2,
  InsurancePackage,
  PayoutRule,
  Severity,
} from './insurance-policy';
import { InsuranceClaimEventItem, InsuranceClaimItem } from './insurance-claim.types';

@Injectable()
export class InsuranceClaimStore {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  private async tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private mapClaimRow(r: any): InsuranceClaimItem {
    let evidenceUrls: string[] = [];
    if (r.evidence_json) {
      try {
        evidenceUrls =
          typeof r.evidence_json === 'string'
            ? JSON.parse(r.evidence_json)
            : Array.isArray(r.evidence_json)
              ? r.evidence_json
              : [];
      } catch {
        evidenceUrls = [];
      }
    }

    return {
      id: Number(r.claim_id),
      shipmentId: Number(r.shipment_id),
      shipmentHorseId: Number(r.shipment_horse_id),
      customerId: Number(r.customer_id),
      severity: r.severity as Severity,
      description: r.description,
      vetCostVnd: r.vet_cost_vnd !== null && r.vet_cost_vnd !== undefined ? Number(r.vet_cost_vnd) : null,
      evidenceUrls,
      vetReportDocumentId: r.vet_report_document_id ? Number(r.vet_report_document_id) : null,
      requestedAmount: Number(r.requested_amount || 0),
      suggestedAmount: Number(r.suggested_amount || 0),
      approvedAmount: r.approved_amount !== null && r.approved_amount !== undefined ? Number(r.approved_amount) : null,
      policyVersion: r.policy_version,
      packageCode: r.package_code as InsurancePackage,
      declaredValueVnd: Number(r.declared_value_vnd || 0),
      status: r.status,
      rejectionReasonCode: r.rejection_reason_code ?? null,
      decisionReason: r.decision_reason ?? null,
      decidedBy: r.decided_by ? Number(r.decided_by) : null,
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      refundRecordId: r.refund_record_id ? Number(r.refund_record_id) : null,
      createdAt: new Date(r.created_at).toISOString(),
      horseName: r.horse_name ?? undefined,
      requestCode: r.request_code ?? `REQ-${String(r.shipment_id).padStart(3, '0')}`,
      customerName: r.customer_name ?? undefined,
      customerEmail: r.customer_email ?? undefined,
    };
  }

  async findHorseAndShipment(shipmentId: number, shipmentHorseId: number) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.shipment_id, s.customer_id, s.status AS shipment_status, s.updated_at AS shipment_updated_at,
              sh.shipment_horse_id, sh.declared_value_vnd, sh.insurance_package,
              sh.insurance_policy_version, h.name AS horse_name,
              dh.handover_id, dh.handover_datetime
       FROM shipment s
       JOIN shipment_horse sh ON sh.shipment_id = s.shipment_id AND sh.shipment_horse_id = ?
       JOIN horse h ON h.horse_id = sh.horse_id
       LEFT JOIN delivery_handover dh ON dh.shipment_id = s.shipment_id AND dh.shipment_horse_id = sh.shipment_horse_id
       WHERE s.shipment_id = ?
       LIMIT 1`,
      [shipmentHorseId, shipmentId],
    );

    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      shipmentId: Number(r.shipment_id),
      customerId: Number(r.customer_id),
      shipmentStatus: String(r.shipment_status),
      shipmentUpdatedAt: r.shipment_updated_at ? new Date(r.shipment_updated_at) : new Date(),
      shipmentHorseId: Number(r.shipment_horse_id),
      declaredValueVnd: Number(r.declared_value_vnd || 0),
      insurancePackage: (r.insurance_package || 'basic') as InsurancePackage,
      insurancePolicyVersion: (r.insurance_policy_version || 'equine-v2') as string,
      horseName: String(r.horse_name || ''),
      handoverId: r.handover_id ? Number(r.handover_id) : null,
      handoverDatetime: r.handover_datetime ? new Date(r.handover_datetime) : null,
    };
  }

  async findRulesByVersion(version: string): Promise<PayoutRule[]> {
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT package_code, severity, payout_type, percent_bps, cap_vnd
         FROM insurance_payout_rule
         WHERE policy_version = ?`,
        [version],
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          packageCode: r.package_code as InsurancePackage,
          severity: r.severity as Severity,
          payoutType: r.payout_type as 'percent_of_value' | 'vet_cost_capped',
          percentBps: r.percent_bps !== null ? Number(r.percent_bps) : null,
          capVnd: r.cap_vnd !== null ? Number(r.cap_vnd) : null,
        }));
      }
    } catch {
      // Table might not be migrated yet in mock tests
    }
    return DEFAULT_PAYOUT_RULES_V2;
  }

  async hasActiveClaimForHorse(shipmentHorseId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT claim_id FROM insurance_claim
       WHERE shipment_horse_id = ? AND status IN ('submitted', 'under_review')
       LIMIT 1`,
      [shipmentHorseId],
    );
    return rows && rows.length > 0;
  }

  async createClaim(data: {
    shipmentId: number;
    shipmentHorseId: number;
    customerId: number;
    severity: Severity;
    description: string;
    vetCostVnd: number | null;
    evidenceUrls: string[];
    vetReportDocumentId: number | null;
    requestedAmount: number;
    suggestedAmount: number;
    policyVersion: string;
    packageCode: InsurancePackage;
    declaredValueVnd: number;
  }): Promise<InsuranceClaimItem> {
    return this.tx(async (db) => {
      const [res] = await db.execute<ResultSetHeader>(
        `INSERT INTO insurance_claim (
           shipment_id, shipment_horse_id, customer_id, severity,
           description, vet_cost_vnd, evidence_json, vet_report_document_id,
           requested_amount, suggested_amount, policy_version, package_code,
           declared_value_vnd, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [
          data.shipmentId,
          data.shipmentHorseId,
          data.customerId,
          data.severity,
          data.description.trim(),
          data.vetCostVnd ?? null,
          data.evidenceUrls.length ? JSON.stringify(data.evidenceUrls) : null,
          data.vetReportDocumentId ?? null,
          data.requestedAmount,
          data.suggestedAmount,
          data.policyVersion,
          data.packageCode,
          data.declaredValueVnd,
        ],
      );

      const claimId = Number(res.insertId);

      await db.execute(
        `INSERT INTO insurance_claim_event (claim_id, from_status, to_status, actor_id, note)
         VALUES (?, NULL, 'submitted', ?, 'Khách hàng gửi yêu cầu bồi thường bảo hiểm')`,
        [claimId, data.customerId],
      );

      const created = await this.findClaimByIdWithConn(db, claimId);
      return created!;
    });
  }

  private async findClaimByIdWithConn(conn: PoolConnection | Pool, claimId: number): Promise<InsuranceClaimItem | null> {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT c.*, h.name AS horse_name, u.full_name AS customer_name, u.email AS customer_email,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) AS request_code
       FROM insurance_claim c
       JOIN shipment s ON s.shipment_id = c.shipment_id
       JOIN shipment_horse sh ON sh.shipment_horse_id = c.shipment_horse_id
       JOIN horse h ON h.horse_id = sh.horse_id
       JOIN \`user\` u ON u.user_id = c.customer_id
       WHERE c.claim_id = ?
       LIMIT 1`,
      [claimId],
    );
    if (!rows || rows.length === 0) return null;
    return this.mapClaimRow(rows[0]);
  }

  async findClaimById(claimId: number): Promise<InsuranceClaimItem | null> {
    return this.findClaimByIdWithConn(this.pool, claimId);
  }

  async findClaimEvents(claimId: number): Promise<InsuranceClaimEventItem[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT e.*, u.full_name AS actor_name
       FROM insurance_claim_event e
       LEFT JOIN \`user\` u ON u.user_id = e.actor_id
       WHERE e.claim_id = ?
       ORDER BY e.created_at ASC`,
      [claimId],
    );
    return (rows || []).map((r) => ({
      id: Number(r.event_id),
      claimId: Number(r.claim_id),
      fromStatus: r.from_status ?? null,
      toStatus: r.to_status,
      actorId: Number(r.actor_id),
      actorName: r.actor_name ?? undefined,
      note: r.note ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async listClaimsByShipment(shipmentId: number): Promise<InsuranceClaimItem[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT c.*, h.name AS horse_name, u.full_name AS customer_name, u.email AS customer_email,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) AS request_code
       FROM insurance_claim c
       JOIN shipment s ON s.shipment_id = c.shipment_id
       JOIN shipment_horse sh ON sh.shipment_horse_id = c.shipment_horse_id
       JOIN horse h ON h.horse_id = sh.horse_id
       JOIN \`user\` u ON u.user_id = c.customer_id
       WHERE c.shipment_id = ?
       ORDER BY c.created_at DESC`,
      [shipmentId],
    );
    return (rows || []).map((r) => this.mapClaimRow(r));
  }

  async listAllClaims(status?: string): Promise<InsuranceClaimItem[]> {
    let sql = `SELECT c.*, h.name AS horse_name, u.full_name AS customer_name, u.email AS customer_email,
                      CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) AS request_code
               FROM insurance_claim c
               JOIN shipment s ON s.shipment_id = c.shipment_id
               JOIN shipment_horse sh ON sh.shipment_horse_id = c.shipment_horse_id
               JOIN horse h ON h.horse_id = sh.horse_id
               JOIN \`user\` u ON u.user_id = c.customer_id`;
    const params: any[] = [];
    if (status && status.trim()) {
      sql += ' WHERE c.status = ?';
      params.push(status.trim());
    }
    sql += ' ORDER BY c.created_at DESC';

    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return (rows || []).map((r) => this.mapClaimRow(r));
  }

  async reviewClaim(
    claimId: number,
    reviewerId: number,
    decision: 'start_review' | 'approve' | 'reject',
    approvedAmount?: number,
    rejectionReasonCode?: string,
    reason?: string,
  ): Promise<{ claim: InsuranceClaimItem; refundRecordId?: number }> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM insurance_claim WHERE claim_id = ? FOR UPDATE',
        [claimId],
      );
      const claim = rows[0];
      if (!claim) throw new NotFoundException(`Không tìm thấy yêu cầu bồi thường #${claimId}`);

      const currentStatus = String(claim.status);

      if (decision === 'start_review') {
        if (currentStatus !== 'submitted') {
          throw new ConflictException(
            `Chỉ có thể chuyển sang "under_review" từ trạng thái "submitted" (hiện tại: "${currentStatus}").`,
          );
        }
        await db.execute(
          "UPDATE insurance_claim SET status = 'under_review' WHERE claim_id = ?",
          [claimId],
        );
        await db.execute(
          `INSERT INTO insurance_claim_event (claim_id, from_status, to_status, actor_id, note)
           VALUES (?, 'submitted', 'under_review', ?, ?)`,
          [claimId, reviewerId, reason ?? 'Logistics Manager bắt đầu thẩm định hồ sơ'],
        );
        const updated = await this.findClaimByIdWithConn(db, claimId);
        return { claim: updated! };
      }

      if (decision === 'reject') {
        if (!['submitted', 'under_review'].includes(currentStatus)) {
          throw new ConflictException(
            `Không thể từ chối yêu cầu bồi thường đang ở trạng thái "${currentStatus}".`,
          );
        }
        if (!rejectionReasonCode || !rejectionReasonCode.trim()) {
          throw new BadRequestException('Bắt buộc chọn mã lý do từ chối (rejectionReasonCode).');
        }
        if (!reason || !reason.trim()) {
          throw new BadRequestException('Bắt buộc nhập lý do chi tiết khi từ chối bồi thường.');
        }

        await db.execute(
          `UPDATE insurance_claim
           SET status = 'rejected',
               rejection_reason_code = ?,
               decision_reason = ?,
               decided_by = ?,
               decided_at = NOW()
           WHERE claim_id = ?`,
          [rejectionReasonCode.trim(), reason.trim(), reviewerId, claimId],
        );

        await db.execute(
          `INSERT INTO insurance_claim_event (claim_id, from_status, to_status, actor_id, note)
           VALUES (?, ?, 'rejected', ?, ?)`,
          [claimId, currentStatus, reviewerId, `Từ chối bồi thường [${rejectionReasonCode}]: ${reason.trim()}`],
        );

        const updated = await this.findClaimByIdWithConn(db, claimId);
        return { claim: updated! };
      }

      if (decision === 'approve') {
        if (!['submitted', 'under_review'].includes(currentStatus)) {
          throw new ConflictException(
            `Không thể phê duyệt yêu cầu bồi thường đang ở trạng thái "${currentStatus}".`,
          );
        }
        if (!approvedAmount || approvedAmount <= 0) {
          throw new BadRequestException('Số tiền phê duyệt bồi thường phải lớn hơn 0.');
        }

        const requiresDualApproval = approvedAmount >= 20000000;

        // Insert into shipment_refund_record
        const [refRes] = await db.execute<ResultSetHeader>(
          `INSERT INTO shipment_refund_record (
             shipment_id, customer_id, cancellation_category, refund_mode,
             freight_refund_amount, insurance_refund_amount, non_refundable_air_deduction,
             disbursement_deduction, amount, receivable_excess_amount,
             status, requires_dual_approval, requested_by, notes
           ) VALUES (?, ?, 'insurance_claim', 'cash_refund', 0, ?, 0, 0, ?, 0, 'pending_approval', ?, ?, ?)`,
          [
            Number(claim.shipment_id),
            Number(claim.customer_id),
            approvedAmount,
            approvedAmount,
            requiresDualApproval ? 1 : 0,
            reviewerId,
            reason?.trim() || `Bồi thường bảo hiểm sự cố ${claim.severity} cho ngựa #${claim.shipment_horse_id}`,
          ],
        );

        const refundRecordId = Number(refRes.insertId);

        await db.execute(
          `UPDATE insurance_claim
           SET status = 'approved',
               approved_amount = ?,
               decision_reason = ?,
               decided_by = ?,
               decided_at = NOW(),
               refund_record_id = ?
           WHERE claim_id = ?`,
          [approvedAmount, reason?.trim() ?? null, reviewerId, refundRecordId, claimId],
        );

        await db.execute(
          `INSERT INTO insurance_claim_event (claim_id, from_status, to_status, actor_id, note)
           VALUES (?, ?, 'approved', ?, ?)`,
          [
            claimId,
            currentStatus,
            reviewerId,
            `Logistics Manager phê duyệt bồi thường ${approvedAmount.toLocaleString('vi-VN')} VND (Hồ sơ hoàn tiền #${refundRecordId})`,
          ],
        );

        const updated = await this.findClaimByIdWithConn(db, claimId);
        return { claim: updated!, refundRecordId };
      }

      throw new BadRequestException('Quyết định không hợp lệ');
    });
  }
}
