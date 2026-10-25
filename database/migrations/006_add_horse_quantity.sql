-- Migration 006: Add quantity column to horse and shipment_horse
ALTER TABLE `horse` ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;
ALTER TABLE `shipment_horse` ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;