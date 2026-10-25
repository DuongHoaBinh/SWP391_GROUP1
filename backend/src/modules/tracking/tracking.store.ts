import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createPool, Pool, PoolConnection } from 'mysql2/promise';
import { CreateHealthLogDto, HealthLogPage, HealthLogQueryDto, HorseHealthLogEntity, TripStatusLogEntity } from './tracking.types';

@Injectable()
export class TrackingStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private readonly connections = new AsyncLocalStorage<PoolConnection>();
  private get db(): Pool | PoolConnection { return this.connections.getStore() ?? this.pool; }

  async onModuleInit(): Promise<void> {
    this.pool = createPool({
      host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '', connectionLimit: 10,
    });
    await this.pool.query('SELECT 1');
  }
  async onModuleDestroy(): Promise<void> { await this.pool?.end(); }

  async withShipmentTransaction<T>(shipmentId: number, action: () => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT shipment_id FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      const result = await this.connections.run(connection, action);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async findShipmentById(shipmentId: number): Promise<any | null> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email,
              CONCAT('REQ-', LPAD(s.shipment_id, GREATEST(3, CHAR_LENGTH(s.shipment_id)), '0')) as request_code,
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
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM route WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    return rows[0] || null;
  }

  async findLegsByRouteId(routeId: number): Promise<any[]> {
    const [rows] = await this.db.execute<any[]>(
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
    const [rows] = await this.db.execute<any[]>(
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
    const [rows] = await this.db.execute<any[]>(
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
    const [rows] = await this.db.execute<any[]>(
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
      const [rows] = await this.db.execute<any[]>(
        `SELECT s.shipment_id,
                CONCAT('REQ-', LPAD(s.shipment_id, GREATEST(3, CHAR_LENGTH(s.shipment_id)), '0')) as request_code,
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
         WHERE s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed')
         ORDER BY s.shipment_id DESC`,
      );
      return rows;
    }

    if (isCustomer) {
      const [rows] = await this.db.execute<any[]>(
        `SELECT s.shipment_id,
                CONCAT('REQ-', LPAD(s.shipment_id, GREATEST(3, CHAR_LENGTH(s.shipment_id)), '0')) as request_code,
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
         WHERE s.customer_id = ?
           AND s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed')
         ORDER BY s.shipment_id DESC`,
        [userId],
      );
      return rows;
    }

    // For Driver or Escort: only trips assigned to them
    const [rows] = await this.db.execute<any[]>(
      `SELECT s.shipment_id,
              CONCAT('REQ-', LPAD(s.shipment_id, GREATEST(3, CHAR_LENGTH(s.shipment_id)), '0')) as request_code,
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
         AND s.status IN ('planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed')
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
    await this.db.execute(
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
    const timeUpdate = status === 'arrived' ? 'actual_arrival = ?,' : isDeparture ? 'actual_departure = ?,' : '';
    await this.db.execute(
      `UPDATE route_stop
       SET status = ?, ${timeUpdate} updated_by = ?, notes = COALESCE(?, notes)
       WHERE route_stop_id = ?`,
      [status, ...(timeUpdate ? [actualTime] : []), updatedBy, notes || null, stopId],
    );
  }

  async updateShipmentStatus(shipmentId: number, status: string): Promise<void> {
    await this.db.execute(
      'UPDATE shipment SET status = ? WHERE shipment_id = ?',
      [status, shipmentId],
    );
  }

  async updateRoutePlanStatus(routeId: number, planStatus: string): Promise<void> {
    await this.db.execute(
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
    occurredAt?: Date;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO trip_status_log (shipment_id, route_id, leg_id, route_stop_id, previous_status, new_status, milestone_type, milestone_name, notes, updated_by, updated_by_role, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
        log.occurredAt ?? new Date(),
      ],
    );
  }

  async findTripStatusLogs(shipmentId: number): Promise<TripStatusLogEntity[]> {
    const [rows] = await this.db.execute<any[]>(
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
      occurredAt: new Date(r.occurred_at ?? r.created_at).toISOString(),
    }));
  }

  async recordStopUpdate(stopId: number, actor: number, status: string, time: Date, notes?: string, vehicleTemperatureC?: number): Promise<void> {
    await this.db.execute(
      `INSERT INTO route_stop_update (route_stop_id, updated_by, actual_arrival, actual_departure, status, notes, vehicle_temperature_c, event_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [stopId, actor, status === 'arrived' ? time : null, status === 'departed' ? time : null, status, notes ?? null, vehicleTemperatureC ?? null, time],
    );
  }

  async findStopUpdates(shipmentId: number): Promise<any[]> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT rsu.* FROM route_stop_update rsu JOIN route_stop rs ON rs.route_stop_id = rsu.route_stop_id
       JOIN route r ON r.route_id = rs.route_id WHERE r.shipment_id = ? ORDER BY rsu.created_at ASC, rsu.update_id ASC`, [shipmentId],
    );
    return rows.map(r => ({ id: r.update_id, routeStopId: r.route_stop_id, status: r.status,
      updatedBy: r.updated_by, notes: r.notes, createdAt: new Date(r.created_at).toISOString(),
      actualTime: new Date(r.event_time ?? r.actual_departure ?? r.actual_arrival ?? r.created_at).toISOString() }));
  }

  async createHorseHealthLog(shipmentId: number, actor: number, dto: CreateHealthLogDto): Promise<number> {
    const [result] = await this.db.execute<any>(
      `INSERT INTO horse_condition_log
       (shipment_horse_id, recorded_by, condition_status, temperature_c, heart_rate_bpm, vehicle_temperature_c, notes, attachments_json)
       SELECT shipment_horse_id, ?, ?, ?, ?, ?, ?, ? FROM shipment_horse WHERE shipment_id = ? AND horse_id = ?`,
      [actor, dto.conditionStatus, dto.temperatureC ?? null, dto.heartRateBpm ?? null, dto.vehicleTemperatureC ?? null,
       dto.notes ?? null, JSON.stringify(dto.attachments ?? []), shipmentId, dto.horseId],
    );
    return result.insertId;
  }

  private mapHealthLog(r: any): HorseHealthLogEntity {
    const labels: Record<string, string> = { stable: 'Ổn định', not_eating: 'Bỏ ăn', stressed: 'Căng thẳng', climate_change: 'Khí hậu thay đổi', other: 'Khác' };
    let attachments: string[] = [];
    try { attachments = typeof r.attachments_json === 'string' ? JSON.parse(r.attachments_json) : (r.attachments_json ?? []); } catch {}
    return { id: r.log_id, shipmentId: r.shipment_id, horseId: r.horse_id, horseName: r.horse_name,
      recordedBy: r.recorded_by, recordedByName: r.recorded_by_name, recordedByRole: r.recorded_by_role,
      conditionStatus: r.condition_status, conditionStatusVi: labels[r.condition_status] ?? r.condition_status,
      temperatureC: r.temperature_c == null ? null : Number(r.temperature_c),
      heartRateBpm: r.heart_rate_bpm == null ? null : Number(r.heart_rate_bpm),
      vehicleTemperatureC: r.vehicle_temperature_c == null ? null : Number(r.vehicle_temperature_c),
      notes: r.notes, attachments: Array.isArray(attachments) ? attachments : [], recordedAt: new Date(r.recorded_at).toISOString() };
  }

  private readonly healthSelect = `SELECT hcl.*, sh.shipment_id, sh.horse_id, h.name AS horse_name,
    u.full_name AS recorded_by_name, r.role_name AS recorded_by_role
    FROM horse_condition_log hcl JOIN shipment_horse sh ON sh.shipment_horse_id = hcl.shipment_horse_id
    JOIN horse h ON h.horse_id = sh.horse_id JOIN \`user\` u ON u.user_id = hcl.recorded_by
    JOIN \`role\` r ON r.role_id = u.role_id`;

  async findHorseHealthLogs(shipmentId: number, query: HealthLogQueryDto = new HealthLogQueryDto()): Promise<HealthLogPage> {
    const params: number[] = [shipmentId];
    const filter = query.horseId ? ' AND sh.horse_id = ?' : '';
    if (query.horseId) params.push(query.horseId);
    const [counts] = await this.db.execute<any[]>(
      `SELECT COUNT(*) AS total FROM horse_condition_log hcl JOIN shipment_horse sh ON sh.shipment_horse_id = hcl.shipment_horse_id
       WHERE sh.shipment_id = ?${filter}`, params,
    );
    const [rows] = await this.db.query<any[]>(
      `${this.healthSelect} WHERE sh.shipment_id = ?${filter} ORDER BY hcl.recorded_at DESC, hcl.log_id DESC LIMIT ? OFFSET ?`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );
    const total = Number(counts[0].total);
    return { items: rows.map(r => this.mapHealthLog(r)), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  async findHealthLogById(id: number): Promise<HorseHealthLogEntity> {
    const [rows] = await this.db.execute<any[]>(`${this.healthSelect} WHERE hcl.log_id = ?`, [id]);
    return this.mapHealthLog(rows[0]);
  }

  async findLatestHorseHealth(shipmentId: number): Promise<HorseHealthLogEntity[]> {
    const [rows] = await this.db.execute<any[]>(
      `${this.healthSelect} WHERE sh.shipment_id = ? AND NOT EXISTS (
        SELECT 1 FROM horse_condition_log newer WHERE newer.shipment_horse_id = hcl.shipment_horse_id
        AND (newer.recorded_at > hcl.recorded_at OR (newer.recorded_at = hcl.recorded_at AND newer.log_id > hcl.log_id)))`, [shipmentId],
    );
    return rows.map(r => this.mapHealthLog(r));
  }

  async findVehicleTelemetry(shipmentId: number): Promise<{vehicleTemperatureC: number | null; recordedAt: string | null}> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT value, measured_at FROM (
         SELECT hcl.vehicle_temperature_c AS value, hcl.recorded_at AS measured_at, hcl.log_id AS event_id
         FROM horse_condition_log hcl JOIN shipment_horse sh ON sh.shipment_horse_id = hcl.shipment_horse_id
         WHERE sh.shipment_id = ? AND hcl.vehicle_temperature_c IS NOT NULL
         UNION ALL
         SELECT rsu.vehicle_temperature_c, COALESCE(rsu.event_time, rsu.actual_departure, rsu.actual_arrival, rsu.created_at), rsu.update_id FROM route_stop_update rsu
         JOIN route_stop rs ON rs.route_stop_id = rsu.route_stop_id JOIN route r ON r.route_id = rs.route_id
         WHERE r.shipment_id = ? AND rsu.vehicle_temperature_c IS NOT NULL
       ) measurements ORDER BY measured_at DESC, event_id DESC LIMIT 1`, [shipmentId, shipmentId],
    );
    return rows.length ? { vehicleTemperatureC: Number(rows[0].value), recordedAt: new Date(rows[0].measured_at).toISOString() }
      : { vehicleTemperatureC: null, recordedAt: null };
  }
}
