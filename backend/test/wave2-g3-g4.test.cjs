const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateOperationalRefund,
  CancellationCategory,
  RefundMode,
} = require('../dist/modules/orders/refund-policy');
const {
  computeDriverPrimarySlaDueAt,
  computeBackupPoolSlaDueAt,
  computePaymentDueAt,
  computeGraceDueAt,
} = require('../dist/modules/orders/sla-timeline.policy');
const { OrdersOpsService } = require('../dist/modules/orders/orders-ops.service');
const {
  evaluateEquineHealthAlert,
  DEFAULT_EQUINE_VITAL_CONFIG,
} = require('../dist/modules/tracking/vitals-policy');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('AC-F1-05: calculateOperationalRefund matches DEC-04 matrix (vet_unfit_certified, disbursement deduction, company_fault absorption, >=20M dual-approval)', () => {
  const depAt = new Date(Date.now() + 12 * 3600 * 1000); // T-12h

  const withDisb = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 500_000,
    departureAt: depAt,
    cancelledAt: new Date(),
  });
  assert.equal(withDisb.freightRefundAmount, 3_200_000);
  assert.equal(withDisb.insuranceRefundAmount, 3_000_000);
  assert.equal(withDisb.disbursementDeduction, 500_000);
  assert.equal(withDisb.netRefundAmount, 5_700_000);
  assert.equal(withDisb.requiresDualApproval, false);

  const withoutDisb = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CASH_REFUND,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 0,
    departureAt: depAt,
  });
  assert.equal(withoutDisb.netRefundAmount, 6_200_000);

  const credit100 = calculateOperationalRefund({
    category: CancellationCategory.VET_UNFIT_CERTIFIED,
    refundMode: RefundMode.CREDIT_30D,
    transportCost: 4_000_000,
    insuranceFee: 3_000_000,
    paidAmount: 7_000_000,
    verifiedDisbursementAmount: 0,
    departureAt: depAt,
  });
  assert.equal(credit100.netRefundAmount, 7_000_000);

  const fault = calculateOperationalRefund({
    category: CancellationCategory.COMPANY_FAULT,
    transportCost: 20_000_000,
    insuranceFee: 5_000_000,
    paidAmount: 25_000_000,
    verifiedDisbursementAmount: 800_000,
  });
  assert.equal(fault.disbursementDeduction, 0);
  assert.equal(fault.disbursementAbsorbedByCompany, 800_000);
  assert.equal(fault.netRefundAmount, 25_000_000);
  assert.equal(fault.requiresDualApproval, true);

  const excess = calculateOperationalRefund({
    category: CancellationCategory.CUSTOMER_REQUEST_POST_APPROVAL,
    transportCost: 4_000_000,
    insuranceFee: 0,
    paidAmount: 4_000_000,
    verifiedDisbursementAmount: 500_000,
    departureAt: depAt, // < 24h -> 0% freight
  });
  assert.equal(excess.netRefundAmount, 0);
  assert.equal(excess.receivableExcessAmount, 500_000);
});

test('AC-F1-06: SoD forbids approver from transferring or double-approving >=20M refunds (403), succeeds for independent Admin', async () => {
  const { OrdersOpsStore } = require('../dist/modules/orders/orders-ops.store');
  const store = new OrdersOpsStore();

  let rowState = {
    refund_id: 77,
    shipment_id: 501,
    customer_id: 6,
    cancellation_category: 'company_fault',
    refund_mode: 'cash_refund',
    freight_refund_amount: 18_000_000,
    insurance_refund_amount: 4_000_000,
    non_refundable_air_deduction: 0,
    disbursement_deduction: 0,
    amount: 22_000_000,
    receivable_excess_amount: 0,
    status: 'pending_approval',
    requires_dual_approval: 1,
    requested_by: 2,
    approved_by: null,
    second_approved_by: null,
    transferred_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  store.pool = {
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      execute: async (sql, args) => {
        if (sql.includes('FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE')) return [[rowState]];
        if (sql.includes('FROM shipment_refund_record rr')) return [[rowState]];
        if (sql.includes("SET status = 'pending_second_approval'")) {
          rowState = { ...rowState, status: 'pending_second_approval', approved_by: args[0] };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('SET status = \'approved_for_transfer\',') && sql.includes('second_approved_by')) {
          rowState = { ...rowState, status: 'approved_for_transfer', second_approved_by: args[0] };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET status = 'transferred'")) {
          rowState = {
            ...rowState,
            status: 'transferred',
            transferred_by: args[0],
            recipient_bank_account: args[1],
            bank_transaction_ref: args[2],
            transfer_receipt_url: args[3],
          };
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      },
    }),
  };

  const notifs = [];
  const svc = new OrdersOpsService(store, {
    createNotification: async (...a) => notifs.push(a),
    notifyRole: async (...a) => notifs.push(a),
  });

  // Step 1: Manager #2 approves -> pending_second_approval
  const s1 = await svc.approveRefund({ id: '2', role: UserRole.LOGISTICS_MANAGER }, 77, {});
  assert.equal(s1.status, 'pending_second_approval');

  // Step 2: Same Manager #2 cannot be second approver -> 403
  await assert.rejects(
    svc.approveRefund({ id: '2', role: UserRole.LOGISTICS_MANAGER }, 77, {}),
    (err) => err.getStatus?.() === 403,
  );

  // Manager #9 performs 2nd approval -> approved_for_transfer
  const s2 = await svc.approveRefund({ id: '9', role: UserRole.LOGISTICS_MANAGER }, 77, {});
  assert.equal(s2.status, 'approved_for_transfer');

  // Step 3: Neither approver (#2 or #9) can transfer -> 403
  for (const sameId of ['2', '9']) {
    await assert.rejects(
      svc.transferRefund({ id: sameId, role: UserRole.ADMIN }, 77, {
        recipientBankAccount: '123456',
        bankTransactionRef: 'FT99',
        transferReceiptUrl: 'https://example.com/unc.pdf',
      }),
      (err) => err.getStatus?.() === 403,
    );
  }

  // Independent Admin #1 succeeds
  const s3 = await svc.transferRefund({ id: '1', role: UserRole.ADMIN }, 77, {
    recipientBankAccount: '123456',
    bankTransactionRef: 'FT99',
    transferReceiptUrl: 'https://example.com/unc.pdf',
  });
  assert.equal(s3.status, 'transferred');
  assert.equal(s3.transferredBy, 1);
});

test('AC-F3-04 & AC-F3-05: Dynamic SLA timeline, T-30h payment cap, and T-24h grace hard cap', () => {
  // 10:00 ICT (03:00Z) + 4 biz hours = 14:00 ICT (07:00Z)
  const dayAssign = new Date('2099-05-01T03:00:00.000Z');
  assert.equal(computeDriverPrimarySlaDueAt(dayAssign).toISOString(), '2099-05-01T07:00:00.000Z');

  // 22:00 ICT (15:00Z) -> biz4h=12:00 next day (14h elapsed) capped at +12h = 10:00 ICT (03:00Z next day)
  const nightAssign = new Date('2099-05-01T15:00:00.000Z');
  assert.equal(computeDriverPrimarySlaDueAt(nightAssign).toISOString(), '2099-05-02T03:00:00.000Z');

  assert.equal(computeBackupPoolSlaDueAt(nightAssign).toISOString(), '2099-05-01T19:00:00.000Z');

  const departure = new Date('2099-05-10T10:00:00.000Z');
  // Issued at T-54h -> +24h = T-30h exact
  const issuedLate = new Date(departure.getTime() - 50 * 3600 * 1000); // T-50h -> +24h=T-26h, clamped to T-30h!
  assert.equal(
    computePaymentDueAt(issuedLate, departure).getTime(),
    departure.getTime() - 30 * 3600 * 1000,
  );

  // AC-F3-05: Granted at T-28h -> +10h = T-18h, strictly clamped to T-24h (4h grace)
  const grantAtTMinus28 = new Date(departure.getTime() - 28 * 3600 * 1000);
  assert.equal(
    computeGraceDueAt(grantAtTMinus28, departure).getTime(),
    departure.getTime() - 24 * 3600 * 1000,
  );

  // Granted past T-24h -> throws 409 Conflict
  const grantAtTMinus20 = new Date(departure.getTime() - 20 * 3600 * 1000);
  assert.throws(() => computeGraceDueAt(grantAtTMinus20, departure), (err) => err.getStatus?.() === 409);
});

test('AC-F4-03: 3-tier closed partition & 6h consecutive escalatable amber escalation resists climate_change alert fatigue', () => {
  const cfg = DEFAULT_EQUINE_VITAL_CONFIG;
  const t0 = new Date('2099-06-01T08:00:00.000Z');
  const t1 = new Date('2099-06-01T10:00:00.000Z');
  const t2 = new Date('2099-06-01T12:00:00.000Z');
  const t3 = new Date('2099-06-01T15:00:00.000Z'); // +3h <= 6h
  const tLate = new Date('2099-06-01T19:30:00.000Z'); // +7.5h > 6h

  // 1) Two consecutive climate_change logs with green vitals remain amber_observational (no false Red Alert)
  const r0 = evaluateEquineHealthAlert({ conditionStatus: 'climate_change', temperatureC: 38.0, heartRateBpm: 36, recordedAt: t0 }, null, cfg);
  assert.equal(r0.alertTier, 'amber_observational');
  const r1 = evaluateEquineHealthAlert({ conditionStatus: 'climate_change', temperatureC: 37.5, heartRateBpm: 44, recordedAt: t1 }, { alertTier: r0.alertTier, recordedAt: t0 }, cfg);
  assert.equal(r1.alertTier, 'amber_observational');

  // 2) Closed partition boundary check: 38.55°C and 25 bpm -> amber_escalatable
  const r2 = evaluateEquineHealthAlert({ conditionStatus: 'stable', temperatureC: 38.55, heartRateBpm: 25, recordedAt: t2 }, { alertTier: r1.alertTier, recordedAt: t1 }, cfg);
  assert.equal(r2.alertTier, 'amber_escalatable');

  // 3) Outside 6h window -> stays amber_escalatable
  const rOutOfWindow = evaluateEquineHealthAlert({ conditionStatus: 'not_eating', temperatureC: 38.0, heartRateBpm: 40, recordedAt: tLate }, { alertTier: r2.alertTier, recordedAt: t2 }, cfg);
  assert.equal(rOutOfWindow.alertTier, 'amber_escalatable');

  // 4) Inside 6h window -> escalates to red!
  const r3 = evaluateEquineHealthAlert({ conditionStatus: 'not_eating', temperatureC: 38.0, heartRateBpm: 40, recordedAt: t3 }, { alertTier: r2.alertTier, recordedAt: t2 }, cfg);
  assert.equal(r3.alertTier, 'red');

  // 5) Immediate red boundaries: 39.3°C, 60 bpm, 23 bpm, 36.9°C
  assert.equal(evaluateEquineHealthAlert({ conditionStatus: 'stable', temperatureC: 39.3, heartRateBpm: 36, recordedAt: t3 }, null, cfg).alertTier, 'red');
  assert.equal(evaluateEquineHealthAlert({ conditionStatus: 'stable', temperatureC: 38.0, heartRateBpm: 60, recordedAt: t3 }, null, cfg).alertTier, 'red');
  assert.equal(evaluateEquineHealthAlert({ conditionStatus: 'stable', temperatureC: 38.0, heartRateBpm: 23, recordedAt: t3 }, null, cfg).alertTier, 'red');
  assert.equal(evaluateEquineHealthAlert({ conditionStatus: 'stable', temperatureC: 36.9, heartRateBpm: 36, recordedAt: t3 }, null, cfg).alertTier, 'red');
});

test('BR-F4-05 & DEC-07: backdated >30m check-in requires notes (400), succeeds with notes and persists updatedByRole + isBackdated', async () => {
  const recordedLogs = [];
  const stopUpdates = [];

  const mockStore = {
    findShipmentById: async () => ({
      shipment_id: 505,
      customer_id: 6,
      status: 'in_transit',
      request_code: 'REQ-505',
      origin_location: 'HCM',
      destination_location: 'Singapore',
    }),
    findAssignedStaff: async () => [{ user_id: 5, role_in_shipment: 'driver' }],
    findRouteByShipmentId: async () => ({ route_id: 19, plan_status: 'in_transit' }),
    findStopsByRouteId: async () => [
      { route_stop_id: 71, route_id: 19, leg_id: 81, sequence_no: 2, stop_type: 'rest', location_name: 'Changi Rest', country: 'Singapore', status: 'pending' },
    ],
    findLegsByRouteId: async () => [{ leg_id: 81, sequence_no: 1, leg_type: 'road', status: 'active', actual_departure: new Date() }],
    updateStopStatus: async (...args) => stopUpdates.push(args),
    recordTripStatusLog: async (log) => recordedLogs.push(log),
    findHorseHealthLogs: async () => [],
    findTripStatusLogs: async () => [],
    findUserById: async () => ({ user_id: 5, full_name: 'Driver Five' }),
    findHorsesByShipmentId: async () => [],
    findVehicleByShipmentId: async () => null,
    findAssignedStaffNames: async () => [],
  };

  const svc = new TrackingService(
    mockStore,
    { createNotification: async () => {}, notifyRole: async () => {} },
    {},
    null,
  );
  // Skip tail getTrackingDetails re-query for pure checkInStop verification
  svc.getTrackingDetails = async () => ({ ok: true });

  const oldTs = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const driverUser = { id: '5', role: UserRole.DRIVER_ESCORT, email: 'driver@example.com', specialization: 'driver' };

  // >30m without notes -> 400 BadRequest
  await assert.rejects(
    svc.checkInStop(driverUser, 505, 71, { action: 'arrived', actualTime: oldTs }),
    (err) => err.getStatus?.() === 400,
  );

  // Assigned driver cross check-in at foreign stop + notes passes (DEC-07 & BR-F4-05)
  await svc.checkInStop(driverUser, 505, 71, {
    action: 'arrived',
    actualTime: oldTs,
    notes: 'Mất sóng 4G tại cửa khẩu, nhập bù sau khi có tín hiệu',
  });

  assert.equal(stopUpdates.length, 1);
  assert.equal(stopUpdates[0][6], 'driver');
  assert.equal(stopUpdates[0][7], true);
  assert.equal(recordedLogs.length, 1);
  assert.equal(recordedLogs[0].updatedByRole, 'driver');
  assert.equal(recordedLogs[0].isBackdated, true);
});
