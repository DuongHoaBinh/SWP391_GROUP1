-- Add 'transfer_hub' to route_stop.stop_type for consolidated shared_stall multi-origin/dropoff waypoints.
SET @transfer_hub_ddl = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'route_stop'
      AND COLUMN_NAME = 'stop_type'
      AND COLUMN_TYPE NOT LIKE '%''transfer_hub''%'
  ) > 0,
  'ALTER TABLE route_stop MODIFY COLUMN stop_type ENUM(''rest'',''quarantine'',''refuel'',''border_check'',''transfer_hub'',''other'') NOT NULL',
  'SELECT 1'
);
PREPARE transfer_hub_statement FROM @transfer_hub_ddl;
EXECUTE transfer_hub_statement;
DEALLOCATE PREPARE transfer_hub_statement;
