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
    const name = parsed.fullName || parsed.name || (parsed.email ? parsed.email.split('@')[0] : mockCurrentUser.name);
    
    // Compute initials from name
    let initials = 'CU';
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      } else if (parts.length === 1 && parts[0].length >= 1) {
        initials = parts[0].slice(0, 2).toUpperCase();
      }
    }

    return {
      id: parsed.id || mockCurrentUser.id,
      name,
      fullName: parsed.fullName || parsed.name || '',
      email: parsed.email || mockCurrentUser.email,
      phone: parsed.phone || '',
      address: parsed.address || '',
      role: parsed.role || 'CUSTOMER',
      organization: parsed.organization || 'Al Fares Stud',
      avatarUrl: parsed.avatarUrl || '',
      initials,
    };
  } catch {
    return mockCurrentUser;
  }
}

export function updateAuthUser(updates: Partial<UserProfile>) {
  if (typeof window === 'undefined') return;
  const current = getCurrentUser();
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('equitransit_cust_docs_list_v1');
  localStorage.removeItem('equitransit_docs_v1');

  // Clear cookies
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `equitransit_role=; path=/; max-age=0; SameSite=Lax`;
}
