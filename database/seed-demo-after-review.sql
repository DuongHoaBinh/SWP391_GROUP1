-- ============================================================================
-- EquiTransit - Idempotent Demo Seed Data After Review (Step 12)
-- Database: horse_transport_system
-- Safe to re-run: Uses natural keys and ON DUPLICATE KEY UPDATE / WHERE NOT EXISTS.
-- All dates are relative to CURDATE() / NOW().
-- ============================================================================

-- 1. Demo Depots (VN + Partners)
INSERT INTO depot (depot_code, name, address, latitude, longitude, capacity_trucks, partner_network, is_active)
VALUES
  ('DEPOT-THUDUC', 'Trạm Điều phối Thủ Đức (TP.HCM)', 'Số 12 Đường Song Hành, TP. Thủ Đức, TP.HCM', 10.8495, 106.7725, 6, FALSE, TRUE),
  ('DEPOT-LONGBIEN', 'Trạm Trung chuyển Long Biên (Hà Nội)', 'Số 45 Cổ Linh, Long Biên, Hà Nội', 21.0340, 105.8920, 5, FALSE, TRUE),
  ('DEPOT-DANANG', 'Trạm Liên vận Miền Trung (Đà Nẵng)', 'Số 88 Tôn Đức Thắng, Liên Chiểu, Đà Nẵng', 16.0544, 108.1712, 4, FALSE, TRUE),
  ('DEPOT-CANTHO', 'Trạm Đón trả Tây Nam Bộ (Cần Thơ)', 'Số 10 Võ Nguyên Giáp, Cái Răng, Cần Thơ', 10.0150, 105.7920, 4, FALSE, TRUE),
  ('DEPOT-PHNOMPENH', 'Trạm Đối tác Phnom Penh (Campuchia)', 'Russian Federation Blvd, Phnom Penh', 11.5564, 104.8820, 4, TRUE, TRUE),
  ('DEPOT-BANGKOK', 'Trạm Đối tác Bangkok (Thái Lan)', 'Vibhavadi Rangsit Rd, Bangkok', 13.8200, 100.5600, 4, TRUE, TRUE),
  ('DEPOT-SINGAPORE', 'Trạm Đối tác Turf Club (Singapore)', '1 Turf Club Ave, Singapore 738078', 1.4220, 103.7620, 3, TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  address = VALUES(address),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  capacity_trucks = VALUES(capacity_trucks),
  partner_network = VALUES(partner_network),
  is_active = VALUES(is_active);

-- 2. Demo 12 Vehicles Across Depots
INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-51C-001', 'truck_1', 1, depot_id, FALSE, 'active', 'Hino', '300 Series (1 Stall)', DATE_SUB(CURDATE(), INTERVAL 15 DAY)
FROM depot WHERE depot_code = 'DEPOT-THUDUC'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-51C-002', 'truck_1', 1, depot_id, FALSE, 'active', 'Hino', '300 Series (1 Stall)', DATE_SUB(CURDATE(), INTERVAL 12 DAY)
FROM depot WHERE depot_code = 'DEPOT-THUDUC'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-51C-003', 'truck_2', 2, depot_id, FALSE, 'active', 'Isuzu', 'Forward FVR (2 Stalls)', DATE_SUB(CURDATE(), INTERVAL 20 DAY)
FROM depot WHERE depot_code = 'DEPOT-THUDUC'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-51C-004', 'truck_4', 4, depot_id, FALSE, 'active', 'Hyundai', 'HD210 Equine Air-Suspension (4 Stalls)', DATE_SUB(CURDATE(), INTERVAL 8 DAY)
FROM depot WHERE depot_code = 'DEPOT-THUDUC'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-51C-005', 'truck_6', 6, depot_id, FALSE, 'active', 'Scania', 'P320 Luxury Equine Carrier (6 Stalls)', DATE_SUB(CURDATE(), INTERVAL 5 DAY)
FROM depot WHERE depot_code = 'DEPOT-THUDUC'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-29C-006', 'truck_2', 2, depot_id, FALSE, 'active', 'Isuzu', 'Forward FVR (2 Stalls)', DATE_SUB(CURDATE(), INTERVAL 10 DAY)
FROM depot WHERE depot_code = 'DEPOT-LONGBIEN'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-29C-007', 'truck_4', 4, depot_id, FALSE, 'active', 'Hyundai', 'HD210 Air-Suspension (4 Stalls)', DATE_SUB(CURDATE(), INTERVAL 18 DAY)
FROM depot WHERE depot_code = 'DEPOT-LONGBIEN'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-43C-008', 'truck_4', 4, depot_id, FALSE, 'active', 'Hyundai', 'HD210 Air-Suspension (4 Stalls)', DATE_SUB(CURDATE(), INTERVAL 14 DAY)
FROM depot WHERE depot_code = 'DEPOT-DANANG'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-65C-009', 'truck_2', 2, depot_id, FALSE, 'active', 'Isuzu', 'Forward FVR (2 Stalls)', DATE_SUB(CURDATE(), INTERVAL 7 DAY)
FROM depot WHERE depot_code = 'DEPOT-CANTHO'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-PP-010', 'truck_4', 4, depot_id, TRUE, 'active', 'Hino', 'Cambodia Partner Fleet (4 Stalls)', DATE_SUB(CURDATE(), INTERVAL 10 DAY)
FROM depot WHERE depot_code = 'DEPOT-PHNOMPENH'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-BKK-011', 'truck_4', 4, depot_id, TRUE, 'active', 'Isuzu', 'Thailand Partner Fleet (4 Stalls)', DATE_SUB(CURDATE(), INTERVAL 12 DAY)
FROM depot WHERE depot_code = 'DEPOT-BANGKOK'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);

INSERT INTO vehicle (plate_number, vehicle_type, capacity, current_depot_id, is_partner, status, make, model, last_inspected_at)
SELECT 'DEMO-SG-012', 'truck_2', 2, depot_id, TRUE, 'active', 'Scania', 'Singapore Turf Club Partner (2 Stalls)', DATE_SUB(CURDATE(), INTERVAL 6 DAY)
FROM depot WHERE depot_code = 'DEPOT-SINGAPORE'
ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), capacity = VALUES(capacity), status = VALUES(status);
