export function formatVND(amount?: number | string | null, locale: 'en' | 'vi' = 'vi'): string {
  const numeric = Number(amount ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `${safe.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ₫`;
}

export function formatCurrency(
  amount?: number | string | null,
  currency: 'VND' | 'USD' = 'VND',
  locale: 'en' | 'vi' = 'vi',
): string {
  const numeric = Number(amount ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(safe);
  }
  return formatVND(safe, locale);
}

export function formatDate(
  value?: string | Date | null,
  locale: 'en' | 'vi' = 'vi',
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(
  value?: string | Date | null,
  locale: 'en' | 'vi' = 'vi',
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}
