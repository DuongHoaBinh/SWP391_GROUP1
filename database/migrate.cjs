const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({
  path: path.join(__dirname, '../backend/.env'),
  quiet: true,
});

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'horse_transport_system',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [appliedRows] = await db.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
      if (sql) {
        await db.query(sql);
      }
      await db.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      console.log(`Applied migration: ${file}`);
      count += 1;
    }

    if (count === 0) {
      console.log('All database migrations are already up to date.');
    } else {
      console.log(`Successfully applied ${count} migration(s).`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Migration runner failed:', error.message);
  process.exitCode = 1;
});
