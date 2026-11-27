import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Pool, RowDataPacket, createPool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import { toCountryCode } from './route-network.geo';
import { LatLng, TransportNetwork } from './route-network.types';

function parseViaPoints(raw: unknown): LatLng[] {
  let val: unknown = raw;
  if (typeof raw === 'string') {
    try {
      val = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  return val
    .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(Number(n))))
    .map((p) => [Number(p[0]), Number(p[1])]);
}

/**
 * Đọc mạng lưới vận tải (migration 040): seaport, sea_route, airport, border_crossing, master_stop.
 */
@Injectable()
export class RouteNetworkStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) this.pool = injectedPool;
  }

  async onModuleInit(): Promise<void> {
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

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) await this.pool.end();
  }

  async loadNetwork(): Promise<TransportNetwork> {
    const [ports] = await this.pool.query<RowDataPacket[]>(
      `SELECT port_id, code, name, name_en, country, country_code, lat, lng,
              is_international, supports_ferry, supports_vessel, has_quarantine
       FROM seaport WHERE is_active = TRUE AND supports_vessel = TRUE`,
    );
    const [lanes] = await this.pool.query<RowDataPacket[]>(
      `SELECT sea_route_id, from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, notes
       FROM sea_route
       WHERE is_active = TRUE
         AND sea_mode = 'vessel'
         AND typical_hours <= 168
         AND via_points IS NOT NULL`,
    );
    const [airports] = await this.pool.query<RowDataPacket[]>(
      `SELECT airport_id, iata_code, name, city, country, country_code, has_quarantine_facility,
              has_equine_cargo_ramp, air_role, lat, lng
       FROM airport WHERE is_active = TRUE AND lat IS NOT NULL AND lng IS NOT NULL`,
    );
    const [borders] = await this.pool.query<RowDataPacket[]>(
      `SELECT crossing_id, code, name, name_en, country_a_code, country_b_code, lat, lng, allows_live_animals,
              has_vet_inspection, avg_clearance_hours, opening_hours, notes
       FROM border_crossing WHERE is_active = TRUE`,
    );
    const [stops] = await this.pool.query<RowDataPacket[]>(
      `SELECT stop_id, code, name, stop_type, country, country_code, lat, lng, has_veterinarian, has_stalls
       FROM master_stop WHERE is_active = TRUE AND lat IS NOT NULL AND lng IS NOT NULL`,
    );

    return {
      seaports: ports.map((r) => ({
        id: Number(r.port_id),
        code: r.code,
        name: r.name,
        nameEn: r.name_en ?? null,
        countryCode: toCountryCode(r.country, r.country_code),
        lat: Number(r.lat),
        lng: Number(r.lng),
        isInternational: Boolean(r.is_international),
        supportsFerry: false,
        supportsVessel: Boolean(r.supports_vessel),
        hasQuarantine: Boolean(r.has_quarantine),
      })),
      seaLanes: lanes.map((r) => ({
        id: Number(r.sea_route_id),
        fromPortId: Number(r.from_port_id),
        toPortId: Number(r.to_port_id),
        seaMode: 'vessel' as const,
        distanceKm: Number(r.distance_km),
        typicalHours: Number(r.typical_hours),
        viaPoints: parseViaPoints(r.via_points),
        notes: r.notes ?? null,
      })),
      airports: airports.map((r) => ({
        id: Number(r.airport_id),
        code: r.iata_code,
        name: r.name,
        city: r.city,
        countryCode: toCountryCode(r.country, r.country_code),
        lat: Number(r.lat),
        lng: Number(r.lng),
        hasQuarantine: Boolean(r.has_quarantine_facility),
        hasEquineRamp: Boolean(r.has_equine_cargo_ramp),
        airRole: r.air_role ?? 'gateway',
      })),
      borderCrossings: borders.map((r) => ({
        id: Number(r.crossing_id),
        code: r.code,
        name: r.name,
        nameEn: r.name_en ?? null,
        countryA: r.country_a_code,
        countryB: r.country_b_code,
        lat: Number(r.lat),
        lng: Number(r.lng),
        allowsLiveAnimals: Boolean(r.allows_live_animals),
        hasVetInspection: Boolean(r.has_vet_inspection),
        clearanceHours: Number(r.avg_clearance_hours),
        openingHours: r.opening_hours ?? null,
        notes: r.notes ?? null,
      })),
      restStops: stops.map((r) => ({
        id: Number(r.stop_id),
        code: r.code ?? null,
        name: r.name,
        stopType: r.stop_type,
        countryCode: toCountryCode(r.country, r.country_code),
        lat: Number(r.lat),
        lng: Number(r.lng),
        hasVeterinarian: Boolean(r.has_veterinarian),
        hasStalls: Boolean(r.has_stalls),
      })),
    };
  }

  /** journey.rules (system_setting) để đồng bộ giới hạn giờ lái với ETA báo giá */
  async getJourneyRules(): Promise<{ maxDriveHoursBeforeRest?: number } | null> {
    try {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        "SELECT value_json FROM system_setting WHERE setting_key = 'journey.rules' LIMIT 1",
      );
      if (!rows.length) return null;
      const raw = rows[0].value_json;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
}
