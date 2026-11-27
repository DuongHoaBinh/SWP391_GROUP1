-- Migration 045: Remove requires_private_stall feature from horse profiles and pricing_tariff params_json.
-- Idempotent: safe to run multiple times without error.

-- 1. Drop horse.requires_private_stall column if present
SET @drop_private_stall_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'requires_private_stall') > 0,
  'ALTER TABLE horse DROP COLUMN requires_private_stall',
  'SELECT 1'
);
PREPARE stmt_drop_private_stall FROM @drop_private_stall_sql;
EXECUTE stmt_drop_private_stall;
DEALLOCATE PREPARE stmt_drop_private_stall;

-- 2. Strip privateStallMultiplier from pricing_tariff JSON payloads if present
UPDATE pricing_tariff
SET params = JSON_REMOVE(params, '$.privateStallMultiplier', '$.vessel.privateStallMultiplier')
WHERE JSON_CONTAINS_PATH(params, 'one', '$.privateStallMultiplier', '$.vessel.privateStallMultiplier') = 1;

-- 3. Clean up legacy demo horse label referencing private stall
UPDATE horse
SET name = 'Hoàng Phi'
WHERE name = 'Hoàng Phi (Chuồng riêng)';
