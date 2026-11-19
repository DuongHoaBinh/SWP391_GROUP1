export interface OtdTripInput {
  shipmentId: number;
  transportMode?: string | null;
  transportationType?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  plannedArrival?: Date | string | null;
  actualArrival?: Date | string | null;
  excusedDelay?: boolean | number | null;
}

export interface OtdTripEvaluated {
  shipmentId: number;
  toleranceMinutes: number;
  delayMinutes: number | null;
  isOnTime: boolean | null;
  isExcused: boolean;
  excusedDelayLocked: boolean;
}

export interface OtdMetricsSummary {
  otdSampleSize: number;
  onTimeCount: number;
  lateCount: number;
  excusedDelayCount: number;
  grossOnTimeDeliveryRate: number;
  adjustedOnTimeDeliveryRate: number;
  perShipment: Map<number, OtdTripEvaluated>;
}

export function resolveOtdToleranceMinutes(input: {
  transportMode?: string | null;
  transportationType?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
}): number {
  const mode = (input.transportMode || '').toLowerCase().trim();
  if (mode === 'air') return 120;

  const tType = (input.transportationType || '').toLowerCase();
  if (tType.includes('international') || tType.includes('quốc tế') || tType.includes('air')) {
    return 120;
  }

  const origC = (input.originCountry || '').toLowerCase().trim();
  const destC = (input.destinationCountry || '').toLowerCase().trim();
  if (origC && destC && origC !== destC) {
    return 120;
  }

  return 60;
}

export function isExcusedDelayWindowOpen(
  actualArrivalDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!actualArrivalDate) return false;
  const arrivalMs = new Date(actualArrivalDate).getTime();
  if (!Number.isFinite(arrivalMs)) return false;
  return now.getTime() - arrivalMs <= 48 * 3600 * 1000;
}

export function computeOtdMetrics(
  completedTrips: OtdTripInput[],
  now: Date = new Date(),
): OtdMetricsSummary {
  const perShipment = new Map<number, OtdTripEvaluated>();
  let otdSampleSize = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let excusedLateCount = 0;
  let excusedTotalCount = 0;

  for (const trip of completedTrips) {
    const toleranceMinutes = resolveOtdToleranceMinutes(trip);
    const excusedFlag = Boolean(trip.excusedDelay);
    const locked = !isExcusedDelayWindowOpen(trip.actualArrival, now);

    if (!trip.plannedArrival || !trip.actualArrival) {
      perShipment.set(trip.shipmentId, {
        shipmentId: trip.shipmentId,
        toleranceMinutes,
        delayMinutes: null,
        isOnTime: null,
        isExcused: excusedFlag,
        excusedDelayLocked: locked,
      });
      continue;
    }

    const plannedMs = new Date(trip.plannedArrival).getTime();
    const actualMs = new Date(trip.actualArrival).getTime();
    if (!Number.isFinite(plannedMs) || !Number.isFinite(actualMs)) {
      continue;
    }

    const delayMinutes = Math.round((actualMs - plannedMs) / 60000);
    const isOnTime = delayMinutes <= toleranceMinutes;
    const isExcusedLate = excusedFlag && !isOnTime;

    otdSampleSize++;
    if (isOnTime) {
      onTimeCount++;
    } else {
      lateCount++;
      if (isExcusedLate) excusedLateCount++;
    }
    if (excusedFlag) excusedTotalCount++;

    perShipment.set(trip.shipmentId, {
      shipmentId: trip.shipmentId,
      toleranceMinutes,
      delayMinutes,
      isOnTime,
      isExcused: excusedFlag,
      excusedDelayLocked: locked,
    });
  }

  const grossOnTimeDeliveryRate =
    otdSampleSize > 0 ? Math.round((onTimeCount / otdSampleSize) * 1000) / 10 : 0;
  const adjustedDenom = otdSampleSize - excusedLateCount;
  const adjustedOnTimeDeliveryRate =
    adjustedDenom > 0
      ? Math.round((onTimeCount / adjustedDenom) * 1000) / 10
      : otdSampleSize > 0
        ? 100
        : 0;

  return {
    otdSampleSize,
    onTimeCount,
    lateCount,
    excusedDelayCount: excusedTotalCount,
    grossOnTimeDeliveryRate,
    adjustedOnTimeDeliveryRate,
    perShipment,
  };
}

export interface FinancialReconciliationInput {
  quotedTransportRevenue: number;
  quotedInsuranceRevenue: number;
  sepaySucceededTotal: number;
  cancelledSepaySucceeded: number;
  refundTransferred: number;
  creditLiabilityBalance: number;
  disbursementOffset: number;
  operatingCost: number;
}

export interface FinancialReconciliationResult {
  quotedActiveRevenue: number;
  quotedTransportRevenue: number;
  quotedInsuranceRevenue: number;
  retainedCancellationRevenue: number;
  creditLiabilityBalance: number;
  netRealizedCashRevenue: number;
  totalRecognizedRevenue: number;
  operatingCost: number;
  grossProfit: number;
  grossProfitMargin: number;
}

export function computeExecutiveFinancialMetrics(
  input: FinancialReconciliationInput,
): FinancialReconciliationResult {
  const quotedTransportRevenue = Math.round(Number(input.quotedTransportRevenue || 0));
  const quotedInsuranceRevenue = Math.round(Number(input.quotedInsuranceRevenue || 0));
  const quotedActiveRevenue = quotedTransportRevenue + quotedInsuranceRevenue;

  const sepaySucceededTotal = Math.round(Number(input.sepaySucceededTotal || 0));
  const cancelledSepaySucceeded = Math.round(Number(input.cancelledSepaySucceeded || 0));
  const refundTransferred = Math.round(Number(input.refundTransferred || 0));
  const creditLiabilityBalance = Math.round(Number(input.creditLiabilityBalance || 0));
  const disbursementOffset = Math.round(Number(input.disbursementOffset || 0));
  const operatingCost = Math.round(Number(input.operatingCost || 0));

  const retainedCancellationRevenue = Math.max(
    0,
    cancelledSepaySucceeded - refundTransferred - creditLiabilityBalance - disbursementOffset,
  );
  const netRealizedCashRevenue = Math.max(
    0,
    sepaySucceededTotal - refundTransferred - creditLiabilityBalance,
  );
  const totalRecognizedRevenue = quotedActiveRevenue + retainedCancellationRevenue;
  const grossProfit = totalRecognizedRevenue - operatingCost;
  const grossProfitMargin =
    totalRecognizedRevenue > 0
      ? Math.round((grossProfit / totalRecognizedRevenue) * 1000) / 10
      : 0;

  return {
    quotedActiveRevenue,
    quotedTransportRevenue,
    quotedInsuranceRevenue,
    retainedCancellationRevenue,
    creditLiabilityBalance,
    netRealizedCashRevenue,
    totalRecognizedRevenue,
    operatingCost,
    grossProfit,
    grossProfitMargin,
  };
}
