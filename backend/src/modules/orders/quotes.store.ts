import { Injectable, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, RowDataPacket, createPool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import { parseJsonField } from './pricing.store';

export interface ShipmentQuoteRecord {
  quoteId: number;
  customerId: number;
  transportMode: 'road' | 'air' | 'sea';
  seaMode: 'ferry' | 'vessel' | null;
  tripType: 'one_way' | 'round_trip';
  inputJson: any;
  resultJson: any;
  tariffVersionsJson: any;
  freightTotal: number;
  insuranceTotal: number;
  total: number;
  status: 'active' | 'used' | 'expired';
  expiresAt: string;
  usedByShipmentId: number | null;
  createdAt: string;
}

export interface HorseCheckRecord {
  horseId: number;
  ownerId: number;
  name: string;
  status: string;
  requiresPrivateStall: boolean;
  quantity: number;
}

@Injectable()
export class QuotesStore implements OnModuleInit, OnModuleDestroy {
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

  private mapQuoteRow(row: RowDataPacket): ShipmentQuoteRecord {
    return {
      quoteId: Number(row.quote_id),
      customerId: Number(row.customer_id),
      transportMode: row.transport_mode,
      seaMode: row.sea_mode ?? null,
      tripType: row.trip_type ?? 'one_way',
      inputJson: parseJsonField(row.input_json),
      resultJson: parseJsonField(row.result_json),
      tariffVersionsJson: parseJsonField(row.tariff_versions_json),
      freightTotal: Number(row.freight_total),
      insuranceTotal: Number(row.insurance_total),
      total: Number(row.total),
      status: row.status,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '',
      usedByShipmentId: row.used_by_shipment_id != null ? Number(row.used_by_shipment_id) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    };
  }

  /**
   * Tạo bản ghi báo giá mới vào shipment_quote.
   */
  async createQuote(data: {
    customerId: number;
    transportMode: 'road' | 'air' | 'sea';
    seaMode: 'ferry' | 'vessel' | null;
    tripType?: 'one_way' | 'round_trip';
    inputJson: any;
    resultJson: any;
    tariffVersionsJson: any;
    freightTotal: number;
    insuranceTotal: number;
    total: number;
    expiresAt: Date;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO shipment_quote
        (customer_id, transport_mode, sea_mode, trip_type, input_json, result_json, tariff_versions_json,
         freight_total, insurance_total, total, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        data.customerId,
        data.transportMode,
        data.seaMode,
        data.tripType ?? 'one_way',
        JSON.stringify(data.inputJson),
        JSON.stringify(data.resultJson),
        JSON.stringify(data.tariffVersionsJson),
        data.freightTotal,
        data.insuranceTotal,
        data.total,
        data.expiresAt,
      ],
    );
    return (result as any).insertId;
  }

  /**
   * Đọc chi tiết báo giá theo ID và cập nhật status = expired nếu quá hạn.
   */
  async findQuoteById(quoteId: number): Promise<ShipmentQuoteRecord | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM shipment_quote WHERE quote_id = ? LIMIT 1`,
      [quoteId],
    );
    if (!rows.length) return null;

    const record = this.mapQuoteRow(rows[0]);
    if (record.status === 'active' && new Date(record.expiresAt) < new Date()) {
      await this.pool.execute(
        `UPDATE shipment_quote SET status = 'expired' WHERE quote_id = ? AND status = 'active'`,
        [quoteId],
      );
      record.status = 'expired';
    }
    return record;
  }

  /**
   * Đọc thông tin ngựa và chủ sở hữu để kiểm tra quyền và chuồng riêng.
   */
  async findHorseById(horseId: number): Promise<HorseCheckRecord | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT horse_id, owner_id, name, status, requires_private_stall, quantity
       FROM horse
       WHERE horse_id = ? LIMIT 1`,
      [horseId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      horseId: Number(r.horse_id),
      ownerId: Number(r.owner_id),
      name: r.name,
      status: r.status,
      requiresPrivateStall: Boolean(r.requires_private_stall),
      quantity: Number(r.quantity || 1),
    };
  }
}
