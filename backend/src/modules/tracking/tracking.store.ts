import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  HorseConditionStatus,
  HorseHealthLogEntity,
  TripStatusLogEntity,
} from './tracking.types';

@Injectable()
export class TrackingStore implements OnModuleInit, OnModuleDestroy {
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
      // 1. Check & add columns to route_leg
      const [legCols] = await this.pool.query<any[]>("SHOW COLUMNS FROM `route_leg`");
      const legColNames = legCols.map((c) => c.Field);

      if (!legColNames.includes('actual_departure')) {
        await this.pool.execute('ALTER TABLE `route_leg` ADD COLUMN `actual_departure` DATETIME NULL');
      }
      if (!legColNames.includes('actual_arrival')) {
        await this.pool.execute('ALTER TABLE `route_leg` ADD COLUMN `actual_arrival` DATETIME NULL');
      }

      // 2. Check & add columns to route_stop
      const [stopCols] = await this.pool.query<any[]>("SHOW COLUMNS FROM `route_stop`");
      const stopColNames = stopCols.map((c) => c.Field);

      if (!stopColNames.includes('actual_arrival')) {
        await this.pool.execute('ALTER TABLE `route_stop` ADD COLUMN `actual_arrival` DATETIME NULL');
      }
      if (!stopColNames.includes('actual_departure')) {
        await this.pool.execute('ALTER TABLE `route_stop` ADD COLUMN `actual_departure` DATETIME NULL');
      }
      if (!stopColNames.includes('updated_by')) {
        await this.pool.execute('ALTER TABLE `route_stop` ADD COLUMN `updated_by` INT NULL');
      }
      if (!stopColNames.includes('notes')) {
        await this.pool.execute('ALTER TABLE `route_stop` ADD COLUMN `notes` TEXT NULL');
      }
      if (!stopColNames.includes('status')) {
        await this.pool.execute(
          "ALTER TABLE `route_stop` ADD COLUMN `status` ENUM('pending', 'arrived', 'departed', 'customs_cleared') NOT NULL DEFAULT 'pending'",
        );
      }

      // 3. Create trip_status_log
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS \`trip_status_log\` (
          \`log_id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`shipment_id\` INT NOT NULL,
          \`route_id\` INT NOT NULL,
          \`leg_id\` INT NULL,
          \`route_stop_id\` INT NULL,
          \`previous_status\` VARCHAR(50) NULL,
          \`new_status\` VARCHAR(50) NOT NULL,
          \`milestone_type\` VARCHAR(50) NOT NULL,
          \`milestone_name\` VARCHAR(255) NOT NULL,
          \`notes\` TEXT NULL,
          \`updated_by\` INT NOT NULL,
          \`updated_by_role\` VARCHAR(50) NOT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tsl_shipment (\`shipment_id\`)
        ) ENGINE=InnoDB
      `);

      // 4. Create horse_health_log
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS \`horse_health_log\` (
          \`log_id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`shipment_id\` INT NOT NULL,
          \`horse_id\` INT NULL,
          \`horse_name\` VARCHAR(150) NOT NULL,
          \`recorded_by\` INT NOT NULL,
          \`condition_status\` ENUM('stable', 'not_eating', 'stressed', 'climate_change', 'other') NOT NULL DEFAULT 'stable',
          \`temperature_c\` DECIMAL(4, 1) NULL,
          \`heart_rate_bpm\` INT NULL,
          \`notes\` TEXT NULL,
          \`attachments_json\` TEXT NULL,
          \`recorded_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_hhl_shipment (\`shipment_id\`)
        ) ENGINE=InnoDB
      `);

      // 5. Seed test data for Flow 4 (1 domestic, 1 international in ready_to_depart)
      await this.seedFlow4TestData();
    } catch (e: any) {
      console.warn('TrackingStore onModuleInit migration notice:', e?.message || e);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  // Seed sample domestic & international trips at 'ready_to_depart'
  private async seedFlow4TestData(): Promise<void> {
    try {
      const [existing] = await this.pool.execute<any[]>(
        "SELECT shipment_id FROM shipment WHERE special_requirements IN ('REQ-F4-DOMESTIC', 'REQ-F4-INTL')",
      );
      if (existing.length > 0) return; // Already seeded

      // Find driver (user_id with driver specialization) and escort
      const [drivers] = await this.pool.execute<any[]>(
        "SELECT user_id, full_name, email FROM `user` WHERE role_id = 5 AND specialization = 'driver' LIMIT 2",
      );
      const [escorts] = await this.pool.execute<any[]>(
        "SELECT user_id, full_name, email FROM `user` WHERE role_id = 5 AND specialization = 'escort' LIMIT 2",
      );
      const [customers] = await this.pool.execute<any[]>(
        "SELECT user_id, full_name, email FROM `user` WHERE role_id = 6 LIMIT 1",
      );
      const [vehicles] = await this.pool.execute<any[]>(
        "SELECT vehicle_id, plate_or_code FROM vehicle LIMIT 2",
      );
      const [airlines] = await this.pool.execute<any[]>(
        "SELECT airline_id, name, code FROM airline LIMIT 1",
      );

      const driverId = drivers[0]?.user_id || 5;
      const escortId = escorts[0]?.user_id || 6;
      const customerId = customers[0]?.user_id || 7;
      const vehicleId = vehicles[0]?.vehicle_id || 1;
      const airlineId = airlines[0]?.airline_id || 1;

      // 1. Domestic Test Trip (1 Leg: Cu Chi -> Tien Giang)
      const [domRes] = await this.pool.execute<any>(`
        INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location, requested_date, requested_horse_count, status, total_cost, special_requirements)
        VALUES (?, ?, 'Trại Ngựa Hoàng Gia', '0912345678', 'customer@example.com', 'Huyện Củ Chi, TP. Hồ Chí Minh', 'Trại thực nghiệm Tiền Giang, Tiền Giang', '2026-10-25', 2, 'ready_to_depart', 15000000, 'REQ-F4-DOMESTIC')
      `, [customerId, customerId]);
      const domShipmentId = domRes.insertId;

      // Add horses to domestic shipment
      const [domHorse1] = await this.pool.execute<any>(
        "INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no) VALUES (?, 'Bạch Mã Vương', 'Thoroughbred', 'male', 5, 'MC-VN-9001', 'PAS-VN-9001')",
        [customerId]
      );
      const [domHorse2] = await this.pool.execute<any>(
        "INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no) VALUES (?, 'Hồng Hạc', 'Arabian', 'female', 4, 'MC-VN-9002', 'PAS-VN-9002')",
        [customerId]
      );
      await this.pool.execute('INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?), (?, ?)', [
        domShipmentId, domHorse1.insertId, domShipmentId, domHorse2.insertId,
      ]);

      // Route & Legs for Domestic
      const [domRouteRes] = await this.pool.execute<any>(`
        INSERT INTO route (shipment_id, route_name, total_distance_km, status, plan_status, manager_vehicle_type)
        VALUES (?, 'Tuyến chuyên dụng đường bộ Củ Chi - Tiền Giang', 115, 'active', 'ready_to_depart', 'Xe thùng chuyên dụng điều hòa 18°C')
      `, [domShipmentId]);
      const domRouteId = domRouteRes.insertId;

      const [domLegRes] = await this.pool.execute<any>(`
        INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, duration_hours, planned_departure, planned_arrival, vehicle_id, status)
        VALUES (?, 1, 'road', 'Củ Chi, TP. Hồ Chí Minh', 'Cai Lậy, Tiền Giang', 115, 2.5, '2026-10-25 08:00:00', '2026-10-25 10:30:00', ?, 'pending')
      `, [domRouteId, vehicleId]);
      const domLegId = domLegRes.insertId;

      // Stops for Domestic
      await this.pool.execute(`
        INSERT INTO route_stop (route_id, leg_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status)
        VALUES
        (?, ?, 1, 'rest', 'Trạm dừng chân & Kiểm tra sức khỏe Bến Lức', 'Vietnam', '2026-10-25 09:00:00', '2026-10-25 09:30:00', 'pending'),
        (?, ?, 2, 'quarantine', 'Trạm thú y kiểm dịch liên tỉnh Trung Lương', 'Vietnam', '2026-10-25 10:00:00', '2026-10-25 10:15:00', 'pending')
      `, [domRouteId, domLegId, domRouteId, domLegId]);

      // Assign Driver & Escort for Domestic
      await this.pool.execute(`
        INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, assigned_date, is_confirmed, confirmed_at, confirmation_notes)
        VALUES
        (?, ?, 'driver', NOW(), 1, NOW(), 'Sẵn sàng xe và hệ thống điều hòa 18°C'),
        (?, ?, 'escort', NOW(), 1, NOW(), 'Sẵn sàng trang thiết bị y tế và điện giải')
      `, [domShipmentId, driverId, domShipmentId, escortId]);

      // 2. International Test Trip (3 Legs: Road -> Flight -> Road)
      const [intlRes] = await this.pool.execute<any>(`
        INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location, requested_date, requested_horse_count, status, total_cost, special_requirements)
        VALUES (?, ?, 'Singapore Turf Club Partner', '+65 6879 1000', 'customer@example.com', 'TP. Hồ Chí Minh, Vietnam', 'Singapore Turf Club, Kranji, Singapore', '2026-10-26', 1, 'ready_to_depart', 95000000, 'REQ-F4-INTL')
      `, [customerId, customerId]);
      const intlShipmentId = intlRes.insertId;

      const [intlHorse] = await this.pool.execute<any>(
        "INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no) VALUES (?, 'Thunder King (Chiến mã vô địch)', 'Thoroughbred', 'male', 6, 'MC-INTL-777', 'PAS-FEI-777')",
        [customerId]
      );
      await this.pool.execute('INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?)', [
        intlShipmentId, intlHorse.insertId,
      ]);

      const [intlRouteRes] = await this.pool.execute<any>(`
        INSERT INTO route (shipment_id, route_name, total_distance_km, status, plan_status, manager_vehicle_type)
        VALUES (?, 'Hành lang Vận chuyển Ngựa Quốc tế Sài Gòn - Sân bay Changi - Singapore Turf Club', 1450, 'active', 'ready_to_depart', 'Xe thùng chuyên dụng điều hòa 18°C')
      `, [intlShipmentId]);
      const intlRouteId = intlRouteRes.insertId;

      // Leg 1: Road to SGN Airport
      const [intlLeg1Res] = await this.pool.execute<any>(`
        INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, duration_hours, planned_departure, planned_arrival, vehicle_id, status)
        VALUES (?, 1, 'road', 'Trại ngựa Củ Chi, TP. Hồ Chí Minh', 'Sân bay Quốc tế Tân Sơn Nhất (Cargo Terminal)', 45, 1.5, '2026-10-26 05:00:00', '2026-10-26 06:30:00', ?, 'pending')
      `, [intlRouteId, vehicleId]);
      const intlLeg1Id = intlLeg1Res.insertId;

      await this.pool.execute(`
        INSERT INTO route_stop (route_id, leg_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status)
        VALUES (?, ?, 1, 'quarantine', 'Trạm kiểm dịch Cửa khẩu Sân bay Tân Sơn Nhất', 'Vietnam', '2026-10-26 06:00:00', '2026-10-26 06:30:00', 'pending')
      `, [intlRouteId, intlLeg1Id]);

      // Leg 2: Flight SGN -> SIN
      const [intlLeg2Res] = await this.pool.execute<any>(`
        INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, duration_hours, planned_departure, planned_arrival, airline_id, airline_name, flight_number, booking_reference, stalls_booked, status)
        VALUES (?, 2, 'flight', 'Sân bay Quốc tế Tân Sơn Nhất (SGN)', 'Singapore Changi Airport (SIN)', 1380, 2.0, '2026-10-26 09:00:00', '2026-10-26 12:00:00', ?, 'Singapore Airlines Cargo', 'SQ-718', 'BKG-EQUINE-8821', 1, 'pending')
      `, [intlRouteId, airlineId]);
      const intlLeg2Id = intlLeg2Res.insertId;

      await this.pool.execute(`
        INSERT INTO route_stop (route_id, leg_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status)
        VALUES (?, ?, 1, 'border_check', 'Khu kiểm soát Hải quan & Thú y ALPS Changi', 'Singapore', '2026-10-26 12:00:00', '2026-10-26 13:00:00', 'pending')
      `, [intlRouteId, intlLeg2Id]);

      // Leg 3: Road from SIN Airport to Turf Club
      await this.pool.execute(`
        INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, duration_hours, planned_departure, planned_arrival, vehicle_id, status)
        VALUES (?, 3, 'road', 'Singapore Changi Cargo Terminal', 'Singapore Turf Club, Kranji', 25, 0.75, '2026-10-26 13:30:00', '2026-10-26 14:15:00', ?, 'pending')
      `, [intlRouteId, vehicleId]);

      // Assign Driver & Escort for International
      await this.pool.execute(`
        INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, assigned_date, is_confirmed, confirmed_at, confirmation_notes)
        VALUES
        (?, ?, 'driver', NOW(), 1, NOW(), 'Sẵn sàng chặng đường bộ ra sân bay'),
        (?, ?, 'escort', NOW(), 1, NOW(), 'Sẵn sàng hộ tống thú y suốt chặng bay quốc tế')
      `, [intlShipmentId, driverId, intlShipmentId, escortId]);

      console.log('Seeded Flow 4 test trips: REQ-F4-DOMESTIC (id:', domShipmentId, ') and REQ-F4-INTL (id:', intlShipmentId, ')');
    } catch (e: any) {
      console.warn('Seed Flow 4 notice:', e?.message || e);
    }
  }

  // --- Store queries ---

  async findShipmentById(shipmentId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email,
              CASE
                WHEN s.special_requirements LIKE 'REQ-F4-%' THEN s.special_requirements
                ELSE CONCAT('REQ-', LPAD(s.shipment_id, 3, '0'))
              END as request_code,
              CONCAT('REQ-', LPAD(
                (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                3, '0'
              )) as customer_request_code,
              COALESCE(
                NULLIF(r.route_name, ''),
                CASE 
                  WHEN s.special_requirements LIKE '%[Tiêu đề:%' THEN 
                    SUBSTRING_INDEX(SUBSTRING_INDEX(s.special_requirements, '[Tiêu đề: ', -1), ']', 1)
                  ELSE NULL
                END,
                CONCAT(s.origin_location, ' → ', s.destination_location)
              ) as request_title,
              r.route_id, r.route_name, r.plan_status as route_plan_status, r.total_distance_km
       FROM shipment s
       JOIN \`user\` u ON s.customer_id = u.user_id
       LEFT JOIN route r ON r.shipment_id = s.shipment_id
       WHERE s.shipment_id = ?`,
      [shipmentId],
    );
    return rows[0] || null;
  }

  async findRouteByShipmentId(shipmentId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT * FROM route WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    return rows[0] || null;
  }

  async findLegsByRouteId(routeId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT rl.*, v.plate_or_code as vehicle_plate, al.name as airline_name_full
       FROM route_leg rl
       LEFT JOIN vehicle v ON rl.vehicle_id = v.vehicle_id
       LEFT JOIN airline al ON rl.airline_id = al.airline_id
       WHERE rl.route_id = ?
       ORDER BY rl.sequence_no ASC`,
      [routeId],
    );
    return rows;
  }

  async findStopsByRouteId(routeId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT rs.*, u.full_name as updated_by_name
       FROM route_stop rs
       LEFT JOIN \`user\` u ON rs.updated_by = u.user_id
       WHERE rs.route_id = ?
       ORDER BY rs.leg_id ASC, rs.sequence_no ASC`,
      [routeId],
    );
    return rows;
  }

  async findAssignedStaff(shipmentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT sa.*, u.full_name, u.email, u.phone, u.specialization
       FROM shipment_assignment sa
       JOIN \`user\` u ON sa.user_id = u.user_id
       WHERE sa.shipment_id = ?
       ORDER BY sa.role_in_shipment ASC`,
      [shipmentId],
    );
    return rows;
  }

  async findAssignedHorses(shipmentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT h.horse_id, h.name, h.breed, h.gender, h.age, h.microchip_no, h.passport_no
       FROM shipment_horse sh
       JOIN horse h ON sh.horse_id = h.horse_id
       WHERE sh.shipment_id = ?`,
      [shipmentId],
    );
    return rows;
  }

  async findMyAssignedTrips(userId: number, roleName: string): Promise<any[]> {
    const roleLower = roleName.toLowerCase();
    const isManagerOrCoordinator =
      roleLower.includes('coordinator') ||
      roleLower.includes('manager') ||
      roleLower.includes('admin');
    const isCustomer = roleLower.includes('customer');

    if (isManagerOrCoordinator) {
      const [rows] = await this.pool.execute<any[]>(
        `SELECT s.shipment_id,
                CASE
                  WHEN s.special_requirements LIKE 'REQ-%' THEN s.special_requirements
                  ELSE CONCAT('REQ-', LPAD(s.shipment_id, 3, '0'))
                END as request_code,
                COALESCE(
                  NULLIF(r.route_name, ''),
                  CASE 
                    WHEN s.special_requirements LIKE '%[Tiêu đề:%' THEN 
                      SUBSTRING_INDEX(SUBSTRING_INDEX(s.special_requirements, '[Tiêu đề: ', -1), ']', 1)
                    ELSE NULL
                  END,
                  CONCAT(s.origin_location, ' → ', s.destination_location)
                ) as request_title,
                s.contact_name, s.origin_location, s.destination_location,
                s.status as shipment_status, s.requested_date, s.requested_horse_count,
                r.route_id, r.route_name, r.plan_status as route_plan_status, r.total_distance_km
         FROM shipment s
         LEFT JOIN route r ON r.shipment_id = s.shipment_id
         WHERE s.status IN ('ready_to_depart', 'in_transit', 'arrived', 'completed')
         ORDER BY s.shipment_id DESC`,
      );
      return rows;
    }

    if (isCustomer) {
      const [rows] = await this.pool.execute<any[]>(
        `SELECT s.shipment_id,
                CASE
                  WHEN s.special_requirements LIKE 'REQ-F4-%' THEN s.special_requirements
                  ELSE CONCAT('REQ-', LPAD(
                    (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                    3, '0'
                  ))
                END as request_code,
                CONCAT('REQ-', LPAD(
                  (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                  3, '0'
                )) as customer_request_code,
                CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as system_request_code,
                COALESCE(
                  NULLIF(r.route_name, ''),
                  CASE 
                    WHEN s.special_requirements LIKE '%[Tiêu đề:%' THEN 
                      SUBSTRING_INDEX(SUBSTRING_INDEX(s.special_requirements, '[Tiêu đề: ', -1), ']', 1)
                    ELSE NULL
                  END,
                  CONCAT(s.origin_location, ' → ', s.destination_location)
                ) as request_title,
                s.contact_name, s.origin_location, s.destination_location,
                s.status as shipment_status, s.requested_date, s.requested_horse_count,
                r.route_id, r.route_name, r.plan_status as route_plan_status, r.total_distance_km
         FROM shipment s
         LEFT JOIN route r ON r.shipment_id = s.shipment_id
         WHERE (s.customer_id = ? OR s.requested_by = ?)
           AND s.status IN ('ready_to_depart', 'in_transit', 'arrived', 'completed')
         ORDER BY s.shipment_id DESC`,
        [userId, userId],
      );
      return rows;
    }

    // For Driver or Escort: only trips assigned to them
    const [rows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id,
              CASE
                WHEN s.special_requirements LIKE 'REQ-%' THEN s.special_requirements
                ELSE CONCAT('REQ-', LPAD(s.shipment_id, 3, '0'))
              END as request_code,
              COALESCE(
                NULLIF(r.route_name, ''),
                CASE 
                  WHEN s.special_requirements LIKE '%[Tiêu đề:%' THEN 
                    SUBSTRING_INDEX(SUBSTRING_INDEX(s.special_requirements, '[Tiêu đề: ', -1), ']', 1)
                  ELSE NULL
                END,
                CONCAT(s.origin_location, ' → ', s.destination_location)
              ) as request_title,
              s.contact_name, s.origin_location, s.destination_location,
              s.status as shipment_status, s.requested_date, s.requested_horse_count,
              r.route_id, r.route_name, r.plan_status as route_plan_status, r.total_distance_km,
              sa.role_in_shipment, sa.is_confirmed
       FROM shipment_assignment sa
       JOIN shipment s ON sa.shipment_id = s.shipment_id
       LEFT JOIN route r ON r.shipment_id = s.shipment_id
       WHERE sa.user_id = ?
         AND s.status IN ('ready_to_depart', 'in_transit', 'arrived', 'completed')
       ORDER BY s.shipment_id DESC`,
      [userId],
    );
    return rows;
  }

  async updateLegStatus(
    legId: number,
    status: string,
    actualDeparture?: Date | null,
    actualArrival?: Date | null,
  ): Promise<void> {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (actualDeparture !== undefined) {
      updates.push('actual_departure = ?');
      params.push(actualDeparture);
    }
    if (actualArrival !== undefined) {
      updates.push('actual_arrival = ?');
      params.push(actualArrival);
    }

    params.push(legId);
    await this.pool.execute(
      `UPDATE route_leg SET ${updates.join(', ')} WHERE leg_id = ?`,
      params,
    );
  }

  async updateStopStatus(
    stopId: number,
    status: string,
    updatedBy: number,
    actualTime: Date,
    isDeparture: boolean,
    notes?: string,
  ): Promise<void> {
    const timeCol = isDeparture ? 'actual_departure' : 'actual_arrival';
    await this.pool.execute(
      `UPDATE route_stop
       SET status = ?, ${timeCol} = ?, updated_by = ?, notes = COALESCE(?, notes)
       WHERE route_stop_id = ?`,
      [status, actualTime, updatedBy, notes || null, stopId],
    );
  }

  async updateShipmentStatus(shipmentId: number, status: string): Promise<void> {
    await this.pool.execute(
      'UPDATE shipment SET status = ? WHERE shipment_id = ?',
      [status, shipmentId],
    );
  }

  async updateRoutePlanStatus(routeId: number, planStatus: string): Promise<void> {
    await this.pool.execute(
      'UPDATE route SET plan_status = ? WHERE route_id = ?',
      [planStatus, routeId],
    );
  }

  async recordTripStatusLog(log: {
    shipmentId: number;
    routeId: number;
    legId?: number | null;
    routeStopId?: number | null;
    previousStatus: string | null;
    newStatus: string;
    milestoneType: string;
    milestoneName: string;
    notes?: string | null;
    updatedBy: number;
    updatedByRole: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO trip_status_log (shipment_id, route_id, leg_id, route_stop_id, previous_status, new_status, milestone_type, milestone_name, notes, updated_by, updated_by_role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        log.shipmentId,
        log.routeId,
        log.legId || null,
        log.routeStopId || null,
        log.previousStatus || null,
        log.newStatus,
        log.milestoneType,
        log.milestoneName,
        log.notes || null,
        log.updatedBy,
        log.updatedByRole,
      ],
    );
  }

  async findTripStatusLogs(shipmentId: number): Promise<TripStatusLogEntity[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT tsl.*, u.full_name as updated_by_name
       FROM trip_status_log tsl
       JOIN \`user\` u ON tsl.updated_by = u.user_id
       WHERE tsl.shipment_id = ?
       ORDER BY tsl.log_id ASC`,
      [shipmentId],
    );

    return rows.map((r) => ({
      id: r.log_id,
      shipmentId: r.shipment_id,
      routeId: r.route_id,
      legId: r.leg_id,
      routeStopId: r.route_stop_id,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      milestoneType: r.milestone_type,
      milestoneName: r.milestone_name,
      notes: r.notes,
      updatedBy: r.updated_by,
      updatedByName: r.updated_by_name,
      updatedByRole: r.updated_by_role,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createHorseHealthLog(log: {
    shipmentId: number;
    horseId?: number | null;
    horseName: string;
    recordedBy: number;
    conditionStatus: HorseConditionStatus;
    temperatureC?: number | null;
    heartRateBpm?: number | null;
    notes?: string | null;
    attachmentsJson?: string | null;
  }): Promise<number> {
    const [res] = await this.pool.execute<any>(
      `INSERT INTO horse_health_log (shipment_id, horse_id, horse_name, recorded_by, condition_status, temperature_c, heart_rate_bpm, notes, attachments_json, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        log.shipmentId,
        log.horseId || null,
        log.horseName,
        log.recordedBy,
        log.conditionStatus,
        log.temperatureC ?? null,
        log.heartRateBpm ?? null,
        log.notes || null,
        log.attachmentsJson || null,
      ],
    );
    return res.insertId;
  }

  async findHorseHealthLogs(shipmentId: number): Promise<HorseHealthLogEntity[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT hhl.*, u.full_name as recorded_by_name, r.role_name as recorded_by_role
       FROM horse_health_log hhl
       JOIN \`user\` u ON hhl.recorded_by = u.user_id
       JOIN \`role\` r ON u.role_id = r.role_id
       WHERE hhl.shipment_id = ?
       ORDER BY hhl.log_id DESC`,
      [shipmentId],
    );

    const conditionMapVi: Record<string, string> = {
      stable: 'Sức khỏe ổn định',
      not_eating: 'Bỏ ăn',
      stressed: 'Căng thẳng',
      climate_change: 'Khí hậu thay đổi',
      other: 'Khác',
    };

    return rows.map((r) => {
      let attachments: string[] = [];
      try {
        if (r.attachments_json) attachments = JSON.parse(r.attachments_json);
      } catch {}

      return {
        id: r.log_id,
        shipmentId: r.shipment_id,
        horseId: r.horse_id,
        horseName: r.horse_name,
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        recordedByRole: r.recorded_by_role,
        conditionStatus: r.condition_status,
        conditionStatusVi: conditionMapVi[r.condition_status] || r.condition_status,
        temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
        heartRateBpm: r.heart_rate_bpm !== null ? Number(r.heart_rate_bpm) : null,
        notes: r.notes,
        attachments,
        recordedAt: new Date(r.recorded_at).toISOString(),
      };
    });
  }
}
