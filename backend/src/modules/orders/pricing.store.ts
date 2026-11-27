import { Injectable, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConnection, RowDataPacket, createPool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';

export interface TariffRecord {
  tariffId: number;
  mode: 'road' | 'air' | 'sea';
  region: string;
  version: number;
  params: any;
  effectiveFrom: string;
  isActive: boolean;
  notes: string | null;
  createdBy: number | null;
  createdByName?: string | null;
  createdAt: string;
}

export function parseJsonField<T = any>(val: any): T {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as T;
  }
}

@Injectable()
export class PricingStore implements OnModuleInit, OnModuleDestroy {
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
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
      await this.pool.end();
    }
  }

  private mapTariffRow(row: RowDataPacket): TariffRecord {
    return {
      tariffId: Number(row.tariff_id),
      mode: row.mode,
      region: row.region,
      version: Number(row.version),
      params: parseJsonField(row.params),
      effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString() : '',
      isActive: Boolean(row.is_active),
      notes: row.notes ?? null,
      createdBy: row.created_by != null ? Number(row.created_by) : null,
      createdByName: row.created_by_name ?? null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    };
  }

  /**
   * Lấy toàn bộ bảng giá đang kích hoạt của một khu vực (mặc định VN).
   */
  async getActiveTariffs(region = 'VN'): Promise<Record<'road' | 'air' | 'sea', TariffRecord | null>> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.*, u.full_name AS created_by_name
       FROM pricing_tariff t
       LEFT JOIN \`user\` u ON u.user_id = t.created_by
       WHERE t.region = ? AND t.is_active = TRUE`,
      [region],
    );

    const result: Record<'road' | 'air' | 'sea', TariffRecord | null> = {
      road: null,
      air: null,
      sea: null,
    };

    for (const r of rows) {
      const mapped = this.mapTariffRow(r);
      if (mapped.mode === 'road' || mapped.mode === 'air' || mapped.mode === 'sea') {
        result[mapped.mode] = mapped;
      }
    }

    return result;
  }

  /**
   * Lấy bảng giá đang kích hoạt cho một mode cụ thể.
   */
  async getActiveTariff(mode: 'road' | 'air' | 'sea', region = 'VN'): Promise<TariffRecord | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.*, u.full_name AS created_by_name
       FROM pricing_tariff t
       LEFT JOIN \`user\` u ON u.user_id = t.created_by
       WHERE t.mode = ? AND t.region = ? AND t.is_active = TRUE
       LIMIT 1`,
      [mode, region],
    );
    return rows[0] ? this.mapTariffRow(rows[0]) : null;
  }

  /**
   * Lấy lịch sử tất cả phiên bản bảng giá của một mode.
   */
  async getTariffHistory(mode: 'road' | 'air' | 'sea', region = 'VN'): Promise<TariffRecord[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.*, u.full_name AS created_by_name
       FROM pricing_tariff t
       LEFT JOIN \`user\` u ON u.user_id = t.created_by
       WHERE t.mode = ? AND t.region = ?
       ORDER BY t.version DESC`,
      [mode, region],
    );
    return rows.map((r) => this.mapTariffRow(r));
  }

  /**
   * Tạo phiên bản bảng giá mới (version = max + 1), kích hoạt nó và tắt phiên bản cũ trong cùng transaction.
   */
  async createTariffVersion(
    mode: 'road' | 'air' | 'sea',
    region: string,
    params: any,
    notes: string | null,
    createdBy: number,
  ): Promise<TariffRecord> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();

      const [maxRows] = await db.execute<RowDataPacket[]>(
        `SELECT MAX(version) AS max_v FROM pricing_tariff WHERE mode = ? AND region = ? FOR UPDATE`,
        [mode, region],
      );
      const nextVersion = (Number(maxRows[0]?.max_v) || 0) + 1;

      // Tắt phiên bản đang kích hoạt cũ
      await db.execute(
        `UPDATE pricing_tariff SET is_active = FALSE WHERE mode = ? AND region = ? AND is_active = TRUE`,
        [mode, region],
      );

      // Thêm phiên bản mới
      const paramsJson = typeof params === 'string' ? params : JSON.stringify(params);
      const [insertRes] = await db.execute(
        `INSERT INTO pricing_tariff (mode, region, version, params, is_active, notes, created_by, effective_from)
         VALUES (?, ?, ?, ?, TRUE, ?, ?, NOW())`,
        [mode, region, nextVersion, paramsJson, notes, createdBy],
      );

      const newId = (insertRes as any).insertId;
      await db.commit();

      const [newRows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT t.*, u.full_name AS created_by_name
         FROM pricing_tariff t
         LEFT JOIN \`user\` u ON u.user_id = t.created_by
         WHERE t.tariff_id = ? LIMIT 1`,
        [newId],
      );
      return this.mapTariffRow(newRows[0]);
    } catch (err) {
      await db.rollback();
      throw err;
    } finally {
      db.release();
    }
  }

  /**
   * Đọc danh mục vehicle_class mode road xếp theo horse_capacity tăng dần.
   */
  async getRoadVehicleClasses(): Promise<
    Array<{
      code: string;
      nameVi: string;
      horseCapacity: number;
      priceCoefficient: number;
    }>
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT code, name_vi, horse_capacity, price_coefficient
       FROM vehicle_class
       WHERE mode = 'road' AND horse_capacity IS NOT NULL
       ORDER BY horse_capacity ASC, sort_order ASC`,
    );
    return rows.map((r) => ({
      code: r.code,
      nameVi: r.name_vi,
      horseCapacity: Number(r.horse_capacity),
      priceCoefficient: Number(r.price_coefficient),
    }));
  }

  /**
   * Lấy các trạm xe own đang hoạt động.
   */
  async getActiveOwnDepots(): Promise<
    Array<{
      id: number;
      code: string;
      name: string;
      lat: number;
      lng: number;
    }>
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT depot_id, code, name, lat, lng
       FROM depot
       WHERE is_active = TRUE AND type = 'own'`,
    );
    return rows.map((r) => ({
      id: Number(r.depot_id),
      code: r.code,
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));
  }

  /**
   * Lấy danh sách sân bay có ram dốc chuyên dụng cho ngựa.
   */
  async getAirportsWithEquineRamp(): Promise<
    Array<{
      id: number;
      code: string;
      name: string;
      city: string;
      country: string;
      lat: number;
      lng: number;
    }>
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT airport_id, iata_code, name, city, country, lat, lng
       FROM airport
       WHERE has_equine_cargo_ramp = TRUE AND lat IS NOT NULL AND lng IS NOT NULL`,
    );
    return rows.map((r) => ({
      id: Number(r.airport_id),
      code: r.iata_code,
      name: r.name,
      city: r.city,
      country: r.country,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));
  }

  /**
   * Lấy danh sách tuyến biển đang hoạt động theo sea_mode kèm tọa độ 2 cảng.
   */
  async getActiveSeaRoutes(seaMode: 'vessel'): Promise<
    Array<{
      seaRouteId: number;
      fromPortId: number;
      fromPortCode: string;
      fromPortName: string;
      fromLat: number;
      fromLng: number;
      toPortId: number;
      toPortCode: string;
      toPortName: string;
      toLat: number;
      toLng: number;
      distanceKm: number;
      typicalHours: number;
    }>
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT sr.sea_route_id, sr.from_port_id, sr.to_port_id, sr.distance_km, sr.typical_hours,
              p1.code AS from_code, p1.name AS from_name, p1.lat AS from_lat, p1.lng AS from_lng,
              p2.code AS to_code, p2.name AS to_name, p2.lat AS to_lat, p2.lng AS to_lng
       FROM sea_route sr
       JOIN seaport p1 ON p1.port_id = sr.from_port_id
       JOIN seaport p2 ON p2.port_id = sr.to_port_id
       WHERE sr.is_active = TRUE AND sr.sea_mode = ? AND p1.is_active = TRUE AND p2.is_active = TRUE`,
      [seaMode],
    );
    return rows.map((r) => ({
      seaRouteId: Number(r.sea_route_id),
      fromPortId: Number(r.from_port_id),
      fromPortCode: r.from_code,
      fromPortName: r.from_name,
      fromLat: Number(r.from_lat),
      fromLng: Number(r.from_lng),
      toPortId: Number(r.to_port_id),
      toPortCode: r.to_code,
      toPortName: r.to_name,
      toLat: Number(r.to_lat),
      toLng: Number(r.to_lng),
      distanceKm: Number(r.distance_km),
      typicalHours: Number(r.typical_hours),
    }));
  }
}
