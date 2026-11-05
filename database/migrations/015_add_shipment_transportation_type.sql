-- Migration 015: Add transportation_type column to shipment table
-- Purpose: Store the transportation type (International / Domestic) explicitly
-- so the Request Summary page can display it correctly without text parsing.

ALTER TABLE shipment
  ADD COLUMN transportation_type VARCHAR(50) NULL DEFAULT NULL
  AFTER destination_location;

-- Back-fill existing rows: detect domestic from special_requirements text
UPDATE shipment
SET transportation_type = CASE
  WHEN special_requirements LIKE '%Nội địa%' OR special_requirements LIKE '%Domestic%'
    THEN 'Domestic'
  ELSE 'International'
END
WHERE transportation_type IS NULL;

