import { clearAuthSession, getAuthToken, SESSION_EXPIRED_MESSAGE } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
let redirectingToLogin = false;

export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export async function fetchAuthenticatedDocumentBlobUrl(
  documentId: number | string | undefined,
  fallbackUrl?: string | null,
): Promise<string | null> {
  const numericId =
    typeof documentId === 'number'
      ? documentId
      : typeof documentId === 'string' && /^\d+$/.test(documentId.trim())
        ? Number(documentId.trim())
        : typeof documentId === 'string' && /^DOC-(\d+)$/i.test(documentId.trim())
          ? Number(documentId.trim().match(/^DOC-(\d+)$/i)![1])
          : NaN;

  if (Number.isFinite(numericId) && numericId > 0) {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/documents/${numericId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  }

  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl.trim())) {
    return fallbackUrl.trim();
  }
  return null;
}

export async function openAuthenticatedDocument(
  documentId: number | string | undefined,
  fallbackUrl?: string | null,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const url = await fetchAuthenticatedDocumentBlobUrl(documentId, fallbackUrl);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  if (url.startsWith('blob:') && typeof setTimeout === 'function') {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
}

export async function fetchAuthenticatedApiBlobUrl(
  fileUrl?: string | null,
): Promise<string | null> {
  if (!fileUrl) return null;
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  if (trimmed.startsWith('/api/')) {
    const token = getAuthToken();
    const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const res = await fetch(`${baseUrl}${trimmed}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return resolveAssetUrl(trimmed) ?? null;
}

export async function fetchAuthenticatedHealthImageBlobUrl(
  fileUrl?: string | null,
): Promise<string | null> {
  return fetchAuthenticatedApiBlobUrl(fileUrl);
}

export async function openAuthenticatedApiFile(fileUrl?: string | null): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const url = await fetchAuthenticatedApiBlobUrl(fileUrl);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  if (url.startsWith('blob:') && typeof setTimeout === 'function') {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
}

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
    const isManualLogout = typeof window !== 'undefined' && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('equitransit_manual_logout') === '1';
    if (typeof window !== 'undefined' && !isManualLogout && !redirectingToLogin && getAuthToken() === token &&
        headers.get('Authorization') === (token ? `Bearer ${token}` : null) &&
        !/^\/(login|register|forgot-password)(\/|$)/.test(window.location.pathname)) {
      const returnPath = window.location.pathname + window.location.search + window.location.hash;
      clearAuthSession();
      redirectingToLogin = true;
      if (typeof setTimeout === 'function') {
        const timer = setTimeout(() => {
          redirectingToLogin = false;
        }, 3000);
        if (typeof timer === 'object' && timer && 'unref' in timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
          (timer as NodeJS.Timeout).unref();
        }
      }
      const query = new URLSearchParams({ reason: 'session-expired', redirect: returnPath });
      window.location.replace(`/login?${query.toString()}`);
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const rawMsg = errorData?.message;
    const formattedMsg = Array.isArray(rawMsg)
      ? rawMsg.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('. ')
      : typeof rawMsg === 'string'
        ? rawMsg
        : undefined;
    throw new ApiError(
      formattedMsg || `Request failed with status ${response.status}`,
      response.status,
      errorData,
    );
  }

  return response.json();
}

export class ApiError extends Error {
  readonly status: number;
  readonly data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
