-- Migration 008: Add photo_url to horse table (idempotent)
SET @horse_photo_ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'photo_url') = 0,
  'ALTER TABLE `horse` ADD COLUMN `photo_url` VARCHAR(500) NULL AFTER `passport_no`',
  'SELECT 1'
);
PREPARE horse_photo_stmt FROM @horse_photo_ddl;
EXECUTE horse_photo_stmt;
DEALLOCATE PREPARE horse_photo_stmt;
