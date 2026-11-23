-- Migration 034: Step 7 - Luồng trả trước, hóa đơn không cần tuyến, duyệt khả thi và hoàn tiền
-- Idempotent script for prepaid flow, shipment_status_history, NULLable route_id in invoice, and refund enhancements

-- 1. Extend shipment.status ENUM
ALTER TABLE shipment MODIFY COLUMN status ENUM(
  'requested',
  'under_review',
  'change_requested',
  'approved',
  'rejected',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'return_pending',
  'completed',
  'delivered',
  'cancelled',
  'cancelled_operational',
  'awaiting_payment',
  'paid_pending_review',
  'refund_requested',
  'refunded'
) NOT NULL DEFAULT 'requested';

-- 2. Add prepaid and feasibility columns to shipment table
SET @dbname = DATABASE();

SET @col_payment_flow = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'payment_flow');
SET @sql_payment_flow = IF(@col_payment_flow = 0, 'ALTER TABLE shipment ADD COLUMN payment_flow ENUM(\'postpaid_legacy\',\'prepaid\') NOT NULL DEFAULT \'postpaid_legacy\'', 'SELECT 1');
PREPARE stmt FROM @sql_payment_flow; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_payment_due_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'payment_due_at');
SET @sql_payment_due_at = IF(@col_payment_due_at = 0, 'ALTER TABLE shipment ADD COLUMN payment_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_payment_due_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_cancel_reason_code = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'cancel_reason_code');
SET @sql_cancel_reason_code = IF(@col_cancel_reason_code = 0, 'ALTER TABLE shipment ADD COLUMN cancel_reason_code VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_cancel_reason_code; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_feas_by = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'feasibility_decided_by');
SET @sql_feas_by = IF(@col_feas_by = 0, 'ALTER TABLE shipment ADD COLUMN feasibility_decided_by INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_feas_by; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_feas_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'feasibility_decided_at');
SET @sql_feas_at = IF(@col_feas_at = 0, 'ALTER TABLE shipment ADD COLUMN feasibility_decided_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_feas_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_feas_code = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'feasibility_reason_code');
SET @sql_feas_code = IF(@col_feas_code = 0, 'ALTER TABLE shipment ADD COLUMN feasibility_reason_code VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_feas_code; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_feas_note = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'feasibility_note');
SET @sql_feas_note = IF(@col_feas_note = 0, 'ALTER TABLE shipment ADD COLUMN feasibility_note TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_feas_note; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Create shipment_status_history table
CREATE TABLE IF NOT EXISTS shipment_status_history (
  history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(40) NOT NULL,
  reason_code VARCHAR(50) NULL,
  note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ssh_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ssh_shipment (shipment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. shipment_invoice route_id NULLable and active_primary_shipment_key
ALTER TABLE shipment_invoice MODIFY COLUMN route_id INT NULL;

SET @col_act_ship = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_invoice' AND COLUMN_NAME = 'active_primary_shipment_key');
SET @sql_act_ship = IF(@col_act_ship = 0, 'ALTER TABLE shipment_invoice ADD COLUMN active_primary_shipment_key INT GENERATED ALWAYS AS (CASE WHEN invoice_type = \'primary\' AND status <> \'void\' AND route_id IS NULL THEN shipment_id ELSE NULL END) STORED', 'SELECT 1');
PREPARE stmt FROM @sql_act_ship; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_act_ship = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_invoice' AND INDEX_NAME = 'uq_active_primary_invoice_shipment');
SET @sql_idx_act_ship = IF(@idx_act_ship = 0, 'ALTER TABLE shipment_invoice ADD UNIQUE KEY uq_active_primary_invoice_shipment (active_primary_shipment_key)', 'SELECT 1');
PREPARE stmt FROM @sql_idx_act_ship; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Add columns to shipment_refund_record
SET @col_srr_bank_name = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_refund_record' AND COLUMN_NAME = 'recipient_bank_name');
SET @sql_srr_bank_name = IF(@col_srr_bank_name = 0, 'ALTER TABLE shipment_refund_record ADD COLUMN recipient_bank_name VARCHAR(150) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_srr_bank_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_srr_acc_holder = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_refund_record' AND COLUMN_NAME = 'recipient_account_holder');
SET @sql_srr_acc_holder = IF(@col_srr_acc_holder = 0, 'ALTER TABLE shipment_refund_record ADD COLUMN recipient_account_holder VARCHAR(150) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_srr_acc_holder; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_srr_cust_note = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_refund_record' AND COLUMN_NAME = 'customer_note');
SET @sql_srr_cust_note = IF(@col_srr_cust_note = 0, 'ALTER TABLE shipment_refund_record ADD COLUMN customer_note TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_srr_cust_note; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_srr_form_sub = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_refund_record' AND COLUMN_NAME = 'form_submitted_at');
SET @sql_srr_form_sub = IF(@col_srr_form_sub = 0, 'ALTER TABLE shipment_refund_record ADD COLUMN form_submitted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_srr_form_sub; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_srr_sla_due = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_refund_record' AND COLUMN_NAME = 'sla_due_at');
SET @sql_srr_sla_due = IF(@col_srr_sla_due = 0, 'ALTER TABLE shipment_refund_record ADD COLUMN sla_due_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_srr_sla_due; EXECUTE stmt; DEALLOCATE PREPARE stmt;
