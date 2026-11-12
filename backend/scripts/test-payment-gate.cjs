const { execFileSync, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

// Disposable MySQL container: never reads or migrates the developer's database.
async function main() {
  const root = path.resolve(__dirname, '../..');
  const name = `swp-payment-test-${randomBytes(6).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  let server, db;
  try {
    execFileSync('docker', ['run', '-d', '--name', name, '-e', 'MYSQL_ROOT_PASSWORD', '-p', '127.0.0.1::3306', 'mysql:8.0'], {
      env: { ...process.env, MYSQL_ROOT_PASSWORD: password }, stdio: 'pipe',
    });
    const port = Number(execFileSync('docker', ['inspect', '--format', '{{(index (index .NetworkSettings.Ports "3306/tcp") 0).HostPort}}', name], { encoding: 'utf8' }).trim());
    for (let attempt = 0; attempt < 90; attempt++) {
      try { db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password, multipleStatements: true }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!db) throw new Error('Disposable MySQL did not become ready');
    await db.query(fs.readFileSync(path.join(root, 'database/schema.mysql.sql'), 'utf8'));
    // Simulate upgrading an older export, so migrations must supply real application columns.
    await db.query('DROP TABLE shipment_insurance_revision');
    await db.query('ALTER TABLE shipment DROP COLUMN transport_cost, DROP COLUMN insurance_fee');
    await db.query('ALTER TABLE shipment_horse DROP COLUMN declared_value, DROP COLUMN declared_currency, DROP COLUMN exchange_rate, DROP COLUMN declared_value_vnd, DROP COLUMN insurance_package, DROP COLUMN insurance_fee, DROP COLUMN max_compensation, DROP COLUMN emergency_vet_covered, DROP COLUMN insurance_policy_version');
    await db.query('ALTER TABLE horse DROP COLUMN color, DROP COLUMN weight, DROP COLUMN medical_status, DROP COLUMN special_requirements');
    for (const file of fs.readdirSync(path.join(root, 'database/migrations')).sort()) {
      // The current base schema already includes columns from migrations 001-005.
      if (!file.endsWith('.sql') || /^00[1-5]_/.test(file)) continue;
      await db.query(fs.readFileSync(path.join(root, 'database/migrations', file), 'utf8'));
    }
    await db.query(fs.readFileSync(path.join(root, 'database/migrations/017_equine_insurance.sql'), 'utf8'));
    const env = { ...process.env, NODE_ENV: 'test', PAYMENT_GATE_ISOLATED: '1', PORT: '5012', DB_HOST: '127.0.0.1', DB_PORT: String(port),
      DB_USER: 'root', DB_PASSWORD: password, DB_NAME: 'horse_transport_system', JWT_SECRET: randomBytes(32).toString('hex'),
      AUTH_INTERNAL_USERS_JSON: '', INSURANCE_USD_TO_VND: '25000', SMTP_REQUIRED: 'false', SEPAY_ENABLED: 'true', SEPAY_BANK_CODE: 'MBBank',
      SEPAY_ACCOUNT_NUMBER: '0123456789', SEPAY_ACCOUNT_NAME: 'TEST ONLY', SEPAY_PAYMENT_PREFIX: 'DH', SEPAY_CODE_LENGTH: '8',
      SEPAY_WEBHOOK_SECRET: randomBytes(32).toString('hex'), MOMO_SANDBOX_ENABLED: 'false' };
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
    const test = spawn(process.execPath, ['--test', 'test/sepay.integration.cjs', 'test/payment-gating.test.cjs', 'test/insurance-policy.test.cjs', 'test/insurance.integration.cjs'], { cwd: path.join(root, 'backend'), env, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { test.on('error', reject); test.on('exit', resolve); });
    if (code) throw new Error(`Payment tests failed (${code}). API diagnostics:\n${startup.slice(-14000)}`);
  } finally {
    if (server) { server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)); }
    if (db) await db.end();
    execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'pipe' });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
