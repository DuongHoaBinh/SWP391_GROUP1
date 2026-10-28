-- Migration 011: Add specialization to user table for field staff (driver vs medical escort/vet)

USE horse_transport_system;

ALTER TABLE `user`
  ADD COLUMN `specialization` VARCHAR(50) NULL DEFAULT NULL AFTER `role_id`;

-- Update existing driver / escort seed accounts
UPDATE `user`
SET `specialization` = 'driver'
WHERE `role_id` = 5 AND (`full_name` LIKE '%Tài xế%' OR `full_name` LIKE '%Driver%' OR `email` LIKE '%driver%');

UPDATE `user`
SET `specialization` = 'escort'
WHERE `role_id` = 5 AND (`full_name` LIKE '%Thú y%' OR `full_name` LIKE '%Escort%' OR `full_name` LIKE '%Vet%' OR `email` LIKE '%escort%');

UPDATE `user`
SET `specialization` = 'driver'
WHERE `role_id` = 5 AND `specialization` IS NULL;
