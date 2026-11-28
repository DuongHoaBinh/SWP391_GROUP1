const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { RoutesStore } = require('../dist/modules/routes/routes.store');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('AC-F2-01 & AC-F2-02: multi-dim gate filtering, lead_time_days=14, 2-tier authority gating & 48h safety buffer', async () => {
  let docRecord = {
    id: 501,
    horseId: 9,
    regulationId: 88,
    docType: 'import_permit',
    status: 'approved',
    expiryDate: '2099-05-22',
    approvals: [{ id: 1, status: 'pending' }],
  };

  let orderRow = {
    shipment_id: 77,
    customer_id: 6,
    origin_location: 'TP.HCM, Vietnam',
    destination_location: 'Singapore Turf Club, Singapore',
    status: 'ready_to_depart',
    booking_type: 'shared_stall',
    transport_mode: 'air',
    transportation_type: 'International',
    requested_date: '2099-05-01T08:00:00.000Z',
    departure_date: '2099-05-20T08:00:00.000Z',
    expected_arrival_date: '2099-05-20T12:00:00.000Z',
    arrival_airport_codes: 'SIN',
    in_transit_compliance_alert: 0,
  };

  const docService = new DocumentsService(
    {
      findOrderDetails: async () => orderRow,
      findRegulations: async () => [
        {
          id: 88,
          country: 'Singapore',
          borderGate: 'SIN',
          transportMode: 'air',
          docTier: 'A',
          leadTimeDays: 14,
          requiresAuthorityApproval: true,
          minValidityBufferHours: 48,
          documentType: 'import_permit',
        },
        {
          id: 89,
          country: 'Singapore',
          borderGate: 'OTHER_GATE',
          transportMode: 'road',
          docTier: 'A',
          leadTimeDays: 2,
          requiresAuthorityApproval: false,
          minValidityBufferHours: 48,
          documentType: 'road_only_doc',
        },
      ],
      findHorsesInOrder: async () => [{ horse_id: 9, name: 'Thunder' }],
      findDocumentsByHorseId: async () => [docRecord],
      hasRequirementsSent: async () => true,
    },
    {},
    {},
  );

  // Manager approved internally, authority still pending -> non-compliant; Cách A clears Tier A deadline fields
  const chkPending = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkPending.effectiveTierALeadDays, 0);
  assert.equal(chkPending.tierADeadline, null);
  assert.deepEqual(chkPending.matchedBorderGates, ['SIN']);
  assert.equal(chkPending.totalRequiredDocuments, 1); // road_only_doc filtered out
  assert.equal(chkPending.isFullyCompliant, false);

  // Authority approves -> now compliant
  docRecord.approvals = [{ id: 1, status: 'approved' }];
  const chkCompliant = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkCompliant.isFullyCompliant, true);

  // Cách A: schedule shift does not auto-invalidate a Manager-approved document
  orderRow.expected_arrival_date = '2099-05-21T12:00:00.000Z';
  const chkShifted = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkShifted.hasExpiredDocuments, false);
  assert.equal(chkShifted.isFullyCompliant, true);

  // Explicit DB status='expired' still flags hasExpiredDocuments & blocks compliance
  docRecord.status = 'expired';
  const chkExpired = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkExpired.hasExpiredDocuments, true);
  assert.equal(chkExpired.isFullyCompliant, false);
});

test('AC-F2-03: expired compliance while in_transit keeps status in_transit, sets alert, and blocks customs_cleared (422)', async () => {
  const executedSql = [];
  const notifications = [];
  let inTransitAlert = 0;

  // 1. RoutesStore.applyDepartureReadiness keeps in_transit and toggles alert
  const rStore = new RoutesStore();
  rStore.pool = {
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      execute: async (sql, args) => {
        executedSql.push([sql, args]);
        if (sql.includes('FROM shipment WHERE')) return [[{ shipment_id: 95, customer_id: 6, status: 'in_transit', total_cost: 1000000 }]];
        if (sql.includes('FROM route WHERE')) return [[{ route_id: 22, plan_status: 'in_transit' }]];
        if (sql.includes('FROM route_leg')) return [[{ cnt: 1 }]];
        if (sql.includes('FROM shipment_invoice')) return [[{ invoice_id: 1, amount: 1000000 }]];
        if (sql.includes('FROM shipment_sepay_payment')) return [[{ status: 'succeeded', amount: 1000000 }]];
        return [[{ unconfirmed: 0 }]];
      },
    }),
  };

  const gateRes = await rStore.applyDepartureReadiness(95, false);
  assert.equal(gateRes.currentShipmentStatus, 'in_transit');
  assert.ok(executedSql.some(([s, a]) => s.includes('UPDATE shipment SET in_transit_compliance_alert = ?') && a[0] === 1));
  assert.ok(!executedSql.some(([s]) => s.includes("SET status = 'confirmed'")));

  // 2. TrackingService blocks customs_cleared with 422 when compliance expires mid-trip
  const trackingStore = {
    findShipmentById: async () => ({
      shipment_id: 95,
      customer_id: 6,
      status: 'in_transit',
      request_code: 'REQ-095',
      in_transit_compliance_alert: inTransitAlert,
    }),
    findRouteByShipmentId: async () => ({ route_id: 22, plan_status: 'in_transit' }),
    findAssignedStaff: async () => [{ user_id: 21, role_in_shipment: 'escort' }],
    findStopsByRouteId: async () => [
      { route_stop_id: 81, route_id: 22, leg_id: 35, sequence_no: 1, stop_type: 'border_check', location_name: 'Changi SIN', country: 'Singapore', status: 'arrived' },
    ],
    findLegsByRouteId: async () => [{ leg_id: 35, sequence_no: 1, leg_type: 'road', status: 'active', actual_departure: new Date() }],
  };

  const trackingSvc = new TrackingService(
    trackingStore,
    { createNotification: async () => {}, notifyRole: async (...args) => notifications.push(args) },
    {},
    {
      isFlow2CompletedForPayment: async () => false,
      flagInTransitComplianceAlert: async () => {
        inTransitAlert = 1;
        notifications.push(['alert']);
      },
    },
  );

  await assert.rejects(
    trackingSvc.checkInStop({ id: '21', role: UserRole.DRIVER_ESCORT, email: 'escort1@example.com', specialization: 'escort' }, 95, 81, {
      action: 'customs_cleared',
    }),
    (err) => err.getStatus?.() === 422 && err.getResponse?.().missingRequirements?.includes('valid_in_transit_compliance'),
  );
  assert.equal(inTransitAlert, 1);
  assert.ok(notifications.length >= 1);
});

test('DocumentsStore.formatMysqlDateOnly avoids UTC-offset backward shift & stop_expected_arrival overrides earlier leg arrival', async () => {
  const { DocumentsStore } = require('../dist/modules/documents/documents.store');
  const formatFn = DocumentsStore.prototype.formatMysqlDateOnly;
  // Local midnight Date in GMT+7 (or any timezone) must stay calendar date 2026-12-11
  assert.equal(formatFn.call(null, new Date(2026, 11, 11, 0, 0, 0)), '2026-12-11');
  assert.equal(formatFn.call(null, '2026-12-11'), '2026-12-11');
  assert.equal(formatFn.call(null, null), null);

  const orderRow = {
    shipment_id: 88,
    customer_id: 6,
    destination_location: 'Singapore Turf Club, Singapore',
    origin_location: 'TP.HCM, Vietnam',
    status: 'ready_to_depart',
    booking_type: 'shared_stall',
    transport_mode: 'air',
    transportation_type: 'International',
    departure_date: '2099-05-19T02:00:00.000Z',
    route_expected_arrival: '2099-05-19T10:00:00.000Z',
    stop_expected_arrival: '2099-05-20T10:00:00.000Z',
    expected_arrival_date: '2099-05-20T10:00:00.000Z',
    arrival_airport_codes: 'SIN',
  };

  let docStatus = 'approved';
  const docService = new DocumentsService(
    {
      findOrderDetails: async () => orderRow,
      findRegulations: async () => [
        { id: 30, country: 'Singapore', borderGate: null, transportMode: 'air', docTier: 'A', leadTimeDays: 5, requiresAuthorityApproval: true, minValidityBufferHours: 48, documentType: 'import_permit' },
      ],
      findHorsesInOrder: async () => [{ horse_id: 1, name: 'Comet', owner_id: 6 }],
      findDocumentsByHorseId: async () => [
        {
          id: 901,
          horseId: 1,
          regulationId: 30,
          docType: 'import_permit',
          expiryDate: '2099-05-21',
          status: docStatus,
          isArchived: false,
          approvals: [{ id: 1, documentId: 901, status: 'approved' }],
        },
      ],
      hasRequirementsSent: async () => true,
    },
    { createNotification: async () => {} },
    { changed: async () => {} },
  );

  const chkApproved = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 88);
  assert.equal(chkApproved.tripTargetDate, '2099-05-20');
  assert.equal(chkApproved.hasExpiredDocuments, false);
  assert.equal(chkApproved.isFullyCompliant, true);

  docStatus = 'expired';
  const chkExpired = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 88);
  assert.equal(chkExpired.tripTargetDate, '2099-05-20');
  assert.equal(chkExpired.hasExpiredDocuments, true);
  assert.equal(chkExpired.isFullyCompliant, false);
});

// --- Flow 3: tài xế/áp tải từ chối sau khi kế hoạch đã confirmed ---
{
  const makeDeclineStore = ({ shipmentStatus, planStatus, affectedRows = 1 }) => {
    const sqls = [];
    const state = { committed: false, rolledBack: false };
    const conn = {
      beginTransaction: async () => {},
      commit: async () => { state.committed = true; },
      rollback: async () => { state.rolledBack = true; },
      release: () => {},
      execute: async (sql, args) => {
        sqls.push({ sql, args });
        if (/SELECT status FROM shipment WHERE/.test(sql)) return [[{ status: shipmentStatus }]];
        if (/FROM route WHERE shipment_id/.test(sql)) return [planStatus ? [{ route_id: 9, plan_status: planStatus }] : []];
        if (/UPDATE shipment_assignment/.test(sql)) return [{ affectedRows }];
        return [{ affectedRows: 1 }];
      },
      query: async (sql, args) => {
        sqls.push({ sql, args });
        if (/SELECT status, payment_flow FROM shipment/.test(sql)) return [[{ status: shipmentStatus, payment_flow: 'prepaid' }]];
        return [{ affectedRows: 1 }];
      },
    };
    const store = new RoutesStore({}, { getConnection: async () => conn });
    return { store, sqls, state };
  };

  for (const [shipmentStatus, planStatus] of [['confirmed', 'confirmed'], ['ready_to_depart', 'ready_to_depart']]) {
    test(`F3-decline: từ chối khi ${shipmentStatus} → route về approved, đơn về planning có lịch sử`, async () => {
      const { store, sqls, state } = makeDeclineStore({ shipmentStatus, planStatus });
      const res = await store.declineStaffAssignment(77, 5, 'Ốm đột xuất');
      assert.deepEqual(res, { declined: true, reverted: true, previousStatus: shipmentStatus });
      assert.equal(state.committed, true);
      assert.ok(sqls.some((s) => /UPDATE route SET plan_status = 'approved'/.test(s.sql)));
      const toPlanning = sqls.find((s) => /UPDATE shipment SET status = \?/.test(s.sql));
      assert.equal(toPlanning.args[0], 'planning');
      const hist = sqls.find((s) => /INSERT INTO shipment_status_history/.test(s.sql));
      assert.equal(hist.args[2], 'planning');
      assert.equal(hist.args[5], 'staff_declined');
      // chỉ cập nhật phân công tài xế/áp tải
      assert.ok(sqls.some((s) => /UPDATE shipment_assignment[\s\S]*role_in_shipment IN \('driver', 'escort'\)/.test(s.sql)));
    });
  }

  test('F3-decline: từ chối khi kế hoạch còn approved/planning → không đổi trạng thái', async () => {
    const { store, sqls } = makeDeclineStore({ shipmentStatus: 'planning', planStatus: 'approved' });
    const res = await store.declineStaffAssignment(77, 5, 'Bận');
    assert.deepEqual(res, { declined: true, reverted: false, previousStatus: 'planning' });
    assert.ok(!sqls.some((s) => /UPDATE route SET plan_status/.test(s.sql)));
    assert.ok(!sqls.some((s) => /INSERT INTO shipment_status_history/.test(s.sql)));
  });

  for (const shipmentStatus of ['in_transit', 'return_pending', 'completed', 'cancelled']) {
    test(`F3-decline: không cho từ chối khi đơn ${shipmentStatus}`, async () => {
      const { store, sqls, state } = makeDeclineStore({ shipmentStatus, planStatus: 'in_transit' });
      await assert.rejects(store.declineStaffAssignment(77, 5, 'x'), (e) => e.getStatus?.() === 409);
      assert.equal(state.rolledBack, true);
      assert.ok(!sqls.some((s) => /UPDATE shipment_assignment/.test(s.sql)));
    });
  }

  test('F3-decline: người không được phân công tài xế/áp tải → declined=false, không đổi kế hoạch', async () => {
    const { store, sqls, state } = makeDeclineStore({ shipmentStatus: 'confirmed', planStatus: 'confirmed', affectedRows: 0 });
    const res = await store.declineStaffAssignment(77, 99, 'x');
    assert.equal(res.declined, false);
    assert.equal(state.rolledBack, true);
    assert.ok(!sqls.some((s) => /UPDATE route SET plan_status/.test(s.sql)));
  });
}
