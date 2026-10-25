const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ quiet: true });

// Uses temporary fixtures in the configured development DB and a running backend.
test('Flow 4: persisted events, permissions, state transitions, health history and alerts', async t => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Integration fixtures are for development only');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const base = `http://127.0.0.1:${process.env.PORT || 5000}/api`;
  const password = crypto.randomBytes(18).toString('hex');
  const prefix = `tracking-${crypto.randomUUID()}`;
  const userIds = [], horseIds = [], shipmentIds = [], routeIds = [];
  const tokens = {};
  const ids = {};
  async function request(actor, path, method = 'GET', body) {
    const result = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { status: result.status, body: await result.json() };
  }
  async function expected(actor, path, method, body, status) {
    const result = await request(actor, path, method, body);
    assert.equal(result.status, status, `${actor} ${method} ${path}: ${JSON.stringify(result.body)}`);
    return result.body;
  }
  try {
    const hash = await bcrypt.hash(password, 4);
    for (const [actor, roleName, specialization] of [
      ['customer', 'Customer'], ['otherCustomer', 'Customer'], ['driver', 'Vehicle Driver / Escort', 'driver'],
      ['otherDriver', 'Vehicle Driver / Escort', 'driver'], ['escort', 'Vehicle Driver / Escort', 'escort'],
      ['coordinator', 'Fleet & Route Coordinator'], ['otherCoordinator', 'Fleet & Route Coordinator'],
    ]) {
      const [[role]] = await db.execute('SELECT role_id FROM `role` WHERE role_name = ?', [roleName]);
      assert.ok(role, `Seed role missing: ${roleName}`);
      const email = `${prefix}-${actor}@example.com`;
      const [user] = await db.execute("INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, email_verified, specialization) VALUES (?, ?, ?, ?, 'system_created', 1, ?)", [role.role_id, actor, email, hash, specialization ?? null]);
      ids[actor] = user.insertId; userIds.push(user.insertId);
      const result = await request(null, '/auth/login', 'POST', { email, password });
      assert.equal(result.status, 201); tokens[actor] = result.body.accessToken;
    }
    for (let i = 0; i < 3; i++) {
      const [horse] = await db.execute("INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no) VALUES (?, ?, 'Test breed', 'male', 5, ?)", [ids.customer, `${prefix}-horse${i}`, `${prefix}-${i}`]);
      horseIds.push(horse.insertId);
    }
    const [shipment] = await db.execute("INSERT INTO shipment (customer_id, requested_by, contact_name, contact_phone, contact_email, origin_location, destination_location, requested_date, requested_horse_count, status, total_cost) VALUES (?, ?, 'Integration fixture', '0900000000', ?, 'Test origin', 'Test destination', CURDATE(), 2, 'ready_to_depart', 15000000)", [ids.customer, ids.customer, `${prefix}@example.com`]);
    const sid = shipment.insertId; shipmentIds.push(sid);
    await db.execute('INSERT INTO shipment_horse (shipment_id, horse_id) VALUES (?, ?), (?, ?)', [sid, horseIds[0], sid, horseIds[1]]);
    const [route] = await db.execute("INSERT INTO route (shipment_id, route_name, plan_status, status) VALUES (?, 'Integration route', 'ready_to_depart', 'active')", [sid]);
    const rid = route.insertId; routeIds.push(rid);
    const [road] = await db.execute("INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location) VALUES (?, 1, 'road', 'Origin', 'Airport')", [rid]);
    const [flight] = await db.execute("INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location) VALUES (?, 2, 'flight', 'Airport', 'Destination')", [rid]);
    const stops = [];
    for (const [sequence, legId, type] of [[1, road.insertId, 'rest'], [2, road.insertId, 'quarantine'], [3, flight.insertId, 'border_check']]) {
      const [stop] = await db.execute('INSERT INTO route_stop (route_id, leg_id, sequence_no, stop_type, location_name) VALUES (?, ?, ?, ?, ?)', [rid, legId, sequence, type, `Test stop ${sequence}`]); stops.push(stop.insertId);
    }
    await db.execute("INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, is_confirmed) VALUES (?, ?, 'driver', 1), (?, ?, 'escort', 1), (?, ?, 'fleet_coordinator', 1)", [sid, ids.driver, sid, ids.escort, sid, ids.coordinator]);
    const path = `/tracking/shipments/${sid}`;
    const health = { horseId: horseIds[0], conditionStatus: 'stable', temperatureC: 38.5, heartRateBpm: 40, vehicleTemperatureC: 16, notes: 'private staff observation' };

    await t.test('server enforces ownership and assignment for reads and writes', async () => {
      await expected(null, path, 'GET', undefined, 401);
      await expected('otherCustomer', path, 'GET', undefined, 403);
      await expected('otherDriver', path, 'GET', undefined, 403);
      for (const actor of ['customer', 'otherDriver', 'otherCoordinator']) {
        await expected(actor, path + '/start', 'POST', {}, 403);
        await expected(actor, path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived' }, 403);
        await expected(actor, path + '/health-logs', 'POST', health, 403);
        await expected(actor, path + '/complete', 'POST', {}, 403);
      }
      const trips = await expected('otherDriver', '/tracking/my-trips', 'GET', undefined, 200);
      assert.ok(!trips.some(trip => trip.shipment_id === sid));
    });
    await t.test('unconfirmed staff have no milestone actions and cannot depart', async () => {
      await db.execute('UPDATE shipment_assignment SET is_confirmed = 0 WHERE shipment_id = ? AND user_id = ?', [sid, ids.driver]);
      const detail = await expected('driver', path, 'GET', undefined, 200);
      assert.ok(detail.milestones.every(m => m.allowedActions.length === 0));
      await expected('driver', path + '/start', 'POST', {}, 400);
      await db.execute('UPDATE shipment_assignment SET is_confirmed = 1 WHERE shipment_id = ? AND user_id = ?', [sid, ids.driver]);
    });
    await t.test('DTO validation rejects malformed values and foreign horses', async () => {
      for (const change of [{ temperatureC: 'hot' }, { temperatureC: 99 }, { temperatureC: 38.51 }, { vehicleTemperatureC: 16.01 }, { heartRateBpm: -1 }, { conditionStatus: 'invalid' }, { horseId: horseIds[2] }, { horseId: undefined }, { attachments: ['javascript:alert(1)'] }]) {
        await expected('driver', path + '/health-logs', 'POST', { ...health, ...change }, 400);
      }
      await expected('driver', path + '/health-logs?page=0', 'GET', undefined, 400);
      await expected('driver', path + '/health-logs?pageSize=101', 'GET', undefined, 400);
      await expected('driver', path + '/health-logs?page=1e100', 'GET', undefined, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'invalid' }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived', vehicleTemperatureC: 22.01 }, 400);
      await expected('driver', path + '/start', 'POST', { actualTime: 'invalid' }, 400);
    });
    await t.test('coordinator action must match the milestone and rejected requests preserve state', async () => {
      for (const suffix of ['/start', `/legs/${road.insertId}/start`, '/checkin']) {
        await expected('coordinator', path + suffix, 'POST', { routeStopId: stops[0], action: 'arrived', reason: 'Attempt to bypass audited endpoint' }, 400);
      }
      for (const [milestoneId, action] of [
        [`leg-${road.insertId}-start`, 'arrive_leg'],
        [`leg-${road.insertId}-start`, 'complete_leg'],
        [`leg-${road.insertId}-end`, 'start_leg'],
        [`stop-${stops[0]}`, 'start_leg'],
      ]) {
        await expected('coordinator', path + '/coordinator-override', 'POST', { milestoneId, action, reason: 'Integration validation' }, 400);
      }
      const [[row]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [sid]);
      assert.equal(row.status, 'ready_to_depart');
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM trip_status_log WHERE shipment_id = ?', [sid]);
      assert.equal(Number(count.n), 0);
    });
    await t.test('concurrent starts serialize and create exactly one persisted event', async () => {
      const results = await Promise.all([request('driver', path + '/start', 'POST', {}), request('driver', path + '/start', 'POST', {})]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
      const [[row]] = await db.execute('SELECT status FROM shipment WHERE shipment_id = ?', [sid]); assert.equal(row.status, 'in_transit');
      const [[count]] = await db.execute("SELECT COUNT(*) AS n FROM trip_status_log WHERE shipment_id = ? AND milestone_type = 'leg_start'", [sid]); assert.equal(Number(count.n), 1);
    });
    await t.test('check-ins append to route_stop_update and enforce order and customs clearance', async () => {
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'arrived' }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'departed' }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived', actualTime: new Date(0).toISOString() }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived', actualTime: new Date(Date.now() + 3600000).toISOString() }, 400);
      const actualTime = new Date().toISOString();
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived', vehicleTemperatureC: 23, actualTime }, 201);
      const [[event]] = await db.execute('SELECT status, updated_by, event_time FROM route_stop_update WHERE route_stop_id = ?', [stops[0]]);
      assert.equal(event.status, 'arrived'); assert.equal(event.updated_by, ids.driver);
      assert.equal(new Date(event.event_time).toISOString(), actualTime);
      const customer = await expected('customer', path, 'GET', undefined, 200);
      assert.equal(customer.requestCode, `REQ-${String(sid).padStart(3, '0')}`);
      assert.equal(customer.checkIns.length, 1); assert.equal(customer.telemetry.vehicleTemperatureC, 23);
      assert.ok(customer.alerts.some(a => a.type === 'vehicle_temperature'));
      await expected('coordinator', path + '/coordinator-override', 'POST', {
        milestoneId: `stop-${stops[0]}`, action: 'depart_stop', reason: 'Driver requested coordinator assistance',
      }, 201);
      const [[override]] = await db.execute("SELECT notes, updated_by FROM route_stop_update WHERE route_stop_id = ? AND status = 'departed'", [stops[0]]);
      assert.equal(override.updated_by, ids.coordinator);
      assert.ok(override.notes.includes('Driver requested coordinator assistance'));
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[0], action: 'arrived' }, 400);
      await expected('driver', path + '/legs/' + road.insertId + '/complete', 'POST', {}, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'customs_cleared' }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'arrived' }, 201);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'departed' }, 400);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'customs_cleared' }, 201);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[1], action: 'departed' }, 201);
    });
    await t.test('health logs persist in canonical table; pagination, filtering, latest readings and privacy', async () => {
      const first = await expected('driver', path + '/health-logs', 'POST', health, 201);
      const [[row]] = await db.execute('SELECT * FROM horse_condition_log WHERE log_id = ?', [first.id]);
      assert.equal(Number(row.temperature_c), 38.5); assert.equal(row.recorded_by, ids.driver);
      const boundary = await expected('customer', path, 'GET', undefined, 200); assert.equal(boundary.alerts.length, 0);
      const fever = await expected('escort', path + '/health-logs', 'POST', { ...health, temperatureC: 38.6, vehicleTemperatureC: 22.1 }, 201);
      const alert = await expected('coordinator', path, 'GET', undefined, 200); assert.equal(alert.alerts.length, 2);
      await expected('driver', path + '/health-logs', 'POST', { ...health, horseId: horseIds[1], temperatureC: 39, vehicleTemperatureC: 22 }, 201);
      const newest = await expected('driver', path + '/health-logs', 'POST', { ...health, temperatureC: 38, vehicleTemperatureC: 22 }, 201);
      const page = await expected('customer', path + `/health-logs?page=1&pageSize=1&horseId=${horseIds[0]}`, 'GET', undefined, 200);
      assert.equal(page.total, 3); assert.equal(page.totalPages, 3); assert.equal(page.items[0].id, newest.id); assert.equal(page.items[0].notes, null);
      const page2 = await expected('coordinator', path + `/health-logs?page=2&pageSize=1&horseId=${horseIds[0]}`, 'GET', undefined, 200);
      assert.equal(page2.items[0].id, fever.id); assert.equal(page2.items[0].notes, health.notes);
      const current = await expected('customer', path, 'GET', undefined, 200);
      assert.equal(current.alerts.length, 1); assert.equal(current.alerts[0].horseId, horseIds[1]);
      assert.equal(current.telemetry.vehicleTemperatureC, 22);
      for (let i = 0; i < 11; i++) await expected('driver', path + '/health-logs', 'POST', { ...health, temperatureC: 38 }, 201);
      const many = await expected('customer', path, 'GET', undefined, 200);
      assert.equal(many.healthLogs.length, 10);
      assert.equal(many.latestHorseHealth.length, 2);
      assert.equal(many.latestHorseHealth.find(h => h.horseId === horseIds[1]).temperatureC, 39);
      assert.ok(many.latestHorseHealth.every(h => h.notes === null));
    });
    await t.test('telemetry alerts respect both vehicle limits and the fever boundary', async () => {
      for (const [vehicleTemperatureC, warned] of [[15.9, true], [16, false], [22, false], [22.1, true]]) {
        await expected('driver', path + '/health-logs', 'POST', { ...health, vehicleTemperatureC }, 201);
        const detail = await expected('customer', path, 'GET', undefined, 200);
        assert.equal(detail.telemetry.vehicleTemperatureC, vehicleTemperatureC);
        assert.equal(detail.alerts.some(alert => alert.type === 'vehicle_temperature'), warned);
      }
      for (const [temperatureC, warned] of [[38.5, false], [38.6, true]]) {
        await expected('escort', path + '/health-logs', 'POST', { ...health, temperatureC, vehicleTemperatureC: 22 }, 201);
        const detail = await expected('coordinator', path, 'GET', undefined, 200);
        assert.equal(detail.alerts.some(alert => alert.type === 'horse_fever' && alert.horseId === horseIds[0]), warned);
      }
    });
    await t.test('flight leg belongs to escort and completion cannot skip milestones', async () => {
      await expected('coordinator', path + '/complete', 'POST', {}, 400);
      await expected('driver', path + '/legs/' + road.insertId + '/complete', 'POST', {}, 201);
      await expected('driver', path + '/start', 'POST', {}, 403);
      await expected('escort', path + '/start', 'POST', {}, 201);
      await expected('driver', path + '/checkin', 'POST', { routeStopId: stops[2], action: 'arrived' }, 403);
      for (const action of ['arrived', 'customs_cleared', 'departed']) await expected('escort', path + '/checkin', 'POST', { routeStopId: stops[2], action }, 201);
      const result = await expected('escort', path + '/legs/' + flight.insertId + '/complete', 'POST', {}, 201);
      assert.equal(result.shipmentStatus, 'completed');
      await expected('escort', path + '/health-logs', 'POST', health, 400);
      assert.ok(result.milestones.every(m => m.status === 'COMPLETED'));
    });
  } finally {
    const remove = async (sql, values) => { if (values.length) await db.query(sql, [values]); };
    // Remove only this run's generated fixtures, including notifications to existing operations staff.
    await remove('DELETE FROM notification WHERE shipment_id IN (?)', shipmentIds);
    await remove('DELETE FROM trip_status_log WHERE shipment_id IN (?)', shipmentIds);
    await remove('DELETE hcl FROM horse_condition_log hcl JOIN shipment_horse sh ON sh.shipment_horse_id = hcl.shipment_horse_id WHERE sh.shipment_id IN (?)', shipmentIds);
    await remove('DELETE rsu FROM route_stop_update rsu JOIN route_stop rs ON rs.route_stop_id = rsu.route_stop_id WHERE rs.route_id IN (?)', routeIds);
    await remove('DELETE FROM route_stop WHERE route_id IN (?)', routeIds);
    await remove('DELETE FROM route_leg WHERE route_id IN (?)', routeIds);
    await remove('DELETE FROM route WHERE route_id IN (?)', routeIds);
    await remove('DELETE FROM shipment_assignment WHERE shipment_id IN (?)', shipmentIds);
    await remove('DELETE FROM shipment_horse WHERE shipment_id IN (?)', shipmentIds);
    await remove('DELETE FROM shipment WHERE shipment_id IN (?)', shipmentIds);
    await remove('DELETE FROM horse WHERE horse_id IN (?)', horseIds);
    await remove('DELETE FROM `user` WHERE user_id IN (?)', userIds);
    await db.end();
  }
});
