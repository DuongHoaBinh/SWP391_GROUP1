const { execFileSync, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const assert = require('node:assert/strict');

// Disposable MySQL container: never reads or migrates the developer's database.
async function main() {
  const root = path.resolve(__dirname, '../..');
  const name = `swp-payment-test-${randomBytes(6).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  let server, db;
  try {
    execFileSync('docker', ['run', '-d', '--name', name, '-e', 'MYSQL_ROOT_PASSWORD', '-p', '127.0.0.1::3306', 'mysql:8.0'], {
      env: { ...process.env, MYSQL_ROOT_PASSWORD: password }, stdio: 'pipe', timeout: 120000,
    });
    const port = Number(execFileSync('docker', ['inspect', '--format', '{{(index (index .NetworkSettings.Ports "3306/tcp") 0).HostPort}}', name], { encoding: 'utf8', timeout: 15000 }).trim());
    for (let attempt = 0; attempt < 90; attempt++) {
      try { db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password, multipleStatements: true }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!db) throw new Error('Disposable MySQL did not become ready');
    await db.query(fs.readFileSync(path.join(root, 'database/schema.mysql.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/006_add_horse_quantity.sql'), 'utf8'));
    const [legacyUser] = await db.execute("INSERT INTO `user` (role_id, full_name, email, password_hash) SELECT role_id, 'Migration fixture', 'migration-fixture@example.test', 'unusable-test-only' FROM role WHERE role_name = 'Customer'");
    const [legacyHorse] = await db.execute("INSERT INTO horse (owner_id, name, quantity) VALUES (?, 'Legacy horse', 3)", [legacyUser.insertId]);
    const [legacyShipment] = await db.execute("INSERT INTO shipment (customer_id, requested_by, contact_phone, contact_email, origin_location, destination_location, requested_horse_count, status, total_cost) VALUES (?, ?, '0900000000', 'migration-fixture@example.test', 'A', 'B', 3, 'approved', 1234567)", [legacyUser.insertId, legacyUser.insertId]);
    await db.execute('INSERT INTO shipment_horse (shipment_id, horse_id, quantity) VALUES (?, ?, 3)', [legacyShipment.insertId, legacyHorse.insertId]);
    // Simulate upgrading an older export, so migrations must supply real application columns.
    await db.query('DROP TABLE shipment_insurance_revision');
    await db.query('DROP TABLE shipment_booking_revision');
    await db.query('ALTER TABLE shipment DROP COLUMN booking_type, DROP COLUMN stall_unit_price');
    await db.query('ALTER TABLE shipment DROP COLUMN transport_mode');
    await db.query('ALTER TABLE shipment DROP COLUMN transport_cost, DROP COLUMN insurance_fee');
    await db.query('ALTER TABLE shipment_horse DROP COLUMN declared_value, DROP COLUMN declared_currency, DROP COLUMN exchange_rate, DROP COLUMN declared_value_vnd, DROP COLUMN insurance_package, DROP COLUMN insurance_fee, DROP COLUMN max_compensation, DROP COLUMN emergency_vet_covered, DROP COLUMN insurance_policy_version');
    await db.query('ALTER TABLE horse DROP COLUMN color, DROP COLUMN weight, DROP COLUMN medical_status, DROP COLUMN special_requirements');
    for (const file of fs.readdirSync(path.join(root, 'database/migrations')).sort()) {
      // Base schema contains 001-005; 006 is applied above to seed legacy quantities.
      if (!file.endsWith('.sql') || /^00[1-6]_/.test(file)) continue;
      await db.query(fs.readFileSync(path.join(root, 'database/migrations', file), 'utf8'));
      if (file === '015_add_shipment_transportation_type.sql') await db.execute("UPDATE shipment SET transportation_type = 'International' WHERE shipment_id = ?", [legacyShipment.insertId]);
    }
    const [legacyRoute] = await db.execute("INSERT INTO route (shipment_id, route_name, plan_status) VALUES (?, 'Historical route', 'draft')", [legacyShipment.insertId]);
    const [legacyLeg] = await db.execute("INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location) VALUES (?, 1, 'road', 'Historical A', 'Historical B')", [legacyRoute.insertId]);
    await db.query('ALTER TABLE route_leg DROP FOREIGN KEY fk_route_leg_road_trip, DROP INDEX idx_route_leg_road_trip, DROP COLUMN road_trip_id');
    await db.query('DROP TABLE road_trip');
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/017_equine_insurance.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/018_booking_type.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/019_road_trip_capacity.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/020_separate_transport_mode.sql'), 'utf8'));
    const [[historical]] = await db.execute('SELECT * FROM shipment WHERE shipment_id = ?', [legacyShipment.insertId]);
    const [[historicalHorse]] = await db.execute('SELECT * FROM shipment_horse WHERE shipment_id = ?', [legacyShipment.insertId]);
    assert.equal(Number(historical.total_cost), 1234567); assert.equal(Number(historical.transport_cost), 1234567);
    assert.equal(Number(historical.insurance_fee), 0); assert.equal(historical.booking_type, 'shared_stall');
    assert.equal(Number(historicalHorse.quantity), 3); assert.equal(historicalHorse.insurance_package, 'basic');
    assert.equal(Number(historicalHorse.insurance_fee), 0);
    assert.equal(historical.transport_mode, null);
    assert.equal(historical.transportation_type, 'International');
    const [[preservedLeg]] = await db.execute('SELECT * FROM route_leg WHERE leg_id = ?', [legacyLeg.insertId]);
    assert.equal(preservedLeg.origin_location, 'Historical A'); assert.equal(preservedLeg.road_trip_id, null); assert.equal(Number(preservedLeg.stalls_booked), 0);
    console.log('PASS: fresh schema, legacy upgrade, repeated migrations 017/018/019/020 preserve historical totals and quantities.');
    const env = { ...process.env, NODE_ENV: 'test', PAYMENT_GATE_ISOLATED: '1', PORT: '5012', DB_HOST: '127.0.0.1', DB_PORT: String(port),
      DB_USER: 'root', DB_PASSWORD: password, DB_NAME: 'horse_transport_system', JWT_SECRET: randomBytes(32).toString('hex'),
      AUTH_INTERNAL_USERS_JSON: '', INSURANCE_USD_TO_VND: '25000', SMTP_REQUIRED: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', SEPAY_ENABLED: 'true', SEPAY_BANK_CODE: 'MBBank',
      SEPAY_ACCOUNT_NUMBER: '0123456789', SEPAY_ACCOUNT_NAME: 'TEST ONLY', SEPAY_PAYMENT_PREFIX: 'DH', SEPAY_CODE_LENGTH: '8',
      SEPAY_WEBHOOK_SECRET: randomBytes(32).toString('hex'), MOMO_SANDBOX_ENABLED: 'true', MOMO_ENDPOINT: 'https://test-payment.momo.vn/v2/gateway/api/create',
      MOMO_PARTNER_CODE: 'TEST', MOMO_ACCESS_KEY: randomBytes(16).toString('hex'), MOMO_SECRET_KEY: randomBytes(32).toString('hex') };
    server = spawn(process.execPath, ['dist/main.js'], { cwd: path.join(root, 'backend'), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let startup = '';
    server.stdout.on('data', data => { startup += data; }); server.stderr.on('data', data => { startup += data; });
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      try { const res = await fetch('http://127.0.0.1:5012/api/payments/sepay/webhook'); if (res.ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Test API did not start: ${startup}`);
    console.log('Disposable MySQL + Nest API ready. Running payment regression tests.');
    const test = spawn(process.execPath, ['--test', 'test/sepay.integration.cjs', 'test/payment-gating.test.cjs', 'test/insurance-policy.test.cjs', 'test/insurance.integration.cjs', 'test/booking-policy.test.cjs', 'test/booking.integration.cjs', 'test/controlled-fixes.test.cjs', 'test/road-trips-policy.test.cjs', 'test/road-trips.integration.cjs'], { cwd: path.join(root, 'backend'), env, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { test.on('error', reject); test.on('exit', resolve); });
    if (code) throw new Error(`Payment tests failed (${code}). API diagnostics:\n${startup.slice(-14000)}`);
  } finally {
    if (server) { server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)); }
    if (db) await db.end();
    try { execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'pipe', timeout: 15000 }); }
    catch { console.error(`Cleanup could not verify removal of test container ${name}; original failure is preserved.`); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
