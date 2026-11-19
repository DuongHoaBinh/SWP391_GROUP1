const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const {
  openTestDbConnection,
  resetTestDatabase,
  dropTestDatabase,
  startTestServer,
  stopTestServer,
  api,
  login,
  API_BASE,
} = require('./test-db-harness.cjs');

const SERVER_ORIGIN = new URL(API_BASE).origin;

let secSeq = 0;
function nextTag(prefix) {
  secSeq += 1;
  return `${prefix}${secSeq}`;
}

function futureIso(days, addHours = 0) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
    days * 86_400_000 +
    addHours * 3_600_000;
  return new Date(base).toISOString();
}

function makePdfBuffer(extraPayload) {
  const head = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');
  const tail = Buffer.from('\ntrailer<<>>\n%%EOF\n');
  return extraPayload ? Buffer.concat([head, extraPayload, tail]) : Buffer.concat([head, tail]);
}

function makePngBuffer(extraPayload) {
  const head = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  return extraPayload ? Buffer.concat([head, extraPayload]) : head;
}

function collectObjectKeys(value, targetKey, hits = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, targetKey, hits);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === targetKey) hits.push(v);
      collectObjectKeys(v, targetKey, hits);
    }
  }
  return hits;
}

describe('QA Spec v3.1 Tier 4: Security, IDOR, Shared-Trip Isolation, RBAC, Upload Hardening, XSS/SQLi & Rate Limit', () => {
  let seed;
  let server;
  let db;
  let tokens = {};
  const createdUploadUrls = [];

  function cleanupTrackedUrl(relUrl) {
    if (!relUrl || typeof relUrl !== 'string') return;
    let target = null;
    if (relUrl.startsWith('/uploads/')) {
      target = path.resolve(__dirname, '../..', relUrl.replace(/^\/+/, ''));
    } else if (relUrl.startsWith('/api/tracking/health-logs/attachments/')) {
      target = path.resolve(__dirname, '../../uploads/health-logs', path.basename(relUrl));
    } else if (relUrl.startsWith('/api/orders/disbursements/')) {
      return;
    }
    if (target && fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch {}
    }
  }

  before(async () => {
    seed = await resetTestDatabase();
    server = await startTestServer();
    db = await openTestDbConnection();

    const [admin, managerA, specialist, coordinator, driver1, driver2, escort1, custA, custB] = await Promise.all([
      login('admin.qa@test.local'),
      login('manager.a@test.local'),
      login('specialist.qa@test.local'),
      login('coordinator.qa@test.local'),
      login('driver1.qa@test.local'),
      login('driver2.qa@test.local'),
      login('escort1.qa@test.local'),
      login('cust.a@test.local'),
      login('cust.b@test.local'),
    ]);
    tokens = { admin, managerA, specialist, coordinator, driver1, driver2, escort1, custA, custB };
  });

  after(async () => {
    for (const url of createdUploadUrls) cleanupTrackedUrl(url);
    if (db) await db.end();
    await stopTestServer(server);
    await dropTestDatabase();
  });

  async function createHorse(custToken, label) {
    const tag = nextTag('SH');
    const res = await api('/horses', {
      method: 'POST',
      token: custToken,
      body: JSON.stringify({
        name: `QA-${label}-${tag}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985S${tag}`,
        passportNo: `FEI-S-${tag}`,
        status: 'active',
      }),
    });
    assert.equal(res.status, 201, `createHorse failed: ${res.status}`);
    return Number(res.body.id);
  }

  async function createOrderAndConfirmRoad({
    custToken,
    horseId,
    horseName,
    originLocation = 'Củ Chi, TP.HCM, Vietnam',
    destinationLocation = 'Đà Nẵng, Vietnam',
    bookingType = 'shared_stall',
    roadTripId = undefined,
    vehicleId = undefined,
    tStart = futureIso(25, 0),
    tEnd = futureIso(25, 6),
    extraStops = [],
    label = 'SEC',
  }) {
    const ordRes = await api('/orders', {
      method: 'POST',
      token: custToken,
      body: JSON.stringify({
        bookingType,
        contactName: `QA ${label}`,
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: custToken === tokens.custB ? 'cust.b@test.local' : 'cust.a@test.local',
        requestedHorseCount: 1,
        originLocation,
        destinationLocation,
        requestedDate: futureIso(25, 0),
        transportationType: 'Domestic',
        horses: [{ horseId, name: horseName, declaredValue: 50_000_000, insurancePackage: 'basic' }],
      }),
    });
    assert.equal(ordRes.status, 201, `createOrder failed: ${ordRes.status} ${JSON.stringify(ordRes.body)}`);
    const ordId = Number(ordRes.body.id);

    const appRes = await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify(
        bookingType === 'dedicated_charter'
          ? { bookingType, quotedHorseCount: 1, transportCost: 5_000_000, transportMode: 'road' }
          : { bookingType, quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' },
      ),
    });
    assert.equal(appRes.status, 200);

    await api(`/routes/plan/${ordId}/strategic-framework`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id,
        managerVehicleType: 'Truck',
      }),
    });

    const legPayload = {
      sequenceNo: 1,
      legType: 'road',
      originLocation,
      destinationLocation,
      plannedDeparture: tStart,
      plannedArrival: tEnd,
      ...(roadTripId ? { roadTripId } : { vehicleId }),
    };
    const stopsPayload = extraStops.length > 0
      ? extraStops
      : [
          {
            sequenceNo: 1,
            legSequenceNo: 1,
            stopType: 'rest',
            locationName: `Rest ${label}`,
            country: 'Vietnam',
            plannedArrival: tEnd,
            plannedDeparture: tEnd,
          },
        ];

    const bdRes = await api(`/routes/plan/${ordId}/build-detail`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        routeName: `Route-${label}-${ordId}`,
        totalDistanceKm: 800,
        legs: [legPayload],
        stops: stopsPayload,
      }),
    });
    assert.equal(bdRes.status, 201, `build-detail failed: ${bdRes.status} ${JSON.stringify(bdRes.body)}`);
    const legId = Number(bdRes.body.legs[0].id);
    const stopId = Number(bdRes.body.stops?.[0]?.id ?? 0);

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

    return { ordId, legId, stopId };
  }

  test('Tầng 4 IDOR: Customer B blocked (403/404) on EVERY :id endpoint belonging to Customer A', async () => {
    const hA = await createHorse(tokens.custA, 'IDOR_A');
    const { ordId: ordA } = await createOrderAndConfirmRoad({
      custToken: tokens.custA,
      horseId: hA,
      horseName: 'IDOR Horse A',
      vehicleId: seed.vehicles.trk4a,
      tStart: futureIso(26, 0),
      tEnd: futureIso(26, 6),
      label: 'IDOR_A',
    });

    await api(`/orders/${ordA}/payments/sepay`, { method: 'POST', token: tokens.custA });
    await api(`/orders/${ordA}/payments/momo`, { method: 'POST', token: tokens.custA });

    const docFd = new FormData();
    docFd.append('horseId', String(hA));
    docFd.append('regulationId', String(seed.regs.vnPassport));
    docFd.append('docType', 'horse_passport');
    docFd.append('docNumber', 'QA-IDOR-DOC');
    docFd.append('file', new Blob([makePdfBuffer()], { type: 'application/pdf' }), 'idor.pdf');
    const upDocRes = await api('/documents/upload', { method: 'POST', token: tokens.custA, body: docFd });
    assert.equal(upDocRes.status, 201);
    const docA = Number(upDocRes.body.id);
    if (upDocRes.body?.fileUrl) createdUploadUrls.push(upDocRes.body.fileUrl);

    const disbFd = new FormData();
    disbFd.append('authorityName', 'Cục Thú y QA');
    disbFd.append('feeType', 'quarantine_fee');
    disbFd.append('amount', '250000');
    disbFd.append('receipt', new Blob([makePdfBuffer()], { type: 'application/pdf' }), 'disb_receipt.pdf');
    const disbRes = await api(`/orders/${ordA}/disbursements`, { method: 'POST', token: tokens.managerA, body: disbFd });
    assert.equal(disbRes.status, 201);
    const disbId = Number(disbRes.body.id);
    if (disbRes.body?.authorityReceiptUrl) {
      createdUploadUrls.push(disbRes.body.authorityReceiptUrl);
      if (!String(disbRes.body.authorityReceiptUrl).startsWith('/uploads/')) {
        createdUploadUrls.push(`/uploads/disbursements/${path.basename(disbRes.body.authorityReceiptUrl)}`);
      }
    }
    const [disbRows] = await db.execute('SELECT authority_receipt_url FROM shipment_disbursement WHERE disbursement_id = ?', [disbId]);
    if (disbRows[0]?.authority_receipt_url) createdUploadUrls.push(disbRows[0].authority_receipt_url);

    const hlFd = new FormData();
    hlFd.append('files', new Blob([makePngBuffer()], { type: 'image/png' }), 'idor_vital.png');
    const hlUp = await api(`/tracking/shipments/${ordA}/health-logs/upload`, { method: 'POST', token: tokens.driver1, body: hlFd });
    assert.equal(hlUp.status, 201);
    const healthPhotoUrl = hlUp.body.files[0];
    createdUploadUrls.push(healthPhotoUrl);
    const healthPhotoFilename = path.basename(healthPhotoUrl);

    const hlCreate = await api(`/tracking/shipments/${ordA}/health-logs`, {
      method: 'POST',
      token: tokens.driver1,
      body: JSON.stringify({
        horseId: hA,
        horseName: 'IDOR Horse A',
        conditionStatus: 'stable',
        temperatureC: 38.0,
        heartRateBpm: 36,
        attachments: [healthPhotoUrl],
      }),
    });
    assert.equal(hlCreate.status, 201);

    const idorChecks = [
      ['GET /orders/:id', `/orders/${ordA}`, { method: 'GET' }],
      [
        'PUT /orders/:id',
        `/orders/${ordA}`,
        {
          method: 'PUT',
          body: JSON.stringify({ originLocation: 'Hack', destinationLocation: 'Hack', requestedHorseCount: 1 }),
        },
      ],
      ['PATCH /orders/:id/cancel', `/orders/${ordA}/cancel`, { method: 'PATCH', body: JSON.stringify({}) }],
      ['GET /orders/:id/payments/sepay', `/orders/${ordA}/payments/sepay`, { method: 'GET' }],
      ['POST /orders/:id/payments/sepay', `/orders/${ordA}/payments/sepay`, { method: 'POST' }],
      ['GET /orders/:id/payments/momo', `/orders/${ordA}/payments/momo`, { method: 'GET' }],
      ['POST /orders/:id/payments/momo', `/orders/${ordA}/payments/momo`, { method: 'POST' }],
      ['GET /orders/:id/disbursements', `/orders/${ordA}/disbursements`, { method: 'GET' }],
      ['GET /orders/:id/refunds', `/orders/${ordA}/refunds`, { method: 'GET' }],
      ['GET /orders/disbursements/:disbId/receipt', `/orders/disbursements/${disbId}/receipt`, { method: 'GET' }],
      ['GET /horses/:id', `/horses/${hA}`, { method: 'GET' }],
      ['PUT /horses/:id', `/horses/${hA}`, { method: 'PUT', body: JSON.stringify({ name: 'StolenHorse' }) }],
      ['DELETE /horses/:id', `/horses/${hA}`, { method: 'DELETE' }],
      ['GET /documents/:id/file', `/documents/${docA}/file`, { method: 'GET' }],
      ['POST /documents/:id/re-upload', `/documents/${docA}/re-upload`, { method: 'POST', body: JSON.stringify({}) }],
      ['GET /documents/order/:orderId/checklist', `/documents/order/${ordA}/checklist`, { method: 'GET' }],
      ['GET /routes/shipment/:id', `/routes/shipment/${ordA}`, { method: 'GET' }],
      ['GET /routes/shipment/:id/optional', `/routes/shipment/${ordA}/optional`, { method: 'GET' }],
      ['GET /routes/shipment/:id/plan', `/routes/shipment/${ordA}/plan`, { method: 'GET' }],
      ['GET /routes/plan/:id/readiness', `/routes/plan/${ordA}/readiness`, { method: 'GET' }],
      ['GET /fleet/shipments/:id/assignments', `/fleet/shipments/${ordA}/assignments`, { method: 'GET' }],
      ['GET /tracking/shipments/:id', `/tracking/shipments/${ordA}`, { method: 'GET' }],
      ['GET /tracking/horses/:id/health-logs', `/tracking/horses/${hA}/health-logs`, { method: 'GET' }],
      ['GET /tracking/shipments/:id/handovers', `/tracking/shipments/${ordA}/handovers`, { method: 'GET' }],
      ['GET /tracking/health-logs/attachments/:file', `/tracking/health-logs/attachments/${healthPhotoFilename}`, { method: 'GET' }],
    ];

    for (const [label, endpoint, opts] of idorChecks) {
      const res = await api(endpoint, { ...opts, token: tokens.custB });
      assert.ok(
        [403, 404].includes(res.status),
        `IDOR leaked on ${label} for Customer B! Expected 403/404, got ${res.status}`,
      );
    }
  });

  test('AC-F3-03: Shared-trip isolation hides other customer\'s roadTripId, transfer_hub, horse & identity across route, tracking & notifications', async () => {
    const rtDep = futureIso(32, 0);
    const rtArr = futureIso(32, 8);
    const rtRes = await api('/fleet/road-trips', {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        vehicleId: seed.vehicles.trk4b,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Huế, Thừa Thiên Huế, Vietnam',
        plannedDeparture: rtDep,
        plannedArrival: rtArr,
        bookingType: 'shared_stall',
      }),
    });
    assert.equal(rtRes.status, 201);
    const roadTripId = Number(rtRes.body.id);

    const hA = await createHorse(tokens.custA, 'ISO_A');
    const hB = await createHorse(tokens.custB, 'ISO_B');
    // Update Shadow B horse name explicitly to canonical 'Shadow QA' checkable string
    await db.execute("UPDATE horse SET name = 'Shadow QA B-Unique' WHERE horse_id = ?", [hB]);

    const sharedCorridorStops = [
      {
        sequenceNo: 1,
        legSequenceNo: 1,
        stopType: 'rest',
        locationName: 'Nha Trang Corridor Rest',
        country: 'Vietnam',
        plannedArrival: futureIso(32, 4),
        plannedDeparture: futureIso(32, 5),
      },
    ];

    const { ordId: ordA } = await createOrderAndConfirmRoad({
      custToken: tokens.custA,
      horseId: hA,
      horseName: 'Thunder QA A-Unique',
      originLocation: 'Củ Chi, TP.HCM, Vietnam',
      destinationLocation: 'Đà Nẵng, Vietnam',
      bookingType: 'shared_stall',
      roadTripId,
      tStart: rtDep,
      tEnd: rtArr,
      extraStops: sharedCorridorStops,
      label: 'ISO_A',
    });

    const { ordId: ordB } = await createOrderAndConfirmRoad({
      custToken: tokens.custB,
      horseId: hB,
      horseName: 'Shadow QA B-Unique',
      originLocation: 'Biên Hòa, Đồng Nai, Vietnam',
      destinationLocation: 'Huế, Thừa Thiên Huế, Vietnam',
      bookingType: 'shared_stall',
      roadTripId,
      tStart: rtDep,
      tEnd: rtArr,
      extraStops: sharedCorridorStops,
      label: 'ISO_B',
    });

    const rawCoordRoute = await api(`/routes/shipment/${ordA}`, { token: tokens.coordinator });
    assert.equal(rawCoordRoute.status, 200);
    assert.ok(
      rawCoordRoute.body.stops.some((s) => s.stopType === 'transfer_hub' && String(s.locationName).includes('Biên Hòa')),
      `Raw coordinator view must contain Order B transfer_hub stop before testing redaction, got: ${JSON.stringify(rawCoordRoute.body.stops)}`,
    );

    const reqCodeB = `REQ-${String(ordB).padStart(3, '0')}`;
    const views = await Promise.all([
      ['GET /routes/shipment/:ordA', api(`/routes/shipment/${ordA}`, { token: tokens.custA })],
      ['GET /routes/shipment/:ordA/optional', api(`/routes/shipment/${ordA}/optional`, { token: tokens.custA })],
      ['GET /routes/shipment/:ordA/plan', api(`/routes/shipment/${ordA}/plan`, { token: tokens.custA })],
      ['GET /tracking/shipments/:ordA', api(`/tracking/shipments/${ordA}`, { token: tokens.custA })],
      ['GET /notifications (custA)', api('/notifications', { token: tokens.custA })],
    ].map(async ([label, p]) => [label, await p]));

    const forbiddenStrings = [
      'Shadow QA B-Unique',
      'Customer B QA',
      'cust.b@test.local',
      'Biên Hòa',
      'Huế',
      reqCodeB,
    ];

    for (const [label, res] of views) {
      assert.equal(res.status, 200, `${label} failed with ${res.status}`);
      const roadTripHits = collectObjectKeys(res.body, 'roadTripId').filter(
        (v) => v !== null && v !== undefined,
      );
      assert.equal(
        roadTripHits.length,
        0,
        `AC-F3-03 leak: ${label} exposed non-null "roadTripId": ${JSON.stringify(roadTripHits)}`,
      );
      const serialized = JSON.stringify(res.body);
      for (const secretStr of forbiddenStrings) {
        assert.ok(
          !serialized.includes(secretStr),
          `AC-F3-03 leak: ${label} exposed co-rider token "${secretStr}"`,
        );
      }
    }
  });

  test('Tầng 4 Authorization: Unassigned Driver (driver2) blocked with 403 on all trip tracking & incident endpoints', async () => {
    const hId = await createHorse(tokens.custA, 'UNASS_D');
    const { ordId, legId, stopId } = await createOrderAndConfirmRoad({
      custToken: tokens.custA,
      horseId: hId,
      horseName: 'Unassigned Check',
      vehicleId: seed.vehicles.trk4b,
      tStart: futureIso(40, 0),
      tEnd: futureIso(40, 6),
      label: 'UNASS',
    });

    await db.execute("UPDATE shipment SET status = 'in_transit' WHERE shipment_id = ?", [ordId]);
    await db.execute("UPDATE route SET plan_status = 'in_transit' WHERE shipment_id = ?", [ordId]);

    const unassignedCalls = [
      ['GET /tracking/shipments/:id', `/tracking/shipments/${ordId}`, { method: 'GET' }],
      ['POST leg start', `/tracking/shipments/${ordId}/legs/${legId}/start`, { method: 'POST', body: JSON.stringify({}) }],
      ['POST stop status', `/tracking/shipments/${ordId}/stops/${stopId}/status`, { method: 'POST', body: JSON.stringify({ action: 'arrived' }) }],
      ['POST health log', `/tracking/shipments/${ordId}/health-logs`, { method: 'POST', body: JSON.stringify({ horseId: hId, horseName: 'Unassigned Check', conditionStatus: 'stable' }) }],
      ['POST incident', `/routes/shipment/${ordId}/incident`, { method: 'POST', body: JSON.stringify({ incidentType: 'traffic_delay', description: 'Unassigned probe' }) }],
      ['POST complete', `/tracking/shipments/${ordId}/complete`, { method: 'POST', body: JSON.stringify({}) }],
    ];

    for (const [label, endpoint, opts] of unassignedCalls) {
      const res = await api(endpoint, { ...opts, token: tokens.driver2 });
      assert.equal(res.status, 403, `Unassigned driver2 ${label} expected 403, got ${res.status}`);
    }
  });

  test('Tầng 4 RBAC Matrix: 5 roles × RACI-protected endpoints return 403 for unauthorized roles', async () => {
    const hDummy = await createHorse(tokens.custA, 'RBAC_H');
    const ordDummy = await api('/orders', {
      method: 'POST',
      token: tokens.custA,
      body: JSON.stringify({
        bookingType: 'shared_stall',
        contactName: 'QA RBAC',
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: 1,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: futureIso(25, 0),
        transportationType: 'Domestic',
        horses: [{ horseId: hDummy, name: 'RBAC Horse', declaredValue: 50_000_000, insurancePackage: 'basic' }],
      }),
    });
    assert.equal(ordDummy.status, 201);
    const sid = Number(ordDummy.body.id);

    const matrix = [
      // Manager-only
      { endpoint: `/orders/${sid}/approve`, method: 'PATCH', body: {}, denied: ['custA', 'specialist', 'coordinator', 'driver1'] },
      { endpoint: `/orders/${sid}/operational-cancel`, method: 'POST', body: { category: 'company_fault', reason: 'RBAC' }, denied: ['custA', 'specialist', 'coordinator', 'driver1'] },
      { endpoint: '/reports/performance', method: 'GET', denied: ['custA', 'specialist', 'coordinator', 'driver1'] },
      { endpoint: `/reports/shipments/${sid}/excused-delay`, method: 'PATCH', body: { excusedDelay: true, reason: 'RBAC' }, denied: ['custA', 'specialist', 'coordinator', 'driver1'] },
      { endpoint: `/orders/${sid}/payment-grace`, method: 'POST', body: { reason: 'RBAC' }, denied: ['custA', 'specialist', 'coordinator', 'driver1'] },
      // Admin-only refund transfer
      { endpoint: '/orders/refunds/1/transfer', method: 'POST', body: { recipientBankAccount: '123', bankTransactionRef: 'REF' }, denied: ['custA', 'managerA', 'specialist', 'coordinator', 'driver1'] },
      // Specialist-only regulations & doc reviews
      { endpoint: '/documents/regulations', method: 'POST', body: { country: 'TestLand', documentType: 'horse_passport' }, denied: ['custA', 'managerA', 'coordinator', 'driver1'] },
      { endpoint: '/documents/1/review', method: 'PATCH', body: { status: 'approved' }, denied: ['custA', 'managerA', 'coordinator', 'driver1'] },
      { endpoint: '/documents/1/authority-approval', method: 'POST', body: { authorityName: 'AVS', status: 'approved' }, denied: ['custA', 'managerA', 'coordinator', 'driver1'] },
      // Coordinator/Manager planning
      { endpoint: `/routes/plan/${sid}/build-detail`, method: 'POST', body: { routeName: 'X', legs: [], stops: [] }, denied: ['custA', 'specialist', 'driver1'] },
      { endpoint: `/fleet/shipments/${sid}/assign-staff`, method: 'POST', body: { assignments: [] }, denied: ['custA', 'specialist', 'driver1'] },
      // Customer-only
      { endpoint: '/orders', method: 'POST', body: {}, denied: ['managerA', 'specialist', 'coordinator', 'driver1'] },
      { endpoint: '/orders/my-orders', method: 'GET', denied: ['managerA', 'specialist', 'coordinator', 'driver1'] },
    ];

    for (const row of matrix) {
      for (const roleKey of row.denied) {
        const res = await api(row.endpoint, {
          method: row.method,
          token: tokens[roleKey],
          ...(row.body ? { body: JSON.stringify(row.body) } : {}),
        });
        assert.equal(
          res.status,
          403,
          `RBAC failure: role=${roleKey} on ${row.method} ${row.endpoint} expected 403, got ${res.status}`,
        );
      }
    }
  });

  test('Tầng 4 JWT Security: Expired token, forged signature, mock token & inactive user all return 401', async () => {
    const expiredToken = jwt.sign(
      { sub: seed.users['cust.a@test.local'].id, email: 'cust.a@test.local', role: 'Customer' },
      'qa-test-jwt-secret-must-be-at-least-32-chars',
      { expiresIn: -60 },
    );
    const forgedToken = jwt.sign(
      { sub: seed.users['admin.qa@test.local'].id, email: 'admin.qa@test.local', role: 'Admin' },
      'wrong-secret-0000000000000000000000000',
      { expiresIn: 3600 },
    );
    const inactiveUserToken = jwt.sign(
      { sub: seed.users['inactive.qa@test.local'].id, email: 'inactive.qa@test.local', role: 'Customer' },
      'qa-test-jwt-secret-must-be-at-least-32-chars',
      { expiresIn: 3600 },
    );

    const [rExp, rForged, rMock, rInactiveJwt, rInactiveLogin] = await Promise.all([
      api('/auth/profile', { token: expiredToken }),
      api('/auth/profile', { token: forgedToken }),
      api('/auth/profile', { token: 'mock-token-123' }),
      api('/auth/profile', { token: inactiveUserToken }),
      api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'inactive.qa@test.local', password: 'Password123' }),
      }),
    ]);

    assert.equal(rExp.status, 401);
    assert.equal(rForged.status, 401);
    assert.equal(rMock.status, 401);
    assert.equal(rInactiveJwt.status, 401);
    assert.ok([401, 403].includes(rInactiveLogin.status), `Inactive login expected 401/403, got ${rInactiveLogin.status}`);
  });

  test('Tầng 4 Upload Hardening & Direct /uploads/ Access Block: Fake .exe-as-.pdf, spoofed MIME, oversized >10MB/>5MB & direct static download blocked', async () => {
    const hUp = await createHorse(tokens.custA, 'UPL_H');
    const { ordId: ordUp } = await createOrderAndConfirmRoad({
      custToken: tokens.custA,
      horseId: hUp,
      horseName: 'Upload Check Horse',
      vehicleId: seed.vehicles.trk4a,
      tStart: futureIso(42, 0),
      tEnd: futureIso(42, 6),
      label: 'UPL',
    });

    const uploadAttempt = async (buf, filename, mime) => {
      const fd = new FormData();
      fd.append('horseId', String(hUp));
      fd.append('regulationId', String(seed.regs.vnPassport));
      fd.append('docType', 'horse_passport');
      fd.append('file', new Blob([buf], { type: mime }), filename);
      return api('/documents/upload', { method: 'POST', token: tokens.custA, body: fd });
    };

    // 1. .exe MZ header masquerading as application/pdf
    const exeAsPdf = await uploadAttempt(Buffer.from('MZ\x90\x00\x03\x00\x00\x00This program cannot be run'), 'evil.pdf', 'application/pdf');
    assert.equal(exeAsPdf.status, 400);

    // 2. HTML/XSS script payload masquerading as application/pdf
    const xssAsPdf = await uploadAttempt(Buffer.from('<script>alert(1)</script>'), 'xss.pdf', 'application/pdf');
    assert.equal(xssAsPdf.status, 400);

    // 3. Oversized >10MB PDF -> 400 or 413
    const hugePdf = await uploadAttempt(makePdfBuffer(Buffer.alloc(10.5 * 1024 * 1024, 0x41)), 'huge.pdf', 'application/pdf');
    assert.ok([400, 413].includes(hugePdf.status), `>10MB PDF expected 400/413, got ${hugePdf.status}`);

    // 4. Oversized >5MB health photo -> 400 or 413
    const hugeImgFd = new FormData();
    hugeImgFd.append('files', new Blob([makePngBuffer(Buffer.alloc(5.5 * 1024 * 1024, 0x41))], { type: 'image/png' }), 'huge.png');
    const hugeImgRes = await api(`/tracking/shipments/${ordUp}/health-logs/upload`, {
      method: 'POST',
      token: tokens.driver1,
      body: hugeImgFd,
    });
    assert.ok([400, 413].includes(hugeImgRes.status), `>5MB PNG expected 400/413, got ${hugeImgRes.status}`);

    // 5. Valid uploads must NEVER be directly downloadable unauthenticated at /uploads/...
    const validDoc = await uploadAttempt(makePdfBuffer(), 'clean.pdf', 'application/pdf');
    assert.equal(validDoc.status, 201);
    createdUploadUrls.push(validDoc.body.fileUrl);

    const hlFd = new FormData();
    hlFd.append('files', new Blob([makePngBuffer()], { type: 'image/png' }), 'clean.png');
    const validHl = await api(`/tracking/shipments/${ordUp}/health-logs/upload`, {
      method: 'POST',
      token: tokens.driver1,
      body: hlFd,
    });
    assert.equal(validHl.status, 201);
    const hlFileUrl = validHl.body.files[0];
    createdUploadUrls.push(hlFileUrl);

    const directDocFetch = await fetch(`${SERVER_ORIGIN}${validDoc.body.fileUrl}`);
    assert.ok([401, 403, 404].includes(directDocFetch.status), `Direct doc fetch leaked HTTP ${directDocFetch.status}`);

    const directHlFetch = await fetch(`${SERVER_ORIGIN}/uploads/health-logs/${path.basename(hlFileUrl)}`);
    assert.ok([401, 403, 404].includes(directHlFetch.status), `Direct health photo fetch leaked HTTP ${directHlFetch.status}`);
  });

  test('Tầng 4 XSS & SQL Injection Resilience: Script payloads stored/escaped safely; SQLi in query filters never leaks data or causes 500', async () => {
    const tag = nextTag('XSS');
    const hRes = await api('/horses', {
      method: 'POST',
      token: tokens.custA,
      body: JSON.stringify({
        name: `<script>alert('xss')</script> Bolt ${tag}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 4,
        microchipNo: `985X${tag}`,
        passportNo: `FEI-X-${tag}`,
        status: 'active',
      }),
    });
    assert.ok([201, 400].includes(hRes.status), `Unexpected status on XSS horse name: ${hRes.status}`);

    if (hRes.status === 201) {
      const ordRes = await api('/orders', {
        method: 'POST',
        token: tokens.custA,
        body: JSON.stringify({
          bookingType: 'shared_stall',
          contactName: 'QA XSS Safe',
          contactAddress: 'TP.HCM',
          contactPhone: '0900000001',
          contactEmail: 'cust.a@test.local',
          requestedHorseCount: 1,
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          requestedDate: futureIso(25, 0),
          transportationType: 'Domestic',
          specialRequirements: '<img src=x onerror=alert(1)>',
          horses: [{ horseId: Number(hRes.body.id), name: `<script>alert('xss')</script> Bolt`, declaredValue: 50_000_000, insurancePackage: 'basic' }],
        }),
      });
      assert.ok([201, 400].includes(ordRes.status), `Unexpected status on XSS order notes: ${ordRes.status}`);
      if (ordRes.status === 201) {
        const getRes = await api(`/orders/${ordRes.body.id}`, { token: tokens.custA });
        assert.equal(getRes.status, 200);
        assert.match(String(getRes.headers.get('content-type') || ''), /application\/json/i);
        assert.equal(getRes.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(getRes.headers.get('x-frame-options'), 'DENY');
      }
    }

    const sqliPayloads = [
      "' OR '1'='1",
      "Vietnam' UNION SELECT 1,2,3,4,5,6,7,8,9,10-- -",
      "'; DROP TABLE shipment;--",
    ];

    for (const payload of sqliPayloads) {
      const q = encodeURIComponent(payload);
      const r1 = await api(`/documents/regulations?country=${q}`, { token: tokens.custB });
      const r2 = await api(`/orders?status=${q}`, { token: tokens.managerA });
      const r3 = await api(`/documents?status=${q}`, { token: tokens.custB });

      assert.ok(r1.status < 500, `SQLi caused 500 on regulations: ${r1.status}`);
      assert.ok(r2.status < 500, `SQLi caused 500 on orders: ${r2.status}`);
      assert.ok(r3.status < 500, `SQLi caused 500 on documents: ${r3.status}`);
      if (r3.status === 200 && Array.isArray(r3.body)) {
        const custAId = seed.users['cust.a@test.local'].id;
        assert.ok(
          r3.body.every((doc) => Number(doc.uploadedBy ?? doc.ownerId) !== custAId),
          'SQLi on /documents leaked Customer A records to Customer B!',
        );
      }
    }

    const [[alive]] = await db.execute('SELECT COUNT(*) AS cnt FROM shipment');
    assert.ok(Number(alive.cnt) >= 1, 'shipment table missing after SQLi payload!');
  });

  test('Tầng 4 Rate Limiting: Bursting /auth/forgot-password (>5) and /auth/login (>20) triggers 429 Too Many Requests', async () => {
    await stopTestServer(server);
    server = await startTestServer({ NODE_ENV: 'development' });

    const forgotStatuses = [];
    for (let i = 0; i < 7; i++) {
      const r = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'cust.a@test.local' }),
      });
      forgotStatuses.push(r.status);
    }
    assert.ok(
      forgotStatuses.includes(429),
      `Expected 429 on /auth/forgot-password burst (>5), got [${forgotStatuses.join(', ')}]`,
    );

    const loginStatuses = [];
    for (let i = 0; i < 22; i++) {
      const r = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'cust.a@test.local', password: 'WrongPassword!' }),
      });
      loginStatuses.push(r.status);
    }
    assert.ok(
      loginStatuses.includes(429),
      `Expected 429 on /auth/login burst (>20), got [${loginStatuses.join(', ')}]`,
    );
  });
});
