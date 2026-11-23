-- Migration 036: Step 9 (review 11/2026)
-- Phân bổ nhiều xe + giữ chỗ xe khi tạo đơn, trạm own/partner + bảng giá đối tác,
-- giờ cấm xe tải nặng nội đô (HN, HCM) + ngoại lệ ngày lễ, tham số nghỉ dọc đường (B4).
-- Idempotent: chạy lại không lỗi, không đổi kết quả.
-- Dữ liệu giờ cấm và bảng giá đối tác là DỮ LIỆU DEMO, phải đối chiếu văn bản gốc trước khi dùng thật.

-- 1. Giữ chỗ xe (chống đặt trùng). Append-only theo trạng thái: active -> released | consumed.
CREATE TABLE IF NOT EXISTS vehicle_reservation (
  reservation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound',
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('active','released','consumed') NOT NULL DEFAULT 'active',
  released_reason VARCHAR(50) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME NULL,
  CONSTRAINT fk_vr_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_vr_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id),
  INDEX idx_vr_vehicle_time (vehicle_id, status, start_at, end_at),
  INDEX idx_vr_shipment (shipment_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. shipment: phương án xe đã chọn, giờ đón đã chốt (sau khi dời giờ cấm), phụ phí đêm
SET @m036_a = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'allocation_option_code') = 0,
  'ALTER TABLE shipment ADD COLUMN allocation_option_code VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE m036_a_stmt FROM @m036_a;
EXECUTE m036_a_stmt;
DEALLOCATE PREPARE m036_a_stmt;

SET @m036_b = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'allocation_snapshot') = 0,
  'ALTER TABLE shipment ADD COLUMN allocation_snapshot JSON NULL',
  'SELECT 1'
);
PREPARE m036_b_stmt FROM @m036_b;
EXECUTE m036_b_stmt;
DEALLOCATE PREPARE m036_b_stmt;

SET @m036_c = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'pickup_at') = 0,
  'ALTER TABLE shipment ADD COLUMN pickup_at DATETIME NULL',
  'SELECT 1'
);
PREPARE m036_c_stmt FROM @m036_c;
EXECUTE m036_c_stmt;
DEALLOCATE PREPARE m036_c_stmt;

SET @m036_d = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'night_surcharge_applied') = 0,
  'ALTER TABLE shipment ADD COLUMN night_surcharge_applied BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE m036_d_stmt FROM @m036_d;
EXECUTE m036_d_stmt;
DEALLOCATE PREPARE m036_d_stmt;

-- 3. route_leg: số jet stall của chặng bay, lý do Manager đổi xe so với phương án đã giữ
SET @m036_e = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'jet_stall_count') = 0,
  'ALTER TABLE route_leg ADD COLUMN jet_stall_count INT NULL',
  'SELECT 1'
);
PREPARE m036_e_stmt FROM @m036_e;
EXECUTE m036_e_stmt;
DEALLOCATE PREPARE m036_e_stmt;

SET @m036_f = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'allocation_override_reason') = 0,
  'ALTER TABLE route_leg ADD COLUMN allocation_override_reason VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE m036_f_stmt FROM @m036_f;
EXECUTE m036_f_stmt;
DEALLOCATE PREPARE m036_f_stmt;

-- 4. Giờ cấm xe tải nội đô (vùng tròn quanh trung tâm). Giờ là giờ địa phương Asia/Ho_Chi_Minh.
--    banned_from > banned_to nghĩa là khung cấm qua nửa đêm. days_of_week: 1 = Thứ 2 ... 7 = Chủ nhật (ISO).
CREATE TABLE IF NOT EXISTS city_truck_restriction (
  restriction_id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  center_lat DECIMAL(10,6) NOT NULL,
  center_lng DECIMAL(10,6) NOT NULL,
  radius_km DECIMAL(6,2) NOT NULL,
  applies_to_heavy_truck BOOLEAN NOT NULL DEFAULT TRUE,
  banned_from TIME NOT NULL,
  banned_to TIME NOT NULL,
  days_of_week VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6,7',
  legal_reference VARCHAR(255) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_demo_data BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_city_restriction (city, banned_from, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS city_restriction_exception (
  exception_id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  exception_date DATE NOT NULL,
  banned_from TIME NOT NULL,
  banned_to TIME NOT NULL,
  note VARCHAR(255) NULL,
  UNIQUE KEY uq_city_exception (city, exception_date, banned_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO city_truck_restriction
  (city, center_lat, center_lng, radius_km, applies_to_heavy_truck, banned_from, banned_to, days_of_week, legal_reference, effective_from, is_demo_data)
VALUES
  ('Hà Nội', 21.028500, 105.854200, 10.00, TRUE, '06:00:00', '21:00:00', '1,2,3,4,5,6,7',
   'QĐ 01/2026/QĐ-UBND Hà Nội (hiệu lực 15/01/2026) — dữ liệu demo, cần đối chiếu văn bản gốc', '2026-01-15', TRUE),
  ('Hồ Chí Minh', 10.776900, 106.700900, 12.00, TRUE, '06:00:00', '22:00:00', '1,2,3,4,5,6,7',
   'Quy định cấm xe tải nặng nội đô TP.HCM 6h–22h — dữ liệu demo, cần đối chiếu Sở GTVT', '2025-01-01', TRUE);

INSERT IGNORE INTO city_restriction_exception (city, exception_date, banned_from, banned_to, note) VALUES
  ('Hồ Chí Minh', '2026-04-30', '04:00:00', '11:30:00', 'Lịch cấm dịp lễ 30/4 (demo)');

-- 5. Cấu hình hệ thống dùng chung (Step 10 dùng tiếp)
CREATE TABLE IF NOT EXISTS system_setting (
  setting_key VARCHAR(100) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B4: EU Regulation 1/2005 làm tham chiếu
INSERT IGNORE INTO system_setting (setting_key, value_json) VALUES
  ('journey.rules', '{"maxDriveHoursBeforeRest": 8, "restMinutes": 60, "maxJourneyHours": 24, "mandatoryRestHours": 24, "nightWindow": {"from": "22:00", "to": "06:00"}}');

-- 6. Bảng giá đường bộ của trạm đối tác nước ngoài (region = PARTNER), demo
INSERT IGNORE INTO pricing_tariff (mode, region, version, params, effective_from, is_active, notes, created_by) VALUES
('road', 'PARTNER', 1, '{
  "openingFeePerVehicle": 3000000,
  "distanceTiers": [
    { "upToKm": 100, "pricePerKm": 54000 },
    { "upToKm": 500, "pricePerKm": 42000 },
    { "upToKm": null, "pricePerKm": 33600 }
  ],
  "careFeePerHorse": 500000,
  "deadheadPerKm": 18000,
  "nightSurchargePerVehicle": 1000000,
  "borderCrossingFee": 3000000,
  "roundingUnit": 1000,
  "averageSpeedKmh": 50
}', CURRENT_TIMESTAMP, TRUE, 'Bảng giá đối tác nước ngoài (demo)', NULL);
