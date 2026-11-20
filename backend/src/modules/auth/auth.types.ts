export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  LOGISTICS_MANAGER = 'LOGISTICS_MANAGER',
  TRANSPORT_SPECIALIST = 'TRANSPORT_SPECIALIST',
  FLEET_ROUTE_COORDINATOR = 'FLEET_ROUTE_COORDINATOR',
  DRIVER_ESCORT = 'DRIVER_ESCORT',
}

export const GOOGLE_OAUTH_NO_PASSWORD_MARKER = '!GOOGLE_OAUTH_NO_PASSWORD!';

export function hasLocalPasswordHash(passwordHash?: string | null): boolean {
  return Boolean(
    passwordHash &&
      passwordHash !== GOOGLE_OAUTH_NO_PASSWORD_MARKER &&
      passwordHash.startsWith('$2'),
  );
}

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  passwordHash: string;
  role: UserRole;
  authProvider?: 'local' | 'google';
  hasPassword?: boolean;
  emailVerified: boolean;
  status?: 'active' | 'inactive' | 'suspended';
  specialization?: string | null;
  createdAt: string;
}

export interface PendingRegistration {
  otpId: number;
  email: string;
  passwordHash: string;
  otp: string;
  expiresAt: number;
  createdAt: string;
}
