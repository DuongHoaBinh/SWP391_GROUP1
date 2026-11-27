import { ConflictException, Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { HorseEntity, HorseGender, HorseStatus, HorseTemperament } from './horses.types';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { MYSQL_POOL } from '../../common/database/database.module';

interface HorseRow extends RowDataPacket {
  horse_id: number;
  owner_id: number;
  name: string;
  breed: string | null;
  gender: string | null;
  age: number | null;
  microchip_no: string | null;
  passport_no: string | null;
  color: string | null;
  weight: string | null;
  medical_status: string | null;
  special_requirements: string | null;
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
      `SELECT horse_id, owner_id, name, breed, gender, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE owner_id = ? AND (status IS NULL OR status NOT IN ('retired', 'deleted'))
       ORDER BY horse_id DESC`,
      [ownerId],
    );

    return rows.map((row) => this.mapHorseRow(row));
  }

  async findById(horseId: number): Promise<HorseEntity | undefined> {
    const [rows] = await this.pool.execute<HorseRow[]>(
      `SELECT horse_id, owner_id, name, breed, gender, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE horse_id = ?
       LIMIT 1`,
      [horseId],
    );

    const row = rows[0];
    return row ? this.mapHorseRow(row) : undefined;
  }

  async findByMicrochipNo(microchipNo: string): Promise<HorseEntity | undefined> {
    const [rows] = await this.pool.execute<HorseRow[]>(
      `SELECT horse_id, owner_id, name, breed, gender, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE LOWER(TRIM(microchip_no)) = LOWER(TRIM(?))
       LIMIT 1`,
      [microchipNo],
    );
    const row = rows[0];
    return row ? this.mapHorseRow(row) : undefined;
  }

  async findByPassportNo(passportNo: string): Promise<HorseEntity | undefined> {
    const [rows] = await this.pool.execute<HorseRow[]>(
      `SELECT horse_id, owner_id, name, breed, gender, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, temperament, photo_url, status, quantity, created_at
       FROM horse
       WHERE LOWER(TRIM(passport_no)) = LOWER(TRIM(?))
       LIMIT 1`,
      [passportNo],
    );
    const row = rows[0];
    return row ? this.mapHorseRow(row) : undefined;
  }

  async isHorseAssignedToDriver(horseId: number, driverUserId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1
       FROM shipment_horse sh
       JOIN shipment_assignment sa ON sa.shipment_id = sh.shipment_id
       WHERE sh.horse_id = ? AND sa.user_id = ?
       LIMIT 1`,
      [horseId, driverUserId],
    );
    return rows.length > 0;
  }

  private handleDuplicateError(err: any, dto: { microchipNo?: string; passportNo?: string }): never {
    if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      const msg = String(err?.sqlMessage || err?.message || '').toLowerCase();
      if (msg.includes('passport_no')) {
        throw new ConflictException(
          `Số hộ chiếu FEI "${dto.passportNo?.trim() || ''}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`,
        );
      }
      if (msg.includes('microchip_no')) {
        throw new ConflictException(
          `Mã Microchip "${dto.microchipNo?.trim() || ''}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`,
        );
      }
      throw new ConflictException('Mã Microchip hoặc Số hộ chiếu FEI đã tồn tại trong hệ thống.');
    }
    throw err;
  }

  async create(ownerId: number, dto: CreateHorseDto): Promise<number> {
    try {
      const [result] = await this.pool.execute(
        `INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no, color, weight, medical_status, special_requirements, temperament, photo_url, status, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ownerId,
          dto.name,
          dto.breed ?? null,
          dto.gender ?? null,
          dto.age ?? null,
          dto.microchipNo ?? null,
          dto.passportNo ?? null,
          dto.color ?? null,
          dto.weight ?? null,
          dto.medicalStatus ?? null,
          dto.specialRequirements ?? null,
          dto.temperament ?? HorseTemperament.NORMAL,
          dto.photoUrl ?? null,
          dto.status ?? HorseStatus.ACTIVE,
          dto.quantity ?? 1,
        ],
      );

      return (result as { insertId: number }).insertId;
    } catch (err) {
      this.handleDuplicateError(err, dto);
    }
  }

  async update(horseId: number, dto: UpdateHorseDto): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        `UPDATE horse
         SET
           name = COALESCE(?, name),
           breed = COALESCE(?, breed),
           gender = COALESCE(?, gender),
           age = COALESCE(?, age),
           microchip_no = COALESCE(?, microchip_no),
           passport_no = COALESCE(?, passport_no),
           color = COALESCE(?, color),
           weight = COALESCE(?, weight),
           medical_status = COALESCE(?, medical_status),
           special_requirements = COALESCE(?, special_requirements),
           temperament = COALESCE(?, temperament),
           photo_url = COALESCE(?, photo_url),
           status = COALESCE(?, status),
           quantity = COALESCE(?, quantity)
         WHERE horse_id = ?`,
        [
          dto.name ?? null,
          dto.breed ?? null,
          dto.gender ?? null,
          dto.age ?? null,
          dto.microchipNo ?? null,
          dto.passportNo ?? null,
          dto.color ?? null,
          dto.weight ?? null,
          dto.medicalStatus ?? null,
          dto.specialRequirements ?? null,
          dto.temperament ?? null,
          dto.photoUrl ?? null,
          dto.status ?? null,
          dto.quantity !== undefined ? dto.quantity : null,
          horseId,
        ],
      );

      return (result as { affectedRows: number }).affectedRows > 0;
    } catch (err) {
      this.handleDuplicateError(err, dto);
    }
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
    const rawGender = row.gender ? String(row.gender).toLowerCase() : null;
    const normalizedGender: HorseGender | null =
      rawGender === 'male'
        ? HorseGender.MALE
        : rawGender === 'female'
          ? HorseGender.FEMALE
          : rawGender === 'gelding'
            ? HorseGender.GELDING
            : rawGender === 'other'
              ? HorseGender.OTHER
              : null;

    return {
      id: row.horse_id,
      ownerId: row.owner_id,
      name: row.name,
      breed: row.breed,
      gender: normalizedGender,
      age: row.age !== null ? Number(row.age) : null,
      microchipNo: row.microchip_no,
      passportNo: row.passport_no,
      color: row.color ?? null,
      weight: row.weight ?? null,
      medicalStatus: row.medical_status ?? null,
      specialRequirements: row.special_requirements ?? null,
      temperament: row.temperament ?? HorseTemperament.NORMAL,
      photoUrl: row.photo_url ?? null,
      status: row.status,
      quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : 1,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
