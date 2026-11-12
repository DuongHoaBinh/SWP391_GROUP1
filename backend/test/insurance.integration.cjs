const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

test('equine insurance: persisted declarations, exact quote totals, ownership, revisions and invoices', async t => {
  assert.equal(process.env.PAYMENT_GATE_ISOLATED, '1', 'Use npm run test:insurance for isolated MySQL');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const base = `http://127.0.0.1:${process.env.PORT}/api`, prefix = `insurance-${crypto.randomUUID()}`;
  const ids = {}, tokens = {};
  async function req(actor, path, method = 'GET', body, status = 200) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[actor]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  async function horse(quantity = 3, owner = ids.customer) {
    const [row] = await db.execute("INSERT INTO horse (owner_id, name, quantity, status) VALUES (?, ?, ?, 'active')", [owner, prefix, quantity]);
    return { horseId: row.insertId, name: prefix };
  }
  const payload = horses => ({ contactPhone: '0900000000', contactEmail: `${prefix}@example.com`, requestedHorseCount: horses.reduce((n, h) => n + (h.quantity ?? 1), 0), originLocation: 'Test origin', destinationLocation: 'Insurance Testland', horses });
  const create = horses => req('customer', '/orders', 'POST', payload(horses), 201);
  try {
    const password = crypto.randomBytes(20).toString('hex'), hash = await bcrypt.hash(password, 4);
    for (const [actor, role] of [['customer', 'Customer'], ['outsider', 'Customer'], ['manager', 'Logistics Manager'], ['driver', 'Vehicle Driver / Escort']]) {
      const email = `${prefix}-${actor}@example.com`;
      const [row] = await db.execute('INSERT INTO `user` (role_id, full_name, email, password_hash, email_verified) SELECT role_id, ?, ?, ?, TRUE FROM role WHERE role_name = ?', [actor, email, hash, role]);
      ids[actor] = row.insertId;
      const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json(); assert.equal(res.status, 201, JSON.stringify(data)); tokens[actor] = data.accessToken;
    }
    await t.test('default basic remains free and unquoted orders keep transport cost pending', async () => {
      const order = await create([await horse()]);
      assert.equal(order.transportCost, null); assert.equal(order.totalCost, 0); assert.equal(order.insuranceFee, 0);
      assert.equal(order.horses[0].insurancePackage, 'basic'); assert.equal(order.horses[0].maxCompensation, 50000000);
      assert.equal(order.horses[0].emergencyVetCovered, false);
    });
    await t.test('mixed packages, source currencies and quantities persist; client premiums are ignored', async () => {
      const a = await horse(), b = await horse();
      const order = await create([{ ...a, quantity: 2, declaredValue: 100000000, insurancePackage: 'standard', insuranceFee: 1, maxCompensation: 1 },
        { ...b, quantity: 1, declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'premium', exchangeRate: 1, insuranceFee: 0 }]);
      assert.equal(order.insuranceFee, 10500000); assert.equal(order.totalCost, 0);
      assert.equal(order.horses.find(h => h.horseId === a.horseId).insuranceFee, 1500000);
      const premium = order.horses.find(h => h.horseId === b.horseId);
      assert.equal(premium.declaredValueVnd, 250000000); assert.equal(premium.exchangeRate, 25000);
      assert.equal(premium.maxCompensation, 250000000); assert.equal(premium.emergencyVetCovered, true);
      await req('outsider', `/orders/${order.id}`, 'GET', undefined, 403);
    });
    await t.test('manager quotes base freight; insurance is added exactly once and cannot be repriced after approval', async () => {
      const order = await create([{ ...await horse(), declaredValue: 100000000, insurancePackage: 'standard' }]);
      const quoted = await req('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 10000000, insuranceFee: 1, totalCost: 10000000 });
      assert.equal(quoted.transportCost, 10000000); assert.equal(quoted.insuranceFee, 1500000); assert.equal(quoted.totalCost, 11500000);
      await req('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 11500000 }, 400);
      assert.equal((await req('customer', `/orders/${order.id}`)).totalCost, 11500000);
    });
    await t.test('invoice and SePay use the combined total and keep the insurance snapshot', async () => {
      const order = await create([{ ...await horse(), declaredValue: 100000000, insurancePackage: 'premium' }]);
      await req('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 10000000 });
      const [vehicle] = await db.execute("INSERT INTO vehicle (vehicle_type, plate_or_code, capacity) VALUES ('truck', ?, 3)", [prefix]);
      const [route] = await db.execute("INSERT INTO route (shipment_id, plan_status) VALUES (?, 'approved')", [order.id]);
      await db.execute("INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, planned_departure, planned_arrival, vehicle_id) VALUES (?, 1, 'road', 'A', 'B', '2099-01-01 08:00:00', '2099-01-01 12:00:00', ?)", [route.insertId, vehicle.insertId]);
      await db.execute("INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment) VALUES (?, ?, 'driver')", [order.id, ids.driver]);
      await req('customer', `/orders/${order.id}/payments/sepay`, 'POST', {}, 400);
      await req('driver', `/routes/plan/${order.id}/driver-confirm`, 'POST', {}, 201);
      const billing = await req('customer', `/orders/${order.id}/payments/sepay`);
      assert.equal(billing.invoice.amount, 13000000); assert.equal(billing.invoice.snapshot.transportCost, 10000000);
      assert.equal(billing.invoice.snapshot.insuranceFee, 3000000);
      assert.equal(billing.invoice.snapshot.horses[0].insurancePackage, 'premium');
      const payment = await req('customer', `/orders/${order.id}/payments/sepay`, 'POST', { amount: 1 });
      assert.equal(payment.amount, 13000000); assert.equal(new URL(payment.qrUrl).searchParams.get('amount'), '13000000');
    });
    await t.test('invalid paid values, negative/overflow declarations and foreign horses roll back the entire request', async () => {
      const h = await horse(100), foreign = await horse(1, ids.outsider);
      const [[before]] = await db.execute('SELECT COUNT(*) AS n FROM shipment WHERE customer_id = ?', [ids.customer]);
      for (const changes of [{ declaredValue: -1 }, { declaredValue: 1.001 }, { insurancePackage: 'unknown' }, { insurancePackage: 'premium', declaredValue: 0 },
        { insurancePackage: 'premium', declaredValue: 9999999999999.99, quantity: 100 }]) await req('customer', '/orders', 'POST', payload([{ ...h, ...changes }]), 400);
      await req('customer', '/orders', 'POST', payload([h, foreign]), 400);
      await req('customer', '/orders', 'POST', payload([h, h]), 400);
      const [[after]] = await db.execute('SELECT COUNT(*) AS n FROM shipment WHERE customer_id = ?', [ids.customer]); assert.equal(after.n, before.n);
      const [[stored]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [h.horseId]); assert.equal(stored.status, 'active');
    });
    await t.test('resubmission preserves horse identity and history; updates policy only before approval', async () => {
      const h = await horse();
      const order = await create([{ ...h, declaredValue: 100000000, insurancePackage: 'standard', quantity: 2 }]);
      await req('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Vui lòng kiểm tra giá trị khai báo' });
      await req('outsider', `/orders/${order.id}`, 'PUT', { horses: [h] }, 403);
      const updated = await req('customer', `/orders/${order.id}`, 'PUT', { requestedHorseCount: 3, horses: [{ ...h, quantity: 3, declaredValue: 200000000, insurancePackage: 'premium' }] });
      assert.equal(updated.horses[0].horseId, h.horseId); assert.equal(updated.insuranceFee, 18000000);
      assert.equal(updated.transportCost, null); assert.equal(updated.totalCost, 0);
      const [[audit]] = await db.execute('SELECT previous_snapshot FROM shipment_insurance_revision WHERE shipment_id = ?', [order.id]);
      const snapshot = typeof audit.previous_snapshot === 'string' ? JSON.parse(audit.previous_snapshot) : audit.previous_snapshot;
      assert.equal(snapshot[0].insurance_package, 'standard'); assert.equal(Number(snapshot[0].declared_value), 100000000);
      await req('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 5000000 });
      await req('customer', `/orders/${order.id}`, 'PUT', { horses: [{ ...h, insurancePackage: 'basic' }] }, 400);
    });
    await t.test('unchanged USD valuation keeps its stored rate across resubmission', async () => {
      const h = await horse();
      const order = await create([{ ...h, declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard' }]);
      await db.execute('UPDATE shipment_horse SET exchange_rate = 20000, declared_value_vnd = 200000000, insurance_fee = 3000000, max_compensation = 160000000 WHERE shipment_id = ?', [order.id]);
      await db.execute('UPDATE shipment SET insurance_fee = 3000000 WHERE shipment_id = ?', [order.id]);
      await req('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Cập nhật thông tin liên hệ' });
      const updated = await req('customer', `/orders/${order.id}`, 'PUT', { horses: [{ ...h, declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard' }] });
      assert.equal(updated.horses[0].exchangeRate, 20000); assert.equal(updated.insuranceFee, 3000000);
    });
    await t.test('competing requests cannot reserve the same horse or leave orphan orders', async () => {
      const h = await horse();
      const body = payload([{ ...h, declaredValue: 100000000, insurancePackage: 'standard' }]);
      const responses = await Promise.all([1, 2].map(() => fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.customer}` }, body: JSON.stringify(body) })));
      assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]);
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM shipment_horse WHERE horse_id = ?', [h.horseId]); assert.equal(count.n, 1);
    });
    await t.test('concurrent approval and change request cannot reopen an approved insurance quote', async () => {
      const order = await create([{ ...await horse(), declaredValue: 100000000, insurancePackage: 'premium' }]);
      await db.beginTransaction();
      await db.execute('SELECT shipment_id FROM shipment WHERE shipment_id = ? FOR UPDATE', [order.id]);
      const send = (action, body) => fetch(`${base}/orders/${order.id}/${action}`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.manager}` }, body: JSON.stringify(body) });
      const approval = send('approve', { transportCost: 10000000 });
      const changes = send('request-changes', { reason: 'Kiểm tra bảo hiểm' });
      try {
        let waiting = 0;
        for (let attempt = 0; attempt < 60; attempt++) {
          const [[row]] = await db.query('SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) AS n FROM performance_schema.data_lock_waits');
          waiting = Number(row.n);
          if (waiting >= 2) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.ok(waiting >= 2, 'Both mutations must reach the locked order before release');
      } finally { await db.commit(); }
      const responses = await Promise.all([approval, changes]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
      const stored = await req('customer', `/orders/${order.id}`);
      assert.equal(stored.insuranceFee, 3000000);
      if (responses[0].ok) {
        assert.equal(stored.status, 'approved'); assert.equal(stored.totalCost, 13000000);
        await req('customer', `/orders/${order.id}`, 'PUT', { horses: [{ ...stored.horses[0], insurancePackage: 'basic' }] }, 400);
      } else { assert.equal(stored.status, 'change_requested'); assert.equal(stored.totalCost, 0); }
    });
    await t.test('notes-only resubmission keeps policy, quantities and audit history intact', async () => {
      const order = await create([{ ...await horse(), quantity: 2, declaredValue: 100000000, insurancePackage: 'standard' }]);
      await req('customer', `/orders/${order.id}`, 'PUT', { specialRequirements: 'Chưa được yêu cầu chỉnh sửa' }, 400);
      await req('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Bổ sung lưu ý chăm sóc' });
      const updated = await req('customer', `/orders/${order.id}`, 'PUT', { specialRequirements: 'Giữ nhiệt độ ổn định' });
      assert.equal(updated.horses[0].horseId, order.horses[0].horseId);
      assert.equal(updated.horses[0].quantity, 2); assert.equal(updated.horses[0].insurancePackage, 'standard');
      assert.equal(updated.insuranceFee, 3000000); assert.equal(updated.transportCost, null);
      const [[audit]] = await db.execute('SELECT COUNT(*) AS n FROM shipment_insurance_revision WHERE shipment_id = ?', [order.id]);
      assert.equal(audit.n, 0);
    });
    await t.test('role notifications never invent recipients when the target role has no accounts', async () => {
      const { NotificationsStore } = require('../dist/modules/notifications/notifications.store');
      const recipients = await NotificationsStore.prototype.findUserIdsByRole.call({ pool: db }, 'Missing Insurance Specialist');
      assert.deepEqual(recipients, []);
    });
  } finally { await db.end(); }
});
