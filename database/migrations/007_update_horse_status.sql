-- Migration 007: Expand horse status enum to include 'delivered'
ALTER TABLE `horse` 
MODIFY COLUMN `status` ENUM('active', 'in_transit', 'delivered', 'retired', 'deceased') NOT NULL DEFAULT 'active';
