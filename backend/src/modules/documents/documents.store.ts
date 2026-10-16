import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  AuthorityApprovalStatus,
  DocumentApproval,
  DocumentStatus,
  Regulation,
  TransportDocument,
} from './documents.types';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';

import { REGULATION_PRESET_TEMPLATES } from './constants/regulation-presets.constant';

interface RegulationRow extends RowDataPacket {
  regulation_id: number;
  country: string;
  document_type: string;
  description: string | null;
  effective_date: Date | null;
  created_at: Date;
}

interface DocumentRow extends RowDataPacket {
  document_id: number;
  horse_id: number;
  regulation_id: number;
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
  country?: string;
  regulation_title?: string;
  regulation_doc_type?: string;
  uploader_name?: string;
  uploader_email?: string;
  request_code?: string;
  customer_request_code?: string;
  shipment_id?: number;
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
}

interface OrderDestinationRow extends RowDataPacket {
  shipment_id: number;
  customer_id: number;
  destination_location: string;
  origin_location: string;
  status: string;
  request_code?: string;
}

@Injectable()
export class DocumentsStore implements OnModuleInit, OnModuleDestroy {
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
    await this.seedInitialRegulations();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  // --- Regulations ---
  async findRegulations(countryFilter?: string): Promise<Regulation[]> {
    let query = 'SELECT * FROM regulation';
    const params: string[] = [];

    if (countryFilter) {
      query += ' WHERE LOWER(country) LIKE LOWER(?)';
      params.push(`%${countryFilter}%`);
    }

    query += ' ORDER BY country ASC, document_type ASC';

    const [rows] = await this.pool.execute<RegulationRow[]>(query, params);
    return rows.map((r) => ({
      id: r.regulation_id,
      country: r.country,
      documentType: r.document_type,
      description: r.description,
      effectiveDate: r.effective_date ? new Date(r.effective_date).toISOString().split('T')[0] : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async findRegulationById(id: number): Promise<Regulation | undefined> {
    const [rows] = await this.pool.execute<RegulationRow[]>(
      'SELECT * FROM regulation WHERE regulation_id = ? LIMIT 1',
      [id],
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.regulation_id,
      country: r.country,
      documentType: r.document_type,
      description: r.description,
      effectiveDate: r.effective_date ? new Date(r.effective_date).toISOString().split('T')[0] : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async createRegulation(dto: CreateRegulationDto): Promise<number> {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : null;
    const [result] = await this.pool.execute(
      'INSERT INTO regulation (country, document_type, description, effective_date) VALUES (?, ?, ?, ?)',
      [dto.country, dto.documentType, dto.description ?? null, effectiveDate],
    );
    return (result as { insertId: number }).insertId;
  }

  async upsertRegulation(
    country: string,
    documentType: string,
    description: string,
    effectiveDate?: string | null,
  ): Promise<number> {
    const [existing] = await this.pool.execute<RegulationRow[]>(
      'SELECT regulation_id FROM regulation WHERE LOWER(country) = LOWER(?) AND LOWER(document_type) = LOWER(?) LIMIT 1',
      [country, documentType],
    );
    const effDate = effectiveDate ? new Date(effectiveDate) : new Date();
    if (existing.length > 0) {
      const regId = existing[0].regulation_id;
      await this.pool.execute(
        'UPDATE regulation SET description = ?, effective_date = ? WHERE regulation_id = ?',
        [description, effDate, regId],
      );
      return regId;
    } else {
      const [result] = await this.pool.execute(
        'INSERT INTO regulation (country, document_type, description, effective_date) VALUES (?, ?, ?, ?)',
        [country, documentType, description, effDate],
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
            );
          }
        }
      }
    } catch (err) {
      // Non-blocking log if DB schema is not ready yet
      console.warn('[DocumentsStore] Warning while seeding initial regulations:', err);
    }
  }

  // --- Transport Documents ---
  async createDocument(uploadedBy: number, dto: UploadDocumentDto): Promise<number> {
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;

    const [result] = await this.pool.execute(
      `INSERT INTO transport_document (
        horse_id, regulation_id, uploaded_by, doc_type, doc_number, file_url, issue_date, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        dto.horseId,
        dto.regulationId,
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
      `SELECT d.*, h.name as horse_name, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id
       FROM transport_document d
       JOIN horse h ON h.horse_id = d.horse_id
       JOIN regulation r ON r.regulation_id = d.regulation_id
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
      docNumber: r.doc_number,
      fileUrl: r.file_url,
      issueDate: r.issue_date ? new Date(r.issue_date).toISOString().split('T')[0] : null,
      expiryDate: r.expiry_date ? new Date(r.expiry_date).toISOString().split('T')[0] : null,
      status: r.status,
      reviewerNotes: r.reviewer_notes,
      createdAt: new Date(r.created_at).toISOString(),
      approvals,
    };
  }

  async findDocumentsByHorseId(horseId: number): Promise<TransportDocument[]> {
    const [rows] = await this.pool.execute<DocumentRow[]>(
      `SELECT d.*, h.name as horse_name, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id
       FROM transport_document d
       JOIN horse h ON h.horse_id = d.horse_id
       JOIN regulation r ON r.regulation_id = d.regulation_id
       JOIN \`user\` u ON u.user_id = d.uploaded_by
       WHERE d.horse_id = ?
       ORDER BY d.created_at DESC`,
      [horseId],
    );

    return Promise.all(
      rows.map(async (r) => ({
        id: r.document_id,
        horseId: r.horse_id,
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
        docNumber: r.doc_number,
        fileUrl: r.file_url,
        issueDate: r.issue_date ? new Date(r.issue_date).toISOString().split('T')[0] : null,
        expiryDate: r.expiry_date ? new Date(r.expiry_date).toISOString().split('T')[0] : null,
        status: r.status,
        reviewerNotes: r.reviewer_notes,
        createdAt: new Date(r.created_at).toISOString(),
        approvals: await this.findApprovalsByDocumentId(r.document_id),
      })),
    );
  }

  async findDocuments(filter: {
    uploadedBy?: number;
    status?: string;
    horseId?: number;
  }): Promise<TransportDocument[]> {
    let query = `
      SELECT d.*, h.name as horse_name, r.country, r.description as regulation_title, r.document_type as regulation_doc_type, u.full_name as uploader_name, u.email as uploader_email,
        (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1) as shipment_id,
        (SELECT CONCAT('REQ-', LPAD(
          (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
          3, '0'
        )) FROM shipment s WHERE s.shipment_id = (SELECT sh.shipment_id FROM shipment_horse sh WHERE sh.horse_id = d.horse_id ORDER BY sh.shipment_id DESC LIMIT 1)) as customer_request_code
      FROM transport_document d
      JOIN horse h ON h.horse_id = d.horse_id
      JOIN regulation r ON r.regulation_id = d.regulation_id
      JOIN \`user\` u ON u.user_id = d.uploaded_by
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.uploadedBy !== undefined) {
      conditions.push('d.uploaded_by = ?');
      params.push(filter.uploadedBy);
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
        horseName: r.horse_name,
        requestCode: filter.uploadedBy !== undefined && r.customer_request_code
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
        docNumber: r.doc_number,
        fileUrl: r.file_url,
        issueDate: r.issue_date ? new Date(r.issue_date).toISOString().split('T')[0] : null,
        expiryDate: r.expiry_date ? new Date(r.expiry_date).toISOString().split('T')[0] : null,
        status: r.status,
        reviewerNotes: r.reviewer_notes,
        createdAt: new Date(r.created_at).toISOString(),
        approvals: await this.findApprovalsByDocumentId(r.document_id),
      })),
    );
  }

  async updateDocumentReview(
    documentId: number,
    status: DocumentStatus,
    notes?: string,
    expiryDate?: string,
  ): Promise<boolean> {
    const newExpiryDate = expiryDate ? new Date(expiryDate) : null;
    const [result] = await this.pool.execute(
      `UPDATE transport_document
       SET status = ?,
           reviewer_notes = ?,
           expiry_date = COALESCE(?, expiry_date)
       WHERE document_id = ?`,
      [status, notes ?? null, newExpiryDate, documentId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async deleteDocument(documentId: number, userId: number, isAdminOrSpecialist: boolean): Promise<boolean> {
    await this.pool.execute('DELETE FROM document_approval WHERE document_id = ?', [documentId]);
    const [result] = await this.pool.execute(
      isAdminOrSpecialist
        ? 'DELETE FROM transport_document WHERE document_id = ?'
        : 'DELETE FROM transport_document WHERE document_id = ? AND uploaded_by = ?',
      isAdminOrSpecialist ? [documentId] : [documentId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
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
    return (result as { insertId: number }).insertId;
  }

  async findApprovalsByDocumentId(documentId: number): Promise<DocumentApproval[]> {
    const [rows] = await this.pool.execute<ApprovalRow[]>(
      `SELECT a.*, u.full_name as approver_name
       FROM document_approval a
       LEFT JOIN \`user\` u ON u.user_id = a.approved_by
       WHERE a.document_id = ?
       ORDER BY a.approval_date DESC`,
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
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code
       FROM shipment s WHERE s.shipment_id = ? LIMIT 1`,
      [orderId],
    );
    return rows[0];
  }

  async findHorsesInOrder(orderId: number): Promise<OrderHorseInfoRow[]> {
    const [rows] = await this.pool.execute<OrderHorseInfoRow[]>(
      `SELECT h.horse_id, h.name, h.owner_id
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
       WHERE s.status IN ('approved', 'planning', 'in_transit', 'completed')
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
