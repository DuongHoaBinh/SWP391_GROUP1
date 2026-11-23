import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import { CityRestrictionException, CityRestrictionRule, parseDaysOfWeek } from './city-restriction-policy';
import { AllocationVehicle } from './allocation-policy';
import { INACTIVE_SHIPMENT_SQL } from './vehicle-reservation';

export interface DepotWithVehicles {
  depotId: number;
  depotCode: string;
  depotName: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  vehicles: AllocationVehicle[];
}

export interface DepotLocation {
  depotId: number;
  code: string;
  name: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  type: 'own' | 'partner';
}

const timeStr = (v: any) => String(v ?? '').slice(0, 5);
const dateStr = (v: any) => {
  if (!v) return null;
  if (v instanceof Date) {
    // Cột DATE được mysql2 trả về Date nửa đêm giờ máy chủ: lấy phần ngày theo giờ địa phương
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

/**
 * Store dữ liệu cho phân bổ xe (Step 9): xe rảnh theo trạm, giờ cấm đô thị, cấu hình hệ thống.
 * Nằm trong AllocationModule (không import module khác) để OrdersModule dùng được mà không vòng
 * phụ thuộc với FleetModule.
 */
@Injectable()
export class AllocationStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) this.pool = injectedPool;
  }

  onModuleInit() {
    if (!this.pool) {
      this.pool = createPool({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 3306),
        database: process.env.DB_NAME ?? 'horse_transport_system',
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        connectionLimit: 5,
      });
    }
  }

  async onModuleDestroy() {
    if (this.pool && !this.injectedPool) await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }

  async findActiveDepots(type: 'own' | 'partner'): Promise<DepotLocation[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT depot_id, code, name, country, city, lat, lng, type FROM depot WHERE is_active = TRUE AND type = ? ORDER BY depot_id',
      [type],
    );
    return rows.map((r) => ({
      depotId: Number(r.depot_id), code: r.code, name: r.name, country: r.country, city: r.city,
      lat: Number(r.lat), lng: Number(r.lng), type: r.type,
    }));
  }

  /**
   * Xe đường bộ RẢNH trong [start, end) theo từng trạm own đang hoạt động:
   * xe không bảo dưỡng, không trùng reservation còn hiệu lực, không trùng chặng route_leg của đơn
   * đang hoạt động, không đang gắn shipment_vehicle của đơn đang chạy mà chưa có lịch.
   */
  async findAvailableVehiclesByDepot(window: { start: Date; end: Date }): Promise<DepotWithVehicles[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT v.vehicle_id, v.plate_or_code, v.capacity, v.vehicle_class_code,
              vc.name_vi AS class_name, vc.price_coefficient, vc.is_heavy_truck,
              d.depot_id, d.code AS depot_code, d.name AS depot_name, d.country, d.city, d.lat, d.lng
       FROM vehicle v
       JOIN depot d ON d.depot_id = v.depot_id AND d.is_active = TRUE AND d.type = 'own'
       JOIN vehicle_class vc ON vc.code = v.vehicle_class_code AND vc.mode = 'road'
       WHERE v.status <> 'maintenance' AND v.vehicle_type <> 'aircraft_stall' AND v.capacity > 0
         AND NOT EXISTS (
           SELECT 1 FROM vehicle_reservation vr JOIN shipment s ON s.shipment_id = vr.shipment_id
           WHERE vr.vehicle_id = v.vehicle_id AND vr.status IN ('active','consumed')
             AND s.status NOT IN ${INACTIVE_SHIPMENT_SQL}
             AND vr.start_at < ? AND vr.end_at > ?)
         AND NOT EXISTS (
           SELECT 1 FROM route_leg l JOIN route r ON r.route_id = l.route_id JOIN shipment s ON s.shipment_id = r.shipment_id
           WHERE l.vehicle_id = v.vehicle_id AND s.status NOT IN ${INACTIVE_SHIPMENT_SQL}
             AND l.planned_departure IS NOT NULL AND l.planned_arrival IS NOT NULL
             AND l.planned_departure < ? AND l.planned_arrival > ?)
         AND NOT EXISTS (
           SELECT 1 FROM shipment_vehicle sv JOIN shipment s ON s.shipment_id = sv.shipment_id
           WHERE sv.vehicle_id = v.vehicle_id AND s.status IN ('planning','ready_to_depart','in_transit','return_pending')
             AND NOT EXISTS (SELECT 1 FROM route_leg l2 JOIN route r2 ON r2.route_id = l2.route_id
                             WHERE r2.shipment_id = s.shipment_id AND l2.vehicle_id = sv.vehicle_id))
       ORDER BY d.depot_id, v.vehicle_id`,
      [window.end, window.start, window.end, window.start],
    );
    const byDepot = new Map<number, DepotWithVehicles>();
    for (const r of rows) {
      const id = Number(r.depot_id);
      if (!byDepot.has(id)) {
        byDepot.set(id, {
          depotId: id, depotCode: r.depot_code, depotName: r.depot_name, country: r.country, city: r.city,
          lat: Number(r.lat), lng: Number(r.lng), vehicles: [],
        });
      }
      byDepot.get(id)!.vehicles.push({
        vehicleId: Number(r.vehicle_id),
        plate: r.plate_or_code,
        classCode: r.vehicle_class_code,
        className: r.class_name,
        capacity: Number(r.capacity),
        priceCoefficient: Number(r.price_coefficient ?? 1),
        isHeavyTruck: Boolean(r.is_heavy_truck),
      });
    }
    return [...byDepot.values()];
  }

  // --- Giờ cấm đô thị ---
  async listRestrictionRules(activeOnly = false): Promise<CityRestrictionRule[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM city_truck_restriction ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY city, restriction_id`,
    );
    return rows.map((r) => this.mapRule(r));
  }

  async findRestrictionRule(id: number): Promise<CityRestrictionRule | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT * FROM city_truck_restriction WHERE restriction_id = ?', [id]);
    return rows[0] ? this.mapRule(rows[0]) : undefined;
  }

  async createRestrictionRule(rule: CityRestrictionRule): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO city_truck_restriction
        (city, center_lat, center_lng, radius_km, applies_to_heavy_truck, banned_from, banned_to, days_of_week,
         legal_reference, effective_from, effective_to, is_demo_data, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rule.city, rule.centerLat, rule.centerLng, rule.radiusKm, rule.appliesToHeavyTruck, rule.bannedFrom, rule.bannedTo,
        rule.daysOfWeek.join(','), rule.legalReference ?? '', rule.effectiveFrom ?? null, rule.effectiveTo ?? null,
        rule.isDemoData ?? true, rule.isActive ?? true],
    );
    return res.insertId;
  }

  async updateRestrictionRule(id: number, rule: CityRestrictionRule): Promise<void> {
    await this.pool.execute(
      `UPDATE city_truck_restriction SET city = ?, center_lat = ?, center_lng = ?, radius_km = ?, applies_to_heavy_truck = ?,
         banned_from = ?, banned_to = ?, days_of_week = ?, legal_reference = ?, effective_from = ?, effective_to = ?,
         is_demo_data = ?, is_active = ?
       WHERE restriction_id = ?`,
      [rule.city, rule.centerLat, rule.centerLng, rule.radiusKm, rule.appliesToHeavyTruck, rule.bannedFrom, rule.bannedTo,
        rule.daysOfWeek.join(','), rule.legalReference ?? '', rule.effectiveFrom ?? null, rule.effectiveTo ?? null,
        rule.isDemoData ?? true, rule.isActive ?? true, id],
    );
  }

  async listRestrictionExceptions(): Promise<CityRestrictionException[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT * FROM city_restriction_exception ORDER BY exception_date, city');
    return rows.map((r) => ({
      id: Number(r.exception_id), city: r.city, exceptionDate: dateStr(r.exception_date)!,
      bannedFrom: timeStr(r.banned_from), bannedTo: timeStr(r.banned_to), note: r.note ?? null,
    }));
  }

  async createRestrictionException(e: CityRestrictionException): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO city_restriction_exception (city, exception_date, banned_from, banned_to, note) VALUES (?, ?, ?, ?, ?)`,
      [e.city, e.exceptionDate, e.bannedFrom, e.bannedTo, e.note ?? null],
    );
    return res.insertId;
  }

  async deleteRestrictionException(id: number): Promise<boolean> {
    const [res] = await this.pool.execute<ResultSetHeader>('DELETE FROM city_restriction_exception WHERE exception_id = ?', [id]);
    return res.affectedRows > 0;
  }

  // --- Cấu hình hệ thống ---
  async getSetting<T = any>(key: string): Promise<T | null> {
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT value_json FROM system_setting WHERE setting_key = ?', [key]);
      if (!rows[0]) return null;
      const v = rows[0].value_json;
      return (typeof v === 'string' ? JSON.parse(v) : v) as T;
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') return null;
      throw err;
    }
  }

  async setSetting(key: string, value: unknown, userId: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO system_setting (setting_key, value_json, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
      [key, JSON.stringify(value), userId],
    );
  }

  private mapRule(r: RowDataPacket): CityRestrictionRule {
    return {
      id: Number(r.restriction_id),
      city: r.city,
      centerLat: Number(r.center_lat),
      centerLng: Number(r.center_lng),
      radiusKm: Number(r.radius_km),
      appliesToHeavyTruck: Boolean(r.applies_to_heavy_truck),
      bannedFrom: timeStr(r.banned_from),
      bannedTo: timeStr(r.banned_to),
      daysOfWeek: parseDaysOfWeek(r.days_of_week),
      legalReference: r.legal_reference,
      effectiveFrom: dateStr(r.effective_from),
      effectiveTo: dateStr(r.effective_to),
      isDemoData: Boolean(r.is_demo_data),
      isActive: Boolean(r.is_active),
    };
  }
}
