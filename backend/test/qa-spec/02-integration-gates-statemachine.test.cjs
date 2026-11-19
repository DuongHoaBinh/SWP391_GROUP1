const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  openTestDbConnection,
  resetTestDatabase,
  dropTestDatabase,
  startTestServer,
  stopTestServer,
  api,
  login,
  sendSepayWebhook,
  SEPAY_ACCOUNT_NUMBER,
} = require('./test-db-harness.cjs');

function makePdfBlob() {
  return new Blob([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')], {
    type: 'application/pdf',
  });
}

function makePngBlob() {
  return new Blob(
    [
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]),
    ],
    { type: 'image/png' },
  );
}

function daysFromNowIso(days, addHours = 0) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
    days * 86_400_000 +
    addHours * 3_600_000;
  return new Date(base).toISOString();
}

function formatDateOnly(iso) {
  return iso.split('T')[0];
}

function unlinkUploadedRel(relUrl) {
  if (!relUrl || typeof relUrl !== 'string') return;
  let target = null;
  if (relUrl.startsWith('/uploads/')) {
    target = path.resolve(__dirname, '../..', relUrl.replace(/^\/+/, ''));
  } else if (relUrl.startsWith('/api/tracking/health-logs/attachments/')) {
    target = path.resolve(__dirname, '../../uploads/health-logs', path.basename(relUrl));
  }
  if (target && fs.existsSync(target)) {
    try {
      fs.unlinkSync(target);
    } catch {}
  }
}

describe('QA Spec v3.1 Tier 2/6/7: Reports Reconciliation, State Machine, Gates & Timezones', () => {
  const createdUploadUrls = [];

  after(async () => {
    for (const rel of createdUploadUrls) unlinkUploadedRel(rel);
    await dropTestDatabase();
  });

  test('Tầng 7 & AC-RPT-01 & AC-RPT-02: Empty DB has 0/null rates (not 98.6/100), exact reconciliation math, and 48h excused_delay lock', async () => {
    const seed = await resetTestDatabase();
    const server = await startTestServer();
    const db = await openTestDbConnection();

    try {
      const mgrToken = await login('manager.a@test.local');
      const custToken = await login('cust.a@test.local');

      // 1. Empty DB -> no hardcoded 98.6% or 100%
      const emptyRes = await api('/reports/performance', { token: mgrToken });
      assert.equal(emptyRes.status, 200);
      assert.equal(emptyRes.body.metrics.completedTrips, 0);
      assert.equal(emptyRes.body.metrics.onTimeDeliveryRate, 0);
      assert.equal(emptyRes.body.metrics.grossOnTimeDeliveryRate, 0);
      assert.ok(
        emptyRes.body.metrics.quarantinePassRate === 0 || emptyRes.body.metrics.quarantinePassRate === null,
        `Empty DB quarantinePassRate must be 0 or null (got ${emptyRes.body.metrics.quarantinePassRate})`,
      );

      // 2. Customer forbidden on GET /reports/performance (403)
      const custRes = await api('/reports/performance', { token: custToken });
      assert.equal(custRes.status, 403);

      // 3. Seed exact AC-RPT-01 fixture in horse_transport_test
      const custId = seed.users['cust.a@test.local'].id;
      const mgrId = seed.users['manager.a@test.local'].id;

      const insertCompletedRoad = async ({
        hoursAgoActual,
        delayMinutes,
        transportCost,
        insuranceFee,
        paidAmount,
      }) => {
        const actualMs = Date.now() - hoursAgoActual * 3600 * 1000;
        const plannedMs = actualMs - delayMinutes * 60 * 1000;
        const totalCost = transportCost + insuranceFee;
        const [ins] = await db.execute(
          `INSERT INTO shipment
           (customer_id, requested_by, approved_by, contact_name, contact_phone, contact_email,
            requested_horse_count, origin_location, destination_location, requested_date, departure_date,
            expected_arrival_date, actual_arrival_date, transportation_type, transport_mode, booking_type,
            status, transport_cost, insurance_fee, total_cost)
           VALUES (?, ?, ?, 'QA Owner', '0900000001', 'cust.a@test.local',
                   1, 'Củ Chi, Vietnam', 'Đà Nẵng, Vietnam', NOW(), DATE_SUB(NOW(), INTERVAL 3 DAY),
                   ?, ?, 'Domestic', 'road', 'shared_stall',
                   'completed', ?, ?, ?)`,
          [
            custId,
            custId,
            mgrId,
            new Date(plannedMs),
            new Date(actualMs),
            transportCost,
            insuranceFee,
            totalCost,
          ],
        );
        const sid = Number(ins.insertId);
        await db.execute(
          `INSERT INTO shipment_horse
           (shipment_id, horse_id, quantity, declared_value, declared_currency, exchange_rate, declared_value_vnd,
            insurance_package, insurance_fee, max_compensation, emergency_vet_covered, insurance_policy_version)
           VALUES (?, ?, 1, 100000000, 'VND', 1, 100000000, 'standard', ?, 80000000, FALSE, 'equine-v1')`,
          [sid, seed.horses.thunder, insuranceFee],
        );
        await db.execute(
          `INSERT INTO shipment_sepay_payment
           (shipment_id, customer_id, payment_code, amount, bank_code, account_number, account_name, status, paid_at)
           VALUES (?, ?, ?, ?, 'MB', ?, 'EQUITRANSIT QA', 'succeeded', NOW())`,
          [sid, custId, `DH${String(10000000 + sid)}`, paidAmount, SEPAY_ACCOUNT_NUMBER],
        );
        return sid;
      };

      const sOn1 = await insertCompletedRoad({
        hoursAgoActual: 5,
        delayMinutes: 0,
        transportCost: 22_500_000,
        insuranceFee: 2_500_000,
        paidAmount: 25_000_000,
      });
      await insertCompletedRoad({
        hoursAgoActual: 10,
        delayMinutes: 30,
        transportCost: 22_500_000,
        insuranceFee: 2_500_000,
        paidAmount: 25_000_000,
      });
      await insertCompletedRoad({
        hoursAgoActual: 12,
        delayMinutes: 60,
        transportCost: 22_500_000,
        insuranceFee: 2_500_000,
        paidAmount: 25_000_000,
      });
      const sLate50h = await insertCompletedRoad({
        hoursAgoActual: 50,
        delayMinutes: 95,
        transportCost: 22_500_000,
        insuranceFee: 2_500_000,
        paidAmount: 25_000_000,
      });

      // Operating cost: 62,000,000 VND
      await db.execute(
        `INSERT INTO shipment_operating_cost (shipment_id, cost_category, amount, notes, recorded_by)
         VALUES (?, 'fuel', 62000000, 'QA fuel & toll total', ?)`,
        [sOn1, mgrId],
      );

      // Cancelled 1: Paid 10M, cash refund transferred 8M -> retained 2M
      const [c1] = await db.execute(
        `INSERT INTO shipment
         (customer_id, requested_by, approved_by, contact_name, contact_phone, contact_email,
          requested_horse_count, origin_location, destination_location, requested_date, transportation_type,
          transport_mode, booking_type, status, transport_cost, insurance_fee, total_cost, cancellation_category)
         VALUES (?, ?, ?, 'QA Owner', '0900000001', 'cust.a@test.local',
                 1, 'Củ Chi, Vietnam', 'Đà Nẵng, Vietnam', NOW(), 'Domestic',
                 'road', 'dedicated_charter', 'cancelled_operational', 8000000, 2000000, 10000000, 'customer_request_post_approval')`,
        [custId, custId, mgrId],
      );
      const cid1 = Number(c1.insertId);
      await db.execute(
        `INSERT INTO shipment_sepay_payment
         (shipment_id, customer_id, payment_code, amount, bank_code, account_number, account_name, status, paid_at)
         VALUES (?, ?, ?, 10000000, 'MB', ?, 'EQUITRANSIT QA', 'succeeded', NOW())`,
        [cid1, custId, `DH${String(10000000 + cid1)}`, SEPAY_ACCOUNT_NUMBER],
      );
      await db.execute(
        `INSERT INTO shipment_refund_record
         (shipment_id, customer_id, cancellation_category, refund_mode, freight_refund_amount, insurance_refund_amount,
          amount, status, requested_by, approved_by, transferred_by)
         VALUES (?, ?, 'customer_request_post_approval', 'cash_refund', 6000000, 2000000, 8000000, 'transferred', ?, ?, ?)`,
        [cid1, custId, mgrId, mgrId, seed.users['admin.qa@test.local'].id],
      );

      // Cancelled 2: Paid 5M, converted_to_credit 5M (liability, NOT realized revenue)
      const [c2] = await db.execute(
        `INSERT INTO shipment
         (customer_id, requested_by, approved_by, contact_name, contact_phone, contact_email,
          requested_horse_count, origin_location, destination_location, requested_date, transportation_type,
          transport_mode, booking_type, status, transport_cost, insurance_fee, total_cost, cancellation_category)
         VALUES (?, ?, ?, 'QA Owner', '0900000001', 'cust.a@test.local',
                 1, 'Củ Chi, Vietnam', 'Đà Nẵng, Vietnam', NOW(), 'Domestic',
                 'road', 'dedicated_charter', 'cancelled_operational', 4000000, 1000000, 5000000, 'vet_unfit_certified')`,
        [custId, custId, mgrId],
      );
      const cid2 = Number(c2.insertId);
      await db.execute(
        `INSERT INTO shipment_sepay_payment
         (shipment_id, customer_id, payment_code, amount, bank_code, account_number, account_name, status, paid_at)
         VALUES (?, ?, ?, 5000000, 'MB', ?, 'EQUITRANSIT QA', 'succeeded', NOW())`,
        [cid2, custId, `DH${String(10000000 + cid2)}`, SEPAY_ACCOUNT_NUMBER],
      );
      await db.execute(
        `INSERT INTO shipment_refund_record
         (shipment_id, customer_id, cancellation_category, refund_mode, freight_refund_amount, insurance_refund_amount,
          amount, status, requested_by, approved_by, credit_expires_at)
         VALUES (?, ?, 'vet_unfit_certified', 'credit_30d', 4000000, 1000000, 5000000, 'converted_to_credit', ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
        [cid2, custId, mgrId, mgrId],
      );

      const rptRes = await api('/reports/performance', { token: mgrToken });
      assert.equal(rptRes.status, 200);
      const m = rptRes.body.metrics;
      assert.equal(m.grossOnTimeDeliveryRate, 75);
      assert.equal(m.quotedActiveRevenue, 100_000_000);
      assert.equal(m.retainedCancellationRevenue, 2_000_000);
      assert.equal(m.creditLiabilityBalance, 5_000_000);
      assert.equal(m.netRealizedCashRevenue, 102_000_000);
      assert.equal(m.operatingCost, 62_000_000);
      assert.equal(m.grossProfit, 40_000_000);

      // AC-RPT-02: excused_delay after 50h returns 409 Conflict
      const excuseLateRes = await api(`/reports/shipments/${sLate50h}/excused-delay`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ excusedDelay: true, reason: 'Force majeure after 50h' }),
      });
      assert.equal(excuseLateRes.status, 409);

      // excused_delay within 48h succeeds (e.g. sOn1 completed 5h ago)
      const excuseOkRes = await api(`/reports/shipments/${sOn1}/excused-delay`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ excusedDelay: true, reason: 'Border inspection wait' }),
      });
      assert.equal(excuseOkRes.status, 200);
    } finally {
      await db.end();
      await stopTestServer(server);
    }
  });

  test('BR-F2-01 & Section 3.4: Domestic Vietnam order cutoff must NOT apply international ASEAN import_permit (14d)', async () => {
    await resetTestDatabase();
    const server = await startTestServer();

    try {
      const custToken = await login('cust.a@test.local');

      const cutoffRes = await api(
        `/orders/cutoff-policy?destinationLocation=${encodeURIComponent('Đà Nẵng, Vietnam')}&originLocation=${encodeURIComponent('Củ Chi, TP.HCM, Vietnam')}&bookingType=shared_stall&transportationType=Domestic`,
        { token: custToken },
      );
      assert.equal(cutoffRes.status, 200);
      assert.equal(cutoffRes.body.isInternational, false);
      assert.ok(
        cutoffRes.body.maxTierALead <= 5,
        `Domestic Vietnam maxTierALead must be <= 5, got ${cutoffRes.body.maxTierALead}`,
      );
      assert.equal(cutoffRes.body.minLeadDays, 7);

      const hRes = await api('/horses', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          name: 'QA-Cutoff-Horse',
          breed: 'Thoroughbred',
          gender: 'male',
          age: 5,
          microchipNo: '985QACUTOFF1',
          passportNo: 'FEI-CUTOFF-1',
          status: 'active',
        }),
      });
      assert.equal(hRes.status, 201);
      const horseId = Number(hRes.body.id);

      const ordRes = await api('/orders', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          bookingType: 'shared_stall',
          contactName: 'QA Cutoff VN',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          requestedDate: daysFromNowIso(12),
          transportationType: 'Domestic',
          horses: [{ horseId, name: 'QA-Cutoff-Horse', declaredValue: 50_000_000, insurancePackage: 'basic' }],
        }),
      });
      assert.equal(ordRes.status, 201);
    } finally {
      await stopTestServer(server);
    }
  });

  test('BR-F1-07 & AC-F1-04 & BR-F1-05 & BR-F4-05: Shipment State Machine Matrix & UTC ISO-8601 Timestamps', async () => {
    await resetTestDatabase();
    const server = await startTestServer();
    const db = await openTestDbConnection();

    try {
      const custToken = await login('cust.a@test.local');
      const mgrToken = await login('manager.a@test.local');

      const makeFreshHorse = async (suffix) => {
        const res = await api('/horses', {
          method: 'POST',
          token: custToken,
          body: JSON.stringify({
            name: `QA-SM-Horse-${suffix}`,
            breed: 'Thoroughbred',
            gender: 'male',
            age: 4,
            microchipNo: `985QASM${suffix}`,
            passportNo: `FEI-SM-${suffix}`,
            status: 'active',
          }),
        });
        assert.equal(res.status, 201);
        return Number(res.body.id);
      };

      const makeDomesticOrder = async (horseId, tag) => {
        const res = await api('/orders', {
          method: 'POST',
          token: custToken,
          body: JSON.stringify({
            bookingType: 'shared_stall',
            contactName: `QA SM ${tag}`,
            contactAddress: 'TP.HCM',
            contactPhone: '0900000001',
            contactEmail: 'cust.a@test.local',
            requestedHorseCount: 1,
            originLocation: 'Củ Chi, TP.HCM, Vietnam',
            destinationLocation: 'Đà Nẵng, Vietnam',
            requestedDate: daysFromNowIso(20),
            transportationType: 'Domestic',
            horses: [{ horseId, name: `QA-${tag}`, declaredValue: 50_000_000, insurancePackage: 'basic' }],
          }),
        });
        assert.equal(res.status, 201);
        return Number(res.body.id);
      };

      // ------------------------------------------------------------------
      // Part A: BR-F1-07 & BR-F1-05 State Machine Matrix
      // ------------------------------------------------------------------
      const hSelf1 = await makeFreshHorse('SELF1');
      const ordSelf = await makeDomesticOrder(hSelf1, 'SELF1');

      // UTC ISO-8601 check on createdAt / requestedDate
      const getOrd = await api(`/orders/${ordSelf}`, { token: custToken });
      assert.match(getOrd.body.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      assert.match(getOrd.body.requestedDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);

      // Customer self-cancel from requested succeeds & resets horse to active; repeat is idempotent
      const cancel1 = await api(`/orders/${ordSelf}/cancel`, { method: 'PATCH', token: custToken, body: JSON.stringify({}) });
      assert.equal(cancel1.status, 200);
      assert.equal(cancel1.body.status, 'cancelled');
      const [[hAfterCancel]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [hSelf1]);
      assert.equal(hAfterCancel.status, 'active');

      const cancelRepeat = await api(`/orders/${ordSelf}/cancel`, { method: 'PATCH', token: custToken, body: JSON.stringify({}) });
      assert.equal(cancelRepeat.status, 200);

      // Approving a cancelled order returns 409 Conflict
      const appCancelled = await api(`/orders/${ordSelf}/approve`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
      });
      assert.equal(appCancelled.status, 409);

      // Operational cancel ALLOWED from approved, planning, confirmed, ready_to_depart
      for (const targetStatus of ['approved', 'planning', 'confirmed', 'ready_to_depart']) {
        const hId = await makeFreshHorse(`OC_${targetStatus}`);
        const sid = await makeDomesticOrder(hId, `OC_${targetStatus}`);
        await api(`/orders/${sid}/approve`, {
          method: 'PATCH',
          token: mgrToken,
          body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
        });

        // Customer cannot self-cancel once approved -> 409
        if (targetStatus === 'approved') {
          const selfCancelApproved = await api(`/orders/${sid}/cancel`, { method: 'PATCH', token: custToken, body: JSON.stringify({}) });
          assert.equal(selfCancelApproved.status, 409);
        }

        if (targetStatus !== 'approved') {
          await db.execute('UPDATE shipment SET status = ? WHERE shipment_id = ?', [targetStatus, sid]);
        }

        const ocRes = await api(`/orders/${sid}/operational-cancel`, {
          method: 'POST',
          token: mgrToken,
          body: JSON.stringify({ category: 'company_fault', reason: `Cancel from ${targetStatus}` }),
        });
        assert.ok([200, 201].includes(ocRes.status), `operational-cancel from ${targetStatus} expected 200/201, got ${ocRes.status}`);
        const [[sRow]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [sid]);
        assert.equal(sRow.status, 'cancelled_operational');
        const [[hRow]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [hId]);
        assert.equal(hRow.status, 'active');

        // Re-cancelling an already cancelled_operational order -> 409
        const ocTwice = await api(`/orders/${sid}/operational-cancel`, {
          method: 'POST',
          token: mgrToken,
          body: JSON.stringify({ category: 'company_fault', reason: 'Repeat' }),
        });
        assert.equal(ocTwice.status, 409);
      }

      // Operational cancel FORBIDDEN (409) from in_transit, completed, rejected, cancelled
      for (const blockedStatus of ['in_transit', 'completed', 'rejected', 'cancelled']) {
        const hId = await makeFreshHorse(`BLK_${blockedStatus}`);
        const sid = await makeDomesticOrder(hId, `BLK_${blockedStatus}`);
        await db.execute('UPDATE shipment SET status = ? WHERE shipment_id = ?', [blockedStatus, sid]);
        const ocBlocked = await api(`/orders/${sid}/operational-cancel`, {
          method: 'POST',
          token: mgrToken,
          body: JSON.stringify({ category: 'company_fault', reason: `Forbidden from ${blockedStatus}` }),
        });
        assert.equal(ocBlocked.status, 409, `AC-F1-04/BR-F1-07: cancel from ${blockedStatus} must return 409`);
      }

      // Complete before in_transit returns 409 Conflict
      const hPre = await makeFreshHorse('PRECOMP');
      const ordPre = await makeDomesticOrder(hPre, 'PRECOMP');
      await api(`/orders/${ordPre}/approve`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
      });
      const preComp = await api(`/orders/${ordPre}/complete`, { method: 'PATCH', token: mgrToken, body: JSON.stringify({}) });
      assert.equal(preComp.status, 409);
    } finally {
      await db.end();
      await stopTestServer(server);
    }
  });

  test('BR-F4-01 & AC-F2-01..03 & AC-F3-02 & BR-F4-02 & BR-F4-05: Gate 1/2 Combinatorial, 2-Tier Compliance, Expiry Rollback/In-Transit Alert, Append-Only & Backdated', async () => {
    const seed = await resetTestDatabase();
    const server = await startTestServer();
    const db = await openTestDbConnection();

    try {
      const custToken = await login('cust.a@test.local');
      const mgrToken = await login('manager.a@test.local');
      const specToken = await login('specialist.qa@test.local');
      const coordToken = await login('coordinator.qa@test.local');
      const drvToken = await login('driver1.qa@test.local');
      const escToken = await login('escort1.qa@test.local');

      const makeFreshHorse = async (suffix) => {
        const res = await api('/horses', {
          method: 'POST',
          token: custToken,
          body: JSON.stringify({
            name: `QA-GATE-Horse-${suffix}`,
            breed: 'Thoroughbred',
            gender: 'male',
            age: 4,
            microchipNo: `985QAGATE${suffix}`,
            passportNo: `FEI-GATE-${suffix}`,
            status: 'active',
          }),
        });
        assert.equal(res.status, 201);
        return Number(res.body.id);
      };

      // ------------------------------------------------------------------
      // Part B: Gate 1 & Gate 2 Combinatorial + AC-F2-01..03 + AC-F4-01
      // ------------------------------------------------------------------
      const hGate = await makeFreshHorse('GATE2');
      const depIso = daysFromNowIso(25, 2); // 02:00Z
      const arrIso = daysFromNowIso(25, 10); // 10:00Z
      const healthInitialExpiry = daysFromNowIso(28, 12); // covers +48h (= Day 27 10:00Z), fails if shifted +4d (Day 29 10:00Z)
      const longPermitExpiry = daysFromNowIso(60, 0);

      const gOrderRes = await api('/orders', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          bookingType: 'shared_stall',
          contactName: 'QA Gate 2 Intl',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'TP.HCM, Vietnam',
          destinationLocation: 'Singapore Turf Club, Singapore',
          requestedDate: depIso,
          transportationType: 'International',
          horses: [{ horseId: hGate, name: 'QA-GATE2', declaredValue: 100_000_000, insurancePackage: 'standard' }],
        }),
      });
      assert.equal(gOrderRes.status, 201);
      const gateOrderId = Number(gOrderRes.body.id);

      const gApproveRes = await api(`/orders/${gateOrderId}/approve`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'air' }),
      });
      assert.equal(gApproveRes.status, 200);
      const expectedTotalCost = Number(gApproveRes.body.totalCost);
      assert.equal(expectedTotalCost, 3_500_000); // 2M freight + 1.5M standard insurance

      // Gate 1 blocked (422) before Flow 3 confirm
      const g1Blocked = await api(`/orders/${gateOrderId}/payments/sepay`, { method: 'POST', token: custToken });
      assert.equal(g1Blocked.status, 422);

      // Build Flow 3 Flight Plan to Singapore SIN
      const sfRes = await api(`/routes/plan/${gateOrderId}/strategic-framework`, {
        method: 'POST',
        token: mgrToken,
        body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Air Cargo' }),
      });
      assert.ok(sfRes.ok, `strategic-framework failed: ${sfRes.status} ${JSON.stringify(sfRes.body)}`);
      const detailRes = await api(`/routes/plan/${gateOrderId}/build-detail`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          routeName: 'SGN-SIN QA Gate2',
          totalDistanceKm: 1200,
          legs: [
            {
              sequenceNo: 1,
              legType: 'flight',
              originLocation: 'Sân bay Tân Sơn Nhất (SGN)',
              destinationLocation: 'Singapore Turf Club (SIN)',
              airlineId: seed.airlines.sq,
              airlineName: 'Singapore Airlines Cargo',
              flightNumber: 'SQ-QA-01',
              departureAirportId: seed.airports.sgn,
              departureAirportCode: 'SGN',
              arrivalAirportId: seed.airports.sin,
              arrivalAirportCode: 'SIN',
              bookingReference: 'AWB-QA-01',
              stallsBooked: 1,
              plannedDeparture: depIso,
              plannedArrival: arrIso,
            },
          ],
          stops: [
            {
              sequenceNo: 1,
              legSequenceNo: 1,
              stopType: 'border_check',
              locationName: 'Changi SIN Border',
              country: 'Singapore',
              plannedArrival: arrIso,
              plannedDeparture: daysFromNowIso(25, 11),
            },
          ],
        }),
      });
      assert.equal(detailRes.status, 201);
      const routeId = Number(detailRes.body.id);
      const legId = Number(detailRes.body.legs[0].id);
      const stopId = Number(detailRes.body.stops[0].id);

      const subRes = await api(`/routes/plan/${gateOrderId}/submit`, { method: 'POST', token: coordToken, body: JSON.stringify({}) });
      assert.ok(subRes.ok, `submit failed: ${subRes.status} ${JSON.stringify(subRes.body)}`);
      const revRes = await api(`/routes/plan/${gateOrderId}/review`, { method: 'POST', token: mgrToken, body: JSON.stringify({ status: 'approved' }) });
      assert.ok(revRes.ok, `review failed: ${revRes.status} ${JSON.stringify(revRes.body)}`);
      const assignRes = await api(`/fleet/shipments/${gateOrderId}/assign-staff`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          assignments: [
            { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
            { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
          ],
        }),
      });
      assert.ok(assignRes.ok, `assign-staff failed: ${assignRes.status} ${JSON.stringify(assignRes.body)}`);

      const assertPublishBlocked = async (label) => {
        const pubRes = await api(`/routes/shipment/${gateOrderId}/publish`, {
          method: 'POST',
          token: mgrToken,
          body: JSON.stringify({}),
        });
        assert.equal(pubRes.status, 422, `${label}: publish must return 422`);
        assert.ok(
          Array.isArray(pubRes.body?.missingRequirements) && pubRes.body.missingRequirements.length >= 1,
          `${label}: publish 422 must include missingRequirements`,
        );
      };

      // Missing 3/3 -> readiness reports 3 pendingConditions, publish blocked with 422 & missingRequirements
      const r3of3 = await api(`/routes/plan/${gateOrderId}/readiness`, { token: mgrToken });
      assert.equal(r3of3.body.isReadyToDepart, false);
      assert.ok(
        Array.isArray(r3of3.body.pendingConditions) && r3of3.body.pendingConditions.length === 3,
        `Expected 3 pendingConditions on r3of3, got ${JSON.stringify(r3of3.body.pendingConditions)}`,
      );
      await assertPublishBlocked('Missing 3/3');

      // Partial staff confirm (escort only -> plan stays approved, missing 3/3)
      const conf1Res = await api(`/routes/plan/${gateOrderId}/driver-confirm`, { method: 'POST', token: escToken, body: JSON.stringify({}) });
      assert.ok(conf1Res.ok, `driver-confirm #1 failed: ${conf1Res.status} ${JSON.stringify(conf1Res.body)}`);
      assert.equal(conf1Res.body.isFullyConfirmed, false);
      const stillPreGate1 = await api(`/orders/${gateOrderId}/payments/sepay`, { method: 'POST', token: custToken });
      assert.equal(stillPreGate1.status, 422);

      // Second staff confirm -> Route CONFIRMED -> Gate 1 UNLOCKS, missing 2/3 (compliance + payment)
      const conf2Res = await api(`/routes/plan/${gateOrderId}/driver-confirm`, { method: 'POST', token: drvToken, body: JSON.stringify({}) });
      assert.ok(conf2Res.ok, `driver-confirm #2 failed: ${conf2Res.status} ${JSON.stringify(conf2Res.body)}`);
      assert.equal(conf2Res.body.isFullyConfirmed, true);
      const r2of3 = await api(`/routes/plan/${gateOrderId}/readiness`, { token: mgrToken });
      assert.equal(r2of3.body.isReadyToDepart, false);
      assert.ok(
        Array.isArray(r2of3.body.pendingConditions) && r2of3.body.pendingConditions.length === 2,
        `Expected 2 pendingConditions on r2of3, got ${JSON.stringify(r2of3.body.pendingConditions)}`,
      );

      // MoMo Sandbox settled does NOT satisfy Gate 2
      const momoCreate = await api(`/orders/${gateOrderId}/payments/momo`, { method: 'POST', token: custToken });
      assert.ok(momoCreate.ok);
      const momoAtm = await api(`/orders/${gateOrderId}/payments/momo/confirm-atm`, {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({ cardNumber: '9704000000000018', cardHolder: 'NGUYEN VAN A', issueDate: '07/20', otp: 'OTP' }),
      });
      assert.ok(momoAtm.ok);
      await assertPublishBlocked('After MoMo Sandbox only');

      // Gate 1 open: Create SePay QR
      const sepayQrRes = await api(`/orders/${gateOrderId}/payments/sepay`, { method: 'POST', token: custToken });
      assert.equal(sepayQrRes.status, 200);
      const payCode = sepayQrRes.body.paymentCode;
      assert.equal(sepayQrRes.body.amount, expectedTotalCost);

      // Bad signature webhook -> 401
      const badSigRes = await sendSepayWebhook(
        {
          id: 9001,
          gateway: 'MB',
          accountNumber: SEPAY_ACCOUNT_NUMBER,
          transferType: 'in',
          transferAmount: expectedTotalCost,
          content: payCode,
        },
        { badSig: true },
      );
      assert.equal(badSigRes.status, 401);

      // Exact SePay webhook -> settles payment
      await sendSepayWebhook({
        id: 9003,
        gateway: 'MB',
        accountNumber: SEPAY_ACCOUNT_NUMBER,
        transferType: 'in',
        transferAmount: expectedTotalCost,
        content: payCode,
      });
      const afterExactPay = await api(`/orders/${gateOrderId}/payments/sepay`, { token: custToken });
      assert.equal(afterExactPay.body.payment?.status, 'succeeded');

      // Now Confirmed + Paid, STILL missing compliance (1/3) -> 422
      await assertPublishBlocked('Missing compliance 1/3');

      // AC-F2-01: Upload & internally approve all applicable Singapore docs, keeping AVS import_permit Authority Approval PENDING
      const uploadDoc = async (regId, docType, expiryDate) => {
        const fd = new FormData();
        fd.append('horseId', String(hGate));
        fd.append('regulationId', String(regId));
        fd.append('docType', docType);
        fd.append('docNumber', `QA-${docType}-${regId}`);
        fd.append('issueDate', formatDateOnly(daysFromNowIso(24)));
        fd.append('expiryDate', formatDateOnly(expiryDate));
        fd.append('file', makePdfBlob(), `${docType}_${regId}.pdf`);
        const up = await api('/documents/upload', { method: 'POST', token: custToken, body: fd });
        assert.equal(up.status, 201);
        if (up.body?.fileUrl) createdUploadUrls.push(up.body.fileUrl);
        const rev = await api(`/documents/${up.body.id}/review`, {
          method: 'PATCH',
          token: specToken,
          body: JSON.stringify({ status: 'approved', notes: 'Internal review pass', expiryDate: formatDateOnly(expiryDate) }),
        });
        assert.equal(rev.status, 200);
        return Number(up.body.id);
      };

      const [sgRegs] = await db.execute(
        `SELECT regulation_id, document_type, requires_authority_approval, doc_tier
         FROM regulation
         WHERE LOWER(country) = 'singapore'
           AND transport_mode IN ('both', 'air')
           AND (border_gate IS NULL OR TRIM(border_gate) = '' OR LOWER(border_gate) = 'sin')
         ORDER BY regulation_id ASC`,
      );
      assert.ok(sgRegs.length >= 2, `Expected applicable Singapore regulations, got ${sgRegs.length}`);

      const importPermitDocIds = [];
      const healthDocs = [];
      for (const reg of sgRegs) {
        const regId = Number(reg.regulation_id);
        const docType = reg.document_type;
        const requiresAuth = Boolean(Number(reg.requires_authority_approval));
        const expiry = docType === 'health_certificate' ? healthInitialExpiry : longPermitExpiry;
        const docId = await uploadDoc(regId, docType, expiry);
        if (docType === 'import_permit') {
          await api(`/documents/${docId}/authority-approval`, {
            method: 'POST',
            token: specToken,
            body: JSON.stringify({ authorityName: 'AVS Singapore', status: 'pending', notes: 'Awaiting AVS sign-off' }),
          });
          importPermitDocIds.push(docId);
        } else {
          if (docType === 'health_certificate') {
            healthDocs.push({ docId, regId, requiresAuth });
          }
          if (requiresAuth) {
            const authPre = await api(`/documents/${docId}/authority-approval`, {
              method: 'POST',
              token: specToken,
              body: JSON.stringify({
                authorityName: 'AVS Singapore',
                status: 'approved',
                approvalDate: new Date().toISOString(),
                referenceNumber: `AVS-${regId}-OK`,
              }),
            });
            assert.ok(authPre.ok, `Tier 2 approval failed for ${docType}: ${authPre.status}`);
          }
        }
      }
      assert.ok(importPermitDocIds.length >= 1);
      assert.ok(healthDocs.length >= 1);

      const chkPendingAvs = await api(`/documents/order/${gateOrderId}/checklist`, { token: specToken });
      assert.equal(chkPendingAvs.body.isFullyCompliant, false);
      await assertPublishBlocked('Pending AVS Tier 2');

      // Now AVS approves Tier 2 on all import_permit docs -> all 3 conditions met -> ready_to_depart!
      for (const pDocId of importPermitDocIds) {
        const avsAppRes = await api(`/documents/${pDocId}/authority-approval`, {
          method: 'POST',
          token: specToken,
          body: JSON.stringify({
            authorityName: 'AVS Singapore',
            status: 'approved',
            approvalDate: new Date().toISOString(),
            referenceNumber: `AVS-QA-OK-${pDocId}`,
          }),
        });
        assert.ok(avsAppRes.ok);
      }
      const ordReady = await api(`/orders/${gateOrderId}`, { token: mgrToken });
      assert.equal(ordReady.body.status, 'ready_to_depart');

      // AC-F2-02: Shift arrival forward by 4 days so arrival + 48h exceeds healthInitialExpiry -> downgrades to confirmed & blocks 422!
      const shiftedArrIso = daysFromNowIso(29, 10);
      const shiftedDepIso = daysFromNowIso(29, 11);
      const shiftRes = await api(`/routes/${routeId}/schedule`, {
        method: 'PATCH',
        token: coordToken,
        body: JSON.stringify({
          reason: 'Flight rescheduled +4 days',
          stops: [{ stopId, plannedArrival: shiftedArrIso, plannedDeparture: shiftedDepIso }],
        }),
      });
      assert.equal(shiftRes.status, 200);
      const ordDowngraded = await api(`/orders/${gateOrderId}`, { token: mgrToken });
      assert.equal(ordDowngraded.body.status, 'confirmed');
      await assertPublishBlocked('Schedule shift invalidated Tier B');

      // Renew health cert for +45d so Gate 2 unlocks again -> ready_to_depart
      const renewedHealthDocIds = [];
      for (const hInfo of healthDocs) {
        const renewFd = new FormData();
        renewFd.append('file', makePdfBlob(), `health_renewed_${hInfo.regId}.pdf`);
        const reUp = await api(`/documents/${hInfo.docId}/re-upload`, { method: 'POST', token: custToken, body: renewFd });
        assert.ok([200, 201].includes(reUp.status));
        if (reUp.body?.fileUrl) createdUploadUrls.push(reUp.body.fileUrl);
        const newHealthId = Number(reUp.body.id);
        await api(`/documents/${newHealthId}/review`, {
          method: 'PATCH',
          token: specToken,
          body: JSON.stringify({ status: 'approved', expiryDate: formatDateOnly(daysFromNowIso(45)) }),
        });
        if (hInfo.requiresAuth) {
          await api(`/documents/${newHealthId}/authority-approval`, {
            method: 'POST',
            token: specToken,
            body: JSON.stringify({
              authorityName: 'AVS Singapore',
              status: 'approved',
              approvalDate: new Date().toISOString(),
              referenceNumber: `AVS-RENEW-${newHealthId}`,
            }),
          });
        }
        renewedHealthDocIds.push(newHealthId);
      }
      const ordReReady = await api(`/orders/${gateOrderId}`, { token: mgrToken });
      assert.equal(ordReReady.body.status, 'ready_to_depart');

      // Start leg 1 -> enters in_transit
      const legStart = await api(`/tracking/shipments/${gateOrderId}/legs/${legId}/start`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({ notes: 'Departed SGN on time' }),
      });
      assert.equal(legStart.status, 201);
      assert.equal((await api(`/orders/${gateOrderId}`, { token: mgrToken })).body.status, 'in_transit');

      // Verify tracking ETA & timestamps are UTC ISO-8601 (never local vi-VN)
      const trackRes = await api(`/tracking/shipments/${gateOrderId}`, { token: escToken });
      assert.equal(trackRes.status, 200);
      if (trackRes.body.eta) {
        assert.match(String(trackRes.body.eta), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      }

      // BR-F4-05 Backdated >30m check-in requires notes (400), succeeds with notes + sets is_backdated = 1
      const backdatedTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      const bdNoNotes = await api(`/tracking/shipments/${gateOrderId}/stops/${stopId}/status`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({ action: 'arrived', actualTime: backdatedTime }),
      });
      assert.equal(bdNoNotes.status, 400);

      const bdWithNotes = await api(`/tracking/shipments/${gateOrderId}/stops/${stopId}/status`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({ action: 'arrived', actualTime: backdatedTime, notes: 'Offline recovery at Changi' }),
      });
      assert.equal(bdWithNotes.status, 201);
      const [[tsLogRow]] = await db.execute(
        'SELECT is_backdated, updated_by_role FROM trip_status_log WHERE shipment_id = ? ORDER BY log_id DESC LIMIT 1',
        [gateOrderId],
      );
      assert.equal(Boolean(tsLogRow.is_backdated), true);
      assert.equal(tsLogRow.updated_by_role, 'escort');

      // AC-F2-03 & BR-F2-06: Document expires while in_transit -> keeps in_transit, sets alert, blocks customs_cleared (422)
      await api(`/documents/${renewedHealthDocIds[0]}/review`, {
        method: 'PATCH',
        token: specToken,
        body: JSON.stringify({ status: 'expired', notes: 'Tier B expired mid-flight' }),
      });
      const ordMidFlight = await api(`/orders/${gateOrderId}`, { token: mgrToken });
      assert.equal(ordMidFlight.body.status, 'in_transit');
      const [[alertDbRow]] = await db.execute(
        'SELECT in_transit_compliance_alert FROM shipment WHERE shipment_id = ?',
        [gateOrderId],
      );
      assert.equal(Boolean(alertDbRow.in_transit_compliance_alert), true);

      const blockedCustoms = await api(`/tracking/shipments/${gateOrderId}/stops/${stopId}/status`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({ action: 'customs_cleared' }),
      });
      assert.equal(blockedCustoms.status, 422);

      // Part C: BR-F4-02 Append-only HTTP immutability checks (cannot PATCH/PUT/DELETE tracking history logs)
      const [hhlRes] = await db.execute('SELECT log_id FROM trip_status_log WHERE shipment_id = ? LIMIT 1', [gateOrderId]);
      const sampleLogId = Number(hhlRes[0].log_id);
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        const res1 = await api(`/tracking/logs/${sampleLogId}`, { method, token: coordToken, body: JSON.stringify({ notes: 'tamper' }) });
        const res2 = await api(`/tracking/shipments/${gateOrderId}/status-logs/${sampleLogId}`, { method, token: coordToken, body: JSON.stringify({ notes: 'tamper' }) });
        const res3 = await api(`/tracking/health-logs/${sampleLogId}`, { method, token: coordToken, body: JSON.stringify({ notes: 'tamper' }) });
        assert.ok([404, 405].includes(res1.status), `${method} /tracking/logs -> ${res1.status}`);
        assert.ok([404, 405].includes(res2.status), `${method} status-logs -> ${res2.status}`);
        assert.ok([404, 405].includes(res3.status), `${method} health-logs -> ${res3.status}`);
      }
      // Re-confirm health log append works via multipart upload endpoint + JSON health log creation and clean file
      const hlFd = new FormData();
      hlFd.append('files', makePngBlob(), 'vital.png');
      const hlUp = await api(`/tracking/shipments/${gateOrderId}/health-logs/upload`, {
        method: 'POST',
        token: escToken,
        body: hlFd,
      });
      assert.equal(hlUp.status, 201);
      assert.ok(Array.isArray(hlUp.body?.files) && hlUp.body.files.length === 1);
      for (const rel of hlUp.body.files) {
        if (typeof rel === 'string') createdUploadUrls.push(rel);
      }

      const hlCreate = await api(`/tracking/shipments/${gateOrderId}/health-logs`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({
          horseId: hGate,
          horseName: 'QA-GATE2',
          conditionStatus: 'stable',
          temperatureC: 38.0,
          heartRateBpm: 36,
          attachments: hlUp.body.files,
        }),
      });
      assert.equal(hlCreate.status, 201);
      assert.equal(hlCreate.body.alertTier, 'green');
    } finally {
      await db.end();
      await stopTestServer(server);
    }
  });

  test('BR-F4-01 & AC-F4-01: checkInLegStart leg 1 with only MoMo Sandbox (no SePay) must return 422 Unprocessable Entity with missingRequirements', async () => {
    const seed = await resetTestDatabase();
    const server = await startTestServer();

    try {
      const custToken = await login('cust.a@test.local');
      const mgrToken = await login('manager.a@test.local');
      const coordToken = await login('coordinator.qa@test.local');
      const drvToken = await login('driver1.qa@test.local');
      const escToken = await login('escort1.qa@test.local');

      const hRes = await api('/horses', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          name: 'QA-ACF401-Horse',
          breed: 'Thoroughbred',
          gender: 'male',
          age: 5,
          microchipNo: '985QAACF401',
          passportNo: 'FEI-ACF401',
          status: 'active',
        }),
      });
      assert.equal(hRes.status, 201);
      const horseId = Number(hRes.body.id);

      const depIso = daysFromNowIso(25, 2);
      const arrIso = daysFromNowIso(25, 10);

      const ordRes = await api('/orders', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          bookingType: 'shared_stall',
          contactName: 'QA AC-F4-01',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'TP.HCM, Vietnam',
          destinationLocation: 'Singapore Turf Club, Singapore',
          requestedDate: depIso,
          transportationType: 'International',
          horses: [{ horseId, name: 'QA-ACF401-Horse', declaredValue: 100_000_000, insurancePackage: 'standard' }],
        }),
      });
      assert.equal(ordRes.status, 201);
      const orderId = Number(ordRes.body.id);

      const appRes = await api(`/orders/${orderId}/approve`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'air' }),
      });
      assert.equal(appRes.status, 200);

      const sfRes = await api(`/routes/plan/${orderId}/strategic-framework`, {
        method: 'POST',
        token: mgrToken,
        body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Air Cargo' }),
      });
      assert.ok(sfRes.ok, `strategic-framework failed: ${sfRes.status} ${JSON.stringify(sfRes.body)}`);

      const detailRes = await api(`/routes/plan/${orderId}/build-detail`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          routeName: 'SGN-SIN QA AC-F4-01',
          totalDistanceKm: 1200,
          legs: [
            {
              sequenceNo: 1,
              legType: 'flight',
              originLocation: 'Sân bay Tân Sơn Nhất (SGN)',
              destinationLocation: 'Singapore Turf Club (SIN)',
              airlineId: seed.airlines.sq,
              airlineName: 'Singapore Airlines Cargo',
              flightNumber: 'SQ-QA-F401',
              departureAirportId: seed.airports.sgn,
              departureAirportCode: 'SGN',
              arrivalAirportId: seed.airports.sin,
              arrivalAirportCode: 'SIN',
              bookingReference: 'AWB-QA-F401',
              stallsBooked: 1,
              plannedDeparture: depIso,
              plannedArrival: arrIso,
            },
          ],
          stops: [
            {
              sequenceNo: 1,
              legSequenceNo: 1,
              stopType: 'border_check',
              locationName: 'Changi SIN Border',
              country: 'Singapore',
              plannedArrival: arrIso,
              plannedDeparture: daysFromNowIso(25, 11),
            },
          ],
        }),
      });
      assert.equal(detailRes.status, 201);
      const legId = Number(detailRes.body.legs[0].id);

      const subRes = await api(`/routes/plan/${orderId}/submit`, { method: 'POST', token: coordToken, body: JSON.stringify({}) });
      assert.ok(subRes.ok, `submit failed: ${subRes.status} ${JSON.stringify(subRes.body)}`);
      const revRes = await api(`/routes/plan/${orderId}/review`, { method: 'POST', token: mgrToken, body: JSON.stringify({ status: 'approved' }) });
      assert.ok(revRes.ok, `review failed: ${revRes.status} ${JSON.stringify(revRes.body)}`);
      const assignRes = await api(`/fleet/shipments/${orderId}/assign-staff`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          assignments: [
            { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
            { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
          ],
        }),
      });
      assert.ok(assignRes.ok, `assign-staff failed: ${assignRes.status} ${JSON.stringify(assignRes.body)}`);

      const conf1Res = await api(`/routes/plan/${orderId}/driver-confirm`, { method: 'POST', token: escToken, body: JSON.stringify({}) });
      assert.ok(conf1Res.ok, `driver-confirm #1 failed: ${conf1Res.status} ${JSON.stringify(conf1Res.body)}`);
      assert.equal(conf1Res.body.isFullyConfirmed, false);
      const conf2Res = await api(`/routes/plan/${orderId}/driver-confirm`, { method: 'POST', token: drvToken, body: JSON.stringify({}) });
      assert.ok(conf2Res.ok, `driver-confirm #2 failed: ${conf2Res.status} ${JSON.stringify(conf2Res.body)}`);
      assert.equal(conf2Res.body.isFullyConfirmed, true);

      const momoCreate = await api(`/orders/${orderId}/payments/momo`, { method: 'POST', token: custToken });
      assert.ok(momoCreate.ok);
      const momoAtm = await api(`/orders/${orderId}/payments/momo/confirm-atm`, {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({ cardNumber: '9704000000000018', cardHolder: 'NGUYEN VAN A', issueDate: '07/20', otp: 'OTP' }),
      });
      assert.ok(momoAtm.ok);

      const startRes = await api(`/tracking/shipments/${orderId}/legs/${legId}/start`, {
        method: 'POST',
        token: escToken,
        body: JSON.stringify({}),
      });
      assert.equal(startRes.status, 422);
      assert.ok(
        Array.isArray(startRes.body?.missingRequirements) && startRes.body.missingRequirements.length >= 1,
        `checkInLegStart 422 must include missingRequirements, got ${JSON.stringify(startRes.body)}`,
      );
    } finally {
      await stopTestServer(server);
    }
  });

  test('BR-F4-01 & Gate 2 SePay Exact Match: Bad signature returns 401; off-by-1-VND webhook enters review (not succeeded) and blocks Gate 2 with 422', async () => {
    const seed = await resetTestDatabase();
    const server = await startTestServer();

    try {
      const custToken = await login('cust.a@test.local');
      const mgrToken = await login('manager.a@test.local');
      const coordToken = await login('coordinator.qa@test.local');
      const drvToken = await login('driver1.qa@test.local');
      const escToken = await login('escort1.qa@test.local');

      const hRes = await api('/horses', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          name: 'QA-SEPAY-1VND',
          breed: 'Thoroughbred',
          gender: 'male',
          age: 5,
          microchipNo: '985QASEPAY1',
          passportNo: 'FEI-SEPAY-1',
          status: 'active',
        }),
      });
      assert.equal(hRes.status, 201);
      const horseId = Number(hRes.body.id);

      const depIso = daysFromNowIso(25, 2);
      const arrIso = daysFromNowIso(25, 10);

      const ordRes = await api('/orders', {
        method: 'POST',
        token: custToken,
        body: JSON.stringify({
          bookingType: 'shared_stall',
          contactName: 'QA SePay Exact Match',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'TP.HCM, Vietnam',
          destinationLocation: 'Singapore Turf Club, Singapore',
          requestedDate: depIso,
          transportationType: 'International',
          horses: [{ horseId, name: 'QA-SEPAY-1VND', declaredValue: 100_000_000, insurancePackage: 'standard' }],
        }),
      });
      assert.equal(ordRes.status, 201);
      const orderId = Number(ordRes.body.id);

      const appRes = await api(`/orders/${orderId}/approve`, {
        method: 'PATCH',
        token: mgrToken,
        body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'air' }),
      });
      assert.equal(appRes.status, 200);
      const expectedTotalCost = Number(appRes.body.totalCost);
      assert.equal(expectedTotalCost, 3_500_000);

      const sfRes = await api(`/routes/plan/${orderId}/strategic-framework`, {
        method: 'POST',
        token: mgrToken,
        body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Air Cargo' }),
      });
      assert.ok(sfRes.ok);

      const detailRes = await api(`/routes/plan/${orderId}/build-detail`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          routeName: 'SGN-SIN QA SePay 1VND',
          totalDistanceKm: 1200,
          legs: [
            {
              sequenceNo: 1,
              legType: 'flight',
              originLocation: 'Sân bay Tân Sơn Nhất (SGN)',
              destinationLocation: 'Singapore Turf Club (SIN)',
              airlineId: seed.airlines.sq,
              airlineName: 'Singapore Airlines Cargo',
              flightNumber: 'SQ-QA-SP1',
              departureAirportId: seed.airports.sgn,
              departureAirportCode: 'SGN',
              arrivalAirportId: seed.airports.sin,
              arrivalAirportCode: 'SIN',
              bookingReference: 'AWB-QA-SP1',
              stallsBooked: 1,
              plannedDeparture: depIso,
              plannedArrival: arrIso,
            },
          ],
          stops: [
            {
              sequenceNo: 1,
              legSequenceNo: 1,
              stopType: 'border_check',
              locationName: 'Changi SIN Border',
              country: 'Singapore',
              plannedArrival: arrIso,
              plannedDeparture: daysFromNowIso(25, 11),
            },
          ],
        }),
      });
      assert.equal(detailRes.status, 201);

      assert.ok((await api(`/routes/plan/${orderId}/submit`, { method: 'POST', token: coordToken, body: JSON.stringify({}) })).ok);
      assert.ok((await api(`/routes/plan/${orderId}/review`, { method: 'POST', token: mgrToken, body: JSON.stringify({ status: 'approved' }) })).ok);
      assert.ok((await api(`/fleet/shipments/${orderId}/assign-staff`, {
        method: 'POST',
        token: coordToken,
        body: JSON.stringify({
          assignments: [
            { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
            { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
          ],
        }),
      })).ok);

      assert.ok((await api(`/routes/plan/${orderId}/driver-confirm`, { method: 'POST', token: escToken, body: JSON.stringify({}) })).ok);
      const conf2 = await api(`/routes/plan/${orderId}/driver-confirm`, { method: 'POST', token: drvToken, body: JSON.stringify({}) });
      assert.ok(conf2.ok);
      assert.equal(conf2.body.isFullyConfirmed, true);

      const qrRes = await api(`/orders/${orderId}/payments/sepay`, { method: 'POST', token: custToken });
      assert.equal(qrRes.status, 200);
      const payCode = qrRes.body.paymentCode;

      const badSigRes = await sendSepayWebhook(
        {
          id: 9001,
          gateway: 'MB',
          accountNumber: SEPAY_ACCOUNT_NUMBER,
          transferType: 'in',
          transferAmount: expectedTotalCost,
          content: payCode,
        },
        { badSig: true },
      );
      assert.equal(badSigRes.status, 401);

      const shortRes = await sendSepayWebhook({
        id: 9002,
        gateway: 'MB',
        accountNumber: SEPAY_ACCOUNT_NUMBER,
        transferType: 'in',
        transferAmount: expectedTotalCost - 1,
        content: payCode,
      });
      assert.equal(shortRes.status, 200);

      const afterShortPay = await api(`/orders/${orderId}/payments/sepay`, { token: custToken });
      assert.equal(afterShortPay.body.payment?.status, 'review');

      const pubBlocked = await api(`/routes/shipment/${orderId}/publish`, { method: 'POST', token: mgrToken, body: JSON.stringify({}) });
      assert.equal(pubBlocked.status, 422);
      assert.ok(Array.isArray(pubBlocked.body?.missingRequirements) && pubBlocked.body.missingRequirements.length >= 1);
    } finally {
      await stopTestServer(server);
    }
  });
});
