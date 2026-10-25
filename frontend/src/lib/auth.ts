import { mockCurrentUser } from './mock-data';
import { UserProfile } from './types';

const TOKEN_KEY = 'equitransit_token';
const USER_KEY = 'equitransit_user';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): UserProfile {
  if (typeof window === 'undefined') return mockCurrentUser;
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return mockCurrentUser;
  try {
    const parsed = JSON.parse(stored);
    const name = parsed.name || parsed.fullName || (parsed.email ? parsed.email.split('@')[0] : mockCurrentUser.name);
    return {
      id: parsed.id || mockCurrentUser.id,
      name,
      email: parsed.email || mockCurrentUser.email,
      role: parsed.role || 'CUSTOMER',
      organization: parsed.organization || 'Al Fares Stud',
      initials: name
        .split(/\s+/)
        .filter(Boolean)
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    };
  } catch {
    return mockCurrentUser;
  }
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  // Clear cookies
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `equitransit_role=; path=/; max-age=0; SameSite=Lax`;
}
