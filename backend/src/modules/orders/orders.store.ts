import { BadRequestException, ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ShipmentAttachment, ShipmentStatus, TransportOrder, OrderHorse } from './orders.types';
import { CreateOrderDto, HorseInfoDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { calculateInsurance, totalInsuranceFee } from './insurance-policy';
import { BookingQuote, BookingType, calculateBookingQuote, normalizeBookingType } from './booking-policy';

interface ShipmentRow extends RowDataPacket {
  transport_mode: 'road' | 'air' | null;
  booking_type: BookingType;
  stall_unit_price: number | string | null;
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
  transportation_type: string | null;
  special_requirements: string | null;
  rejection_reason: string | null;
  change_request_notes: string | null;
  status: ShipmentStatus;
  total_cost: number | string;
  transport_cost: number | string | null;
  insurance_fee: number | string;
  payment_status?: 'pending' | 'review' | 'succeeded';
  payment_code?: string | null;
  paid_at?: Date | null;
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

  private async transaction<T>(action: (db: PoolConnection) => Promise<T>): Promise<T> {
    const db = await this.pool.getConnection();
    try { await db.beginTransaction(); const result = await action(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  private horseInputs(dto: CreateOrderDto | UpdateOrderDto): HorseInfoDto[] {
    if (dto.horses?.length) return dto.horses;
    return dto.horseName ? [{ name: dto.horseName, breed: dto.horseBreed, gender: dto.horseGender, age: dto.horseAge, quantity: dto.requestedHorseCount ?? 1 }] : [];
  }

  private async insuredHorses(db: PoolConnection, customerId: number, input: HorseInfoDto[], previous: RowDataPacket[] = []) {
    if (!input.length) throw new BadRequestException('Vui lòng chọn ít nhất một con ngựa cho đơn vận chuyển.');
    const seen = new Set<number>();
    const result: Array<ReturnType<typeof calculateInsurance> & { horseId: number; quantity: number }> = [];
    for (const h of [...input].sort((a, b) => (a.horseId ?? 0) - (b.horseId ?? 0) || a.name.localeCompare(b.name))) {
      const [rows] = await db.execute<RowDataPacket[]>(`SELECT horse_id, name, status, quantity FROM horse
        WHERE owner_id = ? AND ${h.horseId ? 'horse_id = ?' : 'name = ?'} ORDER BY horse_id DESC LIMIT 1 FOR UPDATE`, [customerId, h.horseId ?? h.name]);
      const horse = rows[0];
      if (!horse) throw new BadRequestException(`Ngựa "${h.name}" không thuộc My Horses của bạn.`);
      const horseId = Number(horse.horse_id), old = previous.find(p => Number(p.horse_id) === horseId);
      if (seen.has(horseId)) throw new BadRequestException('Một hồ sơ ngựa chỉ được xuất hiện một lần trong đơn');
      seen.add(horseId);
      if (horse.status !== 'active' && !(old && horse.status === 'in_transit')) throw new BadRequestException(`Ngựa "${horse.name}" hiện không sẵn sàng vận chuyển.`);
      const quantity = h.quantity ?? Number(old?.quantity ?? 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > Number(horse.quantity ?? 1)) throw new BadRequestException(`Số lượng ngựa "${horse.name}" không hợp lệ hoặc vượt số lượng trong hồ sơ.`);
      const declaration = {
        declaredValue: h.declaredValue ?? (old ? Number(old.declared_value) : 0),
        declaredCurrency: h.declaredCurrency ?? old?.declared_currency ?? 'VND',
        insurancePackage: h.insurancePackage ?? old?.insurance_package ?? 'basic',
      };
      const unchanged = old && declaration.declaredValue === Number(old.declared_value) &&
        declaration.declaredCurrency === old.declared_currency && declaration.insurancePackage === old.insurance_package;
      const policy = unchanged ? {
        declaredValue: Number(old.declared_value), declaredCurrency: old.declared_currency,
        exchangeRate: Number(old.exchange_rate), declaredValueVnd: Number(old.declared_value_vnd),
        insurancePackage: old.insurance_package, insuranceFee: Number(old.insurance_fee), maxCompensation: Number(old.max_compensation),
        emergencyVetCovered: Boolean(old.emergency_vet_covered), insurancePolicyVersion: old.insurance_policy_version,
      } : calculateInsurance(declaration);
      result.push({ ...policy, horseId, quantity });
    }
    totalInsuranceFee(result);
    return result;
  }

  private async insertInsuredHorses(db: PoolConnection, shipmentId: number, horses: Awaited<ReturnType<OrdersStore['insuredHorses']>>) {
    for (const h of horses) {
      await db.execute(`INSERT INTO shipment_horse (shipment_id, horse_id, quantity, declared_value, declared_currency,
        exchange_rate, declared_value_vnd, insurance_package, insurance_fee, max_compensation, emergency_vet_covered, insurance_policy_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [shipmentId, h.horseId, h.quantity, h.declaredValue, h.declaredCurrency,
        h.exchangeRate, h.declaredValueVnd, h.insurancePackage, h.insuranceFee, h.maxCompensation, h.emergencyVetCovered, h.insurancePolicyVersion]);
      await db.execute("UPDATE horse SET status = 'in_transit' WHERE horse_id = ?", [h.horseId]);
    }
  }

  async createShipment(customerId: number, dto: CreateOrderDto): Promise<number> {
    return this.transaction(async db => {
      const horses = await this.insuredHorses(db, customerId, this.horseInputs(dto));
      const count = horses.reduce((sum, h) => sum + h.quantity, 0);
      if (count !== dto.requestedHorseCount) throw new BadRequestException('Số lượng ngựa khai báo phải khớp danh sách được chọn');
      const [result] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_name, contact_address, contact_phone,
        contact_email, requested_horse_count, origin_location, destination_location, requested_date, transportation_type,
        special_requirements, status, total_cost, transport_cost, insurance_fee, booking_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 0, NULL, ?, ?)`,
        [customerId, customerId, dto.contactName ?? null, dto.contactAddress ?? null, dto.contactPhone, dto.contactEmail,
        count, dto.originLocation, dto.destinationLocation, dto.requestedDate ? new Date(dto.requestedDate) : new Date(),
        dto.transportationType ?? null, dto.specialRequirements ?? null, totalInsuranceFee(horses), normalizeBookingType(dto.bookingType)]);
      const shipmentId = (result as { insertId: number }).insertId;
      await this.insertInsuredHorses(db, shipmentId, horses);
      if (dto.medicalDocumentUrl) await db.execute("INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'document', ?)", [shipmentId, dto.medicalDocumentUrl, customerId]);
      return shipmentId;
    });
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
              CONCAT('REQ-', LPAD(ROW_NUMBER() OVER (ORDER BY s.shipment_id ASC), 3, '0')) as request_code,
              CONCAT('REQ-', LPAD(ROW_NUMBER() OVER (ORDER BY s.shipment_id ASC), 3, '0')) as customer_request_code,
              sp.status as payment_status,
              sp.payment_code as payment_code,
              sp.paid_at as paid_at
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       LEFT JOIN shipment_sepay_payment sp ON sp.shipment_id = s.shipment_id
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC`,
      [customerId],
    );

    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async findAllShipments(statusFilter?: ShipmentStatus): Promise<TransportOrder[]> {
    let query = `
      SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
             CONCAT('REQ-', LPAD(
               (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
               3, '0'
             )) as customer_request_code,
             CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
             sp.status as payment_status,
             sp.payment_code as payment_code,
             sp.paid_at as paid_at
      FROM shipment s
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
      LEFT JOIN shipment_sepay_payment sp ON sp.shipment_id = s.shipment_id
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
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
              sp.status as payment_status,
              sp.payment_code as payment_code,
              sp.paid_at as paid_at
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       LEFT JOIN shipment_sepay_payment sp ON sp.shipment_id = s.shipment_id
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
    transportMode?: "road" | "air",
    quote?: BookingQuote,
  ): Promise<boolean> {
    return this.transaction(async db => {
    const [orders] = await db.execute<RowDataPacket[]>('SELECT insurance_fee, transport_cost, total_cost, booking_type, requested_horse_count, stall_unit_price FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
    if (!orders.length) throw new BadRequestException('Không tìm thấy đơn hàng');
    const pricing = status === ShipmentStatus.APPROVED
      ? calculateBookingQuote(orders[0].booking_type, Number(orders[0].requested_horse_count), quote ?? { transportCost: totalCost })
      : { transportCost: totalCost, stallUnitPrice: orders[0].stall_unit_price };
    totalCost = pricing.transportCost;
    const insuranceFee = Number(orders[0].insurance_fee);
    const combined = totalCost + insuranceFee;
    if (!Number.isSafeInteger(totalCost) || totalCost < 0 || !Number.isSafeInteger(combined) || combined > 9999999999999) throw new BadRequestException('Tổng cước và bảo hiểm vượt giới hạn VNĐ hợp lệ');
    let modeNote: string | null = null;
    if (status === ShipmentStatus.APPROVED && transportMode) {
      if (transportMode === "air") {
        modeNote = "[Phương thức: Đường Hàng Không]";
      } else {
        modeNote = "[Phương thức: Đường Bộ Liên Vận]";
      }
    }

    let query = `UPDATE shipment
       SET status = ?, approved_by = ?, rejection_reason = ?, total_cost = ?, transport_cost = ?, stall_unit_price = ?`;
    const params: any[] = [status, approvedBy, rejectionReason, status === ShipmentStatus.APPROVED ? combined : orders[0].total_cost, status === ShipmentStatus.APPROVED ? totalCost : orders[0].transport_cost, pricing.stallUnitPrice];

    if (status === ShipmentStatus.APPROVED && transportMode) {
      query += ', transport_mode = ?';
      params.push(transportMode);
    }

    if (modeNote) {
      query += `, special_requirements = CASE
        WHEN special_requirements IS NULL OR special_requirements = '' THEN ?
        WHEN special_requirements LIKE ? THEN special_requirements
        ELSE CONCAT(special_requirements, ' | ', ?)
      END`;
      const matchKeyword = transportMode === "air" ? "%Hàng không%" : "%Đường bộ%";
      params.push(modeNote, matchKeyword, modeNote);
    }
    query += ` WHERE shipment_id = ? AND status = 'requested'`;
    params.push(shipmentId);

    const [result] = await db.execute(query, params);
    if (!(result as { affectedRows: number }).affectedRows) throw new BadRequestException('Đơn hàng đã thay đổi, vui lòng tải lại trước khi duyệt.');
    if (status === ShipmentStatus.REJECTED) {
      await db.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)`,
        [shipmentId],
      );
    }

    return (result as { affectedRows: number }).affectedRows > 0;
    });
  }

  async completeShipment(shipmentId: number, actorId: number, requireAssignment: boolean): Promise<boolean> {
    return this.transaction(async db => {
    const [orders] = await db.execute<RowDataPacket[]>('SELECT status FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
    if (!orders[0]) throw new BadRequestException('Không tìm thấy đơn vận chuyển');
    if (requireAssignment) {
      const [assignments] = await db.execute<RowDataPacket[]>(
        "SELECT assignment_id FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? AND role_in_shipment IN ('driver', 'escort') FOR UPDATE", [shipmentId, actorId]);
      if (!assignments.length) throw new ForbiddenException('Bạn không được phân công cho chuyến này');
    }
    if (orders[0].status === 'completed') return false;
    if (orders[0].status !== 'in_transit') throw new BadRequestException('Chỉ được hoàn tất chuyến đã xuất phát');
    const [assignedVehicles] = await db.execute<RowDataPacket[]>('SELECT vehicle_id FROM shipment_vehicle WHERE shipment_id = ? ORDER BY vehicle_id', [shipmentId]);
    const vehicleIds = [...new Set(assignedVehicles.map(v => Number(v.vehicle_id)))];
    if (vehicleIds.length) await db.execute(`SELECT vehicle_id FROM vehicle WHERE vehicle_id IN (${vehicleIds.map(() => '?').join(',')}) ORDER BY vehicle_id FOR UPDATE`, vehicleIds);
    const [result] = await db.execute(
      `UPDATE shipment
       SET status = 'completed', actual_arrival_date = NOW()
        WHERE shipment_id = ? AND status = 'in_transit'`,
      [shipmentId],
    );

    await db.execute(
      `UPDATE horse
       SET status = 'delivered'
       WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)`,
      [shipmentId],
    );

    await db.execute("UPDATE route SET status = 'completed', plan_status = 'completed' WHERE shipment_id = ? AND plan_status = 'in_transit'", [shipmentId]);
    for (const id of vehicleIds) await db.execute(`UPDATE vehicle v SET status = 'available' WHERE v.vehicle_id = ? AND v.status = 'in_use'
      AND NOT EXISTS (SELECT 1 FROM shipment_vehicle sv JOIN shipment s ON s.shipment_id = sv.shipment_id WHERE sv.vehicle_id = v.vehicle_id AND s.status NOT IN ('completed','cancelled','rejected'))`, [id]);

    return (result as { affectedRows: number }).affectedRows > 0;
    });
  }

  async updateShipmentChangeRequest(
    shipmentId: number,
    notes: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET status = ?, change_request_notes = ?
       WHERE shipment_id = ? AND status = 'requested'`,
      [ShipmentStatus.CHANGE_REQUESTED, notes, shipmentId],
    );
    if (!(result as { affectedRows: number }).affectedRows) throw new BadRequestException('Đơn hàng đã thay đổi, vui lòng tải lại trước khi yêu cầu chỉnh sửa.');
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async updateShipmentStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    const [result] = await this.pool.execute(
      'UPDATE shipment SET status = ?, updated_at = NOW() WHERE shipment_id = ?',
      [status, shipmentId],
    );

    if (status === ShipmentStatus.COMPLETED || (status as string) === 'completed') {
      await this.pool.execute(
        `UPDATE horse
         SET status = 'delivered'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
           AND status NOT IN ('retired', 'deceased')`,
        [shipmentId],
      );
    } else if (status === ShipmentStatus.CANCELLED || status === ShipmentStatus.REJECTED) {
      await this.pool.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
           AND status NOT IN ('delivered', 'retired', 'deceased')`,
        [shipmentId],
      );
    }

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async findById(shipmentId: number): Promise<TransportOrder | undefined> {
    return this.findShipmentById(shipmentId);
  }

  async updateStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    return this.updateShipmentStatus(shipmentId, status);
  }

  async updatePricing(shipmentId: number, transportCost: number, totalCost: number, stallUnitPrice?: number | null): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET transport_cost = ?, total_cost = ?, stall_unit_price = COALESCE(?, stall_unit_price), updated_at = NOW()
       WHERE shipment_id = ?`,
      [transportCost, totalCost, stallUnitPrice ?? null, shipmentId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async cancelShipment(shipmentId: number): Promise<boolean> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();
      const [rows] = await db.execute<RowDataPacket[]>('SELECT status FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      if (rows[0]?.status === 'cancelled') { await db.commit(); return false; }
      if (!rows[0] || !['requested', 'change_requested'].includes(rows[0].status)) throw new BadRequestException('Chỉ được hủy yêu cầu trước khi phê duyệt.');
      await db.execute("UPDATE shipment SET status = 'cancelled' WHERE shipment_id = ?", [shipmentId]);
      await db.execute("UPDATE horse h JOIN shipment_horse sh ON sh.horse_id = h.horse_id SET h.status = 'active' WHERE sh.shipment_id = ?", [shipmentId]);
      await db.commit();
      return true;
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  async updateAndResubmitShipment(customerId: number, shipmentId: number, dto: UpdateOrderDto): Promise<boolean> {
    return this.transaction(async db => {
      const [orders] = await db.execute<RowDataPacket[]>('SELECT * FROM shipment WHERE shipment_id = ? AND customer_id = ? FOR UPDATE', [shipmentId, customerId]);
      if (!orders[0] || orders[0].status !== 'change_requested') throw new BadRequestException('Chỉ được gửi lại yêu cầu đang cần chỉnh sửa');
      const bookingType = normalizeBookingType(dto.bookingType ?? orders[0].booking_type);
      if (bookingType !== orders[0].booking_type) {
        await db.execute('INSERT INTO shipment_booking_revision (shipment_id, changed_by, previous_booking_type, booking_type) VALUES (?, ?, ?, ?)',
          [shipmentId, customerId, orders[0].booking_type, bookingType]);
      }
      const [previous] = await db.execute<RowDataPacket[]>('SELECT * FROM shipment_horse WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      const input = this.horseInputs(dto);
      const horses = input.length ? await this.insuredHorses(db, customerId, input, previous) : null;
      const count = horses ? horses.reduce((sum, h) => sum + h.quantity, 0) : previous.reduce((sum, h) => sum + Number(h.quantity), 0);
      if (dto.requestedHorseCount !== undefined && dto.requestedHorseCount !== count) throw new BadRequestException('Số lượng ngựa phải khớp danh sách được chọn');
      const fee = horses ? totalInsuranceFee(horses) : Number(orders[0].insurance_fee);
      if (horses) {
        await db.execute('INSERT INTO shipment_insurance_revision (shipment_id, changed_by, previous_snapshot) VALUES (?, ?, ?)', [shipmentId, customerId, JSON.stringify(previous)]);
        await db.execute('DELETE FROM shipment_horse WHERE shipment_id = ?', [shipmentId]);
        for (const old of previous) if (!horses.some(h => h.horseId === Number(old.horse_id))) {
          await db.execute("UPDATE horse SET status = 'active' WHERE horse_id = ? AND status = 'in_transit'", [old.horse_id]);
        }
        await this.insertInsuredHorses(db, shipmentId, horses);
      }
      await db.execute(`UPDATE shipment SET contact_name = COALESCE(?, contact_name), contact_address = COALESCE(?, contact_address),
        contact_phone = COALESCE(?, contact_phone), contact_email = COALESCE(?, contact_email), origin_location = COALESCE(?, origin_location),
        destination_location = COALESCE(?, destination_location), requested_date = COALESCE(?, requested_date),
        special_requirements = COALESCE(?, special_requirements), requested_horse_count = ?, insurance_fee = ?,
        total_cost = 0, transport_cost = NULL, stall_unit_price = NULL, booking_type = ?, change_request_notes = NULL, status = 'requested' WHERE shipment_id = ?`,
        [dto.contactName ?? null, dto.contactAddress ?? null, dto.contactPhone ?? null, dto.contactEmail ?? null,
        dto.originLocation ?? null, dto.destinationLocation ?? null, dto.requestedDate ? new Date(dto.requestedDate) : null,
        dto.specialRequirements ?? null, count, fee, bookingType, shipmentId]);
      if (dto.medicalDocumentUrl) await db.execute("INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'document', ?)", [shipmentId, dto.medicalDocumentUrl, customerId]);
      return true;
    });
  }

  private async mapShipmentWithAttachments(row: ShipmentRow): Promise<TransportOrder> {
    const [attachments] = await this.pool.execute<AttachmentRow[]>(
      'SELECT attachment_id, file_url, file_type, uploaded_at FROM attachment WHERE related_type = ? AND related_id = ?',
      ['shipment', row.shipment_id],
    );

    const [horses] = await this.pool.execute<HorseRow[]>(
      `SELECT h.horse_id, h.name, h.breed, h.gender, h.age, h.color, h.weight,
              h.medical_status, h.microchip_no, h.passport_no, h.special_requirements, sh.quantity, sh.declared_value, sh.declared_currency, sh.exchange_rate, sh.declared_value_vnd, sh.insurance_package, sh.insurance_fee, sh.max_compensation, sh.emergency_vet_covered, sh.insurance_policy_version
       FROM shipment_horse sh
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE sh.shipment_id = ?`,
      [row.shipment_id],
    );

    const requestCode = row.request_code || `REQ-${String(row.shipment_id).padStart(3, '0')}`;

    return {
      id: row.shipment_id,
      transportMode: row.transport_mode ?? null,
      bookingType: row.booking_type ?? 'shared_stall',
      stallUnitPrice: row.stall_unit_price == null ? null : Number(row.stall_unit_price),
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
      transportationType: row.transportation_type ?? null,
      specialRequirements: row.special_requirements,
      rejectionReason: row.rejection_reason,
      changeRequestNotes: row.change_request_notes ?? null,
      status: row.status,
      totalCost: Number(row.total_cost ?? 0),
      transportCost: row.transport_cost == null ? null : Number(row.transport_cost),
      insuranceFee: Number(row.insurance_fee ?? 0),
      paymentStatus: row.payment_status ?? 'unpaid',
      paymentCode: row.payment_code ?? null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
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
        declaredValue: Number(h.declared_value ?? 0), declaredCurrency: h.declared_currency ?? 'VND',
        exchangeRate: Number(h.exchange_rate ?? 1), declaredValueVnd: Number(h.declared_value_vnd ?? 0),
        insurancePackage: h.insurance_package ?? 'basic', insuranceFee: Number(h.insurance_fee ?? 0),
        maxCompensation: Number(h.max_compensation ?? 50000000), emergencyVetCovered: Boolean(h.emergency_vet_covered),
        insurancePolicyVersion: h.insurance_policy_version ?? 'equine-v1',
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
