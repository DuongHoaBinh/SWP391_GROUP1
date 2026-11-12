import type { UserProfile, UserRole } from './types';

const roles = new Set(['CUSTOMER', 'LOGISTICS_MANAGER', 'TRANSPORT_SPECIALIST', 'FLEET_ROUTE_COORDINATOR', 'DRIVER_ESCORT', 'ADMIN']);

export interface LoginSession {
  accessToken: string;
  user: Partial<UserProfile> & { id: string; email: string; role: UserRole; name: string };
}

export async function loginWithPassword(apiUrl: string, email: string, password: string): Promise<LoginSession> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ đăng nhập. Hãy kiểm tra Backend rồi thử lại.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message : Array.isArray(data?.message) ? data.message.filter((value: unknown) => typeof value === 'string').join(', ') : '';
    if (response.status === 401 || /^invalid email or password\.?$/i.test(detail.trim())) {
      throw new Error('Email hoặc mật khẩu không đúng.');
    }
    throw new Error(detail || (response.status === 401 || response.status === 400
      ? 'Email hoặc mật khẩu không đúng.' : 'Máy chủ đăng nhập gặp lỗi. Vui lòng thử lại.'));
  }
  const user = data?.user;
  const rawRole = typeof user?.role === 'string' ? user.role.trim().toUpperCase() : '';
  const role = rawRole === 'COORDINATOR' ? 'FLEET_ROUTE_COORDINATOR' : rawRole === 'DRIVER' ? 'DRIVER_ESCORT' : rawRole;
  if (typeof data?.accessToken !== 'string' || !data.accessToken.trim() || !user ||
    !['string', 'number'].includes(typeof user.id) || !String(user.id).trim() ||
    typeof user.email !== 'string' || !user.email.trim() || !roles.has(role)) {
    throw new Error('Phản hồi đăng nhập không hợp lệ. Vui lòng kiểm tra Backend rồi thử lại.');
  }
  return { accessToken: data.accessToken.trim(), user: { ...user, id: String(user.id), role: role as UserRole,
    name: user.fullName || user.name || user.email.split('@')[0] } };
}
