import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
    let sql = 'SELECT vehicle_id, vehicle_type, plate_or_code, capacity, status, created_at FROM vehicle WHERE 1=1';
    const params: any[] = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (type) {
      sql += ' AND vehicle_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY vehicle_id ASC';
    const [rows] = await this.pool.execute<VehicleRow[]>(sql, params);
    return rows.map((r) => this.mapVehicleRow(r));
  }

  async findVehicleById(id: number): Promise<VehicleEntity | undefined> {
    const [rows] = await this.pool.execute<VehicleRow[]>(
      'SELECT vehicle_id, vehicle_type, plate_or_code, capacity, status, created_at FROM vehicle WHERE vehicle_id = ? LIMIT 1',
      [id],
    );
    const r = rows[0];
    return r ? this.mapVehicleRow(r) : undefined;
  }

  async findVehiclesByIds(ids: number[]): Promise<VehicleEntity[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await this.pool.query<VehicleRow[]>(
      `SELECT vehicle_id, vehicle_type, plate_or_code, capacity, status, created_at FROM vehicle WHERE vehicle_id IN (${placeholders})`,
      ids,
    );
    return rows.map((r) => this.mapVehicleRow(r));
  }

  async createVehicle(dto: CreateVehicleDto): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status) VALUES (?, ?, ?, ?)',
      [dto.vehicleType, dto.plateOrCode, dto.capacity, dto.status ?? VehicleStatus.AVAILABLE],
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
    // Xóa các liên kết cũ nếu có
    await this.pool.execute('DELETE FROM shipment_vehicle WHERE shipment_id = ?', [shipmentId]);

    for (const vId of vehicleIds) {
      await this.pool.execute(
        'INSERT INTO shipment_vehicle (shipment_id, vehicle_id, assigned_date) VALUES (?, ?, NOW())',
        [shipmentId, vId],
      );
    }
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
    await this.pool.execute('DELETE FROM shipment_assignment WHERE shipment_id = ?', [shipmentId]);

    for (const item of assignments) {
      await this.pool.execute(
        'INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, assigned_date) VALUES (?, ?, ?, NOW())',
        [shipmentId, item.userId, item.roleInShipment],
      );
    }
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

  private mapVehicleRow(r: VehicleRow): VehicleEntity {
    return {
      id: r.vehicle_id,
      vehicleType: r.vehicle_type,
      plateOrCode: r.plate_or_code,
      capacity: Number(r.capacity),
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }
}
