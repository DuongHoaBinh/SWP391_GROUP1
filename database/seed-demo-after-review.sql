-- ============================================================================
-- EquiTransit - Idempotent Demo Seed Data After Review (Step 12)
-- Database: horse_transport_system
-- Safe to re-run: Uses natural keys and ON DUPLICATE KEY UPDATE.
-- All dates are relative to CURDATE() / NOW().
-- ============================================================================

-- 1. Demo Depots (VN + Partners)
INSERT INTO depot (code, name, country, city, address, lat, lng, type, is_active)
VALUES
  ('VN-HCM-TD', 'Trạm Điều phối Thủ Đức (TP.HCM)', 'Vietnam', 'Hồ Chí Minh', 'Số 12 Đường Song Hành, TP. Thủ Đức, TP.HCM', 10.8495000, 106.7725000, 'own', TRUE),
  ('VN-HN-LB', 'Trạm Trung chuyển Long Biên (Hà Nội)', 'Vietnam', 'Hà Nội', 'Số 45 Cổ Linh, Long Biên, Hà Nội', 21.0340000, 105.8920000, 'own', TRUE),
  ('VN-DN', 'Trạm Liên vận Miền Trung (Đà Nẵng)', 'Vietnam', 'Đà Nẵng', 'Số 88 Tôn Đức Thắng, Liên Chiểu, Đà Nẵng', 16.0544000, 108.1712000, 'own', TRUE),
  ('VN-CT', 'Trạm Đón trả Tây Nam Bộ (Cần Thơ)', 'Vietnam', 'Cần Thơ', 'Số 10 Võ Nguyên Giáp, Cái Răng, Cần Thơ', 10.0150000, 105.7920000, 'own', TRUE),
  ('KH-PNH', 'Trạm Đối tác Phnom Penh (Campuchia)', 'Cambodia', 'Phnom Penh', 'Russian Federation Blvd, Phnom Penh', 11.5564000, 104.8820000, 'partner', TRUE),
  ('TH-BKK', 'Trạm Đối tác Bangkok (Thái Lan)', 'Thailand', 'Bangkok', 'Vibhavadi Rangsit Rd, Bangkok', 13.8200000, 100.5600000, 'partner', TRUE),
  ('SG-SIN', 'Trạm Đối tác Turf Club (Singapore)', 'Singapore', 'Singapore', '1 Turf Club Ave, Singapore 738078', 1.4220000, 103.7620000, 'partner', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  country = VALUES(country),
  city = VALUES(city),
  address = VALUES(address),
  lat = VALUES(lat),
  lng = VALUES(lng),
  type = VALUES(type),
  is_active = VALUES(is_active);

-- 2. Demo 12 Vehicles Across Depots
INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-51C-001', 'truck', 'truck_1', 1, depot_id, 'available', 'Trạm Điều phối Thủ Đức (TP.HCM)'
FROM depot WHERE code = 'VN-HCM-TD'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-51C-002', 'truck', 'truck_1', 1, depot_id, 'available', 'Trạm Điều phối Thủ Đức (TP.HCM)'
FROM depot WHERE code = 'VN-HCM-TD'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-51C-003', 'truck', 'truck_2', 2, depot_id, 'available', 'Trạm Điều phối Thủ Đức (TP.HCM)'
FROM depot WHERE code = 'VN-HCM-TD'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-51C-004', 'truck', 'truck_4', 4, depot_id, 'available', 'Trạm Điều phối Thủ Đức (TP.HCM)'
FROM depot WHERE code = 'VN-HCM-TD'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-51C-005', 'truck', 'truck_6', 6, depot_id, 'available', 'Trạm Điều phối Thủ Đức (TP.HCM)'
FROM depot WHERE code = 'VN-HCM-TD'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-29C-006', 'truck', 'truck_2', 2, depot_id, 'available', 'Trạm Trung chuyển Long Biên (Hà Nội)'
FROM depot WHERE code = 'VN-HN-LB'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-29C-007', 'truck', 'truck_4', 4, depot_id, 'available', 'Trạm Trung chuyển Long Biên (Hà Nội)'
FROM depot WHERE code = 'VN-HN-LB'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-43C-008', 'truck', 'truck_4', 4, depot_id, 'available', 'Trạm Liên vận Miền Trung (Đà Nẵng)'
FROM depot WHERE code = 'VN-DN'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-65C-009', 'truck', 'truck_2', 2, depot_id, 'available', 'Trạm Đón trả Tây Nam Bộ (Cần Thơ)'
FROM depot WHERE code = 'VN-CT'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-PP-010', 'truck', 'truck_4', 4, depot_id, 'available', 'Trạm Đối tác Phnom Penh (Campuchia)'
FROM depot WHERE code = 'KH-PNH'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-BKK-011', 'truck', 'truck_4', 4, depot_id, 'available', 'Trạm Đối tác Bangkok (Thái Lan)'
FROM depot WHERE code = 'TH-BKK'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_or_code, vehicle_type, vehicle_class_code, capacity, depot_id, status, current_location)
SELECT 'DEMO-SG-012', 'truck', 'truck_2', 2, depot_id, 'available', 'Trạm Đối tác Turf Club (Singapore)'
FROM depot WHERE code = 'SG-SIN'
ON DUPLICATE KEY UPDATE vehicle_class_code = VALUES(vehicle_class_code), capacity = VALUES(capacity), status = VALUES(status);
