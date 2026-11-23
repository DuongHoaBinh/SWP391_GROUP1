-- Migration 030: Trạm xe, loại phương tiện + sức chứa, bỏ gom chuyến (Step 3, review 11/2026).
-- Idempotent: chạy lại không lỗi, không đổi kết quả. Không DROP cột/bảng có dữ liệu (road_trip giữ cho đơn cũ).

-- 1. Trạm xe. type = partner: trạm đối tác ở nước ngoài, dùng cho chặng giao cuối.
CREATE TABLE IF NOT EXISTS depot (
  depot_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address VARCHAR(255) NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  type ENUM('own','partner') NOT NULL DEFAULT 'own',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dữ liệu demo: tọa độ trung tâm khu vực, cần thay bằng địa chỉ thật của doanh nghiệp.
INSERT INTO depot (code, name, country, city, address, lat, lng, type) VALUES
  ('VN-HCM-TD', 'Trạm Thủ Đức', 'Vietnam', 'Hồ Chí Minh', 'Xa lộ Hà Nội, TP. Thủ Đức, TP.HCM', 10.8494000, 106.7537000, 'own'),
  ('VN-HN-LB', 'Trạm Long Biên', 'Vietnam', 'Hà Nội', 'Quận Long Biên, Hà Nội', 21.0486000, 105.8880000, 'own'),
  ('VN-DN', 'Trạm Đà Nẵng', 'Vietnam', 'Đà Nẵng', 'Quận Liên Chiểu, Đà Nẵng', 16.0718000, 108.1508000, 'own'),
  ('VN-CT', 'Trạm Cần Thơ', 'Vietnam', 'Cần Thơ', 'Quận Cái Răng, Cần Thơ', 10.0003000, 105.7637000, 'own'),
  ('KH-PNH', 'Đối tác Phnom Penh', 'Cambodia', 'Phnom Penh', 'Phnom Penh, Cambodia', 11.5564000, 104.9282000, 'partner'),
  ('TH-BKK', 'Đối tác Bangkok', 'Thailand', 'Bangkok', 'Bangkok, Thailand', 13.7563000, 100.5018000, 'partner'),
  ('SG-SIN', 'Đối tác Singapore', 'Singapore', 'Singapore', 'Singapore', 1.3521000, 103.8198000, 'partner')
ON DUPLICATE KEY UPDATE code = code;

-- 2. Loại phương tiện và sức chứa (số ngựa). horse_capacity NULL = theo xe chở trên phà.
CREATE TABLE IF NOT EXISTS vehicle_class (
  code VARCHAR(30) PRIMARY KEY,
  mode ENUM('road','air','sea') NOT NULL,
  name_vi VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  horse_capacity INT NULL,
  price_coefficient DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  is_heavy_truck BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO vehicle_class (code, mode, name_vi, name_en, horse_capacity, price_coefficient, is_heavy_truck, sort_order) VALUES
  ('truck_1', 'road', 'Xe chở ngựa 1 chỗ', '1-horse transporter', 1, 1.00, FALSE, 10),
  ('truck_2', 'road', 'Xe chở ngựa 2 chỗ (≈7,5 tấn)', '2-horse lorry (~7.5 t)', 2, 1.00, FALSE, 20),
  ('truck_4', 'road', 'Xe tải ngựa 4 chỗ (≈18 tấn)', '4-horse lorry (~18 t)', 4, 1.30, TRUE, 30),
  ('truck_6', 'road', 'Xe tải ngựa 6 chỗ (≈26 tấn)', '6-horse lorry (~26 t)', 6, 1.60, TRUE, 40),
  ('jet_stall', 'air', 'Chuồng bay (jet stall)', 'Jet stall', 3, 1.00, FALSE, 50),
  ('ferry_slot', 'sea', 'Chỗ xe trên phà RoRo', 'RoRo ferry slot', NULL, 1.00, FALSE, 60),
  ('vessel_pen', 'sea', 'Ô chuồng trên tàu', 'Vessel pen', 1, 1.00, FALSE, 70)
ON DUPLICATE KEY UPDATE
  mode = VALUES(mode), name_vi = VALUES(name_vi), name_en = VALUES(name_en),
  horse_capacity = VALUES(horse_capacity), price_coefficient = VALUES(price_coefficient),
  is_heavy_truck = VALUES(is_heavy_truck), sort_order = VALUES(sort_order);

-- 3. vehicle.current_location (trước đây chỉ được thêm lúc backend khởi động)
SET @m030_vcl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle' AND COLUMN_NAME = 'current_location') = 0,
  'ALTER TABLE vehicle ADD COLUMN current_location VARCHAR(255) NULL DEFAULT ''Fleet Operations Depot''',
  'SELECT 1'
);
PREPARE m030_vcl_stmt FROM @m030_vcl;
EXECUTE m030_vcl_stmt;
DEALLOCATE PREPARE m030_vcl_stmt;

-- 3b. vehicle.depot_id
SET @m030_vd = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle' AND COLUMN_NAME = 'depot_id') = 0,
  'ALTER TABLE vehicle ADD COLUMN depot_id INT NULL AFTER plate_or_code',
  'SELECT 1'
);
PREPARE m030_vd_stmt FROM @m030_vd;
EXECUTE m030_vd_stmt;
DEALLOCATE PREPARE m030_vd_stmt;

SET @m030_vdfk = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle' AND CONSTRAINT_NAME = 'fk_vehicle_depot') = 0,
  'ALTER TABLE vehicle ADD CONSTRAINT fk_vehicle_depot FOREIGN KEY (depot_id) REFERENCES depot(depot_id)',
  'SELECT 1'
);
PREPARE m030_vdfk_stmt FROM @m030_vdfk;
EXECUTE m030_vdfk_stmt;
DEALLOCATE PREPARE m030_vdfk_stmt;

-- 3c. vehicle.vehicle_class_code
SET @m030_vc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle' AND COLUMN_NAME = 'vehicle_class_code') = 0,
  'ALTER TABLE vehicle ADD COLUMN vehicle_class_code VARCHAR(30) NULL AFTER vehicle_type',
  'SELECT 1'
);
PREPARE m030_vc_stmt FROM @m030_vc;
EXECUTE m030_vc_stmt;
DEALLOCATE PREPARE m030_vc_stmt;

SET @m030_vcfk = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle' AND CONSTRAINT_NAME = 'fk_vehicle_class') = 0,
  'ALTER TABLE vehicle ADD CONSTRAINT fk_vehicle_class FOREIGN KEY (vehicle_class_code) REFERENCES vehicle_class(code)',
  'SELECT 1'
);
PREPARE m030_vcfk_stmt FROM @m030_vcfk;
EXECUTE m030_vcfk_stmt;
DEALLOCATE PREPARE m030_vcfk_stmt;

-- 4. Gắn loại cho xe cũ theo sức chứa hiện có (giữ cột capacity để tương thích).
UPDATE vehicle SET vehicle_class_code = CASE
    WHEN capacity <= 1 THEN 'truck_1'
    WHEN capacity = 2 THEN 'truck_2'
    WHEN capacity <= 4 THEN 'truck_4'
    ELSE 'truck_6'
  END
WHERE vehicle_type = 'truck' AND vehicle_class_code IS NULL;

UPDATE vehicle SET vehicle_class_code = 'jet_stall'
WHERE vehicle_type = 'aircraft_stall' AND vehicle_class_code IS NULL;

UPDATE vehicle SET vehicle_class_code = 'vessel_pen'
WHERE vehicle_type = 'container' AND vehicle_class_code IS NULL;

-- Xe đường bộ cũ chưa có trạm → gán Trạm Thủ Đức (Manager chỉnh lại trên trang Trạm xe).
UPDATE vehicle v
JOIN depot d ON d.code = 'VN-HCM-TD'
SET v.depot_id = d.depot_id
WHERE v.vehicle_type = 'truck' AND v.depot_id IS NULL;

-- 5. Bỏ gom chuyến: đơn mới mặc định bao chuyến. Giá trị shared_stall giữ trong ENUM cho đơn cũ.
ALTER TABLE shipment MODIFY COLUMN booking_type ENUM('shared_stall','dedicated_charter') NOT NULL DEFAULT 'dedicated_charter';
