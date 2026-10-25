export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  LOGISTICS_MANAGER = 'LOGISTICS_MANAGER',
  TRANSPORT_SPECIALIST = 'TRANSPORT_SPECIALIST',
  FLEET_ROUTE_COORDINATOR = 'FLEET_ROUTE_COORDINATOR',
  DRIVER_ESCORT = 'DRIVER_ESCORT',
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
  emailVerified: boolean;
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
