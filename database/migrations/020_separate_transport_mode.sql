-- Preserve Domestic/International and historical quotes; do not infer legacy mode from free text.
SET @mode_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'transport_mode') = 0,
  'ALTER TABLE shipment ADD COLUMN transport_mode ENUM(''road'',''air'') NULL DEFAULT NULL', 'SELECT 1');
PREPARE mode_statement FROM @mode_ddl;
EXECUTE mode_statement;
DEALLOCATE PREPARE mode_statement;
