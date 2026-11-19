const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const mysql = require('../../node_modules/mysql2/promise');
const bcrypt = require('../../node_modules/bcryptjs');

const TEST_DB_NAME = 'horse_transport_test';
assert.notEqual(TEST_DB_NAME, 'horse_transport_system', 'CRITICAL GUARD: tests must never touch developer DB');

const TEST_PORT = Number(process.env.QA_TEST_PORT || 5055);
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;

const DB_CONN_BASE = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  multipleStatements: true,
};

const SEPAY_SECRET = 'qa-test-sepay-secret-1234567890-abcdef';
const SEPAY_BANK_CODE = 'MB';
const SEPAY_ACCOUNT_NUMBER = '0123456789';
const SEPAY_ACCOUNT_NAME = 'EQUITRANSIT QA';
const SEPAY_PREFIX = 'DH';
const SEPAY_CODE_LENGTH = 8;

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.resolve(__dirname, '../..');

async function openRootConnection(database = undefined) {
  return mysql.createConnection({
    ...DB_CONN_BASE,
    ...(database ? { database } : {}),
  });
}

async function openTestDbConnection() {
  assert.notEqual(TEST_DB_NAME, 'horse_transport_system');
  const db = await openRootConnection(TEST_DB_NAME);
  const [[row]] = await db.query('SELECT DATABASE() AS dbName');
  assert.equal(row.dbName, TEST_DB_NAME);
  return db;
}

async function resetTestDatabase() {
  assert.notEqual(TEST_DB_NAME, 'horse_transport_system');
  const rootConn = await openRootConnection();
  try {
    await rootConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    await rootConn.query(
      `CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await rootConn.end();
  }

  const db = await openTestDbConnection();
  try {
    const rawSchema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.mysql.sql'), 'utf8');
    const isolatedSchema = rawSchema.replace(/horse_transport_system/gi, TEST_DB_NAME);
    await db.query(isolatedSchema);

    // Verify we are strictly in horse_transport_test
    const [[dbCheck]] = await db.query('SELECT DATABASE() AS dbName');
    assert.equal(dbCheck.dbName, TEST_DB_NAME);

    // Guarantee clean deterministic non-catalog baseline
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tbl of ['regulation', 'horse', 'vehicle', 'shipment', '`user`']) {
      await db.query(`DELETE FROM ${tbl}`);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    // Look up role IDs dynamically
    const [roleRows] = await db.query('SELECT role_id, role_name FROM `role`');
    const roleMap = Object.fromEntries(roleRows.map((r) => [r.role_name, Number(r.role_id)]));
    for (const reqRole of [
      'Customer',
      'Logistics Manager',
      'Transport Specialist',
      'Fleet & Route Coordinator',
      'Vehicle Driver / Escort',
      'Admin',
    ]) {
      assert.ok(roleMap[reqRole], `Role "${reqRole}" must exist in role table`);
    }

    const passwordHash = bcrypt.hashSync('Password123', 4);
    const seedUsers = [
      ['admin.qa@test.local', 'Admin QA', 'Admin', null, 'active'],
      ['manager.a@test.local', 'Manager A QA', 'Logistics Manager', null, 'active'],
      ['manager.b@test.local', 'Manager B QA', 'Logistics Manager', null, 'active'],
      ['specialist.qa@test.local', 'Specialist QA', 'Transport Specialist', null, 'active'],
      ['coordinator.qa@test.local', 'Coordinator QA', 'Fleet & Route Coordinator', null, 'active'],
      ['driver1.qa@test.local', 'Driver 1 QA', 'Vehicle Driver / Escort', 'driver', 'active'],
      ['escort1.qa@test.local', 'Escort 1 QA', 'Vehicle Driver / Escort', 'escort', 'active'],
      ['driver2.qa@test.local', 'Driver 2 QA', 'Vehicle Driver / Escort', 'driver', 'active'],
      ['cust.a@test.local', 'Customer A QA', 'Customer', null, 'active'],
      ['cust.b@test.local', 'Customer B QA', 'Customer', null, 'active'],
      ['inactive.qa@test.local', 'Inactive User QA', 'Customer', null, 'inactive'],
    ];

    const users = {};
    for (const [email, fullName, roleName, specialization, status] of seedUsers) {
      const [ins] = await db.execute(
        `INSERT INTO \`user\` (role_id, specialization, full_name, email, phone, password_hash, email_verified, status)
         VALUES (?, ?, ?, ?, '0900000001', ?, TRUE, ?)`,
        [roleMap[roleName], specialization, fullName, email, passwordHash, status],
      );
      users[email] = { id: Number(ins.insertId), email, roleName, specialization, status };
    }

    // Horses owned by Customer A and Customer B
    const [hA1] = await db.execute(
      `INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no, status)
       VALUES (?, 'Thunder QA', 'Thoroughbred', 'male', 5, '985QA0001', 'FEI-QA-001', 'active')`,
      [users['cust.a@test.local'].id],
    );
    const [hA2] = await db.execute(
      `INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no, status)
       VALUES (?, 'Comet QA', 'Warmblood', 'gelding', 6, '985QA0002', 'FEI-QA-002', 'active')`,
      [users['cust.a@test.local'].id],
    );
    const [hB1] = await db.execute(
      `INSERT INTO horse (owner_id, name, breed, gender, age, microchip_no, passport_no, status)
       VALUES (?, 'Shadow QA', 'Arabian', 'female', 4, '985QA0003', 'FEI-QA-003', 'active')`,
      [users['cust.b@test.local'].id],
    );

    const horses = {
      thunder: Number(hA1.insertId),
      comet: Number(hA2.insertId),
      shadow: Number(hB1.insertId),
    };

    // Vehicles with varying capacities
    const [v4a] = await db.execute(
      `INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status) VALUES ('truck', 'QA-TRK-4A', 4, 'available')`,
    );
    const [v2a] = await db.execute(
      `INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status) VALUES ('truck', 'QA-TRK-2A', 2, 'available')`,
    );
    const [v4b] = await db.execute(
      `INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status) VALUES ('truck', 'QA-TRK-4B', 4, 'available')`,
    );
    const vehicles = {
      trk4a: Number(v4a.insertId),
      trk2a: Number(v2a.insertId),
      trk4b: Number(v4b.insertId),
    };

    // Airports & airlines baseline (ignore if 010 already seeded them)
    await db.execute(
      `INSERT IGNORE INTO airline (code, name, is_active) VALUES ('SQ', 'Singapore Airlines Cargo', TRUE)`,
    );
    await db.execute(
      `INSERT IGNORE INTO airport (iata_code, name, city, country, has_quarantine_facility, has_equine_cargo_ramp)
       VALUES ('SGN', 'Tan Son Nhat International Airport', 'Ho Chi Minh City', 'Vietnam', TRUE, TRUE),
              ('SIN', 'Singapore Changi Airport', 'Singapore', 'Singapore', TRUE, TRUE)`,
    );
    const [[sqRow]] = await db.execute(`SELECT airline_id FROM airline WHERE code = 'SQ' LIMIT 1`);
    const [[sgnRow]] = await db.execute(`SELECT airport_id FROM airport WHERE iata_code = 'SGN' LIMIT 1`);
    const [[sinRow]] = await db.execute(`SELECT airport_id FROM airport WHERE iata_code = 'SIN' LIMIT 1`);
    const airlines = { sq: Number(sqRow.airline_id) };
    const airports = { sgn: Number(sgnRow.airport_id), sin: Number(sinRow.airport_id) };

    // Deterministic regulations for 3 corridors (Vietnam domestic, Singapore 14d/2-tier, Japan 21d)
    const regs = {};
    const insertReg = async (key, params) => {
      const [res] = await db.execute(
        `INSERT INTO regulation
         (country, border_gate, transport_mode, doc_tier, lead_time_days, requires_authority_approval, min_validity_buffer_hours, document_type, description, effective_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-01-01')`,
        params,
      );
      regs[key] = Number(res.insertId);
    };
    await insertReg('vnPassport', ['Vietnam', null, 'both', 'A', 5, false, 24, 'horse_passport', 'VN Horse Passport']);
    await insertReg('vnHealth', ['Vietnam', null, 'both', 'B', 1, false, 24, 'health_certificate', 'VN Domestic Vet Cert']);
    await insertReg('sgImportPermit', ['Singapore', 'SIN', 'air', 'A', 14, true, 48, 'import_permit', 'Singapore AVS Import Permit']);
    await insertReg('sgHealth', ['Singapore', null, 'both', 'B', 1, false, 48, 'health_certificate', 'Singapore Vet Health Cert']);
    await insertReg('jpImportPermit', ['Japan', null, 'air', 'A', 21, true, 48, 'import_permit', 'Japan MAFF Import Permit']);

    // Ensure active DEC-06 vital config
    await db.execute('DELETE FROM equine_vital_config');
    await db.execute(
      `INSERT INTO equine_vital_config
       (config_name, is_active, temp_green_min, temp_green_max, temp_amber_low_min, temp_amber_high_max,
        hr_green_min, hr_green_max, hr_amber_low_min, hr_amber_high_max, consecutive_alert_window_hours,
        escalatable_conditions, observational_conditions, calibrated_by)
       VALUES ('QA DEC-06 Standard', TRUE, 37.50, 38.50, 37.00, 39.30, 28, 44, 24, 60, 6,
               '["not_eating","stressed"]', '["climate_change","other"]', 'QA Seed')`,
    );

    return { users, horses, vehicles, airlines, airports, regs, dbName: TEST_DB_NAME };
  } finally {
    await db.end();
  }
}

async function dropTestDatabase() {
  assert.notEqual(TEST_DB_NAME, 'horse_transport_system');
  const rootConn = await openRootConnection();
  try {
    await rootConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
  } finally {
    await rootConn.end();
  }
}

async function startTestServer(extraEnv = {}) {
  assert.notEqual(TEST_DB_NAME, 'horse_transport_system');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(TEST_PORT),
    DB_HOST: DB_CONN_BASE.host,
    DB_PORT: String(DB_CONN_BASE.port),
    DB_USER: DB_CONN_BASE.user,
    DB_PASSWORD: DB_CONN_BASE.password,
    DB_NAME: TEST_DB_NAME,
    JWT_SECRET: 'qa-test-jwt-secret-must-be-at-least-32-chars',
    INSURANCE_USD_TO_VND: '25000',
    SEPAY_ENABLED: 'true',
    SEPAY_BANK_CODE: SEPAY_BANK_CODE,
    SEPAY_ACCOUNT_NUMBER: SEPAY_ACCOUNT_NUMBER,
    SEPAY_ACCOUNT_NAME: SEPAY_ACCOUNT_NAME,
    SEPAY_PAYMENT_PREFIX: SEPAY_PREFIX,
    SEPAY_CODE_LENGTH: String(SEPAY_CODE_LENGTH),
    SEPAY_WEBHOOK_SECRET: SEPAY_SECRET,
    MOMO_SANDBOX_ENABLED: 'true',
    MOMO_ENDPOINT: 'https://test-payment.momo.vn/v2/gateway/api/create',
    MOMO_PARTNER_CODE: 'TEST',
    MOMO_ACCESS_KEY: 'qa-momo-access-key-0123456789abcd',
    MOMO_SECRET_KEY: 'qa-momo-secret-key-0123456789abcdef',
    SMTP_REQUIRED: 'false',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    FRONTEND_ORIGIN: 'http://localhost:3001',
    ...extraEnv,
  };

  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: BACKEND_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  server.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const deadline = Date.now() + 25_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`QA test server exited prematurely (${server.exitCode}):\n${logs}`);
    }
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!ready) {
    try {
      server.kill('SIGKILL');
    } catch {}
    throw new Error(`QA test server failed readiness on ${API_BASE}/health:\n${logs}`);
  }

  return server;
}

async function stopTestServer(server) {
  if (!server) return;
  if (server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        server.kill('SIGKILL');
      } catch {}
      resolve();
    }, 3000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      server.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function api(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

async function login(email, password = 'Password123') {
  const res = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok || !res.body?.accessToken) {
    throw new Error(`QA login failed for ${email}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

function makeSepaySignature(payload, { timestampSec, secret = SEPAY_SECRET } = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const ts = String(timestampSec ?? Math.floor(Date.now() / 1000));
  const sig = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return { raw, ts, sig };
}

async function sendSepayWebhook(payload, { badSig = false, timestampSec, secret } = {}) {
  const { raw, ts, sig } = makeSepaySignature(payload, { timestampSec, secret });
  return fetch(`${API_BASE}/payments/sepay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SePay-Timestamp': ts,
      'X-SePay-Signature': badSig ? 'sha256=' + '0'.repeat(64) : sig,
    },
    body: raw,
  }).then(async (res) => ({
    status: res.status,
    ok: res.ok,
    body: await res.text().then((t) => {
      try {
        return t ? JSON.parse(t) : null;
      } catch {
        return t;
      }
    }),
  }));
}

module.exports = {
  TEST_DB_NAME,
  TEST_PORT,
  API_BASE,
  SEPAY_ACCOUNT_NUMBER,
  openTestDbConnection,
  resetTestDatabase,
  dropTestDatabase,
  startTestServer,
  stopTestServer,
  api,
  login,
  sendSepayWebhook,
};
