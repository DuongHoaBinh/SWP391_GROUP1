-- Wave 0 Schema Hotfixes (idempotent)
-- 1. Unify route_stop.status ENUM to support both legacy 'cleared' and 'customs_cleared'
SET @w0_rs_ddl = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'route_stop'
      AND COLUMN_NAME = 'status'
      AND COLUMN_TYPE NOT LIKE '%''customs_cleared''%'
  ) > 0,
  'ALTER TABLE route_stop MODIFY COLUMN status ENUM(''pending'',''arrived'',''cleared'',''customs_cleared'',''departed'') NOT NULL DEFAULT ''pending''',
  'SELECT 1'
);
PREPARE w0_rs_stmt FROM @w0_rs_ddl;
EXECUTE w0_rs_stmt;
DEALLOCATE PREPARE w0_rs_stmt;

UPDATE route_stop SET status = 'customs_cleared' WHERE status = 'cleared';

-- 2. Audit history table for route schedule updates
CREATE TABLE IF NOT EXISTS route_schedule_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  route_stop_id INT NOT NULL,
  old_planned_arrival DATETIME NULL,
  new_planned_arrival DATETIME NULL,
  old_planned_departure DATETIME NULL,
  new_planned_departure DATETIME NULL,
  reason TEXT NOT NULL,
  changed_by INT NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rsh_stop (route_stop_id),
  CONSTRAINT fk_rsh_stop FOREIGN KEY (route_stop_id) REFERENCES route_stop(route_stop_id),
  CONSTRAINT fk_rsh_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Ensure horse_health_log exists and expand attachments_json to MEDIUMTEXT
CREATE TABLE IF NOT EXISTS horse_health_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NULL,
  horse_name VARCHAR(150) NOT NULL,
  leg_name VARCHAR(255) NULL,
  recorded_by INT NOT NULL,
  condition_status ENUM('stable', 'not_eating', 'stressed', 'climate_change', 'other') NOT NULL DEFAULT 'stable',
  temperature_c DECIMAL(4, 1) NULL,
  heart_rate_bpm INT NULL,
  notes TEXT NULL,
  attachments_json MEDIUMTEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hhl_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @w0_hhl_ddl = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'horse_health_log'
      AND COLUMN_NAME = 'attachments_json'
      AND DATA_TYPE = 'text'
  ) > 0,
  'ALTER TABLE horse_health_log MODIFY COLUMN attachments_json MEDIUMTEXT NULL',
  'SELECT 1'
);
PREPARE w0_hhl_stmt FROM @w0_hhl_ddl;
EXECUTE w0_hhl_stmt;
DEALLOCATE PREPARE w0_hhl_stmt;

-- 4. Append-only history support for transport_document (BR-F2-04)
SET @w0_td_arch = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transport_document'
      AND COLUMN_NAME = 'is_archived'
  ) = 0,
  'ALTER TABLE transport_document ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE AFTER reviewer_notes',
  'SELECT 1'
);
PREPARE w0_td_arch_stmt FROM @w0_td_arch;
EXECUTE w0_td_arch_stmt;
DEALLOCATE PREPARE w0_td_arch_stmt;

SET @w0_td_sup = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transport_document'
      AND COLUMN_NAME = 'superseded_by_document_id'
  ) = 0,
  'ALTER TABLE transport_document ADD COLUMN superseded_by_document_id INT NULL AFTER is_archived',
  'SELECT 1'
);
PREPARE w0_td_sup_stmt FROM @w0_td_sup;
EXECUTE w0_td_sup_stmt;
DEALLOCATE PREPARE w0_td_sup_stmt;

-- 5. Unstick completed horses currently locked in 'delivered' status so owners can re-book
UPDATE horse h
SET h.status = 'active'
WHERE h.status = 'delivered'
  AND NOT EXISTS (
    SELECT 1
    FROM shipment_horse sh
    JOIN shipment s ON s.shipment_id = sh.shipment_id
    WHERE sh.horse_id = h.horse_id
      AND s.status IN ('requested', 'change_requested', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit')
  );
