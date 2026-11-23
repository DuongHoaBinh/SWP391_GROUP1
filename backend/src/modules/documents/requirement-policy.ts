/**
 * Requirement Policy for Equine Transport Compliance (Step 8 - Review 11/2026)
 *
 * Implements pure evaluation functions for document requirements:
 * 1. Dynamic requirement status calculation across 6 distinct states:
 *    - 'missing': No document uploaded or document was rejected/draft.
 *    - 'issued_too_early': Issued earlier than departureAt - maxIssueAgeDays.
 *    - 'expired': Expiry date (end of day Asia/Ho_Chi_Minh) is earlier than tripEndAt + minValidityBufferHours.
 *    - 'pending_review': Uploaded/submitted, valid dates, awaiting Logistics Manager review.
 *    - 'expiring': Approved and valid for trip, but expires within 30 days after tripEndAt.
 *    - 'reusable': Approved and valid for the full trip + safety buffer.
 * 2. earliestFeasibleDeparture: Calculates earliest date departure can occur based only on missing/expired/issued_too_early docs.
 */

export type RequirementStatus =
  | 'reusable'
  | 'pending_review'
  | 'expiring'
  | 'expired'
  | 'issued_too_early'
  | 'missing';

export interface RequirementEvaluationInput {
  requirement: {
    regulationId: number;
    documentTypeCode: string;
    tier: 'A' | 'B';
    leadTimeDays: number;
    maxIssueAgeDays: number | null;
    minValidityBufferHours: number;
  };
  document: {
    id: number;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired';
    issueDate: string | null;
    expiryDate: string | null;
  } | null;
  departureAt: Date;
  tripEndAt: Date; // Expected arrival date; For round-trip, this is return leg arrival date
  now: Date;
}

export interface RequirementEvaluation {
  status: RequirementStatus;
  submitDeadline: string; // ISO date YYYY-MM-DD in Asia/Ho_Chi_Minh
  earliestIssueDate: string | null; // ISO date YYYY-MM-DD in Asia/Ho_Chi_Minh (if maxIssueAgeDays specified)
  canSubmitLater: boolean; // true if now < submitDeadline
  reasonVi: string;
  leadTimeDays?: number;
}

const ICT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 30;

/** Formats a Date object to YYYY-MM-DD string in Asia/Ho_Chi_Minh timezone */
export function formatDateIct(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ICT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Parses a YYYY-MM-DD string or Date into start of day timestamp in Asia/Ho_Chi_Minh */
export function parseStartOfDayIct(dateInput: string | Date): number {
  const dateStr = typeof dateInput === 'string' ? dateInput.trim().slice(0, 10) : formatDateIct(dateInput);
  return new Date(`${dateStr}T00:00:00.000+07:00`).getTime();
}

/** Parses a YYYY-MM-DD string into end of day timestamp (23:59:59.999) in Asia/Ho_Chi_Minh */
export function parseEndOfDayIct(dateStr: string): number {
  const clean = dateStr.trim().slice(0, 10);
  return new Date(`${clean}T23:59:59.999+07:00`).getTime();
}

/**
 * Evaluates the status of a specific document against a country transport regulation.
 */
export function evaluateRequirement(input: RequirementEvaluationInput): RequirementEvaluation {
  const { requirement, document, departureAt, tripEndAt, now } = input;
  const leadTimeDays = Math.max(0, Number(requirement.leadTimeDays || 0));

  // 1. Calculate submitDeadline = departureAt - leadTimeDays in Asia/Ho_Chi_Minh
  const depStartMs = parseStartOfDayIct(departureAt);
  const deadlineMs = depStartMs - leadTimeDays * DAY_MS;
  const submitDeadline = formatDateIct(new Date(deadlineMs));

  // 2. Calculate earliestIssueDate = departureAt - maxIssueAgeDays (if applicable)
  let earliestIssueDate: string | null = null;
  let earliestIssueMs: number | null = null;
  if (requirement.maxIssueAgeDays !== null && requirement.maxIssueAgeDays !== undefined && requirement.maxIssueAgeDays > 0) {
    earliestIssueMs = depStartMs - requirement.maxIssueAgeDays * DAY_MS;
    earliestIssueDate = formatDateIct(new Date(earliestIssueMs));
  }

  // canSubmitLater is true if current time (now) is before submitDeadline end-of-day
  const deadlineEndOfDayMs = parseEndOfDayIct(submitDeadline);
  const canSubmitLater = now.getTime() <= deadlineEndOfDayMs;

  // Case 1: Missing document or rejected / draft
  if (!document || document.status === 'draft' || document.status === 'rejected') {
    return {
      status: 'missing',
      submitDeadline,
      earliestIssueDate,
      canSubmitLater,
      reasonVi: document?.status === 'rejected'
        ? 'Tài liệu đã bị từ chối; cần tải lên bản mới thay thế'
        : 'Chưa có hồ sơ trên hệ thống; cần tải lên',
      leadTimeDays,
    };
  }

  // Case 2: Issued too early (e.g. short-term health cert issued earlier than D-10)
  if (earliestIssueDate && document.issueDate) {
    const issueDateStr = document.issueDate.trim().slice(0, 10);
    if (issueDateStr < earliestIssueDate) {
      return {
        status: 'issued_too_early',
        submitDeadline,
        earliestIssueDate,
        canSubmitLater,
        reasonVi: `Giấy tờ cấp ngày ${issueDateStr} là quá sớm. Quy định yêu cầu cấp từ ngày ${earliestIssueDate} (không sớm hơn ${requirement.maxIssueAgeDays} ngày trước khởi hành).`,
        leadTimeDays,
      };
    }
  }

  // Case 3: Expired for trip
  // Buffer check: document expiry date (at 23:59:59.999 ICT) must be >= tripEndAt + minValidityBufferHours
  const bufferHours = Math.max(0, Number(requirement.minValidityBufferHours || 0));
  const requiredUntilMs = tripEndAt.getTime() + bufferHours * 3600 * 1000;
  const requiredUntilDateStr = formatDateIct(new Date(requiredUntilMs));

  if (document.status === 'expired') {
    return {
      status: 'expired',
      submitDeadline,
      earliestIssueDate,
      canSubmitLater,
      reasonVi: 'Hồ sơ đã hết hạn hiệu lực',
      leadTimeDays,
    };
  }

  let expiryMs: number | null = null;
  if (document.expiryDate) {
    const expiryStr = document.expiryDate.trim().slice(0, 10);
    expiryMs = parseEndOfDayIct(expiryStr);
    if (expiryMs < requiredUntilMs) {
      return {
        status: 'expired',
        submitDeadline,
        earliestIssueDate,
        canSubmitLater,
        reasonVi: bufferHours > 0
          ? `Hết hạn ${expiryStr}, không đủ biên an toàn +${bufferHours}h sau khi kết thúc chuyến (${requiredUntilDateStr})`
          : `Hết hạn ${expiryStr}, trước khi hoàn thành chuyến đi (${requiredUntilDateStr})`,
        leadTimeDays,
      };
    }
  }

  // Case 4: Pending review (submitted, dates are valid, waiting for manager)
  if (document.status === 'submitted') {
    return {
      status: 'pending_review',
      submitDeadline,
      earliestIssueDate,
      canSubmitLater,
      reasonVi: 'Hồ sơ đã nộp và đang chờ Logistics Manager thẩm định',
      leadTimeDays,
    };
  }

  // Case 5: Expiring soon (approved, valid for trip, but expires within 30 days after tripEndAt)
  if (expiryMs !== null) {
    const thirtyDaysAfterEndMs = tripEndAt.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS;
    if (expiryMs <= thirtyDaysAfterEndMs) {
      const expiryStr = document.expiryDate!.trim().slice(0, 10);
      return {
        status: 'expiring',
        submitDeadline,
        earliestIssueDate,
        canSubmitLater,
        reasonVi: `Dùng được cho chuyến đi nhưng sẽ hết hạn vào ${expiryStr} (trong vòng 30 ngày sau chuyến)`,
        leadTimeDays,
      };
    }
  }

  // Case 6: Reusable (approved and valid beyond 30 days or has no expiry)
  return {
    status: 'reusable',
    submitDeadline,
    earliestIssueDate,
    canSubmitLater,
    reasonVi: document.expiryDate
      ? `Dùng lại giấy tờ còn hạn đến ${document.expiryDate.trim().slice(0, 10)}`
      : 'Dùng lại giấy tờ vĩnh viễn đã được duyệt',
    leadTimeDays,
  };
}

/**
 * Calculates the earliest feasible departure date based ONLY on requirements that are missing,
 * expired, or issued_too_early. Documents that are reusable, pending_review, or expiring do NOT
 * delay the departure schedule.
 *
 * @param requirements List of evaluated requirements across all horses in the order
 * @param now Current reference time
 * @returns Date object representing 00:00:00 ICT on the earliest feasible departure day
 */
export function earliestFeasibleDeparture(
  requirements: Array<{ status: RequirementStatus; leadTimeDays?: number }>,
  now: Date,
): Date {
  const blockingStatuses = new Set<RequirementStatus>(['missing', 'expired', 'issued_too_early']);
  const missingOrInvalid = requirements.filter((r) => blockingStatuses.has(r.status));

  const maxLeadTimeDays = missingOrInvalid.length > 0
    ? Math.max(...missingOrInvalid.map((r) => Math.max(0, Number(r.leadTimeDays || 0))))
    : 0;

  // Add maxLeadTimeDays to now (rounded up to start of day in Asia/Ho_Chi_Minh)
  const todayStartMs = parseStartOfDayIct(now);
  const earliestMs = todayStartMs + maxLeadTimeDays * DAY_MS;
  const earliestDateStr = formatDateIct(new Date(earliestMs));

  return new Date(`${earliestDateStr}T00:00:00.000+07:00`);
}
