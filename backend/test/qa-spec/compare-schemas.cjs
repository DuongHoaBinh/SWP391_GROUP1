const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('../../node_modules/dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mysql = require('../../node_modules/mysql2/promise');
const {
  TEST_DB_NAME,
  dropTestDatabase,
  resetTestDatabase,
} = require('./test-db-harness.cjs');

const SCHEMA_ONLY_DB = 'horse_transport_schema_only_check';
assert.notEqual(SCHEMA_ONLY_DB, 'horse_transport_system', 'CRITICAL GUARD: must never touch developer DB');
assert.notEqual(TEST_DB_NAME, 'horse_transport_system', 'CRITICAL GUARD: must never touch developer DB');

const REPO_ROOT = path.resolve(__dirname, '../../..');

async function getDbMetadata(conn, dbName) {
  const [tables] = await conn.execute(
    `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [dbName],
  );
  const [columns] = await conn.execute(
    `SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [dbName],
  );
  const [indexes] = await conn.execute(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ?
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
     ORDER BY TABLE_NAME, INDEX_NAME`,
    [dbName],
  );
  return { tables, columns, indexes };
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '123456',
    multipleStatements: true,
  });

  try {
    // 1. Build Harness DB (horse_transport_test)
    await resetTestDatabase();

    // 2. Build Clean Schema-Only DB directly from database/schema.mysql.sql
    await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA_ONLY_DB}\``);
    await conn.query(`CREATE DATABASE \`${SCHEMA_ONLY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${SCHEMA_ONLY_DB}\``);
    const rawSchema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.mysql.sql'), 'utf8');
    await conn.query(rawSchema.replace(/horse_transport_system/gi, SCHEMA_ONLY_DB));

    const harnessMeta = await getDbMetadata(conn, TEST_DB_NAME);
    const schemaMeta = await getDbMetadata(conn, SCHEMA_ONLY_DB);

    const hTables = harnessMeta.tables.map((t) => t.TABLE_NAME);
    const sTables = schemaMeta.tables.map((t) => t.TABLE_NAME);

    assert.equal(sTables.length, 62, `Expected 62 tables in schema.mysql.sql, got ${sTables.length}`);
    assert.deepEqual(hTables, sTables, 'Harness DB table list must match schema.mysql.sql 100%');

    const mapCols = (cols) => new Map(cols.map((c) => [`${c.TABLE_NAME}.${c.COLUMN_NAME}`, c]));
    const hCols = mapCols(harnessMeta.columns);
    const sCols = mapCols(schemaMeta.columns);

    const onlyHarnessCols = [...hCols.keys()].filter((k) => !sCols.has(k));
    const onlySchemaCols = [...sCols.keys()].filter((k) => !hCols.has(k));
    assert.deepEqual(onlyHarnessCols, [], `Columns only in Harness DB: ${onlyHarnessCols.join(', ')}`);
    assert.deepEqual(onlySchemaCols, [], `Columns only in schema.mysql.sql: ${onlySchemaCols.join(', ')}`);

    for (const [key, hc] of hCols.entries()) {
      const sc = sCols.get(key);
      assert.equal(hc.COLUMN_TYPE, sc.COLUMN_TYPE, `${key} COLUMN_TYPE mismatch`);
      assert.equal(hc.IS_NULLABLE, sc.IS_NULLABLE, `${key} IS_NULLABLE mismatch`);
      assert.equal(String(hc.COLUMN_DEFAULT), String(sc.COLUMN_DEFAULT), `${key} COLUMN_DEFAULT mismatch`);
      assert.equal(hc.EXTRA, sc.EXTRA, `${key} EXTRA mismatch`);
    }

    const mapIdx = (idxs) => new Map(idxs.map((i) => [`${i.TABLE_NAME}.${i.INDEX_NAME}`, i]));
    const hIdx = mapIdx(harnessMeta.indexes);
    const sIdx = mapIdx(schemaMeta.indexes);
    assert.deepEqual([...hIdx.keys()].sort(), [...sIdx.keys()].sort(), 'Index list mismatch');
    for (const [key, hi] of hIdx.entries()) {
      const si = sIdx.get(key);
      assert.equal(hi.NON_UNIQUE, si.NON_UNIQUE, `${key} NON_UNIQUE mismatch`);
      assert.equal(hi.cols, si.cols, `${key} indexed columns mismatch`);
    }

    // Critical canonical schema assertions
    assert.equal(
      sCols.get('horse.status')?.COLUMN_TYPE,
      "enum('active','in_transit','retired','deceased')",
      'horse.status must exclude legacy delivered value',
    );
    assert.ok(
      String(sCols.get('shipment.status')?.COLUMN_TYPE || '').includes("'cancelled_operational'"),
      'shipment.status must include cancelled_operational',
    );
    assert.ok(sIdx.has('shipment_invoice.uq_active_primary_invoice_route'));
    assert.equal(sIdx.has('shipment_invoice.uq_invoice_route'), false);
    assert.ok(sIdx.has('shipment_sepay_payment.uq_sepay_active_shipment_invoice'));
    assert.equal(sIdx.has('shipment_sepay_payment.uq_sepay_shipment'), false);

    console.log(
      `[schema-parity] PASS: ${sTables.length} tables, ${sCols.size} columns, ${sIdx.size} indexes match 100% between harness DB and database/schema.mysql.sql.`,
    );
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA_ONLY_DB}\``);
    await conn.end();
    await dropTestDatabase();
  }
}

main().catch((err) => {
  console.error('[schema-parity] FAIL:', err);
  process.exit(1);
});
