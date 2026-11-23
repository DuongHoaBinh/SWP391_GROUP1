import { DocumentValidityStatus } from './documents.types';

/** Giấy tờ còn dưới số ngày này thì coi là sắp hết hạn (badge vàng). */
export const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnlyUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Trạng thái hạn của giấy tờ trên hồ sơ ngựa, tính tại thời điểm đọc (không lưu DB).
 * Ngày hết hạn vẫn còn hiệu lực trọn ngày đó.
 */
export function computeDocumentValidity(
  expiryDate: string | null | undefined,
  now: Date = new Date(),
): { validityStatus: DocumentValidityStatus; daysUntilExpiry: number | null } {
  const expiryMs = expiryDate ? parseDateOnlyUtc(expiryDate) : null;
  if (expiryMs === null) {
    return { validityStatus: 'no_expiry', daysUntilExpiry: null };
  }
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilExpiry = Math.round((expiryMs - todayMs) / DAY_MS);
  if (daysUntilExpiry < 0) return { validityStatus: 'expired', daysUntilExpiry };
  if (daysUntilExpiry < EXPIRING_SOON_DAYS) return { validityStatus: 'expiring_soon', daysUntilExpiry };
  return { validityStatus: 'valid', daysUntilExpiry };
}

/** Ngày hết hạn mặc định = ngày cấp + số ngày hiệu lực của loại giấy tờ (nếu khách không nhập). */
export function computeDefaultExpiryDate(
  issueDate: string | null | undefined,
  defaultValidityDays: number | null | undefined,
): string | null {
  if (!issueDate || !defaultValidityDays || defaultValidityDays <= 0) return null;
  const issueMs = parseDateOnlyUtc(issueDate);
  if (issueMs === null) return null;
  return new Date(issueMs + defaultValidityDays * DAY_MS).toISOString().slice(0, 10);
}

/** So sánh 2 ngày dạng YYYY-MM-DD; trả về true nếu hết hạn trước ngày cấp. */
export function isExpiryBeforeIssue(
  issueDate: string | null | undefined,
  expiryDate: string | null | undefined,
): boolean {
  const issueMs = issueDate ? parseDateOnlyUtc(issueDate) : null;
  const expiryMs = expiryDate ? parseDateOnlyUtc(expiryDate) : null;
  return issueMs !== null && expiryMs !== null && expiryMs < issueMs;
}
