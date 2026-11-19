-- Migration 015: Add transportation_type column to shipment table (idempotent)

SET @ship_type_ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'transportation_type') = 0,
  'ALTER TABLE `shipment` ADD COLUMN `transportation_type` VARCHAR(50) NULL DEFAULT NULL AFTER `destination_location`',
  'SELECT 1'
);
PREPARE ship_type_stmt FROM @ship_type_ddl;
EXECUTE ship_type_stmt;
DEALLOCATE PREPARE ship_type_stmt;

UPDATE `shipment`
SET `transportation_type` = CASE
  WHEN `special_requirements` LIKE '%Nội địa%' OR `special_requirements` LIKE '%Domestic%'
    THEN 'Domestic'
  ELSE 'International'
END
WHERE `transportation_type` IS NULL;
