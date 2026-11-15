-- Add the scope column omitted by older local exports. Do not infer historical values.
SET @scope_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'transportation_type') = 0,
  'ALTER TABLE shipment ADD COLUMN transportation_type VARCHAR(50) NULL DEFAULT NULL', 'SELECT 1');
PREPARE scope_statement FROM @scope_ddl;
EXECUTE scope_statement;
DEALLOCATE PREPARE scope_statement;
