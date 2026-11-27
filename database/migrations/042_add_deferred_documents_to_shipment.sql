-- Migration 042: Persist customer "Submit Later" (deferred) compliance documents on shipment
-- and add deduplication table for automated deferred-document deadline reminders (48h / 24h / overdue).

SET @has_deferred_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'shipment'
    AND COLUMN_NAME = 'deferred_documents_json'
);
SET @sql_add_deferred := IF(
  @has_deferred_col = 0,
  'ALTER TABLE shipment ADD COLUMN deferred_documents_json JSON NULL AFTER pricing_snapshot',
  'SELECT 1'
);
PREPARE stmt_add_deferred FROM @sql_add_deferred;
EXECUTE stmt_add_deferred;
DEALLOCATE PREPARE stmt_add_deferred;

CREATE TABLE IF NOT EXISTS shipment_doc_deadline_notice (
  notice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NOT NULL,
  document_type_code VARCHAR(80) NOT NULL,
  threshold_hours INT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ship_doc_deadline_notice (shipment_id, horse_id, document_type_code, threshold_hours),
  CONSTRAINT fk_sddn_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
