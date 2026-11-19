const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeOtdMetrics, computeExecutiveFinancialMetrics } = require('../dist/modules/reports/reports-calculator');
const { ReportsService } = require('../dist/modules/reports/reports.service');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { RoutesStore } = require('../dist/modules/routes/routes.store');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('AC-RPT-01: OTD tolerance (60m road / 120m air), Adjusted OTD & Executive financial reconciliation match exact spec numbers', () => {
  const basePlanned = new Date('2099-01-10T10:00:00.000Z');
  const otd = computeOtdMetrics([
    { shipmentId: 1, transportMode: 'road', plannedArrival: basePlanned, actualArrival: new Date(basePlanned.getTime() + 45 * 60000), excusedDelay: false },
    { shipmentId: 2, transportMode: 'road', plannedArrival: basePlanned, actualArrival: new Date(basePlanned.getTime() + 60 * 60000), excusedDelay: false },
    { shipmentId: 3, transportMode: 'air', plannedArrival: basePlanned, actualArrival: new Date(basePlanned.getTime() + 110 * 60000), excusedDelay: false },
    { shipmentId: 4, transportMode: 'road', plannedArrival: basePlanned, actualArrival: new Date(basePlanned.getTime() + 95 * 60000), excusedDelay: true },
  ]);

  assert.equal(otd.otdSampleSize, 4);
  assert.equal(otd.onTimeCount, 3);
  assert.equal(otd.lateCount, 1);
  assert.equal(otd.grossOnTimeDeliveryRate, 75);
  assert.equal(otd.adjustedOnTimeDeliveryRate, 100);

  const financials = computeExecutiveFinancialMetrics({
    quotedTransportRevenue: 85_000_000,
    quotedInsuranceRevenue: 15_000_000,
    sepaySucceededTotal: 115_000_000,
    cancelledSepaySucceeded: 15_000_000,
    refundTransferred: 8_000_000,
    creditLiabilityBalance: 5_000_000,
    disbursementOffset: 0,
    operatingCost: 62_000_000,
  });

  assert.equal(financials.quotedActiveRevenue, 100_000_000);
  assert.equal(financials.retainedCancellationRevenue, 2_000_000);
  assert.equal(financials.creditLiabilityBalance, 5_000_000);
  assert.equal(financials.netRealizedCashRevenue, 102_000_000);
  assert.equal(financials.operatingCost, 62_000_000);
  assert.equal(financials.grossProfit, 40_000_000);
});

test('AC-RPT-02: excused_delay succeeds within 48h of actual_arrival_date and throws 409 after 50h', async () => {
  const manager = { id: '2', role: UserRole.LOGISTICS_MANAGER };
  const now = Date.now();
  const arrival20hAgo = new Date(now - 20 * 3600 * 1000);
  const arrival50hAgo = new Date(now - 50 * 3600 * 1000);

  const updates = [];
  const svcRecent = new ReportsService({
    execute: async (sql, params) => {
      if (sql.includes('SELECT s.shipment_id')) {
        return [[{ shipment_id: 10, status: 'completed', actual_arrival_date: arrival20hAgo }]];
      }
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  });

  const okRes = await svcRecent.updateExcusedDelay(manager, 10, {
    excusedDelay: true,
    reason: 'Thông quan biên giới tắc nghẽn bất khả kháng',
  });
  assert.equal(okRes.excusedDelay, true);
  assert.equal(updates.length, 1);

  const svcOld = new ReportsService({
    execute: async () => [[{ shipment_id: 11, status: 'completed', actual_arrival_date: arrival50hAgo }]],
  });
  await assert.rejects(
    svcOld.updateExcusedDelay(manager, 11, { excusedDelay: true, reason: 'Quá hạn' }),
    (err) => err.getStatus?.() === 409,
  );
});

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

  // Specialist approved internally, authority still pending -> non-compliant & leadTime=14
  const chkPending = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkPending.effectiveTierALeadDays, 14);
  assert.equal(chkPending.tierADeadline, '2099-05-06');
  assert.deepEqual(chkPending.matchedBorderGates, ['SIN']);
  assert.equal(chkPending.totalRequiredDocuments, 1); // road_only_doc filtered out
  assert.equal(chkPending.isFullyCompliant, false);

  // Authority approves -> now compliant (May 22 23:59 >= May 20 12:00 + 48h = May 22 12:00)
  docRecord.approvals = [{ id: 1, status: 'approved' }];
  const chkCompliant = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkCompliant.isFullyCompliant, true);

  // Schedule shifts expected arrival to May 21 12:00 -> May 21 12:00 + 48h = May 23 12:00 > May 22 -> EXPIRED (AC-F2-02)
  orderRow.expected_arrival_date = '2099-05-21T12:00:00.000Z';
  const chkShifted = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 77);
  assert.equal(chkShifted.hasExpiredDocuments, true);
  assert.equal(chkShifted.isFullyCompliant, false);
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
          expiryDate: '2099-05-21', // OK for 19T10+48h=21T10, FAILS for 20T10+48h=22T10!
          status: 'approved',
          isArchived: false,
          approvals: [{ id: 1, documentId: 901, status: 'approved' }],
        },
      ],
      hasRequirementsSent: async () => true,
    },
    { createNotification: async () => {} },
    { changed: async () => {} },
  );

  const chk = await docService.getOrderComplianceChecklist({ id: '6', role: UserRole.CUSTOMER }, 88);
  assert.equal(chk.tripTargetDate, '2099-05-20');
  assert.equal(chk.hasExpiredDocuments, true);
  assert.equal(chk.isFullyCompliant, false);
});
