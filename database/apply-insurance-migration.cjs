const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root', password: process.env.DB_PASSWORD ?? '' });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations/017_equine_insurance.sql'), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.query(statement);
    console.log('Equine insurance migration 017 applied. Historical orders keep basic insurance and their original total.');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
