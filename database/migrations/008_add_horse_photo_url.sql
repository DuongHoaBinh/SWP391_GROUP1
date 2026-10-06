-- Migration 008: Add photo_url to horse table
ALTER TABLE horse ADD COLUMN photo_url VARCHAR(500) NULL AFTER passport_no;
