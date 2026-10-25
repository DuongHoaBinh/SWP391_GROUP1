const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'horse_transport_system', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations/012_tracking_events_and_health.sql'), 'utf8');
    let delimiter = ';';
    let statement = '';
    for (const line of sql.split(/\r?\n/)) {
      if (/^DELIMITER /i.test(line)) { delimiter = line.slice(10).trim(); continue; }
      if (!line.trim() || line.trimStart().startsWith('--')) continue;
      statement += line + '\n';
      if (statement.trimEnd().endsWith(delimiter)) {
        await connection.query(statement.trimEnd().slice(0, -delimiter.length));
        statement = '';
      }
    }
    console.log('Tracking migration 012 applied. Existing events preserved.');
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
