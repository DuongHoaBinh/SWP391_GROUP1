-- Migration 023: Drop legacy plain_password column from user and otp_verification tables

SET @drop_user_col := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'plain_password'
    ),
    'ALTER TABLE `user` DROP COLUMN `plain_password`',
    'SELECT 1'
  )
);
PREPARE stmt_user FROM @drop_user_col;
EXECUTE stmt_user;
DEALLOCATE PREPARE stmt_user;

SET @drop_otp_col := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verification' AND COLUMN_NAME = 'plain_password'
    ),
    'ALTER TABLE `otp_verification` DROP COLUMN `plain_password`',
    'SELECT 1'
  )
);
PREPARE stmt_otp FROM @drop_otp_col;
EXECUTE stmt_otp;
DEALLOCATE PREPARE stmt_otp;
