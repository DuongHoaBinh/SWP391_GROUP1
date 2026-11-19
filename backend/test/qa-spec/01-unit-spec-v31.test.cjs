const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { calculateInsurance, totalInsuranceFee } = require('../../dist/modules/orders/insurance-policy');
const { calculateBookingQuote } = require('../../dist/modules/orders/booking-policy');
const {
  calculateOperationalRefund,
  CancellationCategory,
  RefundMode,
} = require('../../dist/modules/orders/refund-policy');
const {
  computeDriverPrimarySlaDueAt,
  computeBackupPoolSlaDueAt,
  computeInvoiceHardCapAt,
  computePaymentDueAt,
  computeGraceDueAt,
} = require('../../dist/modules/orders/sla-timeline.policy');
const {
  DEFAULT_EQUINE_VITAL_CONFIG,
  classifyTemperature,
  classifyHeartRate,
  evaluateEquineHealthAlert,
} = require('../../dist/modules/tracking/vitals-policy');
const {
  computeOtdMetrics,
  isExcusedDelayWindowOpen,
  computeExecutiveFinancialMetrics,
} = require('../../dist/modules/reports/reports-calculator');
const { DocumentsService } = require('../../dist/modules/documents/documents.service');
const { UserRole } = require('../../dist/modules/auth/auth.types');

test('BR-F1-02: Insurance calculates 3 packages, half-up 1 VND rounding, USD snapshot & missing USD rate failure', () => {
  const prevUsd = process.env.INSURANCE_USD_TO_VND;
  try {
    const basicZero = calculateInsurance({
      declaredValue: 0,
      declaredCurrency: 'VND',
      insurancePackage: 'basic',
    });
    assert.equal(basicZero.insuranceFee, 0);
    assert.equal(basicZero.maxCompensation, 50_000_000);
    assert.equal(basicZero.emergencyVetCovered, false);

    // Half-up rounding to 1 VND on 1.5%:
    // 33 * 0.015 = 0.495 -> 0 VND; 100 * 0.015 = 1.5 -> 2 VND
    assert.equal(
      calculateInsurance({ declaredValue: 33, declaredCurrency: 'VND', insurancePackage: 'standard' }).insuranceFee,
      0,
    );
    assert.equal(
      calculateInsurance({ declaredValue: 100, declaredCurrency: 'VND', insurancePackage: 'standard' }).insuranceFee,
      2,
    );

    const std = calculateInsurance({
      declaredValue: 100_000_000,
      declaredCurrency: 'VND',
      insurancePackage: 'standard',
    });
    assert.equal(std.insuranceFee, 1_500_000);
    assert.equal(std.maxCompensation, 80_000_000);
    assert.equal(std.emergencyVetCovered, false);

    const prem = calculateInsurance({
      declaredValue: 100_000_000,
      declaredCurrency: 'VND',
      insurancePackage: 'premium',
    });
    assert.equal(prem.insuranceFee, 3_000_000);
    assert.equal(prem.maxCompensation, 100_000_000);
    assert.equal(prem.emergencyVetCovered, true);

    // USD conversion with configured rate
    process.env.INSURANCE_USD_TO_VND = '25000';
    const usdLive = calculateInsurance({
      declaredValue: 1000,
      declaredCurrency: 'USD',
      insurancePackage: 'standard',
    });
    assert.equal(usdLive.exchangeRate, 25_000);
    assert.equal(usdLive.declaredValueVnd, 25_000_000);
    assert.equal(usdLive.insuranceFee, 375_000);

    // Historical saved rate overrides current env
    process.env.INSURANCE_USD_TO_VND = '26000';
    const usdSaved = calculateInsurance(
      { declaredValue: 1000, declaredCurrency: 'USD', insurancePackage: 'standard' },
      '24500',
    );
    assert.equal(usdSaved.exchangeRate, 24_500);
    assert.equal(usdSaved.declaredValueVnd, 24_500_000);

    // USD without env rate or saved rate fails
    delete process.env.INSURANCE_USD_TO_VND;
    assert.throws(() =>
      calculateInsurance({ declaredValue: 1000, declaredCurrency: 'USD', insurancePackage: 'standard' }),
    );
  } finally {
    if (prevUsd === undefined) delete process.env.INSURANCE_USD_TO_VND;
    else process.env.INSURANCE_USD_TO_VND = prevUsd;
  }
});

test('AC-F1-01 & BR-F1-03 & AC-F1-03: Shared stall vs Dedicated charter quote math and 409 stale view conflict', () => {
  // AC-F1-01: 2 horses standard 100M VND + shared_stall @ 2M/stall -> 7M total
  const horseIns = calculateInsurance({
    declaredValue: 100_000_000,
    declaredCurrency: 'VND',
    insurancePackage: 'standard',
  });
  const insuranceFee = totalInsuranceFee([
    { insuranceFee: horseIns.insuranceFee, quantity: 1 },
    { insuranceFee: horseIns.insuranceFee, quantity: 1 },
  ]);
  const sharedQuote = calculateBookingQuote('shared_stall', 2, {
    bookingType: 'shared_stall',
    quotedHorseCount: 2,
    stallUnitPrice: 2_000_000,
  });
  assert.equal(insuranceFee, 3_000_000);
  assert.equal(sharedQuote.transportCost, 4_000_000);
  assert.equal(sharedQuote.transportCost + insuranceFee, 7_000_000);

  // BR-F1-03: dedicated_charter stays flat regardless of horse count
  const charterQuote = calculateBookingQuote('dedicated_charter', 3, {
    bookingType: 'dedicated_charter',
    quotedHorseCount: 3,
    transportCost: 9_000_000,
  });
  assert.equal(charterQuote.transportCost, 9_000_000);
  assert.equal(charterQuote.stallUnitPrice, null);

  // AC-F1-03: Stale bookingType or quotedHorseCount -> 409 Conflict
  assert.throws(
    () =>
      calculateBookingQuote('dedicated_charter', 2, {
        bookingType: 'shared_stall',
        quotedHorseCount: 1,
        stallUnitPrice: 2_000_000,
      }),
    (err) => err.getStatus?.() === 409,
  );
  assert.throws(
    () =>
      calculateBookingQuote('shared_stall', 3, {
        bookingType: 'shared_stall',
        quotedHorseCount: 2,
        stallUnitPrice: 2_000_000,
      }),
    (err) => err.getStatus?.() === 409,
  );
});

test('BR-F4-03 & DEC-06: Equine vital signs closed-partition exact boundary checks', () => {
  const tempBoundaries = [
    [36.99, 'red'],
    [37.0, 'amber'],
    [37.49, 'amber'],
    [37.5, 'green'],
    [38.5, 'green'],
    [38.51, 'amber'],
    [38.55, 'amber'],
    [39.29, 'amber'],
    [39.3, 'red'],
  ];
  for (const [temp, expected] of tempBoundaries) {
    assert.equal(
      classifyTemperature(temp, DEFAULT_EQUINE_VITAL_CONFIG),
      expected,
      `temp ${temp} should be ${expected}`,
    );
  }

  const hrBoundaries = [
    [23, 'red'],
    [24, 'amber'],
    [27, 'amber'],
    [28, 'green'],
    [44, 'green'],
    [45, 'amber'],
    [59, 'amber'],
    [60, 'red'],
  ];
  for (const [hr, expected] of hrBoundaries) {
    assert.equal(
      classifyHeartRate(hr, DEFAULT_EQUINE_VITAL_CONFIG),
      expected,
      `hr ${hr} should be ${expected}`,
    );
  }
});

test('AC-F4-03: Consecutive 6h escalatable_amber escalation vs observational climate_change non-escalation', () => {
  const m1 = evaluateEquineHealthAlert(
    {
      conditionStatus: 'climate_change',
      temperatureC: 38.0,
      heartRateBpm: 36,
      recordedAt: '2026-12-01T08:00:00.000Z',
    },
    null,
  );
  assert.equal(m1.alertTier, 'amber_observational');

  const m2 = evaluateEquineHealthAlert(
    {
      conditionStatus: 'climate_change',
      temperatureC: 38.0,
      heartRateBpm: 36,
      recordedAt: '2026-12-01T10:00:00.000Z',
    },
    { alertTier: m1.alertTier, recordedAt: '2026-12-01T08:00:00.000Z' },
  );
  assert.equal(m2.alertTier, 'amber_observational');

  const m3 = evaluateEquineHealthAlert(
    {
      conditionStatus: 'stable',
      temperatureC: 38.55,
      heartRateBpm: 25,
      recordedAt: '2026-12-01T12:00:00.000Z',
    },
    { alertTier: m2.alertTier, recordedAt: '2026-12-01T10:00:00.000Z' },
  );
  assert.equal(m3.alertTier, 'amber_escalatable');

  const m4 = evaluateEquineHealthAlert(
    {
      conditionStatus: 'not_eating',
      temperatureC: 38.0,
      heartRateBpm: 40,
      recordedAt: '2026-12-01T15:00:00.000Z',
    },
    { alertTier: m3.alertTier, recordedAt: '2026-12-01T12:00:00.000Z' },
  );
  assert.equal(m4.alertTier, 'red');

  // Exact 6h00m vs 6h01m window boundary
  const exact6h = evaluateEquineHealthAlert(
    {
      conditionStatus: 'stressed',
      temperatureC: 38.0,
      heartRateBpm: 36,
      recordedAt: '2026-12-01T18:00:00.000Z',
    },
    { alertTier: 'amber_escalatable', recordedAt: '2026-12-01T12:00:00.000Z' },
  );
  assert.equal(exact6h.alertTier, 'red');

  const over6h = evaluateEquineHealthAlert(
    {
      conditionStatus: 'stressed',
      temperatureC: 38.0,
      heartRateBpm: 36,
      recordedAt: '2026-12-01T18:01:00.000Z',
    },
    { alertTier: 'amber_escalatable', recordedAt: '2026-12-01T12:00:00.000Z' },
  );
  assert.equal(over6h.alertTier, 'amber_escalatable');
});

test('DEC-04 & BR-F1-08 & BR-F1-09 & AC-F1-05: Full refund calculation matrix across all categories & modes', () => {
  const baseDep = '2026-12-10T12:00:00.000Z';
  const atOffset = (hoursBefore) =>
    new Date(new Date(baseDep).getTime() - hoursBefore * 3600 * 1000).toISOString();

  // company_fault: 100% freight + 100% insurance, 0 disbursement deduction (absorbed by company)
  const companyFault = calculateOperationalRefund({
    category: CancellationCategory.COMPANY_FAULT,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 500_000,
    departureAt: baseDep,
    cancelledAt: atOffset(12),
  });
  assert.equal(companyFault.netRefundAmount, 7_000_000);
  assert.equal(companyFault.disbursementDeduction, 0);
  assert.equal(companyFault.disbursementAbsorbedByCompany, 500_000);

  // vet_unfit_certified: credit_30d -> 100% freight
  const vetCertCredit = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CREDIT_30D,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 500_000,
    departureAt: baseDep,
    cancelledAt: atOffset(12),
  });
  assert.equal(vetCertCredit.freightRefundRate, 1.0);
  assert.equal(vetCertCredit.netRefundAmount, 6_500_000);

  // AC-F1-05 exact numbers: vet_unfit_certified cash_refund @ T-12h with & without 500k disbursement
  const acF105WithDisb = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 500_000,
    departureAt: baseDep,
    cancelledAt: atOffset(12),
  });
  assert.equal(acF105WithDisb.netRefundAmount, 5_700_000);

  const acF105NoDisb = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 0,
    departureAt: baseDep,
    cancelledAt: atOffset(12),
  });
  assert.equal(acF105NoDisb.netRefundAmount, 6_200_000);

  // vet_unfit_certified minus non-refundable air ticket cost
  const vetCertAir = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    nonRefundableAirCost: 1_000_000,
    departureAt: baseDep,
    cancelledAt: atOffset(12),
  });
  assert.equal(vetCertAir.netRefundAmount, 5_200_000);

  // vet_unfit_uncertified: credit_30d -> 80%, cash_refund -> 50%
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.VET_UNFIT_UNCERTIFIED,
      refundMode: RefundMode.CREDIT_30D,
      transportCost: 10_000_000,
      insuranceFee: 2_000_000,
      paidAmount: 12_000_000,
    }).netRefundAmount,
    10_000_000,
  );
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.VET_UNFIT_UNCERTIFIED,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 2_000_000,
      paidAmount: 12_000_000,
    }).netRefundAmount,
    7_000_000,
  );

  // customer_request_post_approval tiers: >=72h (90%), 24h-<72h (50%), <24h (0% freight + 100% ins)
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      departureAt: baseDep,
      cancelledAt: atOffset(72),
    }).netRefundAmount,
    10_000_000,
  );
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      departureAt: baseDep,
      cancelledAt: atOffset(71.9),
    }).netRefundAmount,
    6_000_000,
  );
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      departureAt: baseDep,
      cancelledAt: atOffset(23.9),
    }).netRefundAmount,
    1_000_000,
  );

  // payment_overdue / payment_overdue_expired tiers
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.PAYMENT_OVERDUE,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      departureAt: baseDep,
      cancelledAt: atOffset(30),
    }).freightRefundRate,
    0.5,
  );
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.PAYMENT_OVERDUE_EXPIRED,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      departureAt: baseDep,
      cancelledAt: atOffset(23),
    }).freightRefundRate,
    0,
  );

  // force_majeure: 100% freight minus verified non-refundable third-party costs
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.FORCE_MAJEURE,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 10_000_000,
      insuranceFee: 1_000_000,
      paidAmount: 11_000_000,
      nonRefundableAirCost: 3_000_000,
      verifiedDisbursementAmount: 500_000,
    }).netRefundAmount,
    7_500_000,
  );

  // Disbursement > gross refund yields netRefund=0 + receivableExcessAmount
  const excess = calculateOperationalRefund({
    category: CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 10_000_000,
    insuranceFee: 0,
    paidAmount: 10_000_000,
    verifiedDisbursementAmount: 1_200_000,
    departureAt: baseDep,
    cancelledAt: atOffset(10),
  });
  assert.equal(excess.netRefundAmount, 0);
  assert.equal(excess.receivableExcessAmount, 1_200_000);

  // Dual approval threshold >= 20,000,000 VND
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.COMPANY_FAULT,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 19_999_999,
      insuranceFee: 0,
      paidAmount: 19_999_999,
    }).requiresDualApproval,
    false,
  );
  assert.equal(
    calculateOperationalRefund({
      category: CancellationCategory.COMPANY_FAULT,
      refundMode: RefundMode.CASH_REFUND,
      transportCost: 20_000_000,
      insuranceFee: 0,
      paidAmount: 20_000_000,
    }).requiresDualApproval,
    true,
  );
});

test('DEC-05 & AC-F3-04 & AC-F3-05: Primary 4 biz-h / 12h cap SLA, Backup 4h, T-52h Hard Cap, Payment T-30h & Grace T-24h caps', () => {
  // 09:00 ICT (02:00 UTC) -> +4h biz = 13:00 ICT (06:00 UTC)
  assert.equal(
    computeDriverPrimarySlaDueAt(new Date('2026-12-01T02:00:00.000Z')).toISOString(),
    '2026-12-01T06:00:00.000Z',
  );
  // 17:00 ICT (10:00 UTC): biz clock hits next day 11:00 ICT (18h elapsed), so 12h wall cap wins -> 05:00 ICT (22:00 UTC)
  assert.equal(
    computeDriverPrimarySlaDueAt(new Date('2026-12-01T10:00:00.000Z')).toISOString(),
    '2026-12-01T22:00:00.000Z',
  );
  // Backup SLA: strict +4h
  assert.equal(
    computeBackupPoolSlaDueAt(new Date('2026-12-01T10:00:00.000Z')).toISOString(),
    '2026-12-01T14:00:00.000Z',
  );

  const dep = '2026-12-10T12:00:00.000Z';
  const subH = (h) => new Date(new Date(dep).getTime() - h * 3600 * 1000);

  assert.equal(computeInvoiceHardCapAt(dep).toISOString(), subH(52).toISOString());
  assert.equal(computePaymentDueAt(subH(58), dep).toISOString(), subH(34).toISOString());
  assert.equal(computePaymentDueAt(subH(52), dep).toISOString(), subH(30).toISOString());
  // AC-F3-05: grace granted at T-28h is hard-capped at T-24h (4h remaining)
  assert.equal(computeGraceDueAt(subH(28), dep).toISOString(), subH(24).toISOString());
  assert.equal(computeGraceDueAt(subH(36), dep).toISOString(), subH(26).toISOString());
  // At or past T-24h rejects with 409 Conflict
  assert.throws(
    () => computeGraceDueAt(subH(24), dep),
    (err) => err.getStatus?.() === 409,
  );
});

test('BR-F2-02 & BR-F2-05: Dynamic Tier-A deadline, Order Cutoff & exact minute arrival+buffer boundary', async () => {
  const buildSvc = (regs, orderOverride, docsOverride) =>
    new DocumentsService(
      {
        findOrderDetails: async () => ({
          shipment_id: 300,
          customer_id: 6,
          origin_location: 'TP.HCM, Vietnam',
          destination_location: 'Singapore Turf Club, Singapore',
          transportation_type: 'International',
          transport_mode: 'air',
          booking_type: 'shared_stall',
          requested_date: '2026-12-25T10:00:00.000Z',
          departure_date: '2026-12-25T10:00:00.000Z',
          expected_arrival_date: '2026-12-25T18:00:00.000Z',
          ...orderOverride,
        }),
        findRegulations: async () => regs,
        findHorsesInOrder: async () => [{ horse_id: 1, name: 'Comet', microchip_no: '985', passport_no: 'FEI-1' }],
        findDocumentsByHorseId: async () => docsOverride,
        hasRequirementsSent: async () => true,
      },
      { createNotification: async () => 1 },
      { onChange: () => {} },
    );

  // shared_stall + lead_time_days=14 -> tierADeadline D-14, orderCutoffDate D-16
  const svc1 = buildSvc(
    [{ id: 1, country: 'Singapore', docTier: 'A', leadTimeDays: 14, minValidityBufferHours: 48, transportMode: 'air' }],
    {},
    [],
  );
  const c1 = await svc1.getOrderComplianceChecklist({ id: 6, role: UserRole.CUSTOMER }, 300);
  assert.equal(c1.tierADeadline, '2026-12-11');
  assert.equal(c1.orderCutoffDate, '2026-12-09');

  // dedicated_charter + lead_time_days=2 -> min floor D-3 Tier A, D-4 Order Cutoff
  const svc2 = buildSvc(
    [{ id: 2, country: 'Vietnam', docTier: 'A', leadTimeDays: 2, minValidityBufferHours: 24, transportMode: 'road' }],
    {
      destination_location: 'Đà Nẵng, Vietnam',
      transportation_type: 'Domestic',
      transport_mode: 'road',
      booking_type: 'dedicated_charter',
    },
    [],
  );
  const c2 = await svc2.getOrderComplianceChecklist({ id: 6, role: UserRole.CUSTOMER }, 300);
  assert.equal(c2.tierADeadline, '2026-12-22');
  assert.equal(c2.orderCutoffDate, '2026-12-21');

  // Minute-precision arrival + 48h buffer boundary: arrival 2026-12-10T10:00Z + 48h = 2026-12-12T10:00Z
  const bReg = [
    { id: 3, country: 'Singapore', docTier: 'B', leadTimeDays: 1, minValidityBufferHours: 48, transportMode: 'air' },
  ];
  const validAtExactMin = await buildSvc(
    bReg,
    { expected_arrival_date: '2026-12-10T10:00:00.000Z', departure_date: '2026-12-10T02:00:00.000Z' },
    [{ id: 10, horseId: 1, regulationId: 3, status: 'approved', expiryDate: '2026-12-12T10:00:00.000Z' }],
  ).getOrderComplianceChecklist({ id: 6, role: UserRole.CUSTOMER }, 300);
  assert.equal(validAtExactMin.horses[0].documents[0].isExpiredForTrip, false);

  const expiredByOneMinute = await buildSvc(
    bReg,
    { expected_arrival_date: '2026-12-10T10:00:00.000Z', departure_date: '2026-12-10T02:00:00.000Z' },
    [{ id: 11, horseId: 1, regulationId: 3, status: 'approved', expiryDate: '2026-12-12T09:59:00.000Z' }],
  ).getOrderComplianceChecklist({ id: 6, role: UserRole.CUSTOMER }, 300);
  assert.equal(expiredByOneMinute.horses[0].documents[0].isExpiredForTrip, true);
});

test('AC-RPT-01 & AC-RPT-02 & DEC-02: OTD math, 48h excused_delay lock, financial reconciliation & zero 98.6 hardcode', () => {
  // Domestic road tolerance <= 60m; international/air <= 120m
  const now = new Date('2026-12-10T12:00:00.000Z');
  const otd = computeOtdMetrics(
    [
      {
        shipmentId: 1,
        transportMode: 'road',
        transportationType: 'Domestic',
        plannedArrival: '2026-12-09T10:00:00.000Z',
        actualArrival: '2026-12-09T10:00:00.000Z',
      },
      {
        shipmentId: 2,
        transportMode: 'road',
        transportationType: 'Domestic',
        plannedArrival: '2026-12-09T10:00:00.000Z',
        actualArrival: '2026-12-09T11:00:00.000Z', // exact +60m -> on time
      },
      {
        shipmentId: 3,
        transportMode: 'road',
        transportationType: 'Domestic',
        plannedArrival: '2026-12-09T10:00:00.000Z',
        actualArrival: '2026-12-09T10:30:00.000Z',
      },
      {
        shipmentId: 4,
        transportMode: 'road',
        transportationType: 'Domestic',
        plannedArrival: '2026-12-09T10:00:00.000Z',
        actualArrival: '2026-12-09T11:35:00.000Z', // +95m -> late
        excusedDelay: true,
      },
    ],
    now,
  );
  assert.equal(otd.grossOnTimeDeliveryRate, 75);
  assert.equal(otd.adjustedOnTimeDeliveryRate, 100);

  const intlOtd = computeOtdMetrics([
    {
      shipmentId: 5,
      transportMode: 'air',
      transportationType: 'International',
      plannedArrival: '2026-12-09T10:00:00.000Z',
      actualArrival: '2026-12-09T12:00:00.000Z', // +120m -> on time
    },
    {
      shipmentId: 6,
      transportMode: 'air',
      transportationType: 'International',
      plannedArrival: '2026-12-09T10:00:00.000Z',
      actualArrival: '2026-12-09T12:01:00.000Z', // +121m -> late
    },
  ]);
  assert.equal(intlOtd.grossOnTimeDeliveryRate, 50);

  // 48h excused_delay window boundary
  assert.equal(isExcusedDelayWindowOpen('2026-12-08T12:00:00.000Z', now), true); // exact 48h
  assert.equal(isExcusedDelayWindowOpen('2026-12-08T11:59:00.000Z', now), false); // 48h01m

  // AC-RPT-01 exact financial reconciliation
  const fin = computeExecutiveFinancialMetrics({
    quotedTransportRevenue: 90_000_000,
    quotedInsuranceRevenue: 10_000_000,
    sepaySucceededTotal: 115_000_000,
    cancelledSepaySucceeded: 15_000_000,
    refundTransferred: 8_000_000,
    creditLiabilityBalance: 5_000_000,
    disbursementOffset: 0,
    operatingCost: 62_000_000,
  });
  assert.equal(fin.quotedActiveRevenue, 100_000_000);
  assert.equal(fin.retainedCancellationRevenue, 2_000_000);
  assert.equal(fin.creditLiabilityBalance, 5_000_000);
  assert.equal(fin.netRealizedCashRevenue, 102_000_000);
  assert.equal(fin.operatingCost, 62_000_000);
  assert.equal(fin.grossProfit, 40_000_000);

  // Zero 98.6 hardcode in reports module
  const reportsDir = path.resolve(__dirname, '../../src/modules/reports');
  for (const f of fs.readdirSync(reportsDir).filter((x) => x.endsWith('.ts'))) {
    const txt = fs.readFileSync(path.join(reportsDir, f), 'utf8');
    assert.doesNotMatch(txt, /98\.6/, `${f} must not hardcode 98.6`);
  }
});
