const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

let seqCounter = 0;
function nextTag(prefix) {
  seqCounter += 1;
  return `${prefix}${seqCounter}`;
}

function addHoursIso(baseMs, hours) {
  return new Date(baseMs + hours * 3_600_000).toISOString();
}

function baseFutureMs(days) {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000;
}

describe('QA Spec v3.1 Tier 3: Real Parallel Concurrency & Deadlock Prevention', () => {
  let seed;
  let server;
  let db;
  let tokens = {};

  before(async () => {
    seed = await resetTestDatabase();
    server = await startTestServer();
    db = await openTestDbConnection();

    const [admin, managerA, managerB, coordinator, driver1, escort1, custA, custB] = await Promise.all([
      login('admin.qa@test.local'),
      login('manager.a@test.local'),
      login('manager.b@test.local'),
      login('coordinator.qa@test.local'),
      login('driver1.qa@test.local'),
      login('escort1.qa@test.local'),
      login('cust.a@test.local'),
      login('cust.b@test.local'),
    ]);
    tokens = { admin, managerA, managerB, coordinator, driver1, escort1, custA, custB };
  });

  after(async () => {
    if (db) await db.end();
    await stopTestServer(server);
    await dropTestDatabase();
  });

  async function createHorse(customerToken, label) {
    const tag = nextTag('H');
    const res = await api('/horses', {
      method: 'POST',
      token: customerToken,
      body: JSON.stringify({
        name: `QA-${label}-${tag}`,
        breed: 'Thoroughbred',
        gender: 'male',
        age: 5,
        microchipNo: `985C${tag}`,
        passportNo: `FEI-C-${tag}`,
        status: 'active',
      }),
    });
    assert.equal(res.status, 201, `createHorse failed: ${res.status} ${JSON.stringify(res.body)}`);
    return Number(res.body.id);
  }

  async function createDomesticOrder(customerToken, { horseIds, bookingType = 'shared_stall', daysAhead = 25, label = 'CONC' }) {
    const res = await api('/orders', {
      method: 'POST',
      token: customerToken,
      body: JSON.stringify({
        bookingType,
        contactName: `QA ${label}`,
        contactAddress: 'TP.HCM',
        contactPhone: '0900000001',
        contactEmail: 'cust.a@test.local',
        requestedHorseCount: horseIds.length,
        originLocation: 'Củ Chi, TP.HCM, Vietnam',
        destinationLocation: 'Đà Nẵng, Vietnam',
        requestedDate: addHoursIso(baseFutureMs(daysAhead), 0),
        transportationType: 'Domestic',
        horses: horseIds.map((horseId, idx) => ({
          horseId,
          name: `QA-${label}-${horseId}-${idx + 1}`,
          declaredValue: 50_000_000,
          insurancePackage: 'basic',
        })),
      }),
    });
    assert.equal(res.status, 201, `createOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
    return Number(res.body.id);
  }

  async function createConfirmedRoadOrder({ bookingType = 'shared_stall', vehicleId, tStartIso, tEndIso, label }) {
    const hId = await createHorse(tokens.custA, label);
    const ordId = await createDomesticOrder(tokens.custA, { horseIds: [hId], bookingType, daysAhead: 25, label });
    const approvePayload = bookingType === 'dedicated_charter'
      ? { bookingType, quotedHorseCount: 1, transportCost: 5_000_000, transportMode: 'road' }
      : { bookingType, quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' };
    const appRes = await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify(approvePayload),
    });
    assert.equal(appRes.status, 200, `approve failed: ${appRes.status} ${JSON.stringify(appRes.body)}`);

    const sfRes = await api(`/routes/plan/${ordId}/strategic-framework`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({
        assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id,
        managerVehicleType: 'Specialized Horse Truck',
      }),
    });
    assert.ok(sfRes.ok, `strategic-framework failed: ${sfRes.status}`);

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
    assert.ok(conf2.ok);
    assert.equal(conf2.body.isFullyConfirmed, true);

    return { ordId, hId, legId, totalCost: Number(appRes.body.totalCost) };
  }

  test('AC-F1-02 & BR-F1-05: Approve vs Customer Cancel race (50 parallel iterations) — strictly 1 winner, 1 returns 409, zero corrupted states', async () => {
    for (let i = 0; i < 50; i++) {
      const horseId = await createHorse(tokens.custA, `ACRace${i}`);
      const ordId = await createDomesticOrder(tokens.custA, { horseIds: [horseId], daysAhead: 25, label: `ACRace${i}` });

      const [appRes, canRes] = await Promise.all([
        api(`/orders/${ordId}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({
            bookingType: 'shared_stall',
            quotedHorseCount: 1,
            stallUnitPrice: 2_000_000,
            transportMode: 'road',
          }),
        }),
        api(`/orders/${ordId}/cancel`, {
          method: 'PATCH',
          token: tokens.custA,
          body: JSON.stringify({}),
        }),
      ]);

      const sorted = [appRes.status, canRes.status].sort((a, b) => a - b);
      assert.deepEqual(sorted, [200, 409], `Iter ${i}: expected [200, 409], got [${appRes.status}, ${canRes.status}]`);

      const [[sRow]] = await db.execute('SELECT status, total_cost FROM shipment WHERE shipment_id = ?', [ordId]);
      const [[hRow]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [horseId]);
      if (sRow.status === 'cancelled') {
        assert.equal(hRow.status, 'active', `Iter ${i}: cancelled order left horse ${hRow.status}`);
        assert.equal(Number(sRow.total_cost || 0), 0, `Iter ${i}: cancelled order also got quote total_cost=${sRow.total_cost}`);
      } else {
        assert.equal(sRow.status, 'approved');
        assert.ok(Number(sRow.total_cost) > 0, `Iter ${i}: approved order missing total_cost`);
        assert.notEqual(hRow.status, 'active', `Iter ${i}: approved order left horse active`);
      }
    }
  });

  test('AC-F3-01 & BR-F3-01: Two shared_stall orders racing for last stall on 4-stall vehicle (50 parallel iterations) — zero overbooking', async () => {
    const vRes = await api('/fleet/vehicles', {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({ vehicleType: 'truck', plateOrCode: 'QA-CONC-V4', capacity: 4, status: 'available' }),
    });
    assert.equal(vRes.status, 201);
    const vehId = Number(vRes.body.id);
    const startBaseMs = baseFutureMs(28);

    for (let i = 0; i < 50; i++) {
      const depIso = addHoursIso(startBaseMs, i * 10);
      const arrIso = addHoursIso(startBaseMs, i * 10 + 4);

      const rtRes = await api('/fleet/road-trips', {
        method: 'POST',
        token: tokens.coordinator,
        body: JSON.stringify({
          vehicleId: vehId,
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          plannedDeparture: depIso,
          plannedArrival: arrIso,
          bookingType: 'shared_stall',
        }),
      });
      assert.equal(rtRes.status, 201, `Iter ${i}: road_trip create failed: ${rtRes.status} ${JSON.stringify(rtRes.body)}`);
      const roadTripId = Number(rtRes.body.id);

      const [h1, h2, h3, h4, h5] = await Promise.all([
        createHorse(tokens.custA, `S3A_${i}`),
        createHorse(tokens.custA, `S3B_${i}`),
        createHorse(tokens.custA, `S3C_${i}`),
        createHorse(tokens.custA, `S1A_${i}`),
        createHorse(tokens.custA, `S1B_${i}`),
      ]);

      const [ordSeed3, ordA, ordB] = await Promise.all([
        createDomesticOrder(tokens.custA, { horseIds: [h1, h2, h3], bookingType: 'shared_stall', daysAhead: 28, label: `S3_${i}` }),
        createDomesticOrder(tokens.custA, { horseIds: [h4], bookingType: 'shared_stall', daysAhead: 28, label: `S1A_${i}` }),
        createDomesticOrder(tokens.custA, { horseIds: [h5], bookingType: 'shared_stall', daysAhead: 28, label: `S1B_${i}` }),
      ]);

      await Promise.all([
        api(`/orders/${ordSeed3}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 3, stallUnitPrice: 2_000_000, transportMode: 'road' }),
        }).then((r) => assert.equal(r.status, 200)),
        api(`/orders/${ordA}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
        }).then((r) => assert.equal(r.status, 200)),
        api(`/orders/${ordB}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
        }).then((r) => assert.equal(r.status, 200)),
      ]);

      await Promise.all([
        api(`/routes/plan/${ordSeed3}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
        }),
        api(`/routes/plan/${ordA}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
        }),
        api(`/routes/plan/${ordB}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
        }),
      ]);

      const seedPlanRes = await api(`/routes/plan/${ordSeed3}/build-detail`, {
        method: 'POST',
        token: tokens.coordinator,
        body: JSON.stringify({
          routeName: `SharedSeed3-${i}`,
          totalDistanceKm: 850,
          legs: [{
            sequenceNo: 1,
            legType: 'road',
            originLocation: 'Củ Chi, TP.HCM, Vietnam',
            destinationLocation: 'Đà Nẵng, Vietnam',
            roadTripId,
            plannedDeparture: depIso,
            plannedArrival: arrIso,
          }],
          stops: [{
            sequenceNo: 1,
            legSequenceNo: 1,
            stopType: 'rest',
            locationName: 'Quy Nhơn Hub',
            country: 'Vietnam',
            plannedArrival: arrIso,
            plannedDeparture: arrIso,
          }],
        }),
      });
      assert.equal(seedPlanRes.status, 201, `Iter ${i}: seed3 build-detail failed: ${seedPlanRes.status} ${JSON.stringify(seedPlanRes.body)}`);

      const buildShared = (ordId) =>
        api(`/routes/plan/${ordId}/build-detail`, {
          method: 'POST',
          token: tokens.coordinator,
          body: JSON.stringify({
            routeName: `SharedRace-${ordId}`,
            totalDistanceKm: 850,
            legs: [{
              sequenceNo: 1,
              legType: 'road',
              originLocation: 'Củ Chi, TP.HCM, Vietnam',
              destinationLocation: 'Đà Nẵng, Vietnam',
              roadTripId,
              plannedDeparture: depIso,
              plannedArrival: arrIso,
            }],
            stops: [{
              sequenceNo: 1,
              legSequenceNo: 1,
              stopType: 'rest',
              locationName: 'Quy Nhơn Hub',
              country: 'Vietnam',
              plannedArrival: arrIso,
              plannedDeparture: arrIso,
            }],
          }),
        });

      const [resA, resB] = await Promise.all([buildShared(ordA), buildShared(ordB)]);
      const sorted = [resA.status, resB.status].sort((a, b) => a - b);
      assert.deepEqual(sorted, [201, 409], `Iter ${i}: expected [201, 409], got [${resA.status}, ${resB.status}]`);

      const [[sumRow]] = await db.execute(
        'SELECT COALESCE(SUM(stalls_booked), 0) AS total FROM route_leg WHERE road_trip_id = ?',
        [roadTripId],
      );
      assert.equal(Number(sumRow.total), 4, `Iter ${i}: overbooking detected! total stalls_booked=${sumRow.total}`);
    }
  });

  test('BR-F3-02: Two dedicated_charter orders overlapping in time on same vehicle (50 parallel iterations) — strictly 1 winner, 1 returns 409', async () => {
    const vRes = await api('/fleet/vehicles', {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({ vehicleType: 'truck', plateOrCode: 'QA-CONC-CH', capacity: 4, status: 'available' }),
    });
    assert.equal(vRes.status, 201);
    const vehId = Number(vRes.body.id);
    const startBaseMs = baseFutureMs(55);

    for (let i = 0; i < 50; i++) {
      const tStart = addHoursIso(startBaseMs, i * 10);
      const tEnd = addHoursIso(startBaseMs, i * 10 + 4);
      const tOverlapStart = addHoursIso(startBaseMs, i * 10 + 1);
      const tOverlapEnd = addHoursIso(startBaseMs, i * 10 + 5);

      const [h1, h2] = await Promise.all([
        createHorse(tokens.custA, `CH1_${i}`),
        createHorse(tokens.custA, `CH2_${i}`),
      ]);
      const [ord1, ord2] = await Promise.all([
        createDomesticOrder(tokens.custA, { horseIds: [h1], bookingType: 'dedicated_charter', daysAhead: 55, label: `CH1_${i}` }),
        createDomesticOrder(tokens.custA, { horseIds: [h2], bookingType: 'dedicated_charter', daysAhead: 55, label: `CH2_${i}` }),
      ]);

      await Promise.all([
        api(`/orders/${ord1}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'dedicated_charter', quotedHorseCount: 1, transportCost: 5_000_000, transportMode: 'road' }),
        }).then((r) => assert.equal(r.status, 200)),
        api(`/orders/${ord2}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'dedicated_charter', quotedHorseCount: 1, transportCost: 5_000_000, transportMode: 'road' }),
        }).then((r) => assert.equal(r.status, 200)),
      ]);

      await Promise.all([
        api(`/routes/plan/${ord1}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Charter Truck' }),
        }),
        api(`/routes/plan/${ord2}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Charter Truck' }),
        }),
      ]);

      const buildCharter = (ordId, depIso, arrIso) =>
        api(`/routes/plan/${ordId}/build-detail`, {
          method: 'POST',
          token: tokens.coordinator,
          body: JSON.stringify({
            routeName: `CharterRace-${ordId}`,
            totalDistanceKm: 850,
            legs: [{
              sequenceNo: 1,
              legType: 'road',
              originLocation: 'Củ Chi, TP.HCM, Vietnam',
              destinationLocation: 'Đà Nẵng, Vietnam',
              vehicleId: vehId,
              plannedDeparture: depIso,
              plannedArrival: arrIso,
            }],
            stops: [{
              sequenceNo: 1,
              legSequenceNo: 1,
              stopType: 'rest',
              locationName: 'Nha Trang Rest',
              country: 'Vietnam',
              plannedArrival: arrIso,
              plannedDeparture: arrIso,
            }],
          }),
        });

      const [res1, res2] = await Promise.all([
        buildCharter(ord1, tStart, tEnd),
        buildCharter(ord2, tOverlapStart, tOverlapEnd),
      ]);
      const sorted = [res1.status, res2.status].sort((a, b) => a - b);
      assert.deepEqual(sorted, [201, 409], `Iter ${i}: expected [201, 409], got [${res1.status}, ${res2.status}]`);

      const [[cntRow]] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM route_leg
         WHERE vehicle_id = ? AND planned_departure < ? AND planned_arrival > ?`,
        [vehId, new Date(tOverlapEnd), new Date(tStart)],
      );
      assert.equal(Number(cntRow.cnt), 1, `Iter ${i}: overlapping dedicated charter count expected 1, got ${cntRow.cnt}`);
    }
  });

  test('AC-F3-02 & BR-F3-05: Concurrent final driver/escort confirmations & parallel retries — strictly 1 shipment_invoice created', async () => {
    const hId = await createHorse(tokens.custA, 'INV_RACE');
    const ordId = await createDomesticOrder(tokens.custA, { horseIds: [hId], bookingType: 'shared_stall', daysAhead: 25, label: 'INV_RACE' });
    await api(`/orders/${ordId}/approve`, {
      method: 'PATCH',
      token: tokens.managerA,
      body: JSON.stringify({ bookingType: 'shared_stall', quotedHorseCount: 1, stallUnitPrice: 2_000_000, transportMode: 'road' }),
    });
    await api(`/routes/plan/${ordId}/strategic-framework`, {
      method: 'POST',
      token: tokens.managerA,
      body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
    });
    const t0 = addHoursIso(baseFutureMs(85), 0);
    const t1 = addHoursIso(baseFutureMs(85), 6);
    const bdRes = await api(`/routes/plan/${ordId}/build-detail`, {
      method: 'POST',
      token: tokens.coordinator,
      body: JSON.stringify({
        routeName: 'InvRace Route',
        totalDistanceKm: 850,
        legs: [{
          sequenceNo: 1,
          legType: 'road',
          originLocation: 'Củ Chi, TP.HCM, Vietnam',
          destinationLocation: 'Đà Nẵng, Vietnam',
          vehicleId: seed.vehicles.trk4a,
          plannedDeparture: t0,
          plannedArrival: t1,
        }],
        stops: [{
          sequenceNo: 1,
          legSequenceNo: 1,
          stopType: 'rest',
          locationName: 'Stop Inv',
          country: 'Vietnam',
          plannedArrival: t1,
          plannedDeparture: t1,
        }],
      }),
    });
    assert.equal(bdRes.status, 201);
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

    const raceCalls = [
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.driver1, body: JSON.stringify({}) }),
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.driver1, body: JSON.stringify({}) }),
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.driver1, body: JSON.stringify({}) }),
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.escort1, body: JSON.stringify({}) }),
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.escort1, body: JSON.stringify({}) }),
      api(`/routes/plan/${ordId}/driver-confirm`, { method: 'POST', token: tokens.escort1, body: JSON.stringify({}) }),
    ];
    const results = await Promise.all(raceCalls);
    for (const r of results) {
      assert.notEqual(r.status, 500, `Unexpected 500 on concurrent driver-confirm: ${JSON.stringify(r.body)}`);
      assert.ok([200, 201].includes(r.status), `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    }

    const [[invRow]] = await db.execute(
      `SELECT COUNT(*) AS cnt FROM shipment_invoice
       WHERE shipment_id = ? AND COALESCE(invoice_type, 'primary') = 'primary' AND COALESCE(status, 'active') <> 'void'`,
      [ordId],
    );
    assert.equal(Number(invRow.cnt), 1, `Expected strictly 1 active primary invoice, got ${invRow.cnt}`);

    const payGate = await api(`/orders/${ordId}/payments/sepay`, { token: tokens.custA });
    assert.equal(payGate.status, 200);
    assert.equal(payGate.body.paymentUnlocked, true);
  });

  test('Tầng 3 & Gate 2 SePay Webhook Idempotency: 5 simultaneous identical SePay webhooks — strictly 1 receipt and 1 payment notification', async () => {
    const { ordId, totalCost } = await createConfirmedRoadOrder({
      vehicleId: seed.vehicles.trk4a,
      tStartIso: addHoursIso(baseFutureMs(90), 0),
      tEndIso: addHoursIso(baseFutureMs(90), 6),
      label: 'SEPAY5X',
    });

    const qrRes = await api(`/orders/${ordId}/payments/sepay`, { method: 'POST', token: tokens.custA });
    assert.equal(qrRes.status, 200);
    const payCode = qrRes.body.paymentCode;

    const payload = {
      id: 777001,
      gateway: 'MB',
      accountNumber: SEPAY_ACCOUNT_NUMBER,
      transferType: 'in',
      transferAmount: totalCost,
      content: payCode,
    };

    const responses = await Promise.all(Array.from({ length: 5 }, () => sendSepayWebhook(payload)));
    for (const r of responses) {
      assert.equal(r.status, 200, `Expected 200 on parallel SePay webhook, got ${r.status}`);
    }

    const [[rcpt]] = await db.execute('SELECT COUNT(*) AS cnt FROM sepay_webhook_receipt WHERE transaction_id = ?', [777001]);
    assert.equal(Number(rcpt.cnt), 1);

    const [[payRow]] = await db.execute('SELECT status FROM shipment_sepay_payment WHERE payment_code = ?', [payCode]);
    assert.equal(payRow.status, 'succeeded');

    const [[notifRow]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND title = 'Đã nhận thanh toán'",
      [ordId],
    );
    assert.equal(Number(notifRow.cnt), 1);
  });

  test('BR-F4-04: 5 simultaneous completeShipment calls — idempotent completion, zero duplicate notifications', async () => {
    const { ordId, legId } = await createConfirmedRoadOrder({
      vehicleId: seed.vehicles.trk4a,
      tStartIso: addHoursIso(baseFutureMs(95), 0),
      tEndIso: addHoursIso(baseFutureMs(95), 6),
      label: 'COMP5X',
    });

    await db.execute("UPDATE shipment SET status = 'in_transit' WHERE shipment_id = ?", [ordId]);
    await db.execute("UPDATE route SET plan_status = 'in_transit' WHERE shipment_id = ?", [ordId]);
    await db.execute("UPDATE route_leg SET status = 'completed' WHERE leg_id = ?", [legId]);

    const [[beforeRow]] = await db.execute(
      'SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ?',
      [ordId, seed.users['cust.a@test.local'].id],
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(`/tracking/shipments/${ordId}/complete`, { method: 'POST', token: tokens.managerA, body: JSON.stringify({}) }),
      ),
    );
    for (const r of results) {
      assert.notEqual(r.status, 500, `Unexpected 500 on concurrent complete: ${JSON.stringify(r.body)}`);
    }
    assert.ok(results.some((r) => [200, 201].includes(r.status)));

    const [[sRow]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [ordId]);
    assert.equal(sRow.status, 'completed');

    const [[afterRow]] = await db.execute(
      'SELECT COUNT(*) AS cnt FROM notification WHERE shipment_id = ? AND user_id = ?',
      [ordId, seed.users['cust.a@test.local'].id],
    );
    assert.ok(Number(afterRow.cnt) - Number(beforeRow.cnt) <= 1, 'Duplicate completion notifications created');
  });

  test('AC-F3-05 & BR-F3-07: Two Managers clicking grant payment grace simultaneously — strictly 1 succeeds, 1 gets 409', async () => {
    const { ordId } = await createConfirmedRoadOrder({
      vehicleId: seed.vehicles.trk4a,
      tStartIso: addHoursIso(baseFutureMs(100), 0),
      tEndIso: addHoursIso(baseFutureMs(100), 6),
      label: 'GRACE2M',
    });

    await db.execute(
      `UPDATE shipment
       SET departure_date = DATE_ADD(NOW(), INTERVAL 28 HOUR),
           requested_date = DATE_ADD(NOW(), INTERVAL 28 HOUR),
           payment_overdue = TRUE
       WHERE shipment_id = ?`,
      [ordId],
    );
    await db.execute(
      `UPDATE shipment_invoice
       SET payment_due_at = DATE_SUB(NOW(), INTERVAL 2 HOUR),
           status = 'overdue'
       WHERE shipment_id = ?`,
      [ordId],
    );

    const [resA, resB] = await Promise.all([
      api(`/orders/${ordId}/payment-grace`, {
        method: 'POST',
        token: tokens.managerA,
        body: JSON.stringify({ reason: 'Grace clicked by Manager A' }),
      }),
      api(`/orders/${ordId}/payment-grace`, {
        method: 'POST',
        token: tokens.managerB,
        body: JSON.stringify({ reason: 'Grace clicked by Manager B' }),
      }),
    ]);

    const okCount = [resA, resB].filter((r) => [200, 201].includes(r.status)).length;
    const conflictCount = [resA, resB].filter((r) => r.status === 409).length;
    assert.equal(okCount, 1, `Expected 1 grace winner, got [${resA.status}, ${resB.status}]`);
    assert.equal(conflictCount, 1, `Expected 1 grace 409 loser, got [${resA.status}, ${resB.status}]`);

    const [[invRow]] = await db.execute(
      'SELECT grace_count, grace_due_at FROM shipment_invoice WHERE shipment_id = ? ORDER BY invoice_id DESC LIMIT 1',
      [ordId],
    );
    assert.equal(Number(invRow.grace_count), 1);
    assert.ok(invRow.grace_due_at !== null);

    const [[capRow]] = await db.execute(
      `SELECT TIMESTAMPDIFF(SECOND, i.grace_due_at, DATE_SUB(s.departure_date, INTERVAL 24 HOUR)) AS diff_sec
       FROM shipment_invoice i
       JOIN shipment s ON s.shipment_id = i.shipment_id
       WHERE i.shipment_id = ?
       ORDER BY i.invoice_id DESC LIMIT 1`,
      [ordId],
    );
    assert.ok(Number(capRow.diff_sec) >= -2, `grace_due_at breached T-24h cap! diff_sec=${capRow.diff_sec}`);
  });

  test('BR-F3-01 Deadlock Prevention: 30 parallel pairs of multi-leg road bookings locking [vehA, vehB] vs [vehB, vehA] — zero MySQL deadlocks or HTTP 500', async () => {
    const [vaRes, vbRes] = await Promise.all([
      api('/fleet/vehicles', {
        method: 'POST',
        token: tokens.coordinator,
        body: JSON.stringify({ vehicleType: 'truck', plateOrCode: 'QA-DL-VA', capacity: 4, status: 'available' }),
      }),
      api('/fleet/vehicles', {
        method: 'POST',
        token: tokens.coordinator,
        body: JSON.stringify({ vehicleType: 'truck', plateOrCode: 'QA-DL-VB', capacity: 4, status: 'available' }),
      }),
    ]);
    assert.equal(vaRes.status, 201);
    assert.equal(vbRes.status, 201);
    const vehA = Number(vaRes.body.id);
    const vehB = Number(vbRes.body.id);
    const startBaseMs = baseFutureMs(110);

    for (let i = 0; i < 30; i++) {
      const t0 = addHoursIso(startBaseMs, i * 10);
      const t1 = addHoursIso(startBaseMs, i * 10 + 2);
      const t2 = addHoursIso(startBaseMs, i * 10 + 4);
      const tMid = addHoursIso(startBaseMs, i * 10 + 3);
      const tEnd = addHoursIso(startBaseMs, i * 10 + 5);

      const [hA, hB] = await Promise.all([
        createHorse(tokens.custA, `DLA_${i}`),
        createHorse(tokens.custA, `DLB_${i}`),
      ]);
      const [ordAB, ordBA] = await Promise.all([
        createDomesticOrder(tokens.custA, { horseIds: [hA], bookingType: 'dedicated_charter', daysAhead: 110, label: `DLAB_${i}` }),
        createDomesticOrder(tokens.custA, { horseIds: [hB], bookingType: 'dedicated_charter', daysAhead: 110, label: `DLBA_${i}` }),
      ]);

      await Promise.all([
        api(`/orders/${ordAB}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'dedicated_charter', quotedHorseCount: 1, transportCost: 6_000_000, transportMode: 'road' }),
        }),
        api(`/orders/${ordBA}/approve`, {
          method: 'PATCH',
          token: tokens.managerA,
          body: JSON.stringify({ bookingType: 'dedicated_charter', quotedHorseCount: 1, transportCost: 6_000_000, transportMode: 'road' }),
        }),
      ]);

      await Promise.all([
        api(`/routes/plan/${ordAB}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
        }),
        api(`/routes/plan/${ordBA}/strategic-framework`, {
          method: 'POST',
          token: tokens.managerA,
          body: JSON.stringify({ assignedCoordinatorId: seed.users['coordinator.qa@test.local'].id, managerVehicleType: 'Truck' }),
        }),
      ]);

      const buildTwoLeg = (ordId, firstVeh, secondVeh, startIso, midIso, endIso) =>
        api(`/routes/plan/${ordId}/build-detail`, {
          method: 'POST',
          token: tokens.coordinator,
          body: JSON.stringify({
            routeName: `DeadlockTest-${ordId}`,
            totalDistanceKm: 500,
            legs: [
              {
                sequenceNo: 1,
                legType: 'road',
                originLocation: 'Củ Chi, TP.HCM, Vietnam',
                destinationLocation: 'Nha Trang',
                vehicleId: firstVeh,
                plannedDeparture: startIso,
                plannedArrival: midIso,
              },
              {
                sequenceNo: 2,
                legType: 'road',
                originLocation: 'Nha Trang',
                destinationLocation: 'Đà Nẵng, Vietnam',
                vehicleId: secondVeh,
                plannedDeparture: midIso,
                plannedArrival: endIso,
              },
            ],
            stops: [
              {
                sequenceNo: 1,
                legSequenceNo: 1,
                stopType: 'rest',
                locationName: 'Nha Trang Rest',
                country: 'Vietnam',
                plannedArrival: midIso,
                plannedDeparture: midIso,
              },
            ],
          }),
        });

      const [resAB, resBA] = await Promise.all([
        buildTwoLeg(ordAB, vehA, vehB, t0, t1, t2),
        buildTwoLeg(ordBA, vehB, vehA, t0, tMid, tEnd),
      ]);

      assert.notEqual(resAB.status, 500, `Iter ${i}: ordAB returned 500 (possible deadlock): ${JSON.stringify(resAB.body)}`);
      assert.notEqual(resBA.status, 500, `Iter ${i}: ordBA returned 500 (possible deadlock): ${JSON.stringify(resBA.body)}`);
      const sorted = [resAB.status, resBA.status].sort((a, b) => a - b);
      assert.deepEqual(sorted, [201, 409], `Iter ${i}: expected [201, 409], got [${resAB.status}, ${resBA.status}]`);
    }
  });
});
