const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');

const { InsuranceClaimStore } = require('../dist/modules/orders/insurance-claim.store');
const { InsuranceClaimService } = require('../dist/modules/orders/insurance-claim.service');
const { OrdersOpsStore } = require('../dist/modules/orders/orders-ops.store');
const { OrdersStore } = require('../dist/modules/orders/orders.store');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { TrackingStore } = require('../dist/modules/tracking/tracking.store');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { HandoverStore } = require('../dist/modules/tracking/handover.store');
const { CreateRegulationDto } = require('../dist/modules/documents/dto/create-regulation.dto');
const { UpdateRegulationDto } = require('../dist/modules/documents/dto/update-regulation.dto');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('Part A: ReportsModule is completely removed from AppModule', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  assert.equal(fs.existsSync(path.join(__dirname, '../src/modules/reports')), false);
  const appModuleSrc = fs.readFileSync(path.join(__dirname, '../src/app.module.ts'), 'utf8');
  assert.doesNotMatch(appModuleSrc, /ReportsModule/);
});

test('Part B: InsuranceClaimStore.submitClaimRefundForm validates ownership, amount, duplicate submit, and persists bank details', async () => {
  const executed = [];
  let refundRow = {
    refund_id: 501,
    shipment_id: 12,
    customer_id: 6,
    cancellation_category: 'insurance_claim',
    status: 'pending_approval',
    form_submitted_at: null,
    recipient_bank_account: null,
  };

  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params) => {
      executed.push({ sql, params });
      if (sql.includes('SELECT * FROM insurance_claim WHERE claim_id = ? FOR UPDATE')) {
        return [[{
          claim_id: 88,
          shipment_id: 12,
          customer_id: 6,
          status: 'approved',
          approved_amount: 15_000_000,
          refund_record_id: 501,
        }]];
      }
      if (sql.includes('SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE')) {
        return [[{ ...refundRow }]];
      }
      if (sql.includes('UPDATE shipment_refund_record')) {
        refundRow.recipient_bank_name = params[0];
        refundRow.recipient_bank_account = params[1];
        refundRow.recipient_account_holder = params[2];
        refundRow.customer_note = params[3];
        refundRow.form_submitted_at = new Date();
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };

  const store = new InsuranceClaimStore({ getConnection: async () => conn });

  // Wrong owner -> 403
  await assert.rejects(
    store.submitClaimRefundForm(88, 999, {
      bankName: 'Vietcombank',
      accountNumber: '1234567890',
      accountHolder: 'NGUYEN VAN B',
      confirmAmount: 15_000_000,
    }),
    (err) => err.getStatus?.() === 403,
  );

  // Wrong confirmAmount -> 409
  await assert.rejects(
    store.submitClaimRefundForm(88, 6, {
      bankName: 'Vietcombank',
      accountNumber: '1234567890',
      accountHolder: 'NGUYEN VAN A',
      confirmAmount: 10_000_000,
    }),
    (err) => err.getStatus?.() === 409,
  );

  // Valid submission succeeds
  const res = await store.submitClaimRefundForm(88, 6, {
    bankName: 'Vietcombank (VCB)',
    accountNumber: '0123456789',
    accountHolder: 'nguyen van a',
    confirmAmount: 15_000_000,
    note: 'Chuyển vào tài khoản chính',
  });
  assert.equal(res.claimId, 88);
  assert.equal(res.refundId, 501);
  assert.equal(res.accountHolder, 'NGUYEN VAN A');
  assert.ok(executed.some((e) => e.sql.includes('UPDATE shipment_refund_record') && e.sql.includes('form_submitted_at = NOW()')));
  assert.ok(executed.some((e) => e.sql.includes('INSERT INTO insurance_claim_event')));

  // Duplicate submission -> 409
  await assert.rejects(
    store.submitClaimRefundForm(88, 6, {
      bankName: 'Vietcombank (VCB)',
      accountNumber: '0123456789',
      accountHolder: 'NGUYEN VAN A',
      confirmAmount: 15_000_000,
    }),
    (err) => err.getStatus?.() === 409,
  );
});

test('Part B: InsuranceClaimService.reviewClaim(approve) notifies customer with refund-form link & OrdersOpsStore.approveRefund blocks until customer submits bank info', async () => {
  const notifs = [];
  const claimSvc = new InsuranceClaimService(
    {
      findClaimById: async () => ({
        id: 77,
        shipmentId: 12,
        shipmentHorseId: 3,
        customerId: 6,
        severity: 'M2',
        packageCode: 'standard',
        policyVersion: 'equine-v2',
        declaredValueVnd: 100_000_000,
        vetCostVnd: null,
        horseName: 'Thunder',
        requestCode: 'REQ-012',
      }),
      findRulesByVersion: async () => [],
      reviewClaim: async () => ({
        claim: { id: 77, status: 'approved', approvedAmount: 15_000_000, refundRecordId: 502 },
        refundRecordId: 502,
      }),
      findClaimEvents: async () => [],
    },
    {},
    {
      createNotification: async (...args) => notifs.push(args),
      notifyRole: async (...args) => notifs.push(args),
    },
  );

  await claimSvc.reviewClaim(
    { id: '2', role: UserRole.LOGISTICS_MANAGER },
    77,
    { decision: 'approve', approvedAmount: 15_000_000, reason: 'Đủ chứng từ' },
  );
  assert.equal(notifs.length, 1);
  assert.match(notifs[0][2], /\/customer\/requests\/12\/refund\?claimId=77/);

  // OrdersOpsStore.approveRefund must block insurance_claim without form_submitted_at
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      if (sql.includes('SELECT * FROM shipment_refund_record WHERE refund_id = ? FOR UPDATE')) {
        return [[{
          refund_id: 502,
          shipment_id: 12,
          customer_id: 6,
          cancellation_category: 'insurance_claim',
          refund_mode: 'cash_refund',
          status: 'pending_approval',
          requires_dual_approval: 1,
          form_submitted_at: null,
          recipient_bank_account: null,
        }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const opsStore = new OrdersOpsStore({ getConnection: async () => conn });
  await assert.rejects(
    opsStore.approveRefund(502, 2, 'approve'),
    (err) => err.getStatus?.() === 409 && /chưa điền thông tin tài khoản/i.test(err.message),
  );
});

test('Part C1: Anti double-dip SQL includes paid status on both InsuranceClaimStore and HandoverStore', async () => {
  const claimSqls = [];
  const cStore = new InsuranceClaimStore({
    execute: async (sql) => {
      claimSqls.push(sql);
      return [[{ claim_total: 50_000_000, handover_total: 0 }]];
    },
  });
  await cStore.sumPriorCompensationForHorse(10);
  assert.match(claimSqls[0], /status IN \('approved', 'paid'\)/);

  const handoverSqls = [];
  const hStore = new HandoverStore({
    execute: async (sql) => {
      handoverSqls.push(sql);
      return [[{ total_claimed: 50_000_000 }]];
    },
  });
  await hStore.sumExistingClaimCompensation(10);
  assert.match(handoverSqls[0], /'paid'/);
});

test('Part C1: SQL fixes for released_reason (cancelReturnLeg) and depot.name (geofence)', async () => {
  const orderSqls = [];
  const oConn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      orderSqls.push(sql);
      if (sql.includes('SELECT status, return_status, customer_id FROM shipment')) {
        return [[{ status: 'confirmed', return_status: 'scheduled', customer_id: 6 }]];
      }
      if (sql.includes('shipment_sepay_payment')) return [[{ paid_total: 0 }]];
      if (sql.includes('shipment_invoice')) return [[{ cnt: 0 }]];
      return [{ affectedRows: 1 }];
    },
  };
  const oStore = new OrdersStore({ getConnection: async () => oConn });
  await oStore.cancelReturnLeg({
    shipmentId: 20,
    actorId: 6,
    cause: 'customer',
    reason: 'Hủy chặng về',
    refund: { total: 0, freightRefund: 0, insuranceRefund: 0 },
  });
  assert.ok(orderSqls.some((s) => s.includes('released_reason = ?')), 'Must use released_reason, not release_reason');
  assert.ok(!orderSqls.some((s) => s.includes('release_reason = ?')));

  const trackingSqls = [];
  const tStore = new TrackingStore({
    execute: async (sql) => {
      trackingSqls.push(sql);
      if (sql.includes('FROM depot')) return [[{ lat: 10.95, lng: 106.5 }]];
      return [[]];
    },
  });
  const coords = await tStore.resolveLocationCoords('Trạm Củ Chi');
  assert.deepEqual(coords, { lat: 10.95, lng: 106.5, refType: 'depot' });
  assert.ok(trackingSqls.some((s) => s.includes('FROM depot WHERE LOWER(name) LIKE LOWER(?)')));
});

test('Part C1: Round-trip air tracking preserves all outbound & return legs instead of amputating to 3 legs', () => {
  const svc = new TrackingService({}, {}, {});
  const legs = [
    { leg_id: 1, sequence_no: 1, leg_type: 'road', direction: 'outbound', origin_location: 'Củ Chi', destination_location: 'SGN', status: 'completed', actual_departure: new Date(), actual_arrival: new Date() },
    { leg_id: 2, sequence_no: 2, leg_type: 'flight', direction: 'outbound', origin_location: 'SGN', destination_location: 'SIN', status: 'completed', actual_departure: new Date(), actual_arrival: new Date() },
    { leg_id: 3, sequence_no: 3, leg_type: 'road', direction: 'outbound', origin_location: 'SIN', destination_location: 'Turf Club', status: 'completed', actual_departure: new Date(), actual_arrival: new Date() },
    { leg_id: 4, sequence_no: 4, leg_type: 'road', direction: 'return', origin_location: 'Turf Club', destination_location: 'SIN', status: 'pending', actual_departure: null, actual_arrival: null },
    { leg_id: 5, sequence_no: 5, leg_type: 'flight', direction: 'return', origin_location: 'SIN', destination_location: 'SGN', status: 'pending', actual_departure: null, actual_arrival: null },
    { leg_id: 6, sequence_no: 6, leg_type: 'road', direction: 'return', origin_location: 'SGN', destination_location: 'Củ Chi', status: 'pending', actual_departure: null, actual_arrival: null },
  ];
  const milestones = svc.buildMilestonesTimeline(legs, [], []);
  const legIds = new Set(milestones.map((m) => m.legId).filter(Boolean));
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.ok(legIds.has(id), `Expected round-trip air timeline to retain leg #${id}`);
  }
});

test('Part C2: rescheduleReturnLeg rejects cancelled/unpaid orders & Create/UpdateRegulationDto accept sea', async () => {
  const ordersSvc = new OrdersService(
    {
      findShipmentById: async () => ({
        id: 30,
        customerId: 6,
        tripType: 'round_trip',
        returnStatus: 'scheduled',
        status: 'cancelled',
        returnDepartureAt: '2099-06-10T08:00:00.000Z',
      }),
    },
    { createNotification: async () => {}, notifyRole: async () => {} },
  );

  await assert.rejects(
    ordersSvc.rescheduleReturnLeg({ id: '6', role: UserRole.CUSTOMER }, 30, '2099-06-15T08:00:00.000Z'),
    (err) => err.getStatus?.() === 409,
  );

  const createDto = plainToInstance(CreateRegulationDto, {
    country: 'Singapore',
    documentType: 'port_quarantine_cert',
    transportMode: 'sea',
  });
  const createErrors = await validate(createDto);
  assert.equal(createErrors.length, 0, `Expected sea mode to pass CreateRegulationDto validation: ${JSON.stringify(createErrors)}`);

  const updateDto = plainToInstance(UpdateRegulationDto, { transportMode: 'sea' });
  const updateErrors = await validate(updateDto);
  assert.equal(updateErrors.length, 0, `Expected sea mode to pass UpdateRegulationDto validation: ${JSON.stringify(updateErrors)}`);
});

test('Part C2: markReturnNoShow protects maintenance/busy vehicles and releases reservations', async () => {
  const sqls = [];
  const tStore = new TrackingStore({
    execute: async (sql) => {
      sqls.push(sql);
      return [{ affectedRows: 1 }];
    },
  });
  await tStore.markReturnNoShow({ shipmentId: 40, actorId: 5 });
  const vehSql = sqls.find((s) => s.includes('UPDATE vehicle v'));
  assert.ok(vehSql, 'Expected vehicle release query');
  assert.match(vehSql, /v\.status = 'in_use'/);
  assert.match(vehSql, /NOT EXISTS/);
  assert.ok(sqls.some((s) => s.includes('UPDATE vehicle_reservation') && s.includes('released_reason')), 'Expected releaseShipmentReservations call');
});
