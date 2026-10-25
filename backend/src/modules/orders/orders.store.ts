import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { ShipmentAttachment, ShipmentStatus, TransportOrder, OrderHorse } from './orders.types';
import { CreateOrderDto } from './dto/create-order.dto';

export interface OrderQueryParams {
  status?: ShipmentStatus;
  departureDateFrom?: string;   // ISO date string
  departureDateTo?: string;     // ISO date string
  sortBy?: 'createdAt' | 'totalCost' | 'requestedDate';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedOrders {
  data: TransportOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ShipmentRow extends RowDataPacket {
  shipment_id: number;
  customer_id: number;
  requested_by: number;
  approved_by: number | null;
  contact_name: string | null;
  contact_address: string | null;
  contact_phone: string;
  contact_email: string;
  requested_horse_count: number;
  origin_location: string;
  destination_location: string;
  requested_date: Date;
  departure_date: Date | null;
  expected_arrival_date: Date | null;
  actual_arrival_date: Date | null;
  special_requirements: string | null;
  rejection_reason: string | null;
  status: ShipmentStatus;
  total_cost: number | string;
  created_at: Date;
  updated_at: Date;
  customer_email?: string;
  approver_name?: string;
}

interface AttachmentRow extends RowDataPacket {
  attachment_id: number;
  file_url: string;
  file_type: 'image' | 'document' | 'video';
  uploaded_at: Date;
}

interface HorseRow extends RowDataPacket {
  horse_id: number;
  name: string;
  breed: string | null;
  gender: 'male' | 'female' | 'gelding' | null;
  age: number | null;
}

interface HorseInsertData {
  name: string;
  breed: string | null;
  gender: 'male' | 'female' | 'gelding' | null;
  age: number | null;
  microchipNumber: string | null;
}

@Injectable()
export class OrdersStore implements OnModuleInit, OnModuleDestroy {
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

  async createShipment(customerId: number, dto: CreateOrderDto): Promise<number> {
    const requestedDate = dto.requestedDate ? new Date(dto.requestedDate) : new Date();

    // 1. Tạo đơn vận chuyển trong bảng shipment
    const [result] = await this.pool.execute(
      `INSERT INTO shipment (
        customer_id, requested_by, contact_name, contact_address, contact_phone, contact_email,
        requested_horse_count, origin_location, destination_location, requested_date,
        special_requirements, status, total_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 0)`,
      [
        customerId,
        customerId,
        dto.contactName ?? null,
        dto.contactAddress ?? null,
        dto.contactPhone,
        dto.contactEmail,
        dto.requestedHorseCount ?? 1,
        dto.originLocation,
        dto.destinationLocation,
        requestedDate,
        dto.specialRequirements ?? null,
      ],
    );

    const shipmentId = (result as { insertId: number }).insertId;

    // 2. Lưu file tài liệu y tế nếu có
    if (dto.medicalDocumentUrl) {
      await this.createAttachment(shipmentId, dto.medicalDocumentUrl, customerId);
    }

    // 3. Lưu thông tin con ngựa vào bảng horse và liên kết qua shipment_horse
    const horsesToInsert: HorseInsertData[] = [];

    if (dto.horses && dto.horses.length > 0) {
      for (const h of dto.horses) {
        horsesToInsert.push({
          name: h.name,
          breed: h.breed ?? null,
          gender: h.gender ?? null,
          age: h.age ?? null,
          microchipNumber: h.microchipNumber ?? null,
        });
      }
    } else if (dto.horseName) {
      horsesToInsert.push({
        name: dto.horseName,
        breed: dto.horseBreed ?? null,
        gender: dto.horseGender ?? null,
        age: dto.horseAge ?? null,
        microchipNumber: null,
      });
    }

    for (const h of horsesToInsert) {
      const [hResult] = await this.pool.execute(
        'INSERT INTO horse (owner_id, name, breed, gender, age, status, microchip_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [customerId, h.name, h.breed, h.gender, h.age, 'active', h.microchipNumber ?? null],
      );
      const horseId = (hResult as { insertId: number }).insertId;
      await this.pool.execute(
        'INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?)',
        [shipmentId, horseId],
      );
    }

    return shipmentId;
  }

  async createAttachment(
    shipmentId: number,
    fileUrl: string,
    uploadedBy: number,
    fileType: 'image' | 'document' | 'video' = 'document',
  ): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      ['shipment', shipmentId, fileUrl, fileType, uploadedBy],
    );
    return (result as { insertId: number }).insertId;
  }

  async checkMicrochipExists(microchipNumber: string, excludeHorseId?: number): Promise<boolean> {
    let query = 'SELECT COUNT(*) as cnt FROM horse WHERE microchip_number = ?';
    const params: (string | number)[] = [microchipNumber];
    if (excludeHorseId) {
      query += ' AND horse_id != ?';
      params.push(excludeHorseId);
    }
    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return (rows[0] as any).cnt > 0;
  }

  async findShipmentsByCustomer(customerId: number, params: OrderQueryParams = {}): Promise<PaginatedOrders> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', departureDateFrom, departureDateTo, status } = params;
    const offset = (page - 1) * limit;

    const sortColumn = sortBy === 'totalCost' ? 's.total_cost' : sortBy === 'requestedDate' ? 's.requested_date' : 's.created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE s.customer_id = ?';
    const queryParams: (string | number)[] = [customerId];

    if (status) {
      whereClause += ' AND s.status = ?';
      queryParams.push(status);
    }
    if (departureDateFrom) {
      whereClause += ' AND DATE(s.requested_date) >= ?';
      queryParams.push(departureDateFrom);
    }
    if (departureDateTo) {
      whereClause += ' AND DATE(s.requested_date) <= ?';
      queryParams.push(departureDateTo);
    }

    // Count total
    const [countRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM shipment s JOIN \`user\` u ON u.user_id = s.customer_id ${whereClause}`,
      queryParams,
    );
    const total = (countRows[0] as any).total as number;

    // Fetch data
    const dataQuery = `
      SELECT s.*, u.email as customer_email, a.full_name as approver_name
      FROM shipment s
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
      ${whereClause}
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await this.pool.execute<ShipmentRow[]>(dataQuery, [...queryParams, limit, offset]);

    const data = await Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAllShipments(params: OrderQueryParams = {}): Promise<PaginatedOrders> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', departureDateFrom, departureDateTo, status } = params;
    const offset = (page - 1) * limit;

    const sortColumn = sortBy === 'totalCost' ? 's.total_cost' : sortBy === 'requestedDate' ? 's.requested_date' : 's.created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    let whereClause = '';
    const queryParams: (string | number)[] = [];

    const conditions: string[] = [];
    if (status) {
      conditions.push('s.status = ?');
      queryParams.push(status);
    }
    if (departureDateFrom) {
      conditions.push('DATE(s.requested_date) >= ?');
      queryParams.push(departureDateFrom);
    }
    if (departureDateTo) {
      conditions.push('DATE(s.requested_date) <= ?');
      queryParams.push(departureDateTo);
    }
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Count total
    const [countRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM shipment s JOIN \`user\` u ON u.user_id = s.customer_id ${whereClause}`,
      queryParams,
    );
    const total = (countRows[0] as any).total as number;

    // Fetch data
    const dataQuery = `
      SELECT s.*, u.email as customer_email, a.full_name as approver_name
      FROM shipment s
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
      ${whereClause}
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await this.pool.execute<ShipmentRow[]>(dataQuery, [...queryParams, limit, offset]);

    const data = await Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findShipmentById(shipmentId: number): Promise<TransportOrder | undefined> {
    const [rows] = await this.pool.execute<ShipmentRow[]>(
      `SELECT s.*, u.email as customer_email, a.full_name as approver_name
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       WHERE s.shipment_id = ?
       LIMIT 1`,
      [shipmentId],
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return this.mapShipmentWithAttachments(row);
  }

  async updateShipmentApproval(
    shipmentId: number,
    approvedBy: number,
    status: ShipmentStatus.APPROVED | ShipmentStatus.REJECTED,
    rejectionReason: string | null = null,
    totalCost: number = 0,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET status = ?, approved_by = ?, rejection_reason = ?, total_cost = CASE WHEN ? > 0 THEN ? ELSE total_cost END
       WHERE shipment_id = ?`,
      [status, approvedBy, rejectionReason, totalCost, totalCost, shipmentId],
    );

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  private async mapShipmentWithAttachments(row: ShipmentRow): Promise<TransportOrder> {
    const [attachments] = await this.pool.execute<AttachmentRow[]>(
      'SELECT attachment_id, file_url, file_type, uploaded_at FROM attachment WHERE related_type = ? AND related_id = ?',
      ['shipment', row.shipment_id],
    );

    const [horses] = await this.pool.execute<HorseRow[]>(
      `SELECT h.horse_id, h.name, h.breed, h.gender, h.age
       FROM shipment_horse sh
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE sh.shipment_id = ?`,
      [row.shipment_id],
    );

    return {
      id: row.shipment_id,
      customerId: row.customer_id,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      contactName: row.contact_name,
      contactAddress: row.contact_address,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      requestedHorseCount: row.requested_horse_count,
      originLocation: row.origin_location,
      destinationLocation: row.destination_location,
      requestedDate: new Date(row.requested_date).toISOString(),
      departureDate: row.departure_date ? new Date(row.departure_date).toISOString() : null,
      expectedArrivalDate: row.expected_arrival_date ? new Date(row.expected_arrival_date).toISOString() : null,
      actualArrivalDate: row.actual_arrival_date ? new Date(row.actual_arrival_date).toISOString() : null,
      specialRequirements: row.special_requirements,
      rejectionReason: row.rejection_reason,
      status: row.status,
      totalCost: Number(row.total_cost ?? 0),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      customerEmail: row.customer_email,
      approverName: row.approver_name,
      attachments: attachments.map((att) => ({
        id: att.attachment_id,
        fileUrl: att.file_url,
        fileType: att.file_type,
        uploadedAt: new Date(att.uploaded_at).toISOString(),
      })),
      horses: horses.map((h) => ({
        horseId: h.horse_id,
        name: h.name,
        breed: h.breed,
        gender: h.gender,
        age: h.age !== null ? Number(h.age) : null,
      })),
    };
  }
}
