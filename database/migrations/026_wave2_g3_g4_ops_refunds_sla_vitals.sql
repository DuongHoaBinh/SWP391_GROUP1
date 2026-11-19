-- Migration 026: Wave 2 Gap G3 (cancelled_operational, Refunds SoD, Disbursements, D-3 Upgrade, SLA) & Gap G4 (Equine Vitals 3-Tier, Health Log Alerting, Cross Check-In, Shift Persistence)
-- Safe for inspection; programmatic runner database/apply-wave2-migration.cjs enforces INFORMATION_SCHEMA idempotency.

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
  ) NOT NULL DEFAULT 'requested',
  ADD COLUMN cancellation_category VARCHAR(64) NULL,
  ADD COLUMN cancellation_reason TEXT NULL,
  ADD COLUMN cancelled_by INT NULL,
  ADD COLUMN cancelled_at DATETIME NULL,
  ADD COLUMN payment_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sla_escalation_status VARCHAR(40) NULL,
  ADD COLUMN sla_fallback_option VARCHAR(40) NULL,
  ADD COLUMN sla_fallback_notes TEXT NULL;

ALTER TABLE shipment_invoice
  ADD COLUMN invoice_type ENUM('primary','supplemental') NOT NULL DEFAULT 'primary',
  ADD COLUMN status ENUM('active','paid','void','overdue') NOT NULL DEFAULT 'active',
  ADD COLUMN parent_invoice_id INT NULL,
  ADD COLUMN payment_due_at DATETIME(3) NULL,
  ADD COLUMN grace_granted_at DATETIME(3) NULL,
  ADD COLUMN grace_due_at DATETIME(3) NULL,
  ADD COLUMN grace_count TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN grace_granted_by INT NULL,
  ADD COLUMN payment_reminder_sent_at DATETIME(3) NULL,
  ADD INDEX idx_invoice_route (route_id),
  DROP INDEX uq_invoice_route,
  ADD COLUMN active_primary_route_id INT GENERATED ALWAYS AS (
    CASE WHEN invoice_type = 'primary' AND status <> 'void' THEN route_id ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uq_active_primary_invoice_route (active_primary_route_id);

ALTER TABLE shipment_sepay_payment
  MODIFY COLUMN status ENUM('pending','review','succeeded','cancelled') NOT NULL DEFAULT 'pending',
  ADD COLUMN invoice_id INT NULL,
  ADD INDEX idx_sepay_shipment (shipment_id),
  DROP INDEX uq_sepay_shipment,
  ADD COLUMN active_shipment_invoice_key VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN status <> 'cancelled' THEN CONCAT(shipment_id, ':', COALESCE(invoice_id, 0)) ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uq_sepay_active_shipment_invoice (active_shipment_invoice_key);

ALTER TABLE shipment_assignment
  ADD COLUMN is_backup_pool BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sla_due_at DATETIME NULL,
  ADD COLUMN sla_reminder_sent_at DATETIME NULL,
  ADD COLUMN sla_escalated_at DATETIME NULL;

ALTER TABLE `user`
  ADD COLUMN current_shift VARCHAR(100) NULL DEFAULT 'Ca Hành Chính (08:00 - 17:00)',
  ADD COLUMN duty_status VARCHAR(32) NULL DEFAULT 'ON_DUTY';

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
  CONSTRAINT fk_sd_recorded_by FOREIGN KEY (recorded_by) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  CONSTRAINT fk_srr_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_srr_requested_by FOREIGN KEY (requested_by) REFERENCES `user`(user_id),
  CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE horse_health_log
  MODIFY COLUMN temperature_c DECIMAL(5,2) NULL,
  MODIFY COLUMN attachments_json MEDIUMTEXT NULL,
  ADD COLUMN alert_tier ENUM('green','amber_observational','amber_escalatable','red') NOT NULL DEFAULT 'green',
  ADD COLUMN alert_reason VARCHAR(500) NULL,
  ADD COLUMN recorded_by_role VARCHAR(50) NULL;

ALTER TABLE route_stop_update
  ADD COLUMN updated_by_role VARCHAR(50) NULL,
  ADD COLUMN is_backdated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE trip_status_log
  ADD COLUMN is_backdated BOOLEAN NOT NULL DEFAULT FALSE;
