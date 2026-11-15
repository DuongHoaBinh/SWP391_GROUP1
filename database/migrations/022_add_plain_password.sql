-- Migration 022: Add plain_password column to user and otp_verification tables for demo convenience
ALTER TABLE `user`
ADD COLUMN `plain_password` VARCHAR(255) NULL AFTER `password_hash`;

ALTER TABLE `otp_verification`
ADD COLUMN `plain_password` VARCHAR(255) NULL AFTER `password_hash`;

-- Populate plain_password for known seed accounts
UPDATE `user`
SET `plain_password` = 'Password123'
WHERE `password_hash` = '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2'
   OR `email` LIKE '%@example.com';

-- For google oauth users
UPDATE `user`
SET `plain_password` = 'Google OAuth (Không dùng mật khẩu)'
WHERE `auth_provider` = 'google';
