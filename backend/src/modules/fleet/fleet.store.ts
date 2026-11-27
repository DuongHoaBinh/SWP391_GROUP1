import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import { loadRequiredStallSlots } from './capacity-policy';
import { findShipmentReservations, INACTIVE_SHIPMENT_SQL } from './vehicle-reservation';
import { CreateDepotDto, UpdateDepotDto } from './dto/depot.dto';
import {
  AvailableStaff,
  DepotEntity,
  VehicleClass,
  ShipmentStaffAssignment,
  ShipmentStaffRole,
  ShipmentVehicleAssignment,
  VehicleEntity,
  VehicleStatus,
  VehicleType,
} from './fleet.types';
import { StaffAssignmentItemDto } from './dto/assign-staff.dto';
import {
  computeBackupPoolSlaDueAt,
  computeDriverPrimarySlaDueAt,
} from '../orders/sla-timeline.policy';

/** Dữ liệu xe đã chuẩn hóa từ loại phương tiện (service resolve trước khi ghi). */
export interface VehicleWriteInput {
  vehicleType: VehicleType;
  vehicleClassCode: string | null;
  plateOrCode: string;
  capacity: number;
  status?: VehicleStatus;
  currentLocation?: string;
  depotId: number | null;
}

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
  is_backup_pool?: boolean | number | null;
  sla_due_at?: Date | null;
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
    if (this.pool && !this.injectedPool) {
      await this.pool.end();
    }
  }

  private getVehicleSelectSql(): string {
    return `
      SELECT v.vehicle_id, v.vehicle_type, v.plate_or_code, v.capacity, v.status, v.current_location, v.vehicle_class_code, v.depot_id, vc.name_vi AS vehicle_class_name, vc.name_en AS vehicle_class_name_en, vc.is_heavy_truck, d.name AS depot_name,
             CASE 
               WHEN v.status = 'maintenance' THEN 'maintenance'
               WHEN transit_leg.shipment_id IS NOT NULL OR transit_sv.shipment_id IS NOT NULL THEN 'in_use'
               WHEN active_leg.shipment_id IS NOT NULL OR active_sv.shipment_id IS NOT NULL OR active_res.shipment_id IS NOT NULL THEN 'in_use'
               ELSE v.status
             END AS computed_status,
             CASE
               WHEN transit_leg.shipment_id IS NOT NULL OR transit_sv.shipment_id IS NOT NULL THEN 0
               WHEN active_leg.shipment_id IS NOT NULL OR active_sv.shipment_id IS NOT NULL OR active_res.shipment_id IS NOT NULL THEN 1
               ELSE 0
             END AS is_reserved_only,
             COALESCE(transit_leg.shipment_id, transit_sv.shipment_id, active_leg.shipment_id, active_sv.shipment_id, active_res.shipment_id) AS assigned_shipment_id,
             COALESCE(transit_leg.shipment_status, transit_sv.shipment_status, active_leg.shipment_status, active_sv.shipment_status, active_res.shipment_status) AS assigned_shipment_status,
             v.created_at
      FROM vehicle v
      LEFT JOIN (
        SELECT rl.vehicle_id, MIN(r.shipment_id) AS shipment_id, MIN(s.status) AS shipment_status
        FROM route_leg rl
        JOIN route r ON r.route_id = rl.route_id
        JOIN shipment s ON s.shipment_id = r.shipment_id
        WHERE s.status IN ('in_transit', 'return_pending')
          AND rl.vehicle_id IS NOT NULL
          AND rl.status != 'completed'
          AND rl.actual_arrival IS NULL
        GROUP BY rl.vehicle_id
      ) transit_leg ON transit_leg.vehicle_id = v.vehicle_id
      LEFT JOIN (
        SELECT sv.vehicle_id, MIN(sv.shipment_id) AS shipment_id, MIN(s.status) AS shipment_status
        FROM shipment_vehicle sv
        JOIN shipment s ON s.shipment_id = sv.shipment_id
        WHERE s.status IN ('in_transit', 'return_pending')
        GROUP BY sv.vehicle_id
      ) transit_sv ON transit_sv.vehicle_id = v.vehicle_id
      LEFT JOIN (
        SELECT rl.vehicle_id, MIN(r.shipment_id) as shipment_id, MIN(s.status) AS shipment_status
        FROM route_leg rl
        JOIN route r ON r.route_id = rl.route_id
        JOIN shipment s ON s.shipment_id = r.shipment_id
        WHERE s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending')
          AND rl.vehicle_id IS NOT NULL
          AND rl.status != 'completed'
          AND rl.actual_arrival IS NULL
        GROUP BY rl.vehicle_id
      ) active_leg ON active_leg.vehicle_id = v.vehicle_id
      LEFT JOIN (
        SELECT sv.vehicle_id, MIN(sv.shipment_id) as shipment_id, MIN(s.status) AS shipment_status
        FROM shipment_vehicle sv
        JOIN shipment s ON s.shipment_id = sv.shipment_id
        LEFT JOIN route r ON r.shipment_id = s.shipment_id
        LEFT JOIN route_leg rl ON rl.route_id = r.route_id AND rl.vehicle_id = sv.vehicle_id
        WHERE s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending')
          AND (rl.leg_id IS NULL OR (rl.status != 'completed' AND rl.actual_arrival IS NULL))
        GROUP BY sv.vehicle_id
      ) active_sv ON active_sv.vehicle_id = v.vehicle_id
      LEFT JOIN (
        -- Step 9: xe đang được giữ chỗ (đơn còn hoạt động, khung giờ chưa kết thúc)
        SELECT vr.vehicle_id, MIN(vr.shipment_id) AS shipment_id, MIN(s.status) AS shipment_status
        FROM vehicle_reservation vr
        JOIN shipment s ON s.shipment_id = vr.shipment_id
        WHERE vr.status IN ('active','consumed') AND vr.end_at > NOW()
          AND s.status NOT IN ${INACTIVE_SHIPMENT_SQL}
        GROUP BY vr.vehicle_id
      ) active_res ON active_res.vehicle_id = v.vehicle_id
      LEFT JOIN vehicle_class vc ON vc.code = v.vehicle_class_code
       LEFT JOIN depot d ON d.depot_id = v.depot_id
      WHERE 1=1
    `;
  }

  async findAllVehicles(status?: VehicleStatus, type?: VehicleType, depotId?: number): Promise<VehicleEntity[]> {
    let sql = this.getVehicleSelectSql();
    const params: any[] = [];

    if (depotId) {
      sql += ' AND v.depot_id = ?';
      params.push(depotId);
    }

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
    const sql = `${this.getVehicleSelectSql()} AND v.vehicle_id = ? LIMIT 1`;
    const [rows] = await this.pool.execute<any[]>(sql, [id]);
    const r = rows[0];
    return r ? this.mapVehicleRow(r) : undefined;
  }

  async findVehiclesByIds(ids: number[]): Promise<VehicleEntity[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const sql = `${this.getVehicleSelectSql()} AND v.vehicle_id IN (${placeholders})`;
    const [rows] = await this.pool.query<any[]>(sql, ids);
    return rows.map((r) => this.mapVehicleRow(r));
  }

  async createVehicle(dto: VehicleWriteInput): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        dto.vehicleType,
        dto.vehicleClassCode,
        dto.plateOrCode.trim(),
        dto.depotId,
        dto.capacity,
        dto.status ?? VehicleStatus.AVAILABLE,
        dto.currentLocation || 'Fleet Operations Depot',
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  async updateVehicle(vehicleId: number, dto: Partial<VehicleWriteInput>): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (dto.vehicleClassCode !== undefined) {
      sets.push('vehicle_class_code = ?');
      params.push(dto.vehicleClassCode);
    }
    if (dto.depotId !== undefined) {
      sets.push('depot_id = ?');
      params.push(dto.depotId);
    }
    if (dto.vehicleType !== undefined) {
      sets.push('vehicle_type = ?');
      params.push(dto.vehicleType);
    }
    if (dto.plateOrCode !== undefined) {
      sets.push('plate_or_code = ?');
      params.push(dto.plateOrCode.trim());
    }
    if (dto.capacity !== undefined) {
      sets.push('capacity = ?');
      params.push(dto.capacity);
    }
    if (dto.status !== undefined) {
      sets.push('status = ?');
      params.push(dto.status);
    }
    if (dto.currentLocation !== undefined) {
      sets.push('current_location = ?');
      params.push(dto.currentLocation.trim() || 'Fleet Operations Depot');
    }
    if (sets.length === 0) return;
    params.push(vehicleId);
    await this.pool.execute(`UPDATE vehicle SET ${sets.join(', ')} WHERE vehicle_id = ?`, params);
  }

  async deleteVehicle(vehicleId: number): Promise<void> {
    const [activeTrips] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
       FROM route_leg rl
       JOIN route r ON r.route_id = rl.route_id
       JOIN shipment s ON s.shipment_id = r.shipment_id
       WHERE rl.vehicle_id = ? AND s.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')`,
      [vehicleId],
    );
    if (Number(activeTrips[0]?.cnt ?? 0) > 0) {
      throw new BadRequestException('Phương tiện đang gắn vào lộ trình chuyến đi hoạt động, không thể xóa.');
    }
    await this.pool.execute('DELETE FROM vehicle WHERE vehicle_id = ?', [vehicleId]);
  }

  async findRoleNameById(roleId: number): Promise<string | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT role_name FROM `role` WHERE role_id = ? LIMIT 1',
      [roleId],
    );
    return rows[0]?.role_name ?? null;
  }

  async validateStaffEligibilityAndSchedule(
    shipmentId: number,
    userIds: number[],
    assignments?: Array<{ userId: number; roleInShipment?: string }>,
  ): Promise<void> {
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) return;

    const placeholders = uniqueIds.map(() => '?').join(',');
    const [users] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.user_id, u.full_name, u.status, r.role_name
       FROM \`user\` u
       JOIN \`role\` r ON r.role_id = u.role_id
       WHERE u.user_id IN (${placeholders})`,
      uniqueIds,
    );

    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('Một hoặc nhiều nhân sự được chọn không tồn tại.');
    }

    for (const u of users) {
      if (u.status && u.status !== 'active') {
        throw new BadRequestException(`Nhân sự "${u.full_name}" hiện không ở trạng thái hoạt động.`);
      }
      if (String(u.role_name).toLowerCase() === 'customer') {
        throw new BadRequestException(`Tài khoản "${u.full_name}" là Khách hàng, không thể phân công vận hành chuyến.`);
      }
    }

    // Check time overlap against other active non-sibling shipments that have scheduled legs
    const [targetLegs] = await this.pool.execute<RowDataPacket[]>(
      `SELECT rl.leg_type, rl.vehicle_id, rl.sequence_no, rl.road_trip_id, rl.planned_departure, rl.planned_arrival
       FROM route_leg rl
       JOIN route r ON r.route_id = rl.route_id
       WHERE r.shipment_id = ? AND rl.planned_departure IS NOT NULL AND rl.planned_arrival IS NOT NULL`,
      [shipmentId],
    );

    if (targetLegs.length === 0) return;
    const siblingIds = new Set(await this.findSiblingShipmentsOnSameRoadTrip(shipmentId));
    const hasFlightLeg = targetLegs.some((l) => l.leg_type === 'flight');
    const roleByUserId = new Map<number, string>();
    for (const a of assignments || []) {
      if (a && Number.isFinite(Number(a.userId)) && a.roleInShipment) {
        roleByUserId.set(Number(a.userId), String(a.roleInShipment).toLowerCase());
      }
    }

    for (const u of users) {
      const assignedRole = roleByUserId.get(Number(u.user_id));
      // On multimodal air shipments, the road truck driver only operates company road leg(s) (e.g. Farm -> Departure Airport),
      // while the veterinary escort accompanies the horses across all legs (road + flight + arrival clearance).
      const applicableLegs =
        hasFlightLeg && assignedRole === 'driver'
          ? targetLegs.filter(
              (l) => l.leg_type === 'road' && (l.vehicle_id !== null || Number(l.sequence_no) === 1),
            )
          : targetLegs;

      for (const leg of applicableLegs) {
        const [conflicts] = await this.pool.execute<RowDataPacket[]>(
          `SELECT DISTINCT s.shipment_id
           FROM shipment_assignment sa
           JOIN shipment s ON s.shipment_id = sa.shipment_id
           JOIN route r ON r.shipment_id = s.shipment_id
           JOIN route_leg ol ON ol.route_id = r.route_id
           WHERE sa.user_id = ?
             AND s.shipment_id <> ?
             AND s.status IN ('planning', 'ready_to_depart', 'in_transit', 'return_pending')
             AND (sa.confirmation_notes IS NULL OR sa.confirmation_notes NOT LIKE 'TỪ CHỐI%')
             AND (
               sa.role_in_shipment <> 'driver'
               OR (
                 ol.leg_type = 'road'
                 AND ol.status <> 'completed'
                 AND (ol.vehicle_id IS NOT NULL OR ol.sequence_no = 1)
               )
             )
             AND ol.planned_departure IS NOT NULL AND ol.planned_arrival IS NOT NULL
             AND ol.planned_departure < ? AND ol.planned_arrival > ?`,
          [u.user_id, shipmentId, leg.planned_arrival, leg.planned_departure],
        );
        const realConflict = conflicts.find((c) => !siblingIds.has(Number(c.shipment_id)));
        if (realConflict) {
          throw new BadRequestException(
            `Nhân sự "${u.full_name}" đã có lịch trùng thời gian trên chuyến REQ-${String(realConflict.shipment_id).padStart(3, '0')}. Vui lòng chọn nhân sự khác.`,
          );
        }
      }
    }
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
        WHERE sv.vehicle_id IN (${ids.map(() => '?').join(',')}) AND sv.shipment_id <> ? AND s.status NOT IN ('completed','cancelled','cancelled_operational','rejected')`, [...ids, shipmentId]);
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
              sa.is_backup_pool, sa.sla_due_at,
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
      isBackupPool: Boolean(r.is_backup_pool),
      slaDueAt: r.sla_due_at ? new Date(r.sla_due_at).toISOString() : null,
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
    const [existing] = await this.pool.execute<any[]>(
      'SELECT user_id, role_in_shipment, assigned_date, is_confirmed, confirmed_at, confirmation_notes, is_backup_pool, sla_due_at FROM shipment_assignment WHERE shipment_id = ?',
      [shipmentId],
    );
    const existingMap = new Map<string, any>();
    for (const e of existing) {
      existingMap.set(`${e.user_id}_${e.role_in_shipment}`, e);
    }

    await this.pool.execute('DELETE FROM shipment_assignment WHERE shipment_id = ?', [shipmentId]);
    const now = new Date();

    for (const item of assignments) {
      const prev = existingMap.get(`${item.userId}_${item.roleInShipment}`);
      const shouldPreserve = prev && Boolean(prev.is_confirmed) === true;
      const isConfirmed = shouldPreserve ? true : false;
      const confirmedAt = shouldPreserve ? prev.confirmed_at : null;
      const confirmationNotes = shouldPreserve ? prev.confirmation_notes : null;
      const isBackupPool = Boolean(item.isBackupPool ?? prev?.is_backup_pool);
      const needsDriverSla = ['driver', 'escort'].includes(item.roleInShipment);
      const slaDueAt = shouldPreserve
        ? (prev.sla_due_at ?? null)
        : needsDriverSla
          ? isBackupPool
            ? computeBackupPoolSlaDueAt(now)
            : computeDriverPrimarySlaDueAt(now)
          : null;
      const assignedDate = shouldPreserve && prev.assigned_date ? prev.assigned_date : now;

      await this.pool.execute(
        `INSERT INTO shipment_assignment (
          shipment_id, user_id, role_in_shipment, assigned_date, is_confirmed, confirmed_at, confirmation_notes, is_backup_pool, sla_due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [shipmentId, item.userId, item.roleInShipment, assignedDate, isConfirmed, confirmedAt, confirmationNotes, isBackupPool ? 1 : 0, slaDueAt],
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
        AND s2.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')
    `, [shipmentId]);
    return rows.map((r) => Number(r.shipment_id));
  }

  async findAvailableStaff(): Promise<AvailableStaff[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.status, u.specialization, u.current_shift, u.duty_status, r.role_id, r.role_name,
              (
                SELECT COUNT(*)
                FROM shipment_assignment sa
                JOIN shipment s ON sa.shipment_id = s.shipment_id
                WHERE sa.user_id = u.user_id
                  AND s.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')
                  AND (sa.confirmation_notes IS NULL OR sa.confirmation_notes NOT LIKE 'TỪ CHỐI%')
                  AND NOT (
                    sa.role_in_shipment = 'driver'
                    AND EXISTS (
                      SELECT 1
                      FROM route r_fl
                      JOIN route_leg rl_fl ON rl_fl.route_id = r_fl.route_id
                      WHERE r_fl.shipment_id = s.shipment_id AND rl_fl.leg_type = 'flight'
                    )
                    AND EXISTS (
                      SELECT 1
                      FROM route r_rd
                      JOIN route_leg rl_rd ON rl_rd.route_id = r_rd.route_id
                      WHERE r_rd.shipment_id = s.shipment_id
                        AND rl_rd.leg_type = 'road'
                        AND (rl_rd.sequence_no = 1 OR rl_rd.vehicle_id IS NOT NULL)
                    )
                    AND NOT EXISTS (
                      SELECT 1
                      FROM route r_open
                      JOIN route_leg rl_open ON rl_open.route_id = r_open.route_id
                      WHERE r_open.shipment_id = s.shipment_id
                        AND rl_open.leg_type = 'road'
                        AND (rl_open.sequence_no = 1 OR rl_open.vehicle_id IS NOT NULL)
                        AND rl_open.status <> 'completed'
                    )
                  )
              ) AS active_trips_count
       FROM \`user\` u
       JOIN \`role\` r ON u.role_id = r.role_id
       WHERE r.role_name NOT IN ('Customer', 'Admin', 'Logistics Manager') AND u.role_id NOT IN (1, 2, 6)
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
      currentShift: r.current_shift ?? 'Ca Hành Chính (08:00 - 17:00)',
      dutyStatus: r.duty_status ?? 'ON_DUTY',
    }));
  }

  async updateStaffShift(
    userId: number,
    currentShift: string,
    dutyStatus: string,
    releaseActiveTrips = false,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE `user` SET current_shift = ?, duty_status = ? WHERE user_id = ?',
      [currentShift.trim(), dutyStatus, userId],
    );
    if (result.affectedRows > 0 && releaseActiveTrips) {
      await this.pool.execute(
        `DELETE sa
         FROM shipment_assignment sa
         JOIN shipment s ON sa.shipment_id = s.shipment_id
         WHERE sa.user_id = ?
           AND s.status NOT IN ('in_transit', 'return_pending', 'completed', 'cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded')`,
        [userId],
      );
    }
    return result.affectedRows > 0;
  }

  async findUserByEmail(email: string): Promise<any | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await this.pool.execute<any[]>(
      'SELECT user_id, email FROM `user` WHERE LOWER(email) = ? LIMIT 1',
      [normalizedEmail],
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
    createdBy?: number | null;
  }): Promise<AvailableStaff> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const resolvedSpec = dto.roleId === 5 ? (dto.specialization || 'driver') : null;
    const defaultShift = dto.roleId === 5 ? 'Morning (06:00 - 14:00)' : 'Ca Hành Chính (08:00 - 17:00)';
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO \`user\` (role_id, specialization, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status, created_by, current_shift, duty_status)
       VALUES (?, ?, ?, ?, ?, ?, 'system_created', 'local', 1, 'active', ?, ?, 'ON_DUTY')`,
      [
        dto.roleId,
        resolvedSpec,
        dto.fullName.trim(),
        normalizedEmail,
        dto.phone?.trim() || null,
        dto.passwordHash,
        dto.createdBy ?? null,
        defaultShift,
      ],
    );

    const [roleRows] = await this.pool.execute<any[]>(
      'SELECT role_name FROM `role` WHERE role_id = ?',
      [dto.roleId],
    );
    const roleName = roleRows[0]?.role_name || 'Staff';

    return {
      id: result.insertId,
      fullName: dto.fullName.trim(),
      email: normalizedEmail,
      phone: dto.phone?.trim() || null,
      roleId: dto.roleId,
      roleName,
      specialization: resolvedSpec,
      activeTrips: 0,
      status: 'active',
      currentShift: defaultShift,
      dutyStatus: 'ON_DUTY',
    };
  }

  // --- Số chỗ chuồng, loại phương tiện, trạm xe (Step 3, review 11/2026) ---
  async findRequiredStallSlots(shipmentId: number, fallbackHorseCount: number): Promise<number> {
    return loadRequiredStallSlots(this.pool, shipmentId, fallbackHorseCount);
  }

  /** Ngựa của đơn (số lượng) để tính jet stall / sức chứa */
  async findShipmentStallHorses(shipmentId: number): Promise<Array<{ quantity: number }>> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT sh.quantity FROM shipment_horse sh WHERE sh.shipment_id = ?`,
      [shipmentId],
    );
    return rows.map((r) => ({ quantity: Number(r.quantity) || 1 }));
  }

  /** Step 9: xe đang giữ chỗ (active/consumed) của đơn */
  async findShipmentReservations(shipmentId: number) {
    return findShipmentReservations(this.pool, shipmentId);
  }

  async findVehicleClasses(): Promise<VehicleClass[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM vehicle_class WHERE code <> 'ferry_slot' ORDER BY sort_order, code",
    );
    return rows.map((r) => this.mapVehicleClassRow(r));
  }

  async findVehicleClassByCode(code: string): Promise<VehicleClass | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT * FROM vehicle_class WHERE code = ? LIMIT 1', [code]);
    return rows[0] ? this.mapVehicleClassRow(rows[0]) : undefined;
  }

  async findDepots(): Promise<DepotEntity[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT d.*, (SELECT COUNT(*) FROM vehicle v WHERE v.depot_id = d.depot_id) AS vehicle_count
       FROM depot d
       ORDER BY d.type, d.country, d.name`,
    );
    return rows.map((r) => this.mapDepotRow(r));
  }

  async findDepotById(id: number): Promise<DepotEntity | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT d.*, (SELECT COUNT(*) FROM vehicle v WHERE v.depot_id = d.depot_id) AS vehicle_count
       FROM depot d WHERE d.depot_id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? this.mapDepotRow(rows[0]) : undefined;
  }

  async findDepotByCode(code: string): Promise<DepotEntity | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT d.*, 0 AS vehicle_count FROM depot d WHERE d.code = ? LIMIT 1',
      [code.trim().toUpperCase()],
    );
    return rows[0] ? this.mapDepotRow(rows[0]) : undefined;
  }

  async createDepot(dto: CreateDepotDto): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO depot (code, name, country, city, address, lat, lng, type, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.code.trim().toUpperCase(),
        dto.name.trim(),
        dto.country.trim(),
        dto.city.trim(),
        dto.address?.trim() || null,
        dto.lat,
        dto.lng,
        dto.type ?? 'own',
        dto.isActive ?? true,
      ],
    );
    return result.insertId;
  }

  async updateDepot(id: number, dto: UpdateDepotDto): Promise<void> {
    const columns: Record<string, string> = {
      code: 'code', name: 'name', country: 'country', city: 'city', address: 'address',
      lat: 'lat', lng: 'lng', type: 'type', isActive: 'is_active',
    };
    const sets: string[] = [];
    const params: (string | number | boolean | null)[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (dto as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      if (typeof value === 'string') {
        params.push(key === 'code' ? value.trim().toUpperCase() : value.trim() || null);
      } else {
        params.push(value as number | boolean);
      }
    }
    if (!sets.length) return;
    params.push(id);
    await this.pool.execute(`UPDATE depot SET ${sets.join(', ')} WHERE depot_id = ?`, params);
  }

  async deleteDepot(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM depot WHERE depot_id = ?', [id]);
  }

  private mapVehicleClassRow(r: RowDataPacket): VehicleClass {
    return {
      code: r.code,
      mode: r.mode,
      nameVi: r.name_vi,
      nameEn: r.name_en,
      horseCapacity: r.horse_capacity != null ? Number(r.horse_capacity) : null,
      priceCoefficient: Number(r.price_coefficient),
      isHeavyTruck: Boolean(r.is_heavy_truck),
      sortOrder: Number(r.sort_order ?? 0),
    };
  }

  private mapDepotRow(r: RowDataPacket): DepotEntity {
    return {
      id: Number(r.depot_id),
      code: r.code,
      name: r.name,
      country: r.country,
      city: r.city,
      address: r.address ?? null,
      lat: Number(r.lat),
      lng: Number(r.lng),
      type: r.type,
      isActive: Boolean(r.is_active),
      vehicleCount: Number(r.vehicle_count ?? 0),
      createdAt: new Date(r.created_at).toISOString(),
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
      vehicleClassCode: r.vehicle_class_code ?? null,
      vehicleClassName: r.vehicle_class_name ?? null,
      vehicleClassNameEn: r.vehicle_class_name_en ?? null,
      isHeavyTruck: Boolean(r.is_heavy_truck),
      depotId: r.depot_id != null ? Number(r.depot_id) : null,
      depotName: r.depot_name ?? null,
      assignedShipmentId: assignedId,
      assignedTripCode: assignedId ? `REQ-${String(assignedId).padStart(3, '0')}` : null,
      assignedShipmentStatus: r.assigned_shipment_status ?? null,
      isReservedOnly: Boolean(Number(r.is_reserved_only ?? 0)),
    };
  }
}
