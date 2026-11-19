-- Migration 011: Add specialization to user table for field staff (idempotent)

SET @user_spec_ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'specialization') = 0,
  'ALTER TABLE `user` ADD COLUMN `specialization` VARCHAR(50) NULL DEFAULT NULL AFTER `role_id`',
  'SELECT 1'
);
PREPARE user_spec_stmt FROM @user_spec_ddl;
EXECUTE user_spec_stmt;
DEALLOCATE PREPARE user_spec_stmt;

UPDATE `user`
SET `specialization` = 'driver'
WHERE `role_id` = 5 AND (`full_name` LIKE '%Tài xế%' OR `full_name` LIKE '%Driver%' OR `email` LIKE '%driver%');

UPDATE `user`
SET `specialization` = 'escort'
WHERE `role_id` = 5 AND (`full_name` LIKE '%Thú y%' OR `full_name` LIKE '%Escort%' OR `full_name` LIKE '%Vet%' OR `email` LIKE '%escort%');

UPDATE `user`
SET `specialization` = 'driver'
WHERE `role_id` = 5 AND `specialization` IS NULL;
