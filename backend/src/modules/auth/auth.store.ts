import { ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { AuthUser, PendingRegistration, UserRole } from './auth.types';

import { UpdateProfileDto } from './dto/update-profile.dto';

interface SeedAccount {
  email: string;
  password: string;
  role: UserRole;
}

interface UserRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  password_hash: string;
  plain_password?: string | null;
  role_name: string;
  email_verified: number;
  created_at: Date;
  specialization?: string | null;
}

interface PendingRow extends RowDataPacket {
  otp_id: number;
  email: string;
  password_hash: string;
  plain_password?: string | null;
  otp_code: string;
  expires_at: Date;
  created_at: Date;
}

@Injectable()
export class AuthStore implements OnModuleInit, OnModuleDestroy {
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
    await this.pool.query('SELECT 1');

    const rawAccounts = process.env.AUTH_INTERNAL_USERS_JSON;
    if (!rawAccounts) {
      return;
    }

    try {
      const accounts = JSON.parse(rawAccounts) as SeedAccount[];
      for (const account of accounts) {
        if (!account.email || !account.password || account.role === UserRole.CUSTOMER) {
          continue;
        }
        await this.addUser(account.email, account.password, account.role);
      }
    } catch {
      throw new Error('AUTH_INTERNAL_USERS_JSON must contain a valid account array');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async addUser(email: string, password: string, role: UserRole): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    if (await this.findUser(normalizedEmail)) {
      throw new ConflictException('An account with this email already exists');
    }

    const [roleRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT role_id FROM `role` WHERE role_name = ? LIMIT 1',
      [this.roleName(role)],
    );
    if (!roleRows[0]) {
      throw new Error(`Role ${role} is not seeded in the database`);
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await this.pool.execute(
      'INSERT INTO `user` (role_id, full_name, email, password_hash, plain_password, account_origin, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [roleRows[0].role_id, normalizedEmail, normalizedEmail, passwordHash, password, 'system_created', true],
    );
    return {
      id: String((result as { insertId: number }).insertId),
      email: normalizedEmail,
      passwordHash,
      plainPassword: password,
      role,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };
  }

  async addUserFromRecord(user: AuthUser): Promise<string> {
    if (await this.findUser(user.email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const [roleRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT role_id FROM `role` WHERE role_name = ? LIMIT 1',
      [this.roleName(user.role)],
    );
    if (!roleRows[0]) {
      throw new Error(`Role ${user.role} is not seeded in the database`);
    }
    const [result] = await this.pool.execute(
      'INSERT INTO `user` (role_id, full_name, email, password_hash, plain_password, account_origin, auth_provider, email_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [roleRows[0].role_id, user.email, user.email, user.passwordHash, user.plainPassword ?? null, 'self_registered', 'local', true, 'active'],
    );
    return String((result as { insertId: number }).insertId);
  }

  async findUser(email: string): Promise<AuthUser | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT u.user_id, u.full_name, u.email, u.phone, u.address, u.avatar_url, u.password_hash, u.plain_password, u.email_verified, u.created_at, u.specialization, r.role_name FROM `user` u JOIN `role` r ON r.role_id = u.role_id WHERE u.email = ? LIMIT 1',
      [email.trim().toLowerCase()],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: String(row.user_id),
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      address: row.address,
      avatarUrl: row.avatar_url,
      passwordHash: row.password_hash,
      plainPassword: row.plain_password ?? null,
      role: this.userRole(row.role_name),
      emailVerified: Boolean(row.email_verified),
      specialization: row.specialization ?? null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async findUserById(userId: string | number): Promise<AuthUser | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT u.user_id, u.full_name, u.email, u.phone, u.address, u.avatar_url, u.password_hash, u.plain_password, u.email_verified, u.created_at, u.specialization, r.role_name FROM `user` u JOIN `role` r ON r.role_id = u.role_id WHERE u.user_id = ? LIMIT 1',
      [Number(userId)],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: String(row.user_id),
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      address: row.address,
      avatarUrl: row.avatar_url,
      passwordHash: row.password_hash,
      plainPassword: row.plain_password ?? null,
      role: this.userRole(row.role_name),
      emailVerified: Boolean(row.email_verified),
      specialization: row.specialization ?? null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async updateUserProfile(userId: string | number, dto: UpdateProfileDto): Promise<AuthUser | undefined> {
    const fields: string[] = [];
    const values: (string | null | number)[] = [];

    if (dto.fullName !== undefined) {
      fields.push('full_name = ?');
      values.push(dto.fullName.trim());
    }
    if (dto.phone !== undefined) {
      fields.push('phone = ?');
      values.push(dto.phone.trim() || null);
    }
    if (dto.address !== undefined) {
      fields.push('address = ?');
      values.push(dto.address.trim() || null);
    }
    if (dto.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(dto.avatarUrl.trim() || null);
    }

    if (fields.length > 0) {
      values.push(Number(userId));
      await this.pool.execute(
        `UPDATE \`user\` SET ${fields.join(', ')} WHERE user_id = ?`,
        values,
      );
    }

    return this.findUserById(userId);
  }

  async updateUserPassword(userId: string | number, passwordHash: string, plainPassword?: string): Promise<void> {
    await this.pool.execute(
      'UPDATE `user` SET password_hash = ?, plain_password = COALESCE(?, plain_password) WHERE user_id = ?',
      [passwordHash, plainPassword ?? null, Number(userId)],
    );
  }

  async findPending(email: string): Promise<PendingRegistration | undefined> {
    const [rows] = await this.pool.execute<PendingRow[]>(
      'SELECT otp_id, email, password_hash, plain_password, otp_code, expires_at, created_at FROM otp_verification WHERE email = ? AND purpose = ? AND is_used = FALSE ORDER BY created_at DESC LIMIT 1',
      [email.trim().toLowerCase(), 'register'],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      otpId: row.otp_id,
      email: row.email,
      passwordHash: row.password_hash,
      plainPassword: row.plain_password ?? null,
      otp: row.otp_code,
      expiresAt: new Date(row.expires_at).getTime(),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async savePending(registration: PendingRegistration): Promise<void> {
    await this.pool.execute(
      'UPDATE otp_verification SET is_used = TRUE WHERE email = ? AND purpose = ? AND is_used = FALSE',
      [registration.email, 'register'],
    );
    await this.pool.execute(
      'INSERT INTO otp_verification (email, password_hash, plain_password, otp_code, purpose, is_used, expires_at) VALUES (?, ?, ?, ?, ?, FALSE, ?)',
      [registration.email, registration.passwordHash, registration.plainPassword ?? null, registration.otp, 'register', new Date(registration.expiresAt)],
    );
  }

  async deletePending(email: string): Promise<void> {
    await this.pool.execute(
      'UPDATE otp_verification SET is_used = TRUE WHERE email = ? AND purpose = ? AND is_used = FALSE',
      [email.trim().toLowerCase(), 'register'],
    );
  }

  async completePending(email: string, userId: string): Promise<void> {
    await this.pool.execute(
      'UPDATE otp_verification SET is_used = TRUE, user_id = ? WHERE email = ? AND purpose = ? AND is_used = FALSE',
      [userId, email.trim().toLowerCase(), 'register'],
    );
  }

  async findOrCreateGoogleUser(info: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<AuthUser> {
    const email = info.email.trim().toLowerCase();
    const existing = await this.findUser(email);
    if (existing) {
      await this.pool.execute(
        'UPDATE `user` SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(avatar_url, ?), email_verified = 1 WHERE user_id = ?',
        [info.googleId, info.picture ?? null, Number(existing.id)],
      );
      return (await this.findUser(email)) ?? existing;
    }

    const [roleRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT role_id FROM `role` WHERE role_name = ? LIMIT 1',
      ['Customer'],
    );
    const roleId = roleRows[0]?.role_id ?? 6;
    const dummyPasswordHash = await bcrypt.hash(`google-oauth-${info.googleId}-${Date.now()}`, 10);

    const [result] = await this.pool.execute(
      'INSERT INTO `user` (role_id, full_name, email, password_hash, plain_password, account_origin, auth_provider, google_id, avatar_url, email_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        roleId,
        info.name || email.split('@')[0],
        email,
        dummyPasswordHash,
        'Google OAuth (Không dùng mật khẩu)',
        'self_registered',
        'google',
        info.googleId,
        info.picture ?? null,
        1,
        'active',
      ],
    );

    const insertedId = String((result as { insertId: number }).insertId);
    const created = await this.findUserById(insertedId);
    if (!created) {
      throw new Error('Failed to retrieve newly created Google user');
    }
    return created;
  }

  private roleName(role: UserRole): string {
    const names: Record<UserRole, string> = {
      [UserRole.CUSTOMER]: 'Customer',
      [UserRole.ADMIN]: 'Admin',
      [UserRole.LOGISTICS_MANAGER]: 'Logistics Manager',
      [UserRole.TRANSPORT_SPECIALIST]: 'Transport Specialist',
      [UserRole.FLEET_ROUTE_COORDINATOR]: 'Fleet & Route Coordinator',
      [UserRole.DRIVER_ESCORT]: 'Vehicle Driver / Escort',
    };
    return names[role];
  }

  private userRole(roleName: string): UserRole {
    const roles: Record<string, UserRole> = {
      Admin: UserRole.ADMIN,
      'Logistics Manager': UserRole.LOGISTICS_MANAGER,
      'Transport Specialist': UserRole.TRANSPORT_SPECIALIST,
      'Fleet & Route Coordinator': UserRole.FLEET_ROUTE_COORDINATOR,
      'Vehicle Driver / Escort': UserRole.DRIVER_ESCORT,
      Customer: UserRole.CUSTOMER,
    };
    return roles[roleName] ?? UserRole.CUSTOMER;
  }
}
