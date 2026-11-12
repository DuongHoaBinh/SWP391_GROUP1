const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

test('booking: create, amend, quote, immutable invoice and bank amount through real HTTP/MySQL', async t => {
  assert.equal(process.env.PAYMENT_GATE_ISOLATED, '1', 'Run npm run test:booking for a disposable database');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const base = `http://127.0.0.1:${process.env.PORT}/api`, prefix = `booking-${crypto.randomUUID()}`, ids = {}, tokens = {};
  async function request(actor, endpoint, method = 'GET', body, status = 200) {
    const res = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[actor]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  async function create(type, count = 2, override = {}) {
    const [h] = await db.execute("INSERT INTO horse (owner_id, name, quantity, status) VALUES (?, ?, 10, 'active')", [ids.customer, prefix]);
    return request('customer', '/orders', 'POST', { contactPhone: '0900000000', contactEmail: `${prefix}@example.test`, requestedHorseCount: count,
      originLocation: 'Ho Chi Minh City, Vietnam', destinationLocation: 'Hanoi, Vietnam', bookingType: type,
      horses: [{ horseId: h.insertId, name: prefix, quantity: count, declaredValue: 100000000, insurancePackage: 'standard' }], ...override }, 201);
  }
  try {
    const password = crypto.randomBytes(20).toString('hex'), hash = await bcrypt.hash(password, 4);
    for (const [actor, role] of [['customer', 'Customer'], ['outsider', 'Customer'], ['manager', 'Logistics Manager'], ['driver', 'Vehicle Driver / Escort']]) {
      const email = `${prefix}-${actor}@example.test`;
      const [row] = await db.execute('INSERT INTO `user` (role_id, full_name, email, password_hash, email_verified) SELECT role_id, ?, ?, ?, TRUE FROM role WHERE role_name = ?', [actor, email, hash, role]);
      ids[actor] = row.insertId;
      const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json(); assert.equal(res.status, 201); tokens[actor] = data.accessToken;
    }
    await t.test('default shared persists and quantity recommendations never force a booking choice', async () => {
      const shared = await create(undefined, 3);
      assert.equal(shared.bookingType, 'shared_stall'); assert.equal(shared.stallUnitPrice, null); assert.equal(shared.transportCost, null);
      const charter = await create('dedicated_charter', 1, { transportCost: 1, stallUnitPrice: 1 });
      assert.equal(charter.bookingType, 'dedicated_charter'); assert.equal(charter.transportCost, null); assert.equal(charter.insuranceFee, 1500000);
      const list = await request('manager', '/orders'); assert.equal(list.find(o => o.id === charter.id).bookingType, 'dedicated_charter');
    });
    await t.test('shared unit quote uses actual total horse quantities, adds insurance once and reaches invoice/QR unchanged', async () => {
      const order = await create('shared_stall', 2);
      const quote = await request('manager', `/orders/${order.id}/approve`, 'PATCH', { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: 2000000, insuranceFee: 0 });
      assert.equal(quote.stallUnitPrice, 2000000); assert.equal(quote.transportCost, 4000000); assert.equal(quote.insuranceFee, 3000000); assert.equal(quote.totalCost, 7000000);
      await request('customer', `/orders/${order.id}/payments/sepay`, 'POST', {}, 400);
      const [v] = await db.execute("INSERT INTO vehicle (vehicle_type, plate_or_code, capacity) VALUES ('truck', ?, 4)", [prefix]);
      const [r] = await db.execute("INSERT INTO route (shipment_id, plan_status) VALUES (?, 'approved')", [order.id]);
      await db.execute("INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, planned_departure, planned_arrival, vehicle_id) VALUES (?, 1, 'road', 'A', 'B', '2099-01-01 08:00:00', '2099-01-01 12:00:00', ?)", [r.insertId, v.insertId]);
      await db.execute("INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment) VALUES (?, ?, 'driver')", [order.id, ids.driver]);
      await request('driver', `/routes/plan/${order.id}/driver-confirm`, 'POST', {}, 201);
      const state = await request('customer', `/orders/${order.id}/payments/sepay`);
      assert.equal(state.invoice.snapshot.bookingType, 'shared_stall'); assert.equal(state.invoice.snapshot.stallUnitPrice, 2000000);
      assert.equal(state.invoice.snapshot.horseCount, 2); assert.equal(state.invoice.amount, 7000000);
      const payment = await request('customer', `/orders/${order.id}/payments/sepay`, 'POST', { amount: 1 });
      assert.equal(payment.amount, 7000000); assert.equal(new URL(payment.qrUrl).searchParams.get('amount'), '7000000');
      await request('customer', `/orders/${order.id}`, 'PUT', { bookingType: 'dedicated_charter' }, 400);
      await request('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 1000000 }, 400);
    });
    await t.test('charter is a flat total and cannot be quoted with a stall rate', async () => {
      const order = await create('dedicated_charter', 3);
      await request('manager', `/orders/${order.id}/approve`, 'PATCH', { stallUnitPrice: 1000000, bookingType: 'dedicated_charter', quotedHorseCount: 3 }, 400);
      const quoted = await request('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 9000000, bookingType: 'dedicated_charter', quotedHorseCount: 3 });
      assert.equal(quoted.transportCost, 9000000); assert.equal(quoted.stallUnitPrice, null); assert.equal(quoted.totalCost, 13500000);
    });
    await t.test('amendment records previous booking, preserves insurance and rejects stale approval views', async () => {
      const order = await create('shared_stall', 2);
      await request('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Chọn bao chuyến theo nhu cầu đoàn' });
      await request('outsider', `/orders/${order.id}`, 'PUT', { bookingType: 'dedicated_charter' }, 403);
      const changed = await request('customer', `/orders/${order.id}`, 'PUT', { bookingType: 'dedicated_charter' });
      assert.equal(changed.bookingType, 'dedicated_charter'); assert.equal(changed.transportCost, null); assert.equal(changed.stallUnitPrice, null); assert.equal(changed.insuranceFee, 3000000);
      const [[audit]] = await db.execute('SELECT * FROM shipment_booking_revision WHERE shipment_id = ?', [order.id]);
      assert.equal(audit.previous_booking_type, 'shared_stall'); assert.equal(audit.booking_type, 'dedicated_charter'); assert.equal(audit.changed_by, ids.customer);
      await request('manager', `/orders/${order.id}/approve`, 'PATCH', { stallUnitPrice: 2000000, bookingType: 'shared_stall', quotedHorseCount: 2 }, 400);
      const quoted = await request('manager', `/orders/${order.id}/approve`, 'PATCH', { transportCost: 9000000, bookingType: 'dedicated_charter', quotedHorseCount: 2 });
      assert.equal(quoted.totalCost, 12000000);
    });
    await t.test('stale count, ambiguous prices, overflow and unauthorized approval leave the order unquoted', async () => {
      const order = await create('shared_stall', 2);
      const good = { stallUnitPrice: 1000000, bookingType: 'shared_stall', quotedHorseCount: 2 };
      for (const changes of [{ quotedHorseCount: 1 }, { quotedHorseCount: undefined }, { transportCost: 1000000 }, { stallUnitPrice: null }, { stallUnitPrice: 9999999999999 }, { stallUnitPrice: -1 }, { stallUnitPrice: 1.25 }]) {
        await request('manager', `/orders/${order.id}/approve`, 'PATCH', { ...good, ...changes }, 400);
      }
      await request('customer', `/orders/${order.id}/approve`, 'PATCH', good, 403);
      const stored = await request('customer', `/orders/${order.id}`);
      assert.equal(stored.transportCost, null); assert.equal(stored.stallUnitPrice, null); assert.equal(stored.status, 'requested');
      await request('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Cập nhật số ngựa' });
      await request('customer', `/orders/${order.id}`, 'PUT', { requestedHorseCount: 3, horses: [{ horseId: stored.horses[0].horseId, name: prefix, quantity: 3 }] });
      await request('manager', `/orders/${order.id}/approve`, 'PATCH', good, 400);
    });
    await t.test('unknown booking is rejected; legacy freight input stays a total without extra multiplication', async () => {
      const order = await create('shared_stall', 2);
      await request('manager', `/orders/${order.id}/request-changes`, 'PATCH', { reason: 'Kiểm tra hình thức' });
      await request('customer', `/orders/${order.id}`, 'PUT', { bookingType: 'unknown' }, 400);
      await request('customer', `/orders/${order.id}`, 'PUT', { specialRequirements: 'Giữ ghép stall' });
      const quoted = await request('manager', `/orders/${order.id}/approve`, 'PATCH', { totalCost: 4000000 });
      assert.equal(quoted.transportCost, 4000000); assert.equal(quoted.stallUnitPrice, null); assert.equal(quoted.totalCost, 7000000);
    });
  } finally { await db.end(); }
});
