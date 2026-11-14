import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
  AvailableStaff,
  ShipmentStaffAssignment,
  ShipmentStaffRole,
  ShipmentVehicleAssignment,
  VehicleEntity,
  VehicleStatus,
  VehicleType,
} from './fleet.types';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { StaffAssignmentItemDto } from './dto/assign-staff.dto';

interface VehicleRow extends RowDataPacket {
  vehicle_id: number;
  vehicle_type: VehicleType;
  plate_or_code: string;
  capacity: number;
  status: VehicleStatus;
  created_at: Date;
}

interface ShipmentVehicleRow extends RowDataPacket {
  shipment_vehicle_id: number;
  shipment_id: number;
  vehicle_id: number;
  assigned_date: Date;
  vehicle_type: VehicleType;
  plate_or_code: string;
  capacity: number;
  status: VehicleStatus;
  created_at: Date;
}

interface ShipmentStaffRow extends RowDataPacket {
  assignment_id: number;
  shipment_id: number;
  user_id: number;
  role_in_shipment: ShipmentStaffRole;
  assigned_date: Date;
  is_confirmed: boolean | number;
  confirmed_at: Date | null;
  confirmation_notes: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role_name: string;
}

interface UserStaffRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role_name: string;
}

@Injectable()
export class FleetStore implements OnModuleInit, OnModuleDestroy {
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

    try {
      const [cols] = await this.pool.query<any[]>(
        "SHOW COLUMNS FROM `user` LIKE 'specialization'",
      );
      if (cols.length === 0) {
        await this.pool.execute(
          'ALTER TABLE `user` ADD COLUMN `specialization` VARCHAR(50) NULL DEFAULT NULL',
        );
      }
      await this.pool.execute(
        `UPDATE \`user\` SET \`specialization\` = 'driver'
         WHERE \`role_id\` = 5 AND \`specialization\` IS NULL AND (\`full_name\` LIKE '%Tài xế%' OR \`full_name\` LIKE '%Driver%' OR \`email\` LIKE '%driver%')`,
      );
      await this.pool.execute(
        `UPDATE \`user\` SET \`specialization\` = 'escort'
         WHERE \`role_id\` = 5 AND \`specialization\` IS NULL AND (\`full_name\` LIKE '%Thú y%' OR \`full_name\` LIKE '%Escort%' OR \`full_name\` LIKE '%Vet%' OR \`email\` LIKE '%escort%')`,
      );
      await this.pool.execute(
        `UPDATE \`user\` SET \`specialization\` = 'driver'
         WHERE \`role_id\` = 5 AND \`specialization\` IS NULL`,
      );

      const [vehCols] = await this.pool.query<any[]>(
        "SHOW COLUMNS FROM `vehicle` LIKE 'current_location'",
      );
      if (vehCols.length === 0) {
        await this.pool.execute(
          'ALTER TABLE `vehicle` ADD COLUMN `current_location` VARCHAR(255) NULL DEFAULT "Fleet Operations Depot"',
        );
      }
    } catch (e: any) {
      // Ignore migration errors on init
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async findAllVehicles(status?: VehicleStatus, type?: VehicleType): Promise<VehicleEntity[]> {
    let sql = `
      SELECT v.vehicle_id, v.vehicle_type, v.plate_or_code, v.capacity, v.current_location,
             CASE 
               WHEN active_leg.shipment_id IS NOT NULL THEN 'in_use'
               WHEN active_sv.shipment_id IS NOT NULL THEN 'in_use'
               ELSE v.status
             END AS computed_status,
             COALESCE(active_leg.shipment_id, active_sv.shipment_id) AS assigned_shipment_id,
             v.created_at
      FROM vehicle v
      LEFT JOIN (
        SELECT rl.vehicle_id, MIN(r.shipment_id) as shipment_id
        FROM route_leg rl
        JOIN route r ON r.route_id = rl.route_id
        JOIN shipment s ON s.shipment_id = r.shipment_id
        WHERE s.status IN ('planning', 'ready_to_depart', 'in_transit')
          AND rl.vehicle_id IS NOT NULL
          AND rl.status != 'completed'
          AND rl.actual_arrival IS NULL
        GROUP BY rl.vehicle_id
      ) active_leg ON active_leg.vehicle_id = v.vehicle_id
      LEFT JOIN (
        SELECT sv.vehicle_id, MIN(sv.shipment_id) as shipment_id
        FROM shipment_vehicle sv
        JOIN shipment s ON s.shipment_id = sv.shipment_id
        LEFT JOIN route r ON r.shipment_id = s.shipment_id
        LEFT JOIN route_leg rl ON rl.route_id = r.route_id AND rl.vehicle_id = sv.vehicle_id
        WHERE s.status IN ('planning', 'ready_to_depart', 'in_transit')
          AND (rl.leg_id IS NULL OR (rl.status != 'completed' AND rl.actual_arrival IS NULL))
        GROUP BY sv.vehicle_id
      ) active_sv ON active_sv.vehicle_id = v.vehicle_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      sql += ' AND v.vehicle_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY v.vehicle_id ASC';
    const [rows] = await this.pool.execute<any[]>(sql, params);
    let mapped = rows.map((r) => this.mapVehicleRow(r));
    if (status) {
      mapped = mapped.filter((m) => m.status === status);
    }
    return mapped;
  }

  async findVehicleById(id: number): Promise<VehicleEntity | undefined> {
    const [rows] = await this.pool.execute<VehicleRow[]>(
      'SELECT vehicle_id, vehicle_type, plate_or_code, capacity, status, current_location, created_at FROM vehicle WHERE vehicle_id = ? LIMIT 1',
      [id],
    );
    const r = rows[0];
    return r ? this.mapVehicleRow(r) : undefined;
  }

  async findVehiclesByIds(ids: number[]): Promise<VehicleEntity[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await this.pool.query<VehicleRow[]>(
      `SELECT vehicle_id, vehicle_type, plate_or_code, capacity, status, current_location, created_at FROM vehicle WHERE vehicle_id IN (${placeholders})`,
      ids,
    );
    return rows.map((r) => this.mapVehicleRow(r));
  }

  async createVehicle(dto: CreateVehicleDto): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status, current_location) VALUES (?, ?, ?, ?, ?)',
      [
        dto.vehicleType, 
        dto.plateOrCode, 
        dto.capacity, 
        dto.status ?? VehicleStatus.AVAILABLE,
        dto.currentLocation || 'Fleet Operations Depot'
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  async updateVehicleStatus(vehicleId: number, status: VehicleStatus): Promise<void> {
    await this.pool.execute('UPDATE vehicle SET status = ? WHERE vehicle_id = ?', [status, vehicleId]);
  }

  async updateVehiclesStatus(vehicleIds: number[], status: VehicleStatus): Promise<void> {
    if (vehicleIds.length === 0) return;
    const placeholders = vehicleIds.map(() => '?').join(',');
    await this.pool.query(`UPDATE vehicle SET status = ? WHERE vehicle_id IN (${placeholders})`, [
      status,
      ...vehicleIds,
    ]);
  }

  async findAssignedVehicles(shipmentId: number): Promise<ShipmentVehicleAssignment[]> {
    const [rows] = await this.pool.execute<ShipmentVehicleRow[]>(
      `SELECT sv.shipment_vehicle_id, sv.shipment_id, sv.vehicle_id, sv.assigned_date,
              v.vehicle_type, v.plate_or_code, v.capacity, v.status, v.created_at
       FROM shipment_vehicle sv
       JOIN vehicle v ON sv.vehicle_id = v.vehicle_id
       WHERE sv.shipment_id = ?
       ORDER BY sv.shipment_vehicle_id ASC`,
      [shipmentId],
    );

    return rows.map((r) => ({
      shipmentVehicleId: r.shipment_vehicle_id,
      shipmentId: r.shipment_id,
      vehicleId: r.vehicle_id,
      assignedDate: new Date(r.assigned_date).toISOString(),
      vehicle: {
        id: r.vehicle_id,
        vehicleType: r.vehicle_type,
        plateOrCode: r.plate_or_code,
        capacity: Number(r.capacity),
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
      },
    }));
  }

  async assignVehicles(shipmentId: number, vehicleIds: number[]): Promise<void> {
    const db = await this.pool.getConnection();
    try {
    await db.beginTransaction();
    const [orders] = await db.execute<RowDataPacket[]>('SELECT status, requested_horse_count FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
    if (!orders[0] || !['approved', 'planning'].includes(orders[0].status)) throw new BadRequestException('Chỉ phân công xe trước khi kế hoạch được xác nhận');
    const ids = [...new Set(vehicleIds)].sort((a, b) => a - b);
    if (ids.length) {
      const [vehicles] = await db.execute<RowDataPacket[]>(`SELECT * FROM vehicle WHERE vehicle_id IN (${ids.map(() => '?').join(',')}) ORDER BY vehicle_id FOR UPDATE`, ids);
      if (vehicles.length !== ids.length || vehicles.some(v => v.status === 'maintenance') || vehicles.reduce((sum, v) => sum + Number(v.capacity), 0) < Number(orders[0].requested_horse_count)) throw new BadRequestException('Phương tiện không hoạt động hoặc không đủ sức chứa');
      const [conflicts] = await db.execute<RowDataPacket[]>(`SELECT sv.shipment_id FROM shipment_vehicle sv JOIN shipment s ON s.shipment_id = sv.shipment_id
        WHERE sv.vehicle_id IN (${ids.map(() => '?').join(',')}) AND sv.shipment_id <> ? AND s.status NOT IN ('completed','cancelled','rejected')`, [...ids, shipmentId]);
      if (conflicts.length) throw new BadRequestException('Xe đã có phân công. Hãy chọn chuyến đường bộ trong màn hình lập tuyến để ghép chỗ và kiểm tra lịch');
    }
    const [planned] = await db.execute<RowDataPacket[]>('SELECT l.leg_id FROM route_leg l JOIN route r ON r.route_id = l.route_id WHERE r.shipment_id = ? AND l.vehicle_id IS NOT NULL', [shipmentId]);
    if (planned.length) throw new BadRequestException('Xe đã có trong kế hoạch. Hãy điều chỉnh tại màn hình lập tuyến');
    await db.execute('DELETE FROM shipment_vehicle WHERE shipment_id = ?', [shipmentId]);
    for (const vId of ids) {
      await db.execute(
        'INSERT INTO shipment_vehicle (shipment_id, vehicle_id, assigned_date) VALUES (?, ?, NOW())',
        [shipmentId, vId],
      );
    }
    await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  async findAssignedStaff(shipmentId: number): Promise<ShipmentStaffAssignment[]> {
    const [rows] = await this.pool.execute<ShipmentStaffRow[]>(
      `SELECT sa.assignment_id, sa.shipment_id, sa.user_id, sa.role_in_shipment, sa.assigned_date,
              sa.is_confirmed, sa.confirmed_at, sa.confirmation_notes,
              u.full_name, u.email, u.phone, r.role_name
       FROM shipment_assignment sa
       JOIN \`user\` u ON sa.user_id = u.user_id
       JOIN \`role\` r ON u.role_id = r.role_id
       WHERE sa.shipment_id = ?
       ORDER BY sa.assignment_id ASC`,
      [shipmentId],
    );

    return rows.map((r) => ({
      assignmentId: r.assignment_id,
      shipmentId: r.shipment_id,
      userId: r.user_id,
      roleInShipment: r.role_in_shipment,
      assignedDate: new Date(r.assigned_date).toISOString(),
      isConfirmed: Boolean(r.is_confirmed),
      confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
      confirmationNotes: r.confirmation_notes,
      user: {
        id: r.user_id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        roleName: r.role_name,
      },
    }));
  }

  async assignStaff(shipmentId: number, assignments: StaffAssignmentItemDto[]): Promise<void> {
    // 1. Lấy danh sách phân công hiện tại để bảo toàn trạng thái xác nhận của nhân sự không thay đổi
    const [existing] = await this.pool.execute<any[]>(
      'SELECT user_id, role_in_shipment, is_confirmed, confirmed_at, confirmation_notes FROM shipment_assignment WHERE shipment_id = ?',
      [shipmentId],
    );
    const existingMap = new Map<string, any>();
    for (const e of existing) {
      existingMap.set(`${e.user_id}_${e.role_in_shipment}`, e);
    }

    await this.pool.execute('DELETE FROM shipment_assignment WHERE shipment_id = ?', [shipmentId]);

    for (const item of assignments) {
      const prev = existingMap.get(`${item.userId}_${item.roleInShipment}`);
      // Nếu nhân sự này đã từng được phân công và ĐÃ XÁC NHẬN (chấp nhận), giữ nguyên trạng thái xác nhận!
      // Nếu trước đó họ từ chối và Manager vẫn phân công lại họ, hoặc là người mới, thì reset về chờ xác nhận
      const shouldPreserve = prev && Boolean(prev.is_confirmed) === true;
      const isConfirmed = shouldPreserve ? true : false;
      const confirmedAt = shouldPreserve ? prev.confirmed_at : null;
      const confirmationNotes = shouldPreserve ? prev.confirmation_notes : null;

      await this.pool.execute(
        'INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, assigned_date, is_confirmed, confirmed_at, confirmation_notes) VALUES (?, ?, ?, NOW(), ?, ?, ?)',
        [shipmentId, item.userId, item.roleInShipment, isConfirmed, confirmedAt, confirmationNotes],
      );
    }
  }

  async findSiblingShipmentsOnSameRoadTrip(shipmentId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<any[]>(`
      SELECT DISTINCT r2.shipment_id
      FROM route_leg l1
      JOIN route r1 ON r1.route_id = l1.route_id
      JOIN route_leg l2 ON l2.road_trip_id = l1.road_trip_id AND l2.leg_id <> l1.leg_id
      JOIN route r2 ON r2.route_id = l2.route_id
      JOIN shipment s2 ON s2.shipment_id = r2.shipment_id
      WHERE r1.shipment_id = ? AND l1.road_trip_id IS NOT NULL
        AND s2.status NOT IN ('completed', 'cancelled', 'rejected')
    `, [shipmentId]);
    return rows.map((r) => Number(r.shipment_id));
  }

  async findAvailableStaff(): Promise<AvailableStaff[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.status, u.specialization, r.role_id, r.role_name,
              (
                SELECT COUNT(*)
                FROM shipment_assignment sa
                JOIN shipment s ON sa.shipment_id = s.shipment_id
                WHERE sa.user_id = u.user_id
                  AND s.status NOT IN ('completed', 'cancelled')
                  AND (sa.confirmation_notes IS NULL OR sa.confirmation_notes NOT LIKE 'TỪ CHỐI%')
              ) AS active_trips_count
       FROM \`user\` u
       JOIN \`role\` r ON u.role_id = r.role_id
       WHERE r.role_name != 'Customer' AND u.role_id != 6
       ORDER BY r.role_name ASC, u.full_name ASC`,
    );

    return rows.map((r) => ({
      id: r.user_id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      roleId: r.role_id,
      roleName: r.role_name,
      specialization: r.specialization || (r.role_id === 5 ? (r.email?.includes('escort') ? 'escort' : 'driver') : null),
      activeTrips: Number(r.active_trips_count || 0),
      status: r.status,
    }));
  }

  async findUserByEmail(email: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT user_id, email FROM `user` WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] || null;
  }

  async createStaffUser(dto: {
    fullName: string;
    email: string;
    phone?: string;
    roleId: number;
    specialization?: string;
    passwordHash: string;
  }): Promise<AvailableStaff> {
    const resolvedSpec = dto.specialization || (dto.roleId === 5 ? 'driver' : null);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO \`user\` (role_id, specialization, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
       VALUES (?, ?, ?, ?, ?, ?, 'system_created', 'local', 1, 'active')`,
      [
        dto.roleId,
        resolvedSpec,
        dto.fullName,
        dto.email,
        dto.phone || null,
        dto.passwordHash,
      ],
    );

    const [roleRows] = await this.pool.execute<any[]>(
      'SELECT role_name FROM `role` WHERE role_id = ?',
      [dto.roleId],
    );
    const roleName = roleRows[0]?.role_name || 'Staff';

    return {
      id: result.insertId,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone || null,
      roleId: dto.roleId,
      roleName,
      specialization: resolvedSpec,
      activeTrips: 0,
      status: 'active',
    };
  }

  private mapVehicleRow(r: any): VehicleEntity {
    const computedStatus = (r.computed_status || r.status) as VehicleStatus;
    const assignedId = r.assigned_shipment_id ? Number(r.assigned_shipment_id) : null;
    return {
      id: r.vehicle_id,
      vehicleType: r.vehicle_type,
      plateOrCode: r.plate_or_code,
      capacity: Number(r.capacity),
      status: computedStatus,
      createdAt: new Date(r.created_at).toISOString(),
      currentLocation: r.current_location || 'Fleet Operations Depot',
      assignedShipmentId: assignedId,
      assignedTripCode: assignedId ? `REQ-${String(assignedId).padStart(3, '0')}` : null,
    };
  }
}
