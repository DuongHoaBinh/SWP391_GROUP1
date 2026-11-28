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
 * Cách A: Hạn nộp bổ sung cho giấy tờ "Nộp sau" là 1 ngày trước ngày khởi hành (departure - 1 ngày),
 * nhưng KHÔNG BAO GIỜ sớm hơn ngày tạo đơn / hôm nay (ICT).
 */
export function computeDeferredSubmitDeadline(
  departureAt: Date | string,
  referenceNow: Date | string = new Date(),
): string {
  const depStartMs = parseStartOfDayIct(departureAt);
  const refStartMs = parseStartOfDayIct(referenceNow);
  if (!Number.isFinite(depStartMs)) {
    return formatDateIct(Number.isFinite(refStartMs) ? new Date(refStartMs) : new Date());
  }
  const safeRefMs = Number.isFinite(refStartMs) ? refStartMs : parseStartOfDayIct(new Date());
  const dayBeforeDepMs = depStartMs - DAY_MS;
  return formatDateIct(new Date(Math.max(safeRefMs, dayBeforeDepMs)));
}

/**
 * Evaluates the status of a specific document against a country transport regulation.
 */
export function evaluateRequirement(input: RequirementEvaluationInput): RequirementEvaluation {
  const { requirement, document, departureAt, tripEndAt, now } = input;
  const leadTimeDays = Math.max(0, Number(requirement.leadTimeDays || 0));

  // 1. Cách A: Hạn nộp bổ sung = trước ngày khởi hành 1 ngày, luôn >= hôm nay (không bao giờ lùi về quá khứ theo leadTimeDays)
  const submitDeadline = computeDeferredSubmitDeadline(departureAt, now);

  // Cách A: bỏ phân tầng Tầng A/B & bỏ chặn đặt ngày theo leadTimeDays — khách luôn có thể nộp ngay hoặc nộp sau.
  const canSubmitLater = true;

  // Case 1: Missing document or rejected / draft
  if (!document || document.status === 'draft' || document.status === 'rejected') {
    return {
      status: 'missing',
      submitDeadline,
      earliestIssueDate: null,
      canSubmitLater,
      reasonVi: document?.status === 'rejected'
        ? 'Tài liệu đã bị từ chối; cần tải lên bản mới thay thế'
        : 'Chưa có hồ sơ trên hệ thống; cần tải lên (hoặc chọn nộp sau)',
      leadTimeDays,
    };
  }

  // Case 2: Explicitly marked expired in DB
  if (document.status === 'expired') {
    return {
      status: 'expired',
      submitDeadline,
      earliestIssueDate: null,
      canSubmitLater,
      reasonVi: 'Hồ sơ đã hết hạn hiệu lực; cần tải lên bản mới',
      leadTimeDays,
    };
  }

  // Case 3: Pending review (submitted, waiting for Logistics Manager to inspect validity & approve)
  if (document.status === 'submitted') {
    return {
      status: 'pending_review',
      submitDeadline,
      earliestIssueDate: null,
      canSubmitLater,
      reasonVi: 'Hồ sơ đã nộp và đang chờ Logistics Manager tự kiểm tra thời hạn & phê duyệt',
      leadTimeDays,
    };
  }

  // Case 4: Approved by Logistics Manager — trust Manager's review (Cách A)
  let expiryMs: number | null = null;
  if (document.expiryDate) {
    const expiryStr = document.expiryDate.trim().slice(0, 10);
    expiryMs = parseEndOfDayIct(expiryStr);
    const thirtyDaysAfterEndMs = tripEndAt.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS;
    if (expiryMs <= thirtyDaysAfterEndMs) {
      return {
        status: 'expiring',
        submitDeadline,
        earliestIssueDate: null,
        canSubmitLater,
        reasonVi: `Đã được Quản lý duyệt (hạn ghi nhận: ${expiryStr})`,
        leadTimeDays,
      };
    }
  }

  // Case 5: Reusable (approved by Manager)
  return {
    status: 'reusable',
    submitDeadline,
    earliestIssueDate: null,
    canSubmitLater,
    reasonVi: document.expiryDate
      ? `Đã được Quản lý duyệt (hạn đến ${document.expiryDate.trim().slice(0, 10)})`
      : 'Đã được Quản lý duyệt (không giới hạn thời hạn)',
    leadTimeDays,
  };
}

/**
 * Cách A: Không chặn ngày khởi hành theo leadTimeDays / Tầng A-B.
 * Ngày khả thi luôn là từ hôm nay (khách nộp hồ sơ ngay hoặc nộp sau để Manager duyệt trước giờ xuất phát).
 */
export function earliestFeasibleDeparture(
  _requirements: Array<{ status: RequirementStatus; leadTimeDays?: number }>,
  now: Date,
): Date {
  const earliestDateStr = formatDateIct(now);
  return new Date(`${earliestDateStr}T00:00:00.000+07:00`);
}
