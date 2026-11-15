const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root', password: process.env.DB_PASSWORD ?? '', multipleStatements: true });
  try {
    await db.query(fs.readFileSync(path.join(__dirname, 'migrations/021_ensure_transportation_type.sql'), 'utf8'));
    console.log('Transportation scope migration 021 applied. Existing orders and scope values are unchanged.');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
