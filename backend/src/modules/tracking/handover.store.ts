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

export interface DeliveryHandoverRecord {
  id: number;
  shipmentId: number;
  requestCode: string;
  shipmentHorseId: number;
  direction: 'outbound' | 'return';
  horseId: number | null;
  horseName: string;
  microchipNo: string | null;
  passportNo: string | null;
  insurancePackage: string;
  maxCompensation: number;
  emergencyVetCovered: boolean;
  handedOverBy: number;
  handedOverByName?: string;
  receivedByName: string;
  handoverLocation: string | null;
  handoverDatetime: string;
  deliveredQuantity: number;
  horseConditionAtHandover: 'healthy' | 'minor_issue' | 'needs_attention';
  identityVerified: boolean;
  documentsHandedOver: boolean;
  customerSignatureUrl: string | null;
  evidenceUrls: string[];
  notes: string | null;
  disputeReason: string | null;
  status: 'pending' | 'confirmed' | 'disputed';
  confirmedBy: number | null;
  confirmedAt: string | null;
  resolutionNotes: string | null;
  compensationAmount: number;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

function safeParseArray(raw: unknown): string[] {
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
export class HandoverStore implements OnModuleInit, OnModuleDestroy {
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

  private mapRow(r: RowDataPacket): DeliveryHandoverRecord {
    const sid = Number(r.shipment_id);
    return {
      id: Number(r.handover_id),
      shipmentId: sid,
      requestCode: `REQ-${String(sid).padStart(3, '0')}`,
      shipmentHorseId: Number(r.shipment_horse_id),
      direction: (r.direction === 'return' ? 'return' : 'outbound') as 'outbound' | 'return',
      horseId: r.horse_id ? Number(r.horse_id) : null,
      horseName: r.horse_name || 'Ngựa đua',
      microchipNo: r.microchip_no ?? null,
      passportNo: r.passport_no ?? null,
      insurancePackage: r.insurance_package || 'basic',
      maxCompensation: Number(r.max_compensation || 0),
      emergencyVetCovered: Boolean(r.emergency_vet_covered),
      handedOverBy: Number(r.handed_over_by),
      handedOverByName: r.driver_name ?? undefined,
      receivedByName: r.received_by_name,
      handoverLocation: r.handover_location ?? null,
      handoverDatetime: new Date(r.handover_datetime).toISOString(),
      deliveredQuantity: Number(r.delivered_quantity || 1),
      horseConditionAtHandover: (r.horse_condition_at_handover || 'healthy') as any,
      identityVerified: Boolean(r.identity_verified),
      documentsHandedOver: Boolean(r.documents_handed_over),
      customerSignatureUrl: r.customer_signature_url ?? null,
      evidenceUrls: safeParseArray(r.evidence_urls_json),
      notes: r.notes ?? null,
      disputeReason: r.dispute_reason ?? null,
      status: (r.status || 'pending') as any,
      confirmedBy: r.confirmed_by ? Number(r.confirmed_by) : null,
      confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
      resolutionNotes: r.resolution_notes ?? null,
      compensationAmount: Number(r.compensation_amount || 0),
      resolvedBy: r.resolved_by ? Number(r.resolved_by) : null,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  private baseSelectSql(whereClause: string): string {
    return `
      SELECT dh.*,
             COALESCE(sh.horse_id, sh_fb.horse_id) AS horse_id,
             COALESCE(sh.insurance_package, sh_fb.insurance_package) AS insurance_package,
             COALESCE(sh.max_compensation, sh_fb.max_compensation) AS max_compensation,
             COALESCE(sh.emergency_vet_covered, sh_fb.emergency_vet_covered) AS emergency_vet_covered,
             h.name AS horse_name, h.microchip_no, h.passport_no,
             s.customer_id, s.destination_location,
             u.full_name AS driver_name
      FROM delivery_handover dh
      JOIN shipment s ON s.shipment_id = dh.shipment_id
      LEFT JOIN shipment_horse sh ON sh.shipment_horse_id = dh.shipment_horse_id
      LEFT JOIN shipment_horse sh_fb
        ON (dh.shipment_horse_id IS NULL OR dh.shipment_horse_id = 0)
       AND sh_fb.shipment_id = dh.shipment_id
       AND sh_fb.shipment_horse_id = (
         SELECT MIN(sh3.shipment_horse_id) FROM shipment_horse sh3 WHERE sh3.shipment_id = dh.shipment_id
       )
      LEFT JOIN horse h ON h.horse_id = COALESCE(sh.horse_id, sh_fb.horse_id)
      LEFT JOIN \`user\` u ON u.user_id = dh.handed_over_by
      ${whereClause}
      ORDER BY dh.handover_id DESC
    `;
  }

  async isDriverOnlyForOverseasHandover(
    shipmentId: number,
    userId: number,
    direction: 'outbound' | 'return',
  ): Promise<boolean> {
    if (direction !== 'outbound') return false;
    const [crossLegs] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM route_leg rl
       JOIN route r ON r.route_id = rl.route_id
       WHERE r.shipment_id = ? AND rl.leg_type IN ('flight', 'sea')
       LIMIT 1`,
      [shipmentId],
    );
    if (!crossLegs.length) return false;
    const [roles] = await this.pool.execute<RowDataPacket[]>(
      'SELECT role_in_shipment FROM shipment_assignment WHERE shipment_id = ? AND user_id = ?',
      [shipmentId, userId],
    );
    const hasDriver = roles.some((r) => String(r.role_in_shipment) === 'driver');
    const hasEscort = roles.some((r) => String(r.role_in_shipment) === 'escort');
    return hasDriver && !hasEscort;
  }

  async findShipmentOwner(shipmentId: number): Promise<{ customerId: number; status: string } | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT customer_id, status FROM shipment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    if (!rows[0]) return null;
    return { customerId: Number(rows[0].customer_id), status: String(rows[0].status) };
  }

  async isDriverAssigned(shipmentId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? LIMIT 1',
      [shipmentId, userId],
    );
    return rows.length > 0;
  }

  async findShipmentAndHorse(
    shipmentId: number,
    shipmentHorseId: number,
  ): Promise<{
    customerId: number;
    shipmentStatus: string;
    originLocation: string;
    destinationLocation: string;
    tripType: string;
    returnStatus: string;
    horseId: number;
    horseName: string;
    maxCompensation: number;
  } | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.customer_id, s.status AS shipment_status, s.origin_location, s.destination_location,
              s.trip_type, s.return_status,
              sh.horse_id, h.name AS horse_name, sh.max_compensation
       FROM shipment s
       JOIN shipment_horse sh ON sh.shipment_id = s.shipment_id
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE s.shipment_id = ? AND sh.shipment_horse_id = ?
       LIMIT 1`,
      [shipmentId, shipmentHorseId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      customerId: Number(r.customer_id),
      shipmentStatus: String(r.shipment_status),
      originLocation: String(r.origin_location || ''),
      destinationLocation: String(r.destination_location || ''),
      tripType: String(r.trip_type || 'one_way'),
      returnStatus: String(r.return_status || 'not_applicable'),
      horseId: Number(r.horse_id),
      horseName: String(r.horse_name),
      maxCompensation: Number(r.max_compensation || 0),
    };
  }

  async sumExistingClaimCompensation(shipmentHorseId: number): Promise<number> {
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(COALESCE(approved_amount, requested_amount)), 0) AS total_claimed
         FROM insurance_claim
         WHERE shipment_horse_id = ? AND status IN ('submitted', 'under_review', 'approved', 'paid')`,
        [shipmentHorseId],
      );
      return Number(rows[0]?.total_claimed || 0);
    } catch {
      return 0;
    }
  }

  async findHandoversByShipment(shipmentId: number): Promise<DeliveryHandoverRecord[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      this.baseSelectSql('WHERE dh.shipment_id = ?'),
      [shipmentId],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async findAllHandovers(status?: string): Promise<DeliveryHandoverRecord[]> {
    const params: any[] = [];
    const where = status ? 'WHERE dh.status = ?' : '';
    if (status) params.push(status);
    const [rows] = await this.pool.execute<RowDataPacket[]>(this.baseSelectSql(where), params);
    return rows.map((r) => this.mapRow(r));
  }

  async findHandoverWithOwner(handoverId: number): Promise<(DeliveryHandoverRecord & { customerId: number }) | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      this.baseSelectSql('WHERE dh.handover_id = ?'),
      [handoverId],
    );
    if (!rows[0]) return null;
    return {
      ...this.mapRow(rows[0]),
      customerId: Number(rows[0].customer_id),
    };
  }

  async createHandover(data: {
    shipmentId: number;
    shipmentHorseId: number;
    direction?: 'outbound' | 'return';
    handedOverBy: number;
    receivedByName: string;
    handoverLocation: string;
    handoverDatetime: Date;
    deliveredQuantity: number;
    horseConditionAtHandover: string;
    identityVerified: boolean;
    documentsHandedOver: boolean;
    notes: string | null;
    evidenceUrls: string[];
  }): Promise<DeliveryHandoverRecord> {
    const direction = data.direction === 'return' ? 'return' : 'outbound';
    return this.tx(async (db) => {
      const [existing] = await db.execute<RowDataPacket[]>(
        'SELECT handover_id FROM delivery_handover WHERE shipment_id = ? AND shipment_horse_id = ? AND direction = ? LIMIT 1 FOR UPDATE',
        [data.shipmentId, data.shipmentHorseId, direction],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Biên bản bàn giao chiều ${direction === 'return' ? 'về' : 'đi'} cho ngựa #${data.shipmentHorseId} trong chuyến #${data.shipmentId} đã tồn tại.`,
        );
      }

      const [res] = await db.execute<ResultSetHeader>(
        `INSERT INTO delivery_handover (
          shipment_id, shipment_horse_id, direction, handed_over_by, received_by_name, handover_location,
          handover_datetime, delivered_quantity, horse_condition_at_handover,
          identity_verified, documents_handed_over, evidence_urls_json, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          data.shipmentId,
          data.shipmentHorseId,
          direction,
          data.handedOverBy,
          data.receivedByName,
          data.handoverLocation,
          data.handoverDatetime,
          data.deliveredQuantity,
          data.horseConditionAtHandover,
          data.identityVerified ? 1 : 0,
          data.documentsHandedOver ? 1 : 0,
          data.evidenceUrls.length ? JSON.stringify(data.evidenceUrls) : null,
          data.notes,
        ],
      );
      const handoverId = Number(res.insertId);
      for (const fileUrl of data.evidenceUrls) {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);
        await db.execute(
          `INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by)
           VALUES ('delivery_handover', ?, ?, ?, ?)`,
          [handoverId, fileUrl, isImg ? 'image' : 'document', data.handedOverBy],
        );
      }
      const [rows] = await db.execute<RowDataPacket[]>(this.baseSelectSql('WHERE dh.handover_id = ?'), [handoverId]);
      return this.mapRow(rows[0]);
    });
  }

  async respondHandover(
    handoverId: number,
    responderId: number,
    data: {
      action: 'confirm' | 'dispute';
      horseConditionAtHandover?: string;
      identityVerified?: boolean;
      documentsHandedOver?: boolean;
      disputeReason?: string | null;
      notes?: string | null;
      newEvidenceUrls: string[];
    },
  ): Promise<DeliveryHandoverRecord> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM delivery_handover WHERE handover_id = ? FOR UPDATE',
        [handoverId],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException(`Không tìm thấy biên bản bàn giao #${handoverId}`);
      if (current.status !== 'pending') {
        throw new ConflictException(`Biên bản #${handoverId} đã ở trạng thái "${current.status}", không thể thao tác lại.`);
      }

      const existingEvidence = safeParseArray(current.evidence_urls_json);
      const mergedEvidence = [...existingEvidence, ...data.newEvidenceUrls].slice(0, 10);
      const nextStatus = data.action === 'confirm' ? 'confirmed' : 'disputed';

      await db.execute(
        `UPDATE delivery_handover
         SET status = ?,
             horse_condition_at_handover = COALESCE(?, horse_condition_at_handover),
             identity_verified = COALESCE(?, identity_verified),
             documents_handed_over = COALESCE(?, documents_handed_over),
             dispute_reason = COALESCE(?, dispute_reason),
             notes = COALESCE(?, notes),
             evidence_urls_json = ?,
             confirmed_by = ?,
             confirmed_at = CASE WHEN ? = 'confirmed' THEN NOW() ELSE confirmed_at END
         WHERE handover_id = ?`,
        [
          nextStatus,
          data.horseConditionAtHandover ?? null,
          data.identityVerified === undefined ? null : data.identityVerified ? 1 : 0,
          data.documentsHandedOver === undefined ? null : data.documentsHandedOver ? 1 : 0,
          data.disputeReason ?? null,
          data.notes ?? null,
          mergedEvidence.length ? JSON.stringify(mergedEvidence) : null,
          responderId,
          nextStatus,
          handoverId,
        ],
      );

      for (const fileUrl of data.newEvidenceUrls) {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);
        await db.execute(
          `INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by)
           VALUES ('delivery_handover', ?, ?, ?, ?)`,
          [handoverId, fileUrl, isImg ? 'image' : 'document', responderId],
        );
      }

      const [updated] = await db.execute<RowDataPacket[]>(this.baseSelectSql('WHERE dh.handover_id = ?'), [handoverId]);
      return this.mapRow(updated[0]);
    });
  }

  async resolveDispute(
    handoverId: number,
    managerId: number,
    resolutionNotes: string,
    compensationAmount: number,
  ): Promise<DeliveryHandoverRecord> {
    return this.tx(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM delivery_handover WHERE handover_id = ? FOR UPDATE',
        [handoverId],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException(`Không tìm thấy biên bản bàn giao #${handoverId}`);
      if (current.status !== 'disputed') {
        throw new ConflictException(`Chỉ xử lý tranh chấp với biên bản đang ở trạng thái "disputed" (hiện tại: "${current.status}").`);
      }

      await db.execute(
        `UPDATE delivery_handover
         SET status = 'confirmed',
             resolution_notes = ?,
             compensation_amount = ?,
             resolved_by = ?,
             resolved_at = NOW(),
             confirmed_by = COALESCE(confirmed_by, ?),
             confirmed_at = COALESCE(confirmed_at, NOW())
         WHERE handover_id = ?`,
        [resolutionNotes, compensationAmount, managerId, managerId, handoverId],
      );

      const [updated] = await db.execute<RowDataPacket[]>(this.baseSelectSql('WHERE dh.handover_id = ?'), [handoverId]);
      return this.mapRow(updated[0]);
    });
  }

  async isAttachmentAccessibleToUser(
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
        `SELECT 1 FROM delivery_handover dh
         JOIN shipment s ON s.shipment_id = dh.shipment_id
         WHERE s.customer_id = ? AND dh.evidence_urls_json LIKE ? LIMIT 1`,
        [userId, pattern],
      );
      return rows.length > 0;
    }
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM delivery_handover dh
       JOIN shipment_assignment sa ON sa.shipment_id = dh.shipment_id
       WHERE sa.user_id = ? AND dh.evidence_urls_json LIKE ? LIMIT 1`,
      [userId, pattern],
    );
    return rows.length > 0;
  }
}
