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
process.env.MOMO_SANDBOX_ENABLED = 'true';
process.env.MOMO_ENDPOINT = 'https://test-payment.momo.vn/v2/gateway/api/create';
process.env.MOMO_PARTNER_CODE = 'TEST';
process.env.MOMO_ACCESS_KEY = 'qa-momo-access-key-0123456789abcd';
process.env.MOMO_SECRET_KEY = 'qa-momo-secret-key-0123456789abcdef';
process.env.FRONTEND_ORIGIN = 'http://localhost:3001';

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

describe('Gate 2 Full 2^3 Combinatorial Matrix & Pre-Departure Downgrades (Isolated DB: horse_transport_test)', () => {
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
  let txSeq = 920_000_000;
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

  async function createPlannedDomesticOrder({ label, stallUnitPrice = 2_000_000, confirmPlan = false }) {
    slotSeq += 1;
    const daySlot = 45 + slotSeq;
    const baseMs = baseUtcDayMs(daySlot);
    const tStartIso = addHoursIso(baseMs, 0);
    const tEndIso = addHoursIso(baseMs, 6);

    const horseRes = await request(httpServer)
      .post('/api/horses')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        name: `G2-H-${label}-${slotSeq}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985G2${slotSeq}`,
        passportNo: `FEI-G2-${slotSeq}`,
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
            name: `G2-H-${label}-${slotSeq}`,
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
        stallUnitPrice,
        transportMode: 'road',
      });
    assert.equal(approveRes.status, 200, `Approve failed: ${approveRes.status} ${approveRes.text}`);
    const totalCost = Number(approveRes.body.totalCost);
    assert.equal(totalCost, stallUnitPrice);

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
        routeName: `G2Route-${label}-${orderId}`,
        totalDistanceKm: 850,
        legs: [
          {
            sequenceNo: 1,
            legType: 'road',
            originLocation: 'Củ Chi, TP.HCM, Vietnam',
            destinationLocation: 'Đà Nẵng, Vietnam',
            vehicleId: seed.vehicles.trk4a,
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
            plannedDeparture: addHoursIso(baseMs, 7),
          },
        ],
      });
    assert.equal(bdRes.status, 201, `Build detail failed: ${bdRes.status} ${bdRes.text}`);
    const routeId = Number(bdRes.body.id);
    const legId = Number(bdRes.body.legs[0].id);
    const stopId = Number(bdRes.body.stops[0].id);

    const submitRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/submit`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({});
    assert.ok([200, 201].includes(submitRes.status), `Submit failed: ${submitRes.status} ${submitRes.text}`);

    const reviewRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' });
    assert.ok([200, 201].includes(reviewRes.status), `Review failed: ${reviewRes.status} ${reviewRes.text}`);

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

    if (confirmPlan) {
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
    }

    return { orderId, horseId, routeId, legId, stopId, totalCost, daySlot };
  }

  async function createPlannedSingaporeOrder({ label }) {
    slotSeq += 1;
    const daySlot = 45 + slotSeq;
    const baseMs = baseUtcDayMs(daySlot);
    const tStartIso = addHoursIso(baseMs, 2);
    const tEndIso = addHoursIso(baseMs, 6);

    const horseRes = await request(httpServer)
      .post('/api/horses')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        name: `G2-SG-${label}-${slotSeq}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985SG${slotSeq}`,
        passportNo: `FEI-SG-${slotSeq}`,
        status: 'active',
      });
    assert.equal(horseRes.status, 201);
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
        originLocation: 'Sân bay Tân Sơn Nhất (SGN), TP.HCM, Vietnam',
        destinationLocation: 'Singapore Turf Club (SIN), Singapore',
        requestedDate: tStartIso,
        transportationType: 'International',
        horses: [
          {
            horseId,
            name: `G2-SG-${label}-${slotSeq}`,
            declaredValue: 50_000_000,
            declaredCurrency: 'VND',
            insurancePackage: 'basic',
          },
        ],
      });
    assert.equal(createRes.status, 201, `Create SG order failed: ${createRes.status} ${createRes.text}`);
    const orderId = Number(createRes.body.id);

    const approveRes = await request(httpServer)
      .patch(`/api/orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        bookingType: 'shared_stall',
        quotedHorseCount: 1,
        stallUnitPrice: 2_000_000,
        transportMode: 'air',
      });
    assert.equal(approveRes.status, 200);
    const totalCost = Number(approveRes.body.totalCost);

    const sfRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/strategic-framework`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id,
        managerVehicleType: 'Air Cargo',
      });
    assert.ok([200, 201].includes(sfRes.status));

    const bdRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/build-detail`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        routeName: `G2SGRoute-${label}-${orderId}`,
        totalDistanceKm: 1200,
        legs: [
          {
            sequenceNo: 1,
            legType: 'flight',
            originLocation: 'Sân bay Tân Sơn Nhất (SGN)',
            destinationLocation: 'Singapore Turf Club (SIN)',
            airlineId: seed.airlines.sq,
            airlineName: 'Singapore Airlines Cargo',
            flightNumber: `SQ-G2-${orderId}`,
            departureAirportId: seed.airports.sgn,
            departureAirportCode: 'SGN',
            arrivalAirportId: seed.airports.sin,
            arrivalAirportCode: 'SIN',
            bookingReference: `AWB-G2-${orderId}`,
            stallsBooked: 1,
            plannedDeparture: tStartIso,
            plannedArrival: tEndIso,
          },
        ],
        stops: [
          {
            sequenceNo: 1,
            legSequenceNo: 1,
            stopType: 'border_check',
            locationName: 'Changi SIN Border',
            country: 'Singapore',
            plannedArrival: tEndIso,
            plannedDeparture: addHoursIso(baseMs, 7),
          },
        ],
      });
    assert.equal(bdRes.status, 201, `SG build-detail failed: ${bdRes.status} ${bdRes.text}`);
    const routeId = Number(bdRes.body.id);
    const legId = Number(bdRes.body.legs[0].id);
    const stopId = Number(bdRes.body.stops[0].id);

    assert.ok([200, 201].includes((await request(httpServer).post(`/api/routes/plan/${orderId}/submit`).set('Authorization', `Bearer ${coordinatorToken}`).send({})).status));
    assert.ok([200, 201].includes((await request(httpServer).post(`/api/routes/plan/${orderId}/review`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'approved' })).status));
    assert.ok([200, 201].includes((await request(httpServer).post(`/api/fleet/shipments/${orderId}/assign-staff`).set('Authorization', `Bearer ${coordinatorToken}`).send({
      assignments: [
        { userId: seed.users['driver1.qa@test.local'].id, roleInShipment: 'driver' },
        { userId: seed.users['escort1.qa@test.local'].id, roleInShipment: 'escort' },
      ],
    })).status));

    assert.ok([200, 201].includes((await request(httpServer).post(`/api/routes/plan/${orderId}/driver-confirm`).set('Authorization', `Bearer ${driverToken}`).send({})).status));
    const escConf = await request(httpServer).post(`/api/routes/plan/${orderId}/driver-confirm`).set('Authorization', `Bearer ${escortToken}`).send({});
    assert.ok([200, 201].includes(escConf.status));
    assert.equal(escConf.body.isFullyConfirmed, true);

    return { orderId, horseId, routeId, legId, stopId, totalCost, daySlot };
  }

  async function satisfyCompliance({
    orderId,
    horseId,
    daySlot,
    skipCount = 0,
    leaveAuthorityPending = false,
    customExpiryByDocType = {},
  }) {
    const issueDate = formatDateOnly(new Date().toISOString());
    const defaultExpiry = formatDateOnly(addHoursIso(baseUtcDayMs(daySlot + 30), 0));

    const preRes = await request(httpServer)
      .get(`/api/documents/order/${orderId}/checklist`)
      .set('Authorization', `Bearer ${specialistToken}`);
    assert.equal(preRes.status, 200);
    const missingRegs = preRes.body?.horses?.[0]?.missingRegulations ?? [];
    assert.ok(missingRegs.length >= 2, `Expected >= 2 applicable regulations, got ${missingRegs.length}`);

    const targetRegs = skipCount > 0
      ? missingRegs.slice(0, Math.max(0, missingRegs.length - skipCount))
      : missingRegs;

    const uploaded = [];
    for (const reg of targetRegs) {
      const regulationId = Number(reg.id);
      const docType = reg.documentType;
      const expiryDate = customExpiryByDocType[docType] ?? defaultExpiry;

      const upRes = await request(httpServer)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${custToken}`)
        .field('horseId', String(horseId))
        .field('regulationId', String(regulationId))
        .field('docType', docType)
        .field('docNumber', `G2-DOC-${orderId}-${regulationId}`)
        .field('issueDate', issueDate)
        .field('expiryDate', expiryDate)
        .attach('file', MIN_PDF_BUFFER, { filename: `${docType}_${orderId}.pdf`, contentType: 'application/pdf' });
      assert.equal(upRes.status, 201, `Upload ${docType} failed: ${upRes.status} ${upRes.text}`);
      if (upRes.body?.fileUrl) uploadedUrls.push(upRes.body.fileUrl);

      const docId = Number(upRes.body.id);
      const revRes = await request(httpServer)
        .patch(`/api/documents/${docId}/review`)
        .set('Authorization', `Bearer ${specialistToken}`)
        .send({ status: 'approved', notes: 'Approved for Gate 2 test', expiryDate });
      assert.equal(revRes.status, 200, `Review ${docType} failed: ${revRes.status} ${revRes.text}`);

      if (reg.requiresAuthorityApproval) {
        const authStatus = leaveAuthorityPending ? 'pending' : 'approved';
        const authPayload = leaveAuthorityPending
          ? { authorityName: 'AVS Singapore', status: authStatus, notes: 'Awaiting Tier 2 sign-off' }
          : {
              authorityName: 'AVS Singapore',
              status: authStatus,
              approvalDate: new Date().toISOString(),
              referenceNumber: `AVS-G2-${orderId}-${regulationId}`,
            };
        const authRes = await request(httpServer)
          .post(`/api/documents/${docId}/authority-approval`)
          .set('Authorization', `Bearer ${specialistToken}`)
          .send(authPayload);
        assert.ok([200, 201].includes(authRes.status), `Authority approval failed: ${authRes.status} ${authRes.text}`);
      }

      uploaded.push({
        docId,
        regulationId,
        docType,
        requiresAuthorityApproval: Boolean(reg.requiresAuthorityApproval),
      });
    }

    return uploaded;
  }

  async function settleSepayPayment({ orderId, amountOverride }) {
    const qrRes = await request(httpServer)
      .post(`/api/orders/${orderId}/payments/sepay`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({});
    assert.equal(qrRes.status, 200, `Create SePay QR failed: ${qrRes.status} ${qrRes.text}`);

    const paymentId = Number(qrRes.body.id);
    const paymentCode = qrRes.body.paymentCode;
    const transferAmount = amountOverride ?? Number(qrRes.body.amount);
    const txId = nextTxId();

    const rawStr = JSON.stringify({
      id: txId,
      gateway: SEPAY_BANK_CODE,
      transactionDate: '2026-11-20 00:10:00',
      accountNumber: SEPAY_ACCOUNT_NUMBER,
      transferType: 'in',
      transferAmount,
      code: paymentCode,
      content: `Thanh toan ${paymentCode}`,
      referenceCode: `G2REF-${txId}`,
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig =
      'sha256=' + createHmac('sha256', SEPAY_SECRET).update(`${ts}.`).update(Buffer.from(rawStr, 'utf8')).digest('hex');

    const whRes = await request(httpServer)
      .post('/api/payments/sepay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-SePay-Timestamp', ts)
      .set('X-SePay-Signature', sig)
      .send(rawStr);
    assert.equal(whRes.status, 200, `SePay webhook failed: ${whRes.status} ${whRes.text}`);
    assert.deepEqual(whRes.body, { success: true });

    return { paymentId, paymentCode, txId };
  }

  async function assertReadiness(orderId, expected) {
    const res = await request(httpServer)
      .get(`/api/routes/plan/${orderId}/readiness`)
      .set('Authorization', `Bearer ${managerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.isPlanConfirmed, expected.isPlanConfirmed, `isPlanConfirmed mismatch: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.isLegalCompliant, expected.isLegalCompliant, `isLegalCompliant mismatch: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.isPaymentSucceeded, expected.isPaymentSucceeded, `isPaymentSucceeded mismatch: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.isReadyToDepart, expected.isReadyToDepart, `isReadyToDepart mismatch: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.pendingConditions));
    assert.equal(
      res.body.pendingConditions.length,
      expected.pendingCount,
      `Expected ${expected.pendingCount} pendingConditions, got ${JSON.stringify(res.body.pendingConditions)}`,
    );
    return res.body;
  }

  async function assertBothDepartureEntrypointsBlocked({
    orderId,
    legId,
    expectedMissingCount,
    expectedSubstring,
    departureActorToken = driverToken,
    label,
  }) {
    const pubRes = await request(httpServer)
      .post(`/api/routes/shipment/${orderId}/publish`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});
    assert.equal(pubRes.status, 422, `${label} publish must return 422, got ${pubRes.status}: ${pubRes.text}`);
    assert.ok(
      Array.isArray(pubRes.body?.missingRequirements) && pubRes.body.missingRequirements.length === expectedMissingCount,
      `${label} publish expected ${expectedMissingCount} missingRequirements, got ${JSON.stringify(pubRes.body)}`,
    );
    if (expectedSubstring) {
      assert.ok(
        pubRes.body.missingRequirements.some((r) => String(r).includes(expectedSubstring)),
        `${label} publish missingRequirements did not include "${expectedSubstring}": ${JSON.stringify(pubRes.body.missingRequirements)}`,
      );
    }

    const startRes = await request(httpServer)
      .post(`/api/tracking/shipments/${orderId}/legs/${legId}/start`)
      .set('Authorization', `Bearer ${departureActorToken}`)
      .send({ notes: `Blocked departure attempt: ${label}` });
    assert.equal(startRes.status, 422, `${label} checkInLegStart must return 422, got ${startRes.status}: ${startRes.text}`);
    assert.ok(
      Array.isArray(startRes.body?.missingRequirements) && startRes.body.missingRequirements.length === expectedMissingCount,
      `${label} checkInLegStart expected ${expectedMissingCount} missingRequirements, got ${JSON.stringify(startRes.body)}`,
    );
    if (expectedSubstring) {
      assert.ok(
        startRes.body.missingRequirements.some((r) => String(r).includes(expectedSubstring)),
        `${label} checkInLegStart missingRequirements did not include "${expectedSubstring}": ${JSON.stringify(startRes.body.missingRequirements)}`,
      );
    }

    const [[sRow]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    assert.notEqual(sRow.status, 'in_transit', `${label}: shipment must not transition to in_transit when blocked`);
  }

  test('G2-000 (Thiếu 3/3 — Plan=0, Legal=0, Pay=0): Readiness báo thiếu 3 và chặn cả publish lẫn checkInLegStart với 422', async () => {
    const { orderId, legId } = await createPlannedDomesticOrder({ label: '000', confirmPlan: false });

    await assertReadiness(orderId, {
      isPlanConfirmed: false,
      isLegalCompliant: false,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 3,
    });

    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 3,
      label: 'G2-000',
    });
  });

  test('G2-100 (Thiếu 2/3 — Plan=1, Legal=0, Pay=0): Đã confirm lộ trình nhưng thiếu Pháp lý & SePay -> chặn 422 (2 lý do)', async () => {
    const { orderId, legId } = await createPlannedDomesticOrder({ label: '100', confirmPlan: true });

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: false,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 2,
    });

    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 2,
      label: 'G2-100',
    });
  });

  test('G2-010 (Thiếu 2/3 — Plan=0, Legal=1, Pay=0): Flow 2 đủ 100% vẫn KHÔNG tự mở Gate 1 và vẫn bị Gate 2 chặn 422', async () => {
    const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({ label: '010', confirmPlan: false });
    await satisfyCompliance({ orderId, horseId, daySlot });

    // Gate 1 stays locked (422) even when Flow 2 is 100% compliant
    const g1Res = await request(httpServer)
      .post(`/api/orders/${orderId}/payments/sepay`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({});
    assert.equal(g1Res.status, 422, `Gate 1 must remain blocked while plan unconfirmed, got ${g1Res.status}`);

    await assertReadiness(orderId, {
      isPlanConfirmed: false,
      isLegalCompliant: true,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 2,
    });

    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 2,
      label: 'G2-010',
    });
  });

  test('G2-001 (Thiếu 2/3 — Plan=0, Legal=0, Pay=1): Đã trả SePay nhưng Driver từ chối phân công & thiếu hồ sơ -> chặn 422 (2 lý do)', async () => {
    const { orderId, legId } = await createPlannedDomesticOrder({ label: '001', confirmPlan: true });
    await settleSepayPayment({ orderId });

    const decRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/driver-decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ reason: 'Driver unavailable before departure' });
    assert.ok([200, 201].includes(decRes.status), `driver-decline failed: ${decRes.status} ${decRes.text}`);

    await assertReadiness(orderId, {
      isPlanConfirmed: false,
      isLegalCompliant: false,
      isPaymentSucceeded: true,
      isReadyToDepart: false,
      pendingCount: 2,
    });

    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 2,
      label: 'G2-001',
    });
  });

  test('G2-110 (Thiếu 1/3 — Plan=1, Legal=1, Pay=0) + AC-F4-01 MoMo Sandbox succeeded & SePay trả thiếu (review) đều không qua Gate 2', async () => {
    // Quote > 50,000,000 VND so MoMo uses deterministic local ATM sandbox fallback without external HTTP calls
    const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({
      label: '110',
      stallUnitPrice: 60_000_000,
      confirmPlan: true,
    });
    await satisfyCompliance({ orderId, horseId, daySlot });

    // (a) Unpaid
    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: true,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'SePay',
      label: 'G2-110 unpaid',
    });

    // (b) AC-F4-01: MoMo Sandbox succeeded must NEVER satisfy Gate 2
    const momoCreate = await request(httpServer)
      .post(`/api/orders/${orderId}/payments/momo`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({});
    assert.ok([200, 201].includes(momoCreate.status), `MoMo create failed: ${momoCreate.status} ${momoCreate.text}`);

    const momoAtm = await request(httpServer)
      .post(`/api/orders/${orderId}/payments/momo/confirm-atm`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ cardNumber: '9704000000000018', cardHolder: 'NGUYEN VAN A', issueDate: '07/20', otp: 'OTP' });
    assert.ok([200, 201].includes(momoAtm.status), `MoMo confirm-atm failed: ${momoAtm.status} ${momoAtm.text}`);

    const momoGet = await request(httpServer)
      .get(`/api/orders/${orderId}/payments/momo`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(momoGet.status, 200);
    assert.equal(momoGet.body.payment?.status, 'succeeded');

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: true,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'SePay',
      label: 'G2-110 MoMo sandbox trap',
    });

    // (c) SePay underpayment (status='review') must ALSO keep Gate 2 blocked
    await settleSepayPayment({ orderId, amountOverride: 59_000_000 });
    const [[payRow]] = await db.execute(
      'SELECT status FROM shipment_sepay_payment WHERE shipment_id = ? ORDER BY payment_id DESC LIMIT 1',
      [orderId],
    );
    assert.equal(payRow.status, 'review');

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: true,
      isPaymentSucceeded: false,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'SePay',
      label: 'G2-110 SePay review trap',
    });
  });

  test('G2-101 (Thiếu 1/3 — Plan=1, Legal=0, Pay=1): Nội địa thiếu 1 chứng từ & AC-F2-01 Quốc tế Singapore thiếu duyệt Tầng 2 AVS', async () => {
    // (a) Domestic missing 1 regulation
    {
      const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({ label: '101A', confirmPlan: true });
      await settleSepayPayment({ orderId });
      await satisfyCompliance({ orderId, horseId, daySlot, skipCount: 1 });

      await assertReadiness(orderId, {
        isPlanConfirmed: true,
        isLegalCompliant: false,
        isPaymentSucceeded: true,
        isReadyToDepart: false,
        pendingCount: 1,
      });
      await assertBothDepartureEntrypointsBlocked({
        orderId,
        legId,
        expectedMissingCount: 1,
        expectedSubstring: 'Flow 2',
        label: 'G2-101 domestic missing 1 doc',
      });
    }

    // (b) AC-F2-01: International Singapore — all internally approved, import_permit Authority Approval stays 'pending'
    {
      const { orderId, horseId, legId, daySlot } = await createPlannedSingaporeOrder({ label: '101B' });
      await settleSepayPayment({ orderId });
      await satisfyCompliance({ orderId, horseId, daySlot, leaveAuthorityPending: true });

      const checklistRes = await request(httpServer)
        .get(`/api/documents/order/${orderId}/checklist`)
        .set('Authorization', `Bearer ${specialistToken}`);
      assert.equal(checklistRes.status, 200);
      assert.equal(checklistRes.body.isFullyCompliant, false);

      await assertReadiness(orderId, {
        isPlanConfirmed: true,
        isLegalCompliant: false,
        isPaymentSucceeded: true,
        isReadyToDepart: false,
        pendingCount: 1,
      });
      await assertBothDepartureEntrypointsBlocked({
        orderId,
        legId,
        expectedMissingCount: 1,
        expectedSubstring: 'Flow 2',
        departureActorToken: escortToken,
        label: 'G2-101 Singapore AVS pending',
      });
    }
  });

  test('G2-011 (Thiếu 1/3 — Plan=0, Legal=1, Pay=1): Đã ready_to_depart nhưng Driver từ chối phân công -> tự hạ về confirmed & chặn 422', async () => {
    const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({ label: '011', confirmPlan: true });
    await satisfyCompliance({ orderId, horseId, daySlot });
    await settleSepayPayment({ orderId });

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: true,
      isPaymentSucceeded: true,
      isReadyToDepart: true,
      pendingCount: 0,
    });

    const decRes = await request(httpServer)
      .post(`/api/routes/plan/${orderId}/driver-decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ reason: 'Sudden medical unavailability' });
    assert.ok([200, 201].includes(decRes.status));

    const [[sRow]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    const [[rRow]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
    // Nhân sự từ chối sau khi đã confirmed/ready_to_depart: kế hoạch về "đã duyệt, chờ nhân sự xác nhận"
    // và đơn về planning (có lịch sử), không được giữ confirmed khi thiếu tài xế.
    assert.equal(sRow.status, 'planning');
    assert.equal(rRow.plan_status, 'approved');
    const [[hRow]] = await db.execute(
      "SELECT from_status, to_status, reason_code FROM shipment_status_history WHERE shipment_id = ? AND reason_code = 'staff_declined' ORDER BY history_id DESC LIMIT 1",
      [orderId],
    );
    assert.equal(hRow?.to_status, 'planning');

    await assertReadiness(orderId, {
      isPlanConfirmed: false,
      isLegalCompliant: true,
      isPaymentSucceeded: true,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'xác nhận',
      label: 'G2-011',
    });
  });

  test('G2-111 (Đủ 3/3 — Plan=1, Legal=1, Pay=1): Tự động lên ready_to_depart và xuất phát thành công qua CẢ publish và checkInLegStart', async () => {
    // Order A -> publish
    {
      const { orderId, horseId, daySlot } = await createPlannedDomesticOrder({ label: '111A', confirmPlan: true });
      await satisfyCompliance({ orderId, horseId, daySlot });
      await settleSepayPayment({ orderId });

      await assertReadiness(orderId, {
        isPlanConfirmed: true,
        isLegalCompliant: true,
        isPaymentSucceeded: true,
        isReadyToDepart: true,
        pendingCount: 0,
      });

      const [[preShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
      const [[preRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
      assert.equal(preShip.status, 'ready_to_depart');
      assert.equal(preRoute.plan_status, 'ready_to_depart');

      const pubRes = await request(httpServer)
        .post(`/api/routes/shipment/${orderId}/publish`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
      assert.ok([200, 201].includes(pubRes.status), `Expected 200/201 on publish when 3/3 ready, got ${pubRes.status}: ${pubRes.text}`);

      const [[postShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
      const [[postRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
      assert.equal(postShip.status, 'in_transit');
      assert.equal(postRoute.plan_status, 'in_transit');
    }

    // Order B -> checkInLegStart
    {
      const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({ label: '111B', confirmPlan: true });
      await satisfyCompliance({ orderId, horseId, daySlot });
      await settleSepayPayment({ orderId });

      const startRes = await request(httpServer)
        .post(`/api/tracking/shipments/${orderId}/legs/${legId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ notes: 'Gate 2 all 3/3 passed — departing on schedule' });
      assert.ok([200, 201].includes(startRes.status), `Expected 200/201 on checkInLegStart when 3/3 ready, got ${startRes.status}: ${startRes.text}`);

      const [[postShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
      const [[postRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
      assert.equal(postShip.status, 'in_transit');
      assert.equal(postRoute.plan_status, 'in_transit');
    }
  });

  test('G2-DOWNGRADE-EXPIRY (AC-F2-02): Đang ready_to_depart thì hồ sơ bị đánh dấu expired -> tự hạ về confirmed, chặn 422, re-upload duyệt lại tự lên ready_to_depart & xuất phát được', async () => {
    const { orderId, horseId, legId, daySlot } = await createPlannedDomesticOrder({ label: 'DOWN_EXP', confirmPlan: true });
    const docs = await satisfyCompliance({ orderId, horseId, daySlot });
    await settleSepayPayment({ orderId });

    const [[beforeShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    assert.equal(beforeShip.status, 'ready_to_depart');

    const targetDoc = docs[0];
    const expireRes = await request(httpServer)
      .patch(`/api/documents/${targetDoc.docId}/review`)
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({ status: 'expired', notes: 'Expired before departure' });
    assert.equal(expireRes.status, 200);

    const [[downShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    const [[downRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
    assert.equal(downShip.status, 'confirmed');
    assert.equal(downRoute.plan_status, 'confirmed');

    const [[custDownNotif]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Chuyến đi tạm hoãn xuất phát (Gate 2)'",
      [orderId, customerAId],
    );
    const [[coordDownNotif]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ? AND title = 'Cảnh báo Gate 2: Tạm hạ trạng thái chờ xuất phát'",
      [orderId, seed.users['coordinator.qa@test.local'].id],
    );
    assert.equal(Number(custDownNotif.cnt), 1);
    assert.equal(Number(coordDownNotif.cnt), 1);

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: false,
      isPaymentSucceeded: true,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'Flow 2',
      label: 'G2-DOWNGRADE-EXPIRY',
    });

    // Re-upload & re-approve -> auto-promotes back to ready_to_depart -> checkInLegStart succeeds
    const reUpRes = await request(httpServer)
      .post(`/api/documents/${targetDoc.docId}/re-upload`)
      .set('Authorization', `Bearer ${custToken}`)
      .attach('file', MIN_PDF_BUFFER, { filename: `renewed_${targetDoc.docType}_${orderId}.pdf`, contentType: 'application/pdf' });
    assert.ok([200, 201].includes(reUpRes.status), `re-upload failed: ${reUpRes.status} ${reUpRes.text}`);
    if (reUpRes.body?.fileUrl) uploadedUrls.push(reUpRes.body.fileUrl);

    const renewedDocId = Number(reUpRes.body.id);
    const renewedExpiry = formatDateOnly(addHoursIso(baseUtcDayMs(daySlot + 45), 0));
    const reApproveRes = await request(httpServer)
      .patch(`/api/documents/${renewedDocId}/review`)
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({ status: 'approved', notes: 'Renewed valid document', expiryDate: renewedExpiry });
    assert.equal(reApproveRes.status, 200);

    const [[restoredShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    const [[restoredRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
    assert.equal(restoredShip.status, 'ready_to_depart');
    assert.equal(restoredRoute.plan_status, 'ready_to_depart');

    const startRes = await request(httpServer)
      .post(`/api/tracking/shipments/${orderId}/legs/${legId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ notes: 'Departed after document renewal' });
    assert.ok([200, 201].includes(startRes.status), `Expected departure success after renewal, got ${startRes.status}: ${startRes.text}`);
  });

  test('G2-DOWNGRADE-SCHEDULE (AC-F2-02): Đang ready_to_depart thì dời lịch đẩy arrival + 24h vượt quá expiryDate giấy Tầng B -> tự hạ về confirmed & chặn 422', async () => {
    const { orderId, horseId, routeId, legId, stopId, daySlot } = await createPlannedDomesticOrder({
      label: 'DOWN_SCHED',
      confirmPlan: true,
    });

    const tightHealthExpiry = formatDateOnly(addHoursIso(baseUtcDayMs(daySlot + 2), 0));
    await satisfyCompliance({
      orderId,
      horseId,
      daySlot,
      customExpiryByDocType: { health_certificate: tightHealthExpiry },
    });
    await settleSepayPayment({ orderId });

    const [[beforeShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    assert.equal(beforeShip.status, 'ready_to_depart');

    const shiftedArr = addHoursIso(baseUtcDayMs(daySlot + 4), 10);
    const shiftedDep = addHoursIso(baseUtcDayMs(daySlot + 4), 11);
    const shiftRes = await request(httpServer)
      .patch(`/api/routes/${routeId}/schedule`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        reason: 'Heavy storm delay pushes arrival +4 days past Tier-B cert buffer',
        stops: [{ stopId, plannedArrival: shiftedArr, plannedDeparture: shiftedDep }],
      });
    assert.equal(shiftRes.status, 200, `Schedule shift failed: ${shiftRes.status} ${shiftRes.text}`);

    const [[downShip]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [orderId]);
    const [[downRoute]] = await db.execute('SELECT plan_status FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [orderId]);
    assert.equal(downShip.status, 'confirmed');
    assert.equal(downRoute.plan_status, 'confirmed');

    const checklistRes = await request(httpServer)
      .get(`/api/documents/order/${orderId}/checklist`)
      .set('Authorization', `Bearer ${specialistToken}`);
    assert.equal(checklistRes.status, 200);
    assert.equal(checklistRes.body.hasExpiredDocuments, true);
    assert.equal(checklistRes.body.isFullyCompliant, false);

    await assertReadiness(orderId, {
      isPlanConfirmed: true,
      isLegalCompliant: false,
      isPaymentSucceeded: true,
      isReadyToDepart: false,
      pendingCount: 1,
    });
    await assertBothDepartureEntrypointsBlocked({
      orderId,
      legId,
      expectedMissingCount: 1,
      expectedSubstring: 'Flow 2',
      label: 'G2-DOWNGRADE-SCHEDULE',
    });
  });
});
