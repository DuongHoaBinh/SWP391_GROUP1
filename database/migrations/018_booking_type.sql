-- Historical quotes retain their totals. A null unit price means no per-stall quote was recorded.
SET @booking_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'booking_type') = 0, 'ALTER TABLE shipment ADD COLUMN booking_type ENUM(''shared_stall'',''dedicated_charter'') NOT NULL DEFAULT ''shared_stall''', 'SELECT 1');
PREPARE booking_statement FROM @booking_ddl;
EXECUTE booking_statement;
DEALLOCATE PREPARE booking_statement;

SET @booking_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'stall_unit_price') = 0, 'ALTER TABLE shipment ADD COLUMN stall_unit_price DECIMAL(15,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE booking_statement FROM @booking_ddl;
EXECUTE booking_statement;
DEALLOCATE PREPARE booking_statement;

CREATE TABLE IF NOT EXISTS shipment_booking_revision (
  revision_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  changed_by INT NOT NULL,
  previous_booking_type ENUM('shared_stall','dedicated_charter') NOT NULL,
  booking_type ENUM('shared_stall','dedicated_charter') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_booking_revision_shipment (shipment_id, created_at),
  CONSTRAINT fk_booking_revision_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_booking_revision_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
