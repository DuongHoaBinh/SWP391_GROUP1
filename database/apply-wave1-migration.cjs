const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function ensureColumn(db, tableName, columnName, definitionSql) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (Number(rows[0]?.cnt || 0) === 0) {
    await db.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    console.log(`  + Added column ${tableName}.${columnName}`);
  } else {
    console.log(`  = Column ${tableName}.${columnName} already exists`);
  }
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'horse_transport_system',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
  });

  try {
    console.log('Applying Wave 1 Migration 025 (G1 Reports & G2 Multi-Dimensional Compliance)...');

    // 1. Extend shipment for G1 OTD (excused_delay) & G2 Runtime Expiry (in_transit_compliance_alert)
    await ensureColumn(db, 'shipment', 'excused_delay', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'shipment', 'excused_delay_reason', 'TEXT NULL');
    await ensureColumn(db, 'shipment', 'excused_delay_confirmed_by', 'INT NULL');
    await ensureColumn(db, 'shipment', 'excused_delay_confirmed_at', 'DATETIME NULL');
    await ensureColumn(db, 'shipment', 'in_transit_compliance_alert', 'BOOLEAN NOT NULL DEFAULT FALSE');

    // 2. Create shipment_operating_cost table for G1 Real Profit & Operating Cost tracking
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipment_operating_cost (
        cost_id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        route_leg_id INT NULL,
        cost_category ENUM(
          'fuel',
          'toll_border',
          'airline_freight',
          'quarantine_fee',
          'staff_allowance',
          'incident_absorbed',
          'disbursement_absorbed_on_company_fault'
        ) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        receipt_url VARCHAR(500) NULL,
        notes TEXT NULL,
        recorded_by INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_soc_shipment (shipment_id),
        INDEX idx_soc_category (cost_category),
        CONSTRAINT fk_soc_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
        CONSTRAINT fk_soc_recorded_by FOREIGN KEY (recorded_by) REFERENCES \`user\`(user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + Verified table shipment_operating_cost');

    // 3. Extend regulation for G2 multi-dimensional matching, lead time, and 2-tier authority gating
    await ensureColumn(db, 'regulation', 'border_gate', 'VARCHAR(100) NULL');
    await ensureColumn(db, 'regulation', 'transport_mode', "ENUM('road','air','both') NOT NULL DEFAULT 'both'");
    await ensureColumn(db, 'regulation', 'doc_tier', "ENUM('A','B') NOT NULL DEFAULT 'A'");
    await ensureColumn(db, 'regulation', 'lead_time_days', 'INT NOT NULL DEFAULT 2');
    await ensureColumn(db, 'regulation', 'requires_authority_approval', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'regulation', 'min_validity_buffer_hours', 'INT NOT NULL DEFAULT 24');

    // 4. Backfill regulation metadata per DEC-03 defaults
    await db.execute(`
      UPDATE regulation
      SET doc_tier = 'B',
          lead_time_days = 1,
          min_validity_buffer_hours = CASE WHEN LOWER(country) = 'vietnam' THEN 24 ELSE 48 END
      WHERE LOWER(document_type) = 'health_certificate'
    `);

    await db.execute(`
      UPDATE regulation
      SET doc_tier = 'A',
          requires_authority_approval = TRUE,
          lead_time_days = 3,
          min_validity_buffer_hours = 48
      WHERE LOWER(document_type) IN ('import_permit', 'export_permit', 'quarantine_certificate', 'customs_declaration')
        AND LOWER(country) <> 'vietnam'
    `);

    await db.execute(`
      UPDATE regulation
      SET requires_authority_approval = FALSE,
          min_validity_buffer_hours = 24,
          lead_time_days = CASE WHEN doc_tier = 'B' THEN 1 ELSE 0 END
      WHERE LOWER(country) = 'vietnam'
    `);

    await db.execute(`
      UPDATE regulation
      SET lead_time_days = 1
      WHERE LOWER(country) <> 'vietnam'
        AND doc_tier = 'A'
        AND LOWER(document_type) NOT IN ('import_permit', 'export_permit', 'quarantine_certificate', 'customs_declaration')
        AND lead_time_days > 3
    `);

    await db.execute(`
      UPDATE regulation
      SET min_validity_buffer_hours = 48
      WHERE LOWER(country) <> 'vietnam'
        AND min_validity_buffer_hours < 48
    `);

    console.log('Wave 1 migration 025 applied cleanly.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Migration 025 failed:', error.message);
  process.exitCode = 1;
});
