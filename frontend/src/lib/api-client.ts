import { clearAuthSession, getAuthToken, SESSION_EXPIRED_MESSAGE } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
let redirectingToLogin = false;

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Accept-Language')) {
    const currentLang = typeof window !== 'undefined' ? localStorage.getItem('equitransit_lang') || 'vi' : 'vi';
    headers.set('Accept-Language', currentLang);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined' && !redirectingToLogin && getAuthToken() === token &&
        headers.get('Authorization') === (token ? `Bearer ${token}` : null) &&
        !/^\/(login|register|forgot-password)(\/|$)/.test(window.location.pathname)) {
      const returnPath = window.location.pathname + window.location.search + window.location.hash;
      clearAuthSession();
      redirectingToLogin = true;
      const query = new URLSearchParams({ reason: 'session-expired', redirect: returnPath });
      window.location.replace(`/login?${query.toString()}`);
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}
