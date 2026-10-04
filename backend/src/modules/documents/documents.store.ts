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
  uploader_name?: string;
  uploader_email?: string;
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
      `SELECT d.*, h.name as horse_name, r.country, u.full_name as uploader_name, u.email as uploader_email
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
      regulationId: r.regulation_id,
      regulationCountry: r.country,
      regulationDocType: r.doc_type,
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
      `SELECT d.*, h.name as horse_name, r.country, u.full_name as uploader_name, u.email as uploader_email
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
        regulationId: r.regulation_id,
        regulationCountry: r.country,
        regulationDocType: r.doc_type,
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
      'SELECT shipment_id, customer_id, destination_location, origin_location, status FROM shipment WHERE shipment_id = ? LIMIT 1',
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
}
