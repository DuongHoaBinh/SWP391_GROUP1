import { UserProfile } from './types';

const TOKEN_KEY = 'equitransit_token';
const USER_KEY = 'equitransit_user';

export const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.';

const UNAUTHENTICATED_USER: UserProfile = {
  id: '',
  name: '',
  fullName: '',
  email: '',
  phone: '',
  address: '',
  role: '' as UserProfile['role'],
  organization: '',
  avatarUrl: '',
  initials: '',
};

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthenticatedUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || (!parsed.id && !parsed.email)) {
      return null;
    }
    const name = parsed.fullName || parsed.name || (parsed.email ? String(parsed.email).split('@')[0] : '');

    // Compute initials from name
    let initials = '';
    if (name) {
      const parts = String(name).trim().split(/\s+/);
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      } else if (parts.length === 1 && parts[0].length >= 1) {
        initials = parts[0].slice(0, 2).toUpperCase();
      }
    }

    const specialization = parsed.specialization || (parsed.email && String(parsed.email).includes('escort') ? 'escort' : null);
    const persona = parsed.persona || (specialization === 'escort' || (parsed.email && String(parsed.email).includes('escort')) ? 'escort' : 'driver');

    return {
      id: parsed.id || '',
      name,
      fullName: parsed.fullName || parsed.name || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      address: parsed.address || '',
      role: (parsed.role || '') as UserProfile['role'],
      organization: parsed.organization || '',
      avatarUrl: parsed.avatarUrl || '',
      initials,
      authProvider: parsed.authProvider === 'google' ? 'google' : parsed.authProvider === 'local' ? 'local' : undefined,
      hasPassword: typeof parsed.hasPassword === 'boolean' ? parsed.hasPassword : undefined,
      persona,
      specialization,
    };
  } catch {
    return null;
  }
}

export function getCurrentUser(): UserProfile {
  return getAuthenticatedUser() ?? UNAUTHENTICATED_USER;
}

export function updateAuthUser(updates: Partial<UserProfile>) {
  if (typeof window === 'undefined') return;
  const current = getAuthenticatedUser();
  if (!current) return;
  const merged = { ...current, ...updates };
  localStorage.setItem(USER_KEY, JSON.stringify(merged));
  window.dispatchEvent(new Event('auth-user-updated'));
}

export function setAuthSession(token: string, user: Partial<UserProfile>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Sync with document.cookie for Next.js middleware and SSR protection
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  document.cookie = `equitransit_role=${encodeURIComponent(user.role || 'CUSTOMER')}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  let userId: string | undefined;
  try {
    const rawUser = localStorage.getItem(USER_KEY);
    if (rawUser) userId = JSON.parse(rawUser)?.id;
  } catch {}

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('equitransit_cust_docs_list_v1');
  localStorage.removeItem('equitransit_docs_v1');

  // Clear any user-scoped & legacy operational caches so next login starts clean
  const prefixes = [
    'equitransit_store_',
    'equitransit_spec_',
    'equitransit_fleet_',
  ];
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) {
        keysToRemove.push(k);
      }
    }
    if (userId) {
      keysToRemove.push(`equitransit_user_${userId}`);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  // Clear cookies
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `equitransit_role=; path=/; max-age=0; SameSite=Lax`;
}

export function logout() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('equitransit_manual_logout', '1');
  } catch {}
  clearAuthSession();
  window.location.replace('/login');
}
