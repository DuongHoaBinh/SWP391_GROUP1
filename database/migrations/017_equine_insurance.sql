-- Insurance is snapshotted per shipment horse. Fees on shipment_horse are per horse.
-- Repair older schema exports missing the horse fields used by the order-selection/detail API.
SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'color') = 0, 'ALTER TABLE `horse` ADD COLUMN `color` VARCHAR(100) NULL', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'weight') = 0, 'ALTER TABLE `horse` ADD COLUMN `weight` VARCHAR(100) NULL', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'medical_status') = 0, 'ALTER TABLE `horse` ADD COLUMN `medical_status` VARCHAR(255) NULL', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'special_requirements') = 0, 'ALTER TABLE `horse` ADD COLUMN `special_requirements` TEXT NULL', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'transport_cost') = 0, 'ALTER TABLE `shipment` ADD COLUMN `transport_cost` DECIMAL(15,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'insurance_fee') = 0, 'ALTER TABLE `shipment` ADD COLUMN `insurance_fee` DECIMAL(15,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'declared_value') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `declared_value` DECIMAL(15,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'declared_currency') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `declared_currency` CHAR(3) NOT NULL DEFAULT ''VND''', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'exchange_rate') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `exchange_rate` DECIMAL(18,6) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'declared_value_vnd') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `declared_value_vnd` DECIMAL(15,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'insurance_package') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `insurance_package` VARCHAR(50) NOT NULL DEFAULT ''basic''', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'insurance_fee') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `insurance_fee` DECIMAL(15,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'max_compensation') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `max_compensation` DECIMAL(15,2) NOT NULL DEFAULT 50000000', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'emergency_vet_covered') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `emergency_vet_covered` BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

SET @insurance_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_horse' AND COLUMN_NAME = 'insurance_policy_version') = 0, 'ALTER TABLE `shipment_horse` ADD COLUMN `insurance_policy_version` VARCHAR(30) NOT NULL DEFAULT ''equine-v1''', 'SELECT 1');
PREPARE insurance_statement FROM @insurance_ddl;
EXECUTE insurance_statement;
DEALLOCATE PREPARE insurance_statement;

UPDATE shipment SET transport_cost = total_cost WHERE transport_cost IS NULL AND insurance_fee = 0 AND total_cost > 0;

CREATE TABLE IF NOT EXISTS shipment_insurance_revision (
  revision_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  changed_by INT NOT NULL,
  previous_snapshot JSON NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT 'customer_resubmission',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_insurance_revision_shipment (shipment_id, created_at),
  CONSTRAINT fk_insurance_revision_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_insurance_revision_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
