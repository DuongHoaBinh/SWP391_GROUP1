// Repairs missing baseline columns on a fresh local DB before exercising order UI.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true });
  const has = async (table, column) => {
    const [[row]] = await db.execute('SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [table, column]);
    return Number(row.count) > 0;
  };
  try {
    // SQL identifiers and definitions below are fixed project schema, never input.
    for (const [table, column, definition] of [
      ['horse', 'color', 'VARCHAR(100) NULL'], ['horse', 'weight', 'VARCHAR(100) NULL'],
      ['horse', 'medical_status', 'VARCHAR(255) NULL'], ['horse', 'special_requirements', 'TEXT NULL'],
      ['horse', 'photo_url', 'VARCHAR(500) NULL'], ['horse', 'quantity', 'INT NOT NULL DEFAULT 1'],
      ['shipment_horse', 'quantity', 'INT NOT NULL DEFAULT 1'],
    ]) if (!await has(table, column)) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    for (const [column, file] of [['assigned_coordinator_id', '010_create_flow3_fleet_route_planning_tables.sql'], ['specialization', '011_add_user_specialization.sql']]) {
      if (!await has(column === 'specialization' ? 'user' : 'route', column)) await db.query(fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8'));
    }
    console.log('Local order/route prerequisites are ready.');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
