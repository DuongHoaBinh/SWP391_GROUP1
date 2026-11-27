import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  HorseConditionStatus,
  HorseHealthLogEntity,
  TripStatusLogEntity,
} from './tracking.types';
import { MYSQL_POOL } from '../../common/database/database.module';
import { INACTIVE_SHIPMENT_SQL, releaseShipmentReservations } from '../fleet/vehicle-reservation';
import {
  DEFAULT_EQUINE_VITAL_CONFIG,
  EquineVitalConfig,
  HealthAlertTier,
} from './vitals-policy';

@Injectable()
export class TrackingStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackingStore.name);
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
          "ALTER TABLE `route_stop` ADD COLUMN `status` ENUM('pending', 'arrived', 'cleared', 'customs_cleared', 'departed') NOT NULL DEFAULT 'pending'",
        );
      } else {
        const statusCol = stopCols.find((c) => c.Field === 'status');
        if (statusCol && typeof statusCol.Type === 'string' && !statusCol.Type.includes('customs_cleared')) {
          await this.pool.execute(
            "ALTER TABLE `route_stop` MODIFY COLUMN `status` ENUM('pending', 'arrived', 'cleared', 'customs_cleared', 'departed') NOT NULL DEFAULT 'pending'",
          );
        }
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

      // 4b. Ensure leg_name column in horse_health_log
      const [hhlCols] = await this.pool.query<any[]>("SHOW COLUMNS FROM `horse_health_log`");
      const hhlColNames = hhlCols.map((c: any) => c.Field);
      if (!hhlColNames.includes('leg_name')) {
        await this.pool.execute('ALTER TABLE `horse_health_log` ADD COLUMN `leg_name` VARCHAR(255) NULL AFTER `horse_name`');
      }

      // 5. Seed test data for Flow 4 only when explicitly enabled
      if (process.env.SEED_DEMO_DATA === 'true') {
        await this.seedFlow4TestData();
      }
    } catch (e: any) {
      this.logger.warn(`TrackingStore onModuleInit migration notice: ${e?.message || e}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
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
        `SELECT u.user_id, u.full_name, u.email
         FROM \`user\` u JOIN \`role\` r ON r.role_id = u.role_id
         WHERE r.role_name = 'Vehicle Driver / Escort' AND u.specialization = 'driver'
         LIMIT 2`,
      );
      const [escorts] = await this.pool.execute<any[]>(
        `SELECT u.user_id, u.full_name, u.email
         FROM \`user\` u JOIN \`role\` r ON r.role_id = u.role_id
         WHERE r.role_name = 'Vehicle Driver / Escort' AND u.specialization = 'escort'
         LIMIT 2`,
      );
      const [customers] = await this.pool.execute<any[]>(
        `SELECT u.user_id, u.full_name, u.email
         FROM \`user\` u JOIN \`role\` r ON r.role_id = u.role_id
         WHERE r.role_name = 'Customer'
         LIMIT 1`,
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

      this.logger.log(`Seeded Flow 4 test trips: REQ-F4-DOMESTIC (id: ${domShipmentId}) and REQ-F4-INTL (id: ${intlShipmentId})`);
    } catch (e: any) {
      this.logger.warn(`Seed Flow 4 notice: ${e?.message || e}`);
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

  async findUserById(userId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT user_id, full_name, email, specialization, role_id FROM `user` WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return rows[0] || null;
  }

  async findAssignedHorses(shipmentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT sh.shipment_horse_id, h.horse_id, h.name, h.breed, h.gender, h.age, h.microchip_no, h.passport_no
       FROM shipment_horse sh
       JOIN horse h ON sh.horse_id = h.horse_id
       WHERE sh.shipment_id = ?`,
      [shipmentId],
    );
    return rows;
  }

  private async enrichAssignedTripRows(rows: any[]): Promise<any[]> {
    if (!rows || rows.length === 0) return [];
    const shipmentIds = Array.from(new Set(rows.map((r) => Number(r.shipment_id)).filter(Boolean)));
    const routeIds = Array.from(new Set(rows.map((r) => Number(r.route_id)).filter(Boolean)));

    const horsesByShipment = new Map<number, any[]>();
    if (shipmentIds.length > 0) {
      const ph = shipmentIds.map(() => '?').join(',');
      try {
        const [horseRows] = await this.pool.execute<any[]>(
          `SELECT sh.shipment_id, sh.shipment_horse_id, h.horse_id, h.name, h.breed, h.microchip_no, h.passport_no
           FROM shipment_horse sh
           JOIN horse h ON sh.horse_id = h.horse_id
           WHERE sh.shipment_id IN (${ph})
           ORDER BY sh.shipment_horse_id ASC`,
          shipmentIds,
        );
        for (const hr of horseRows) {
          const sid = Number(hr.shipment_id);
          if (!horsesByShipment.has(sid)) horsesByShipment.set(sid, []);
          horsesByShipment.get(sid)!.push({
            id: Number(hr.horse_id),
            shipmentHorseId: hr.shipment_horse_id ? Number(hr.shipment_horse_id) : undefined,
            name: hr.name,
            breed: hr.breed,
            microchipNo: hr.microchip_no,
            passportNo: hr.passport_no,
          });
        }
      } catch (err) {
        this.logger.warn(`enrichAssignedTripRows horses query failed: ${(err as any)?.message}`);
      }
    }

    const legsByRoute = new Map<number, any[]>();
    const stopsByRoute = new Map<number, any[]>();
    if (routeIds.length > 0) {
      const ph = routeIds.map(() => '?').join(',');
      try {
        const [legRows] = await this.pool.execute<any[]>(
          `SELECT rl.route_id, rl.leg_id, rl.sequence_no, rl.leg_type, rl.direction,
                  rl.origin_location, rl.destination_location, rl.status,
                  rl.planned_departure, rl.planned_arrival, rl.actual_departure, rl.actual_arrival,
                  rl.airline_name, rl.flight_number, v.plate_or_code as vehicle_plate
           FROM route_leg rl
           LEFT JOIN vehicle v ON rl.vehicle_id = v.vehicle_id
           WHERE rl.route_id IN (${ph})
           ORDER BY rl.route_id ASC, rl.sequence_no ASC`,
          routeIds,
        );
        for (const lr of legRows) {
          const rid = Number(lr.route_id);
          if (!legsByRoute.has(rid)) legsByRoute.set(rid, []);
          legsByRoute.get(rid)!.push({
            legId: Number(lr.leg_id),
            sequenceNo: Number(lr.sequence_no),
            legType: lr.leg_type || 'road',
            direction: lr.direction || 'outbound',
            originLocation: lr.origin_location,
            destinationLocation: lr.destination_location,
            status: lr.status || 'pending',
            plannedDeparture: lr.planned_departure ? new Date(lr.planned_departure).toISOString() : null,
            plannedArrival: lr.planned_arrival ? new Date(lr.planned_arrival).toISOString() : null,
            actualDeparture: lr.actual_departure ? new Date(lr.actual_departure).toISOString() : null,
            actualArrival: lr.actual_arrival ? new Date(lr.actual_arrival).toISOString() : null,
            vehiclePlate: lr.vehicle_plate || null,
            airlineName: lr.airline_name || null,
            flightNumber: lr.flight_number || null,
          });
        }

        const [stopRows] = await this.pool.execute<any[]>(
          `SELECT rs.route_id, rs.route_stop_id, rs.leg_id, rs.sequence_no,
                  rs.stop_type, rs.location_name, rs.country, rs.status,
                  rs.planned_arrival, rs.actual_arrival, rs.actual_departure
           FROM route_stop rs
           WHERE rs.route_id IN (${ph})
           ORDER BY rs.route_id ASC, rs.leg_id ASC, rs.sequence_no ASC`,
          routeIds,
        );
        for (const sr of stopRows) {
          const rid = Number(sr.route_id);
          if (!stopsByRoute.has(rid)) stopsByRoute.set(rid, []);
          stopsByRoute.get(rid)!.push({
            routeStopId: Number(sr.route_stop_id),
            legId: sr.leg_id ? Number(sr.leg_id) : null,
            sequenceNo: Number(sr.sequence_no),
            stopType: sr.stop_type,
            locationName: sr.location_name,
            country: sr.country || null,
            status: sr.status || 'pending',
          });
        }
      } catch (err) {
        this.logger.warn(`enrichAssignedTripRows legs/stops query failed: ${(err as any)?.message}`);
      }
    }

    return rows.map((row) => {
      const sid = Number(row.shipment_id);
      const rid = row.route_id ? Number(row.route_id) : 0;
      return {
        ...row,
        horses: horsesByShipment.get(sid) || [],
        legs: rid ? legsByRoute.get(rid) || [] : [],
        stops: rid ? stopsByRoute.get(rid) || [] : [],
      };
    });
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
                s.status as shipment_status, s.requested_date, s.departure_date,
                s.expected_arrival_date, s.requested_horse_count,
                s.trip_type, s.return_status, s.return_departure_at,
                r.route_id, r.route_name, r.plan_status as route_plan_status,
                r.total_distance_km, r.strategic_notes
         FROM shipment s
         LEFT JOIN route r ON r.shipment_id = s.shipment_id
         WHERE s.status IN ('ready_to_depart', 'in_transit', 'return_pending', 'arrived', 'completed')
         ORDER BY s.shipment_id DESC`,
      );
      return this.enrichAssignedTripRows(rows);
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
                s.status as shipment_status, s.requested_date, s.departure_date,
                s.expected_arrival_date, s.requested_horse_count,
                s.trip_type, s.return_status, s.return_departure_at,
                r.route_id, r.route_name, r.plan_status as route_plan_status, r.total_distance_km
         FROM shipment s
         LEFT JOIN route r ON r.shipment_id = s.shipment_id
         WHERE (s.customer_id = ? OR s.requested_by = ?)
           AND s.status IN ('ready_to_depart', 'in_transit', 'return_pending', 'arrived', 'completed')
         ORDER BY s.shipment_id DESC`,
        [userId, userId],
      );
      return rows;
    }

    // For Driver or Escort: only trips assigned to them (including 'planning' so pending assignment confirmation shows up)
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
              s.status as shipment_status, s.requested_date, s.departure_date,
              s.expected_arrival_date, s.requested_horse_count,
              s.trip_type, s.return_status, s.return_departure_at,
              r.route_id, r.route_name, r.plan_status as route_plan_status,
              r.total_distance_km, r.strategic_notes,
              sa.role_in_shipment, sa.is_confirmed, sa.confirmed_at
       FROM shipment_assignment sa
       JOIN shipment s ON sa.shipment_id = s.shipment_id
       LEFT JOIN route r ON r.shipment_id = s.shipment_id
       WHERE sa.user_id = ?
         AND s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'arrived', 'completed')
       ORDER BY
         CASE
           WHEN s.status IN ('in_transit', 'return_pending') THEN 0
           WHEN s.status = 'ready_to_depart' THEN 1
           WHEN s.status IN ('planning', 'confirmed') THEN 2
           ELSE 3
         END ASC,
         s.shipment_id DESC`,
      [userId],
    );
    return this.enrichAssignedTripRows(rows);
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

  async updateVehicleStatus(vehicleId: number, status: string): Promise<void> {
    if (status === 'available') {
      await this.pool.execute(
        `UPDATE vehicle v
         SET v.status = 'available'
         WHERE v.vehicle_id = ?
           AND v.status = 'in_use'
           AND NOT EXISTS (
             SELECT 1
             FROM route_leg rl
             JOIN route r ON r.route_id = rl.route_id
             JOIN shipment s ON s.shipment_id = r.shipment_id
             WHERE rl.vehicle_id = v.vehicle_id
               AND rl.status <> 'completed'
               AND s.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')
           )`,
        [vehicleId],
      );
      return;
    }
    await this.pool.execute('UPDATE vehicle SET status = ? WHERE vehicle_id = ?', [status, vehicleId]);
  }

  async findSiblingLegsByRoadTrip(roadTripId: number, excludeLegId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT rl.*, r.shipment_id, r.assigned_coordinator_id,
              s.status AS shipment_status, s.customer_id,
              s.origin_location AS shipment_origin_location,
              s.destination_location AS shipment_destination_location,
              CASE
                WHEN s.special_requirements LIKE 'REQ-%' THEN s.special_requirements
                ELSE CONCAT('REQ-', LPAD(s.shipment_id, 3, '0'))
              END AS request_code
       FROM route_leg rl
       JOIN route r ON r.route_id = rl.route_id
       JOIN shipment s ON s.shipment_id = r.shipment_id
       WHERE rl.road_trip_id = ?
         AND rl.leg_id <> ?
         AND s.status IN ('ready_to_depart', 'in_transit', 'return_pending')
       ORDER BY rl.leg_id ASC`,
      [roadTripId, excludeLegId],
    );
    return rows;
  }

  async findShipmentsByRoadTripId(roadTripId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id, s.customer_id, s.origin_location, s.destination_location,
              s.status AS shipment_status,
              CASE
                WHEN s.special_requirements LIKE 'REQ-%' THEN s.special_requirements
                ELSE CONCAT('REQ-', LPAD(s.shipment_id, 3, '0'))
              END AS request_code,
              r.route_id, r.assigned_coordinator_id,
              rl.leg_id, rl.sequence_no AS leg_sequence_no,
              rl.status AS leg_status, rl.actual_arrival AS leg_actual_arrival,
              rl.origin_location AS leg_origin_location, rl.destination_location AS leg_destination_location,
              (SELECT COUNT(*) FROM route_leg rl_all WHERE rl_all.route_id = r.route_id) AS total_legs
       FROM route_leg rl
       JOIN route r ON r.route_id = rl.route_id
       JOIN shipment s ON s.shipment_id = r.shipment_id
       WHERE rl.road_trip_id = ?
         AND s.status NOT IN ('cancelled', 'cancelled_operational', 'rejected', 'refund_requested', 'refunded')
       ORDER BY rl.leg_id ASC`,
      [roadTripId],
    );
    return rows;
  }

  async updateStopStatus(
    stopId: number,
    status: string,
    updatedBy: number,
    actualTime: Date,
    isDeparture: boolean,
    notes?: string,
    updatedByRole?: string,
    isBackdated: boolean = false,
    loc?: {
      lat?: number | null;
      lng?: number | null;
      accuracyM?: number | null;
      locationSource?: string | null;
      distanceToStopM?: number | null;
      geofencePassed?: boolean | null;
      manualReason?: string | null;
      evidenceUrl?: string | null;
      flagged?: boolean;
    },
  ): Promise<void> {
    const timeCol = isDeparture
      ? 'actual_departure = ?, actual_arrival = COALESCE(actual_arrival, ?)'
      : 'actual_arrival = ?';
    const params = isDeparture
      ? [status, actualTime, actualTime, updatedBy, notes || null, stopId]
      : [status, actualTime, updatedBy, notes || null, stopId];
    await this.pool.execute(
      `UPDATE route_stop
       SET status = ?, ${timeCol}, updated_by = ?, notes = COALESCE(?, notes)
       WHERE route_stop_id = ?`,
      params,
    );

    if (['departed', 'arrived', 'customs_cleared', 'delivered'].includes(status)) {
      await this.pool.execute(
        `INSERT INTO route_stop_update (
          route_stop_id, updated_by, updated_by_role, actual_arrival, actual_departure, status, notes, is_backdated,
          lat, lng, accuracy_m, location_source, distance_to_stop_m, geofence_passed, manual_reason, evidence_url, flagged
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stopId,
          updatedBy,
          updatedByRole ?? null,
          isDeparture ? null : actualTime,
          isDeparture ? actualTime : null,
          status,
          notes || null,
          isBackdated ? 1 : 0,
          loc?.lat ?? null,
          loc?.lng ?? null,
          loc?.accuracyM ?? null,
          loc?.locationSource ?? null,
          loc?.distanceToStopM ?? null,
          loc?.geofencePassed ?? null,
          loc?.manualReason ?? null,
          loc?.evidenceUrl ?? null,
          loc?.flagged ? 1 : 0,
        ],
      );
    }
  }

  async updateShipmentStatus(shipmentId: number, status: string): Promise<void> {
    if (status === 'completed') {
      await this.pool.execute(
        'UPDATE shipment SET status = ?, actual_arrival_date = COALESCE(actual_arrival_date, NOW()) WHERE shipment_id = ?',
        [status, shipmentId],
      );
      await this.pool.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
           AND status NOT IN ('retired', 'deceased')`,
        [shipmentId],
      );
      await this.pool.execute(
        `UPDATE vehicle v
         SET v.status = 'available'
         WHERE v.vehicle_id IN (
           SELECT rl.vehicle_id
           FROM route_leg rl
           JOIN route r ON rl.route_id = r.route_id
           WHERE r.shipment_id = ? AND rl.vehicle_id IS NOT NULL
         )
           AND NOT EXISTS (
             SELECT 1
             FROM route_leg rl2
             JOIN route r2 ON r2.route_id = rl2.route_id
             JOIN shipment s2 ON s2.shipment_id = r2.shipment_id
             WHERE rl2.vehicle_id = v.vehicle_id
               AND s2.shipment_id <> ?
               AND rl2.status <> 'completed'
               AND s2.status NOT IN ('completed', 'cancelled', 'cancelled_operational', 'rejected')
           )`,
        [shipmentId, shipmentId],
      );
      return;
    }

    await this.pool.execute(
      'UPDATE shipment SET status = ? WHERE shipment_id = ?',
      [status, shipmentId],
    );
  }

  async updateShipmentReturnStatus(shipmentId: number, returnStatus: string): Promise<void> {
    await this.pool.execute(
      'UPDATE shipment SET return_status = ? WHERE shipment_id = ?',
      [returnStatus, shipmentId],
    );
  }

  async markReturnNoShow(data: {
    shipmentId: number;
    actorId: number;
    notes?: string;
    evidenceUrls?: string[];
  }): Promise<void> {
    // 1. Update shipment: return_status = 'no_show', return_no_show = true, status = 'completed'
    await this.pool.execute(
      `UPDATE shipment
       SET return_status = 'no_show',
           return_no_show = TRUE,
           status = 'completed',
           actual_arrival_date = NOW()
       WHERE shipment_id = ?`,
      [data.shipmentId],
    );

    // 2. Release horses to active
    await this.pool.execute(
      `UPDATE horse
       SET status = 'active'
       WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
         AND status NOT IN ('retired', 'deceased')`,
      [data.shipmentId],
    );

    // 3. Release vehicles only if currently in_use and not actively assigned to another in_transit/return_pending shipment
    await this.pool.execute(
      `UPDATE vehicle v
       SET v.status = 'available'
       WHERE v.status = 'in_use'
         AND v.vehicle_id IN (
           SELECT rl.vehicle_id
           FROM route_leg rl
           JOIN route r ON rl.route_id = r.route_id
           WHERE r.shipment_id = ? AND rl.vehicle_id IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1
           FROM route_leg rl2
           JOIN route r2 ON rl2.route_id = r2.route_id
           JOIN shipment s2 ON s2.shipment_id = r2.shipment_id
           WHERE rl2.vehicle_id = v.vehicle_id
             AND s2.shipment_id <> ?
             AND s2.status IN ('in_transit', 'return_pending')
         )`,
      [data.shipmentId, data.shipmentId],
    );
    await releaseShipmentReservations(this.pool, data.shipmentId, 'return_no_show');

    // 4. Update route to completed
    await this.pool.execute(
      "UPDATE route SET status = 'completed', plan_status = 'completed' WHERE shipment_id = ?",
      [data.shipmentId],
    );

    // 5. If evidenceUrls provided, save attachments
    if (data.evidenceUrls && data.evidenceUrls.length > 0) {
      for (const url of data.evidenceUrls) {
        await this.pool.execute(
          "INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'image', ?)",
          [data.shipmentId, url, data.actorId],
        );
      }
    }
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
    isBackdated?: boolean;
    lat?: number | null;
    lng?: number | null;
    accuracyM?: number | null;
    locationSource?: string | null;
    distanceToStopM?: number | null;
    geofencePassed?: boolean | null;
    manualReason?: string | null;
    evidenceUrl?: string | null;
    flagged?: boolean;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO trip_status_log (
        shipment_id, route_id, leg_id, route_stop_id, previous_status, new_status,
        milestone_type, milestone_name, notes, updated_by, updated_by_role, is_backdated,
        lat, lng, accuracy_m, location_source, distance_to_stop_m, geofence_passed,
        manual_reason, evidence_url, flagged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
        log.isBackdated ? 1 : 0,
        log.lat ?? null,
        log.lng ?? null,
        log.accuracyM ?? null,
        log.locationSource ?? null,
        log.distanceToStopM ?? null,
        log.geofencePassed ?? null,
        log.manualReason ?? null,
        log.evidenceUrl ?? null,
        log.flagged ? 1 : 0,
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
      isBackdated: Boolean(r.is_backdated),
      lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : null,
      lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : null,
      accuracyM: r.accuracy_m !== null && r.accuracy_m !== undefined ? Number(r.accuracy_m) : null,
      locationSource: r.location_source ?? null,
      distanceToStopM: r.distance_to_stop_m !== null && r.distance_to_stop_m !== undefined ? Number(r.distance_to_stop_m) : null,
      geofencePassed: r.geofence_passed !== null && r.geofence_passed !== undefined ? Boolean(r.geofence_passed) : null,
      manualReason: r.manual_reason ?? null,
      evidenceUrl: r.evidence_url ?? null,
      flagged: Boolean(r.flagged),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createHorseHealthLog(log: {
    shipmentId: number;
    horseId?: number | null;
    horseName: string;
    legName?: string | null;
    recordedBy: number;
    recordedByRole?: string | null;
    conditionStatus: HorseConditionStatus;
    temperatureC?: number | null;
    heartRateBpm?: number | null;
    respiratoryRateBpm?: number | null;
    routeStopId?: number | null;
    lat?: number | null;
    lng?: number | null;
    locationSource?: string | null;
    alertTier?: HealthAlertTier;
    alertReason?: string | null;
    notes?: string | null;
    attachmentsJson?: string | null;
    recordedAt?: Date | null;
  }): Promise<number> {
    const recordedAt = log.recordedAt ?? new Date();
    const [res] = await this.pool.execute<any>(
      `INSERT INTO horse_health_log (
        shipment_id, horse_id, horse_name, leg_name, recorded_by, recorded_by_role,
        condition_status, temperature_c, heart_rate_bpm, respiratory_rate_bpm,
        route_stop_id, lat, lng, location_source, alert_tier, alert_reason,
        notes, attachments_json, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.shipmentId,
        log.horseId || null,
        log.horseName,
        log.legName || null,
        log.recordedBy,
        log.recordedByRole || null,
        log.conditionStatus,
        log.temperatureC ?? null,
        log.heartRateBpm ?? null,
        log.respiratoryRateBpm ?? null,
        log.routeStopId ?? null,
        log.lat ?? null,
        log.lng ?? null,
        log.locationSource ?? null,
        log.alertTier || 'green',
        log.alertReason || null,
        log.notes || null,
        log.attachmentsJson || null,
        recordedAt,
      ],
    );
    return res.insertId;
  }

  async findLatestHealthLogForHorse(
    shipmentId: number,
    horseId?: number | null,
    horseName?: string | null,
  ): Promise<{
    id: number;
    alertTier: HealthAlertTier;
    alertReason?: string | null;
    conditionStatus?: HorseConditionStatus;
    temperatureC?: number | null;
    heartRateBpm?: number | null;
    respiratoryRateBpm?: number | null;
    recordedAt: string;
  } | null> {
    const sql = horseId
      ? `SELECT * FROM horse_health_log
         WHERE shipment_id = ? AND horse_id = ?
         ORDER BY recorded_at DESC, log_id DESC LIMIT 1`
      : `SELECT * FROM horse_health_log
         WHERE shipment_id = ? AND LOWER(horse_name) = LOWER(?)
         ORDER BY recorded_at DESC, log_id DESC LIMIT 1`;
    const param = horseId ? Number(horseId) : String(horseName || '');
    const [rows] = await this.pool.execute<any[]>(sql, [shipmentId, param]);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: Number(r.log_id),
      alertTier: (r.alert_tier as HealthAlertTier) || 'green',
      alertReason: r.alert_reason ?? null,
      conditionStatus: r.condition_status,
      temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
      heartRateBpm: r.heart_rate_bpm !== null ? Number(r.heart_rate_bpm) : null,
      respiratoryRateBpm: r.respiratory_rate_bpm !== null && r.respiratory_rate_bpm !== undefined ? Number(r.respiratory_rate_bpm) : null,
      recordedAt: new Date(r.recorded_at).toISOString(),
    };
  }

  async findActiveVitalConfig(): Promise<EquineVitalConfig> {
    try {
      const [rows] = await this.pool.execute<any[]>(
        'SELECT * FROM equine_vital_config WHERE is_active = TRUE ORDER BY config_id DESC LIMIT 1',
      );
      const r = rows[0];
      if (!r) return DEFAULT_EQUINE_VITAL_CONFIG;
      return {
        configId: Number(r.config_id),
        configName: r.config_name,
        tempGreenMin: Number(r.temp_green_min),
        tempGreenMax: Number(r.temp_green_max),
        tempAmberLowMin: Number(r.temp_amber_low_min),
        tempAmberHighMax: Number(r.temp_amber_high_max),
        hrGreenMin: Number(r.hr_green_min),
        hrGreenMax: Number(r.hr_green_max),
        hrAmberLowMin: Number(r.hr_amber_low_min),
        hrAmberHighMax: Number(r.hr_amber_high_max),
        consecutiveAlertWindowHours: Number(r.consecutive_alert_window_hours),
        escalatableConditions:
          typeof r.escalatable_conditions === 'string'
            ? JSON.parse(r.escalatable_conditions)
            : (r.escalatable_conditions || DEFAULT_EQUINE_VITAL_CONFIG.escalatableConditions),
        observationalConditions:
          typeof r.observational_conditions === 'string'
            ? JSON.parse(r.observational_conditions)
            : (r.observational_conditions || DEFAULT_EQUINE_VITAL_CONFIG.observationalConditions),
        calibratedBy: r.calibrated_by ?? null,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      };
    } catch {
      return DEFAULT_EQUINE_VITAL_CONFIG;
    }
  }

  async updateVitalConfig(patch: Partial<EquineVitalConfig>, updatedBy: number): Promise<EquineVitalConfig> {
    const current = await this.findActiveVitalConfig();
    const merged: EquineVitalConfig = {
      ...current,
      ...patch,
      escalatableConditions: patch.escalatableConditions ?? current.escalatableConditions,
      observationalConditions: patch.observationalConditions ?? current.observationalConditions,
    };

    if (current.configId) {
      await this.pool.execute(
        `UPDATE equine_vital_config
         SET config_name = ?, temp_green_min = ?, temp_green_max = ?,
             temp_amber_low_min = ?, temp_amber_high_max = ?,
             hr_green_min = ?, hr_green_max = ?,
             hr_amber_low_min = ?, hr_amber_high_max = ?,
             consecutive_alert_window_hours = ?,
             escalatable_conditions = ?, observational_conditions = ?,
             calibrated_by = ?, updated_by = ?
         WHERE config_id = ?`,
        [
          merged.configName,
          merged.tempGreenMin,
          merged.tempGreenMax,
          merged.tempAmberLowMin,
          merged.tempAmberHighMax,
          merged.hrGreenMin,
          merged.hrGreenMax,
          merged.hrAmberLowMin,
          merged.hrAmberHighMax,
          merged.consecutiveAlertWindowHours,
          JSON.stringify(merged.escalatableConditions),
          JSON.stringify(merged.observationalConditions),
          merged.calibratedBy ?? null,
          updatedBy,
          current.configId,
        ],
      );
    } else {
      await this.pool.execute(
        `INSERT INTO equine_vital_config (
          config_name, is_active, temp_green_min, temp_green_max,
          temp_amber_low_min, temp_amber_high_max, hr_green_min, hr_green_max,
          hr_amber_low_min, hr_amber_high_max, consecutive_alert_window_hours,
          escalatable_conditions, observational_conditions, calibrated_by, updated_by
        ) VALUES (?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          merged.configName,
          merged.tempGreenMin,
          merged.tempGreenMax,
          merged.tempAmberLowMin,
          merged.tempAmberHighMax,
          merged.hrGreenMin,
          merged.hrGreenMax,
          merged.hrAmberLowMin,
          merged.hrAmberHighMax,
          merged.consecutiveAlertWindowHours,
          JSON.stringify(merged.escalatableConditions),
          JSON.stringify(merged.observationalConditions),
          merged.calibratedBy ?? null,
          updatedBy,
        ],
      );
    }
    return this.findActiveVitalConfig();
  }

  async isEvidencePhotoAccessibleToUser(filename: string, userId: number, role: string): Promise<boolean> {
    const upper = String(role || '').toUpperCase();
    if (
      upper.includes('MANAGER') ||
      upper.includes('COORDINATOR') ||
      upper.includes('SPECIALIST') ||
      upper.includes('ADMIN')
    ) {
      return true;
    }
    const pattern = `%${filename}%`;
    if (upper === 'CUSTOMER') {
      const [tslRows] = await this.pool.execute<any[]>(
        `SELECT 1 FROM trip_status_log tsl
         JOIN shipment s ON s.shipment_id = tsl.shipment_id
         WHERE s.customer_id = ? AND tsl.evidence_url LIKE ? LIMIT 1`,
        [userId, pattern],
      );
      if (tslRows.length > 0) return true;

      const [attRows] = await this.pool.execute<any[]>(
        `SELECT 1 FROM attachment a
         JOIN shipment s ON s.shipment_id = a.related_id
         WHERE a.related_type = 'shipment' AND s.customer_id = ? AND a.file_url LIKE ? LIMIT 1`,
        [userId, pattern],
      );
      return attRows.length > 0;
    }

    // Driver / Escort: check trip_status_log, attachment, or shipment_assignment via filename prefix ship-{id}-...
    const [tslRows] = await this.pool.execute<any[]>(
      `SELECT 1 FROM trip_status_log tsl
       JOIN shipment_assignment sa ON sa.shipment_id = tsl.shipment_id
       WHERE sa.user_id = ? AND tsl.evidence_url LIKE ? LIMIT 1`,
      [userId, pattern],
    );
    if (tslRows.length > 0) return true;

    const [attRows] = await this.pool.execute<any[]>(
      `SELECT 1 FROM attachment a
       JOIN shipment_assignment sa ON sa.shipment_id = a.related_id
       WHERE a.related_type = 'shipment' AND sa.user_id = ? AND a.file_url LIKE ? LIMIT 1`,
      [userId, pattern],
    );
    if (attRows.length > 0) return true;

    const prefixMatch = filename.match(/^ship-(\d+)-/);
    if (prefixMatch) {
      const sid = Number(prefixMatch[1]);
      if (Number.isInteger(sid) && sid > 0) {
        const [saRows] = await this.pool.execute<any[]>(
          'SELECT 1 FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? LIMIT 1',
          [sid, userId],
        );
        return saRows.length > 0;
      }
    }
    return false;
  }

  async isHealthPhotoAccessibleToUser(filename: string, userId: number, role: string): Promise<boolean> {
    const upper = String(role || '').toUpperCase();
    if (
      upper.includes('MANAGER') ||
      upper.includes('COORDINATOR') ||
      upper.includes('SPECIALIST') ||
      upper.includes('ADMIN')
    ) {
      return true;
    }
    const pattern = `%${filename}%`;
    if (upper === 'CUSTOMER') {
      const [rows] = await this.pool.execute<any[]>(
        `SELECT 1 FROM horse_health_log hhl
         JOIN shipment s ON s.shipment_id = hhl.shipment_id
         WHERE s.customer_id = ? AND hhl.attachments_json LIKE ? LIMIT 1`,
        [userId, pattern],
      );
      return rows.length > 0;
    }
    const [rows] = await this.pool.execute<any[]>(
      `SELECT 1 FROM horse_health_log hhl
       JOIN shipment_assignment sa ON sa.shipment_id = hhl.shipment_id
       WHERE sa.user_id = ? AND hhl.attachments_json LIKE ? LIMIT 1`,
      [userId, pattern],
    );
    return rows.length > 0;
  }

  async findHorseHealthLogs(shipmentId: number): Promise<HorseHealthLogEntity[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT hhl.*, u.full_name as recorded_by_name, r.role_name as user_role_name,
              COALESCE(hhl.recorded_by_role, r.role_name) as effective_recorded_by_role
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
        legName: r.leg_name || 'Chặng vận chuyển thực địa',
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        recordedByRole: r.effective_recorded_by_role || r.recorded_by_role || r.user_role_name,
        conditionStatus: r.condition_status,
        conditionStatusVi: conditionMapVi[r.condition_status] || r.condition_status,
        temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
        heartRateBpm: r.heart_rate_bpm !== null ? Number(r.heart_rate_bpm) : null,
        respiratoryRateBpm: r.respiratory_rate_bpm !== null && r.respiratory_rate_bpm !== undefined ? Number(r.respiratory_rate_bpm) : null,
        routeStopId: r.route_stop_id !== null && r.route_stop_id !== undefined ? Number(r.route_stop_id) : null,
        lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : null,
        lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : null,
        locationSource: r.location_source ?? null,
        alertTier: (r.alert_tier as HealthAlertTier) || 'green',
        alertReason: r.alert_reason ?? null,
        notes: r.notes,
        attachments,
        recordedAt: new Date(r.recorded_at).toISOString(),
      };
    });
  }

  async isHorseOwnedByUser(horseId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT 1 FROM horse WHERE horse_id = ? AND owner_id = ? LIMIT 1',
      [horseId, userId],
    );
    return rows.length > 0;
  }

  async isHorseAssignedToDriver(horseId: number, driverUserId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT 1
       FROM shipment_horse sh
       JOIN shipment_assignment sa ON sa.shipment_id = sh.shipment_id
       WHERE sh.horse_id = ? AND sa.user_id = ?
       LIMIT 1`,
      [horseId, driverUserId],
    );
    return rows.length > 0;
  }

  async findHorseHealthLogsByHorseId(horseId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT hhl.*, u.full_name as recorded_by_name, r.role_name as user_role_name,
              COALESCE(hhl.recorded_by_role, r.role_name) as effective_recorded_by_role,
              s.origin_location, s.destination_location
       FROM horse_health_log hhl
       JOIN \`user\` u ON hhl.recorded_by = u.user_id
       JOIN \`role\` r ON u.role_id = r.role_id
       LEFT JOIN shipment s ON s.shipment_id = hhl.shipment_id
       WHERE hhl.horse_id = ?
       ORDER BY hhl.recorded_at DESC`,
      [horseId],
    );

    const conditionMapVi: Record<string, string> = {
      stable: 'Khỏe mạnh / Ổn định',
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
        legName: r.leg_name || 'Chặng vận chuyển thực địa',
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        recordedByRole: r.effective_recorded_by_role || r.recorded_by_role || r.user_role_name,
        conditionStatus: r.condition_status,
        conditionStatusVi: conditionMapVi[r.condition_status] || r.condition_status,
        temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
        heartRateBpm: r.heart_rate_bpm !== null ? Number(r.heart_rate_bpm) : null,
        respiratoryRateBpm: r.respiratory_rate_bpm !== null && r.respiratory_rate_bpm !== undefined ? Number(r.respiratory_rate_bpm) : null,
        routeStopId: r.route_stop_id !== null && r.route_stop_id !== undefined ? Number(r.route_stop_id) : null,
        lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : null,
        lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : null,
        locationSource: r.location_source ?? null,
        alertTier: (r.alert_tier as HealthAlertTier) || 'green',
        alertReason: r.alert_reason ?? null,
        notes: r.notes,
        attachments,
        recordedAt: new Date(r.recorded_at).toISOString(),
        originLocation: r.origin_location,
        destinationLocation: r.destination_location,
      };
    });
  }

  // --- Step 10: GPS Geofence, Position Pings, and Simulation Configuration ---

  async getSetting<T = any>(key: string): Promise<T | null> {
    try {
      const [rows] = await this.pool.execute<any[]>(
        'SELECT value_json FROM system_setting WHERE setting_key = ?',
        [key],
      );
      if (!rows[0]) return null;
      const v = rows[0].value_json;
      return (typeof v === 'string' ? JSON.parse(v) : v) as T;
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') return null;
      throw err;
    }
  }

  async setSetting(key: string, value: unknown, userId?: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO system_setting (setting_key, value_json, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
      [key, JSON.stringify(value), userId ?? null],
    );
  }

  async resolveLocationCoords(
    locName: string,
  ): Promise<{ lat: number; lng: number; refType?: 'master_stop' | 'airport' | 'seaport' | 'depot' } | null> {
    if (!locName || !locName.trim()) return null;
    const rawNeedle = locName.trim();
    const strippedNeedle = rawNeedle.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    const candidates =
      strippedNeedle.length >= 6 && strippedNeedle.toLowerCase() !== rawNeedle.toLowerCase()
        ? [rawNeedle, strippedNeedle]
        : [rawNeedle];

    for (const needle of candidates) {
      try {
        const [ms] = await this.pool.execute<any[]>(
          `SELECT lat, lng FROM master_stop
           WHERE LOWER(name) = LOWER(?)
              OR (CHAR_LENGTH(?) >= 6 AND LOWER(name) LIKE LOWER(?))
              OR LOWER(address) LIKE LOWER(?)
           ORDER BY (LOWER(name) = LOWER(?)) DESC
           LIMIT 1`,
          [needle, needle, `%${needle}%`, `%${needle}%`, needle],
        );
        if (ms[0]?.lat != null && ms[0]?.lng != null) {
          return { lat: Number(ms[0].lat), lng: Number(ms[0].lng), refType: 'master_stop' };
        }
      } catch {}

      try {
        const [bc] = await this.pool.execute<any[]>(
          `SELECT lat, lng FROM border_crossing
           WHERE LOWER(name) LIKE LOWER(?) OR LOWER(name_en) LIKE LOWER(?) OR LOWER(code) = LOWER(?)
           LIMIT 1`,
          [`%${needle}%`, `%${needle}%`, needle],
        );
        if (bc[0]?.lat != null && bc[0]?.lng != null) {
          return { lat: Number(bc[0].lat), lng: Number(bc[0].lng), refType: 'master_stop' };
        }
      } catch {}

      try {
        const [ap] = await this.pool.execute<any[]>(
          'SELECT lat, lng FROM airport WHERE LOWER(name) LIKE LOWER(?) OR LOWER(iata_code) = LOWER(?) LIMIT 1',
          [`%${needle}%`, needle],
        );
        if (ap[0]?.lat != null && ap[0]?.lng != null) {
          return { lat: Number(ap[0].lat), lng: Number(ap[0].lng), refType: 'airport' };
        }
      } catch {}

      try {
        const [sp] = await this.pool.execute<any[]>(
          'SELECT lat, lng FROM seaport WHERE LOWER(name) LIKE LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1',
          [`%${needle}%`, needle],
        );
        if (sp[0]?.lat != null && sp[0]?.lng != null) {
          return { lat: Number(sp[0].lat), lng: Number(sp[0].lng), refType: 'seaport' };
        }
      } catch {}

      try {
        const [dp] = await this.pool.execute<any[]>(
          'SELECT lat, lng FROM depot WHERE LOWER(name) LIKE LOWER(?) LIMIT 1',
          [`%${needle}%`],
        );
        if (dp[0]?.lat != null && dp[0]?.lng != null) {
          return { lat: Number(dp[0].lat), lng: Number(dp[0].lng), refType: 'depot' };
        }
      } catch {}
    }
    return null;
  }

  async findPaymentAndRefundTimestamps(shipmentId: number): Promise<{ paidAt: Date | null; refundedAt: Date | null }> {
    let paidAt: Date | null = null;
    let refundedAt: Date | null = null;
    try {
      const [payRows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT MAX(COALESCE(paid_at, updated_at, created_at)) AS paid_at
         FROM shipment_sepay_payment
         WHERE shipment_id = ? AND status = 'succeeded'`,
        [shipmentId],
      );
      if (payRows[0]?.paid_at) paidAt = new Date(payRows[0].paid_at);
    } catch {}
    try {
      const [refRows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT MAX(COALESCE(transferred_at, updated_at)) AS refunded_at
         FROM shipment_refund_record
         WHERE shipment_id = ? AND status = 'transferred' AND cancellation_category <> 'insurance_claim'`,
        [shipmentId],
      );
      if (refRows[0]?.refunded_at) refundedAt = new Date(refRows[0].refunded_at);
    } catch {}
    return { paidAt, refundedAt };
  }

  async findStopCoordinates(stopId: number): Promise<{
    routeStopId: number;
    routeId: number;
    legId: number | null;
    sequenceNo: number;
    stopType: string;
    locationName: string;
    country: string | null;
    lat: number | null;
    lng: number | null;
    geofenceRadiusM: number | null;
    locationRefType: string | null;
    actualArrival: Date | null;
    actualDeparture: Date | null;
    status: string;
  } | null> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT * FROM route_stop WHERE route_stop_id = ? LIMIT 1',
      [stopId],
    );
    const r = rows[0];
    if (!r) return null;

    let lat = r.lat !== null && r.lat !== undefined ? Number(r.lat) : null;
    let lng = r.lng !== null && r.lng !== undefined ? Number(r.lng) : null;
    let refType = r.location_ref_type ?? null;

    if ((lat === null || lng === null) && refType === 'master_stop' && r.location_ref_id) {
      try {
        const [msById] = await this.pool.execute<any[]>(
          'SELECT lat, lng FROM master_stop WHERE stop_id = ? LIMIT 1',
          [Number(r.location_ref_id)],
        );
        if (msById[0]?.lat != null && msById[0]?.lng != null) {
          lat = Number(msById[0].lat);
          lng = Number(msById[0].lng);
        }
      } catch {}
    }

    if (lat === null || lng === null) {
      const resolved = await this.resolveLocationCoords(r.location_name);
      if (resolved) {
        lat = resolved.lat;
        lng = resolved.lng;
        refType = refType || resolved.refType || 'master_stop';
      }
    }

    return {
      routeStopId: Number(r.route_stop_id),
      routeId: Number(r.route_id),
      legId: r.leg_id ? Number(r.leg_id) : null,
      sequenceNo: Number(r.sequence_no),
      stopType: r.stop_type,
      locationName: r.location_name,
      country: r.country ?? null,
      lat,
      lng,
      geofenceRadiusM: r.geofence_radius_m !== null && r.geofence_radius_m !== undefined ? Number(r.geofence_radius_m) : null,
      locationRefType: refType,
      actualArrival: r.actual_arrival ? new Date(r.actual_arrival) : null,
      actualDeparture: r.actual_departure ? new Date(r.actual_departure) : null,
      status: r.status,
    };
  }

  async findLegCoordinates(legId: number): Promise<{
    legId: number;
    routeId: number;
    sequenceNo: number;
    legType: string;
    originLocation: string;
    destinationLocation: string;
    originLat: number | null;
    originLng: number | null;
    destinationLat: number | null;
    destinationLng: number | null;
    routePolyline: string | null;
    status: string;
    actualDeparture: Date | null;
    actualArrival: Date | null;
  } | null> {
    const [rows] = await this.pool.execute<any[]>(
      'SELECT * FROM route_leg WHERE leg_id = ? LIMIT 1',
      [legId],
    );
    const r = rows[0];
    if (!r) return null;

    let originLat = r.origin_lat !== null && r.origin_lat !== undefined ? Number(r.origin_lat) : null;
    let originLng = r.origin_lng !== null && r.origin_lng !== undefined ? Number(r.origin_lng) : null;
    let destinationLat = r.destination_lat !== null && r.destination_lat !== undefined ? Number(r.destination_lat) : null;
    let destinationLng = r.destination_lng !== null && r.destination_lng !== undefined ? Number(r.destination_lng) : null;

    if (originLat === null || originLng === null) {
      const resolved = await this.resolveLocationCoords(r.origin_location);
      if (resolved) {
        originLat = resolved.lat;
        originLng = resolved.lng;
      }
    }
    if (destinationLat === null || destinationLng === null) {
      const resolved = await this.resolveLocationCoords(r.destination_location);
      if (resolved) {
        destinationLat = resolved.lat;
        destinationLng = resolved.lng;
      }
    }

    return {
      legId: Number(r.leg_id),
      routeId: Number(r.route_id),
      sequenceNo: Number(r.sequence_no),
      legType: r.leg_type,
      originLocation: r.origin_location,
      destinationLocation: r.destination_location,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      routePolyline: r.route_polyline ?? null,
      status: r.status,
      actualDeparture: r.actual_departure ? new Date(r.actual_departure) : null,
      actualArrival: r.actual_arrival ? new Date(r.actual_arrival) : null,
    };
  }

  async saveVehiclePositionPings(
    pings: Array<{
      shipmentId: number;
      legId?: number | null;
      vehicleId?: number | null;
      reportedBy: number;
      lat: number;
      lng: number;
      accuracyM?: number | null;
      speedKmh?: number | null;
      headingDeg?: number | null;
      source: 'gps' | 'simulated';
      recordedAt: Date;
      isBackdated?: boolean;
    }>,
  ): Promise<number> {
    if (!pings || pings.length === 0) return 0;
    let inserted = 0;
    for (const p of pings) {
      await this.pool.execute(
        `INSERT INTO vehicle_position_ping (
          shipment_id, leg_id, vehicle_id, reported_by, lat, lng,
          accuracy_m, speed_kmh, heading_deg, source, recorded_at, is_backdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.shipmentId,
          p.legId || null,
          p.vehicleId || null,
          p.reportedBy,
          p.lat,
          p.lng,
          p.accuracyM ?? null,
          p.speedKmh ?? null,
          p.headingDeg ?? null,
          p.source,
          p.recordedAt,
          p.isBackdated ? 1 : 0,
        ],
      );
      inserted++;
    }
    return inserted;
  }

  async findLatestPing(shipmentId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT * FROM vehicle_position_ping
       WHERE shipment_id = ?
       ORDER BY recorded_at DESC, ping_id DESC LIMIT 1`,
      [shipmentId],
    );
    return rows[0] || null;
  }

  async findRecentPingsForShipment(shipmentId: number, limit = 500): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT * FROM vehicle_position_ping
       WHERE shipment_id = ?
       ORDER BY recorded_at ASC LIMIT ?`,
      [shipmentId, limit],
    );
    return rows;
  }

  async findHealthLogsForStop(shipmentId: number, arrivedAt: Date, stopId?: number): Promise<any[]> {
    if (stopId) {
      const [rows] = await this.pool.execute<any[]>(
        `SELECT * FROM horse_health_log
         WHERE shipment_id = ? AND (route_stop_id = ? OR recorded_at >= ?)`,
        [shipmentId, stopId, arrivedAt],
      );
      return rows;
    }
    const [rows] = await this.pool.execute<any[]>(
      `SELECT * FROM horse_health_log
       WHERE shipment_id = ? AND recorded_at >= ?`,
      [shipmentId, arrivedAt],
    );
    return rows;
  }

  async findActiveShipmentsForLiveOverview(): Promise<any[]> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
              s.contact_name, s.origin_location, s.destination_location,
              s.status, s.requested_horse_count, r.route_id, r.total_distance_km,
              (SELECT u.full_name
               FROM shipment_assignment sa
               JOIN \`user\` u ON u.user_id = sa.user_id
               WHERE sa.shipment_id = s.shipment_id AND sa.role_in_shipment = 'driver'
               ORDER BY sa.assignment_id ASC LIMIT 1) AS driver_name,
              (SELECT v.plate_or_code
               FROM shipment_vehicle sv
               JOIN vehicle v ON v.vehicle_id = sv.vehicle_id
               WHERE sv.shipment_id = s.shipment_id
               ORDER BY sv.shipment_vehicle_id ASC LIMIT 1) AS vehicle_plate,
              (SELECT COALESCE(SUM(COALESCE(sh.quantity, 1)), 0)
               FROM shipment_horse sh
               WHERE sh.shipment_id = s.shipment_id) AS horses_count
       FROM shipment s
       LEFT JOIN route r ON r.shipment_id = s.shipment_id
       WHERE s.status IN ('ready_to_depart', 'in_transit', 'return_pending')
       ORDER BY s.shipment_id DESC`,
    );
    return rows;
  }

  async findHorsesInOrder(shipmentId: number): Promise<Array<{ horse_id: number; horse_name: string; id?: number; name?: string }>> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT h.horse_id, h.name as horse_name
       FROM shipment_horse sh
       JOIN horse h ON sh.horse_id = h.horse_id
       WHERE sh.shipment_id = ?`,
      [shipmentId],
    );
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        horse_id: Number(r.horse_id),
        horse_name: String(r.horse_name),
        id: Number(r.horse_id),
        name: String(r.horse_name),
      }));
    }
    const [logRows] = await this.pool.execute<any[]>(
      `SELECT DISTINCT horse_id, horse_name
       FROM horse_health_log
       WHERE shipment_id = ? AND horse_name IS NOT NULL`,
      [shipmentId],
    );
    return (logRows || []).map((r) => ({
      horse_id: Number(r.horse_id || 0),
      horse_name: String(r.horse_name),
      id: Number(r.horse_id || 0),
      name: String(r.horse_name),
    }));
  }
}
