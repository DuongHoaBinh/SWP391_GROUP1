-- Migration 042: Fix shipment.distance_source ENUM (add osrm & air), add delivery_handover.direction for round-trip handovers,
-- deactivate all ferry sea_routes & supports_ferry flags (vessel-only) and unsafe >7-day sea_routes (>168h) for live racehorse welfare,
-- and seed aircraft_stall (Flying Stall) & vessel_pen fleet units.
-- Idempotent: safe to re-run.

-- 1. Expand shipment.distance_source ENUM so OSRM & air legs never fail MySQL Strict Mode
ALTER TABLE shipment
  MODIFY COLUMN distance_source ENUM('ors', 'osrm', 'air', 'table', 'estimated') NULL;

-- 2. Enforce vessel-only sea transport (no ferry) and deactivate >7-day (168h) sea voyages unsuitable for live thoroughbred welfare
UPDATE sea_route
SET is_active = FALSE
WHERE sea_mode = 'ferry' OR typical_hours > 168;

UPDATE seaport
SET supports_ferry = FALSE;

UPDATE seaport
SET is_active = FALSE
WHERE supports_vessel = FALSE AND code NOT IN ('VN-RGI', 'VN-PQC');

UPDATE seaport
SET supports_vessel = TRUE
WHERE code IN ('VN-RGI', 'VN-PQC');

-- 3. Add direction column to delivery_handover for round-trip outbound + return handovers (idempotent)
SET @has_dh_direction := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery_handover'
    AND COLUMN_NAME = 'direction'
);
SET @sql_dh_direction := IF(
  @has_dh_direction = 0,
  "ALTER TABLE delivery_handover ADD COLUMN direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound' AFTER shipment_horse_id",
  'SELECT 1'
);
PREPARE stmt_dh_direction FROM @sql_dh_direction;
EXECUTE stmt_dh_direction;
DEALLOCATE PREPARE stmt_dh_direction;

-- 4. Seed dedicated Flying Stalls (aircraft_stall / jet_stall) and Sea Vessel Pens (container / vessel_pen) idempotently
INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location)
SELECT 'aircraft_stall', 'jet_stall', 'AIR-STALL-SGN-01',
       (SELECT depot_id FROM depot WHERE code = 'VN-HCM-TD' LIMIT 1),
       3, 'available', 'Sân bay Tân Sơn Nhất (SGN) — Khoang chuồng bay HMA'
WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE plate_or_code = 'AIR-STALL-SGN-01');

INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location)
SELECT 'aircraft_stall', 'jet_stall', 'AIR-STALL-SGN-02',
       (SELECT depot_id FROM depot WHERE code = 'VN-HCM-TD' LIMIT 1),
       3, 'available', 'Sân bay Tân Sơn Nhất (SGN) — Khoang chuồng bay HMA'
WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE plate_or_code = 'AIR-STALL-SGN-02');

INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location)
SELECT 'aircraft_stall', 'jet_stall', 'AIR-STALL-HAN-01',
       (SELECT depot_id FROM depot WHERE code = 'VN-HN-LB' LIMIT 1),
       3, 'available', 'Sân bay Nội Bài (HAN) — Khoang chuồng bay HMA'
WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE plate_or_code = 'AIR-STALL-HAN-01');

INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location)
SELECT 'container', 'vessel_pen', 'SEA-PEN-CLI-01',
       (SELECT depot_id FROM depot WHERE code = 'VN-HCM-TD' LIMIT 1),
       2, 'available', 'Cảng Cát Lái (TP.HCM) — Ô tàu biển chuyên dụng'
WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE plate_or_code = 'SEA-PEN-CLI-01');

INSERT INTO vehicle (vehicle_type, vehicle_class_code, plate_or_code, depot_id, capacity, status, current_location)
SELECT 'container', 'vessel_pen', 'SEA-PEN-HPH-01',
       (SELECT depot_id FROM depot WHERE code = 'VN-HN-LB' LIMIT 1),
       2, 'available', 'Cảng Hải Phòng (Lạch Huyện) — Ô tàu biển chuyên dụng'
WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE plate_or_code = 'SEA-PEN-HPH-01');
