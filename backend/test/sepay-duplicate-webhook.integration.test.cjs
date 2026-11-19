const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { after, before, describe, test } = require('node:test');

// Load DB credentials from .env first, then lock DB_NAME to horse_transport_test BEFORE importing Nest modules.
require('../node_modules/dotenv').config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'horse_transport_test';
assert.notEqual(
  process.env.DB_NAME,
  'horse_transport_system',
  'CRITICAL GUARD: integration tests must never target developer DB',
);
process.env.DISABLE_SLA_SCHEDULER = 'true';
process.env.JWT_SECRET = 'qa-supertest-jwt-secret-key-min-32-chars-0123456789';
process.env.INSURANCE_USD_TO_VND = '25000';
process.env.SEPAY_ENABLED = 'true';
process.env.SEPAY_BANK_CODE = 'MB';
process.env.SEPAY_ACCOUNT_NUMBER = '0123456789';
process.env.SEPAY_ACCOUNT_NAME = 'EQUITRANSIT QA';
process.env.SEPAY_PAYMENT_PREFIX = 'DH';
process.env.SEPAY_CODE_LENGTH = '8';
process.env.SEPAY_WEBHOOK_SECRET = 'qa-test-sepay-secret-1234567890-abcdef';

require('../node_modules/reflect-metadata');
const request = require('supertest');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const {
  TEST_DB_NAME,
  dropTestDatabase,
  openTestDbConnection,
  resetTestDatabase,
} = require('./qa-spec/test-db-harness.cjs');

const SEPAY_SECRET = process.env.SEPAY_WEBHOOK_SECRET;
const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER;
const SEPAY_BANK_CODE = process.env.SEPAY_BANK_CODE;
const MIN_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

function baseUtcDayMs(daysAhead) {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + daysAhead * 86_400_000;
}

function addHoursIso(baseMs, hours) {
  return new Date(baseMs + hours * 3_600_000).toISOString();
}

function formatDateOnly(iso) {
  return iso.split('T')[0];
}

function unlinkUploadedRel(relUrl) {
  if (!relUrl || typeof relUrl !== 'string') return;
  const trimmed = relUrl.replace(/^\/+/, '');
  const candidates = [
    path.resolve(__dirname, '..', trimmed),
    path.resolve(process.cwd(), trimmed),
  ];
  for (const target of candidates) {
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch {}
    }
  }
}

describe('SePay Duplicate Webhook & Payment Concurrency Integration Tests (Isolated DB: horse_transport_test)', () => {
  let app = null;
  let httpServer = null;
  let db = null;
  let seed = null;

  let custToken = null;
  let customerAId = null;
  let managerToken = null;
  let specialistToken = null;
  let coordinatorToken = null;
  let driverToken = null;
  let escortToken = null;

  let slotSeq = 0;
  let txSeq = 910_000_000;
  const uploadedUrls = [];

  before(async () => {
    assert.equal(process.env.DB_NAME, TEST_DB_NAME);
    seed = await resetTestDatabase();
    db = await openTestDbConnection();

    app = await NestFactory.create(AppModule, {
      rawBody: true,
      logger: ['error', 'warn'],
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    httpServer = app.getHttpServer();

    const loginAs = async (email) => {
      const res = await request(httpServer)
        .post('/api/auth/login')
        .send({ email, password: 'Password123' });
      assert.ok([200, 201].includes(res.status), `Login ${email} failed: ${res.status} ${res.text}`);
      return res.body.accessToken;
    };

    [custToken, managerToken, specialistToken, coordinatorToken, driverToken, escortToken] = await Promise.all([
      loginAs('cust.a@test.local'),
      loginAs('manager.a@test.local'),
      loginAs('specialist.qa@test.local'),
      loginAs('coordinator.qa@test.local'),
      loginAs('driver1.qa@test.local'),
      loginAs('escort1.qa@test.local'),
    ]);
    customerAId = Number(seed.users['cust.a@test.local'].id);
  });

  after(async () => {
    for (const rel of uploadedUrls) {
      unlinkUploadedRel(rel);
    }
    try {
      if (db) {
        await db.end();
        db = null;
      }
      if (app) {
        await app.close();
        app = null;
      }
    } finally {
      await dropTestDatabase();
    }
  });

  function nextTxId() {
    txSeq += 1;
    return txSeq;
  }

  async function createConfirmedOrder(label, vehicleId = seed.vehicles.trk4a) {
    slotSeq += 1;
    const daySlot = 40 + slotSeq;
    const baseMs = baseUtcDayMs(daySlot);
    const tStartIso = addHoursIso(baseMs, 0);
    const tEndIso = addHoursIso(baseMs, 6);

    const horseRes = await request(httpServer)
      .post('/api/horses')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        name: `SEPAY-H-${label}-${slotSeq}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985SP${slotSeq}`,
        passportNo: `FEI-SP-${slotSeq}`,
        status: 'active',
      });
    assert.equal(horseRes.status, 201, `Create horse failed: ${horseRes.status} ${horseRes.text}`);
    const horseId = Number(horseRes.body.id);

    const createRes = await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        bookingType: 'shared_stall',
        contactName: `Customer A ${label}`,
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: 1,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: tStartIso,
        transportationType: 'Domestic',
        horses: [
          {
            horseId,
            name: `SEPAY-H-${label}-${slotSeq}`,
            declaredValue: 50_000_000,
            declaredCurrency: 'VND',
            insurancePackage: 'basic',
          },
        ],
      });
    assert.equal(createRes.status, 201, `Create order failed: ${createRes.status} ${createRes.text}`);
    const orderId = Number(createRes.body.id);

    const approveRes = await request(httpServer)
      .patch(`/api/orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        bookingType: 'shared_stall',
        quotedHorseCount: 1,
        stallUnitPrice: 2_000_000,
        transportMode: 'road',
      });
    assert.equal(approveRes.status, 200, `Approve failed: ${approveRes.status} ${approveRes.text}`);
    const totalCost = Number(approveRes.body.totalCost);
    assert.equal(totalCost, 2_000_000);

    const sfRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/strategic-framework`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id,
        managerVehicleType: 'Specialized Horse Truck',
      });
    assert.ok([200, 201].includes(sfRes.status), `Strategic framework failed: ${sfRes.status} ${sfRes.text}`);

    const bdRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/build-detail`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        routeName: `SepayRoute-${label}-${orderId}`,
        totalDistanceKm: 850,
        legs: [
          {
            sequenceNo: 1,
            legType: 'road',
            originLocation: 'Củ Chi, TP.HCM, Vietnam',
            destinationLocation: 'Đà Nẵng, Vietnam',
            vehicleId,
            plannedDeparture: tStartIso,
            plannedArrival: tEndIso,
          },
        ],
        stops: [
          {
            sequenceNo: 1,
            legSequenceNo: 1,
            stopType: 'rest',
            locationName: 'Nha Trang Rest Station',
            country: 'Vietnam',
            plannedArrival: tEndIso,
            plannedDeparture: tEndIso,
          },
        ],
      });
    assert.equal(bdRes.status, 201, `Build detail failed: ${bdRes.status} ${bdRes.text}`);

    const submitRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/submit`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({});
    assert.ok([200, 201].includes(submitRes.status), `Submit plan failed: ${submitRes.status} ${submitRes.text}`);

    const reviewRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' });
    assert.ok([200, 201].includes(reviewRes.status), `Review plan failed: ${reviewRes.status} ${reviewRes.text}`);

    const assignRes = await request(httpServer)
      .post(`/api/fleet/shipments/${orderId}/assign-staff`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        assignments: [
          { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
          { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
        ],
      });
    assert.ok([200, 201].includes(assignRes.status), `Assign staff failed: ${assignRes.status} ${assignRes.text}`);

    const drvConf = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/driver-confirm`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({});
    assert.ok([200, 201].includes(drvConf.status), `Driver confirm failed: ${drvConf.status} ${drvConf.text}`);

    const escConf = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/driver-confirm`)
      .set('Authorization', `Bearer ${escortToken}`)
      .send({});
    assert.ok([200, 201].includes(escConf.status), `Escort confirm failed: ${escConf.status} ${escConf.text}`);
    assert.equal(escConf.body.isFullyConfirmed, true);

    return { orderId, horseId, totalCost, daySlot };
  }

  async function createSepayQr(orderId) {
    const res = await request(httpServer)
      .post(`/api/orders/${orderId}/payments/sepay`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({});
    assert.equal(res.status, 200, `Create SePay QR failed: ${res.status} ${res.text}`);
    return {
      paymentId: Number(res.body.id),
      paymentCode: res.body.paymentCode,
      amount: Number(res.body.amount),
    };
  }

  function buildWebhookPayload({ txId, paymentCode, amount, overrides = {} }) {
    return {
      id: txId,
      gateway: SEPAY_BANK_CODE,
      transactionDate: '2026-11-19 12:00:00',
      accountNumber: SEPAY_ACCOUNT_NUMBER,
      transferType: 'in',
      transferAmount: amount,
      code: paymentCode,
      content: `Thanh toan ${paymentCode}`,
      referenceCode: `REF-${txId}`,
      ...overrides,
    };
  }

  async function sendSignedWebhook(
    payloadObj,
    { rawBodyOverride, timestampOffsetSec = 0, badSignature = false } = {},
  ) {
    const rawStr = rawBodyOverride ?? JSON.stringify(payloadObj);
    const ts = String(Math.floor(Date.now() / 1000) + timestampOffsetSec);
    const sig = badSignature
      ? 'sha256=' + '0'.repeat(64)
      : 'sha256=' + createHmac('sha256', SEPAY_SECRET).update(`${ts}.`).update(Buffer.from(rawStr, 'utf8')).digest('hex');

    return request(httpServer)
      .post('/api/payments/sepay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-SePay-Timestamp', ts)
      .set('X-SePay-Signature', sig)
      .send(rawStr);
  }

  test('SEPAY-DUP-01: 10 vòng × 5 webhook trùng transaction_id song song (kèm khác thứ tự key/whitespace JSON) + retry tuần tự', async () => {
    for (let i = 0; i < 10; i++) {
      const { orderId, totalCost } = await createConfirmedOrder(`D1_${i}`);
      const qr = await createSepayQr(orderId);
      const txId = nextTxId();
      const payload = buildWebhookPayload({
        txId,
        paymentCode: qr.paymentCode,
        amount: totalCost,
      });

      const reversedObj = Object.fromEntries(Object.entries(payload).reverse());
      const compactRaw = JSON.stringify(payload);
      const prettyReversedRaw = JSON.stringify(reversedObj, null, 2);

      const parallelResponses = await Promise.all([
        sendSignedWebhook(payload, { rawBodyOverride: compactRaw }),
        sendSignedWebhook(payload, { rawBodyOverride: prettyReversedRaw }),
        sendSignedWebhook(payload, { rawBodyOverride: compactRaw }),
        sendSignedWebhook(payload, { rawBodyOverride: prettyReversedRaw }),
        sendSignedWebhook(payload, { rawBodyOverride: compactRaw }),
      ]);

      for (const res of parallelResponses) {
        assert.equal(res.status, 200, `Iter ${i} parallel webhook expected 200, got ${res.status}: ${res.text}`);
        assert.deepEqual(res.body, { success: true });
      }

      const [[paymentBeforeRetry]] = await db.execute(
        'SELECT payment_id, status, transaction_id, amount, paid_at FROM shipment_sepay_payment WHERE shipment_id = ?',
        [orderId],
      );
      assert.ok(paymentBeforeRetry);
      assert.equal(paymentBeforeRetry.status, 'succeeded');
      const paidAtBeforeRetry = new Date(paymentBeforeRetry.paid_at).getTime();

      // Sequential retries (compact + reformatted reversed keys)
      const retry1 = await sendSignedWebhook(payload, { rawBodyOverride: compactRaw });
      const retry2 = await sendSignedWebhook(payload, { rawBodyOverride: prettyReversedRaw });
      assert.equal(retry1.status, 200);
      assert.deepEqual(retry1.body, { success: true });
      assert.equal(retry2.status, 200);
      assert.deepEqual(retry2.body, { success: true });

      const [receipts] = await db.execute(
        'SELECT transaction_id, payment_id, outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
        [txId],
      );
      assert.equal(receipts.length, 1, `Iter ${i}: expected strictly 1 receipt row`);
      assert.equal(receipts[0].outcome, 'paid');
      assert.equal(Number(receipts[0].payment_id), qr.paymentId);

      const [payments] = await db.execute(
        'SELECT payment_id, status, transaction_id, amount, paid_at FROM shipment_sepay_payment WHERE shipment_id = ?',
        [orderId],
      );
      assert.equal(payments.length, 1, `Iter ${i}: expected strictly 1 shipment_sepay_payment row`);
      assert.equal(payments[0].status, 'succeeded');
      assert.equal(Number(payments[0].transaction_id), txId);
      assert.equal(Number(payments[0].amount), totalCost);
      assert.equal(new Date(payments[0].paid_at).getTime(), paidAtBeforeRetry);

      const [invoices] = await db.execute(
        'SELECT invoice_id, status FROM shipment_invoice WHERE shipment_id = ?',
        [orderId],
      );
      assert.equal(invoices.length, 1);
      assert.equal(invoices[0].status, 'paid');

      const [[notifRow]] = await db.execute(
        "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
        [orderId, customerAId],
      );
      assert.equal(Number(notifRow.cnt), 1, `Iter ${i}: expected strictly 1 payment notification`);
    }
  });

  test('SEPAY-DUP-02: Trùng transaction_id nhưng khác payload (tampered replay tuần tự + 10 vòng đua song song -> [200, 409])', async () => {
    // Part A: Sequential replay with tampered transferAmount or altered referenceCode
    {
      const { orderId, totalCost } = await createConfirmedOrder('D2_SEQ');
      const qr = await createSepayQr(orderId);
      const txId = nextTxId();
      const validPayload = buildWebhookPayload({
        txId,
        paymentCode: qr.paymentCode,
        amount: totalCost,
      });

      const firstRes = await sendSignedWebhook(validPayload);
      assert.equal(firstRes.status, 200);
      assert.deepEqual(firstRes.body, { success: true });

      const tamperedAmountRes = await sendSignedWebhook(
        buildWebhookPayload({
          txId,
          paymentCode: qr.paymentCode,
          amount: 1_000_000,
        }),
      );
      assert.equal(tamperedAmountRes.status, 409, `Expected 409 on tampered transferAmount, got ${tamperedAmountRes.status}`);

      const tamperedRefRes = await sendSignedWebhook(
        buildWebhookPayload({
          txId,
          paymentCode: qr.paymentCode,
          amount: totalCost,
          overrides: { referenceCode: `TAMPER-${txId}` },
        }),
      );
      assert.equal(tamperedRefRes.status, 409, `Expected 409 on altered referenceCode, got ${tamperedRefRes.status}`);

      const [receipts] = await db.execute(
        'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
        [txId],
      );
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].outcome, 'paid');

      const [[payRow]] = await db.execute(
        'SELECT status, transaction_id FROM shipment_sepay_payment WHERE payment_id = ?',
        [qr.paymentId],
      );
      assert.equal(payRow.status, 'succeeded');
      assert.equal(Number(payRow.transaction_id), txId);

      const [[notifRow]] = await db.execute(
        "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
        [orderId, customerAId],
      );
      assert.equal(Number(notifRow.cnt), 1);
    }

    // Part B: 10 parallel conflict races with SAME transaction_id (valid vs tampered amount)
    let validWins = 0;
    let tamperedWins = 0;

    for (let i = 0; i < 10; i++) {
      const { orderId, totalCost } = await createConfirmedOrder(`D2_RACE_${i}`);
      const qr = await createSepayQr(orderId);
      const txId = nextTxId();

      const validPayload = buildWebhookPayload({
        txId,
        paymentCode: qr.paymentCode,
        amount: totalCost,
      });
      const tamperedPayload = buildWebhookPayload({
        txId,
        paymentCode: qr.paymentCode,
        amount: 1_000_000,
      });

      let validRes;
      let tamperedRes;
      if (i % 2 === 0) {
        [validRes, tamperedRes] = await Promise.all([
          sendSignedWebhook(validPayload),
          sendSignedWebhook(tamperedPayload),
        ]);
      } else {
        [tamperedRes, validRes] = await Promise.all([
          sendSignedWebhook(tamperedPayload),
          sendSignedWebhook(validPayload),
        ]);
      }

      const sorted = [validRes.status, tamperedRes.status].sort((a, b) => a - b);
      assert.deepEqual(
        sorted,
        [200, 409],
        `Iter ${i}: expected [200, 409], got valid=${validRes.status}, tampered=${tamperedRes.status}`,
      );

      const [receipts] = await db.execute(
        'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
        [txId],
      );
      assert.equal(receipts.length, 1, `Iter ${i}: expected strictly 1 receipt row`);

      const [[payRow]] = await db.execute(
        'SELECT status FROM shipment_sepay_payment WHERE payment_id = ?',
        [qr.paymentId],
      );
      const [[invRow]] = await db.execute(
        'SELECT status FROM shipment_invoice WHERE shipment_id = ?',
        [orderId],
      );
      const [[notifRow]] = await db.execute(
        "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
        [orderId, customerAId],
      );

      if (validRes.status === 200) {
        validWins++;
        assert.equal(tamperedRes.status, 409);
        assert.equal(receipts[0].outcome, 'paid');
        assert.equal(payRow.status, 'succeeded');
        assert.equal(invRow.status, 'paid');
        assert.equal(Number(notifRow.cnt), 1);
      } else {
        tamperedWins++;
        assert.equal(tamperedRes.status, 200);
        assert.equal(validRes.status, 409);
        assert.equal(receipts[0].outcome, 'amount_mismatch');
        assert.equal(payRow.status, 'review');
        assert.notEqual(invRow.status, 'paid');
        assert.equal(Number(notifRow.cnt), 0);
      }
    }

    assert.equal(validWins + tamperedWins, 10);
    console.log(`[SEPAY-DUP-02] Conflicting same-txId race over 10 iterations: validWins=${validWins}, tamperedWins=${tamperedWins}`);
  });

  test('SEPAY-DUP-03: Hai transaction_id KHÁC nhau cùng đập song song vào 1 payment_code (20 vòng xen kẽ + giao dịch thứ 3 đến muộn)', async () => {
    let txAWins = 0;
    let txBWins = 0;

    for (let i = 0; i < 20; i++) {
      const { orderId, totalCost } = await createConfirmedOrder(`D3_${i}`);
      const qr = await createSepayQr(orderId);
      const txA = nextTxId();
      const txB = nextTxId();

      const payloadA = buildWebhookPayload({
        txId: txA,
        paymentCode: qr.paymentCode,
        amount: totalCost,
      });
      const payloadB = buildWebhookPayload({
        txId: txB,
        paymentCode: qr.paymentCode,
        amount: totalCost,
      });

      let resA;
      let resB;
      if (i % 2 === 0) {
        [resA, resB] = await Promise.all([sendSignedWebhook(payloadA), sendSignedWebhook(payloadB)]);
      } else {
        [resB, resA] = await Promise.all([sendSignedWebhook(payloadB), sendSignedWebhook(payloadA)]);
      }

      assert.equal(resA.status, 200, `Iter ${i} resA status=${resA.status}: ${resA.text}`);
      assert.equal(resB.status, 200, `Iter ${i} resB status=${resB.status}: ${resB.text}`);
      assert.deepEqual(resA.body, { success: true });
      assert.deepEqual(resB.body, { success: true });

      const [receipts] = await db.execute(
        'SELECT transaction_id, outcome FROM sepay_webhook_receipt WHERE payment_id = ? ORDER BY transaction_id ASC',
        [qr.paymentId],
      );
      assert.equal(receipts.length, 2, `Iter ${i}: expected 2 receipts for payment_id=${qr.paymentId}`);

      const paidReceipts = receipts.filter((r) => r.outcome === 'paid');
      const alreadyPaidReceipts = receipts.filter((r) => r.outcome === 'already_paid');
      assert.equal(paidReceipts.length, 1, `Iter ${i}: expected strictly 1 'paid' receipt`);
      assert.equal(alreadyPaidReceipts.length, 1, `Iter ${i}: expected strictly 1 'already_paid' receipt`);

      const winningTxId = Number(paidReceipts[0].transaction_id);
      if (winningTxId === txA) txAWins++;
      else if (winningTxId === txB) txBWins++;
      else assert.fail(`Unexpected winning transaction_id=${winningTxId}`);

      const [[payRow]] = await db.execute(
        'SELECT status, transaction_id FROM shipment_sepay_payment WHERE payment_id = ?',
        [qr.paymentId],
      );
      assert.equal(payRow.status, 'succeeded', `Iter ${i}: payment must stay succeeded (never review)`);
      assert.equal(Number(payRow.transaction_id), winningTxId);

      const [[invRow]] = await db.execute(
        'SELECT status FROM shipment_invoice WHERE shipment_id = ?',
        [orderId],
      );
      assert.equal(invRow.status, 'paid');

      const [[notifRow]] = await db.execute(
        "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
        [orderId, customerAId],
      );
      assert.equal(Number(notifRow.cnt), 1, `Iter ${i}: expected strictly 1 payment notification`);

      // On round 0, verify a late 3rd distinct wrong-amount txC also resolves cleanly to already_paid
      if (i === 0) {
        const txC = nextTxId();
        const lateRes = await sendSignedWebhook(
          buildWebhookPayload({
            txId: txC,
            paymentCode: qr.paymentCode,
            amount: 1,
          }),
        );
        assert.equal(lateRes.status, 200);
        assert.deepEqual(lateRes.body, { success: true });

        const [[lateReceipt]] = await db.execute(
          'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
          [txC],
        );
        assert.equal(lateReceipt.outcome, 'already_paid');

        const [[payAfterLate]] = await db.execute(
          'SELECT status, transaction_id FROM shipment_sepay_payment WHERE payment_id = ?',
          [qr.paymentId],
        );
        assert.equal(payAfterLate.status, 'succeeded');
        assert.equal(Number(payAfterLate.transaction_id), winningTxId);

        const [[notifAfterLate]] = await db.execute(
          "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
          [orderId, customerAId],
        );
        assert.equal(Number(notifAfterLate.cnt), 1);
      }
    }

    assert.equal(txAWins + txBWins, 20);
    console.log(`[SEPAY-DUP-03] Different-txId double-transfer race over 20 iterations: txAWins=${txAWins}, txBWins=${txBWins}`);
  });

  test('SEPAY-DUP-04: 5 webhook trùng nhau song song trên đơn đã đủ 100% Flow 2 -> chuyển Gate 2 ready_to_depart đúng 1 lần, không nhân đôi thông báo Gate 2', async () => {
    const { orderId, horseId, totalCost, daySlot } = await createConfirmedOrder('D4_GATE2');
    const issueDate = formatDateOnly(new Date().toISOString());
    const expiryDate = formatDateOnly(addHoursIso(baseUtcDayMs(daySlot + 30), 0));

    const preChecklistRes = await request(httpServer)
      .get(`/api/documents/order/${orderId}/checklist`)
      .set('Authorization', `Bearer ${specialistToken}`);
    assert.equal(preChecklistRes.status, 200);
    const missingRegs = preChecklistRes.body?.horses?.[0]?.missingRegulations ?? [];
    assert.ok(missingRegs.length >= 2, `Expected >= 2 applicable regulations for Vietnam, got ${missingRegs.length}`);

    for (const reg of missingRegs) {
      const regulationId = Number(reg.id);
      const docType = reg.documentType;
      const upRes = await request(httpServer)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${custToken}`)
        .field('horseId', String(horseId))
        .field('regulationId', String(regulationId))
        .field('docType', docType)
        .field('docNumber', `SP-G2-${orderId}-${regulationId}`)
        .field('issueDate', issueDate)
        .field('expiryDate', expiryDate)
        .attach('file', MIN_PDF_BUFFER, { filename: `${docType}_${orderId}.pdf`, contentType: 'application/pdf' });
      assert.equal(upRes.status, 201, `Upload ${docType} failed: ${upRes.status} ${upRes.text}`);
      if (upRes.body?.fileUrl) uploadedUrls.push(upRes.body.fileUrl);

      const revRes = await request(httpServer)
        .patch(`/api/documents/${upRes.body.id}/review`)
        .set('Authorization', `Bearer ${specialistToken}`)
        .send({ status: 'approved', notes: 'Approved for Gate 2 SePay duplicate test', expiryDate });
      assert.equal(revRes.status, 200, `Review ${docType} failed: ${revRes.status} ${revRes.text}`);

      if (reg.requiresAuthorityApproval) {
        const authRes = await request(httpServer)
          .post(`/api/documents/${upRes.body.id}/authority-approval`)
          .set('Authorization', `Bearer ${specialistToken}`)
          .send({
            authorityName: 'Department of Animal Health',
            status: 'approved',
            approvalDate: new Date().toISOString(),
            referenceNumber: `DAH-${orderId}-${regulationId}`,
          });
        assert.ok([200, 201].includes(authRes.status), `Authority approval failed: ${authRes.status} ${authRes.text}`);
      }
    }

    const checklistRes = await request(httpServer)
      .get(`/api/documents/order/${orderId}/checklist`)
      .set('Authorization', `Bearer ${specialistToken}`);
    assert.equal(checklistRes.status, 200);
    assert.equal(
      checklistRes.body.isFullyCompliant,
      true,
      `Order must be 100% compliant before payment webhook: ${JSON.stringify(checklistRes.body)}`,
    );

    const [[preOrder]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    assert.equal(preOrder.status, 'confirmed');

    const qr = await createSepayQr(orderId);
    const txId = nextTxId();
    const payload = buildWebhookPayload({
      txId,
      paymentCode: qr.paymentCode,
      amount: totalCost,
    });

    const responses = await Promise.all(Array.from({ length: 5 }, () => sendSignedWebhook(payload)));
    for (const res of responses) {
      assert.equal(res.status, 200, `Expected 200 on parallel Gate 2 SePay webhook, got ${res.status}: ${res.text}`);
      assert.deepEqual(res.body, { success: true });
    }

    const [receipts] = await db.execute(
      'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
      [txId],
    );
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].outcome, 'paid');

    const [[postOrder]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    assert.equal(postOrder.status, 'ready_to_depart');

    const [[postRoute]] = await db.execute(
      'SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1',
      [orderId],
    );
    assert.equal(postRoute.plan_status, 'ready_to_depart');

    const [[payNotifRow]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
      [orderId, customerAId],
    );
    assert.equal(Number(payNotifRow.cnt), 1);

    const [[gateNotifRow]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Chuyến đi đã đủ điều kiện xuất phát'",
      [orderId, customerAId],
    );
    assert.equal(Number(gateNotifRow.cnt), 1);
  });

  test('SEPAY-DUP-05: 5 lệnh tạo QR song song + guard bảo mật HMAC/timestamp/sample id=0 + trả thiếu tiền không bị auto-settle bởi giao dịch sau', async () => {
    const { orderId, totalCost } = await createConfirmedOrder('D5_GUARDS');

    // 5 simultaneous create QR calls -> strictly 1 QR created and reused
    const qrResponses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(httpServer)
          .post(`/api/orders/${orderId}/payments/sepay`)
          .set('Authorization', `Bearer ${custToken}`)
          .send({}),
      ),
    );
    for (const res of qrResponses) {
      assert.equal(res.status, 200, `Parallel QR create failed: ${res.status} ${res.text}`);
    }
    const paymentIds = new Set(qrResponses.map((r) => Number(r.body.id)));
    const paymentCodes = new Set(qrResponses.map((r) => r.body.paymentCode));
    assert.equal(paymentIds.size, 1);
    assert.equal(paymentCodes.size, 1);

    const [qrDbRows] = await db.execute(
      'SELECT payment_id, payment_code, status FROM shipment_sepay_payment WHERE shipment_id = ?',
      [orderId],
    );
    assert.equal(qrDbRows.length, 1);
    assert.equal(qrDbRows[0].status, 'pending');
    const paymentCode = qrDbRows[0].payment_code;

    // Security guards: bad HMAC (401), expired timestamp (401), dashboard sample id=0 (200 no-op)
    const sampleTxId = nextTxId();
    const badSigRes = await sendSignedWebhook(
      buildWebhookPayload({ txId: sampleTxId, paymentCode, amount: totalCost }),
      { badSignature: true },
    );
    assert.equal(badSigRes.status, 401);

    const expiredRes = await sendSignedWebhook(
      buildWebhookPayload({ txId: sampleTxId, paymentCode, amount: totalCost }),
      { timestampOffsetSec: -600 },
    );
    assert.equal(expiredRes.status, 401);

    const dashboardSampleRes = await sendSignedWebhook(
      buildWebhookPayload({ txId: 0, paymentCode, amount: totalCost }),
    );
    assert.equal(dashboardSampleRes.status, 200);
    assert.deepEqual(dashboardSampleRes.body, { success: true });

    const [[sampleRcpt]] = await db.execute('SELECT COUNT(*) AS cnt FROM sepay_webhook_receipt WHERE transaction_id = 0');
    assert.equal(Number(sampleRcpt.cnt), 0);

    // Underpayment -> review; subsequent exact amount must NOT auto-settle
    const underTxId = nextTxId();
    const underRes = await sendSignedWebhook(
      buildWebhookPayload({ txId: underTxId, paymentCode, amount: 1_500_000 }),
    );
    assert.equal(underRes.status, 200);
    assert.deepEqual(underRes.body, { success: true });

    const [[underReceipt]] = await db.execute(
      'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
      [underTxId],
    );
    assert.equal(underReceipt.outcome, 'amount_mismatch');

    const [[afterUnderPay]] = await db.execute(
      'SELECT status, transaction_id FROM shipment_sepay_payment WHERE payment_code = ?',
      [paymentCode],
    );
    assert.equal(afterUnderPay.status, 'review');
    assert.equal(afterUnderPay.transaction_id, null);

    const [[invAfterUnder]] = await db.execute(
      'SELECT status FROM shipment_invoice WHERE shipment_id = ?',
      [orderId],
    );
    assert.notEqual(invAfterUnder.status, 'paid');

    const followUpTxId = nextTxId();
    const followUpRes = await sendSignedWebhook(
      buildWebhookPayload({ txId: followUpTxId, paymentCode, amount: totalCost }),
    );
    assert.equal(followUpRes.status, 200);
    assert.deepEqual(followUpRes.body, { success: true });

    const [[followUpReceipt]] = await db.execute(
      'SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?',
      [followUpTxId],
    );
    assert.equal(followUpReceipt.outcome, 'review_required');

    const [[finalPay]] = await db.execute(
      'SELECT status, transaction_id FROM shipment_sepay_payment WHERE payment_code = ?',
      [paymentCode],
    );
    assert.equal(finalPay.status, 'review');
    assert.equal(finalPay.transaction_id, null);

    const [[finalInv]] = await db.execute(
      'SELECT status FROM shipment_invoice WHERE shipment_id = ?',
      [orderId],
    );
    assert.notEqual(finalInv.status, 'paid');

    const [[notifRow]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Đã nhận thanh toán'",
      [orderId, customerAId],
    );
    assert.equal(Number(notifRow.cnt), 0);
  });
});
