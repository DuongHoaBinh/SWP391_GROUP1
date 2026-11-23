-- Migration 032: Step 5 - Vận chuyển khứ hồi và chính sách no-show
-- Idempotent script for shipment round trip, return_pending status, route leg/stop direction, and quote trip_type

-- 1. Extend shipment.status ENUM to include 'return_pending'
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
  'cancelled_operational'
) NOT NULL DEFAULT 'requested';

-- 2. Add round trip columns to shipment table if not present
SET @dbname = DATABASE();

SET @col_trip_type = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'trip_type');
SET @sql_trip_type = IF(@col_trip_type = 0, 'ALTER TABLE shipment ADD COLUMN trip_type ENUM(\'one_way\',\'round_trip\') NOT NULL DEFAULT \'one_way\'', 'SELECT 1');
PREPARE stmt FROM @sql_trip_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_dep = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_departure_at');
SET @sql_ret_dep = IF(@col_ret_dep = 0, 'ALTER TABLE shipment ADD COLUMN return_departure_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_ret_dep; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_wait = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_wait_minutes');
SET @sql_ret_wait = IF(@col_ret_wait = 0, 'ALTER TABLE shipment ADD COLUMN return_wait_minutes INT NOT NULL DEFAULT 120', 'SELECT 1');
PREPARE stmt FROM @sql_ret_wait; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_status = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_status');
SET @sql_ret_status = IF(@col_ret_status = 0, 'ALTER TABLE shipment ADD COLUMN return_status ENUM(\'not_applicable\',\'scheduled\',\'in_progress\',\'cancelled\',\'no_show\',\'completed\') NOT NULL DEFAULT \'not_applicable\'', 'SELECT 1');
PREPARE stmt FROM @sql_ret_status; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_noshow = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_no_show');
SET @sql_ret_noshow = IF(@col_ret_noshow = 0, 'ALTER TABLE shipment ADD COLUMN return_no_show BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @sql_ret_noshow; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_freight = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_freight');
SET @sql_ret_freight = IF(@col_ret_freight = 0, 'ALTER TABLE shipment ADD COLUMN return_freight BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql_ret_freight; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_ins = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_insurance_fee');
SET @sql_ret_ins = IF(@col_ret_ins = 0, 'ALTER TABLE shipment ADD COLUMN return_insurance_fee BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql_ret_ins; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_pol = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_policy_snapshot');
SET @sql_ret_pol = IF(@col_ret_pol = 0, 'ALTER TABLE shipment ADD COLUMN return_policy_snapshot JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql_ret_pol; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_pol_acc = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_policy_accepted_at');
SET @sql_ret_pol_acc = IF(@col_ret_pol_acc = 0, 'ALTER TABLE shipment ADD COLUMN return_policy_accepted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_ret_pol_acc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_canc_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_cancelled_at');
SET @sql_ret_canc_at = IF(@col_ret_canc_at = 0, 'ALTER TABLE shipment ADD COLUMN return_cancelled_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_ret_canc_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_canc_rs = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_cancel_reason');
SET @sql_ret_canc_rs = IF(@col_ret_canc_rs = 0, 'ALTER TABLE shipment ADD COLUMN return_cancel_reason VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_ret_canc_rs; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ret_resched_fee = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'return_reschedule_fee');
SET @sql_ret_resched_fee = IF(@col_ret_resched_fee = 0, 'ALTER TABLE shipment ADD COLUMN return_reschedule_fee BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql_ret_resched_fee; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Add direction to route_leg and route_stop if not present
SET @col_leg_dir = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'direction');
SET @sql_leg_dir = IF(@col_leg_dir = 0, 'ALTER TABLE route_leg ADD COLUMN direction ENUM(\'outbound\',\'return\') NOT NULL DEFAULT \'outbound\'', 'SELECT 1');
PREPARE stmt FROM @sql_leg_dir; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_stop_dir = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'direction');
SET @sql_stop_dir = IF(@col_stop_dir = 0, 'ALTER TABLE route_stop ADD COLUMN direction ENUM(\'outbound\',\'return\') NOT NULL DEFAULT \'outbound\'', 'SELECT 1');
PREPARE stmt FROM @sql_stop_dir; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Add trip_type to shipment_quote if not present
SET @col_quote_trip_type = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'shipment_quote' AND COLUMN_NAME = 'trip_type');
SET @sql_quote_trip_type = IF(@col_quote_trip_type = 0, 'ALTER TABLE shipment_quote ADD COLUMN trip_type ENUM(\'one_way\',\'round_trip\') NOT NULL DEFAULT \'one_way\'', 'SELECT 1');
PREPARE stmt FROM @sql_quote_trip_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Create shipment_return_change table for reschedule audit
CREATE TABLE IF NOT EXISTS shipment_return_change (
  change_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  old_return_departure_at DATETIME NOT NULL,
  new_return_departure_at DATETIME NOT NULL,
  reschedule_fee BIGINT NOT NULL DEFAULT 0,
  requested_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_return_change_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
