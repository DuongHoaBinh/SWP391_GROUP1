import {
  ConflictException,
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
  ChangeCostAllocation,
  ChangeRequestRecord,
  ChangeRequestStatus,
  ChangeRequestType,
  IncidentRecord,
} from './incidents.types';

function formatReqCode(shipmentId: number): string {
  return `REQ-${String(shipmentId).padStart(3, '0')}`;
}

function safeParseJsonArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

@Injectable()
export class IncidentsStore implements OnModuleInit, OnModuleDestroy {
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
    await db.beginTransaction();
    try {
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

  private mapChangeRequestRow(r: RowDataPacket): ChangeRequestRecord {
    return {
      id: Number(r.change_id),
      shipmentId: Number(r.shipment_id),
      requestCode: formatReqCode(Number(r.shipment_id)),
      incidentId: r.incident_id ? Number(r.incident_id) : null,
      requestedBy: Number(r.requested_by),
      requestedByName: r.requester_name ?? undefined,
      approvedBy: r.approved_by ? Number(r.approved_by) : null,
      approvedByName: r.approver_name ?? undefined,
      changeType: r.change_type as ChangeRequestType,
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
      reason: r.reason,
      estimatedExtraCost: Number(r.estimated_extra_cost || 0),
      costAllocation: (r.cost_allocation || 'none') as ChangeCostAllocation,
      crossesNewBorder: Boolean(r.crosses_new_border),
      status: r.status as ChangeRequestStatus,
      decisionNotes: r.decision_notes ?? null,
      requestedAt: new Date(r.requested_at).toISOString(),
      approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
      publishedBy: r.published_by ? Number(r.published_by) : null,
      rippleNotifiedCount: Number(r.ripple_notified_count || 0),
    };
  }

  private mapIncidentRow(r: RowDataPacket): IncidentRecord {
    return {
      id: Number(r.incident_id),
      shipmentId: Number(r.shipment_id),
      requestCode: formatReqCode(Number(r.shipment_id)),
      reportedBy: Number(r.reported_by),
      reporterName: r.reporter_name || r.reporter_email || undefined,
      incidentType: r.incident_type,
      description: r.description,
      severity: r.severity,
      status: r.status,
      locationText: r.location_text ?? null,
      immediateActions: r.immediate_actions ?? null,
      resolutionNotes: r.resolution_notes ?? null,
      resolvedBy: r.resolved_by ? Number(r.resolved_by) : null,
      affectedBorderGate: r.affected_border_gate ?? null,
      evidenceUrls: safeParseJsonArray(r.evidence_urls_json),
      reportedAt: new Date(r.reported_at).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    };
  }

  async findShipmentSummary(shipmentId: number): Promise<{
    shipmentId: number;
    customerId: number;
    status: string;
    hasEmergencyVetCoverage: boolean;
    emergencyVetCapVnd: number | null;
    usedEmergencyVetCostVnd: number;
  } | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.shipment_id, s.customer_id, s.status,
              EXISTS(
                SELECT 1 FROM shipment_horse sh
                WHERE sh.shipment_id = s.shipment_id AND sh.emergency_vet_covered = TRUE
              ) AS has_vet_cover,
              EXISTS(
                SELECT 1 FROM shipment_horse sh
                WHERE sh.shipment_id = s.shipment_id
                  AND sh.emergency_vet_covered = TRUE
                  AND sh.insurance_package = 'premium'
              ) AS has_premium_vet,
              (
                SELECT COALESCE(SUM(cr.estimated_extra_cost), 0)
                FROM shipment_change_request cr
                WHERE cr.shipment_id = s.shipment_id
                  AND cr.cost_allocation = 'emergency_vet_covered'
                  AND cr.status IN ('pending', 'approved')
              ) AS used_vet_cost
       FROM shipment s
       WHERE s.shipment_id = ?
       LIMIT 1`,
      [shipmentId],
    );
    const r = rows[0];
    if (!r) return null;
    const hasVetCover = Boolean(r.has_vet_cover);
    const hasPremiumVet = Boolean(r.has_premium_vet);
    return {
      shipmentId: Number(r.shipment_id),
      customerId: Number(r.customer_id),
      status: String(r.status),
      hasEmergencyVetCoverage: hasVetCover,
      emergencyVetCapVnd: hasPremiumVet ? null : hasVetCover ? 20_000_000 : 0,
      usedEmergencyVetCostVnd: Number(r.used_vet_cost || 0),
    };
  }

  async isDriverAssigned(shipmentId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? LIMIT 1',
      [shipmentId, userId],
    );
    return rows.length > 0;
  }

  async findIncidents(filter: {
    shipmentId?: number;
    status?: string;
    customerId?: number;
    driverUserId?: number;
  }): Promise<IncidentRecord[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.shipmentId) {
      where.push('ir.shipment_id = ?');
      params.push(filter.shipmentId);
    }
    if (filter.status) {
      where.push('ir.status = ?');
      params.push(filter.status);
    }
    if (filter.customerId) {
      where.push('s.customer_id = ?');
      params.push(filter.customerId);
    }
    if (filter.driverUserId) {
      where.push(
        'EXISTS (SELECT 1 FROM shipment_assignment sa WHERE sa.shipment_id = ir.shipment_id AND sa.user_id = ?)',
      );
      params.push(filter.driverUserId);
    }

    const sql = `
      SELECT ir.*, u.full_name AS reporter_name, u.email AS reporter_email
      FROM incident_report ir
      JOIN shipment s ON s.shipment_id = ir.shipment_id
      LEFT JOIN \`user\` u ON u.user_id = ir.reported_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ir.incident_id DESC
      LIMIT 200
    `;
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map((r) => this.mapIncidentRow(r));
  }

  async findIncidentById(incidentId: number): Promise<(IncidentRecord & { customerId: number }) | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT ir.*, s.customer_id, u.full_name AS reporter_name, u.email AS reporter_email
       FROM incident_report ir
       JOIN shipment s ON s.shipment_id = ir.shipment_id
       LEFT JOIN \`user\` u ON u.user_id = ir.reported_by
       WHERE ir.incident_id = ?
       LIMIT 1`,
      [incidentId],
    );
    const r = rows[0];
    if (!r) return null;

    const changeRequests = await this.findChangeRequests({ incidentId });
    return {
      ...this.mapIncidentRow(r),
      customerId: Number(r.customer_id),
      changeRequests,
    };
  }

  async createIncident(data: {
    shipmentId: number;
    reportedBy: number;
    incidentType: string;
    description: string;
    severity: string;
    locationText?: string | null;
    affectedBorderGate?: string | null;
    evidenceUrls: string[];
  }): Promise<IncidentRecord> {
    return this.tx(async (db) => {
      const [res] = await db.execute<ResultSetHeader>(
        `INSERT INTO incident_report (
          shipment_id, reported_by, incident_type, description, severity, status,
          location_text, affected_border_gate, evidence_urls_json
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        [
          data.shipmentId,
          data.reportedBy,
          data.incidentType,
          data.description,
          data.severity,
          data.locationText ?? null,
          data.affectedBorderGate ?? null,
          data.evidenceUrls.length ? JSON.stringify(data.evidenceUrls) : null,
        ],
      );
      const incidentId = Number(res.insertId);
      for (const fileUrl of data.evidenceUrls) {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);
        await db.execute(
          `INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by)
           VALUES ('incident_report', ?, ?, ?, ?)`,
          [incidentId, fileUrl, isImg ? 'image' : 'document', data.reportedBy],
        );
      }
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT ir.*, u.full_name AS reporter_name, u.email AS reporter_email
         FROM incident_report ir
         LEFT JOIN \`user\` u ON u.user_id = ir.reported_by
         WHERE ir.incident_id = ?`,
        [incidentId],
      );
      return this.mapIncidentRow(rows[0]);
    });
  }

  async assessIncident(
    incidentId: number,
    immediateActions: string,
    severity?: string,
  ): Promise<IncidentRecord> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM incident_report WHERE incident_id = ? FOR UPDATE',
        [incidentId],
      );
      if (!rows[0]) throw new NotFoundException(`Không tìm thấy sự cố #${incidentId}`);
      if (['resolved', 'closed'].includes(rows[0].status)) {
        throw new ConflictException(`Sự cố #${incidentId} đã kết thúc (${rows[0].status}).`);
      }

      await db.execute(
        `UPDATE incident_report
         SET status = 'in_review',
             immediate_actions = ?,
             severity = COALESCE(?, severity)
         WHERE incident_id = ?`,
        [immediateActions, severity ?? null, incidentId],
      );

      const [updated] = await db.execute<RowDataPacket[]>(
        `SELECT ir.*, u.full_name AS reporter_name, u.email AS reporter_email
         FROM incident_report ir
         LEFT JOIN \`user\` u ON u.user_id = ir.reported_by
         WHERE ir.incident_id = ?`,
        [incidentId],
      );
      return this.mapIncidentRow(updated[0]);
    });
  }

  async resolveIncident(
    incidentId: number,
    resolvedBy: number,
    resolutionNotes: string,
    close = false,
  ): Promise<IncidentRecord> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM incident_report WHERE incident_id = ? FOR UPDATE',
        [incidentId],
      );
      if (!rows[0]) throw new NotFoundException(`Không tìm thấy sự cố #${incidentId}`);
      const nextStatus = close ? 'closed' : 'resolved';
      await db.execute(
        `UPDATE incident_report
         SET status = ?,
             resolution_notes = ?,
             resolved_by = ?,
             resolved_at = COALESCE(resolved_at, NOW())
         WHERE incident_id = ?`,
        [nextStatus, resolutionNotes, resolvedBy, incidentId],
      );
      const [updated] = await db.execute<RowDataPacket[]>(
        `SELECT ir.*, u.full_name AS reporter_name, u.email AS reporter_email
         FROM incident_report ir
         LEFT JOIN \`user\` u ON u.user_id = ir.reported_by
         WHERE ir.incident_id = ?`,
        [incidentId],
      );
      return this.mapIncidentRow(updated[0]);
    });
  }

  async findChangeRequests(filter: {
    incidentId?: number;
    shipmentId?: number;
    status?: string;
  }): Promise<ChangeRequestRecord[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.incidentId) {
      where.push('cr.incident_id = ?');
      params.push(filter.incidentId);
    }
    if (filter.shipmentId) {
      where.push('cr.shipment_id = ?');
      params.push(filter.shipmentId);
    }
    if (filter.status) {
      where.push('cr.status = ?');
      params.push(filter.status);
    }

    const sql = `
      SELECT cr.*, req.full_name AS requester_name, app.full_name AS approver_name
      FROM shipment_change_request cr
      LEFT JOIN \`user\` req ON req.user_id = cr.requested_by
      LEFT JOIN \`user\` app ON app.user_id = cr.approved_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY cr.change_id DESC
      LIMIT 200
    `;
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map((r) => this.mapChangeRequestRow(r));
  }

  async createChangeRequest(data: {
    shipmentId: number;
    incidentId: number;
    requestedBy: number;
    changeType: ChangeRequestType;
    oldValue?: string | null;
    newValue?: string | null;
    reason: string;
    estimatedExtraCost: number;
    costAllocation: ChangeCostAllocation;
    crossesNewBorder: boolean;
  }): Promise<ChangeRequestRecord> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO shipment_change_request (
        shipment_id, incident_id, requested_by, change_type, old_value, new_value,
        reason, estimated_extra_cost, cost_allocation, crosses_new_border, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        data.shipmentId,
        data.incidentId,
        data.requestedBy,
        data.changeType,
        data.oldValue ?? null,
        data.newValue ?? null,
        data.reason,
        data.estimatedExtraCost,
        data.costAllocation,
        data.crossesNewBorder ? 1 : 0,
      ],
    );
    const created = await this.findChangeRequests({ incidentId: data.incidentId });
    return created.find((c) => c.id === Number(res.insertId)) || created[0];
  }

  async reviewChangeRequest(
    changeId: number,
    approverId: number,
    decision: 'approved' | 'rejected',
    decisionNotes?: string,
  ): Promise<{ record: ChangeRequestRecord; customerId: number }> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT cr.*, s.customer_id
         FROM shipment_change_request cr
         JOIN shipment s ON s.shipment_id = cr.shipment_id
         WHERE cr.change_id = ?
         FOR UPDATE`,
        [changeId],
      );
      const cr = rows[0];
      if (!cr) throw new NotFoundException(`Không tìm thấy đề xuất thay đổi #${changeId}`);
      if (cr.status !== 'pending') {
        throw new ConflictException(`Đề xuất #${changeId} đã ở trạng thái "${cr.status}", không thể duyệt lại.`);
      }

      await db.execute(
        `UPDATE shipment_change_request
         SET status = ?, approved_by = ?, approved_at = NOW(), decision_notes = ?
         WHERE change_id = ?`,
        [decision, approverId, decisionNotes ?? null, changeId],
      );

      // Flow 5 Invariant 2: Extra operating cost records separately into shipment_operating_cost without touching shipment_invoice
      if (
        decision === 'approved' &&
        cr.cost_allocation === 'operating_cost' &&
        Number(cr.estimated_extra_cost || 0) > 0
      ) {
        await db.execute(
          `INSERT INTO shipment_operating_cost (shipment_id, cost_category, amount, notes, recorded_by)
           VALUES (?, 'incident_absorbed', ?, ?, ?)`,
          [
            Number(cr.shipment_id),
            Number(cr.estimated_extra_cost),
            `Phát sinh từ đề xuất đổi tuyến/sự cố #${changeId}: ${cr.reason}`,
            approverId,
          ],
        );
      }

      const [updated] = await db.execute<RowDataPacket[]>(
        `SELECT cr.*, req.full_name AS requester_name, app.full_name AS approver_name
         FROM shipment_change_request cr
         LEFT JOIN \`user\` req ON req.user_id = cr.requested_by
         LEFT JOIN \`user\` app ON app.user_id = cr.approved_by
         WHERE cr.change_id = ?`,
        [changeId],
      );
      return {
        record: this.mapChangeRequestRow(updated[0]),
        customerId: Number(cr.customer_id),
      };
    });
  }

  async publishChangeRequest(
    changeId: number,
    publisherId: number,
  ): Promise<{
    record: ChangeRequestRecord;
    affectedBorderGate: string | null;
    affectedCustomers: Array<{ shipmentId: number; customerId: number; requestCode: string }>;
  }> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT cr.*, s.customer_id, ir.affected_border_gate
         FROM shipment_change_request cr
         JOIN shipment s ON s.shipment_id = cr.shipment_id
         LEFT JOIN incident_report ir ON ir.incident_id = cr.incident_id
         WHERE cr.change_id = ?
         FOR UPDATE`,
        [changeId],
      );
      const cr = rows[0];
      if (!cr) throw new NotFoundException(`Không tìm thấy đề xuất thay đổi #${changeId}`);
      if (cr.status !== 'approved') {
        throw new ConflictException(`Chỉ được xuất bản đề xuất đã được Manager phê duyệt (hiện tại: "${cr.status}").`);
      }
      if (cr.published_at) {
        throw new ConflictException(`Đề xuất thay đổi #${changeId} đã được xuất bản trước đó.`);
      }

      const [siblings] = await db.execute<RowDataPacket[]>(
        `SELECT DISTINCT s2.shipment_id, s2.customer_id
         FROM route r1
         JOIN route_leg rl1 ON rl1.route_id = r1.route_id
         JOIN route_leg rl2 ON rl2.road_trip_id = rl1.road_trip_id
         JOIN route r2 ON r2.route_id = rl2.route_id
         JOIN shipment s2 ON s2.shipment_id = r2.shipment_id
         WHERE r1.shipment_id = ?
           AND rl1.road_trip_id IS NOT NULL
           AND s2.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')`,
        [Number(cr.shipment_id)],
      );

      const map = new Map<number, { shipmentId: number; customerId: number; requestCode: string }>();
      const primarySid = Number(cr.shipment_id);
      map.set(primarySid, {
        shipmentId: primarySid,
        customerId: Number(cr.customer_id),
        requestCode: formatReqCode(primarySid),
      });
      for (const sib of siblings) {
        const sid = Number(sib.shipment_id);
        if (!map.has(sid)) {
          map.set(sid, {
            shipmentId: sid,
            customerId: Number(sib.customer_id),
            requestCode: formatReqCode(sid),
          });
        }
      }
      const affectedCustomers = Array.from(map.values());

      await db.execute(
        `UPDATE shipment_change_request
         SET published_at = NOW(), published_by = ?, ripple_notified_count = ?
         WHERE change_id = ?`,
        [publisherId, affectedCustomers.length, changeId],
      );

      const [updated] = await db.execute<RowDataPacket[]>(
        `SELECT cr.*, req.full_name AS requester_name, app.full_name AS approver_name
         FROM shipment_change_request cr
         LEFT JOIN \`user\` req ON req.user_id = cr.requested_by
         LEFT JOIN \`user\` app ON app.user_id = cr.approved_by
         WHERE cr.change_id = ?`,
        [changeId],
      );
      return {
        record: this.mapChangeRequestRow(updated[0]),
        affectedBorderGate: cr.affected_border_gate ?? null,
        affectedCustomers,
      };
    });
  }

  async isIncidentAttachmentAccessibleToUser(
    filename: string,
    userId: number,
    role: string,
  ): Promise<boolean> {
    const upper = String(role || '').toUpperCase();
    if (
      upper.includes('MANAGER') ||
      upper.includes('COORDINATOR') ||
      upper.includes('SPECIALIST') ||
      upper.includes('ADMIN')
    ) {
      return true;
    }
    const pattern = `%${filename}%`;
    if (upper === 'CUSTOMER') {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT 1 FROM incident_report ir
         JOIN shipment s ON s.shipment_id = ir.shipment_id
         WHERE s.customer_id = ? AND ir.evidence_urls_json LIKE ? LIMIT 1`,
        [userId, pattern],
      );
      return rows.length > 0;
    }
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM incident_report ir
       JOIN shipment_assignment sa ON sa.shipment_id = ir.shipment_id
       WHERE sa.user_id = ? AND ir.evidence_urls_json LIKE ? LIMIT 1`,
      [userId, pattern],
    );
    return rows.length > 0;
  }
}
