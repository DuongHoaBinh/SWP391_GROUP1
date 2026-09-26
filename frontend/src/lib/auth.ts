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
    return {
      id: parsed.id || mockCurrentUser.id,
      name: parsed.name || (parsed.email ? parsed.email.split('@')[0] : mockCurrentUser.name),
      email: parsed.email || mockCurrentUser.email,
      role: parsed.role || 'CUSTOMER',
      organization: parsed.organization || 'Al Fares Stud',
      initials: (parsed.name ? parsed.name.slice(0, 2) : 'JD').toUpperCase(),
    };
  } catch {
    return mockCurrentUser;
  }
}

export function setAuthSession(token: string, user: Partial<UserProfile>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
