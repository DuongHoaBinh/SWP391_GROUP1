export const ALLOWED_OPERATIONAL_CANCEL_FROM = [
  'approved',
  'planning',
  'confirmed',
  'ready_to_depart',
] as const;

export const DUAL_APPROVAL_THRESHOLD_VND = 20_000_000;
export const CREDIT_VALIDITY_DAYS = 30;

export enum CancellationCategory {
  COMPANY_FAULT = 'company_fault',
  VET_UNFIT_CERTIFIED = 'vet_unfit_certified',
  VET_UNFIT_UNCERTIFIED = 'vet_unfit_uncertified',
  PAYMENT_OVERDUE = 'payment_overdue',
  PAYMENT_OVERDUE_EXPIRED = 'payment_overdue_expired',
  CUSTOMER_REQUEST_POST_APPROVAL = 'customer_request_post_approval',
  FORCE_MAJEURE = 'force_majeure',
  INSURANCE_CLAIM = 'insurance_claim',
}

export enum RefundMode {
  CASH_REFUND = 'cash_refund',
  CREDIT_30D = 'credit_30d',
}

export interface RefundCalculationInput {
  category: CancellationCategory | string;
  refundMode?: RefundMode | string;
  transportCost: number;
  insuranceFee: number;
  paidAmount: number;
  verifiedDisbursementAmount?: number;
  nonRefundableAirCost?: number;
  departureAt?: Date | string | null;
  cancelledAt?: Date | string | null;
}

export interface RefundCalculationResult {
  refundMode: RefundMode;
  freightRefundRate: number;
  freightRefundAmount: number;
  insuranceRefundAmount: number;
  nonRefundableAirDeduction: number;
  disbursementDeduction: number;
  disbursementAbsorbedByCompany: number;
  grossRefundBeforeDisbursement: number;
  netRefundAmount: number;
  receivableExcessAmount: number;
  requiresDualApproval: boolean;
}

/**
 * Implements DEC-04 & AC-F1-05 closed refund calculation matrix:
 * - Insurance is refunded 100% prior to departure in all operational cancel scenarios.
 * - company_fault: 100% freight + 100% insurance; company absorbs 100% of disbursements.
 * - vet_unfit_certified: credit_30d -> 100% freight, cash_refund -> 80% freight (minus verified non-refundable air).
 * - vet_unfit_uncertified: credit_30d -> 80% freight, cash_refund -> 50% freight.
 * - customer_request_post_approval: >=72h -> 90%, 24h-<72h -> 50%, <24h -> 0% freight.
 * - payment_overdue / payment_overdue_expired: same notice window tier as customer_request_post_approval (24h-<72h 50%, <24h 0%).
 * - force_majeure: 100% freight minus verified non-refundable third-party costs.
 * - For non-company_fault categories, verified authority disbursements are deducted transparently.
 */
export function calculateOperationalRefund(input: RefundCalculationInput): RefundCalculationResult {
  const transport = Math.max(0, Math.round(Number(input.transportCost || 0)));
  const insurance = Math.max(0, Math.round(Number(input.insuranceFee || 0)));
  const paid = Math.max(0, Math.round(Number(input.paidAmount || 0)));
  const disbursement = Math.max(0, Math.round(Number(input.verifiedDisbursementAmount || 0)));
  const airDeduction = Math.max(0, Math.round(Number(input.nonRefundableAirCost || 0)));

  const requestedMode =
    String(input.refundMode || RefundMode.CASH_REFUND).toLowerCase() === RefundMode.CREDIT_30D
      ? RefundMode.CREDIT_30D
      : RefundMode.CASH_REFUND;

  const category = String(input.category || '').toLowerCase() as CancellationCategory;

  const cancelledMs = input.cancelledAt ? new Date(input.cancelledAt).getTime() : Date.now();
  const depMs = input.departureAt ? new Date(input.departureAt).getTime() : NaN;
  const hoursBeforeDeparture =
    Number.isFinite(depMs) && Number.isFinite(cancelledMs) ? (depMs - cancelledMs) / 3600_000 : 72;

  let freightRefundRate = 0;
  let effectiveAirDeduction = 0;
  let appliedMode = requestedMode;

  switch (category) {
    case CancellationCategory.COMPANY_FAULT:
      freightRefundRate = 1.0;
      break;
    case CancellationCategory.VET_UNFIT_CERTIFIED:
      freightRefundRate = appliedMode === RefundMode.CREDIT_30D ? 1.0 : 0.8;
      effectiveAirDeduction = appliedMode === RefundMode.CASH_REFUND ? airDeduction : 0;
      break;
    case CancellationCategory.VET_UNFIT_UNCERTIFIED:
      freightRefundRate = appliedMode === RefundMode.CREDIT_30D ? 0.8 : 0.5;
      break;
    case CancellationCategory.FORCE_MAJEURE:
      freightRefundRate = 1.0;
      effectiveAirDeduction = airDeduction;
      break;
    case CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL:
    case CancellationCategory.PAYMENT_OVERDUE:
    case CancellationCategory.PAYMENT_OVERDUE_EXPIRED:
    default:
      appliedMode = RefundMode.CASH_REFUND;
      if (hoursBeforeDeparture >= 72) {
        freightRefundRate = 0.9;
      } else if (hoursBeforeDeparture >= 24) {
        freightRefundRate = 0.5;
      } else {
        freightRefundRate = 0.0;
      }
      break;
  }

  if (paid <= 0) {
    return {
      refundMode: appliedMode,
      freightRefundRate,
      freightRefundAmount: 0,
      insuranceRefundAmount: 0,
      nonRefundableAirDeduction: 0,
      disbursementDeduction: 0,
      disbursementAbsorbedByCompany: category === CancellationCategory.COMPANY_FAULT ? disbursement : 0,
      grossRefundBeforeDisbursement: 0,
      netRefundAmount: 0,
      receivableExcessAmount: category === CancellationCategory.COMPANY_FAULT ? 0 : disbursement,
      requiresDualApproval: false,
    };
  }

  const rawFreightRefund = Math.round(transport * freightRefundRate);
  const freightRefundAmount = Math.max(0, rawFreightRefund - effectiveAirDeduction);
  const insuranceRefundAmount = insurance;
  const grossRefundBeforeDisbursement = Math.min(paid, freightRefundAmount + insuranceRefundAmount);

  if (category === CancellationCategory.COMPANY_FAULT) {
    return {
      refundMode: appliedMode,
      freightRefundRate,
      freightRefundAmount,
      insuranceRefundAmount,
      nonRefundableAirDeduction: 0,
      disbursementDeduction: 0,
      disbursementAbsorbedByCompany: disbursement,
      grossRefundBeforeDisbursement,
      netRefundAmount: grossRefundBeforeDisbursement,
      receivableExcessAmount: 0,
      requiresDualApproval:
        appliedMode === RefundMode.CASH_REFUND &&
        grossRefundBeforeDisbursement >= DUAL_APPROVAL_THRESHOLD_VND,
    };
  }

  const netRefundAmount = Math.max(0, grossRefundBeforeDisbursement - disbursement);
  const receivableExcessAmount = Math.max(0, disbursement - grossRefundBeforeDisbursement);

  return {
    refundMode: appliedMode,
    freightRefundRate,
    freightRefundAmount,
    insuranceRefundAmount,
    nonRefundableAirDeduction: effectiveAirDeduction,
    disbursementDeduction: disbursement,
    disbursementAbsorbedByCompany: 0,
    grossRefundBeforeDisbursement,
    netRefundAmount,
    receivableExcessAmount,
    requiresDualApproval:
      appliedMode === RefundMode.CASH_REFUND && netRefundAmount >= DUAL_APPROVAL_THRESHOLD_VND,
  };
}
