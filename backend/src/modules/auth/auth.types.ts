export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  LOGISTICS_MANAGER = 'LOGISTICS_MANAGER',
  /** @deprecated Gộp vào LOGISTICS_MANAGER sau review 11/2026. Chỉ giữ để đọc token/dữ liệu cũ. */
  TRANSPORT_SPECIALIST = 'TRANSPORT_SPECIALIST',
  /** @deprecated Gộp vào LOGISTICS_MANAGER sau review 11/2026. Chỉ giữ để đọc token/dữ liệu cũ. */
  FLEET_ROUTE_COORDINATOR = 'FLEET_ROUTE_COORDINATOR',
  DRIVER_ESCORT = 'DRIVER_ESCORT',
}

const ROLES_MERGED_INTO_MANAGER = new Set<string>([
  UserRole.TRANSPORT_SPECIALIST,
  UserRole.FLEET_ROUTE_COORDINATOR,
  'COORDINATOR',
  'Transport Specialist',
  'Fleet & Route Coordinator',
]);

/**
 * Specialist và Coordinator đã gộp thành một vai trò vận hành duy nhất (Logistics Manager).
 * Mọi role cũ đọc từ JWT hoặc DB đều được quy về LOGISTICS_MANAGER để phân quyền server-side nhất quán.
 */
export function normalizeUserRole(role: string): string {
  return ROLES_MERGED_INTO_MANAGER.has(role) ? UserRole.LOGISTICS_MANAGER : role;
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
