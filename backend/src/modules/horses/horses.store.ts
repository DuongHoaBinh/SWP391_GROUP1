import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { HorseEntity, HorseStatus, HorseTemperament } from './horses.types';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { MYSQL_POOL } from '../../common/database/database.module';

interface HorseRow extends RowDataPacket {
  horse_id: number;
  owner_id: number;
  name: string;
  breed: string | null;
  age: number | null;
  microchip_no: string | null;
  passport_no: string | null;
  color: string | null;
  weight: string | null;
  medical_status: string | null;
  special_requirements: string | null;
  requires_private_stall: number | boolean | null;
  temperament: HorseTemperament | null;
  photo_url: string | null;
  status: HorseStatus;
  quantity: number;
  created_at: Date;
}

@Injectable()
export class HorsesStore implements OnModuleInit, OnModuleDestroy {
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

  async findByOwnerId(ownerId: number): Promise<HorseEntity[]> {
    const [rows] = await this.pool.execute<HorseRow[]>(
      `SELECT horse_id, owner_id, name, breed, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, requires_private_stall, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE owner_id = ? AND (status IS NULL OR status NOT IN ('retired', 'deleted'))
       ORDER BY horse_id DESC`,
      [ownerId],
    );

    return rows.map((row) => this.mapHorseRow(row));
  }

  async findById(horseId: number): Promise<HorseEntity | undefined> {
    const [rows] = await this.pool.execute<HorseRow[]>(
      `SELECT horse_id, owner_id, name, breed, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, requires_private_stall, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE horse_id = ?
       LIMIT 1`,
      [horseId],
    );

    const row = rows[0];
    return row ? this.mapHorseRow(row) : undefined;
  }

  async create(ownerId: number, dto: CreateHorseDto): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO horse (owner_id, name, breed, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, requires_private_stall, temperament, photo_url, status, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        dto.name,
        dto.breed ?? null,
        dto.age ?? null,
        dto.microchipNo ?? null,
        dto.passportNo ?? null,
        dto.color ?? null,
        dto.weight ?? null,
        dto.medicalStatus ?? null,
        dto.specialRequirements ?? null,
        dto.requiresPrivateStall ?? false,
        dto.temperament ?? HorseTemperament.NORMAL,
        dto.photoUrl ?? null,
        dto.status ?? HorseStatus.ACTIVE,
        dto.quantity ?? 1,
      ],
    );

    return (result as { insertId: number }).insertId;
  }

  async update(horseId: number, dto: UpdateHorseDto): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE horse
       SET
         name = COALESCE(?, name),
         breed = COALESCE(?, breed),
         age = COALESCE(?, age),
         microchip_no = COALESCE(?, microchip_no),
         passport_no = COALESCE(?, passport_no),
         color = COALESCE(?, color),
         weight = COALESCE(?, weight),
         medical_status = COALESCE(?, medical_status),
         special_requirements = COALESCE(?, special_requirements),
         requires_private_stall = COALESCE(?, requires_private_stall),
         temperament = COALESCE(?, temperament),
         photo_url = COALESCE(?, photo_url),
         status = COALESCE(?, status),
         quantity = COALESCE(?, quantity)
       WHERE horse_id = ?`,
      [
        dto.name ?? null,
        dto.breed ?? null,
        dto.age ?? null,
        dto.microchipNo ?? null,
        dto.passportNo ?? null,
        dto.color ?? null,
        dto.weight ?? null,
        dto.medicalStatus ?? null,
        dto.specialRequirements ?? null,
        dto.requiresPrivateStall ?? null,
        dto.temperament ?? null,
        dto.photoUrl ?? null,
        dto.status ?? null,
        dto.quantity !== undefined ? dto.quantity : null,
        horseId,
      ],
    );

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async isHorseInShipments(horseId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM shipment_horse WHERE horse_id = ? LIMIT 1',
      [horseId],
    );
    return rows.length > 0;
  }

  async delete(horseId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      'DELETE FROM horse WHERE horse_id = ?',
      [horseId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async softDelete(horseId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      "UPDATE horse SET status = 'retired' WHERE horse_id = ?",
      [horseId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  private mapHorseRow(row: HorseRow): HorseEntity {
    return {
      id: row.horse_id,
      ownerId: row.owner_id,
      name: row.name,
      breed: row.breed,
      age: row.age !== null ? Number(row.age) : null,
      microchipNo: row.microchip_no,
      passportNo: row.passport_no,
      color: row.color ?? null,
      weight: row.weight ?? null,
      medicalStatus: row.medical_status ?? null,
      specialRequirements: row.special_requirements ?? null,
      requiresPrivateStall: Boolean(row.requires_private_stall),
      temperament: row.temperament ?? HorseTemperament.NORMAL,
      photoUrl: row.photo_url ?? null,
      status: row.status,
      quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : 1,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
