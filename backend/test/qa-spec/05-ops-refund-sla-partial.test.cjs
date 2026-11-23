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

let seq05 = 0;
function nextTag(prefix) {
  seq05 += 1;
  return `${prefix}${seq05}`;
}

function futureIso(days, addHours = 0) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
    days * 86_400_000 +
    addHours * 3_600_000;
  return new Date(base).toISOString();
}

function makePdfBlob() {
  return new Blob([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')], {
    type: 'application/pdf',
  });
}

describe('QA Spec v3.1 Tier 2/5/6: Revisions, Refunds & SoD, Charter Upgrade, SLA Sweep, Partial Completion & Vitals Escalation', () => {
  let seed;
  let server;
  let db;
  let tokens = {};
  const createdUploadUrls = [];

  function trackFile(relUrl, fallbackSubdir) {
    if (!relUrl || typeof relUrl !== 'string') return;
    if (relUrl.startsWith('/uploads/')) {
      createdUploadUrls.push(relUrl);
    } else if (fallbackSubdir && !/^https?:\/\//i.test(relUrl)) {
      createdUploadUrls.push(`/uploads/${fallbackSubdir}/${path.basename(relUrl)}`);
    } else if (relUrl.startsWith('/api/') && fallbackSubdir) {
      createdUploadUrls.push(`/uploads/${fallbackSubdir}/${path.basename(relUrl)}`);
    }
  }

  function cleanupTrackedFiles() {
    for (const rel of createdUploadUrls) {
      if (!rel || typeof rel !== 'string' || !rel.startsWith('/uploads/')) continue;
      const target = path.resolve(__dirname, '../..', rel.replace(/^\/+/, ''));
      if (fs.existsSync(target)) {
        try {
          fs.unlinkSync(target);
        } catch {}
      }
    }
  }

  before(async () => {
    seed = await resetTestDatabase();
    server = await startTestServer();
    db = await openTestDbConnection();

    const [admin, managerA, managerB, coordinator, specialist, driver1, escort1, custA, custB] = await Promise.all([
      login('admin.qa@test.local'),
      login('manager.a@test.local'),
      login('manager.b@test.local'),
      login('coordinator.qa@test.local'),
      login('specialist.qa@test.local'),
      login('driver1.qa@test.local'),
      login('escort1.qa@test.local'),
      login('cust.a@test.local'),
      login('cust.b@test.local'),
    ]);
    tokens = { admin, managerA, managerB, coordinator, specialist, driver1, escort1, custA, custB };
  });

  after(async () => {
    cleanupTrackedFiles();
    if (db) await db.end();
    await stopTestServer(server);
    await dropTestDatabase();
  });

  async function createHorse(custToken, label) {
    const tag = nextTag('OPSH');
    const res = await api('/horses', {
      method: 'POST',
      token: custToken,
      body: JSON.stringify({
        name: `QA-${label}-${tag}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985O${tag}`,
        passportNo: `FEI-O-${tag}`,
        status: 'active',
      }),
    });
    assert.equal(res.status, 201, `createHorse failed: ${res.status}`);
    return Number(res.body.id);
  }

  async function setupConfirmedRoadOrder({
    custToken = tokens.custA,
    customerEmail = 'cust.a@test.local',
    horsesPayload,
    bookingType = 'shared_stall',
    approvePayload,
    vehicleId = seed.vehicles.trk4a,
    roadTripId = undefined,
    originLocation = 'Củ Chi, TP.HCM, Vietnam',
    destinationLocation = 'Đà Nẵng, Vietnam',
    tStart = futureIso(30, 0),
    tEnd = futureIso(30, 8),
    stops = undefined,
    paySepay = false,
    sepayTxId = undefined,
    label = 'OPS',
  }) {
    const ordRes = await api('/orders', {
      method: 'POST',
      token: custToken,
      body: JSON.stringify({
        bookingType,
        contactName: `QA ${label}`,
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: customerEmail,
        requestedHorseCount: horsesPayload.length,
        originLocation,
        destinationLocation,
        requestedDate: tStart,
        transportationType: 'Domestic',
        horses: horsesPayload,
      }),
    });
    assert.equal(ordRes.status, 201, `createOrder failed: ${ordRes.status} ${JSON.stringify(ordRes.body)}`);
    const ordId = Number(ordRes.body.id);

    const appRes = await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify(approvePayload),
    });
    assert.equal(appRes.status, 200, `approve failed: ${appRes.status} ${JSON.stringify(appRes.body)}`);
    const totalCost = Number(appRes.body.totalCost);

    const sfRes = await api(`/routes/plan/${ordId}/strategic-framework`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id,
        managerVehicleType: 'Truck',
      }),
    });
    assert.ok(sfRes.ok);

    const bdRes = await api(`/routes/plan/${ordId}/build-detail`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        routeName: `Route-${label}-${ordId}`,
        totalDistanceKm: 850,
        legs: [
          {
            sequenceNo: 1,
            legType: 'road',
            originLocation,
            destinationLocation,
            plannedDeparture: tStart,
            plannedArrival: tEnd,
            ...(roadTripId ? { roadTripId } : { vehicleId }),
          },
        ],
        stops: stops ?? [
          {
            sequenceNo: 1,
            legSequenceNo: 1,
            stopType: 'rest',
            locationName: `Rest-${label}-${ordId}`,
            country: 'Vietnam',
            plannedArrival: tEnd,
            plannedDeparture: tEnd,
          },
        ],
      }),
    });
    assert.equal(bdRes.status, 201, `build-detail failed: ${bdRes.status} ${JSON.stringify(bdRes.body)}`);
    const legId = Number(bdRes.body.legs[0].id);

    assert.ok((await api(`/routes/plan/${ordId}/submit`, { method: 'POST', token: tokens.coordinator, body: JSON.stringify({}) })).ok);
    assert.ok((await api(`/routes/plan/${ordId}/review`, { method: 'POST', token: tokens.managerA, body: JSON.stringify({ status: 'approved' }) })).ok);
    assert.ok((await api(`/fleet/shipments/${ordId}/assign-staff`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        assignments: [
          { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
          { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
        ],
      }),
    })).ok);
    assert.ok((await api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.driver1, body: JSON.stringify({}) })).ok);
    const conf2 = await api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.escort1, body: JSON.stringify({}) });
    assert.ok(conf2.ok && conf2.body.isFullyConfirmed === true);

    if (paySepay) {
      const qrRes = await api(`/orders/${ordId}/payments/sepay`, { method: 'POST', token: custToken });
      assert.equal(qrRes.status, 200);
      const hook = await sendSepayWebhook({
        id: sepayTxId ?? (800000 + ordId),
        gateway: 'MB',
        accountNumber: SEPAY_ACCOUNT_NUMBER,
        transferType: 'in',
        transferAmount: totalCost,
        content: qrRes.body.paymentCode,
      });
      assert.equal(hook.status, 200);
    }

    return { ordId, legId, totalCost };
  }

  test('AC-F1-03 & BR-F1-04: Request changes -> customer edit appends revisions, preserves unchanged horse exchange rate, stale approve returns 409', async () => {
    const h1 = await createHorse(tokens.custA, 'REV1');
    const h2 = await createHorse(tokens.custA, 'REV2');

    const ordRes = await api('/orders', {
      method: 'POST',
      token: tokens.custA,
      body: JSON.stringify({
        bookingType: 'shared_stall',
        contactName: 'QA Revisions',
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: 2,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: futureIso(25, 0),
        transportationType: 'Domestic',
        horses: [
          { horseId: h1, name: 'QA-REV1', declaredValue: 10_000, declaredCurrency: 'USD', insurancePackage: 'standard' },
          { horseId: h2, name: 'QA-REV2', declaredValue: 100_000_000, declaredCurrency: 'VND', insurancePackage: 'basic' },
        ],
      }),
    });
    assert.equal(ordRes.status, 201);
    const ordId = Number(ordRes.body.id);

    const [[h1Initial]] = await db.execute(
      'SELECT exchange_rate, insurance_fee FROM shipment_horse WHERE shipment_id = ? AND horse_id = ?',
      [ordId, h1],
    );
    assert.equal(Number(h1Initial.exchange_rate), 25_000);
    assert.equal(Number(h1Initial.insurance_fee), 3_750_000);

    const reqChg = await api(`/orders/${ordId}/request-changes`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ reason: 'Please confirm charter and insurance coverage' }),
    });
    assert.equal(reqChg.status, 200);
    assert.equal(reqChg.body.status, 'change_requested');

    const updRes = await api(`/orders/${ordId}`, {
      method: 'PUT',
      token: tokens.custA,
      body: JSON.stringify({
        bookingType: 'dedicated_charter',
        requestedHorseCount: 2,
        horses: [
          { horseId: h1, name: 'QA-REV1', declaredValue: 10_000, declaredCurrency: 'USD', insurancePackage: 'standard' },
          { horseId: h2, name: 'QA-REV2', declaredValue: 100_000_000, declaredCurrency: 'VND', insurancePackage: 'premium' },
        ],
      }),
    });
    assert.equal(updRes.status, 200);

    const [bookingRevs] = await db.execute(
      'SELECT previous_booking_type, booking_type FROM shipment_booking_revision WHERE shipment_id = ?',
      [ordId],
    );
    assert.ok(bookingRevs.length >= 1);
    assert.equal(bookingRevs[0].previous_booking_type, 'shared_stall');
    assert.equal(bookingRevs[0].booking_type, 'dedicated_charter');

    const [insRevs] = await db.execute(
      'SELECT revision_id, previous_snapshot FROM shipment_insurance_revision WHERE shipment_id = ?',
      [ordId],
    );
    assert.ok(insRevs.length >= 1);

    const [[h1After]] = await db.execute(
      'SELECT exchange_rate, insurance_fee FROM shipment_horse WHERE shipment_id = ? AND horse_id = ?',
      [ordId, h1],
    );
    assert.equal(Number(h1After.exchange_rate), 25_000);
    assert.equal(Number(h1After.insurance_fee), 3_750_000);

    // AC-F1-03: Stale approve returns 409 Conflict
    const staleApp = await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
    });
    assert.equal(staleApp.status, 409);

    // Fresh approve succeeds
    const freshApp = await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ bookingType: 'dedicated_charter', quotedHorseCount: 2, transportCost: 9_000_000, transportMode: 'road' }),
    });
    assert.equal(freshApp.status, 200);
  });

  test('AC-F1-05 & AC-F1-06 & BR-F1-08 & BR-F1-09: Operational cancel refund math (5.7M with 500k disbursement / 6.2M without), SoD (403), and >= 20M Dual Approval', async () => {
    // --- Scenario A: 7M paid vet_unfit_certified T-12h + 500k disbursement -> 5,700,000 + SoD ---
    const hA1 = await createHorse(tokens.custA, 'REFA1');
    const hA2 = await createHorse(tokens.custA, 'REFA2');
    const { ordId: ordA } = await setupConfirmedRoadOrder({
      horsesPayload: [
        { horseId: hA1, name: 'QA-REFA1', declaredValue: 100_000_000, insurancePackage: 'standard' },
        { horseId: hA2, name: 'QA-REFA2', declaredValue: 100_000_000, insurancePackage: 'standard' },
      ],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: 2_000_000, transportMode: 'road' },
      tStart: futureIso(40, 0),
      tEnd: futureIso(40, 6),
      paySepay: true,
      sepayTxId: 880001,
      label: 'REFA',
    });

    await db.execute(
      "UPDATE shipment SET status = 'ready_to_depart', departure_date = DATE_ADD(NOW(), INTERVAL 12 HOUR) WHERE shipment_id = ?",
      [ordA],
    );

    const disbFd = new FormData();
    disbFd.append('authorityName', 'Cục Thú Y Vùng VI');
    disbFd.append('feeType', 'quarantine_fee');
    disbFd.append('amount', '500000');
    disbFd.append('receipt', makePdfBlob(), 'vet_disb_500k.pdf');
    const disbRes = await api(`/orders/${ordA}/disbursements`, {
      method: 'POST',
      token: tokens.managerA,
      body: disbFd,
    });
    assert.equal(disbRes.status, 201);
    const [disbDb] = await db.execute('SELECT authority_receipt_url FROM shipment_disbursement WHERE shipment_id = ?', [ordA]);
    if (disbDb[0]?.authority_receipt_url) trackFile(disbDb[0].authority_receipt_url, 'disbursements');

    const ocA = await api(`/orders/${ordA}/operational-cancel`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        category: 'vet_unfit_certified',
        reason: 'Trượt kiểm dịch T-12h có biên bản thú y',
        refundMode: 'cash_refund',
      }),
    });
    assert.ok([200, 201].includes(ocA.status), `operational-cancel A failed: ${ocA.status} ${JSON.stringify(ocA.body)}`);
    assert.equal(ocA.body.status, 'cancelled_operational');
    assert.equal(ocA.body.refundRecord.status, 'pending_approval');
    assert.equal(ocA.body.refundRecord.freightRefundAmount, 3_200_000);
    assert.equal(ocA.body.refundRecord.insuranceRefundAmount, 3_000_000);
    assert.equal(ocA.body.refundRecord.disbursementDeduction, 500_000);
    assert.equal(ocA.body.refundRecord.amount, 5_700_000);

    for (const hid of [hA1, hA2]) {
      const [[hRow]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [hid]);
      assert.equal(hRow.status, 'active');
    }
    const [[payA]] = await db.execute('SELECT status, amount FROM shipment_sepay_payment WHERE shipment_id = ?', [ordA]);
    assert.equal(payA.status, 'succeeded');
    assert.equal(Number(payA.amount), 7_000_000);

    const refundIdA = Number(ocA.body.refundRecord.id);
    const appRefA = await api(`/orders/refunds/${refundIdA}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(appRefA.status, 200);
    assert.equal(appRefA.body.status, 'approved_for_transfer');

    // Manager A cannot transfer (403)
    const mgrTransferFd = new FormData();
    mgrTransferFd.append('recipientBankAccount', '1900123456');
    mgrTransferFd.append('bankTransactionRef', 'FT-MGR-BLOCK');
    mgrTransferFd.append('receipt', makePdfBlob(), 'mgr_try.pdf');
    const mgrTry = await api(`/orders/refunds/${refundIdA}/transfer`, {
      method: 'POST',
      token: tokens.managerA,
      body: mgrTransferFd,
    });
    assert.equal(mgrTry.status, 403);

    // Admin B transfers cleanly -> transferred + customer notification
    const adminTransferFd = new FormData();
    adminTransferFd.append('recipientBankAccount', '1900987654');
    adminTransferFd.append('bankTransactionRef', 'FT-ADMIN-OK-01');
    adminTransferFd.append('receipt', makePdfBlob(), 'refund_ok.pdf');
    const admOk = await api(`/orders/refunds/${refundIdA}/transfer`, {
      method: 'POST',
      token: tokens.admin,
      body: adminTransferFd,
    });
    assert.ok([200, 201].includes(admOk.status), `admin transfer failed: ${admOk.status} ${JSON.stringify(admOk.body)}`);
    assert.equal(admOk.body.status, 'transferred');
    const [refDbA] = await db.execute('SELECT transfer_receipt_url FROM shipment_refund_record WHERE refund_id = ?', [refundIdA]);
    if (refDbA[0]?.transfer_receipt_url) trackFile(refDbA[0].transfer_receipt_url, 'refund-receipts');

    // --- Scenario B: 7M paid vet_unfit_certified T-12h WITHOUT disbursement -> 6,200,000 + Same-Admin SoD 403 ---
    const hB1 = await createHorse(tokens.custA, 'REFB1');
    const hB2 = await createHorse(tokens.custA, 'REFB2');
    const { ordId: ordB } = await setupConfirmedRoadOrder({
      horsesPayload: [
        { horseId: hB1, name: 'QA-REFB1', declaredValue: 100_000_000, insurancePackage: 'standard' },
        { horseId: hB2, name: 'QA-REFB2', declaredValue: 100_000_000, insurancePackage: 'standard' },
      ],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: 2_000_000, transportMode: 'road' },
      tStart: futureIso(42, 0),
      tEnd: futureIso(42, 6),
      paySepay: true,
      sepayTxId: 880002,
      label: 'REFB',
    });
    await db.execute(
      "UPDATE shipment SET status = 'ready_to_depart', departure_date = DATE_ADD(NOW(), INTERVAL 12 HOUR) WHERE shipment_id = ?",
      [ordB],
    );
    const ocB = await api(`/orders/${ordB}/operational-cancel`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        category: 'vet_unfit_certified',
        reason: 'Trượt kiểm dịch không có biên lai ứng trước',
        refundMode: 'cash_refund',
      }),
    });
    assert.ok([200, 201].includes(ocB.status));
    assert.equal(ocB.body.refundRecord.amount, 6_200_000);
    const refundIdB = Number(ocB.body.refundRecord.id);

    // Admin approves B -> Same Admin attempts transfer -> 403 SoD violation
    const admAppB = await api(`/orders/refunds/${refundIdB}/approve`, {
      method: 'PATCH',
      token: tokens.admin,
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(admAppB.status, 200);
    const sameAdmTransfer = new FormData();
    sameAdmTransfer.append('recipientBankAccount', '1900987654');
    sameAdmTransfer.append('bankTransactionRef', 'FT-SOD-SELF');
    sameAdmTransfer.append('receipt', makePdfBlob(), 'sod_try.pdf');
    const sodBlocked = await api(`/orders/refunds/${refundIdB}/transfer`, {
      method: 'POST',
      token: tokens.admin,
      body: sameAdmTransfer,
    });
    assert.equal(sodBlocked.status, 403);

    // --- Scenario C: >= 20,000,000 VND Dual Approval ---
    const hC1 = await createHorse(tokens.custA, 'REFC1');
    const { ordId: ordC } = await setupConfirmedRoadOrder({
      horsesPayload: [{ horseId: hC1, name: 'QA-REFC1', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      bookingType: 'dedicated_charter',
      approvePayload: { bookingType: 'dedicated_charter', quotedHorseCount: 1, transportCost: 25_000_000, transportMode: 'road' },
      tStart: futureIso(44, 0),
      tEnd: futureIso(44, 6),
      paySepay: true,
      sepayTxId: 880003,
      label: 'REFC25M',
    });
    const ocC = await api(`/orders/${ordC}/operational-cancel`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        category: 'company_fault',
        reason: 'Hủy vận hành hoàn 25M dual approval',
        refundMode: 'cash_refund',
      }),
    });
    assert.ok([200, 201].includes(ocC.status));
    assert.equal(ocC.body.refundRecord.amount, 25_000_000);
    assert.equal(ocC.body.refundRecord.requiresDualApproval, true);
    const refundIdC = Number(ocC.body.refundRecord.id);

    const dual1 = await api(`/orders/refunds/${refundIdC}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(dual1.status, 200);
    assert.equal(dual1.body.status, 'pending_second_approval');

    const sameMgr2 = await api(`/orders/refunds/${refundIdC}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(sameMgr2.status, 403);

    const dual2 = await api(`/orders/refunds/${refundIdC}/approve`, {
      method: 'PATCH',
      token: tokens.managerB,
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(dual2.status, 200);
    assert.equal(dual2.body.status, 'approved_for_transfer');

    const admTransferC = new FormData();
    admTransferC.append('recipientBankAccount', '1900555666');
    admTransferC.append('bankTransactionRef', 'FT-DUAL-OK');
    admTransferC.append('receipt', makePdfBlob(), 'dual_ok.pdf');
    const dualTrx = await api(`/orders/refunds/${refundIdC}/transfer`, {
      method: 'POST',
      token: tokens.admin,
      body: admTransferC,
    });
    assert.ok([200, 201].includes(dualTrx.status));
    assert.equal(dualTrx.body.status, 'transferred');
    const [refDbC] = await db.execute('SELECT transfer_receipt_url FROM shipment_refund_record WHERE refund_id = ?', [refundIdC]);
    if (refDbC[0]?.transfer_receipt_url) trackFile(refDbC[0].transfer_receipt_url, 'refund-receipts');
  });

  test('AC-F1-07 & BR-F1-06: Upgrade shared_stall to dedicated_charter at D-3 — Branch A (unpaid void + 12M reissue) & Branch B (paid 7M + 5M supplemental_invoice)', async () => {
    // --- Branch A: Unpaid -> void old invoice, cancel pending QR, reissue 12,000,000 primary invoice ---
    const hA1 = await createHorse(tokens.custA, 'UPGA1');
    const hA2 = await createHorse(tokens.custA, 'UPGA2');
    const { ordId: ordA } = await setupConfirmedRoadOrder({
      horsesPayload: [
        { horseId: hA1, name: 'QA-UPGA1', declaredValue: 100_000_000, insurancePackage: 'standard' },
        { horseId: hA2, name: 'QA-UPGA2', declaredValue: 100_000_000, insurancePackage: 'standard' },
      ],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: 2_000_000, transportMode: 'road' },
      tStart: futureIso(48, 0),
      tEnd: futureIso(48, 6),
      paySepay: false,
      label: 'UPGA',
    });
    const qrOld = await api(`/orders/${ordA}/payments/sepay`, { method: 'POST', token: tokens.custA });
    assert.equal(qrOld.status, 200);

    const upgA = await api(`/orders/${ordA}/upgrade-charter`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ charterTransportCost: 9_000_000, reason: 'D-3 không đủ khách ghép' }),
    });
    assert.ok([200, 201].includes(upgA.status), `upgrade A failed: ${upgA.status} ${JSON.stringify(upgA.body)}`);
    assert.equal(upgA.body.branch, 'A_void_reissue');

    const [invA] = await db.execute(
      'SELECT invoice_type, status, amount FROM shipment_invoice WHERE shipment_id = ? ORDER BY invoice_id ASC',
      [ordA],
    );
    assert.equal(invA.length, 2);
    assert.equal(invA[0].status, 'void');
    assert.equal(invA[1].invoice_type, 'primary');
    assert.equal(invA[1].status, 'active');
    assert.equal(Number(invA[1].amount), 12_000_000);

    const [[qrRowA]] = await db.execute('SELECT status FROM shipment_sepay_payment WHERE shipment_id = ?', [ordA]);
    assert.equal(qrRowA.status, 'cancelled');

    const [revA] = await db.execute('SELECT * FROM shipment_booking_revision WHERE shipment_id = ?', [ordA]);
    assert.equal(revA.length, 1);

    // --- Branch B: Paid 7M -> keep 7M primary & SePay succeeded intact, issue 5,000,000 supplemental invoice ---
    const hB1 = await createHorse(tokens.custA, 'UPGB1');
    const hB2 = await createHorse(tokens.custA, 'UPGB2');
    const { ordId: ordB } = await setupConfirmedRoadOrder({
      horsesPayload: [
        { horseId: hB1, name: 'QA-UPGB1', declaredValue: 100_000_000, insurancePackage: 'standard' },
        { horseId: hB2, name: 'QA-UPGB2', declaredValue: 100_000_000, insurancePackage: 'standard' },
      ],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: 2_000_000, transportMode: 'road' },
      tStart: futureIso(50, 0),
      tEnd: futureIso(50, 6),
      paySepay: true,
      sepayTxId: 880004,
      label: 'UPGB',
    });

    const upgB = await api(`/orders/${ordB}/upgrade-charter`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ charterTransportCost: 9_000_000, reason: 'D-3 nâng cấp charter sau thanh toán' }),
    });
    assert.ok([200, 201].includes(upgB.status), `upgrade B failed: ${upgB.status} ${JSON.stringify(upgB.body)}`);
    assert.equal(upgB.body.branch, 'B_supplemental_invoice');

    const [invB] = await db.execute(
      'SELECT invoice_type, status, amount FROM shipment_invoice WHERE shipment_id = ? ORDER BY invoice_id ASC',
      [ordB],
    );
    assert.equal(invB.length, 2);
    assert.equal(invB[0].invoice_type, 'primary');
    assert.equal(invB[0].status, 'paid');
    assert.equal(Number(invB[0].amount), 7_000_000);
    assert.equal(invB[1].invoice_type, 'supplemental');
    assert.equal(invB[1].status, 'active');
    assert.equal(Number(invB[1].amount), 5_000_000);

    const [[sepayB]] = await db.execute('SELECT status, amount FROM shipment_sepay_payment WHERE shipment_id = ?', [ordB]);
    assert.equal(sepayB.status, 'succeeded');
    assert.equal(Number(sepayB.amount), 7_000_000);

    const [revB] = await db.execute('SELECT * FROM shipment_booking_revision WHERE shipment_id = ?', [ordB]);
    assert.equal(revB.length, 1);
  });

  test('AC-F3-04 & AC-F3-05 & BR-F3-05..07: SLA Sweep (T-52h Hard Cap escalation + BR-F3-06 fallback, second grace 409, auto-cancel on expired T-24h grace)', async () => {
    // --- Part 1: Grace 1x limit (409) & auto-cancel on expired grace ---
    const hG = await createHorse(tokens.custA, 'SLAG');
    const { ordId: ordGrace } = await setupConfirmedRoadOrder({
      horsesPayload: [{ horseId: hG, name: 'QA-SLAG', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' },
      tStart: futureIso(54, 0),
      tEnd: futureIso(54, 6),
      paySepay: false,
      label: 'SLAG',
    });

    await db.execute(
      `UPDATE shipment
       SET departure_date = DATE_ADD(NOW(), INTERVAL 28 HOUR),
           requested_date = DATE_ADD(NOW(), INTERVAL 28 HOUR),
           payment_overdue = TRUE
       WHERE shipment_id = ?`,
      [ordGrace],
    );
    await db.execute(
      "UPDATE shipment_invoice SET payment_due_at = DATE_SUB(NOW(), INTERVAL 2 HOUR), status = 'overdue' WHERE shipment_id = ?",
      [ordGrace],
    );

    const g1 = await api(`/orders/${ordGrace}/payment-grace`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ reason: 'Gia hạn duy nhất 1 lần' }),
    });
    assert.ok([200, 201].includes(g1.status));
    assert.equal(g1.body.graceCount, 1);

    const g2 = await api(`/orders/${ordGrace}/payment-grace`, {
      method: 'POST',
      token: tokens.managerB,
      body: JSON.stringify({ reason: 'Bấm lần 2 phải 409' }),
    });
    assert.equal(g2.status, 409);

    // Fast-forward grace_due_at past deadline -> sweep auto-cancels
    await db.execute(
      'UPDATE shipment_invoice SET grace_due_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE shipment_id = ?',
      [ordGrace],
    );
    const sweep1 = await api('/orders/sla/run-sweep', { method: 'POST', token: tokens.managerA });
    assert.equal(sweep1.status, 200);
    assert.ok(sweep1.body.autoCancelledOverdueShipments >= 1);

    const [[sGrace]] = await db.execute('SELECT status, cancellation_category FROM shipment WHERE shipment_id = ?', [ordGrace]);
    assert.equal(sGrace.status, 'cancelled_operational');
    assert.equal(sGrace.cancellation_category, 'payment_overdue_expired');
    const [[hGrace]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [hG]);
    assert.equal(hGrace.status, 'active');

    // --- Part 2: T-52h Hard Cap escalation & BR-F3-06 fallback ---
    const hHC = await createHorse(tokens.custA, 'SLAHC');
    const ordRes = await api('/orders', {
      method: 'POST',
      token: tokens.custA,
      body: JSON.stringify({
        bookingType: 'shared_stall',
        contactName: 'QA HardCap',
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: 1,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: futureIso(56, 0),
        transportationType: 'Domestic',
        horses: [{ horseId: hHC, name: 'QA-SLAHC', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      }),
    });
    assert.equal(ordRes.status, 201);
    const ordHc = Number(ordRes.body.id);

    await api(`/orders/${ordHc}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
    });
    await api(`/routes/plan/${ordHc}/strategic-framework`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
    });
    const tHc0 = futureIso(56, 0);
    const tHc1 = futureIso(56, 6);
    await api(`/routes/plan/${ordHc}/build-detail`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        routeName: `Route-HC-${ordHc}`,
        totalDistanceKm: 850,
        legs: [{
          sequenceNo: 1,
          legType: 'road',
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          vehicleId: seed.vehicles.trk4b,
          plannedDeparture: tHc0,
          plannedArrival: tHc1,
        }],
        stops: [{
          sequenceNo: 1,
          legSequenceNo: 1,
          stopType: 'rest',
          locationName: 'Stop HC',
          country: 'Vietnam',
          plannedArrival: tHc1,
          plannedDeparture: tHc1,
        }],
      }),
    });
    assert.ok((await api(`/routes/plan/${ordHc}/submit`, { method: 'POST', token: tokens.coordinator, body: JSON.stringify({}) })).ok);
    assert.ok((await api(`/routes/plan/${ordHc}/review`, { method: 'POST', token: tokens.managerA, body: JSON.stringify({ status: 'approved' }) })).ok);
    assert.ok((await api(`/fleet/shipments/${ordHc}/assign-staff`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({ assignments: [{ userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' }] }),
    })).ok);

    // Move departure to T+50h (inside T-52h Hard Cap) with plan still unconfirmed
    await db.execute(
      'UPDATE shipment SET departure_date = DATE_ADD(NOW(), INTERVAL 50 HOUR), requested_date = DATE_ADD(NOW(), INTERVAL 50 HOUR) WHERE shipment_id = ?',
      [ordHc],
    );
    const sweep2 = await api('/orders/sla/run-sweep', { method: 'POST', token: tokens.managerA });
    assert.equal(sweep2.status, 200);
    assert.ok(sweep2.body.hardCapAlertsTriggered >= 1);

    const [hcNotifs] = await db.execute(
      "SELECT title FROM notification WHERE shipment_id = ? AND user_id = ? AND title LIKE '%T-52h%'",
      [ordHc, seed.users['manager.a@test.local'].id],
    );
    assert.ok(hcNotifs.length >= 1, 'Expected Manager A to receive T-52h hard-cap alert notification');

    const fbRes = await api(`/orders/${ordHc}/sla-fallback`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ option: 'external_contractor', notes: 'Pre-vetted contractor activated' }),
    });
    assert.ok([200, 201].includes(fbRes.status));
  });

  test('AC-F4-02 & BR-F4-04: Shared road_trip partial completion — leaving Đà Nẵng transfer_hub completes Order A while keeping Order B in_transit and vehicle in_use', async () => {
    const t0 = futureIso(60, 0);
    const t1 = futureIso(60, 12);
    const rtRes = await api('/fleet/road-trips', {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        vehicleId: seed.vehicles.trk4a,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Hà Nội, Vietnam',
        plannedDeparture: t0,
        plannedArrival: t1,
        bookingType: 'shared_stall',
      }),
    });
    assert.equal(rtRes.status, 201);
    const roadTripId = Number(rtRes.body.id);

    const sharedStops = [
      {
        sequenceNo: 1,
        legSequenceNo: 1,
        stopType: 'rest',
        locationName: 'Nha Trang Rest',
        country: 'Vietnam',
        plannedArrival: futureIso(60, 5),
        plannedDeparture: futureIso(60, 6),
      },
    ];

    const hA = await createHorse(tokens.custA, 'PART_A');
    const hB = await createHorse(tokens.custB, 'PART_B');

    const { ordId: ordA } = await setupConfirmedRoadOrder({
      custToken: tokens.custA,
      customerEmail: 'cust.a@test.local',
      horsesPayload: [{ horseId: hA, name: 'QA-PART-A', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' },
      roadTripId,
      originLocation: 'Củ Chi, TP.HCM, Vietnam',
      destinationLocation: 'Đà Nẵng, Vietnam',
      tStart: t0,
      tEnd: t1,
      stops: sharedStops,
      label: 'PART_A',
    });

    const { ordId: ordB } = await setupConfirmedRoadOrder({
      custToken: tokens.custB,
      customerEmail: 'cust.b@test.local',
      horsesPayload: [{ horseId: hB, name: 'QA-PART-B', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 3_000_000, transportMode: 'road' },
      roadTripId,
      originLocation: 'Củ Chi, TP.HCM, Vietnam',
      destinationLocation: 'Hà Nội, Vietnam',
      tStart: t0,
      tEnd: t1,
      stops: sharedStops,
      label: 'PART_B',
    });

    for (const sid of [ordA, ordB]) {
      await db.execute("UPDATE shipment SET status = 'in_transit' WHERE shipment_id = ?", [sid]);
      await db.execute("UPDATE route SET plan_status = 'in_transit' WHERE shipment_id = ?", [sid]);
      await db.execute(
        'UPDATE route_leg SET status = ? WHERE route_id = (SELECT route_id FROM route WHERE shipment_id = ? LIMIT 1)',
        ['active', sid],
      );
    }
    await db.execute("UPDATE vehicle SET status = 'in_use' WHERE vehicle_id = ?", [seed.vehicles.trk4a]);

    const [stopsA] = await db.execute(
      `SELECT rs.route_stop_id, rs.sequence_no, rs.stop_type, rs.location_name
       FROM route_stop rs
       JOIN route r ON r.route_id = rs.route_id
       WHERE r.shipment_id = ?
       ORDER BY rs.sequence_no ASC`,
      [ordA],
    );
    const dnIdx = stopsA.findIndex(
      (s) => s.stop_type === 'transfer_hub' && String(s.location_name).includes('Đà Nẵng'),
    );
    assert.ok(dnIdx >= 0, `Expected Đà Nẵng transfer_hub stop on Order A, got: ${JSON.stringify(stopsA)}`);

    // Progress stops strictly in sequence up to and including Đà Nẵng drop-off transfer_hub
    for (let i = 0; i <= dnIdx; i++) {
      const sidStop = Number(stopsA[i].route_stop_id);
      const arr = await api(`/tracking/shipments/${ordA}/stops/${sidStop}/status`, {
        method: 'POST',
        token: tokens.driver1,
        body: JSON.stringify({ action: 'arrived' }),
      });
      assert.equal(arr.status, 201, `stop arrived #${sidStop} failed: ${arr.status} ${JSON.stringify(arr.body)}`);
      const dep = await api(`/tracking/shipments/${ordA}/stops/${sidStop}/status`, {
        method: 'POST',
        token: tokens.driver1,
        body: JSON.stringify({ action: 'departed' }),
      });
      assert.equal(dep.status, 201, `stop departed #${sidStop} failed: ${dep.status} ${JSON.stringify(dep.body)}`);
    }

    const [[sA]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [ordA]);
    const [[sB]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [ordB]);
    const [[vehRow]] = await db.execute('SELECT status FROM vehicle WHERE vehicle_id = ?', [seed.vehicles.trk4a]);

    assert.equal(sA.status, 'completed');
    assert.equal(sB.status, 'in_transit');
    assert.equal(vehRow.status, 'in_use');
  });

  test('AC-F4-03 & BR-F4-03: Equine Vital Signs API — 2x climate_change stays amber_observational (no false Red), 38.55C + 25bpm -> amber_escalatable, +3h not_eating -> red Alert + Manager/Coordinator notifications', async () => {
    const hV = await createHorse(tokens.custA, 'VITALS');
    const { ordId } = await setupConfirmedRoadOrder({
      horsesPayload: [{ horseId: hV, name: 'QA-VITALS', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      bookingType: 'shared_stall',
      approvePayload: { bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' },
      vehicleId: seed.vehicles.trk4b,
      tStart: futureIso(65, 0),
      tEnd: futureIso(65, 6),
      label: 'VITALS',
    });

    await db.execute("UPDATE shipment SET status = 'in_transit' WHERE shipment_id = ?", [ordId]);
    await db.execute("UPDATE route SET plan_status = 'in_transit' WHERE shipment_id = ?", [ordId]);

    const nowMs = Date.now();
    const tMinus7h = new Date(nowMs - 7 * 3_600_000).toISOString();
    const tMinus5h = new Date(nowMs - 5 * 3_600_000).toISOString();
    const tMinus3h = new Date(nowMs - 3 * 3_600_000).toISOString();
    const tNow = new Date(nowMs).toISOString();

    const postVital = (body) =>
      api(`/tracking/shipments/${ordId}/health-logs`, {
        method: 'POST',
        token: tokens.driver1,
        body: JSON.stringify({ horseId: hV, horseName: 'QA-VITALS', ...body }),
      });

    const v1 = await postVital({ conditionStatus: 'climate_change', temperatureC: 38.0, heartRateBpm: 36, recordedAt: tMinus7h });
    assert.equal(v1.status, 201);
    assert.equal(v1.body.alertTier, 'amber_observational');

    const v2 = await postVital({ conditionStatus: 'climate_change', temperatureC: 38.0, heartRateBpm: 36, recordedAt: tMinus5h });
    assert.equal(v2.status, 201);
    assert.equal(v2.body.alertTier, 'amber_observational');

    const v3 = await postVital({ conditionStatus: 'stable', temperatureC: 38.55, heartRateBpm: 25, recordedAt: tMinus3h });
    assert.equal(v3.status, 201);
    assert.equal(v3.body.alertTier, 'amber_escalatable');

    const v4 = await postVital({ conditionStatus: 'not_eating', temperatureC: 38.0, heartRateBpm: 40, recordedAt: tNow });
    assert.equal(v4.status, 201);
    assert.equal(v4.body.alertTier, 'red');

    const [mgrRed] = await db.execute(
      "SELECT title FROM notification WHERE shipment_id = ? AND user_id = ? AND title LIKE '%RED ALERT%'",
      [ordId, seed.users['manager.a@test.local'].id],
    );
    // Sau review 11/2026, Coordinator đã gộp vào Logistics Manager nên Red Alert chỉ gửi cho Manager.
    assert.ok(mgrRed.length >= 1, 'Expected Logistics Manager Red Alert notification');
  });
});
