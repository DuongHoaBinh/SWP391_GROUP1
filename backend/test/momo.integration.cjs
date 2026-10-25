const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const mysql = require('mysql2/promise');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { MomoPaymentService } = require('../dist/modules/orders/momo-payment.service');
const { MomoPaymentStore } = require('../dist/modules/orders/momo-payment.store');
const { MomoIpnDto } = require('../dist/modules/orders/momo-payment.types');
const { UserRole } = require('../dist/modules/auth/auth.types');

test('MoMo sandbox: MySQL, signing, ownership, retries and verified results', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const savedEnv = { ...process.env };
  const originalFetch = global.fetch;
  const secret = randomUUID();
  Object.assign(process.env, { MOMO_SANDBOX_ENABLED: 'true', MOMO_ENDPOINT: 'https://test-payment.momo.vn/v2/gateway/api/create',
    MOMO_PARTNER_CODE: 'test-fixture', MOMO_ACCESS_KEY: 'test-access', MOMO_SECRET_KEY: secret,
    MOMO_REDIRECT_ORIGIN: 'http://localhost:3000', MOMO_IPN_URL: 'http://localhost:15000/api/orders/payments/momo/ipn' });
  const store = new MomoPaymentStore(); store.onModuleInit();
  const service = new MomoPaymentService(store);
  const userIds = [], shipmentIds = [];
  let mode = 'normal', calls = 0, lastCreate;
  function signature(body, keys) {
    return createHmac('sha256', secret).update(keys.map(key => `${key}=${key === 'accessKey' ? 'test-access' : body[key]}`).join('&')).digest('hex');
  }
  global.fetch = async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.ok(String(url).startsWith('https://test-payment.momo.vn/v2/gateway/api/'));
    assert.equal(options.redirect, 'error');
    if (mode === 'timeout') throw new Error('Simulated timeout');
    if (url.endsWith('/create')) {
      lastCreate = body;
      assert.equal(body.signature, signature(body, ['accessKey','amount','extraData','ipnUrl','orderId','orderInfo','partnerCode','redirectUrl','requestId','requestType']));
      assert.equal(body.requestType, 'payWithATM'); assert.equal(body.amount, 15000); assert.equal(body.autoCapture, true);
      assert.equal(body.accessKey, undefined); assert.equal(body.secretKey, undefined);
      if (mode === 'rejected') return Response.json({ resultCode: 11, message: 'Rejected test configuration' });
      return Response.json({ partnerCode: body.partnerCode, orderId: body.orderId, requestId: body.requestId, amount: body.amount,
        resultCode: 0, payUrl: `https://test-payment.momo.vn/pay?orderId=${body.orderId}` });
    }
    assert.equal(body.signature, signature(body, ['accessKey','orderId','partnerCode','requestId']));
    if (['expired', 'expired-wrong-order', 'expired-wrong-partner', 'expired-wrong-request', 'expired-wrong-amount'].includes(mode)) {
      return Response.json({ partnerCode: mode === 'expired-wrong-partner' ? 'other' : body.partnerCode,
        orderId: mode === 'expired-wrong-order' ? 'other-order' : body.orderId,
        requestId: mode === 'expired-wrong-request' ? 'other-request' : body.requestId,
        amount: mode === 'expired-wrong-amount' ? 1 : undefined,
        resultCode: 1005, message: 'Transaction expired or did not exist.' });
    }
    if (mode === 'missing-pending-amount' || mode === 'missing-success-amount') {
      return Response.json({ partnerCode: body.partnerCode, orderId: body.orderId, requestId: body.requestId,
        resultCode: mode === 'missing-success-amount' ? 0 : 1000, transId: 123456789 });
    }
    return Response.json({ partnerCode: body.partnerCode, orderId: body.orderId, requestId: body.requestId,
      amount: mode === 'wrong-query-amount' ? 1 : 15000, resultCode: 1000, message: 'Waiting for confirmation', transId: 0 });
  };
  function ipn(payment, changes = {}) {
    const body = { partnerCode: payment.partner_code, orderId: payment.order_id, requestId: payment.request_id, amount: Number(payment.amount),
      orderInfo: payment.order_info, orderType: 'momo_wallet', transId: '123456789', resultCode: 0, message: 'Successful sandbox fixture', payType: 'napas', responseTime: Date.now(), extraData: '', ...changes };
    body.signature = signature(body, ['accessKey','amount','extraData','message','orderId','orderInfo','orderType','partnerCode','payType','requestId','responseTime','resultCode','transId']);
    return body;
  }
  async function rejectsStatus(action, status) { await assert.rejects(action, error => error.getStatus?.() === status); }
  try {
    const prefix = `momo-${randomUUID()}`;
    const [[role]] = await db.execute("SELECT role_id FROM `role` WHERE role_name = 'Customer'");
    for (let i = 0; i < 2; i++) {
      const [user] = await db.execute("INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, email_verified) VALUES (?, 'Sandbox test', ?, 'test-only-unusable-hash', 'system_created', 1)", [role.role_id, `${prefix}-${i}@example.com`]); userIds.push(user.insertId);
    }
    for (const status of ['approved', 'requested', 'approved', 'approved']) {
      const [shipment] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location,
        requested_date, requested_horse_count, status, total_cost) VALUES (?, ?, 'Sandbox fixture', '0900000000', ?, 'Test origin', 'Test destination', CURDATE(), 1, ?, 15000)`, [userIds[0], userIds[0], `${prefix}@example.com`, status]); shipmentIds.push(shipment.insertId);
    }
    const owner = { id: userIds[0], role: UserRole.CUSTOMER };
    const outsider = { id: userIds[1], role: UserRole.CUSTOMER };
    const sid = shipmentIds[0];

    await t.test('role, ownership and approved quote gate external requests', async () => {
      await rejectsStatus(() => service.create({ ...owner, role: UserRole.DRIVER_ESCORT }, sid), 403);
      await rejectsStatus(() => service.get(outsider, sid), 403);
      await rejectsStatus(() => service.create(outsider, sid), 403);
      await rejectsStatus(() => service.refresh(outsider, sid), 403);
      await rejectsStatus(() => service.create(owner, shipmentIds[1]), 400);
      await db.execute('UPDATE shipment SET total_cost = 9999 WHERE shipment_id = ?', [sid]);
      await rejectsStatus(() => service.create(owner, sid), 400);
      await db.execute('UPDATE shipment SET total_cost = 15000 WHERE shipment_id = ?', [sid]);
      assert.equal(calls, 0);
    });
    await t.test('legacy wallet attempts stay in history and are not reused as ATM checkout', async () => {
      const legacy = await store.reserve(sid, owner.id, 'test-fixture');
      await db.execute("UPDATE shipment_sandbox_payment SET request_type = 'captureWallet', status = 'pending', qr_content = 'momo://legacy-test' WHERE payment_id = ?", [legacy.payment.payment_id]);
      assert.equal((await service.get(owner, sid)).payment, null);
    });
    await t.test('concurrent creation sends once, signs stored amount and remains pending', async () => {
      const results = await Promise.all([service.create(owner, sid), service.create(owner, sid)]);
      assert.equal(results[0].id, results[1].id); assert.equal(calls, 1);
      const state = await service.get(owner, sid);
      assert.equal(state.payment.status, 'pending'); assert.equal(state.payment.amount, 15000);
      const [[legacy]] = await db.execute("SELECT COUNT(*) AS n FROM shipment_sandbox_payment WHERE shipment_id = ? AND request_type = 'captureWallet' AND qr_content = 'momo://legacy-test'", [sid]);
      assert.equal(Number(legacy.n), 1);
      assert.equal(state.payment.method, 'payWithATM'); assert.equal(state.payment.qrContent, undefined);
      assert.equal(JSON.stringify(state).includes(secret), false);
      assert.equal(lastCreate.redirectUrl, `http://localhost:3000/customer/requests/${sid}?payment=momo-sandbox`);
      await service.create(owner, sid); assert.equal(calls, 1);
      await db.execute('UPDATE shipment SET total_cost = 16000 WHERE shipment_id = ?', [sid]);
      await rejectsStatus(() => service.create(owner, sid), 409);
      await db.execute('UPDATE shipment SET total_cost = 15000 WHERE shipment_id = ?', [sid]);
    });
    await t.test('query reconciles pending status and rejects mismatched gateway amounts', async () => {
      const pending = await service.refresh(owner, sid); assert.equal(pending.status, 'pending');
      await db.execute('UPDATE shipment_sandbox_payment SET last_checked_at = NULL WHERE shipment_id = ?', [sid]);
      mode = 'wrong-query-amount';
      await rejectsStatus(() => service.refresh(owner, sid), 502);
      assert.equal((await service.get(owner, sid)).payment.status, 'pending');
      mode = 'normal';
    });
    await t.test('query rejects missing pending/success amounts and mismatched expired identifiers', async () => {
      for (const invalidMode of ['missing-pending-amount', 'missing-success-amount', 'expired-wrong-order', 'expired-wrong-partner', 'expired-wrong-request', 'expired-wrong-amount']) {
        await db.execute('UPDATE shipment_sandbox_payment SET last_checked_at = NULL WHERE shipment_id = ?', [sid]);
        mode = invalidMode;
        await rejectsStatus(() => service.refresh(owner, sid), 502);
        assert.equal((await service.get(owner, sid)).payment.status, 'pending');
      }
      mode = 'normal';
    });
    await t.test('expired query without amount records failure and permits a new card session', async () => {
      const previous = (await service.get(owner, sid)).payment;
      await db.execute('UPDATE shipment_sandbox_payment SET last_checked_at = NULL WHERE shipment_id = ?', [sid]);
      mode = 'expired';
      const expired = await service.refresh(owner, sid);
      assert.equal(expired.status, 'failed'); assert.equal(expired.resultCode, 1005);
      assert.match(expired.message, /hết hạn/); assert.equal(expired.amount, 15000);
      const [[event]] = await db.execute("SELECT COUNT(*) AS n FROM shipment_sandbox_payment_event WHERE payment_id = ? AND source = 'query' AND new_status = 'failed' AND result_code = 1005", [previous.id]);
      assert.equal(Number(event.n), 1);
      mode = 'normal';
      const next = await service.create(owner, sid);
      assert.equal(next.status, 'pending'); assert.notEqual(next.orderId, previous.orderId);
      const [[old]] = await db.execute('SELECT status FROM shipment_sandbox_payment WHERE payment_id = ?', [previous.id]);
      assert.equal(old.status, 'failed');
    });
    await t.test('IPN validates signature, identifiers, amount and DTO before accepting success', async () => {
      const payment = await store.byOrderId((await service.get(owner, sid)).payment.orderId);
      await rejectsStatus(() => service.ipn({ ...ipn(payment), signature: '0'.repeat(64) }), 403);
      for (const changes of [{ amount: 1 }, { requestId: randomUUID() }, { partnerCode: 'other' }, { orderInfo: 'tampered' }, { transId: '0' }, { payType: 'qr' }]) {
        await rejectsStatus(() => service.ipn(ipn(payment, changes)), 400);
      }
      const invalid = plainToInstance(MomoIpnDto, { ...ipn(payment), amount: '15000', signature: 'bad' });
      assert.ok((await validate(invalid)).length >= 2);
      const valid = ipn(payment);
      assert.equal((await validate(plainToInstance(MomoIpnDto, valid))).length, 0);
      await Promise.all([service.ipn(valid), service.ipn(valid)]);
      assert.equal((await service.get(owner, sid)).payment.status, 'succeeded');
      const [[events]] = await db.execute("SELECT COUNT(*) AS n FROM shipment_sandbox_payment_event WHERE payment_id = ? AND source = 'ipn'", [payment.payment_id]);
      assert.equal(Number(events.n), 1);
      await service.ipn(ipn(payment, { resultCode: 1006, message: 'Delayed cancellation' }));
      assert.equal((await service.get(owner, sid)).payment.status, 'succeeded');
      const [[shipment]] = await db.execute('SELECT status, total_cost FROM shipment WHERE shipment_id = ?', [sid]);
      assert.equal(shipment.status, 'approved'); assert.equal(Number(shipment.total_cost), 15000);
    });
    await t.test('timeouts retain unknown transaction and prevent duplicate attempts', async () => {
      mode = 'timeout'; const before = calls;
      await rejectsStatus(() => service.create(owner, shipmentIds[2]), 502);
      const uncertain = await service.create(owner, shipmentIds[2]);
      assert.equal(uncertain.status, 'unknown'); assert.equal(calls, before + 1);
      mode = 'normal';
      assert.equal((await service.refresh(owner, shipmentIds[2])).status, 'pending');
    });
    await t.test('explicit gateway rejection permits a new attempt with a new order ID', async () => {
      mode = 'rejected'; const rejected = await service.create(owner, shipmentIds[3]);
      assert.equal(rejected.status, 'failed');
      mode = 'normal'; const retried = await service.create(owner, shipmentIds[3]);
      assert.equal(retried.status, 'pending'); assert.notEqual(rejected.orderId, retried.orderId);
    });
    await t.test('production and arbitrary endpoints cannot use shared sandbox keys', async () => {
      const before = calls;
      process.env.NODE_ENV = 'production';
      await rejectsStatus(() => service.create(owner, sid), 503);
      process.env.NODE_ENV = savedEnv.NODE_ENV ?? 'development';
      process.env.MOMO_ENDPOINT = 'https://example.com/create';
      await rejectsStatus(() => service.create(owner, sid), 503);
      assert.equal(calls, before);
    });
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    if (shipmentIds.length) {
      await db.query('DELETE e FROM shipment_sandbox_payment_event e JOIN shipment_sandbox_payment p ON p.payment_id = e.payment_id WHERE p.shipment_id IN (?)', [shipmentIds]);
      await db.query('DELETE FROM shipment_sandbox_payment WHERE shipment_id IN (?)', [shipmentIds]);
      await db.query('DELETE FROM shipment WHERE shipment_id IN (?)', [shipmentIds]);
    }
    if (userIds.length) await db.query('DELETE FROM `user` WHERE user_id IN (?)', [userIds]);
    await store.onModuleDestroy(); await db.end();
  }
});
