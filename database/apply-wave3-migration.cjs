const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });

async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.execute(
    `SELECT COLUMN_TYPE, EXTRA
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return rows[0] || null;
}

async function ensureColumn(db, tableName, columnName, definitionSql) {
  const existing = await hasColumn(db, tableName, columnName);
  if (!existing) {
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
    console.log('Applying Wave 3 Migration 027 (Flow 5 Incidents/Change Requests & Flow 6 Handover)...');

    // 1. incident_report extensions
    await ensureColumn(db, 'incident_report', 'location_text', 'VARCHAR(255) NULL');
    await ensureColumn(db, 'incident_report', 'immediate_actions', 'TEXT NULL');
    await ensureColumn(db, 'incident_report', 'resolution_notes', 'TEXT NULL');
    await ensureColumn(db, 'incident_report', 'resolved_by', 'INT NULL');
    await ensureColumn(db, 'incident_report', 'affected_border_gate', 'VARCHAR(150) NULL');
    await ensureColumn(db, 'incident_report', 'evidence_urls_json', 'MEDIUMTEXT NULL');

    // 2. shipment_change_request extensions
    await ensureColumn(db, 'shipment_change_request', 'estimated_extra_cost', 'BIGINT NOT NULL DEFAULT 0');
    await ensureColumn(
      db,
      'shipment_change_request',
      'cost_allocation',
      "ENUM('none','operating_cost','emergency_vet_covered','customer_addendum') NOT NULL DEFAULT 'none'",
    );
    await ensureColumn(db, 'shipment_change_request', 'crosses_new_border', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'shipment_change_request', 'decision_notes', 'TEXT NULL');
    await ensureColumn(db, 'shipment_change_request', 'published_at', 'DATETIME NULL');
    await ensureColumn(db, 'shipment_change_request', 'published_by', 'INT NULL');
    await ensureColumn(db, 'shipment_change_request', 'ripple_notified_count', 'INT NOT NULL DEFAULT 0');

    // 3. delivery_handover extensions
    await ensureColumn(db, 'delivery_handover', 'handover_location', 'VARCHAR(255) NULL');
    await ensureColumn(db, 'delivery_handover', 'delivered_quantity', 'INT NOT NULL DEFAULT 1');
    await ensureColumn(db, 'delivery_handover', 'identity_verified', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await ensureColumn(db, 'delivery_handover', 'documents_handed_over', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await ensureColumn(db, 'delivery_handover', 'evidence_urls_json', 'MEDIUMTEXT NULL');
    await ensureColumn(db, 'delivery_handover', 'dispute_reason', 'TEXT NULL');
    await ensureColumn(db, 'delivery_handover', 'confirmed_by', 'INT NULL');
    await ensureColumn(db, 'delivery_handover', 'confirmed_at', 'DATETIME NULL');
    await ensureColumn(db, 'delivery_handover', 'resolution_notes', 'TEXT NULL');
    await ensureColumn(db, 'delivery_handover', 'compensation_amount', 'BIGINT NOT NULL DEFAULT 0');
    await ensureColumn(db, 'delivery_handover', 'resolved_by', 'INT NULL');
    await ensureColumn(db, 'delivery_handover', 'resolved_at', 'DATETIME NULL');
    await ensureColumn(
      db,
      'delivery_handover',
      'updated_at',
      'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );

    // 4. attachment.related_type enum extension
    const attRelCol = await hasColumn(db, 'attachment', 'related_type');
    if (attRelCol && !String(attRelCol.COLUMN_TYPE).includes("'delivery_handover'")) {
      await db.execute(
        "ALTER TABLE attachment MODIFY COLUMN related_type ENUM('shipment','horse_condition_log','incident_report','delivery_handover') NOT NULL",
      );
      console.log("  + Extended attachment.related_type ENUM with 'delivery_handover'");
    } else {
      console.log("  = attachment.related_type ENUM already includes 'delivery_handover'");
    }

    console.log('Wave 3 Migration 027 completed successfully.');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Migration 027 failed:', err);
  process.exit(1);
});
