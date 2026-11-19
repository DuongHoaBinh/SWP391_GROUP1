const path = require('node:path');
const assert = require('node:assert/strict');
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

function futureIso(daysAhead) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString();
}

describe('Orders Supertest Integration: AC-F1-01 & AC-F1-02 (Isolated DB: horse_transport_test)', () => {
  let app = null;
  let httpServer = null;
  let db = null;
  let seed = null;
  let custToken = null;
  let managerToken = null;
  let managerId = null;
  let acF101OrderId = null;

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

    const custLogin = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: 'cust.a@test.local', password: 'Password123' });
    assert.ok([200, 201].includes(custLogin.status), `Customer login failed: ${custLogin.status} ${custLogin.text}`);
    custToken = custLogin.body.accessToken;

    const mgrLogin = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: 'manager.a@test.local', password: 'Password123' });
    assert.ok([200, 201].includes(mgrLogin.status), `Manager login failed: ${mgrLogin.status} ${mgrLogin.text}`);
    managerToken = mgrLogin.body.accessToken;
    managerId = Number(seed.users['manager.a@test.local'].id);
  });

  after(async () => {
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

  async function createActiveHorse(label) {
    const res = await request(httpServer)
      .post('/api/horses')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        name: `IT-${label}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985IT${label}`,
        passportNo: `FEI-IT-${label}`,
        status: 'active',
      });
    assert.equal(res.status, 201, `Create horse failed: ${res.status} ${res.text}`);
    return Number(res.body.id);
  }

  test('AC-F1-01: 2 active horses shared_stall standard (100M/horse), stallUnitPrice=2M road -> insurance=3M, transport=4M, total=7M, paymentUnlocked=false', async () => {
    const h1 = await createActiveHorse('ACF101_1');
    const h2 = await createActiveHorse('ACF101_2');

    const createRes = await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        bookingType: 'shared_stall',
        contactName: 'Customer A Integration',
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: 2,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: futureIso(25),
        transportationType: 'Domestic',
        horses: [
          {
            horseId: h1,
            name: 'IT-ACF101_1',
            declaredValue: 100_000_000,
            declaredCurrency: 'VND',
            insurancePackage: 'standard',
          },
          {
            horseId: h2,
            name: 'IT-ACF101_2',
            declaredValue: 100_000_000,
            declaredCurrency: 'VND',
            insurancePackage: 'standard',
          },
        ],
      });
    assert.equal(createRes.status, 201, `Create order failed: ${createRes.status} ${createRes.text}`);
    acF101OrderId = Number(createRes.body.id);
    assert.equal(createRes.body.status, 'requested');
    assert.equal(Number(createRes.body.insuranceFee), 3_000_000);

    const approveRes = await request(httpServer)
      .patch(`/api/orders/${acF101OrderId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        bookingType: 'shared_stall',
        quotedHorseCount: 2,
        stallUnitPrice: 2_000_000,
        transportMode: 'road',
      });
    assert.equal(approveRes.status, 200, `Approve failed: ${approveRes.status} ${approveRes.text}`);
    assert.equal(approveRes.body.status, 'approved');
    assert.equal(approveRes.body.bookingType, 'shared_stall');
    assert.equal(approveRes.body.transportMode, 'road');
    assert.equal(Number(approveRes.body.stallUnitPrice), 2_000_000);
    assert.equal(Number(approveRes.body.insuranceFee), 3_000_000);
    assert.equal(Number(approveRes.body.transportCost), 4_000_000);
    assert.equal(Number(approveRes.body.totalCost), 7_000_000);

    const [[dbOrder]] = await db.execute(
      'SELECT status, booking_type, transport_mode, stall_unit_price, insurance_fee, transport_cost, total_cost FROM shipment WHERE shipment_id = ?',
      [acF101OrderId],
    );
    assert.equal(dbOrder.status, 'approved');
    assert.equal(dbOrder.booking_type, 'shared_stall');
    assert.equal(dbOrder.transport_mode, 'road');
    assert.equal(Number(dbOrder.stall_unit_price), 2_000_000);
    assert.equal(Number(dbOrder.insurance_fee), 3_000_000);
    assert.equal(Number(dbOrder.transport_cost), 4_000_000);
    assert.equal(Number(dbOrder.total_cost), 7_000_000);

    const [[invCountRow]] = await db.execute(
      'SELECT COUNT(*) AS cnt FROM shipment_invoice WHERE shipment_id = ?',
      [acF101OrderId],
    );
    assert.equal(Number(invCountRow.cnt), 0);

    const sepayStatusRes = await request(httpServer)
      .get(`/api/orders/${acF101OrderId}/payments/sepay`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(sepayStatusRes.status, 200);
    assert.equal(sepayStatusRes.body.paymentUnlocked, false);
    assert.equal(sepayStatusRes.body.invoice, null);

    const sepayBlockedRes = await request(httpServer)
      .post(`/api/orders/${acF101OrderId}/payments/sepay`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(sepayBlockedRes.status, 422);
  });

  test('AC-F1-01 (Quotation PDF Check): Server provides Quotation PDF field, attachment, or /api/orders/:id/quotation endpoint', async () => {
    assert.ok(acF101OrderId, 'Prerequisite AC-F1-01 order must exist');

    const orderRes = await request(httpServer)
      .get(`/api/orders/${acF101OrderId}`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(orderRes.status, 200);

    const hasServerPdfField = Boolean(orderRes.body?.quotationPdfUrl || orderRes.body?.quotationUrl);
    const hasPdfAttachment = Array.isArray(orderRes.body?.attachments)
      && orderRes.body.attachments.some((att) =>
        String(att?.fileUrl || '').toLowerCase().includes('.pdf')
        || String(att?.fileUrl || '').toLowerCase().includes('quotation'));

    const quotationRes = await request(httpServer)
      .get(`/api/orders/${acF101OrderId}/quotation`)
      .set('Authorization', `Bearer ${custToken}`);
    const hasQuotationEndpoint =
      quotationRes.status === 200
      && String(quotationRes.headers['content-type'] || '').toLowerCase().includes('application/pdf');

    assert.ok(
      hasServerPdfField || hasPdfAttachment || hasQuotationEndpoint,
      `Expected server-side Quotation PDF (field, attachment, or GET /api/orders/${acF101OrderId}/quotation returning application/pdf); ` +
        `got orderKeys=${JSON.stringify(Object.keys(orderRes.body || {}))}, attachments=${JSON.stringify(orderRes.body?.attachments || [])}, ` +
        `GET /quotation status=${quotationRes.status} body=${quotationRes.text}`,
    );
  });

  test('AC-F1-02: 50 parallel Customer Cancel vs Manager Approve races — strictly 1 winner + 1 HTTP 409, clean DB invariants', async () => {
    let approveWins = 0;
    let cancelWins = 0;

    for (let i = 0; i < 50; i++) {
      const horseId = await createActiveHorse(`RACE_${i}`);
      const createRes = await request(httpServer)
        .post('/api/orders')
        .set('Authorization', `Bearer ${custToken}`)
        .send({
          bookingType: 'shared_stall',
          contactName: 'Customer A Race',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          requestedDate: futureIso(25),
          transportationType: 'Domestic',
          horses: [
            {
              horseId,
              name: `IT-RACE_${i}`,
              declaredValue: 50_000_000,
              declaredCurrency: 'VND',
              insurancePackage: 'basic',
            },
          ],
        });
      assert.equal(createRes.status, 201, `Iter ${i} createOrder failed: ${createRes.status} ${createRes.text}`);
      const orderId = Number(createRes.body.id);

      const sendCancel = () =>
        request(httpServer)
          .patch(`/api/orders/${orderId}/cancel`)
          .set('Authorization', `Bearer ${custToken}`)
          .send({});

      const sendApprove = () =>
        request(httpServer)
          .patch(`/api/orders/${orderId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            bookingType: 'shared_stall',
            quotedHorseCount: 1,
            stallUnitPrice: 2_000_000,
            transportMode: 'road',
          });

      let cancelRes;
      let approveRes;
      if (i % 2 === 0) {
        [cancelRes, approveRes] = await Promise.all([sendCancel(), sendApprove()]);
      } else {
        [approveRes, cancelRes] = await Promise.all([sendApprove(), sendCancel()]);
      }

      // (a) Strictly 1 succeeds (200) and the other returns 409
      const statuses = [approveRes.status, cancelRes.status].sort((a, b) => a - b);
      assert.deepEqual(
        statuses,
        [200, 409],
        `Iter ${i}: expected [200, 409], got approve=${approveRes.status}, cancel=${cancelRes.status}`,
      );

      // (b) Final DB status strictly cancelled OR approved
      const [[sRow]] = await db.execute(
        'SELECT status, total_cost, transport_cost, stall_unit_price, approved_by FROM shipment WHERE shipment_id = ?',
        [orderId],
      );
      const [[hRow]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [horseId]);
      const [[invRow]] = await db.execute(
        'SELECT COUNT(*) AS cnt FROM shipment_invoice WHERE shipment_id = ?',
        [orderId],
      );

      assert.ok(
        sRow && (sRow.status === 'cancelled' || sRow.status === 'approved'),
        `Iter ${i}: unexpected final status ${sRow?.status}`,
      );

      // (e) Never both cancelled and quoted
      const hasAnyQuote =
        Number(sRow.total_cost || 0) > 0 ||
        sRow.transport_cost !== null ||
        sRow.stall_unit_price !== null ||
        sRow.approved_by !== null;
      assert.equal(
        sRow.status === 'cancelled' && hasAnyQuote,
        false,
        `Iter ${i}: corrupted state — order is cancelled AND has quote columns`,
      );

      if (sRow.status === 'cancelled') {
        // (c) Cancelled -> no quote, no invoice, horse returns active
        cancelWins++;
        assert.equal(cancelRes.status, 200);
        assert.equal(approveRes.status, 409);
        assert.equal(Number(sRow.total_cost || 0), 0);
        assert.equal(sRow.transport_cost, null);
        assert.equal(sRow.stall_unit_price, null);
        assert.equal(sRow.approved_by, null);
        assert.equal(Number(invRow.cnt), 0);
        assert.equal(hRow.status, 'active');
      } else {
        // (d) Approved -> has quote, horse stays held (in_transit)
        approveWins++;
        assert.equal(approveRes.status, 200);
        assert.equal(cancelRes.status, 409);
        assert.equal(Number(sRow.total_cost), 2_000_000);
        assert.equal(Number(sRow.transport_cost), 2_000_000);
        assert.equal(Number(sRow.stall_unit_price), 2_000_000);
        assert.equal(Number(sRow.approved_by), managerId);
        assert.notEqual(hRow.status, 'active');
      }
    }

    assert.equal(approveWins + cancelWins, 50);
    console.log(`[AC-F1-02] Race summary over 50 iterations: approveWins=${approveWins}, cancelWins=${cancelWins}`);
  });
});
