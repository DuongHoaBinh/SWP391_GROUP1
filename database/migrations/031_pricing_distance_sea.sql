-- Migration 031: Khoảng cách, bảng giá cấu hình, thêm đường thủy, báo giá (Step 4, review 11/2026).
-- Idempotent: chạy lại không lỗi, không đổi kết quả. Không DROP cột/bảng có dữ liệu.

-- 1. Mở rộng transport_mode của shipment và thêm sea_mode
ALTER TABLE shipment MODIFY COLUMN transport_mode ENUM('road','air','sea') NULL DEFAULT NULL;

SET @m031_sm = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'sea_mode') = 0,
  'ALTER TABLE shipment ADD COLUMN sea_mode ENUM(''ferry'',''vessel'') NULL AFTER transport_mode',
  'SELECT 1'
);
PREPARE m031_sm_stmt FROM @m031_sm;
EXECUTE m031_sm_stmt;
DEALLOCATE PREPARE m031_sm_stmt;

-- 2. Mở rộng transport_mode của regulation
ALTER TABLE regulation MODIFY COLUMN transport_mode ENUM('road','air','sea','both') NOT NULL DEFAULT 'both';

-- 3. Bảng cảng biển (seaport)
CREATE TABLE IF NOT EXISTS seaport (
  port_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dữ liệu demo cảng biển (tọa độ gần đúng)
INSERT INTO seaport (code, name, country, city, lat, lng, is_active) VALUES
  ('VN-RGI', 'Cảng Rạch Giá', 'Vietnam', 'Kiên Giang', 10.012500, 105.080900, TRUE),
  ('VN-PQC', 'Cảng Bãi Vòng (Phú Quốc)', 'Vietnam', 'Phú Quốc', 10.155700, 104.040200, TRUE),
  ('VN-CLI', 'Cảng Cát Lái', 'Vietnam', 'Hồ Chí Minh', 10.761700, 106.789400, TRUE),
  ('SG-PSA', 'Cảng Pasir Panjang', 'Singapore', 'Singapore', 1.273700, 103.790900, TRUE),
  ('TH-LCB', 'Cảng Laem Chabang', 'Thailand', 'Chonburi', 13.082700, 100.883000, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), country = VALUES(country), city = VALUES(city),
  lat = VALUES(lat), lng = VALUES(lng), is_active = VALUES(is_active);

-- 4. Bảng tuyến biển (sea_route)
CREATE TABLE IF NOT EXISTS sea_route (
  sea_route_id INT AUTO_INCREMENT PRIMARY KEY,
  from_port_id INT NOT NULL,
  to_port_id INT NOT NULL,
  sea_mode ENUM('ferry','vessel') NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  typical_hours DECIMAL(6,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_sea_route (from_port_id, to_port_id, sea_mode),
  CONSTRAINT fk_sea_route_from FOREIGN KEY (from_port_id) REFERENCES seaport(port_id),
  CONSTRAINT fk_sea_route_to FOREIGN KEY (to_port_id) REFERENCES seaport(port_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed tuyến biển demo
INSERT IGNORE INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 115.00, 2.50, TRUE, 'Tuyến phà cao tốc Rạch Giá - Phú Quốc'
FROM seaport p1, seaport p2
WHERE p1.code = 'VN-RGI' AND p2.code = 'VN-PQC';

INSERT IGNORE INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1300.00, 60.00, TRUE, 'Tuyến vận tải biển Cát Lái - Singapore'
FROM seaport p1, seaport p2
WHERE p1.code = 'VN-CLI' AND p2.code = 'SG-PSA';

INSERT IGNORE INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1250.00, 66.00, TRUE, 'Tuyến vận tải biển Cát Lái - Laem Chabang'
FROM seaport p1, seaport p2
WHERE p1.code = 'VN-CLI' AND p2.code = 'TH-LCB';

-- 5. Bảng giá cấu hình có phiên bản (pricing_tariff)
CREATE TABLE IF NOT EXISTS pricing_tariff (
  tariff_id INT AUTO_INCREMENT PRIMARY KEY,
  mode ENUM('road','air','sea') NOT NULL,
  region VARCHAR(20) NOT NULL DEFAULT 'VN',
  version INT NOT NULL,
  params JSON NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tariff_version (mode, region, version),
  CONSTRAINT fk_tariff_creator FOREIGN KEY (created_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed version 1 các bảng giá demo
INSERT IGNORE INTO pricing_tariff (mode, region, version, params, effective_from, is_active, notes, created_by) VALUES
('road', 'VN', 1, '{
  "openingFeePerVehicle": 2000000,
  "distanceTiers": [
    { "upToKm": 100, "pricePerKm": 45000 },
    { "upToKm": 500, "pricePerKm": 35000 },
    { "upToKm": null, "pricePerKm": 28000 }
  ],
  "careFeePerHorse": 500000,
  "deadheadPerKm": 15000,
  "nightSurchargePerVehicle": 1000000,
  "borderCrossingFee": 3000000,
  "roundingUnit": 1000,
  "averageSpeedKmh": 50
}', CURRENT_TIMESTAMP, TRUE, 'Bảng giá demo v1 theo file định hướng C3', NULL),

('air', 'VN', 1, '{
  "baseFeePerHorse": 60000000,
  "pricePerKmPerHorse": 25000,
  "airportHandlingPerHorse": 5000000,
  "privateStallMultiplier": 1.5,
  "roundingUnit": 1000,
  "averageSpeedKmh": 700
}', CURRENT_TIMESTAMP, TRUE, 'Bảng giá demo v1 theo file định hướng C3', NULL),

('sea', 'VN', 1, '{
  "ferry": { "ticketPerVehicle": 3000000 },
  "vessel": { "baseFeePerHorse": 15000000, "pricePerKmPerHorse": 8000 },
  "roundingUnit": 1000
}', CURRENT_TIMESTAMP, TRUE, 'Bảng giá demo v1 theo file định hướng C3', NULL);

-- 6. Bảng báo giá (shipment_quote)
CREATE TABLE IF NOT EXISTS shipment_quote (
  quote_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  transport_mode ENUM('road','air','sea') NOT NULL,
  sea_mode ENUM('ferry','vessel') NULL,
  input_json JSON NOT NULL,
  result_json JSON NOT NULL,
  tariff_versions_json JSON NOT NULL,
  freight_total BIGINT NOT NULL,
  insurance_total BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL,
  status ENUM('active','used','expired') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  used_by_shipment_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  INDEX idx_quote_customer (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Bổ sung các cột vào bảng shipment
SET @m031_qid = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'quote_id') = 0,
  'ALTER TABLE shipment ADD COLUMN quote_id INT NULL AFTER booking_type',
  'SELECT 1'
);
PREPARE m031_qid_stmt FROM @m031_qid;
EXECUTE m031_qid_stmt;
DEALLOCATE PREPARE m031_qid_stmt;

SET @m031_ps = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'pricing_snapshot') = 0,
  'ALTER TABLE shipment ADD COLUMN pricing_snapshot JSON NULL AFTER quote_id',
  'SELECT 1'
);
PREPARE m031_ps_stmt FROM @m031_ps;
EXECUTE m031_ps_stmt;
DEALLOCATE PREPARE m031_ps_stmt;

SET @m031_dkm = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'distance_km') = 0,
  'ALTER TABLE shipment ADD COLUMN distance_km DECIMAL(10,2) NULL AFTER pricing_snapshot',
  'SELECT 1'
);
PREPARE m031_dkm_stmt FROM @m031_dkm;
EXECUTE m031_dkm_stmt;
DEALLOCATE PREPARE m031_dkm_stmt;

SET @m031_dsrc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'distance_source') = 0,
  'ALTER TABLE shipment ADD COLUMN distance_source ENUM(''ors'',''estimated'',''table'') NULL AFTER distance_km',
  'SELECT 1'
);
PREPARE m031_dsrc_stmt FROM @m031_dsrc;
EXECUTE m031_dsrc_stmt;
DEALLOCATE PREPARE m031_dsrc_stmt;

SET @m031_olat = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'origin_lat') = 0,
  'ALTER TABLE shipment ADD COLUMN origin_lat DECIMAL(10,6) NULL, ADD COLUMN origin_lng DECIMAL(10,6) NULL, ADD COLUMN destination_lat DECIMAL(10,6) NULL, ADD COLUMN destination_lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m031_olat_stmt FROM @m031_olat;
EXECUTE m031_olat_stmt;
DEALLOCATE PREPARE m031_olat_stmt;

-- 8. Thêm FK ràng buộc quote_id và used_by_shipment_id
SET @m031_fk_quote = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND CONSTRAINT_NAME = 'fk_shipment_quote') = 0,
  'ALTER TABLE shipment ADD CONSTRAINT fk_shipment_quote FOREIGN KEY (quote_id) REFERENCES shipment_quote(quote_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE m031_fk_quote_stmt FROM @m031_fk_quote;
EXECUTE m031_fk_quote_stmt;
DEALLOCATE PREPARE m031_fk_quote_stmt;

SET @m031_fk_used = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_quote' AND CONSTRAINT_NAME = 'fk_quote_shipment') = 0,
  'ALTER TABLE shipment_quote ADD CONSTRAINT fk_quote_shipment FOREIGN KEY (used_by_shipment_id) REFERENCES shipment(shipment_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE m031_fk_used_stmt FROM @m031_fk_used;
EXECUTE m031_fk_used_stmt;
DEALLOCATE PREPARE m031_fk_used_stmt;
