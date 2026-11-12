const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

test('road booking: real HTTP/MySQL allocation, concurrency, privacy and six insurance/payment flows', async t => {
  assert.equal(process.env.PAYMENT_GATE_ISOLATED, '1', 'Only run with the disposable test runner');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const base = `http://127.0.0.1:${process.env.PORT}/api`, prefix = `road-${crypto.randomBytes(6).toString('hex')}`;
  const country = `Road Testland ${prefix}`, ids = {}, tokens = {};
  let sequence = 0;
  async function call(actor, endpoint, method = 'GET', body) {
    const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[actor]}` },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  }
  async function request(actor, endpoint, method = 'GET', body, status = 200) {
    const result = await call(actor, endpoint, method, body);
    assert.equal(result.status, status, JSON.stringify(result.body)); return result.body;
  }
  async function create(actor = 'customer', bookingType = 'shared_stall', count = 2, insurancePackage = 'basic') {
    const [horse] = await db.execute("INSERT INTO horse (owner_id, name, quantity, status) VALUES (?, ?, 10, 'active')", [ids[actor], `${prefix}-${++sequence}`]);
    return request(actor, '/orders', 'POST', { contactPhone: '0900000000', contactEmail: `${prefix}@example.test`,
      originLocation: 'Road origin', destinationLocation: country, transportationType: 'International', requestedHorseCount: count, bookingType,
      horses: [{ horseId: horse.insertId, name: `${prefix}-${sequence}`, quantity: count, declaredValue: 100000000, insurancePackage }] }, 201);
  }
  async function approve(order) {
    return request('manager', `/orders/${order.id}/approve`, 'PATCH', { bookingType: order.bookingType, quotedHorseCount: order.requestedHorseCount,
      transportMode: 'road', ...(order.bookingType === 'shared_stall' ? { stallUnitPrice: 2000000 } : { transportCost: 10000000 }) });
  }
  async function framework(order) {
    return request('manager', `/routes/plan/${order.id}/strategic-framework`, 'POST', { managerVehicleType: 'Specialized road truck', assignedCoordinatorId: ids.coordinator }, 201);
  }
  async function vehicle(capacity = 4) {
    return request('coordinator', '/fleet/vehicles', 'POST', { vehicleType: 'truck', plateOrCode: `${prefix}-${++sequence}`, capacity }, 201);
  }
  async function trip(v, bookingType = 'shared_stall', start = '2099-01-01T08:00:00.000Z', end = '2099-01-01T12:00:00.000Z') {
    return request('coordinator', '/fleet/road-trips', 'POST', { vehicleId: v.id, bookingType, originLocation: 'Road origin',
      destinationLocation: country, plannedDeparture: start, plannedArrival: end }, 201);
  }
  const planBody = roadTripId => ({ routeName: 'Manual compatible road trip', legs: [{ sequenceNo: 1, legType: 'road', roadTripId,
    originLocation: 'Client supplied route is not authoritative', destinationLocation: 'Client destination', stallsBooked: 999 }], stops: [] });
  async function build(order, roadTripId) { return request('coordinator', `/routes/plan/${order.id}/build-detail`, 'POST', planBody(roadTripId), 201); }
  async function webhook(payment) {
    const body = JSON.stringify({ id: crypto.randomInt(1000000000, 2000000000), gateway: 'MBBank', accountNumber: '0123456789',
      transferType: 'in', transferAmount: payment.amount, content: payment.paymentCode });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = 'sha256=' + crypto.createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetch(base + '/payments/sepay/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-SePay-Timestamp': timestamp, 'X-SePay-Signature': signature }, body, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, await response.text());
  }
  try {
    const password = crypto.randomBytes(20).toString('hex'), hash = await bcrypt.hash(password, 4);
    for (const [actor, role] of [['customer', 'Customer'], ['other', 'Customer'], ['manager', 'Logistics Manager'],
      ['coordinator', 'Fleet & Route Coordinator'], ['driver', 'Vehicle Driver / Escort'], ['strangerDriver', 'Vehicle Driver / Escort']]) {
      const email = `${prefix}-${actor}@example.test`;
      const [user] = await db.execute('INSERT INTO `user` (role_id, full_name, email, password_hash, email_verified) SELECT role_id, ?, ?, ?, TRUE FROM role WHERE role_name = ?', [actor, email, hash, role]);
      assert.ok(user.insertId, `Missing role ${role}`); ids[actor] = user.insertId;
      const login = await call(actor, '/auth/login', 'POST', { email, password });
      assert.equal(login.status, 201, JSON.stringify(login.body)); tokens[actor] = login.body.accessToken;
    }
    const [reg] = await db.execute("INSERT INTO regulation (country, document_type) VALUES (?, 'health_certificate')", [country]);

    await t.test('missing, null, empty, zero and conflicting freight are rejected without changing the quote', async () => {
      const order = await create();
      for (const body of [{}, { transportCost: null }, { transportCost: '' }, { transportCost: 0 }, { transportCost: -1 },
        { transportCost: 10000000, totalCost: 11500000 }]) await request('manager', `/orders/${order.id}/approve`, 'PATCH', body, 400);
      const unchanged = await request('customer', `/orders/${order.id}`);
      assert.equal(unchanged.status, 'requested'); assert.equal(unchanged.transportCost, null);
      const approved = await approve(order);
      assert.equal(approved.transportationType, 'International'); assert.equal(approved.transportMode, 'road');
    });

    await t.test('partial corrections preserve package/currency/quantity and append policy history', async () => {
      const order = await create('customer', 'shared_stall', 3, 'premium');
      await request('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Update valuation only' });
      const h = order.horses[0];
      const corrected = await request('customer', `/orders/${order.id}`, 'PUT', { horses: [{ horseId: h.horseId, name: h.name, declaredValue: 200000000 }] });
      assert.equal(corrected.horses[0].quantity, 3); assert.equal(corrected.horses[0].insurancePackage, 'premium');
      assert.equal(corrected.insuranceFee, 18000000); assert.equal(corrected.transportCost, null);
      const [[history]] = await db.execute('SELECT COUNT(*) AS n FROM shipment_insurance_revision WHERE shipment_id = ?', [order.id]); assert.equal(history.n, 1);
    });

    await t.test('two customers share one trip; aggregate capacity and customer privacy are enforced', async () => {
      const v = await vehicle(4), shared = await trip(v);
      const a = await create('customer'), b = await create('other');
      for (const order of [a, b]) { await approve(order); await framework(order); await build(order, shared.id); }
      const trips = await request('coordinator', '/fleet/road-trips');
      assert.equal(trips.find(row => row.id === shared.id).bookedStalls, 4);
      await request('customer', '/fleet/road-trips', 'GET', undefined, 403);
      await request('customer', `/orders/${b.id}`, 'GET', undefined, 403);
      await request('customer', `/routes/shipment/${b.id}`, 'GET', undefined, 403);
      await request('customer', `/routes/shipment/${b.id}/plan`, 'GET', undefined, 403);
      await request('customer', `/fleet/shipments/${b.id}/assignments`, 'GET', undefined, 403);
      const own = await request('customer', '/orders/my-orders'); assert.ok(!own.some(row => row.id === b.id));
      const extra = await create('other', 'shared_stall', 1); await approve(extra); await framework(extra);
      await request('coordinator', `/routes/plan/${extra.id}/build-detail`, 'POST', planBody(shared.id), 400);
      const [[legs]] = await db.execute('SELECT COUNT(*) AS n FROM route_leg l JOIN route r ON r.route_id=l.route_id WHERE r.shipment_id=?', [extra.id]); assert.equal(legs.n, 0);
    });

    for (const bookingType of ['shared_stall', 'dedicated_charter']) await t.test(`${bookingType}: concurrent allocation cannot double-book the vehicle`, async () => {
      const v = await vehicle(4), shared = await trip(v, bookingType);
      const orders = [await create('customer', bookingType, 3), await create('other', bookingType, 3)];
      for (const order of orders) { await approve(order); await framework(order); }
      const results = await Promise.all(orders.map(order => call('coordinator', `/routes/plan/${order.id}/build-detail`, 'POST', planBody(shared.id))));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 400], JSON.stringify(results));
      const list = await request('coordinator', '/fleet/road-trips'); assert.equal(list.find(row => row.id === shared.id).bookedStalls, 3);
    });

    await t.test('dedicated blocks overlaps but allows a later nonoverlapping trip on the same vehicle', async () => {
      const v = await vehicle(10), exclusive = await trip(v, 'dedicated_charter');
      const a = await create('customer', 'dedicated_charter', 3); await approve(a); await framework(a); await build(a, exclusive.id);
      const overlap = await trip(v, 'shared_stall'), b = await create('other', 'shared_stall', 1); await approve(b); await framework(b);
      await request('coordinator', `/routes/plan/${b.id}/build-detail`, 'POST', planBody(overlap.id), 400);
      const later = await trip(v, 'shared_stall', '2099-01-01T12:00:00Z', '2099-01-01T16:00:00Z'); await build(b, later.id);
    });

    for (const bookingType of ['shared_stall', 'dedicated_charter']) for (const insurancePackage of ['basic', 'standard', 'premium']) {
      await t.test(`${bookingType} + ${insurancePackage}: selection -> price -> road plan -> invoice -> sandbox -> signed test bank payment -> completion`, async () => {
        const count = bookingType === 'shared_stall' ? 2 : 3;
        const order = await create('customer', bookingType, count, insurancePackage), quoted = await approve(order);
        const freight = bookingType === 'shared_stall' ? count * 2000000 : 10000000;
        const premium = count * ({ basic: 0, standard: 1500000, premium: 3000000 })[insurancePackage];
        assert.equal(quoted.transportCost, freight); assert.equal(quoted.insuranceFee, premium); assert.equal(quoted.totalCost, freight + premium);
        await request('customer', `/orders/${order.id}/payments/sepay`, 'POST', {}, 400);
        await request('strangerDriver', `/orders/${order.id}/complete`, 'PATCH', {}, 400);
        const v = await vehicle(10), scheduled = await trip(v, bookingType); await framework(order);
        const route = await build(order, scheduled.id);
        assert.equal(route.legs[0].roadTripId, scheduled.id); assert.equal(route.legs[0].stallsBooked, count);
        await request('coordinator', `/routes/plan/${order.id}/submit`, 'POST', {}, 201);
        await request('manager', `/routes/plan/${order.id}/review`, 'POST', { status: 'approved' }, 201);
        await request('coordinator', `/fleet/shipments/${order.id}/assign-staff`, 'POST', { assignments: [{ userId: ids.driver, roleInShipment: 'driver' }] }, 201);
        await request('driver', `/routes/plan/${order.id}/driver-confirm`, 'POST', {}, 201);
        const billing = await request('customer', `/orders/${order.id}/payments/sepay`);
        assert.equal(billing.invoice.amount, freight + premium); assert.equal(billing.invoice.snapshot.bookingType, bookingType);
        assert.equal(billing.invoice.snapshot.insuranceFee, premium); assert.equal(billing.invoice.snapshot.horses[0].insurancePackage, insurancePackage);
        await db.execute("INSERT INTO shipment_sandbox_payment (shipment_id, customer_id, partner_code, order_id, request_id, order_info, amount, request_type, status) VALUES (?, ?, 'TEST', ?, ?, 'Isolated sandbox only', ?, 'payWithATM', 'pending')",
          [order.id, ids.customer, `${prefix}-${++sequence}`, crypto.randomUUID(), freight + premium]);
        await request('customer', `/orders/${order.id}/payments/momo/confirm-atm`, 'POST', {}, 201);
        assert.notEqual((await request('customer', `/orders/${order.id}`)).paymentStatus, 'succeeded');
        assert.equal((await request('manager', `/routes/plan/${order.id}/readiness`)).isPaymentSucceeded, false);
        await db.execute("INSERT INTO transport_document (horse_id, regulation_id, uploaded_by, doc_type, file_url, status, expiry_date) VALUES (?, ?, ?, 'health_certificate', '/isolated-test.pdf', 'approved', '2099-12-31')", [order.horses[0].horseId, reg.insertId, ids.customer]);
        const payment = await request('customer', `/orders/${order.id}/payments/sepay`, 'POST', {});
        assert.equal(payment.amount, freight + premium); await webhook(payment);
        const ready = await request('manager', `/routes/plan/${order.id}/readiness`); assert.equal(ready.isReadyToDepart, true);
        await request('manager', `/routes/shipment/${order.id}/publish`, 'POST', {}, 201);
        await request('strangerDriver', `/orders/${order.id}/complete`, 'PATCH', {}, 403);
        assert.equal((await request('driver', `/orders/${order.id}/complete`, 'PATCH', {})).status, 'completed');
        assert.equal((await request('driver', `/orders/${order.id}/complete`, 'PATCH', {})).status, 'completed');
        assert.equal((await request('customer', `/orders/${order.id}/payments/sepay`)).invoice.amount, freight + premium);
      });
    }
  } finally { await db.end(); }
});
