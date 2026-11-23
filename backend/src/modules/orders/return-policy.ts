export const RETURN_POLICY_VERSION = 'return-v1';

export interface ReturnPolicyTier {
  minHoursBefore: number;
  refundPercent: number;
}

export interface ReturnPolicySnapshot {
  version: string;
  tiers: ReturnPolicyTier[];
  waitMinutes: number;
  rescheduleFreeMinHours: number;
  rescheduleFeePercent: number;
}

/**
 * Returns current return policy configuration snapshot.
 */
export function currentReturnPolicy(): ReturnPolicySnapshot {
  return {
    version: RETURN_POLICY_VERSION,
    tiers: [
      { minHoursBefore: 168, refundPercent: 80 },
      { minHoursBefore: 72, refundPercent: 50 },
      { minHoursBefore: 0, refundPercent: 0 },
    ],
    waitMinutes: 120,
    rescheduleFreeMinHours: 168,
    rescheduleFeePercent: 10,
  };
}

/**
 * Calculates refund for return leg cancellation according to policy snapshot.
 */
export function calculateReturnCancellationRefund(input: {
  returnFreight: number;
  returnInsuranceFee: number;
  returnDepartureAt: Date;
  cancelledAt: Date;
  cause: 'customer' | 'company';
  policy: ReturnPolicySnapshot;
}): {
  refundPercent: number;
  freightRefund: number;
  insuranceRefund: number;
  total: number;
  tier: string;
} {
  const freight = Number(input.returnFreight || 0);
  const insurance = Number(input.returnInsuranceFee || 0);

  if (input.cause === 'company') {
    const freightRefund = Math.max(0, Math.round(freight));
    const insuranceRefund = Math.max(0, Math.round(insurance));
    return {
      refundPercent: 100,
      freightRefund,
      insuranceRefund,
      total: freightRefund + insuranceRefund,
      tier: 'company_cancellation',
    };
  }

  const hoursBefore =
    (input.returnDepartureAt.getTime() - input.cancelledAt.getTime()) / (1000 * 3600);

  let refundPercent = 0;
  let tier = '< 72h';

  if (hoursBefore >= 168) {
    refundPercent = 80;
    tier = '>= 168h';
  } else if (hoursBefore >= 72) {
    refundPercent = 50;
    tier = '72h-168h';
  } else {
    refundPercent = 0;
    tier = '< 72h';
  }

  const freightRefund = Math.max(0, Math.round((freight * refundPercent) / 100));
  // Insurance refund is 100% when cancelled before return leg departure
  const insuranceRefund = Math.max(0, Math.round(insurance));
  const total = freightRefund + insuranceRefund;

  return {
    refundPercent,
    freightRefund,
    insuranceRefund,
    total,
    tier,
  };
}

/**
 * Calculates reschedule fee for return leg.
 */
export function calculateRescheduleFee(input: {
  returnFreight: number;
  returnDepartureAt: Date;
  requestedAt: Date;
  policy: ReturnPolicySnapshot;
}): { fee: number; free: boolean } {
  const freight = Number(input.returnFreight || 0);
  const hoursBefore =
    (input.returnDepartureAt.getTime() - input.requestedAt.getTime()) / (1000 * 3600);

  const freeMinHours = input.policy.rescheduleFreeMinHours ?? 168;
  if (hoursBefore >= freeMinHours) {
    return { fee: 0, free: true };
  }

  const feePercent = input.policy.rescheduleFeePercent ?? 10;
  const fee = Math.max(0, Math.round((freight * feePercent) / 100));
  return { fee, free: false };
}

/**
 * Validates if driver can mark return leg as no-show.
 */
export function canMarkNoShow(input: {
  returnDepartureAt: Date;
  waitMinutes: number;
  now: Date;
}): { allowed: boolean; allowedAt: Date } {
  const waitMs = (input.waitMinutes ?? 120) * 60 * 1000;
  const allowedAt = new Date(input.returnDepartureAt.getTime() + waitMs);
  const allowed = input.now.getTime() >= allowedAt.getTime();
  return { allowed, allowedAt };
}
