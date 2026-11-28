import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  AuthorityApprovalStatus,
  DocumentApproval,
  DocumentStatus,
  Regulation,
  DocumentTypeDefinition,
  TransportDocument,
} from './documents.types';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { UpdateRegulationDto } from './dto/update-regulation.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';
import { MYSQL_POOL } from '../../common/database/database.module';

import { REGULATION_PRESET_TEMPLATES } from './constants/regulation-presets.constant';

interface RegulationRow extends RowDataPacket {
  regulation_id: number;
  country: string;
  border_gate?: string | null;
  transport_mode?: 'road' | 'air' | 'sea' | 'both' | null;
  doc_tier?: 'A' | 'B' | null;
  lead_time_days?: number | null;
  max_issue_age_days?: number | null;
  requires_authority_approval?: number | boolean | null;
  min_validity_buffer_hours?: number | null;
  document_type: string;
  document_type_code?: string | null;
  description: string | null;
  effective_date: Date | null;
  legal_reference?: string | null;
  is_demo_data?: number | boolean | null;
  is_active?: number | boolean | null;
  created_at: Date;
}

interface DocumentRow extends RowDataPacket {
  document_id: number;
  horse_id: number;
  regulation_id: number | null;
  document_type_code?: string | null;
  document_type_name_vi?: string | null;
  document_type_name_en?: string | null;
  uploaded_by: number;
  doc_type: string;
  doc_number: string | null;
  file_url: string;
  issue_date: Date | null;
  expiry_date: Date | null;
  status: DocumentStatus;
  reviewer_notes: string | null;
  created_at: Date;
  horse_name?: string;
  horse_owner_id?: number;
  is_archived?: number | boolean;
  superseded_by_document_id?: number | null;
  country?: string;
  regulation_title?: string;
  regulation_doc_type?: string;
  uploader_name?: string;
  uploader_email?: string;
  request_code?: string;
  customer_request_code?: string;
  shipment_id?: number;
  reviewed_by?: number | null;
  reviewed_at?: Date | null;
  reviewer_name?: string | null;
}

interface DocumentTypeRow extends RowDataPacket {
  code: string;
  name_vi: string;
  name_en: string;
  default_validity_days: number | null;
  is_identity: number | boolean;
  sort_order: number;
}

/** Dữ liệu tạo giấy tờ: từ luồng đơn hàng (có regulationId) hoặc kho giấy tờ của ngựa (regulationId = null). */
export interface CreateDocumentInput {
  horseId: number;
  regulationId?: number | null;
  docType: string;
  documentTypeCode?: string | null;
  docNumber?: string | null;
  fileUrl?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
}

interface ApprovalRow extends RowDataPacket {
  approval_id: number;
  document_id: number;
  approved_by: number | null;
  authority_name: string;
  status: AuthorityApprovalStatus;
  approval_date: Date | null;
  notes: string | null;
  approver_name?: string;
}

interface OrderHorseInfoRow extends RowDataPacket {
  horse_id: number;
  name: string;
  owner_id: number;
  microchip_no: string | null;
  passport_no: string | null;
}

interface OrderDestinationRow extends RowDataPacket {
  shipment_id: number;
  customer_id: number;
  destination_location: string;
  origin_location: string;
  status: string;
  booking_type?: string | null;
  transport_mode?: string | null;
  transportation_type?: string | null;
  in_transit_compliance_alert?: number | boolean | null;
  route_expected_arrival?: Date | string | null;
  stop_expected_arrival?: Date | string | null;
  arrival_airport_codes?: string | null;
  border_stop_names?: string | null;
  requested_date: Date | null;
  departure_date: Date | null;
  expected_arrival_date: Date | null;
  request_code?: string;
}

@Injectable()
export class DocumentsStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsStore.name);
  private pool!: Pool;

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) {
      this.pool = injectedPool;
    }
  }

  async onModuleInit(): Promise<void> {
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
    await this.seedInitialRegulations();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
      await this.pool.end();
    }
  }

  private formatMysqlDateOnly(val: Date | string | null | undefined): string | null {
    if (!val) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
      const parsed = new Date(trimmed);
      if (!Number.isFinite(parsed.getTime())) return null;
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    if (!(val instanceof Date) || !Number.isFinite(val.getTime())) return null;
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }

  private toMysqlDateParam(val: string | null | undefined): string | null {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
  }

  private mapRegulationRow(r: RegulationRow): Regulation {
    return {
      id: r.regulation_id,
      country: r.country,
      borderGate: r.border_gate ?? null,
      transportMode: (r.transport_mode as 'road' | 'air' | 'sea' | 'both') || 'both',
      docTier: (r.doc_tier as 'A' | 'B') || 'A',
      leadTimeDays: r.lead_time_days !== undefined && r.lead_time_days !== null ? Number(r.lead_time_days) : 2,
      maxIssueAgeDays: r.max_issue_age_days !== undefined && r.max_issue_age_days !== null ? Number(r.max_issue_age_days) : null,
      requiresAuthorityApproval: Boolean(r.requires_authority_approval),
      minValidityBufferHours:
        r.min_validity_buffer_hours !== undefined && r.min_validity_buffer_hours !== null
          ? Number(r.min_validity_buffer_hours)
          : 24,
      documentType: r.document_type,
      documentTypeCode: r.document_type_code ?? r.document_type,
      description: r.description,
      effectiveDate: this.formatMysqlDateOnly(r.effective_date),
      legalReference: r.legal_reference ?? null,
      isDemoData: r.is_demo_data === undefined || r.is_demo_data === null ? true : Boolean(r.is_demo_data),
      isActive: r.is_active === undefined || r.is_active === null ? true : Boolean(r.is_active),
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  private mapDocumentRow(r: DocumentRow, approvals: any[] = []): TransportDocument {
    return {
      id: r.document_id,
      horseId: r.horse_id,
      ownerId: r.horse_owner_id !== undefined ? Number(r.horse_owner_id) : undefined,
      horseName: r.horse_name,
      requestCode: r.shipment_id ? `REQ-${String(r.shipment_id).padStart(3, '0')}` : undefined,
      regulationId: r.regulation_id,
      regulationCountry: r.country,
      regulationDocType: r.regulation_doc_type || r.doc_type,
      regulationTitle: r.regulation_title || r.doc_type,
      uploadedBy: r.uploaded_by,
      uploaderName: r.uploader_name,
      uploaderEmail: r.uploader_email,
      docType: r.doc_type,
      documentTypeCode: r.document_type_code ?? null,
      documentTypeNameVi: r.document_type_name_vi ?? null,
      documentTypeNameEn: r.document_type_name_en ?? null,
      docNumber: r.doc_number,
      fileUrl: r.file_url,
      issueDate: this.formatMysqlDateOnly(r.issue_date),
      expiryDate: this.formatMysqlDateOnly(r.expiry_date),
      status: r.status,
      reviewerNotes: r.reviewer_notes,
      reviewedBy: r.reviewed_by !== undefined && r.reviewed_by !== null ? Number(r.reviewed_by) : null,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      reviewerName: r.reviewer_name ?? null,
      createdAt: new Date(r.created_at).toISOString(),
      isArchived: Boolean(r.is_archived),
      supersededByDocumentId: r.superseded_by_document_id ?? null,
      approvals,
    };
  }

  // --- Regulations ---
  async findRegulations(
    countryOrFilter?:
      | string
      | { country?: string; borderGate?: string; transportMode?: string; docTier?: string },
  ): Promise<Regulation[]> {
    const filter =
      typeof countryOrFilter === 'string'
        ? { country: countryOrFilter }
        : (countryOrFilter ?? {});

    let query = 'SELECT * FROM regulation';
    const conditions: string[] = [];
    const params: string[] = [];

    if (filter.country) {
      conditions.push('LOWER(country) LIKE LOWER(?)');
      params.push(`%${filter.country}%`);
    }
    if (filter.borderGate) {
      conditions.push('(border_gate IS NULL OR TRIM(border_gate) = "" OR LOWER(border_gate) LIKE LOWER(?))');
      params.push(`%${filter.borderGate.trim()}%`);
    }
    if (filter.transportMode && filter.transportMode !== 'both') {
      conditions.push('(transport_mode = "both" OR transport_mode = ?)');
      params.push(filter.transportMode.toLowerCase().trim());
    }
    if (filter.docTier) {
      conditions.push('doc_tier = ?');
      params.push(filter.docTier.toUpperCase().trim());
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY country ASC, doc_tier ASC, document_type ASC';

    const [rows] = await this.pool.execute<RegulationRow[]>(query, params);
    return rows.map((r) => this.mapRegulationRow(r));
  }

  async findRegulationById(id: number): Promise<Regulation | undefined> {
    const [rows] = await this.pool.execute<RegulationRow[]>(
      'SELECT * FROM regulation WHERE regulation_id = ? LIMIT 1',
      [id],
    );
    const r = rows[0];
    return r ? this.mapRegulationRow(r) : undefined;
  }

  async createRegulation(dto: CreateRegulationDto): Promise<number> {
    const effectiveDate = this.toMysqlDateParam(dto.effectiveDate);
    const isDomesticVn = dto.country.trim().toLowerCase() === 'vietnam';
    const docTier = dto.docTier ?? (dto.documentType === 'health_certificate' ? 'B' : 'A');
    const leadTimeDays =
      dto.leadTimeDays ??
      (docTier === 'B'
        ? 1
        : isDomesticVn
          ? 0
          : ['import_permit', 'export_permit', 'quarantine_certificate', 'customs_declaration'].includes(
                dto.documentType.trim(),
              )
            ? 3
            : 1);
    const requiresAuth =
      dto.requiresAuthorityApproval ??
      (!isDomesticVn && ['import_permit', 'export_permit', 'quarantine_certificate', 'health_certificate'].includes(dto.documentType));
    const bufferHours = dto.minValidityBufferHours ?? (isDomesticVn ? 24 : 48);
    const docTypeCode = (dto as any).documentTypeCode?.trim() || dto.documentType.trim();
    const maxIssueAgeDays = (dto as any).maxIssueAgeDays !== undefined && (dto as any).maxIssueAgeDays !== null ? Number((dto as any).maxIssueAgeDays) : null;
    const legalRef = (dto as any).legalReference?.trim() || 'Dữ liệu demo — cần đối chiếu cơ quan thú y';
    const isDemo = (dto as any).isDemoData !== undefined ? ((dto as any).isDemoData ? 1 : 0) : 1;
    const isActive = (dto as any).isActive !== undefined ? ((dto as any).isActive ? 1 : 0) : 1;

    const [result] = await this.pool.execute(
      `INSERT INTO regulation (
        country, border_gate, transport_mode, doc_tier, lead_time_days, max_issue_age_days,
        requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code,
        description, effective_date, legal_reference, is_demo_data, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.country.trim(),
        dto.borderGate?.trim() || null,
        dto.transportMode ?? 'both',
        docTier,
        leadTimeDays,
        maxIssueAgeDays,
        requiresAuth ? 1 : 0,
        bufferHours,
        dto.documentType.trim(),
        docTypeCode,
        dto.description ?? null,
        effectiveDate,
        legalRef,
        isDemo,
        isActive,
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  async upsertRegulation(
    country: string,
    documentType: string,
    description: string,
    effectiveDate?: string | null,
    meta?: {
      borderGate?: string | null;
      transportMode?: 'road' | 'air' | 'sea' | 'both';
      docTier?: 'A' | 'B';
      leadTimeDays?: number;
      maxIssueAgeDays?: number | null;
      requiresAuthorityApproval?: boolean;
      minValidityBufferHours?: number;
      preserveExisting?: boolean;
      documentTypeCode?: string;
      legalReference?: string;
      isDemoData?: boolean;
      isActive?: boolean;
    },
  ): Promise<number> {
    const cleanBorderGate = meta?.borderGate?.trim() || null;
    const docTypeCode = meta?.documentTypeCode?.trim() || documentType;
    const transportMode = meta?.transportMode ?? 'both';
    const [existing] = await this.pool.execute<RegulationRow[]>(
      `SELECT regulation_id, document_type_code, transport_mode FROM regulation
       WHERE LOWER(country) = LOWER(?)
         AND (LOWER(document_type) = LOWER(?) OR LOWER(document_type_code) = LOWER(?))
         AND COALESCE(LOWER(border_gate), '') = COALESCE(LOWER(?), '')
         AND (transport_mode = ? OR transport_mode = 'both' OR ? = 'both')
       ORDER BY (transport_mode = ?) DESC, (transport_mode = 'both') DESC, regulation_id ASC
       LIMIT 1`,
      [country, documentType, docTypeCode, cleanBorderGate, transportMode, transportMode, transportMode],
    );
    const effDate = this.toMysqlDateParam(effectiveDate) ?? this.formatMysqlDateOnly(new Date());
    const isDomesticVn = country.trim().toLowerCase() === 'vietnam';
    const docTier = meta?.docTier ?? (documentType === 'health_certificate' ? 'B' : 'A');
    const leadTimeDays =
      meta?.leadTimeDays ??
      (docTier === 'B'
        ? 1
        : isDomesticVn
          ? 0
          : ['import_permit', 'export_permit', 'quarantine_certificate', 'customs_declaration'].includes(
                documentType,
              )
            ? 3
            : 1);
    const requiresAuth = meta?.requiresAuthorityApproval ?? (!isDomesticVn && ['import_permit', 'export_permit', 'quarantine_certificate'].includes(documentType));
    const bufferHours = meta?.minValidityBufferHours ?? (isDomesticVn ? 24 : 48);
    const maxIssueAgeDays = meta?.maxIssueAgeDays !== undefined && meta?.maxIssueAgeDays !== null ? Number(meta.maxIssueAgeDays) : null;
    const legalRef = meta?.legalReference?.trim() || 'Dữ liệu demo — cần đối chiếu cơ quan thú y';
    const isDemo = meta?.isDemoData !== undefined ? (meta.isDemoData ? 1 : 0) : 1;
    const isActive = meta?.isActive !== undefined ? (meta.isActive ? 1 : 0) : 1;

    if (existing.length > 0) {
      const regId = existing[0].regulation_id;
      if (meta?.preserveExisting) {
        if (!existing[0].document_type_code && docTypeCode) {
          await this.pool.execute(
            'UPDATE regulation SET document_type_code = (SELECT code FROM document_type WHERE code = ?) WHERE regulation_id = ? AND document_type_code IS NULL',
            [docTypeCode, regId],
          );
        }
        return regId;
      }
      await this.pool.execute(
        `UPDATE regulation
         SET description = ?, effective_date = ?, border_gate = ?, transport_mode = ?,
             doc_tier = ?, lead_time_days = ?, max_issue_age_days = ?, requires_authority_approval = ?, min_validity_buffer_hours = ?,
             document_type_code = ?, legal_reference = ?, is_demo_data = ?, is_active = ?
         WHERE regulation_id = ?`,
        [
          description,
          effDate,
          cleanBorderGate,
          transportMode,
          docTier,
          leadTimeDays,
          maxIssueAgeDays,
          requiresAuth ? 1 : 0,
          bufferHours,
          docTypeCode,
          legalRef,
          isDemo,
          isActive,
          regId,
        ],
      );
      return regId;
    } else {
      const [result] = await this.pool.execute(
        `INSERT INTO regulation (
          country, border_gate, transport_mode, doc_tier, lead_time_days, max_issue_age_days,
          requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code,
          description, effective_date, legal_reference, is_demo_data, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          country,
          cleanBorderGate,
          transportMode,
          docTier,
          leadTimeDays,
          maxIssueAgeDays,
          requiresAuth ? 1 : 0,
          bufferHours,
          documentType,
          docTypeCode,
          description,
          effDate,
          legalRef,
          isDemo,
          isActive,
        ],
      );
      return (result as { insertId: number }).insertId;
    }
  }

  async countDocumentsByRegulationId(regulationId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as cnt FROM transport_document WHERE regulation_id = ?',
      [regulationId],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async deleteRegulation(regulationId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      'DELETE FROM regulation WHERE regulation_id = ?',
      [regulationId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async updateRegulation(regulationId: number, dto: UpdateRegulationDto): Promise<boolean> {
    const sets: string[] = [];
    const params: (string | Date | null | number)[] = [];
    if (dto.country !== undefined) {
      sets.push('country = ?');
      params.push(dto.country.trim());
    }
    if (dto.borderGate !== undefined) {
      sets.push('border_gate = ?');
      params.push(dto.borderGate ? dto.borderGate.trim() || null : null);
    }
    if (dto.transportMode !== undefined) {
      sets.push('transport_mode = ?');
      params.push(dto.transportMode);
    }
    if (dto.docTier !== undefined) {
      sets.push('doc_tier = ?');
      params.push(dto.docTier);
    }
    if (dto.leadTimeDays !== undefined) {
      sets.push('lead_time_days = ?');
      params.push(Number(dto.leadTimeDays));
    }
    if (dto.requiresAuthorityApproval !== undefined) {
      sets.push('requires_authority_approval = ?');
      params.push(dto.requiresAuthorityApproval ? 1 : 0);
    }
    if (dto.minValidityBufferHours !== undefined) {
      sets.push('min_validity_buffer_hours = ?');
      params.push(Number(dto.minValidityBufferHours));
    }
    if (dto.documentType !== undefined) {
      sets.push('document_type = ?');
      params.push(dto.documentType.trim());
    }
    if (dto.description !== undefined) {
      sets.push('description = ?');
      params.push(dto.description.trim() || null);
    }
    if (dto.effectiveDate !== undefined) {
      sets.push('effective_date = ?');
      params.push(this.toMysqlDateParam(dto.effectiveDate));
    }
    if (dto.documentTypeCode !== undefined) {
      sets.push('document_type_code = ?');
      params.push(dto.documentTypeCode.trim() || null);
    }
    if (dto.maxIssueAgeDays !== undefined) {
      sets.push('max_issue_age_days = ?');
      params.push(dto.maxIssueAgeDays !== null ? Number(dto.maxIssueAgeDays) : null);
    }
    if (dto.legalReference !== undefined) {
      sets.push('legal_reference = ?');
      params.push(dto.legalReference ? dto.legalReference.trim() || null : null);
    }
    if (dto.isDemoData !== undefined) {
      sets.push('is_demo_data = ?');
      params.push(dto.isDemoData ? 1 : 0);
    }
    if (dto.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(dto.isActive ? 1 : 0);
    }
    if (sets.length === 0) return true;
    params.push(regulationId);
    const [result] = await this.pool.execute(
      `UPDATE regulation SET ${sets.join(', ')} WHERE regulation_id = ?`,
      params,
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async isHorseOwnedByUser(horseId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT owner_id FROM horse WHERE horse_id = ? LIMIT 1',
      [horseId],
    );
    if (!rows[0]) return false;
    return Number(rows[0].owner_id) === Number(userId);
  }

  async seedInitialRegulations(): Promise<void> {
    try {
      for (const preset of REGULATION_PRESET_TEMPLATES) {
        for (const country of preset.recommendedCountries) {
          for (const item of preset.items) {
            await this.upsertRegulation(
              country,
              item.documentType,
              item.description,
              '2026-01-01',
              {
                borderGate: item.borderGate ?? null,
                transportMode: item.transportMode ?? 'both',
                docTier: item.docTier,
                leadTimeDays: item.leadTimeDays,
                maxIssueAgeDays: item.maxIssueAgeDays ?? null,
                requiresAuthorityApproval: item.requiresAuthorityApproval,
                minValidityBufferHours: item.minValidityBufferHours,
                documentTypeCode: item.documentTypeCode ?? item.documentType,
                legalReference: item.legalReference ?? 'Dữ liệu demo — cần đối chiếu cơ quan thú y',
                isDemoData: item.isDemoData ?? true,
                isActive: true,
                preserveExisting: true,
              },
            );
          }
        }
      }
    } catch (err) {
      // Non-blocking log if DB schema is not ready yet
      this.logger.warn('Warning while seeding initial regulations', err as Error);
    }
  }

  // --- Transport Documents ---
  async createDocument(uploadedBy: number, dto: CreateDocumentInput): Promise<number> {
    const issueDate = this.toMysqlDateParam(dto.issueDate);
    const expiryDate = this.toMysqlDateParam(dto.expiryDate);

    // document_type_code: chỉ gắn khi mã có trong danh mục (doc_type cũ dạng tự do vẫn hợp lệ)
    const [result] = await this.pool.execute(
      `INSERT INTO transport_document (
        horse_id, regulation_id, document_type_code, uploaded_by, doc_type, doc_number, file_url, issue_date, expiry_date, status
      ) VALUES (?, ?, (SELECT code FROM document_type WHERE code = ?), ?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        dto.horseId,
        dto.regulationId ?? null,
        dto.documentTypeCode ?? dto.docType,
        uploadedBy,
        dto.docType,
        dto.docNumber ?? null,
        dto.fileUrl ?? '',
        issueDate,
        expiryDate,
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  async findDocumentById(id: number): Promise<TransportDocument | undefined> {
    const [rows] = await this.pool.execute<DocumentRow[]>(
      `SELECT d.*, dt.name_vi as document_type_name_vi, dt.name_en as document_type_name_en, h.name as horse_name, h.owner_id as horse_owner_id, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id
       FROM transport_document d
       JOIN horse h ON h.horse_id = d.horse_id
       LEFT JOIN regulation r ON r.regulation_id = d.regulation_id
       LEFT JOIN document_type dt ON dt.code = d.document_type_code
       JOIN \`user\` u ON u.user_id = d.uploaded_by
       WHERE d.document_id = ?
       LIMIT 1`,
      [id],
    );

    const r = rows[0];
    if (!r) return undefined;
    const approvals = await this.findApprovalsByDocumentId(r.document_id);

    return {
      id: r.document_id,
      horseId: r.horse_id,
      ownerId: r.horse_owner_id !== undefined ? Number(r.horse_owner_id) : undefined,
      horseName: r.horse_name,
      requestCode: r.shipment_id ? `REQ-${String(r.shipment_id).padStart(3, '0')}` : undefined,
      regulationId: r.regulation_id,
      regulationCountry: r.country,
      regulationDocType: r.regulation_doc_type || r.doc_type,
      regulationTitle: r.regulation_title || r.doc_type,
      uploadedBy: r.uploaded_by,
      uploaderName: r.uploader_name,
      uploaderEmail: r.uploader_email,
      docType: r.doc_type,
      documentTypeCode: r.document_type_code ?? null,
      documentTypeNameVi: r.document_type_name_vi ?? null,
      documentTypeNameEn: r.document_type_name_en ?? null,
      docNumber: r.doc_number,
      fileUrl: r.file_url,
      issueDate: this.formatMysqlDateOnly(r.issue_date),
      expiryDate: this.formatMysqlDateOnly(r.expiry_date),
      status: r.status,
      reviewerNotes: r.reviewer_notes,
      createdAt: new Date(r.created_at).toISOString(),
      isArchived: Boolean(r.is_archived),
      supersededByDocumentId: r.superseded_by_document_id ?? null,
      approvals,
    };
  }

  async findDocumentsByHorseId(horseId: number): Promise<TransportDocument[]> {
    const [rows] = await this.pool.execute<DocumentRow[]>(
      `SELECT d.*, dt.name_vi as document_type_name_vi, dt.name_en as document_type_name_en, h.name as horse_name, h.owner_id as horse_owner_id, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id
       FROM transport_document d
       JOIN horse h ON h.horse_id = d.horse_id
       LEFT JOIN regulation r ON r.regulation_id = d.regulation_id
       LEFT JOIN document_type dt ON dt.code = d.document_type_code
       JOIN \`user\` u ON u.user_id = d.uploaded_by
       WHERE d.horse_id = ?
         AND COALESCE(d.is_archived, 0) = 0
       ORDER BY d.created_at DESC`,
      [horseId],
    );

    return Promise.all(
      rows.map(async (r) => ({
        id: r.document_id,
        horseId: r.horse_id,
        ownerId: r.horse_owner_id !== undefined ? Number(r.horse_owner_id) : undefined,
        horseName: r.horse_name,
        requestCode: r.shipment_id ? `REQ-${String(r.shipment_id).padStart(3, '0')}` : undefined,
        regulationId: r.regulation_id,
        regulationCountry: r.country,
        regulationDocType: r.regulation_doc_type || r.doc_type,
        regulationTitle: r.regulation_title || r.doc_type,
        uploadedBy: r.uploaded_by,
        uploaderName: r.uploader_name,
        uploaderEmail: r.uploader_email,
        docType: r.doc_type,
        documentTypeCode: r.document_type_code ?? null,
        documentTypeNameVi: r.document_type_name_vi ?? null,
        documentTypeNameEn: r.document_type_name_en ?? null,
        docNumber: r.doc_number,
        fileUrl: r.file_url,
        issueDate: this.formatMysqlDateOnly(r.issue_date),
        expiryDate: this.formatMysqlDateOnly(r.expiry_date),
        status: r.status,
        reviewerNotes: r.reviewer_notes,
        createdAt: new Date(r.created_at).toISOString(),
        isArchived: Boolean(r.is_archived),
        supersededByDocumentId: r.superseded_by_document_id ?? null,
        approvals: await this.findApprovalsByDocumentId(r.document_id),
      })),
    );
  }

  async findDocuments(filter: {
    uploadedBy?: number;
    ownerId?: number;
    status?: string;
    horseId?: number;
  }): Promise<TransportDocument[]> {
    let query = `
      SELECT d.*, dt.name_vi as document_type_name_vi, dt.name_en as document_type_name_en, h.name as horse_name, h.owner_id as horse_owner_id, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id,
        (SELECT CONCAT('REQ-', LPAD(
          (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
          3, '0'
        )) FROM shipment s WHERE s.shipment_id = (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1)) as customer_request_code
      FROM transport_document d
      JOIN horse h ON h.horse_id = d.horse_id
      LEFT JOIN regulation r ON r.regulation_id = d.regulation_id
       LEFT JOIN document_type dt ON dt.code = d.document_type_code
      JOIN \`user\` u ON u.user_id = d.uploaded_by
    `;
    const conditions: string[] = ['COALESCE(d.is_archived, 0) = 0'];
    const params: any[] = [];

    if (filter.uploadedBy !== undefined) {
      conditions.push('d.uploaded_by = ?');
      params.push(filter.uploadedBy);
    }
    if (filter.ownerId !== undefined) {
      conditions.push('h.owner_id = ?');
      params.push(filter.ownerId);
    }
    if (filter.status) {
      conditions.push('d.status = ?');
      params.push(filter.status.toLowerCase());
    }
    if (filter.horseId !== undefined) {
      conditions.push('d.horse_id = ?');
      params.push(filter.horseId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY d.created_at DESC';

    const [rows] = await this.pool.execute<DocumentRow[]>(query, params);

    return Promise.all(
      rows.map(async (r) => ({
        id: r.document_id,
        horseId: r.horse_id,
        ownerId: r.horse_owner_id !== undefined ? Number(r.horse_owner_id) : undefined,
        horseName: r.horse_name,
        requestCode: (filter.uploadedBy !== undefined || filter.ownerId !== undefined) && r.customer_request_code
          ? r.customer_request_code
          : r.shipment_id
            ? `REQ-${String(r.shipment_id).padStart(3, '0')}`
            : undefined,
        regulationId: r.regulation_id,
        regulationCountry: r.country,
        regulationDocType: r.regulation_doc_type || r.doc_type,
        regulationTitle: r.regulation_title || r.doc_type,
        uploadedBy: r.uploaded_by,
        uploaderName: r.uploader_name,
        uploaderEmail: r.uploader_email,
        docType: r.doc_type,
        documentTypeCode: r.document_type_code ?? null,
        documentTypeNameVi: r.document_type_name_vi ?? null,
        documentTypeNameEn: r.document_type_name_en ?? null,
        docNumber: r.doc_number,
        fileUrl: r.file_url,
        issueDate: this.formatMysqlDateOnly(r.issue_date),
        expiryDate: this.formatMysqlDateOnly(r.expiry_date),
        status: r.status,
        reviewerNotes: r.reviewer_notes,
        createdAt: new Date(r.created_at).toISOString(),
        isArchived: Boolean(r.is_archived),
        supersededByDocumentId: r.superseded_by_document_id ?? null,
        approvals: await this.findApprovalsByDocumentId(r.document_id),
      })),
    );
  }

  async updateDocumentReview(
    documentId: number,
    status: DocumentStatus,
    notes?: string,
    expiryDate?: string,
    docNumber?: string,
    reviewerId?: number | null,
  ): Promise<boolean> {
    const newExpiryDate = this.toMysqlDateParam(expiryDate);
    const cleanDocNumber = docNumber && docNumber.trim().length > 0 ? docNumber.trim() : null;
    const [result] = await this.pool.execute(
      `UPDATE transport_document
       SET status = ?,
           reviewer_notes = ?,
           expiry_date = COALESCE(?, expiry_date),
           doc_number = COALESCE(?, doc_number),
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE document_id = ?`,
      [status, notes ?? null, newExpiryDate, cleanDocNumber, reviewerId ?? null, documentId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async createReviewLog(entry: {
    documentId: number;
    fromStatus: string;
    toStatus: string;
    reviewerId: number | null;
    reason: string | null;
    checkedFieldsJson: any;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO document_review_log (
        document_id, from_status, to_status, reviewer_id, reason, checked_fields_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.documentId,
        entry.fromStatus,
        entry.toStatus,
        entry.reviewerId ?? null,
        entry.reason ?? null,
        entry.checkedFieldsJson ? JSON.stringify(entry.checkedFieldsJson) : null,
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  async findReviewLogsByDocumentId(documentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT l.*, u.full_name as reviewer_name
       FROM document_review_log l
       LEFT JOIN \`user\` u ON u.user_id = l.reviewer_id
       WHERE l.document_id = ?
       ORDER BY l.review_id DESC`,
      [documentId],
    );
    return rows.map((r) => ({
      reviewId: Number(r.review_id),
      documentId: Number(r.document_id),
      fromStatus: r.from_status,
      toStatus: r.to_status,
      reviewerId: r.reviewer_id !== null ? Number(r.reviewer_id) : null,
      reviewerName: r.reviewer_name ?? null,
      reason: r.reason ?? null,
      checkedFieldsJson: typeof r.checked_fields_json === 'string'
        ? JSON.parse(r.checked_fields_json)
        : (r.checked_fields_json ?? null),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    }));
  }

  async recordExpiryNotice(documentId: number, daysBefore: number): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        `INSERT IGNORE INTO document_expiry_notice (document_id, days_before) VALUES (?, ?)`,
        [documentId, daysBefore],
      );
      return (result as { affectedRows: number }).affectedRows > 0;
    } catch {
      return false;
    }
  }

  async hasExpiryNoticeBeenSent(documentId: number, daysBefore: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT notice_id FROM document_expiry_notice WHERE document_id = ? AND days_before = ? LIMIT 1`,
      [documentId, daysBefore],
    );
    return rows.length > 0;
  }

  async findApprovedDocuments(): Promise<TransportDocument[]> {
    const [rows] = await this.pool.execute<DocumentRow[]>(
      `SELECT d.*, dt.name_vi as document_type_name_vi, dt.name_en as document_type_name_en, h.name as horse_name, h.owner_id as horse_owner_id,
              r.country, r.description as regulation_title, r.document_type as regulation_doc_type,
              u.full_name as uploader_name, u.email as uploader_email,
              rev.full_name as reviewer_name
       FROM transport_document d
       JOIN horse h ON h.horse_id = d.horse_id
       LEFT JOIN regulation r ON r.regulation_id = d.regulation_id
       LEFT JOIN document_type dt ON dt.code = d.document_type_code
       JOIN \`user\` u ON u.user_id = d.uploaded_by
       LEFT JOIN \`user\` rev ON rev.user_id = d.reviewed_by
       WHERE d.status = 'approved' AND COALESCE(d.is_archived, 0) = 0`,
    );
    return rows.map((r) => this.mapDocumentRow(r));
  }

  async deleteDocument(documentId: number, userId: number, isAdminOrSpecialist: boolean): Promise<boolean> {
    const [result] = await this.pool.execute(
      isAdminOrSpecialist
        ? 'UPDATE transport_document SET is_archived = TRUE WHERE document_id = ? AND COALESCE(is_archived, 0) = 0'
        : `UPDATE transport_document d
           JOIN horse h ON h.horse_id = d.horse_id
           SET d.is_archived = TRUE
           WHERE d.document_id = ?
             AND COALESCE(d.is_archived, 0) = 0
             AND d.status <> 'approved'
             AND (h.owner_id = ? OR d.uploaded_by = ?)`,
      isAdminOrSpecialist ? [documentId] : [documentId, userId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async supersedeDocument(
    oldDocumentId: number,
    uploadedBy: number,
    fileUrl: string,
    docNumber?: string | null,
    notes?: string | null,
  ): Promise<number> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT horse_id, regulation_id, document_type_code, doc_type, doc_number, issue_date, expiry_date
         FROM transport_document
         WHERE document_id = ?
         FOR UPDATE`,
        [oldDocumentId],
      );
      const oldDoc = rows[0];
      if (!oldDoc) {
        throw new Error(`Document #${oldDocumentId} not found for supersession`);
      }

      const [insertRes] = await db.execute(
        `INSERT INTO transport_document (
          horse_id, regulation_id, document_type_code, uploaded_by, doc_type, doc_number, file_url,
          issue_date, expiry_date, status, reviewer_notes, is_archived, superseded_by_document_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, FALSE, NULL)`,
        [
          oldDoc.horse_id,
          oldDoc.regulation_id ?? null,
          oldDoc.document_type_code ?? null,
          uploadedBy,
          oldDoc.doc_type,
          docNumber && docNumber.trim().length > 0 ? docNumber.trim() : oldDoc.doc_number,
          fileUrl,
          oldDoc.issue_date ?? null,
          oldDoc.expiry_date ?? null,
          notes ?? null,
        ],
      );
      const newId = (insertRes as { insertId: number }).insertId;

      await db.execute(
        `UPDATE transport_document
         SET is_archived = TRUE,
             superseded_by_document_id = ?
         WHERE document_id = ?`,
        [newId, oldDocumentId],
      );

      await db.commit();
      return newId;
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }

  // --- Kho giấy tờ của ngựa (Step 2, review 11/2026) ---
  async findDocumentTypes(): Promise<DocumentTypeDefinition[]> {
    const [rows] = await this.pool.execute<DocumentTypeRow[]>(
      'SELECT code, name_vi, name_en, default_validity_days, is_identity, sort_order FROM document_type ORDER BY sort_order, code',
    );
    return rows.map((r) => this.mapDocumentTypeRow(r));
  }

  async findDocumentTypeByCode(code: string): Promise<DocumentTypeDefinition | undefined> {
    const [rows] = await this.pool.execute<DocumentTypeRow[]>(
      'SELECT code, name_vi, name_en, default_validity_days, is_identity, sort_order FROM document_type WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0] ? this.mapDocumentTypeRow(rows[0]) : undefined;
  }

  async findHorseOwnerId(horseId: number): Promise<number | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT owner_id FROM horse WHERE horse_id = ? LIMIT 1',
      [horseId],
    );
    return rows[0] ? Number(rows[0].owner_id) : undefined;
  }

  /**
   * Tạo giấy tờ chung của ngựa (regulation_id = NULL). Append-only: bản đang hiệu lực cùng loại
   * của cùng ngựa bị lưu trữ (is_archived) và trỏ superseded_by_document_id sang bản mới.
   */
  async createHorseDocument(uploadedBy: number, input: CreateDocumentInput & { documentTypeCode: string }): Promise<number> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();
      const [previousRows] = await db.execute<RowDataPacket[]>(
        `SELECT document_id FROM transport_document
         WHERE horse_id = ? AND document_type_code = ? AND regulation_id IS NULL
           AND COALESCE(is_archived, 0) = 0
         FOR UPDATE`,
        [input.horseId, input.documentTypeCode],
      );
      const [insertRes] = await db.execute(
        `INSERT INTO transport_document (
          horse_id, regulation_id, document_type_code, uploaded_by, doc_type, doc_number, file_url, issue_date, expiry_date, status
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [
          input.horseId,
          input.documentTypeCode,
          uploadedBy,
          input.docType,
          input.docNumber ?? null,
          input.fileUrl ?? '',
          this.toMysqlDateParam(input.issueDate),
          this.toMysqlDateParam(input.expiryDate),
        ],
      );
      const newId = (insertRes as { insertId: number }).insertId;
      for (const row of previousRows) {
        await db.execute(
          'UPDATE transport_document SET is_archived = TRUE, superseded_by_document_id = ? WHERE document_id = ?',
          [newId, row.document_id],
        );
      }
      await db.commit();
      return newId;
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }

  /** Lịch sử phiên bản (gồm bản đã lưu trữ) của cùng loại giấy tờ trên một ngựa, mới nhất trước. */
  async findDocumentHistory(horseId: number, documentTypeCode: string | null, docType: string): Promise<TransportDocument[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      documentTypeCode
        ? `SELECT document_id FROM transport_document
           WHERE horse_id = ? AND document_type_code = ?
           ORDER BY created_at DESC, document_id DESC`
        : `SELECT document_id FROM transport_document
           WHERE horse_id = ? AND document_type_code IS NULL AND doc_type = ?
           ORDER BY created_at DESC, document_id DESC`,
      [horseId, documentTypeCode ?? docType],
    );
    const docs = await Promise.all(rows.map((r) => this.findDocumentById(Number(r.document_id))));
    return docs.filter((d): d is TransportDocument => Boolean(d));
  }

  private mapDocumentTypeRow(r: DocumentTypeRow): DocumentTypeDefinition {
    return {
      code: r.code,
      nameVi: r.name_vi,
      nameEn: r.name_en,
      defaultValidityDays: r.default_validity_days !== null ? Number(r.default_validity_days) : null,
      isIdentity: Boolean(r.is_identity),
      sortOrder: Number(r.sort_order ?? 0),
    };
  }

  // --- Authority Approvals ---
  async createAuthorityApproval(
    documentId: number,
    specialistId: number,
    dto: RecordAuthorityApprovalDto,
  ): Promise<number> {
    const approvalDate = dto.approvalDate ? new Date(dto.approvalDate) : new Date();
    const [result] = await this.pool.execute(
      `INSERT INTO document_approval (
        document_id, approved_by, authority_name, status, approval_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [documentId, specialistId, dto.authorityName, dto.status, approvalDate, dto.notes ?? null],
    );

    if (dto.referenceNumber && dto.referenceNumber.trim().length > 0) {
      await this.pool.execute(
        `UPDATE transport_document SET doc_number = ? WHERE document_id = ?`,
        [dto.referenceNumber.trim(), documentId],
      );
    }

    return (result as { insertId: number }).insertId;
  }

  async findApprovalsByDocumentId(documentId: number): Promise<DocumentApproval[]> {
    const [rows] = await this.pool.execute<ApprovalRow[]>(
      `SELECT a.*, u.full_name as approver_name
       FROM document_approval a
       LEFT JOIN \`user\` u ON u.user_id = a.approved_by
       WHERE a.document_id = ?
       ORDER BY a.approval_date DESC, a.approval_id DESC`,
      [documentId],
    );

    return rows.map((r) => ({
      id: r.approval_id,
      documentId: r.document_id,
      approvedBy: r.approved_by,
      approverName: r.approver_name,
      authorityName: r.authority_name,
      status: r.status,
      approvalDate: r.approval_date ? new Date(r.approval_date).toISOString() : null,
      notes: r.notes,
    }));
  }

  // --- Order & Horse Context Helpers ---
  async findOrderDetails(orderId: number): Promise<OrderDestinationRow | undefined> {
    const [rows] = await this.pool.execute<OrderDestinationRow[]>(
      `SELECT s.shipment_id, s.customer_id, s.destination_location, s.origin_location, s.status,
              s.booking_type, s.transport_mode, s.transportation_type,
              COALESCE(s.in_transit_compliance_alert, 0) AS in_transit_compliance_alert,
              (SELECT MAX(rl.planned_arrival)
               FROM route r JOIN route_leg rl ON rl.route_id = r.route_id
               WHERE r.shipment_id = s.shipment_id) AS route_expected_arrival,
              (SELECT MAX(rs.planned_arrival)
               FROM route r JOIN route_stop rs ON rs.route_id = r.route_id
               WHERE r.shipment_id = s.shipment_id) AS stop_expected_arrival,
              (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(COALESCE(rl.arrival_airport_code, '')), '') SEPARATOR ',')
               FROM route r JOIN route_leg rl ON rl.route_id = r.route_id
               WHERE r.shipment_id = s.shipment_id) AS arrival_airport_codes,
              (SELECT GROUP_CONCAT(DISTINCT rs.location_name SEPARATOR ',')
               FROM route r JOIN route_stop rs ON rs.route_id = r.route_id
               WHERE r.shipment_id = s.shipment_id AND rs.stop_type IN ('border_check', 'quarantine')) AS border_stop_names,
              s.requested_date, s.departure_date, s.expected_arrival_date,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code
       FROM shipment s WHERE s.shipment_id = ? LIMIT 1`,
      [orderId],
    );
    return rows[0];
  }

  async setInTransitComplianceAlert(shipmentId: number, alert: boolean): Promise<void> {
    await this.pool.execute(
      'UPDATE shipment SET in_transit_compliance_alert = ? WHERE shipment_id = ?',
      [alert ? 1 : 0, shipmentId],
    );
  }

  async findActiveShipmentIdsByHorseId(horseId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT sh.shipment_id
       FROM shipment_horse sh
       JOIN shipment s ON s.shipment_id = sh.shipment_id
       WHERE sh.horse_id = ? AND s.status NOT IN ('cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded', 'completed')
       ORDER BY sh.shipment_id DESC`,
      [horseId],
    );
    return rows.map((r) => Number(r.shipment_id));
  }

  async hasDocumentsApprovedManagerNotifSent(orderId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM notification
       WHERE shipment_id = ? AND (title LIKE '%đã đủ hồ sơ, có thể gửi yêu cầu thanh toán%' OR title LIKE '%đã đủ hồ sơ kiểm dịch%')`,
      [orderId],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  async findHorsesInOrder(orderId: number): Promise<OrderHorseInfoRow[]> {
    const [rows] = await this.pool.execute<OrderHorseInfoRow[]>(
      `SELECT h.horse_id, h.name, h.owner_id, h.microchip_no, h.passport_no
       FROM shipment_horse sh
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE sh.shipment_id = ?`,
      [orderId],
    );
    return rows;
  }

  async hasRequirementsSent(orderId: number, customerId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM notification 
       WHERE shipment_id = ? AND user_id = ? AND (notif_type = 'document_missing' OR title LIKE '%hồ sơ kiểm dịch%')`,
      [orderId, customerId],
    );
    return Number(rows[0]?.count || 0) > 0;
  }

  async findApprovedShipmentsForSpecialist(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.shipment_id, s.customer_id, u.full_name as customer_name, u.email as customer_email,
              s.origin_location, s.destination_location, s.status, s.created_at,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
              (SELECT COUNT(*) FROM shipment_horse sh WHERE sh.shipment_id = s.shipment_id) as horses_count,
              (SELECT GROUP_CONCAT(h.name SEPARATOR ', ') FROM shipment_horse sh JOIN horse h ON h.horse_id = sh.horse_id WHERE sh.shipment_id = s.shipment_id) as horse_names,
              (SELECT COUNT(*) FROM notification n WHERE n.shipment_id = s.shipment_id AND n.user_id = s.customer_id AND (n.notif_type = 'document_missing' OR n.title LIKE '%hồ sơ kiểm dịch%')) as req_sent_count
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       WHERE s.status IN ('approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed')
       ORDER BY s.shipment_id DESC`,
    );

    return rows.map((r) => ({
      orderId: r.shipment_id,
      requestCode: r.request_code || `REQ-${String(r.shipment_id).padStart(3, '0')}`,
      customerId: r.customer_id,
      customerName: r.customer_name || 'Khách hàng',
      customerEmail: r.customer_email || '',
      originLocation: r.origin_location,
      destinationLocation: r.destination_location,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      horsesCount: Number(r.horses_count || 1),
      horseNames: r.horse_names || 'Ngựa vận chuyển',
      requirementsSent: Number(r.req_sent_count || 0) > 0,
    }));
  }

  async updateDocumentFile(
    documentId: number,
    fileUrl: string,
    docNumber?: string | null,
    notes?: string | null,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE transport_document
       SET file_url = ?,
           doc_number = COALESCE(?, doc_number),
           status = 'submitted',
           reviewer_notes = ?,
           created_at = CURRENT_TIMESTAMP
       WHERE document_id = ?`,
      [fileUrl, docNumber ?? null, notes ?? null, documentId],
    );
  }
}
