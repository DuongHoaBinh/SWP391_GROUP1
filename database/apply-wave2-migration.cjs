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

async function hasIndex(db, tableName, indexName) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0]?.cnt || 0) > 0;
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
    console.log('Applying Wave 2 Migration 026 (G3 Ops Cancel/Refunds SoD/SLA & G4 Vitals/Health/Roles)...');

    // 1. shipment status enum + operational cancel & SLA columns
    const shipStatusCol = await hasColumn(db, 'shipment', 'status');
    if (shipStatusCol && !String(shipStatusCol.COLUMN_TYPE).includes("'cancelled_operational'")) {
      await db.execute(`
        ALTER TABLE shipment
        MODIFY COLUMN status ENUM(
          'requested',
          'change_requested',
          'approved',
          'rejected',
          'planning',
          'confirmed',
          'ready_to_depart',
          'in_transit',
          'completed',
          'cancelled',
          'cancelled_operational'
        ) NOT NULL DEFAULT 'requested'
      `);
      console.log('  + Extended shipment.status ENUM with cancelled_operational');
    } else {
      console.log('  = shipment.status ENUM already includes cancelled_operational');
    }

    await ensureColumn(db, 'shipment', 'cancellation_category', 'VARCHAR(64) NULL');
    await ensureColumn(db, 'shipment', 'cancellation_reason', 'TEXT NULL');
    await ensureColumn(db, 'shipment', 'cancelled_by', 'INT NULL');
    await ensureColumn(db, 'shipment', 'cancelled_at', 'DATETIME NULL');
    await ensureColumn(db, 'shipment', 'payment_overdue', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'shipment', 'sla_escalation_status', 'VARCHAR(40) NULL');
    await ensureColumn(db, 'shipment', 'sla_fallback_option', 'VARCHAR(40) NULL');
    await ensureColumn(db, 'shipment', 'sla_fallback_notes', 'TEXT NULL');

    // 2. shipment_invoice columns & active-primary unique constraint
    await ensureColumn(db, 'shipment_invoice', 'invoice_type', "ENUM('primary','supplemental') NOT NULL DEFAULT 'primary'");
    await ensureColumn(db, 'shipment_invoice', 'status', "ENUM('active','paid','void','overdue') NOT NULL DEFAULT 'active'");
    await ensureColumn(db, 'shipment_invoice', 'parent_invoice_id', 'INT NULL');
    await ensureColumn(db, 'shipment_invoice', 'payment_due_at', 'DATETIME(3) NULL');
    await ensureColumn(db, 'shipment_invoice', 'grace_granted_at', 'DATETIME(3) NULL');
    await ensureColumn(db, 'shipment_invoice', 'grace_due_at', 'DATETIME(3) NULL');
    await ensureColumn(db, 'shipment_invoice', 'grace_count', 'TINYINT NOT NULL DEFAULT 0');
    await ensureColumn(db, 'shipment_invoice', 'grace_granted_by', 'INT NULL');
    await ensureColumn(db, 'shipment_invoice', 'payment_reminder_sent_at', 'DATETIME(3) NULL');

    if (!(await hasIndex(db, 'shipment_invoice', 'idx_invoice_route'))) {
      await db.execute('ALTER TABLE shipment_invoice ADD INDEX idx_invoice_route (route_id)');
      console.log('  + Added index shipment_invoice.idx_invoice_route');
    }
    if (await hasIndex(db, 'shipment_invoice', 'uq_invoice_route')) {
      await db.execute('ALTER TABLE shipment_invoice DROP INDEX uq_invoice_route');
      console.log('  + Dropped legacy uq_invoice_route');
    }
    await ensureColumn(
      db,
      'shipment_invoice',
      'active_primary_route_id',
      "INT GENERATED ALWAYS AS (CASE WHEN invoice_type = 'primary' AND status <> 'void' THEN route_id ELSE NULL END) STORED",
    );
    if (!(await hasIndex(db, 'shipment_invoice', 'uq_active_primary_invoice_route'))) {
      await db.execute(
        'ALTER TABLE shipment_invoice ADD UNIQUE KEY uq_active_primary_invoice_route (active_primary_route_id)',
      );
      console.log('  + Added uq_active_primary_invoice_route');
    }

    // 3. shipment_sepay_payment columns & active-payment unique constraint
    const sepayStatusCol = await hasColumn(db, 'shipment_sepay_payment', 'status');
    if (sepayStatusCol && !String(sepayStatusCol.COLUMN_TYPE).includes("'cancelled'")) {
      await db.execute(`
        ALTER TABLE shipment_sepay_payment
        MODIFY COLUMN status ENUM('pending','review','succeeded','cancelled') NOT NULL DEFAULT 'pending'
      `);
      console.log('  + Extended shipment_sepay_payment.status ENUM with cancelled');
    } else {
      console.log('  = shipment_sepay_payment.status ENUM already includes cancelled');
    }
    await ensureColumn(db, 'shipment_sepay_payment', 'invoice_id', 'INT NULL');

    if (!(await hasIndex(db, 'shipment_sepay_payment', 'idx_sepay_shipment'))) {
      await db.execute('ALTER TABLE shipment_sepay_payment ADD INDEX idx_sepay_shipment (shipment_id)');
      console.log('  + Added index shipment_sepay_payment.idx_sepay_shipment');
    }
    if (await hasIndex(db, 'shipment_sepay_payment', 'uq_sepay_shipment')) {
      await db.execute('ALTER TABLE shipment_sepay_payment DROP INDEX uq_sepay_shipment');
      console.log('  + Dropped legacy uq_sepay_shipment');
    }
    await ensureColumn(
      db,
      'shipment_sepay_payment',
      'active_shipment_invoice_key',
      "VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN status <> 'cancelled' THEN CONCAT(shipment_id, ':', COALESCE(invoice_id, 0)) ELSE NULL END) STORED",
    );
    if (!(await hasIndex(db, 'shipment_sepay_payment', 'uq_sepay_active_shipment_invoice'))) {
      await db.execute(
        'ALTER TABLE shipment_sepay_payment ADD UNIQUE KEY uq_sepay_active_shipment_invoice (active_shipment_invoice_key)',
      );
      console.log('  + Added uq_sepay_active_shipment_invoice');
    }

    // 4. shipment_assignment SLA columns
    await ensureColumn(db, 'shipment_assignment', 'is_backup_pool', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'shipment_assignment', 'sla_due_at', 'DATETIME NULL');
    await ensureColumn(db, 'shipment_assignment', 'sla_reminder_sent_at', 'DATETIME NULL');
    await ensureColumn(db, 'shipment_assignment', 'sla_escalated_at', 'DATETIME NULL');

    // 5. user shift persistence columns
    await ensureColumn(db, 'user', 'current_shift', "VARCHAR(100) NULL DEFAULT 'Ca Hành Chính (08:00 - 17:00)'");
    await ensureColumn(db, 'user', 'duty_status', "VARCHAR(32) NULL DEFAULT 'ON_DUTY'");

    // 6. New table shipment_disbursement
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipment_disbursement (
        disbursement_id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        authority_name VARCHAR(150) NOT NULL,
        fee_type VARCHAR(80) NOT NULL,
        amount BIGINT NOT NULL,
        authority_receipt_url VARCHAR(500) NULL,
        notes TEXT NULL,
        settled_status ENUM('advanced','reimbursed','deducted_from_refund','absorbed_company_fault') NOT NULL DEFAULT 'advanced',
        recorded_by INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sd_shipment (shipment_id),
        CONSTRAINT fk_sd_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
        CONSTRAINT fk_sd_recorded_by FOREIGN KEY (recorded_by) REFERENCES \`user\`(user_id),
        CHECK (amount > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + Verified table shipment_disbursement');

    // 7. New table shipment_refund_record (SoD + Dual Approval >= 20M VND + 30d credit)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipment_refund_record (
        refund_id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        customer_id INT NOT NULL,
        cancellation_category VARCHAR(64) NOT NULL,
        refund_mode ENUM('cash_refund','credit_30d') NOT NULL DEFAULT 'cash_refund',
        freight_refund_amount BIGINT NOT NULL DEFAULT 0,
        insurance_refund_amount BIGINT NOT NULL DEFAULT 0,
        non_refundable_air_deduction BIGINT NOT NULL DEFAULT 0,
        disbursement_deduction BIGINT NOT NULL DEFAULT 0,
        amount BIGINT NOT NULL DEFAULT 0,
        receivable_excess_amount BIGINT NOT NULL DEFAULT 0,
        status ENUM(
          'pending_approval',
          'pending_second_approval',
          'approved_for_transfer',
          'transferred',
          'converted_to_credit',
          'rejected'
        ) NOT NULL DEFAULT 'pending_approval',
        requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,
        requested_by INT NOT NULL,
        approved_by INT NULL,
        approved_at DATETIME NULL,
        second_approved_by INT NULL,
        second_approved_at DATETIME NULL,
        transferred_by INT NULL,
        transferred_at DATETIME NULL,
        recipient_bank_account VARCHAR(100) NULL,
        bank_transaction_ref VARCHAR(150) NULL,
        transfer_receipt_url VARCHAR(500) NULL,
        credit_expires_at DATETIME NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_srr_shipment (shipment_id),
        INDEX idx_srr_status (status),
        CONSTRAINT fk_srr_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
        CONSTRAINT fk_srr_customer FOREIGN KEY (customer_id) REFERENCES \`user\`(user_id),
        CONSTRAINT fk_srr_requested_by FOREIGN KEY (requested_by) REFERENCES \`user\`(user_id),
        CHECK (amount >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + Verified table shipment_refund_record');

    // 8. New table equine_vital_config + default active Vet calibration seed
    await db.execute(`
      CREATE TABLE IF NOT EXISTS equine_vital_config (
        config_id INT AUTO_INCREMENT PRIMARY KEY,
        config_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        temp_green_min DECIMAL(4,2) NOT NULL DEFAULT 37.50,
        temp_green_max DECIMAL(4,2) NOT NULL DEFAULT 38.50,
        temp_amber_low_min DECIMAL(4,2) NOT NULL DEFAULT 37.00,
        temp_amber_high_max DECIMAL(4,2) NOT NULL DEFAULT 39.30,
        hr_green_min INT NOT NULL DEFAULT 28,
        hr_green_max INT NOT NULL DEFAULT 44,
        hr_amber_low_min INT NOT NULL DEFAULT 24,
        hr_amber_high_max INT NOT NULL DEFAULT 60,
        consecutive_alert_window_hours INT NOT NULL DEFAULT 6,
        escalatable_conditions JSON NOT NULL,
        observational_conditions JSON NOT NULL,
        calibrated_by VARCHAR(150) NULL,
        updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [cfgRows] = await db.execute('SELECT COUNT(*) AS cnt FROM equine_vital_config WHERE is_active = TRUE');
    if (Number(cfgRows[0]?.cnt || 0) === 0) {
      await db.execute(
        `INSERT INTO equine_vital_config (
          config_name, is_active, temp_green_min, temp_green_max, temp_amber_low_min, temp_amber_high_max,
          hr_green_min, hr_green_max, hr_amber_low_min, hr_amber_high_max, consecutive_alert_window_hours,
          escalatable_conditions, observational_conditions, calibrated_by
        ) VALUES (
          'Default Equine Transport Vitals v3.1', TRUE, 37.50, 38.50, 37.00, 39.30,
          28, 44, 24, 60, 6, ?, ?, 'Pre-Go-Live Baseline (DEC-06)'
        )`,
        [JSON.stringify(['not_eating', 'stressed']), JSON.stringify(['climate_change', 'other'])],
      );
      console.log('  + Seeded default equine_vital_config');
    } else {
      console.log('  = Active equine_vital_config already exists');
    }

    // 9. horse_health_log precision + alert_tier + attachments MEDIUMTEXT
    await db.execute(`
      CREATE TABLE IF NOT EXISTS horse_health_log (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        horse_id INT NULL,
        horse_name VARCHAR(150) NOT NULL,
        leg_name VARCHAR(255) NULL,
        recorded_by INT NOT NULL,
        condition_status ENUM('stable', 'not_eating', 'stressed', 'climate_change', 'other') NOT NULL DEFAULT 'stable',
        temperature_c DECIMAL(5,2) NULL,
        heart_rate_bpm INT NULL,
        notes TEXT NULL,
        attachments_json MEDIUMTEXT NULL,
        recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_hhl_shipment (shipment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.execute('ALTER TABLE horse_health_log MODIFY COLUMN temperature_c DECIMAL(5,2) NULL, MODIFY COLUMN attachments_json MEDIUMTEXT NULL');
    await ensureColumn(db, 'horse_health_log', 'alert_tier', "ENUM('green','amber_observational','amber_escalatable','red') NOT NULL DEFAULT 'green'");
    await ensureColumn(db, 'horse_health_log', 'alert_reason', 'VARCHAR(500) NULL');
    await ensureColumn(db, 'horse_health_log', 'recorded_by_role', 'VARCHAR(50) NULL');

    // 10. route_stop_update & trip_status_log audit metadata
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trip_status_log (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        route_id INT NOT NULL,
        leg_id INT NULL,
        route_stop_id INT NULL,
        previous_status VARCHAR(50) NULL,
        new_status VARCHAR(50) NOT NULL,
        milestone_type VARCHAR(50) NOT NULL,
        milestone_name VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        updated_by INT NOT NULL,
        updated_by_role VARCHAR(50) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tsl_shipment (shipment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(db, 'route_stop_update', 'updated_by_role', 'VARCHAR(50) NULL');
    await ensureColumn(db, 'route_stop_update', 'is_backdated', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(db, 'trip_status_log', 'is_backdated', 'BOOLEAN NOT NULL DEFAULT FALSE');

    // Backfill active paid invoices where SePay already succeeded
    await db.execute(`
      UPDATE shipment_invoice i
      JOIN shipment_sepay_payment p ON p.shipment_id = i.shipment_id AND p.status = 'succeeded'
      SET i.status = 'paid'
      WHERE i.invoice_type = 'primary' AND i.status = 'active'
    `);

    console.log('Wave 2 migration 026 applied cleanly.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Migration 026 failed:', error.message);
  process.exitCode = 1;
});
