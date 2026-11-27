-- Migration 043: Expand horse.gender ENUM to support male, female, gelding, other.
-- Idempotent: safe to run multiple times without data loss.

ALTER TABLE horse
  MODIFY COLUMN gender ENUM('male','female','gelding','other') NULL DEFAULT NULL;
