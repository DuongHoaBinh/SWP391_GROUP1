import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { ShipmentAttachment, ShipmentStatus, TransportOrder, OrderHorse } from './orders.types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

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
  change_request_notes: string | null;
  status: ShipmentStatus;
  total_cost: number | string;
  created_at: Date;
  updated_at: Date;
  customer_email?: string;
  approver_name?: string;
  request_code?: string;
  customer_request_code?: string;
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
  color?: string | null;
  weight?: string | null;
  medical_status?: string | null;
  microchip_no?: string | null;
  passport_no?: string | null;
  special_requirements?: string | null;
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

    // 3. Xử lý các con ngựa trong đơn vận chuyển: bắt buộc chọn từ My Horses và chuyển trạng thái sang in_transit
    const horsesToProcess: Array<{
      horseId?: number;
      name: string;
      breed: string | null;
      gender: 'male' | 'female' | 'gelding' | null;
      age: number | null;
      quantity: number;
    }> = [];

    if (dto.horses && dto.horses.length > 0) {
      for (const h of dto.horses) {
        horsesToProcess.push({
          horseId: h.horseId,
          name: h.name,
          breed: h.breed ?? null,
          gender: h.gender ?? null,
          age: h.age ?? null,
          quantity: h.quantity && h.quantity > 0 ? h.quantity : 1,
        });
      }
    } else if (dto.horseName) {
      horsesToProcess.push({
        name: dto.horseName,
        breed: dto.horseBreed ?? null,
        gender: dto.horseGender ?? null,
        age: dto.horseAge ?? null,
        quantity: dto.requestedHorseCount || 1,
      });
    }

    if (horsesToProcess.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một con ngựa cho đơn vận chuyển.');
    }

    for (const h of horsesToProcess) {
      let targetHorseId = h.horseId;

      if (!targetHorseId) {
        const [existing] = await this.pool.execute<RowDataPacket[]>(
          'SELECT horse_id, name, status FROM horse WHERE owner_id = ? AND name = ? AND (status IS NULL OR status != "deleted") ORDER BY horse_id DESC LIMIT 1',
          [customerId, h.name],
        );
        if (existing.length > 0) {
          targetHorseId = existing[0].horse_id;
        }
      }

      if (!targetHorseId) {
        throw new BadRequestException(
          `Ngựa "${h.name}" không tồn tại trong danh sách "My Horses" của bạn. Vui lòng tạo hồ sơ ngựa trước khi gửi yêu cầu vận chuyển.`,
        );
      }

      const [horseRows] = await this.pool.execute<RowDataPacket[]>(
        'SELECT horse_id, name, status FROM horse WHERE horse_id = ? AND owner_id = ?',
        [targetHorseId, customerId],
      );

      if (horseRows.length === 0) {
        throw new BadRequestException(`Không tìm thấy hồ sơ hợp lệ của ngựa "${h.name}" thuộc tài khoản của bạn.`);
      }

      const horse = horseRows[0];
      if (horse.status === 'in_transit') {
        throw new BadRequestException(
          `Ngựa "${horse.name}" hiện đang trong chuyến vận chuyển khác. Không thể chọn vận chuyển nhiều đơn cùng lúc.`,
        );
      }
      if (horse.status === 'delivered') {
        throw new BadRequestException(
          `Ngựa "${horse.name}" đã hoàn tất chuyến vận chuyển trước đó (đã bàn giao).`,
        );
      }
      if (horse.status !== 'active') {
        throw new BadRequestException(
          `Ngựa "${horse.name}" hiện không sẵn sàng để vận chuyển (trạng thái: ${horse.status}).`,
        );
      }

      // Liên kết vào shipment
      await this.pool.execute(
        'INSERT INTO shipment_horse (shipment_id, horse_id, quantity) VALUES (?, ?, ?)',
        [shipmentId, targetHorseId, h.quantity],
      );

      // Cập nhật trạng thái con ngựa sang in_transit để khóa con ngựa không thể đi đơn khác
      await this.pool.execute(
        'UPDATE horse SET status = "in_transit" WHERE horse_id = ?',
        [targetHorseId],
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

  async findShipmentsByCustomer(customerId: number): Promise<TransportOrder[]> {
    const [rows] = await this.pool.execute<ShipmentRow[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
              CONCAT('REQ-', LPAD(ROW_NUMBER() OVER (ORDER BY s.shipment_id ASC), 3, '0')) as request_code
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC`,
      [customerId],
    );

    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async findAllShipments(statusFilter?: ShipmentStatus): Promise<TransportOrder[]> {
    let query = `
      SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
             CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code
      FROM shipment s
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
    `;
    const params: (string | number)[] = [];

    if (statusFilter) {
      query += ' WHERE s.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY s.created_at DESC';

    const [rows] = await this.pool.execute<ShipmentRow[]>(query, params);
    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async findShipmentById(shipmentId: number): Promise<TransportOrder | undefined> {
    const [rows] = await this.pool.execute<ShipmentRow[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
              CONCAT('REQ-', LPAD(
                (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                3, '0'
              )) as customer_request_code,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code
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

    if (status === ShipmentStatus.REJECTED) {
      await this.pool.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)`,
        [shipmentId],
      );
    }

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async completeShipment(shipmentId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET status = 'completed', actual_arrival_date = NOW()
       WHERE shipment_id = ?`,
      [shipmentId],
    );

    await this.pool.execute(
      `UPDATE horse
       SET status = 'delivered'
       WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)`,
      [shipmentId],
    );

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async updateShipmentChangeRequest(
    shipmentId: number,
    notes: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET status = ?, change_request_notes = ?
       WHERE shipment_id = ?`,
      [ShipmentStatus.CHANGE_REQUESTED, notes, shipmentId],
    );

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async updateShipmentStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    const [result] = await this.pool.execute(
      'UPDATE shipment SET status = ?, updated_at = NOW() WHERE shipment_id = ?',
      [status, shipmentId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async findById(shipmentId: number): Promise<TransportOrder | undefined> {
    return this.findShipmentById(shipmentId);
  }

  async updateStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    return this.updateShipmentStatus(shipmentId, status);
  }

  async updateAndResubmitShipment(
    customerId: number,
    shipmentId: number,
    dto: UpdateOrderDto,
  ): Promise<boolean> {
    const requestedDate = dto.requestedDate ? new Date(dto.requestedDate) : null;

    // 1. Cập nhật các thông tin của đơn vận chuyển và chuyển status về requested
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET
         contact_name = COALESCE(?, contact_name),
         contact_address = COALESCE(?, contact_address),
         contact_phone = COALESCE(?, contact_phone),
         contact_email = COALESCE(?, contact_email),
         requested_horse_count = COALESCE(?, requested_horse_count),
         origin_location = COALESCE(?, origin_location),
         destination_location = COALESCE(?, destination_location),
         requested_date = COALESCE(?, requested_date),
         special_requirements = COALESCE(?, special_requirements),
         change_request_notes = NULL,
         status = ?
       WHERE shipment_id = ?`,
      [
        dto.contactName ?? null,
        dto.contactAddress ?? null,
        dto.contactPhone ?? null,
        dto.contactEmail ?? null,
        dto.requestedHorseCount ?? null,
        dto.originLocation ?? null,
        dto.destinationLocation ?? null,
        requestedDate,
        dto.specialRequirements ?? null,
        ShipmentStatus.REQUESTED,
        shipmentId,
      ],
    );

    // 2. Lưu file tài liệu y tế mới nếu có
    if (dto.medicalDocumentUrl) {
      await this.createAttachment(shipmentId, dto.medicalDocumentUrl, customerId);
    }

    // 3. Cập nhật thông tin ngựa nếu có gửi mới
    const horsesToInsert: Array<{
      name: string;
      breed: string | null;
      gender: 'male' | 'female' | 'gelding' | null;
      age: number | null;
    }> = [];

    if (dto.horses && dto.horses.length > 0) {
      for (const h of dto.horses) {
        horsesToInsert.push({
          name: h.name,
          breed: h.breed ?? null,
          gender: h.gender ?? null,
          age: h.age ?? null,
        });
      }
    } else if (dto.horseName) {
      horsesToInsert.push({
        name: dto.horseName,
        breed: dto.horseBreed ?? null,
        gender: dto.horseGender ?? null,
        age: dto.horseAge ?? null,
      });
    }

    if (horsesToInsert.length > 0) {
      await this.pool.execute('DELETE FROM shipment_horse WHERE shipment_id = ?', [shipmentId]);

      for (const h of horsesToInsert) {
        const [hResult] = await this.pool.execute(
          'INSERT INTO horse (owner_id, name, breed, gender, age, status) VALUES (?, ?, ?, ?, ?, ?)',
          [customerId, h.name, h.breed, h.gender, h.age, 'active'],
        );
        const horseId = (hResult as { insertId: number }).insertId;
        await this.pool.execute(
          'INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?)',
          [shipmentId, horseId],
        );
      }
    }

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  private async mapShipmentWithAttachments(row: ShipmentRow): Promise<TransportOrder> {
    const [attachments] = await this.pool.execute<AttachmentRow[]>(
      'SELECT attachment_id, file_url, file_type, uploaded_at FROM attachment WHERE related_type = ? AND related_id = ?',
      ['shipment', row.shipment_id],
    );

    const [horses] = await this.pool.execute<HorseRow[]>(
      `SELECT h.horse_id, h.name, h.breed, h.gender, h.age, h.color, h.weight,
              h.medical_status, h.microchip_no, h.passport_no, h.special_requirements, sh.quantity
       FROM shipment_horse sh
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE sh.shipment_id = ?`,
      [row.shipment_id],
    );

    const requestCode = row.request_code || `REQ-${String(row.shipment_id).padStart(3, '0')}`;

    return {
      id: row.shipment_id,
      requestCode,
      customerRequestCode: row.customer_request_code,
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
      changeRequestNotes: row.change_request_notes ?? null,
      status: row.status,
      totalCost: Number(row.total_cost ?? 0),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      customerEmail: row.customer_email,
      customerName: (row as any).customer_name || row.contact_name || undefined,
      approverName: row.approver_name,
      attachments: attachments.map((att) => ({
        id: att.attachment_id,
        fileUrl: att.file_url,
        fileType: att.file_type,
        uploadedAt: new Date(att.uploaded_at).toISOString(),
      })),
      horses: (horses as any[]).map((h) => ({
        horseId: h.horse_id,
        name: h.name,
        breed: h.breed,
        gender: h.gender,
        age: h.age !== null ? Number(h.age) : null,
        quantity: h.quantity !== null && h.quantity !== undefined ? Number(h.quantity) : 1,
        color: h.color ?? null,
        weight: h.weight ?? null,
        medicalStatus: h.medical_status ?? null,
        microchipNo: h.microchip_no ?? null,
        passportNo: h.passport_no ?? null,
        specialRequirements: h.special_requirements ?? null,
      })),
    };
  }
}
