import { ConflictException } from '@nestjs/common';

const ICT_OFFSET_MS = 7 * 3600 * 1000;
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const FOUR_HOURS_MS = 4 * 3600 * 1000;
const TEN_HOURS_MS = 10 * 3600 * 1000;
const TWELVE_HOURS_MS = 12 * 3600 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 3600 * 1000;
const THIRTY_HOURS_MS = 30 * 3600 * 1000;
const FIFTY_TWO_HOURS_MS = 52 * 3600 * 1000;

/**
 * Add `hours` of daytime business hours (08:00-18:00 ICT, UTC+7) to `start`.
 */
function addBusinessHoursIct(start: Date, hours: number): Date {
  let remainingMs = Math.round(hours * 3600 * 1000);
  let cursorUtcMs = start.getTime();

  for (let guard = 0; guard < 14 && remainingMs > 0; guard++) {
    const ict = new Date(cursorUtcMs + ICT_OFFSET_MS);
    const y = ict.getUTCFullYear();
    const m = ict.getUTCMonth();
    const d = ict.getUTCDate();

    const dayStartUtcMs = Date.UTC(y, m, d, BUSINESS_START_HOUR, 0, 0, 0) - ICT_OFFSET_MS;
    const dayEndUtcMs = Date.UTC(y, m, d, BUSINESS_END_HOUR, 0, 0, 0) - ICT_OFFSET_MS;

    if (cursorUtcMs < dayStartUtcMs) {
      cursorUtcMs = dayStartUtcMs;
    } else if (cursorUtcMs >= dayEndUtcMs) {
      const nextDayStartUtcMs = Date.UTC(y, m, d + 1, BUSINESS_START_HOUR, 0, 0, 0) - ICT_OFFSET_MS;
      cursorUtcMs = nextDayStartUtcMs;
      continue;
    }

    const availableTodayMs = dayEndUtcMs - cursorUtcMs;
    if (remainingMs <= availableTodayMs) {
      return new Date(cursorUtcMs + remainingMs);
    }

    remainingMs -= availableTodayMs;
    cursorUtcMs = Date.UTC(y, m, d + 1, BUSINESS_START_HOUR, 0, 0, 0) - ICT_OFFSET_MS;
  }

  return new Date(cursorUtcMs + remainingMs);
}

/**
 * DEC-05 / BR-F3-05: Primary Driver/Escort SLA is 4 business hours (08:00-18:00 ICT)
 * capped at a maximum of 12 continuous wall-clock hours.
 */
export function computeDriverPrimarySlaDueAt(assignedAt: Date = new Date()): Date {
  const bizDue = addBusinessHoursIct(assignedAt, 4).getTime();
  const maxWallDue = assignedAt.getTime() + TWELVE_HOURS_MS;
  return new Date(Math.min(bizDue, maxWallDue));
}

/**
 * DEC-05 / BR-F3-05: Backup Pool SLA is a strict 4 continuous clock hours.
 */
export function computeBackupPoolSlaDueAt(assignedAt: Date = new Date()): Date {
  return new Date(assignedAt.getTime() + FOUR_HOURS_MS);
}

/**
 * DEC-05 / BR-F3-05: Hard cap for final invoice issuance is T - 52 hours before departure.
 */
export function computeInvoiceHardCapAt(departureAt: Date | string | null | undefined): Date | null {
  if (!departureAt) return null;
  const depMs = new Date(departureAt).getTime();
  if (!Number.isFinite(depMs)) return null;
  return new Date(depMs - FIFTY_TWO_HOURS_MS);
}

/**
 * DEC-05 / BR-F3-07: Payment window is MIN(invoice_issued_at + 24h, departure_at - 30h).
 */
export function computePaymentDueAt(
  issuedAt: Date = new Date(),
  departureAt?: Date | string | null,
): Date {
  const plus24h = issuedAt.getTime() + TWENTY_FOUR_HOURS_MS;
  if (!departureAt) return new Date(plus24h);
  const depMs = new Date(departureAt).getTime();
  if (!Number.isFinite(depMs)) return new Date(plus24h);
  const tMinus30h = depMs - THIRTY_HOURS_MS;
  return new Date(Math.min(plus24h, tMinus30h));
}

/**
 * DEC-05 / BR-F3-07: Single 1x payment grace extension is MIN(granted_at + 10h, departure_at - 24h).
 * Throws 409 Conflict if granted_at is already at or past T - 24h hard cap.
 */
export function computeGraceDueAt(
  grantedAt: Date = new Date(),
  departureAt?: Date | string | null,
): Date {
  const plus10h = grantedAt.getTime() + TEN_HOURS_MS;
  if (!departureAt) return new Date(plus10h);
  const depMs = new Date(departureAt).getTime();
  if (!Number.isFinite(depMs)) return new Date(plus10h);

  const hardCapTMinus24h = depMs - TWENTY_FOUR_HOURS_MS;
  if (grantedAt.getTime() >= hardCapTMinus24h) {
    throw new ConflictException(
      'Đã vượt quá trần cứng T - 24 giờ trước khởi hành, không thể gia hạn thanh toán thêm.',
    );
  }
  return new Date(Math.min(plus10h, hardCapTMinus24h));
}
