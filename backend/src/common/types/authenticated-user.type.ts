import { UserRole } from '../../modules/auth/auth.types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
