const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

test('Flow 1 -> Flow 3 invoice -> SePay -> legal readiness, against isolated MySQL and HTTP', async t => {
  assert.equal(process.env.PAYMENT_GATE_ISOLATED, '1', 'Run npm run test:payment-gate to use the disposable database');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const base = `http://127.0.0.1:${process.env.PORT}/api`;
  const ids = {}, tokens = {}, prefix = crypto.randomBytes(6).toString('hex');
  const password = crypto.randomBytes(20).toString('hex');
  async function request(actor, endpoint, method = 'GET', body, status = 200) {
    const res = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[actor]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  async function fixture({ status = 'planning', plan = 'approved', cost = 15000, approvedDocs = false, staff = true, legs = true } = {}) {
    const [order] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_phone, contact_email, origin_location, destination_location, status, total_cost)
      VALUES (?, ?, '0900000000', 'test@example.com', 'Test origin', 'Gate Testland', ?, ?)`, [ids.customer, ids.customer, status, cost]);
    const id = order.insertId;
    const [horse] = await db.execute("INSERT INTO horse (owner_id, name) VALUES (?, 'Test horse')", [ids.customer]);
    await db.execute('INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?)', [id, horse.insertId]);
    const [document] = await db.execute(`INSERT INTO transport_document (horse_id, regulation_id, uploaded_by, doc_type, file_url, status, expiry_date)
      VALUES (?, ?, ?, 'health_certificate', '/test.pdf', ?, '2099-12-31')`, [horse.insertId, reg, ids.customer, approvedDocs ? 'approved' : 'submitted']);
    const [route] = await db.execute("INSERT INTO route (shipment_id, route_name, plan_status) VALUES (?, 'Confirmed test itinerary', ?)", [id, plan]);
    if (legs) await db.execute(`INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, planned_departure, planned_arrival, vehicle_id)
      VALUES (?, 1, 'road', 'Test origin', 'Gate Testland', '2099-01-01 08:00:00', '2099-01-01 12:00:00', ?)`, [route.insertId, vehicle]);
    if (staff) for (const [actor, role] of [['driver', 'driver'], ['escort', 'escort']]) await db.execute('INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment) VALUES (?, ?, ?)', [id, ids[actor], role]);
    await db.execute('INSERT INTO shipment_vehicle (shipment_id, vehicle_id) VALUES (?, ?)', [id, vehicle]);
    return { id, routeId: route.insertId, documentId: document.insertId };
  }
  const payPath = f => `/orders/${f.id}/payments/sepay`;
  const confirm = (f, actor) => request(actor, `/routes/plan/${f.id}/driver-confirm`, 'POST', {}, 201);
  async function settle(f) {
    const payment = await request('customer', payPath(f), 'POST', {});
    await webhook(payment);
  }
  async function webhook(payment) {
    const body = JSON.stringify({ id: crypto.randomInt(1000000000, 2000000000), gateway: 'MBBank', accountNumber: '0123456789', transferType: 'in', transferAmount: payment.amount, content: payment.paymentCode });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = 'sha256=' + crypto.createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const res = await fetch(base + '/payments/sepay/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SePay-Timestamp': timestamp, 'X-SePay-Signature': signature }, body });
    assert.equal(res.status, 200, await res.text());
  }
  let reg, vehicle;
  try {
    const hash = await bcrypt.hash(password, 4);
    for (const [actor, role] of [['customer', 'Customer'], ['manager', 'Logistics Manager'], ['driver', 'Vehicle Driver / Escort'], ['escort', 'Vehicle Driver / Escort'], ['specialist', 'Transport Specialist']]) {
      const [row] = await db.execute(`INSERT INTO \`user\` (role_id, full_name, email, password_hash, email_verified)
        SELECT role_id, ?, ?, ?, TRUE FROM role WHERE role_name = ?`, [actor, `${prefix}-${actor}@example.com`, hash, role]);
      ids[actor] = row.insertId;
      const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${prefix}-${actor}@example.com`, password }) });
      const data = await res.json(); assert.equal(res.status, 201, JSON.stringify(data)); tokens[actor] = data.accessToken;
    }
    const [r] = await db.execute("INSERT INTO regulation (country, document_type) VALUES ('Gate Testland', 'health_certificate')"); reg = r.insertId;
    const [v] = await db.execute("INSERT INTO vehicle (vehicle_type, plate_or_code, capacity) VALUES ('truck', ?, 10)", [prefix]); vehicle = v.insertId;

    await t.test('Flow 1 approval and 100% legal documents alone never open payment or create an invoice', async () => {
      const f = await fixture({ status: 'requested', plan: 'draft', approvedDocs: true });
      await request('manager', `/orders/${f.id}/approve`, 'PATCH', { totalCost: 15000 });
      const state = await request('customer', payPath(f));
      assert.equal(state.paymentUnlocked, false); assert.equal(state.invoice, null);
      assert.match(state.blockedReason, /lịch trình được xác nhận/);
      await request('customer', payPath(f), 'POST', {}, 400);
      await request('driver', `/routes/plan/${f.id}/driver-confirm`, 'POST', {}, 400);
    });
    await t.test('one confirmation keeps the gate locked; concurrent final confirmation creates exactly one invoice and notification', async () => {
      const f = await fixture();
      assert.equal((await confirm(f, 'driver')).isFullyConfirmed, false);
      assert.equal((await request('customer', payPath(f))).invoice, null);
      await request('customer', payPath(f), 'POST', {}, 400);
      const results = await Promise.all([confirm(f, 'escort'), confirm(f, 'escort')]);
      assert.ok(results.every(r => r.isFullyConfirmed));
      const state = await request('customer', payPath(f));
      assert.equal(state.paymentUnlocked, true); assert.equal(state.invoice.amount, 15000);
      assert.equal(state.invoice.snapshot.legs.length, 1);
      assert.equal(state.invoice.routeId, f.routeId);
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM shipment_invoice WHERE shipment_id = ?', [f.id]); assert.equal(count.n, 1);
      const [[notifs]] = await db.execute("SELECT COUNT(*) AS n FROM notification WHERE shipment_id = ? AND title = 'Kế hoạch vận chuyển đã hoàn tất'", [f.id]); assert.equal(notifs.n, 1);
      await request('customer', `/routes/plan/${f.id}/driver-confirm`, 'POST', {}, 403);
      await request('manager', payPath(f), 'POST', {}, 403);
    });
    await t.test('confirmed plan opens payment while legal documents are still pending, but publish stays blocked', async () => {
      const f = await fixture(); await confirm(f, 'driver'); await confirm(f, 'escort');
      const p = await request('customer', payPath(f), 'POST', {}); assert.ok(p.qrUrl);
      await request('manager', `/routes/shipment/${f.id}/publish`, 'POST', {}, 400);
      const readiness = await request('manager', `/routes/plan/${f.id}/readiness`);
      assert.equal(readiness.isReadyToDepart, false); assert.equal(readiness.isPaymentSucceeded, false);
    });
    await t.test('payment then legal approval automatically reaches ready; revoked legal approval removes readiness', async () => {
      const f = await fixture(); await confirm(f, 'driver'); await confirm(f, 'escort'); await settle(f);
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'confirmed');
      await request('specialist', `/documents/${f.documentId}/review`, 'PATCH', { status: 'approved' });
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'ready_to_depart');
      await request('specialist', `/documents/${f.documentId}/review`, 'PATCH', { status: 'rejected', notes: 'Cần xác minh lại hồ sơ' });
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'confirmed');
      await request('manager', `/routes/shipment/${f.id}/publish`, 'POST', {}, 400);
    });
    await t.test('legal approval then signed payment reaches ready automatically and duplicate readiness calls do not duplicate notices', async () => {
      const f = await fixture({ approvedDocs: true }); await confirm(f, 'driver'); await confirm(f, 'escort');
      await settle(f);
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'ready_to_depart');
      await Promise.all([request('manager', `/routes/plan/${f.id}/readiness`), request('manager', `/routes/plan/${f.id}/readiness`)]);
      const [[n]] = await db.execute("SELECT COUNT(*) AS n FROM notification WHERE shipment_id = ? AND title = 'Chuyến đi đã đủ điều kiện xuất phát'", [f.id]); assert.equal(n.n, 1);
      await request('manager', `/routes/shipment/${f.id}/publish`, 'POST', {}, 201);
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'in_transit');
    });
    await t.test('zero quotes, no route legs, absent staff and unconfirmed legacy records cannot open payment', async () => {
      for (const options of [{ cost: 0 }, { legs: false }, { staff: false }, { plan: 'confirmed' }]) {
        const f = await fixture(options);
        assert.equal((await request('customer', payPath(f))).paymentUnlocked, false);
        await request('customer', payPath(f), 'POST', {}, 400);
        if (options.cost === 0 || options.legs === false || options.staff === false) await request('driver', `/routes/plan/${f.id}/driver-confirm`, 'POST', {}, 400);
        assert.equal((await request('manager', `/routes/plan/${f.id}/readiness`)).isReadyToDepart, false);
      }
    });
    await t.test('an old pending QR is hidden and not settled when route confirmation is revoked', async () => {
      const f = await fixture(); await confirm(f, 'driver'); await confirm(f, 'escort');
      const payment = await request('customer', payPath(f), 'POST', {});
      await db.execute("UPDATE route SET plan_status = 'draft' WHERE route_id = ?", [f.routeId]);
      const state = await request('customer', payPath(f)); assert.equal(state.paymentUnlocked, false); assert.equal(state.payment.qrUrl, null);
      await request('customer', payPath(f), 'POST', {}, 400);
      await webhook(payment);
      assert.equal((await request('customer', payPath(f))).payment.status, 'review');
    });
    await t.test('Flow 4 departure rechecks legal readiness instead of trusting a stale ready status', async () => {
      const f = await fixture({ approvedDocs: true }); await confirm(f, 'driver'); await confirm(f, 'escort'); await settle(f);
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'ready_to_depart');
      await db.execute("UPDATE transport_document SET status = 'expired' WHERE document_id = ?", [f.documentId]);
      const [[leg]] = await db.execute('SELECT leg_id FROM route_leg WHERE route_id = ?', [f.routeId]);
      await request('manager', `/tracking/shipments/${f.id}/legs/${leg.leg_id}/start`, 'POST', {}, 400);
      const [[stored]] = await db.execute('SELECT status FROM route_leg WHERE leg_id = ?', [leg.leg_id]);
      assert.equal(stored.status, 'pending');
      assert.equal((await request('customer', `/orders/${f.id}`)).status, 'confirmed');
    });
  } finally { await db.end(); }
});
