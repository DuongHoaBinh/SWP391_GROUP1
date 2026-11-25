-- Migration 039: Update horse.gender ENUM to support 3 options: male (Đực), female (Cái), other (Khác).
-- Idempotent: safe to run multiple times without data loss.

ALTER TABLE horse
  MODIFY COLUMN gender ENUM('male','female','other','gelding') NULL DEFAULT NULL;

UPDATE horse
SET gender = 'other'
WHERE gender = 'gelding';

ALTER TABLE horse
  MODIFY COLUMN gender ENUM('male','female','other') NULL DEFAULT NULL;
