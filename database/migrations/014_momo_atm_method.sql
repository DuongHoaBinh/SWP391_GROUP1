-- Preserve wallet attempts and audit events when switching checkout to ATM.
SET @add_atm_method = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'shipment_sandbox_payment' AND COLUMN_NAME = 'request_type') = 0,
  'ALTER TABLE shipment_sandbox_payment ADD COLUMN request_type VARCHAR(32) NOT NULL DEFAULT ''captureWallet'' AFTER partner_code',
  'SELECT 1');
PREPARE atm_method_statement FROM @add_atm_method;
EXECUTE atm_method_statement;
DEALLOCATE PREPARE atm_method_statement;
