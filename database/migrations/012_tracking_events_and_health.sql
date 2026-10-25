USE horse_transport_system;

-- Safe for databases previously initialized by the old TrackingStore.
DELIMITER $$
DROP PROCEDURE IF EXISTS tracking_add_column$$
CREATE PROCEDURE tracking_add_column(IN table_name_in VARCHAR(64), IN column_name_in VARCHAR(64), IN definition_in TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = table_name_in AND COLUMN_NAME = column_name_in) THEN
    SET @tracking_ddl = CONCAT('ALTER TABLE `', table_name_in, '` ADD COLUMN `', column_name_in, '` ', definition_in);
    PREPARE tracking_stmt FROM @tracking_ddl;
    EXECUTE tracking_stmt;
    DEALLOCATE PREPARE tracking_stmt;
  END IF;
END$$
DELIMITER ;

CALL tracking_add_column('route_leg', 'actual_departure', 'DATETIME NULL');
CALL tracking_add_column('route_leg', 'actual_arrival', 'DATETIME NULL');
CALL tracking_add_column('route_stop', 'actual_arrival', 'DATETIME NULL');
CALL tracking_add_column('route_stop', 'actual_departure', 'DATETIME NULL');
CALL tracking_add_column('route_stop', 'updated_by', 'INT NULL');
CALL tracking_add_column('route_stop', 'notes', 'TEXT NULL');
CALL tracking_add_column('route_stop_update', 'vehicle_temperature_c', 'DECIMAL(4,1) NULL');
CALL tracking_add_column('route_stop_update', 'event_time', 'DATETIME(3) NULL');
CALL tracking_add_column('route_stop_update', 'legacy_status_log_id', 'INT NULL UNIQUE');
CALL tracking_add_column('horse_condition_log', 'temperature_c', 'DECIMAL(4,1) NULL');
CALL tracking_add_column('horse_condition_log', 'heart_rate_bpm', 'INT NULL');
CALL tracking_add_column('horse_condition_log', 'vehicle_temperature_c', 'DECIMAL(4,1) NULL');
CALL tracking_add_column('horse_condition_log', 'attachments_json', 'JSON NULL');
CALL tracking_add_column('horse_condition_log', 'legacy_health_log_id', 'INT NULL UNIQUE');

ALTER TABLE route_stop MODIFY COLUMN status ENUM('pending','arrived','cleared','customs_cleared','departed') NOT NULL DEFAULT 'pending';
ALTER TABLE route_stop_update MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE horse_condition_log MODIFY COLUMN recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

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
) ENGINE=InnoDB;

CALL tracking_add_column('trip_status_log', 'occurred_at', 'DATETIME(3) NULL');
DROP PROCEDURE tracking_add_column;

-- Preserve legacy history. Unmatched old observations stay in horse_health_log for manual reconciliation.
DELIMITER $$
DROP PROCEDURE IF EXISTS tracking_import_legacy$$
CREATE PROCEDURE tracking_import_legacy()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log') THEN
    INSERT INTO horse_condition_log (shipment_horse_id, recorded_by, condition_status, temperature_c, heart_rate_bpm, notes, attachments_json, recorded_at, legacy_health_log_id)
    SELECT sh.shipment_horse_id, old.recorded_by, old.condition_status, old.temperature_c, old.heart_rate_bpm, old.notes,
      CASE WHEN JSON_VALID(old.attachments_json) THEN old.attachments_json ELSE NULL END, old.recorded_at, old.log_id
    FROM horse_health_log old JOIN shipment_horse sh ON sh.shipment_id = old.shipment_id AND sh.horse_id = old.horse_id
    WHERE NOT EXISTS (SELECT 1 FROM horse_condition_log migrated WHERE migrated.legacy_health_log_id = old.log_id);
  END IF;
  INSERT INTO route_stop_update (route_stop_id, updated_by, status, notes, created_at, legacy_status_log_id)
  SELECT old.route_stop_id, old.updated_by, old.new_status, old.notes, old.created_at, old.log_id
  FROM trip_status_log old JOIN route_stop rs ON rs.route_stop_id = old.route_stop_id
  WHERE old.new_status IN ('arrived','departed','customs_cleared','delivered')
    AND NOT EXISTS (SELECT 1 FROM route_stop_update migrated WHERE migrated.legacy_status_log_id = old.log_id);
END$$
DELIMITER ;
CALL tracking_import_legacy();
DROP PROCEDURE tracking_import_legacy;
