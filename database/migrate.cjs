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
    const dbName = process.env.DB_NAME ?? 'horse_transport_system';
    try {
      await db.query(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (_) {}
    await db.query(`SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`);
    try {
      await db.query(`SET collation_connection = 'utf8mb4_unicode_ci'`);
    } catch (_) {}

    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Fix potential collation mismatch on tables created in partial migrations
    try {
      await db.query(`ALTER TABLE document_type CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (_) {}
    try {
      await db.query(`ALTER TABLE transport_document MODIFY COLUMN document_type_code VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL`);
    } catch (_) {}

    const [appliedRows] = await db.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // Baseline auto-detection: if schema_migrations is empty but the database already has base columns (e.g. password_hash in otp_verification)
    if (applied.size === 0) {
      const [checkRows] = await db.query(`
        SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verification' AND COLUMN_NAME = 'password_hash'
      `);
      if (checkRows[0]?.cnt > 0) {
        console.log('Detecting existing database baseline. Marking pre-existing migrations (001-027) as applied...');
        const baselineFiles = files.filter((f) => {
          const num = parseInt(f.slice(0, 3), 10);
          return !isNaN(num) && num <= 27;
        });
        for (const bFile of baselineFiles) {
          await db.execute('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [bFile]);
          applied.add(bFile);
        }
      }
    }

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
      if (sql) {
        try {
          await db.query(sql);
        } catch (err) {
          // If column or table or key already exists, treat as idempotent and continue
          if (err.errno === 1060 || err.errno === 1050 || err.errno === 1061) {
            console.warn(`[Notice] ${file}: schema element already exists (${err.sqlMessage}). Continuing...`);
          } else {
            throw err;
          }
        }
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
