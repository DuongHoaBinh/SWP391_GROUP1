const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ quiet: true });
require('dotenv').config({ path: '.env.sepay.local', quiet: true });

test('SePay: real HTTP, MySQL, ownership, QR amounts, HMAC, durable settlement and retries', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Fixtures must never run in production');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const base = `http://127.0.0.1:${process.env.PORT || 5000}/api`;
  const password = crypto.randomBytes(20).toString('hex');
  const prefix = `sepay-it-${crypto.randomUUID()}`;
  const userIds = [], shipmentIds = [], transactionIds = [], horseIds = [];
  const tokens = {};
  let nextTransaction = 8000000000000 + crypto.randomInt(1000000000);
  async function fixtureOrder(status = 'approved', amount = 15000) {
    const [result] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location, requested_date, requested_horse_count, status, total_cost)
      VALUES (?, ?, 'SePay fixture', '0900000000', ?, 'Fixture origin', 'Fixture destination', CURDATE(), 1, ?, ?)`, [userIds[0], userIds[0], `${prefix}@example.com`, status, amount]);
    shipmentIds.push(result.insertId);
    return result.insertId;
  }
  async function request(actor, endpoint, method = 'GET', body) {
    const result = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return { status: result.status, body: await result.json() };
  }
  async function expected(actor, endpoint, method, body, status) {
    const result = await request(actor, endpoint, method, body);
    assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body;
  }
  function payload(payment, changes = {}) {
    const id = ++nextTransaction; transactionIds.push(id);
    return { id, gateway: process.env.SEPAY_BANK_CODE, transactionDate: '2026-10-31 12:00:00', accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
      transferType: 'in', transferAmount: payment.amount, code: payment.paymentCode, content: `Thanh toan ${payment.paymentCode}`, referenceCode: `FIXTURE-${id}`, ...changes };
  }
  async function webhook(value, { expired = false, tampered = false, unsigned = false, raw } = {}) {
    const body = raw ?? JSON.stringify(value);
    const timestamp = String(Math.floor(Date.now() / 1000) - (expired ? 600 : 0));
    const signature = 'sha256=' + crypto.createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const res = await fetch(base + '/payments/sepay/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(unsigned ? {} : { 'X-SePay-Timestamp': timestamp, 'X-SePay-Signature': signature }) }, body: tampered ? body + ' ' : body, signal: AbortSignal.timeout(15000) });
    return { status: res.status, body: await res.json() };
  }
  try {
    const hash = await bcrypt.hash(password, 4);
    for (const [actor, roleName] of [['owner', 'Customer'], ['outsider', 'Customer'], ['manager', 'Logistics Manager']]) {
      const [[role]] = await db.execute('SELECT role_id FROM `role` WHERE role_name = ?', [roleName]);
      const email = `${prefix}-${actor}@example.com`;
      const [user] = await db.execute("INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, email_verified) VALUES (?, 'SePay integration fixture', ?, ?, 'system_created', 1)", [role.role_id, email, hash]);
      userIds.push(user.insertId);
      const login = await expected(null, '/auth/login', 'POST', { email, password }, 201);
      tokens[actor] = login.accessToken;
      assert.ok(tokens[actor]);
    }
    for (const status of ['approved', 'requested', 'approved', 'approved', 'approved', 'approved']) {
      const [result] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location, requested_date, requested_horse_count, status, total_cost)
        VALUES (?, ?, 'SePay fixture', '0900000000', ?, 'Fixture origin', 'Fixture destination', CURDATE(), 1, ?, 15000)`, [userIds[0], userIds[0], `${prefix}@example.com`, status]);
      shipmentIds.push(result.insertId);
    }
    const endpoint = id => `/orders/${id}/payments/sepay`;
    const sid = shipmentIds[0];
    await t.test('real JWTs, customer ownership and persisted quotes', async () => {
      await expected(null, endpoint(sid), 'GET', undefined, 401);
      tokens.mock = 'mock-jwt-token-customer';
      await expected('mock', endpoint(sid), 'GET', undefined, 401);
      await expected('outsider', endpoint(sid), 'GET', undefined, 403);
      await expected('outsider', endpoint(sid), 'POST', {}, 403);
      await expected('manager', endpoint(sid), 'POST', {}, 403);
      await expected('owner', endpoint(shipmentIds[1]), 'POST', {}, 400);
      const results = await Promise.all([request('owner', endpoint(sid), 'POST', { amount: 1 }), request('owner', endpoint(sid), 'POST', {})]);
      results.forEach(result => assert.equal(result.status, 200, JSON.stringify(result.body)));
      assert.equal(results[0].body.id, results[1].body.id);
      assert.equal(results[0].body.amount, 15000);
      assert.match(results[0].body.paymentCode, /^DH\d{8}$/);
      const qr = new URL(results[0].body.qrUrl);
      assert.equal(qr.origin, 'https://vietqr.app');
      assert.equal(qr.searchParams.get('amount'), '15000');
      assert.equal(qr.searchParams.get('acc'), process.env.SEPAY_ACCOUNT_NUMBER);
      assert.equal(qr.searchParams.get('des'), results[0].body.paymentCode);
      assert.equal((await expected('manager', endpoint(sid), 'GET', undefined, 200)).payment.id, results[0].body.id);
    });
    const payment = (await expected('owner', endpoint(sid), 'GET', undefined, 200)).payment;
    await t.test('HMAC requires original bytes and a fresh timestamp; samples cannot settle', async () => {
      const body = payload(payment);
      assert.equal((await webhook(body, { unsigned: true })).status, 401);
      assert.equal((await webhook(body, { expired: true })).status, 401);
      assert.equal((await webhook(body, { tampered: true })).status, 401);
      assert.equal((await webhook({ ...body, id: 0 })).status, 200);
      assert.equal((await expected('owner', endpoint(sid), 'GET', undefined, 200)).payment.status, 'pending');
      assert.equal((await webhook(null, { raw: '{broken-json' })).status, 400);
    });
    await t.test('wrong bank/account, outgoing, ambiguous and embedded codes never settle', async () => {
      for (const changes of [{ gateway: 'OtherBank' }, { accountNumber: '9999999999' }, { transferType: 'out' },
        { content: `X${payment.paymentCode}Y`, code: null }, { content: `${payment.paymentCode} DH99999999`, code: null }]) {
        assert.equal((await webhook(payload(payment, changes))).status, 200);
      }
      assert.equal((await expected('owner', endpoint(sid), 'GET', undefined, 200)).payment.status, 'pending');
    });
    await t.test('under/overpayment remains in review even after another exact transfer', async () => {
      for (const [index, transferAmount] of [[2, 1], [5, 20000]]) {
        const p = await expected('owner', endpoint(shipmentIds[index]), 'POST', {}, 200);
        const incoming = payload(p, { transferAmount });
        assert.equal((await webhook(incoming)).status, 200);
        assert.equal((await webhook(incoming)).status, 200);
        const state = await expected('owner', endpoint(shipmentIds[index]), 'GET', undefined, 200);
        assert.equal(state.payment.status, 'review');
        assert.equal(state.payment.qrUrl, null);
        const [[receipt]] = await db.execute('SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?', [incoming.id]);
        assert.equal(receipt.outcome, 'amount_mismatch');
        const extra = payload(p);
        assert.equal((await webhook(extra)).status, 200);
        const later = await expected('owner', endpoint(shipmentIds[index]), 'GET', undefined, 200);
        assert.equal(later.payment.status, 'review');
        assert.equal(later.payment.transactionId, null);
        const [[extraReceipt]] = await db.execute('SELECT outcome FROM sepay_webhook_receipt WHERE transaction_id = ?', [extra.id]);
        assert.equal(extraReceipt.outcome, 'review_required');
        const [[notifications]] = await db.execute("SELECT COUNT(*) AS count FROM notification WHERE shipment_id = ? AND title = 'Đã nhận thanh toán'", [shipmentIds[index]]);
        assert.equal(Number(notifications.count), 0);
      }
    });
    await t.test('matching money settles once, survives retries, and preserves transport status', async () => {
      const incoming = payload(payment);
      const firstAttempts = await Promise.all([webhook(incoming), webhook(incoming)]);
      firstAttempts.forEach(result => assert.equal(result.status, 200, JSON.stringify(result.body)));
      const first = firstAttempts[0];
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(first.body, { success: true });
      const concurrent = await Promise.all([webhook(incoming), webhook(incoming)]);
      concurrent.forEach(result => assert.equal(result.status, 200));
      const reformatted = JSON.stringify(Object.fromEntries(Object.entries(incoming).reverse()), null, 2);
      assert.equal((await webhook(incoming, { raw: reformatted })).status, 200);
      assert.equal((await webhook({ ...incoming, transferAmount: 1 })).status, 409);
      const state = await expected('owner', endpoint(sid), 'GET', undefined, 200);
      assert.equal(state.payment.status, 'succeeded');
      assert.equal(state.payment.transactionId, String(incoming.id));
      assert.equal(state.payment.qrUrl, null);
      const order = await expected('owner', `/orders/${sid}`, 'GET', undefined, 200);
      assert.equal(order.paymentStatus, 'succeeded');
      assert.equal(order.status, 'approved');
      assert.equal((await expected('owner', endpoint(sid), 'POST', {}, 200)).id, payment.id);
      const [[count]] = await db.execute("SELECT COUNT(*) AS count FROM notification WHERE shipment_id = ? AND title = 'Đã nhận thanh toán'", [sid]);
      assert.equal(Number(count.count), 1);
      assert.equal((await webhook(payload(payment, { transferAmount: 1 }))).status, 200);
      assert.equal((await expected('owner', endpoint(sid), 'GET', undefined, 200)).payment.status, 'succeeded');
    });
    await t.test('changed quotes and cancelled orders are never credited', async () => {
      for (const [index, sql] of [[3, 'UPDATE shipment SET total_cost = 20000 WHERE shipment_id = ?'], [4, "UPDATE shipment SET status = 'cancelled' WHERE shipment_id = ?"]]) {
        const p = await expected('owner', endpoint(shipmentIds[index]), 'POST', {}, 200);
        await db.execute(sql, [shipmentIds[index]]);
        const stale = await expected('owner', endpoint(shipmentIds[index]), 'GET', undefined, 200);
        assert.equal(stale.payment.status, 'pending');
        assert.equal(stale.payment.qrUrl, null);
        assert.ok(stale.payment.blockedReason);
        await expected('owner', endpoint(shipmentIds[index]), 'POST', {}, index === 3 ? 409 : 400);
        assert.equal((await webhook(payload(p))).status, 200);
        assert.equal((await expected('owner', endpoint(shipmentIds[index]), 'GET', undefined, 200)).payment.status, 'review');
      }
    });
    await t.test('closing checkout does not cancel a transfer; reopening reuses the code and accepts late confirmation', async () => {
      const id = await fixtureOrder();
      const created = await expected('owner', endpoint(id), 'POST', {}, 200);
      const reopened = await expected('owner', endpoint(id), 'POST', {}, 200);
      assert.equal(reopened.id, created.id);
      assert.equal(reopened.paymentCode, created.paymentCode);
      assert.equal(reopened.status, 'pending');
      await expected('owner', `/orders/${id}/cancel`, 'PATCH', {}, 400);
      const incoming = payload(created, { code: null, content: `Thanh toan (${created.paymentCode})` });
      assert.equal((await webhook(incoming)).status, 200);
      const receipt = await expected('owner', endpoint(id), 'GET', undefined, 200);
      assert.equal(receipt.payment.status, 'succeeded');
      assert.ok(receipt.payment.paidAt);
      assert.equal(receipt.payment.qrUrl, null);
      for (const actor of ['owner', 'manager']) {
        const orders = await expected(actor, actor === 'owner' ? '/orders/my-orders' : '/orders', 'GET', undefined, 200);
        assert.equal(orders.find(order => order.id === id).paymentStatus, 'succeeded');
      }
    });
    await t.test('approval rejects invalid VND quotes and payment rejects an absent quote', async () => {
      const id = await fixtureOrder('requested', 0);
      for (const totalCost of [1.5, -1, 10000000000000]) {
        await expected('manager', `/orders/${id}/approve`, 'PATCH', { totalCost }, 400);
      }
      await expected('manager', `/orders/${id}/approve`, 'PATCH', { totalCost: 0 }, 200);
      await expected('owner', endpoint(id), 'POST', {}, 400);
      const payable = await fixtureOrder('requested', 0);
      const approved = await expected('manager', `/orders/${payable}/approve`, 'PATCH', { totalCost: 52527200 }, 200);
      assert.equal(approved.totalCost, 52527200);
      assert.equal((await expected('owner', endpoint(payable), 'POST', { amount: 1 }, 200)).amount, 52527200);
    });
    await t.test('cancellation is persisted, owned, idempotent and cannot cancel approved or paid orders', async () => {
      const id = await fixtureOrder('requested', 0);
      const [horse] = await db.execute("INSERT INTO horse (owner_id, name, status) VALUES (?, 'SePay cancellation fixture', 'in_transit')", [userIds[0]]);
      horseIds.push(horse.insertId);
      await db.execute('INSERT INTO shipment_horse (shipment_id, horse_id, quantity) VALUES (?, ?, 1)', [id, horse.insertId]);
      await expected('outsider', `/orders/${id}/cancel`, 'PATCH', {}, 403);
      await expected('manager', `/orders/${id}/cancel`, 'PATCH', {}, 403);
      assert.equal((await expected('owner', `/orders/${id}/cancel`, 'PATCH', {}, 200)).status, 'cancelled');
      await expected('owner', `/orders/${id}/cancel`, 'PATCH', {}, 200);
      await expected('manager', `/orders/${id}/approve`, 'PATCH', { totalCost: 15000 }, 400);
      await expected('owner', endpoint(id), 'POST', {}, 400);
      await expected('owner', `/orders/${sid}/cancel`, 'PATCH', {}, 400);
      const [[notifications]] = await db.execute("SELECT COUNT(*) AS count FROM notification WHERE shipment_id = ? AND title = 'Đã hủy yêu cầu vận chuyển'", [id]);
      assert.equal(Number(notifications.count), 1);
      const [[releasedHorse]] = await db.execute('SELECT status FROM horse WHERE horse_id = ?', [horse.insertId]);
      assert.equal(releasedHorse.status, 'active');
    });
    await t.test('concurrent approval and cancellation cannot revive a cancelled order', async () => {
      const id = await fixtureOrder('requested', 0);
      const outcomes = await Promise.all([
        request('manager', `/orders/${id}/approve`, 'PATCH', { totalCost: 15000 }),
        request('owner', `/orders/${id}/cancel`, 'PATCH', {}),
      ]);
      assert.equal(outcomes.filter(result => result.status === 200).length, 1, JSON.stringify(outcomes));
      const order = await expected('owner', `/orders/${id}`, 'GET', undefined, 200);
      assert.equal(order.status, outcomes[0].status === 200 ? 'approved' : 'cancelled');
      if (order.status === 'cancelled') await expected('owner', endpoint(id), 'POST', {}, 400);
    });
    await t.test('fresh store reads durable success', async () => {
      const { SepayPaymentStore } = require('../dist/modules/orders/sepay-payment.store');
      const store = new SepayPaymentStore(); store.onModuleInit();
      try { assert.equal((await store.latest(sid, userIds[0])).status, 'succeeded'); } finally { await store.onModuleDestroy(); }
    });
  } finally {
    if (transactionIds.length) await db.query('DELETE FROM sepay_webhook_receipt WHERE transaction_id IN (?)', [transactionIds]);
    if (shipmentIds.length) {
      await db.query('DELETE FROM notification WHERE shipment_id IN (?)', [shipmentIds]);
      await db.query('DELETE FROM shipment_sepay_payment WHERE shipment_id IN (?)', [shipmentIds]);
      await db.query('DELETE FROM shipment_horse WHERE shipment_id IN (?)', [shipmentIds]);
      await db.query('DELETE FROM shipment WHERE shipment_id IN (?)', [shipmentIds]);
    }
    if (horseIds.length) await db.query('DELETE FROM horse WHERE horse_id IN (?)', [horseIds]);
    if (userIds.length) await db.query('DELETE FROM `user` WHERE user_id IN (?)', [userIds]);
    await db.end();
  }
});
