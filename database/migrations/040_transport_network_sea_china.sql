-- Migration 040: Mạng lưới vận tải Đông Nam Á + Trung Quốc (cảng, tuyến biển có hình học, sân bay theo vai trò,
-- cửa khẩu đường bộ, trạm nghỉ/kiểm dịch, trạm đối tác). Một nguồn dữ liệu cho cả bản đồ và báo giá.
-- Idempotent: chạy lại không lỗi, không đổi kết quả. Không DROP cột/bảng có dữ liệu.
-- Tọa độ là gần đúng cho demo; khoảng cách tuyến biển = độ dài polyline cảng → via_points → cảng.

-- 1. seaport: vai trò cảng và khả năng phục vụ
SET @m040_sp_name_en = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'name_en') = 0,
  'ALTER TABLE seaport ADD COLUMN name_en VARCHAR(150) NULL AFTER name',
  'SELECT 1'
);
PREPARE m040_sp_name_en_stmt FROM @m040_sp_name_en;
EXECUTE m040_sp_name_en_stmt;
DEALLOCATE PREPARE m040_sp_name_en_stmt;

SET @m040_sp_cc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'country_code') = 0,
  'ALTER TABLE seaport ADD COLUMN country_code CHAR(2) NULL AFTER country',
  'SELECT 1'
);
PREPARE m040_sp_cc_stmt FROM @m040_sp_cc;
EXECUTE m040_sp_cc_stmt;
DEALLOCATE PREPARE m040_sp_cc_stmt;

SET @m040_sp_intl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'is_international') = 0,
  'ALTER TABLE seaport ADD COLUMN is_international BOOLEAN NOT NULL DEFAULT TRUE AFTER lng',
  'SELECT 1'
);
PREPARE m040_sp_intl_stmt FROM @m040_sp_intl;
EXECUTE m040_sp_intl_stmt;
DEALLOCATE PREPARE m040_sp_intl_stmt;

SET @m040_sp_ferry = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'supports_ferry') = 0,
  'ALTER TABLE seaport ADD COLUMN supports_ferry BOOLEAN NOT NULL DEFAULT FALSE AFTER is_international',
  'SELECT 1'
);
PREPARE m040_sp_ferry_stmt FROM @m040_sp_ferry;
EXECUTE m040_sp_ferry_stmt;
DEALLOCATE PREPARE m040_sp_ferry_stmt;

SET @m040_sp_vessel = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'supports_vessel') = 0,
  'ALTER TABLE seaport ADD COLUMN supports_vessel BOOLEAN NOT NULL DEFAULT TRUE AFTER supports_ferry',
  'SELECT 1'
);
PREPARE m040_sp_vessel_stmt FROM @m040_sp_vessel;
EXECUTE m040_sp_vessel_stmt;
DEALLOCATE PREPARE m040_sp_vessel_stmt;

SET @m040_sp_quar = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seaport' AND COLUMN_NAME = 'has_quarantine') = 0,
  'ALTER TABLE seaport ADD COLUMN has_quarantine BOOLEAN NOT NULL DEFAULT FALSE AFTER supports_vessel',
  'SELECT 1'
);
PREPARE m040_sp_quar_stmt FROM @m040_sp_quar;
EXECUTE m040_sp_quar_stmt;
DEALLOCATE PREPARE m040_sp_quar_stmt;

INSERT INTO seaport (code, name, name_en, country, country_code, city, lat, lng, is_international, supports_ferry, supports_vessel, has_quarantine, is_active) VALUES
  ('VN-CLI', 'Cảng Cát Lái (TP.HCM)', 'Cat Lai Port (HCMC)', 'Vietnam', 'VN', 'Hồ Chí Minh', 10.761700, 106.789400, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('VN-VUT', 'Cảng Cái Mép – Thị Vải (Bà Rịa – Vũng Tàu)', 'Cai Mep – Thi Vai Port', 'Vietnam', 'VN', 'Bà Rịa – Vũng Tàu', 10.525600, 107.018500, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('VN-DAD', 'Cảng Tiên Sa (Đà Nẵng)', 'Tien Sa Port (Da Nang)', 'Vietnam', 'VN', 'Đà Nẵng', 16.121900, 108.219400, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('VN-HPH', 'Cảng Lạch Huyện (Hải Phòng)', 'Lach Huyen Port (Hai Phong)', 'Vietnam', 'VN', 'Hải Phòng', 20.844900, 106.889100, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('VN-RGI', 'Cảng Rạch Giá (Kiên Giang)', 'Rach Gia Ferry Port', 'Vietnam', 'VN', 'Kiên Giang', 10.012500, 105.080900, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('VN-HTN', 'Bến phà Hà Tiên (Kiên Giang)', 'Ha Tien Ferry Terminal', 'Vietnam', 'VN', 'Kiên Giang', 10.379000, 104.487000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('VN-PQC', 'Cảng Bãi Vòng (Phú Quốc)', 'Bai Vong Port (Phu Quoc)', 'Vietnam', 'VN', 'Phú Quốc', 10.155700, 104.040200, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('KH-KOS', 'Cảng tự trị Sihanoukville', 'Sihanoukville Autonomous Port', 'Cambodia', 'KH', 'Sihanoukville', 10.646200, 103.501500, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('TH-LCB', 'Cảng Laem Chabang', 'Laem Chabang Port', 'Thailand', 'TH', 'Chonburi', 13.082700, 100.883000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('TH-DSK', 'Bến phà Donsak (Surat Thani)', 'Donsak Ferry Pier', 'Thailand', 'TH', 'Surat Thani', 9.326000, 99.692000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('TH-SMI', 'Bến phà Lipa Noi (Koh Samui)', 'Lipa Noi Ferry Pier (Koh Samui)', 'Thailand', 'TH', 'Koh Samui', 9.513000, 99.937000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('MY-PKG', 'Cảng Port Klang (Westports)', 'Port Klang (Westports)', 'Malaysia', 'MY', 'Selangor', 2.999900, 101.392800, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('MY-PEN', 'Cảng Penang (Butterworth)', 'Penang Port (Butterworth)', 'Malaysia', 'MY', 'Penang', 5.410000, 100.365000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('MY-KCH', 'Cảng Senari (Kuching)', 'Senari Port (Kuching)', 'Malaysia', 'MY', 'Kuching', 1.570000, 110.420000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('MY-BKI', 'Cảng Sepanggar (Kota Kinabalu)', 'Sepanggar Port (Kota Kinabalu)', 'Malaysia', 'MY', 'Kota Kinabalu', 6.080000, 116.120000, TRUE, FALSE, TRUE, FALSE, TRUE),
  ('SG-PSA', 'Cảng Pasir Panjang (Singapore)', 'Pasir Panjang Terminal (Singapore)', 'Singapore', 'SG', 'Singapore', 1.273700, 103.790900, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('ID-JKT', 'Cảng Tanjung Priok (Jakarta)', 'Tanjung Priok Port (Jakarta)', 'Indonesia', 'ID', 'Jakarta', -6.104000, 106.880000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('ID-SUB', 'Cảng Tanjung Perak (Surabaya)', 'Tanjung Perak Port (Surabaya)', 'Indonesia', 'ID', 'Surabaya', -7.200000, 112.730000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('ID-BLW', 'Cảng Belawan (Medan)', 'Belawan Port (Medan)', 'Indonesia', 'ID', 'Medan', 3.785000, 98.690000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('ID-MRK', 'Bến phà Merak (Banten, Java)', 'Merak Ferry Port (Java)', 'Indonesia', 'ID', 'Banten', -5.930000, 105.995000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('ID-BKH', 'Bến phà Bakauheni (Lampung, Sumatra)', 'Bakauheni Ferry Port (Sumatra)', 'Indonesia', 'ID', 'Lampung', -5.870000, 105.750000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('ID-KTP', 'Bến phà Ketapang (Banyuwangi, Java)', 'Ketapang Ferry Port (Java)', 'Indonesia', 'ID', 'Banyuwangi', -8.143000, 114.399000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('ID-GLM', 'Bến phà Gilimanuk (Bali)', 'Gilimanuk Ferry Port (Bali)', 'Indonesia', 'ID', 'Bali', -8.162000, 114.437000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('PH-MNL', 'Cảng Manila South Harbor', 'Manila South Harbor', 'Philippines', 'PH', 'Manila', 14.585000, 120.965000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('PH-BTG', 'Cảng Batangas (Luzon)', 'Batangas Port (Luzon)', 'Philippines', 'PH', 'Batangas', 13.756000, 121.045000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('PH-CLP', 'Cảng Calapan (Mindoro)', 'Calapan Port (Mindoro)', 'Philippines', 'PH', 'Calapan', 13.425000, 121.185000, FALSE, TRUE, FALSE, FALSE, TRUE),
  ('BN-MUA', 'Cảng Muara (Brunei)', 'Muara Port (Brunei)', 'Brunei', 'BN', 'Muara', 5.025000, 115.070000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('MM-RGN', 'Cảng Thilawa (Yangon)', 'Thilawa Port (Yangon)', 'Myanmar', 'MM', 'Yangon', 16.660000, 96.270000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('HK-HKG', 'Cảng Kwai Tsing (Hồng Kông)', 'Kwai Tsing Container Terminals (Hong Kong)', 'Hong Kong', 'HK', 'Hong Kong', 22.345600, 114.122800, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-FCG', 'Cảng Phòng Thành (Quảng Tây)', 'Fangchenggang Port (Guangxi)', 'China', 'CN', 'Fangchenggang', 21.600000, 108.340000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-NSA', 'Cảng Nam Sa (Quảng Châu)', 'Nansha Port (Guangzhou)', 'China', 'CN', 'Guangzhou', 22.650000, 113.670000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-SHK', 'Cảng Xà Khẩu (Thâm Quyến)', 'Shekou Port (Shenzhen)', 'China', 'CN', 'Shenzhen', 22.470000, 113.900000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-XMN', 'Cảng Hạ Môn', 'Xiamen Port', 'China', 'CN', 'Xiamen', 24.450000, 118.070000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-SHA', 'Cảng Dương Sơn (Thượng Hải)', 'Yangshan Deep-Water Port (Shanghai)', 'China', 'CN', 'Shanghai', 30.620000, 122.070000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-TAO', 'Cảng Thanh Đảo', 'Qingdao Port', 'China', 'CN', 'Qingdao', 36.070000, 120.320000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-TSN', 'Cảng Thiên Tân', 'Tianjin Port', 'China', 'CN', 'Tianjin', 38.970000, 117.800000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CN-HAK', 'Cảng Tú Anh (Hải Khẩu, Hải Nam)', 'Xiuying Port (Haikou, Hainan)', 'China', 'CN', 'Haikou', 20.020000, 110.270000, TRUE, TRUE, TRUE, TRUE, TRUE),
  ('CN-HAN', 'Cảng Hải An (Từ Văn, Quảng Đông)', 'Hai''an Port (Xuwen, Guangdong)', 'China', 'CN', 'Xuwen', 20.260000, 110.180000, FALSE, TRUE, FALSE, FALSE, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), name_en = VALUES(name_en), country = VALUES(country), country_code = VALUES(country_code),
  city = VALUES(city), lat = VALUES(lat), lng = VALUES(lng), is_international = VALUES(is_international),
  supports_ferry = VALUES(supports_ferry), supports_vessel = VALUES(supports_vessel),
  has_quarantine = VALUES(has_quarantine), is_active = VALUES(is_active);

-- 2. sea_route: hình học tuyến (via_points) để bản đồ vẽ đúng trên biển
SET @m040_sr_via = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sea_route' AND COLUMN_NAME = 'via_points') = 0,
  'ALTER TABLE sea_route ADD COLUMN via_points JSON NULL AFTER typical_hours',
  'SELECT 1'
);
PREPARE m040_sr_via_stmt FROM @m040_sr_via;
EXECUTE m040_sr_via_stmt;
DEALLOCATE PREPARE m040_sr_via_stmt;

INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1202.00, 52.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[8.3,107],[5,105.8],[3,104.8],[1.4,104.55],[1.21,104.05],[1.22,103.85]]', TRUE, 'Hải trình Cát Lái – Singapore qua phía đông Côn Đảo và eo Singapore'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'SG-PSA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1167.00, 51.00, '[[10.38,107.05],[10.15,107.25],[8.3,107],[5,105.8],[3,104.8],[1.4,104.55],[1.21,104.05],[1.22,103.85]]', TRUE, 'Hải trình Cái Mép – Singapore'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-VUT' AND p2.code = 'SG-PSA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1193.00, 52.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[9.3,106.75],[8.45,105.6],[8.15,104.75],[9,103.6],[10.5,101.8],[12.2,100.8],[12.9,100.7]]', TRUE, 'Vòng mũi Cà Mau vào vịnh Thái Lan'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'TH-LCB'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 794.00, 37.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[9.3,106.75],[8.45,105.6],[8.15,104.75],[9,103.6],[10.35,103.45]]', TRUE, 'Vòng mũi Cà Mau tới Sihanoukville'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'KH-KOS'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 542.00, 27.00, '[[10.35,103.45],[10.3,102.8],[10.5,101.8],[12.2,100.8],[12.9,100.7]]', TRUE, 'Tuyến ven vịnh Thái Lan'
FROM seaport p1, seaport p2 WHERE p1.code = 'KH-KOS' AND p2.code = 'TH-LCB'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1493.00, 63.00, '[[12.9,100.7],[12.2,100.8],[10.5,101.8],[7.5,103],[5.5,103.9],[3,104.8],[1.4,104.55],[1.21,104.05],[1.22,103.85]]', TRUE, 'Dọc bờ đông bán đảo Mã Lai'
FROM seaport p1, seaport p2 WHERE p1.code = 'TH-LCB' AND p2.code = 'SG-PSA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 975.00, 44.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[10.75,108.6],[11.35,109.25],[12.2,109.55],[12.95,109.7],[13.75,109.55],[15.2,109.35],[16.3,108.45],[16.22,108.22]]', TRUE, 'Tuyến ven biển Bắc – Nam (nội địa)'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'VN-DAD'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1521.00, 65.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[10.75,108.6],[11.35,109.25],[12.2,109.55],[12.95,109.7],[13.75,109.55],[15.2,109.35],[16.3,108.45],[17.5,107.5],[19.2,106.4],[20.6,106.95]]', TRUE, 'Tuyến ven biển Bắc – Nam (nội địa)'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'VN-HPH'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 620.00, 30.00, '[[16.22,108.22],[16.3,108.45],[17.5,107.5],[19.2,106.4],[20.6,106.95]]', TRUE, 'Tuyến ven biển miền Trung – Bắc (nội địa)'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-DAD' AND p2.code = 'VN-HPH'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1689.00, 71.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[10.75,108.6],[11.35,109.25],[15,110.6],[18.5,112.4],[21.6,114.2],[22.18,114.05],[22.3,114.08],[22.33,114.11]]', TRUE, 'Biển Đông, tránh quần đảo Hoàng Sa'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'HK-HKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1654.00, 70.00, '[[10.38,107.05],[10.15,107.25],[10.75,108.6],[11.35,109.25],[15,110.6],[18.5,112.4],[21.6,114.2],[22.18,114.05],[22.3,114.08],[22.33,114.11]]', TRUE, 'Biển Đông'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-VUT' AND p2.code = 'HK-HKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1002.00, 45.00, '[[16.22,108.22],[16.3,108.45],[18.5,112.4],[21.6,114.2],[22.18,114.05],[22.3,114.08],[22.33,114.11]]', TRUE, 'Biển Đông, phía nam đảo Hải Nam'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-DAD' AND p2.code = 'HK-HKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 877.00, 40.00, '[[20.6,106.95],[20.5,107.3],[20.3,108.5],[20.15,109.8],[20.12,110.3],[20.12,110.75],[20.3,111.2],[21.2,112.5],[21.65,113.8],[22.18,114.05],[22.3,114.08],[22.33,114.11]]', TRUE, 'Qua eo biển Quỳnh Châu'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-HPH' AND p2.code = 'HK-HKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 244.00, 15.00, '[[20.6,106.95],[20.5,107.3],[20.8,108],[21.45,108.35]]', TRUE, 'Vịnh Bắc Bộ'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-HPH' AND p2.code = 'CN-FCG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1662.00, 70.00, '[[10.62,106.88],[10.4,107.02],[10.15,107.25],[10.75,108.6],[11,110.5],[12.5,115.5],[14,119.8],[14.33,120.52],[14.45,120.8]]', TRUE, 'Biển Đông, phía bắc quần đảo Trường Sa'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-CLI' AND p2.code = 'PH-MNL'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1244.00, 54.00, '[[22.33,114.11],[22.3,114.08],[22.18,114.05],[21.6,114.4],[18,119.3],[15.5,119.6],[14.33,120.52],[14.45,120.8]]', TRUE, 'Hồng Kông – vịnh Manila'
FROM seaport p1, seaport p2 WHERE p1.code = 'HK-HKG' AND p2.code = 'PH-MNL'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 2687.00, 109.00, '[[1.22,103.85],[1.21,104.05],[1.4,104.55],[5,106.5],[11,110.2],[15,110.6],[18.5,112.4],[21.6,114.2],[22.18,114.05],[22.3,114.08],[22.33,114.11]]', TRUE, 'Trục Singapore – Hồng Kông'
FROM seaport p1, seaport p2 WHERE p1.code = 'SG-PSA' AND p2.code = 'HK-HKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 385.00, 21.00, '[[1.2,103.72],[1.17,103.55],[1.4,103.05],[1.8,102.55],[2.1,102.05],[2.55,101.55],[2.9,101.18]]', TRUE, 'Eo biển Malacca'
FROM seaport p1, seaport p2 WHERE p1.code = 'SG-PSA' AND p2.code = 'MY-PKG'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 339.00, 19.00, '[[2.9,101.18],[3.6,100.6],[4.6,100.2],[5.15,100.32]]', TRUE, 'Eo biển Malacca (phía bắc)'
FROM seaport p1, seaport p2 WHERE p1.code = 'MY-PKG' AND p2.code = 'MY-PEN'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1435.00, 61.00, '[[5.55,100.3],[5.8,100.1],[6,99],[8,97.5],[11,96.9],[14,97],[16.2,96.5],[16.47,96.37]]', TRUE, 'Biển Andaman'
FROM seaport p1, seaport p2 WHERE p1.code = 'MY-PEN' AND p2.code = 'MM-RGN'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 321.00, 18.00, '[[2.9,101.18],[3.1,100.6],[3.7,99.2]]', TRUE, 'Băng ngang eo Malacca'
FROM seaport p1, seaport p2 WHERE p1.code = 'MY-PKG' AND p2.code = 'ID-BLW'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1022.00, 45.00, '[[1.22,103.85],[1.21,104.05],[1.25,104.65],[0.6,104.8],[-0.4,105.15],[-1.4,106.6],[-2.55,107.1],[-4.5,106.9],[-5.85,106.85]]', TRUE, 'Qua eo Gaspar (Bangka – Belitung)'
FROM seaport p1, seaport p2 WHERE p1.code = 'SG-PSA' AND p2.code = 'ID-JKT'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 740.00, 34.00, '[[-5.85,106.85],[-5.95,108.5],[-6,110],[-6,111.5],[-6.75,112.55],[-7.1,112.68]]', TRUE, 'Biển Java'
FROM seaport p1, seaport p2 WHERE p1.code = 'ID-JKT' AND p2.code = 'ID-SUB'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 806.00, 37.00, '[[1.22,103.85],[1.21,104.05],[1.4,104.55],[2.4,108.5],[2.3,109.9],[1.75,110.45]]', TRUE, 'Biển Đông – Sarawak'
FROM seaport p1, seaport p2 WHERE p1.code = 'SG-PSA' AND p2.code = 'MY-KCH'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 1335.00, 57.00, '[[1.22,103.85],[1.21,104.05],[1.4,104.55],[3.2,108.6],[5.1,114.5],[5.08,114.95]]', TRUE, 'Biển Đông – Brunei'
FROM seaport p1, seaport p2 WHERE p1.code = 'SG-PSA' AND p2.code = 'BN-MUA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 206.00, 14.00, '[[5.2,114.95],[5.6,115],[6,115.7],[6.1,116.05]]', TRUE, 'Ven biển Sabah'
FROM seaport p1, seaport p2 WHERE p1.code = 'BN-MUA' AND p2.code = 'MY-BKI'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 61.00, 8.00, '[[22.35,114.06],[22.4,113.88],[22.56,113.74]]', TRUE, 'Cửa sông Châu Giang'
FROM seaport p1, seaport p2 WHERE p1.code = 'HK-HKG' AND p2.code = 'CN-NSA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 28.00, 7.00, '[[22.35,114.06],[22.43,113.93]]', TRUE, 'Cửa sông Châu Giang'
FROM seaport p1, seaport p2 WHERE p1.code = 'HK-HKG' AND p2.code = 'CN-SHK'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 514.00, 26.00, '[[22.3,114.16],[22.28,114.25],[22.22,114.33],[22.5,115.6],[23.2,117.3],[24.38,118.1]]', TRUE, 'Ven biển Quảng Đông – Phúc Kiến'
FROM seaport p1, seaport p2 WHERE p1.code = 'HK-HKG' AND p2.code = 'CN-XMN'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 500.00, 25.00, '[[22.33,114.11],[22.3,114.08],[22.18,114.05],[21.65,113.8],[21.2,112.5],[20.3,111.2],[20.12,110.75],[20.08,110.35]]', TRUE, 'Hồng Kông – Hải Nam'
FROM seaport p1, seaport p2 WHERE p1.code = 'HK-HKG' AND p2.code = 'CN-HAK'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 941.00, 42.00, '[[24.38,118.1],[25.2,120.1],[27,121.3],[29.9,122.95],[30.45,122.35]]', TRUE, 'Eo biển Đài Loan – Thượng Hải'
FROM seaport p1, seaport p2 WHERE p1.code = 'CN-XMN' AND p2.code = 'CN-SHA'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 719.00, 34.00, '[[30.45,122.35],[30.9,122.55],[32.5,122.7],[35.6,120.8]]', TRUE, 'Hoàng Hải'
FROM seaport p1, seaport p2 WHERE p1.code = 'CN-SHA' AND p2.code = 'CN-TAO'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', 845.00, 39.00, '[[35.8,120.7],[36.6,122.8],[37.4,123],[38.5,121.2],[38.7,119]]', TRUE, 'Vòng bán đảo Sơn Đông vào vịnh Bột Hải'
FROM seaport p1, seaport p2 WHERE p1.code = 'CN-TAO' AND p2.code = 'CN-TSN'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 115.00, 6.00, '[[10.05,104.7],[10.15,104.2]]', TRUE, 'Phà RoRo Rạch Giá – Phú Quốc'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-RGI' AND p2.code = 'VN-PQC'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 55.00, 3.50, '[[10.3,104.25]]', TRUE, 'Phà RoRo Hà Tiên – Phú Quốc'
FROM seaport p1, seaport p2 WHERE p1.code = 'VN-HTN' AND p2.code = 'VN-PQC'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 35.00, 2.50, '[[9.45,99.8]]', TRUE, 'Phà RoRo Donsak – Koh Samui'
FROM seaport p1, seaport p2 WHERE p1.code = 'TH-DSK' AND p2.code = 'TH-SMI'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 28.00, 2.00, '[[20.14,110.22]]', TRUE, 'Phà RoRo eo Quỳnh Châu (Hải An – Hải Khẩu)'
FROM seaport p1, seaport p2 WHERE p1.code = 'CN-HAN' AND p2.code = 'CN-HAK'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 28.00, 2.00, '[[-5.9,105.87]]', TRUE, 'Phà RoRo eo Sunda (Java – Sumatra)'
FROM seaport p1, seaport p2 WHERE p1.code = 'ID-MRK' AND p2.code = 'ID-BKH'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 5.00, 1.00, '[]', TRUE, 'Phà RoRo eo Bali (Java – Bali)'
FROM seaport p1, seaport p2 WHERE p1.code = 'ID-KTP' AND p2.code = 'ID-GLM'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, via_points, is_active, notes)
SELECT p1.port_id, p2.port_id, 'ferry', 42.00, 2.50, '[[13.6,121.05]]', TRUE, 'Phà RoRo Batangas – Calapan (Luzon – Mindoro)'
FROM seaport p1, seaport p2 WHERE p1.code = 'PH-BTG' AND p2.code = 'PH-CLP'
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), typical_hours = VALUES(typical_hours),
  via_points = VALUES(via_points), is_active = VALUES(is_active), notes = VALUES(notes);

-- 3. airport: mã quốc gia + vai trò mạng bay (hub: trung chuyển quốc tế; gateway: bay thẳng; regional: phải nối chuyến qua hub)
SET @m040_ap_cc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'airport' AND COLUMN_NAME = 'country_code') = 0,
  'ALTER TABLE airport ADD COLUMN country_code CHAR(2) NULL AFTER country',
  'SELECT 1'
);
PREPARE m040_ap_cc_stmt FROM @m040_ap_cc;
EXECUTE m040_ap_cc_stmt;
DEALLOCATE PREPARE m040_ap_cc_stmt;

SET @m040_ap_role = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'airport' AND COLUMN_NAME = 'air_role') = 0,
  'ALTER TABLE airport ADD COLUMN air_role ENUM(''hub'',''gateway'',''regional'') NOT NULL DEFAULT ''gateway'' AFTER has_equine_cargo_ramp',
  'SELECT 1'
);
PREPARE m040_ap_role_stmt FROM @m040_ap_role;
EXECUTE m040_ap_role_stmt;
DEALLOCATE PREPARE m040_ap_role_stmt;

SET @m040_ap_active = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'airport' AND COLUMN_NAME = 'is_active') = 0,
  'ALTER TABLE airport ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER air_role',
  'SELECT 1'
);
PREPARE m040_ap_active_stmt FROM @m040_ap_active;
EXECUTE m040_ap_active_stmt;
DEALLOCATE PREPARE m040_ap_active_stmt;

INSERT INTO airport (iata_code, icao_code, name, city, country, country_code, has_quarantine_facility, has_equine_cargo_ramp, air_role, is_active, lat, lng) VALUES
  ('SGN', 'VVTS', 'Sân bay Quốc tế Tân Sơn Nhất (Cargo Terminal)', 'TP. Hồ Chí Minh', 'Vietnam', 'VN', TRUE, TRUE, 'gateway', TRUE, 10.818500, 106.651900),
  ('HAN', 'VVNB', 'Sân bay Quốc tế Nội Bài (North Cargo Hub)', 'Hà Nội', 'Vietnam', 'VN', TRUE, TRUE, 'gateway', TRUE, 21.221200, 105.807200),
  ('DAD', 'VVDN', 'Sân bay Quốc tế Đà Nẵng (Central Cargo Terminal)', 'Đà Nẵng', 'Vietnam', 'VN', TRUE, TRUE, 'gateway', TRUE, 16.053800, 108.199400),
  ('VCA', 'VVCT', 'Sân bay Quốc tế Cần Thơ (Mekong Cargo Terminal)', 'Cần Thơ', 'Vietnam', 'VN', TRUE, TRUE, 'regional', TRUE, 10.085100, 105.711900),
  ('CXR', 'VVCR', 'Sân bay Quốc tế Cam Ranh (Khánh Hòa)', 'Khánh Hòa', 'Vietnam', 'VN', FALSE, TRUE, 'regional', TRUE, 11.998000, 109.219000),
  ('PQC', 'VVPQ', 'Sân bay Quốc tế Phú Quốc', 'Phú Quốc', 'Vietnam', 'VN', FALSE, TRUE, 'regional', TRUE, 10.169800, 103.993100),
  ('PNH', 'VDPP', 'Phnom Penh International Airport (Live Animal Cargo)', 'Phnom Penh', 'Cambodia', 'KH', TRUE, TRUE, 'regional', TRUE, 11.546600, 104.844100),
  ('VTE', 'VLVT', 'Sân bay Quốc tế Wattay (Viêng Chăn)', 'Vientiane', 'Laos', 'LA', TRUE, TRUE, 'regional', TRUE, 17.988300, 102.563300),
  ('BKK', 'VTBS', 'Bangkok Suvarnabhumi Airport (Free Zone Cargo)', 'Bangkok', 'Thailand', 'TH', TRUE, TRUE, 'hub', TRUE, 13.690000, 100.750100),
  ('CNX', 'VTCC', 'Sân bay Quốc tế Chiang Mai', 'Chiang Mai', 'Thailand', 'TH', FALSE, TRUE, 'regional', TRUE, 18.766800, 98.962600),
  ('RGN', 'VYYY', 'Sân bay Quốc tế Yangon', 'Yangon', 'Myanmar', 'MM', TRUE, TRUE, 'regional', TRUE, 16.907300, 96.133200),
  ('KUL', 'WMKK', 'Kuala Lumpur International Airport (KLIA Cargo)', 'Sepang', 'Malaysia', 'MY', TRUE, TRUE, 'hub', TRUE, 2.745600, 101.709900),
  ('PEN', 'WMKP', 'Sân bay Quốc tế Penang (Bayan Lepas)', 'Penang', 'Malaysia', 'MY', TRUE, TRUE, 'gateway', TRUE, 5.297100, 100.276900),
  ('KCH', 'WBGG', 'Sân bay Quốc tế Kuching (Sarawak)', 'Kuching', 'Malaysia', 'MY', TRUE, TRUE, 'regional', TRUE, 1.484700, 110.347000),
  ('SIN', 'WSSS', 'Singapore Changi International Airport (ALPS Cargo Hub)', 'Singapore', 'Singapore', 'SG', TRUE, TRUE, 'hub', TRUE, 1.364400, 103.991500),
  ('CGK', 'WIII', 'Soekarno-Hatta International Airport (Jakarta Cargo Hub)', 'Jakarta', 'Indonesia', 'ID', TRUE, TRUE, 'gateway', TRUE, -6.125600, 106.655900),
  ('SUB', 'WARR', 'Juanda International Airport (Surabaya Cargo Hub)', 'Surabaya', 'Indonesia', 'ID', TRUE, TRUE, 'gateway', TRUE, -7.379800, 112.787600),
  ('DPS', 'WADD', 'Ngurah Rai International Airport (Bali Cargo Terminal)', 'Denpasar', 'Indonesia', 'ID', TRUE, TRUE, 'gateway', TRUE, -8.748200, 115.167200),
  ('BDJ', 'WAOO', 'Syamsudin Noor Airport (Kalimantan Regional Cargo Hub)', 'Banjarmasin', 'Indonesia', 'ID', TRUE, TRUE, 'regional', TRUE, -3.447400, 114.757800),
  ('KNO', 'WIMM', 'Sân bay Quốc tế Kualanamu (Medan)', 'Medan', 'Indonesia', 'ID', TRUE, TRUE, 'regional', TRUE, 3.642200, 98.885300),
  ('MNL', 'RPLL', 'Sân bay Quốc tế Ninoy Aquino (Manila)', 'Manila', 'Philippines', 'PH', TRUE, TRUE, 'gateway', TRUE, 14.508600, 121.019800),
  ('BWN', 'WBSB', 'Sân bay Quốc tế Brunei', 'Bandar Seri Begawan', 'Brunei', 'BN', TRUE, TRUE, 'regional', TRUE, 4.944200, 114.928300),
  ('HKG', 'VHHH', 'Hong Kong International Airport (SuperTerminal 1)', 'Hồng Kông', 'Hong Kong', 'HK', TRUE, TRUE, 'hub', TRUE, 22.308000, 113.918500),
  ('PEK', 'ZBAA', 'Sân bay Quốc tế Thủ đô Bắc Kinh', 'Bắc Kinh', 'China', 'CN', TRUE, TRUE, 'hub', TRUE, 40.079900, 116.603100),
  ('PVG', 'ZSPD', 'Sân bay Quốc tế Phố Đông (Thượng Hải)', 'Thượng Hải', 'China', 'CN', TRUE, TRUE, 'hub', TRUE, 31.144300, 121.808300),
  ('CAN', 'ZGGG', 'Sân bay Quốc tế Bạch Vân (Quảng Châu)', 'Quảng Châu', 'China', 'CN', TRUE, TRUE, 'hub', TRUE, 23.392400, 113.298800),
  ('SZX', 'ZGSZ', 'Sân bay Quốc tế Bảo An (Thâm Quyến)', 'Thâm Quyến', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 22.639300, 113.810700),
  ('KMG', 'ZPPP', 'Sân bay Quốc tế Trường Thủy (Côn Minh)', 'Côn Minh', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 25.101900, 102.929200),
  ('NNG', 'ZGNN', 'Sân bay Quốc tế Ngô Vu (Nam Ninh)', 'Nam Ninh', 'China', 'CN', FALSE, TRUE, 'regional', TRUE, 22.608300, 108.172200),
  ('CTU', 'ZUUU', 'Sân bay Quốc tế Song Lưu (Thành Đô)', 'Thành Đô', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 30.578500, 103.947100),
  ('WUH', 'ZHHH', 'Sân bay Quốc tế Thiên Hà (Vũ Hán)', 'Vũ Hán', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 30.783800, 114.208100),
  ('XMN', 'ZSAM', 'Sân bay Quốc tế Cao Khi (Hạ Môn)', 'Hạ Môn', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 24.544000, 118.127700),
  ('TAO', 'ZSQD', 'Sân bay Quốc tế Giao Đông (Thanh Đảo)', 'Thanh Đảo', 'China', 'CN', TRUE, TRUE, 'regional', TRUE, 36.361900, 120.088300),
  ('TSN', 'ZBTJ', 'Sân bay Quốc tế Tân Hải (Thiên Tân)', 'Thiên Tân', 'China', 'CN', TRUE, TRUE, 'regional', TRUE, 39.124400, 117.346200),
  ('HAK', 'ZJHK', 'Sân bay Quốc tế Mỹ Lan (Hải Khẩu)', 'Hải Khẩu', 'China', 'CN', FALSE, TRUE, 'regional', TRUE, 19.934900, 110.459000)
ON DUPLICATE KEY UPDATE
  country_code = VALUES(country_code), has_quarantine_facility = VALUES(has_quarantine_facility),
  has_equine_cargo_ramp = VALUES(has_equine_cargo_ramp), air_role = VALUES(air_role), is_active = VALUES(is_active),
  lat = VALUES(lat), lng = VALUES(lng);

UPDATE airport SET country_code = 'AU', air_role = 'hub' WHERE iata_code = 'SYD' AND country_code IS NULL;
UPDATE airport SET country_code = 'AU', air_role = 'hub' WHERE iata_code = 'MEL' AND country_code IS NULL;
UPDATE airport SET country_code = 'JP', air_role = 'hub' WHERE iata_code = 'NRT' AND country_code IS NULL;
UPDATE airport SET country_code = 'AE', air_role = 'hub' WHERE iata_code = 'DXB' AND country_code IS NULL;
UPDATE airport SET country_code = 'DE', air_role = 'hub' WHERE iata_code = 'FRA' AND country_code IS NULL;
UPDATE airport SET country_code = 'FR', air_role = 'hub' WHERE iata_code = 'CDG' AND country_code IS NULL;
UPDATE airport SET country_code = 'US', air_role = 'hub' WHERE iata_code = 'JFK' AND country_code IS NULL;

-- 4. border_crossing: cửa khẩu đường bộ song phương (A ↔ B), dùng để lập tuyến xuyên biên giới
CREATE TABLE IF NOT EXISTS border_crossing (
  crossing_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NULL,
  country_a_code CHAR(2) NOT NULL,
  country_b_code CHAR(2) NOT NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  allows_live_animals BOOLEAN NOT NULL DEFAULT TRUE,
  has_vet_inspection BOOLEAN NOT NULL DEFAULT TRUE,
  avg_clearance_hours DECIMAL(5,2) NOT NULL DEFAULT 3.00,
  opening_hours VARCHAR(50) NULL,
  notes VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_border_countries (country_a_code, country_b_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO border_crossing (code, name, name_en, country_a_code, country_b_code, lat, lng, allows_live_animals, has_vet_inspection, avg_clearance_hours, opening_hours, notes, is_active) VALUES
  ('VNKH-MOCBAI', 'Cửa khẩu Quốc tế Mộc Bài – Bavet', 'Moc Bai – Bavet International Border', 'VN', 'KH', 11.074300, 106.182100, TRUE, TRUE, 3.00, '06:00–22:00', 'Trục Xuyên Á TP.HCM – Phnom Penh (QL22 / NR1)', TRUE),
  ('VNKH-TINHBIEN', 'Cửa khẩu Quốc tế Tịnh Biên – Phnom Den', 'Tinh Bien – Phnom Den International Border', 'VN', 'KH', 10.621100, 104.953600, TRUE, TRUE, 3.00, '06:00–20:00', 'Hành lang An Giang – Takeo – Phnom Penh', TRUE),
  ('VNKH-HATIEN', 'Cửa khẩu Hà Tiên (Xà Xía) – Prek Chak', 'Ha Tien (Xa Xia) – Prek Chak Border', 'VN', 'KH', 10.432600, 104.450800, FALSE, FALSE, 2.00, '07:00–17:00', 'Chưa có trạm kiểm dịch động vật sống', TRUE),
  ('VNKH-LETHANH', 'Cửa khẩu Quốc tế Lệ Thanh – O Yadav', 'Le Thanh – O Yadav International Border', 'VN', 'KH', 13.820000, 107.540000, TRUE, TRUE, 4.00, '07:00–19:00', 'Hành lang Gia Lai – Ratanakiri', TRUE),
  ('VNLA-CAUTREO', 'Cửa khẩu Quốc tế Cầu Treo – Nam Phao', 'Cau Treo – Nam Phao International Border', 'VN', 'LA', 18.388300, 105.158300, TRUE, TRUE, 4.00, '07:00–19:00', 'QL8A Vinh – Lak Sao – Thakhek', TRUE),
  ('VNLA-LAOBAO', 'Cửa khẩu Quốc tế Lao Bảo – Densavan', 'Lao Bao – Densavan International Border', 'VN', 'LA', 16.621400, 106.591700, TRUE, TRUE, 3.00, '07:00–19:00', 'Hành lang Kinh tế Đông – Tây (EWEC)', TRUE),
  ('VNLA-BOY', 'Cửa khẩu Quốc tế Bờ Y – Phou Keua', 'Bo Y – Phou Keua International Border', 'VN', 'LA', 14.708300, 107.545800, TRUE, TRUE, 4.00, '07:00–19:00', 'Ngã ba Đông Dương, QL40 – Attapeu', TRUE),
  ('VNLA-NAMCAN', 'Cửa khẩu Quốc tế Nậm Cắn – Nam Kan', 'Nam Can – Nam Kan Border', 'VN', 'LA', 19.394000, 104.137000, FALSE, FALSE, 3.00, '07:00–17:00', 'Đèo dốc, chưa nhận động vật sống', TRUE),
  ('VNCN-HUUNGHI', 'Cửa khẩu Quốc tế Hữu Nghị – Hữu Nghị Quan (Bằng Tường)', 'Huu Nghi – Youyiguan (Pingxiang) Border', 'VN', 'CN', 21.983300, 106.716700, TRUE, TRUE, 5.00, '07:00–22:00', 'Cao tốc Hà Nội – Lạng Sơn – Nam Ninh', TRUE),
  ('VNCN-LAOCAI', 'Cửa khẩu Quốc tế Lào Cai – Hà Khẩu', 'Lao Cai – Hekou International Border', 'VN', 'CN', 22.508600, 103.963600, TRUE, TRUE, 5.00, '07:00–22:00', 'Hành lang Côn Minh – Lào Cai – Hà Nội – Hải Phòng', TRUE),
  ('VNCN-MONGCAI', 'Cửa khẩu Quốc tế Móng Cái – Đông Hưng', 'Mong Cai – Dongxing International Border', 'VN', 'CN', 21.537800, 107.965300, TRUE, TRUE, 4.00, '07:00–22:00', 'Cầu Bắc Luân II', TRUE),
  ('KHTH-POIPET', 'Cửa khẩu Quốc tế Poipet – Aranyaprathet', 'Poipet – Aranyaprathet International Border', 'KH', 'TH', 13.655800, 102.551600, TRUE, TRUE, 3.00, '06:00–22:00', 'Trục Xuyên Á Phnom Penh – Bangkok', TRUE),
  ('KHTH-CHAMYEAM', 'Cửa khẩu Quốc tế Cham Yeam – Hat Lek', 'Cham Yeam – Hat Lek International Border', 'KH', 'TH', 11.633300, 102.906700, TRUE, TRUE, 3.00, '07:00–20:00', 'Hành lang ven biển phía Nam (NR48 – Trat)', TRUE),
  ('KHLA-TRAPEANG', 'Cửa khẩu Trapeang Kriel – Nong Nok Khiene', 'Trapeang Kriel – Nong Nok Khiene Border', 'KH', 'LA', 13.930000, 105.960000, TRUE, TRUE, 4.00, '07:00–17:00', 'NR7 Stung Treng – Pakse', TRUE),
  ('LATH-FRIEND1', 'Cầu Hữu Nghị Lào – Thái 1 (Viêng Chăn – Nong Khai)', 'Thai–Lao Friendship Bridge I (Vientiane – Nong Khai)', 'LA', 'TH', 17.878100, 102.716700, TRUE, TRUE, 3.00, '06:00–22:00', 'Cửa ngõ Viêng Chăn', TRUE),
  ('LATH-FRIEND2', 'Cầu Hữu Nghị Lào – Thái 2 (Savannakhet – Mukdahan)', 'Thai–Lao Friendship Bridge II (Savannakhet – Mukdahan)', 'LA', 'TH', 16.596400, 104.743300, TRUE, TRUE, 3.00, '06:00–22:00', 'Hành lang EWEC', TRUE),
  ('LATH-FRIEND3', 'Cầu Hữu Nghị Lào – Thái 3 (Thakhek – Nakhon Phanom)', 'Thai–Lao Friendship Bridge III (Thakhek – Nakhon Phanom)', 'LA', 'TH', 17.462800, 104.773100, TRUE, TRUE, 3.00, '06:00–22:00', 'Nối QL8 / QL12 Lào', TRUE),
  ('LATH-FRIEND4', 'Cầu Hữu Nghị Lào – Thái 4 (Houayxay – Chiang Khong)', 'Thai–Lao Friendship Bridge IV (Houayxay – Chiang Khong)', 'LA', 'TH', 20.213900, 100.453100, TRUE, TRUE, 3.00, '06:00–22:00', 'Hành lang Bắc – Nam R3A (Côn Minh – Bangkok)', TRUE),
  ('LACN-BOTEN', 'Cửa khẩu Quốc tế Boten – Mohan (Ma Hán)', 'Boten – Mohan International Border', 'LA', 'CN', 21.181700, 101.671700, TRUE, TRUE, 5.00, '08:00–20:00', 'Hành lang R3A và đường sắt Lào – Trung', TRUE),
  ('THMM-MAESOT', 'Cửa khẩu Mae Sot – Myawaddy (Cầu Hữu Nghị 2)', 'Mae Sot – Myawaddy Border (Friendship Bridge II)', 'TH', 'MM', 16.702800, 98.516700, TRUE, TRUE, 4.00, '06:00–18:00', 'Hành lang EWEC phía Tây', TRUE),
  ('THMY-SADAO', 'Cửa khẩu Sadao (Danok) – Bukit Kayu Hitam', 'Sadao (Danok) – Bukit Kayu Hitam Border', 'TH', 'MY', 6.516700, 100.416700, TRUE, TRUE, 3.00, '05:00–23:00', 'Trục Bắc – Nam bán đảo Mã Lai (AH2)', TRUE),
  ('THMY-PADANG', 'Cửa khẩu Padang Besar', 'Padang Besar Border', 'TH', 'MY', 6.661100, 100.321400, FALSE, FALSE, 2.00, '06:00–22:00', 'Chủ yếu đường sắt và hàng tổng hợp', TRUE),
  ('MYSG-TUAS', 'Cửa khẩu Tuas (Cầu Second Link)', 'Tuas Checkpoint (Second Link)', 'MY', 'SG', 1.348400, 103.636700, TRUE, TRUE, 3.00, '24/7', 'Tuyến ưu tiên cho xe chở động vật sống, có khu giữ ngựa', TRUE),
  ('MYSG-WOODLANDS', 'Cửa khẩu Woodlands (Causeway)', 'Woodlands Checkpoint (Causeway)', 'MY', 'SG', 1.445700, 103.768900, FALSE, FALSE, 2.00, '24/7', 'Ùn tắc, không nhận xe động vật sống', TRUE),
  ('MMCN-MUSE', 'Cửa khẩu Muse – Thụy Lệ (Ruili)', 'Muse – Ruili Border', 'MM', 'CN', 23.994400, 97.903600, TRUE, TRUE, 5.00, '08:00–20:00', 'Hành lang Mandalay – Lashio – Côn Minh', TRUE),
  ('CNHK-SZBAY', 'Cửa khẩu Vịnh Thâm Quyến (Shenzhen Bay Port)', 'Shenzhen Bay Control Point', 'CN', 'HK', 22.504200, 113.946900, TRUE, TRUE, 4.00, '06:30–24:00', 'Hành lang an toàn sinh học Hồng Kông – Tòng Hóa', TRUE),
  ('MYBN-SGTUJOH', 'Cửa khẩu Sungai Tujoh (Miri – Kuala Belait)', 'Sungai Tujoh Border (Miri – Kuala Belait)', 'MY', 'BN', 4.583300, 114.083300, TRUE, TRUE, 3.00, '06:00–24:00', 'Đảo Borneo', TRUE),
  ('MYID-TEBEDU', 'Cửa khẩu Tebedu – Entikong', 'Tebedu – Entikong Border', 'MY', 'ID', 0.983300, 110.358300, TRUE, TRUE, 4.00, '06:00–18:00', 'Đảo Borneo (Kuching – Pontianak)', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), name_en = VALUES(name_en), country_a_code = VALUES(country_a_code), country_b_code = VALUES(country_b_code),
  lat = VALUES(lat), lng = VALUES(lng), allows_live_animals = VALUES(allows_live_animals), has_vet_inspection = VALUES(has_vet_inspection),
  avg_clearance_hours = VALUES(avg_clearance_hours), opening_hours = VALUES(opening_hours), notes = VALUES(notes), is_active = VALUES(is_active);

-- 5. master_stop: mã trạm, quốc gia, cờ cao tốc. Trạm nghỉ/kiểm dịch dọc hành lang: 2 trạm liền kề đi được trong ≤ 8h lái
SET @m040_ms_code = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_stop' AND COLUMN_NAME = 'code') = 0,
  'ALTER TABLE master_stop ADD COLUMN code VARCHAR(40) NULL AFTER stop_id',
  'SELECT 1'
);
PREPARE m040_ms_code_stmt FROM @m040_ms_code;
EXECUTE m040_ms_code_stmt;
DEALLOCATE PREPARE m040_ms_code_stmt;

SET @m040_ms_cc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_stop' AND COLUMN_NAME = 'country_code') = 0,
  'ALTER TABLE master_stop ADD COLUMN country_code CHAR(2) NULL AFTER country',
  'SELECT 1'
);
PREPARE m040_ms_cc_stmt FROM @m040_ms_cc;
EXECUTE m040_ms_cc_stmt;
DEALLOCATE PREPARE m040_ms_cc_stmt;

SET @m040_ms_exp = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_stop' AND COLUMN_NAME = 'is_expressway') = 0,
  'ALTER TABLE master_stop ADD COLUMN is_expressway BOOLEAN NOT NULL DEFAULT FALSE AFTER has_stalls',
  'SELECT 1'
);
PREPARE m040_ms_exp_stmt FROM @m040_ms_exp;
EXECUTE m040_ms_exp_stmt;
DEALLOCATE PREPARE m040_ms_exp_stmt;

SET @m040_ms_active = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_stop' AND COLUMN_NAME = 'is_active') = 0,
  'ALTER TABLE master_stop ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER lng',
  'SELECT 1'
);
PREPARE m040_ms_active_stmt FROM @m040_ms_active;
EXECUTE m040_ms_active_stmt;
DEALLOCATE PREPARE m040_ms_active_stmt;

SET @m040_ms_uq = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_stop' AND INDEX_NAME = 'uq_master_stop_code') = 0,
  'ALTER TABLE master_stop ADD UNIQUE KEY uq_master_stop_code (code)',
  'SELECT 1'
);
PREPARE m040_ms_uq_stmt FROM @m040_ms_uq;
EXECUTE m040_ms_uq_stmt;
DEALLOCATE PREPARE m040_ms_uq_stmt;

UPDATE master_stop SET code = 'VN-R-CUCHI' WHERE code IS NULL AND name = 'Trạm trung chuyển & Nghỉ dưỡng ngựa Củ Chi' ORDER BY stop_id LIMIT 1;
UPDATE master_stop SET code = 'VN-R-TRUNGLUONG' WHERE code IS NULL AND name = 'Trạm dừng chân & Tiếp nhiên liệu Tiền Giang' ORDER BY stop_id LIMIT 1;
UPDATE master_stop SET code = 'VN-Q-SGN' WHERE code IS NULL AND name = 'Trạm kiểm dịch Thú y Vùng VI (Cảng SGN Cargo)' ORDER BY stop_id LIMIT 1;
UPDATE master_stop SET code = 'VN-Q-MOCBAI' WHERE code IS NULL AND name = 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài' ORDER BY stop_id LIMIT 1;
UPDATE master_stop SET code = 'SG-B-TUAS' WHERE code IS NULL AND name = 'Tuas Checkpoint & Equine Holding Facility' ORDER BY stop_id LIMIT 1;
UPDATE master_stop SET country_code = 'VN' WHERE country_code IS NULL AND country IN ('Vietnam', 'Việt Nam');
UPDATE master_stop SET country_code = 'SG' WHERE country_code IS NULL AND country = 'Singapore';
UPDATE master_stop SET country_code = 'AU' WHERE country_code IS NULL AND country = 'Australia';
UPDATE master_stop SET country_code = 'CN' WHERE country_code IS NULL AND name = 'Cửa khẩu Quốc tế Hữu Nghị';

INSERT INTO master_stop (code, name, stop_type, address, city, country, country_code, has_veterinarian, has_stalls, is_expressway, lat, lng, is_active) VALUES
  ('VN-R-CUCHI', 'Trạm trung chuyển & Nghỉ dưỡng ngựa Củ Chi', 'rest', NULL, 'TP. Hồ Chí Minh', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 11.026700, 106.516700, TRUE),
  ('VN-R-TRUNGLUONG', 'Trạm dừng chân & Tiếp nhiên liệu Tiền Giang', 'rest', NULL, 'Tiền Giang', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 10.416700, 106.166700, TRUE),
  ('VN-Q-SGN', 'Trạm kiểm dịch Thú y Vùng VI (Cảng SGN Cargo)', 'quarantine', NULL, 'TP. Hồ Chí Minh', 'Vietnam', 'VN', TRUE, TRUE, FALSE, 10.815000, 106.660000, TRUE),
  ('VN-Q-MOCBAI', 'Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài', 'quarantine', NULL, 'Tây Ninh', 'Vietnam', 'VN', TRUE, TRUE, FALSE, 11.066700, 106.183300, TRUE),
  ('VN-R-TAYNINH', 'Trạm nghỉ thú y Tây Ninh (QL22)', 'rest', NULL, 'Tây Ninh', 'Vietnam', 'VN', FALSE, TRUE, FALSE, 11.310000, 106.100000, TRUE),
  ('VN-R-CANTHO', 'Trạm nghỉ thú y Cần Thơ (Cái Răng)', 'rest', NULL, 'Cần Thơ', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 10.000000, 105.770000, TRUE),
  ('VN-R-LONGXUYEN', 'Trạm nghỉ Long Xuyên (An Giang)', 'rest', NULL, 'An Giang', 'Vietnam', 'VN', FALSE, TRUE, FALSE, 10.380000, 105.430000, TRUE),
  ('VN-R-RACHGIA', 'Trạm nghỉ Rạch Giá (Kiên Giang)', 'rest', NULL, 'Kiên Giang', 'Vietnam', 'VN', FALSE, TRUE, FALSE, 10.000000, 105.100000, TRUE),
  ('VN-R-PHANTHIET', 'Trạm nghỉ thú y Phan Thiết (Cao tốc Bắc – Nam)', 'rest', NULL, 'Bình Thuận', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 10.950000, 108.050000, TRUE),
  ('VN-R-CAMRANH', 'Trạm kiểm dịch động vật Cam Ranh (Khánh Hòa)', 'rest', NULL, 'Khánh Hòa', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 11.980000, 109.150000, TRUE),
  ('VN-R-DALAT', 'Trạm nghỉ Đà Lạt (Lâm Đồng)', 'rest', NULL, 'Lâm Đồng', 'Vietnam', 'VN', FALSE, TRUE, FALSE, 11.940000, 108.440000, TRUE),
  ('VN-R-BMT', 'Trạm nghỉ thú y Buôn Ma Thuột (QL14)', 'rest', NULL, 'Đắk Lắk', 'Vietnam', 'VN', TRUE, TRUE, FALSE, 12.680000, 108.050000, TRUE),
  ('VN-R-PLEIKU', 'Trạm nghỉ Pleiku (Gia Lai)', 'rest', NULL, 'Gia Lai', 'Vietnam', 'VN', FALSE, TRUE, FALSE, 13.980000, 108.000000, TRUE),
  ('VN-R-QUYNHON', 'Trạm nghỉ thú y Quy Nhơn (Bình Định)', 'rest', NULL, 'Bình Định', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 13.780000, 109.150000, TRUE),
  ('VN-R-QUANGNGAI', 'Trạm nghỉ Quảng Ngãi (Cao tốc Đà Nẵng – Quảng Ngãi)', 'rest', NULL, 'Quảng Ngãi', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 15.120000, 108.800000, TRUE),
  ('VN-R-DANANG', 'Trạm kiểm dịch thú y QL1A – Đà Nẵng', 'rest', NULL, 'Đà Nẵng', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 16.030000, 108.170000, TRUE),
  ('VN-R-HUE', 'Trạm nghỉ Huế (Phú Bài)', 'rest', NULL, 'Thừa Thiên Huế', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 16.450000, 107.580000, TRUE),
  ('VN-R-DONGHA', 'Trạm nghỉ Đông Hà (Quảng Trị)', 'rest', NULL, 'Quảng Trị', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 16.810000, 107.080000, TRUE),
  ('VN-R-DONGHOI', 'Trạm nghỉ thú y Đồng Hới (Quảng Bình)', 'rest', NULL, 'Quảng Bình', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 17.460000, 106.600000, TRUE),
  ('VN-R-HATINH', 'Trạm nghỉ Hà Tĩnh', 'rest', NULL, 'Hà Tĩnh', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 18.340000, 105.900000, TRUE),
  ('VN-R-VINH', 'Trạm thú y kiểm soát dịch bệnh Vinh (Nghệ An)', 'rest', NULL, 'Nghệ An', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 18.680000, 105.680000, TRUE),
  ('VN-R-THANHHOA', 'Trạm nghỉ Thanh Hóa', 'rest', NULL, 'Thanh Hóa', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 19.800000, 105.770000, TRUE),
  ('VN-R-NINHBINH', 'Trạm nghỉ thú y Ninh Bình (Cao tốc Pháp Vân – Cầu Giẽ)', 'rest', NULL, 'Ninh Bình', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 20.250000, 105.970000, TRUE),
  ('VN-R-SOCSON', 'Trạm nghỉ & Trung chuyển ngựa Sóc Sơn (Hà Nội)', 'rest', NULL, 'Hà Nội', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 21.250000, 105.850000, TRUE),
  ('VN-R-LANGSON', 'Trạm nghỉ thú y Lạng Sơn', 'rest', NULL, 'Lạng Sơn', 'Vietnam', 'VN', TRUE, TRUE, TRUE, 21.850000, 106.760000, TRUE),
  ('VN-R-YENBAI', 'Trạm nghỉ Yên Bái (Cao tốc Nội Bài – Lào Cai)', 'rest', NULL, 'Yên Bái', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 21.720000, 104.900000, TRUE),
  ('VN-R-HALONG', 'Trạm nghỉ Hạ Long (Quảng Ninh)', 'rest', NULL, 'Quảng Ninh', 'Vietnam', 'VN', FALSE, TRUE, TRUE, 20.950000, 107.080000, TRUE),
  ('VN-R-PHUQUOC', 'Trạm nghỉ Phú Quốc (Dương Đông)', 'rest', NULL, 'Phú Quốc', 'Vietnam', 'VN', TRUE, TRUE, FALSE, 10.220000, 103.960000, TRUE),
  ('KH-R-PHNOMPENH', 'Trạm nghỉ & Thú y Phnom Penh', 'rest', NULL, 'Phnom Penh', 'Cambodia', 'KH', TRUE, TRUE, FALSE, 11.556400, 104.928200, TRUE),
  ('KH-R-SISOPHON', 'Trạm nghỉ Sisophon (NR5)', 'rest', NULL, 'Banteay Meanchey', 'Cambodia', 'KH', FALSE, TRUE, FALSE, 13.585000, 102.973000, TRUE),
  ('KH-R-SIEMREAP', 'Trạm nghỉ Siem Reap', 'rest', NULL, 'Siem Reap', 'Cambodia', 'KH', TRUE, TRUE, FALSE, 13.360000, 103.860000, TRUE),
  ('KH-R-KOHKONG', 'Trạm nghỉ Koh Kong (NR48)', 'rest', NULL, 'Koh Kong', 'Cambodia', 'KH', FALSE, TRUE, FALSE, 11.615000, 102.983000, TRUE),
  ('KH-R-STUNGTRENG', 'Trạm nghỉ Stung Treng (NR7)', 'rest', NULL, 'Stung Treng', 'Cambodia', 'KH', FALSE, TRUE, FALSE, 13.525000, 105.968000, TRUE),
  ('LA-R-VIENTIANE', 'Trạm nghỉ & Thú y Viêng Chăn', 'rest', NULL, 'Vientiane', 'Laos', 'LA', TRUE, TRUE, FALSE, 17.966700, 102.600000, TRUE),
  ('LA-R-LAKSAO', 'Trạm nghỉ Lak Sao (QL8)', 'rest', NULL, 'Bolikhamxay', 'Laos', 'LA', FALSE, TRUE, FALSE, 18.190000, 104.970000, TRUE),
  ('LA-R-THAKHEK', 'Trạm nghỉ Thakhek', 'rest', NULL, 'Khammouane', 'Laos', 'LA', FALSE, TRUE, FALSE, 17.410000, 104.800000, TRUE),
  ('LA-R-SAVANNAKHET', 'Trạm nghỉ thú y Savannakhet', 'rest', NULL, 'Savannakhet', 'Laos', 'LA', TRUE, TRUE, FALSE, 16.560000, 104.750000, TRUE),
  ('LA-R-PAKSE', 'Trạm nghỉ Pakse', 'rest', NULL, 'Champasak', 'Laos', 'LA', FALSE, TRUE, FALSE, 15.120000, 105.800000, TRUE),
  ('LA-R-ATTAPEU', 'Trạm nghỉ Attapeu', 'rest', NULL, 'Attapeu', 'Laos', 'LA', FALSE, TRUE, FALSE, 14.810000, 106.830000, TRUE),
  ('LA-R-LUANGPRABANG', 'Trạm nghỉ Luang Prabang', 'rest', NULL, 'Luang Prabang', 'Laos', 'LA', TRUE, TRUE, FALSE, 19.890000, 102.130000, TRUE),
  ('LA-R-LUANGNAMTHA', 'Trạm nghỉ Luang Namtha (R3A)', 'rest', NULL, 'Luang Namtha', 'Laos', 'LA', FALSE, TRUE, FALSE, 20.950000, 101.400000, TRUE),
  ('TH-R-PATHUMTHANI', 'Trạm thú y & Chuồng tạm Pathum Thani (Bangkok)', 'rest', NULL, 'Pathum Thani', 'Thailand', 'TH', TRUE, TRUE, TRUE, 14.020000, 100.530000, TRUE),
  ('TH-R-PRACHINBURI', 'Trạm nghỉ Prachinburi (QL33)', 'rest', NULL, 'Prachinburi', 'Thailand', 'TH', FALSE, TRUE, FALSE, 14.050000, 101.370000, TRUE),
  ('TH-R-CHANTHABURI', 'Trạm nghỉ Chanthaburi', 'rest', NULL, 'Chanthaburi', 'Thailand', 'TH', FALSE, TRUE, FALSE, 12.610000, 102.100000, TRUE),
  ('TH-R-PATTAYA', 'Trạm nghỉ Pattaya (Chonburi)', 'rest', NULL, 'Chonburi', 'Thailand', 'TH', TRUE, TRUE, TRUE, 12.920000, 100.880000, TRUE),
  ('TH-R-KORAT', 'Trạm nghỉ thú y Nakhon Ratchasima', 'rest', NULL, 'Nakhon Ratchasima', 'Thailand', 'TH', TRUE, TRUE, TRUE, 14.970000, 102.100000, TRUE),
  ('TH-R-KHONKAEN', 'Trạm nghỉ Khon Kaen', 'rest', NULL, 'Khon Kaen', 'Thailand', 'TH', FALSE, TRUE, FALSE, 16.430000, 102.830000, TRUE),
  ('TH-R-UDON', 'Trạm nghỉ Udon Thani', 'rest', NULL, 'Udon Thani', 'Thailand', 'TH', FALSE, TRUE, FALSE, 17.410000, 102.790000, TRUE),
  ('TH-R-PHITSANULOK', 'Trạm nghỉ Phitsanulok', 'rest', NULL, 'Phitsanulok', 'Thailand', 'TH', FALSE, TRUE, FALSE, 16.820000, 100.260000, TRUE),
  ('TH-R-TAK', 'Trạm nghỉ Tak (QL12)', 'rest', NULL, 'Tak', 'Thailand', 'TH', FALSE, TRUE, FALSE, 16.870000, 99.130000, TRUE),
  ('TH-R-CHIANGMAI', 'Trạm nghỉ thú y Chiang Mai', 'rest', NULL, 'Chiang Mai', 'Thailand', 'TH', TRUE, TRUE, FALSE, 18.790000, 98.980000, TRUE),
  ('TH-R-CHIANGRAI', 'Trạm nghỉ Chiang Rai', 'rest', NULL, 'Chiang Rai', 'Thailand', 'TH', FALSE, TRUE, FALSE, 19.910000, 99.830000, TRUE),
  ('TH-R-CHAAM', 'Trạm nghỉ Cha-am / Hua Hin', 'rest', NULL, 'Phetchaburi', 'Thailand', 'TH', TRUE, TRUE, TRUE, 12.800000, 99.970000, TRUE),
  ('TH-R-CHUMPHON', 'Trạm nghỉ Chumphon', 'rest', NULL, 'Chumphon', 'Thailand', 'TH', FALSE, TRUE, FALSE, 10.490000, 99.180000, TRUE),
  ('TH-R-SURATTHANI', 'Trạm dừng chân Surat Thani Equine Rest', 'rest', NULL, 'Surat Thani', 'Thailand', 'TH', TRUE, TRUE, FALSE, 9.140000, 99.330000, TRUE),
  ('TH-R-HATYAI', 'Trạm nghỉ thú y Hat Yai (Songkhla)', 'rest', NULL, 'Songkhla', 'Thailand', 'TH', TRUE, TRUE, FALSE, 7.010000, 100.470000, TRUE),
  ('TH-R-SAMUI', 'Trạm nghỉ Koh Samui', 'rest', NULL, 'Koh Samui', 'Thailand', 'TH', FALSE, TRUE, FALSE, 9.530000, 100.030000, TRUE),
  ('MY-R-ALORSETAR', 'Trạm nghỉ Alor Setar (Kedah)', 'rest', NULL, 'Kedah', 'Malaysia', 'MY', FALSE, TRUE, TRUE, 6.120000, 100.370000, TRUE),
  ('MY-R-BUTTERWORTH', 'Trạm thú y Butterworth (Penang)', 'rest', NULL, 'Penang', 'Malaysia', 'MY', TRUE, TRUE, TRUE, 5.400000, 100.400000, TRUE),
  ('MY-R-IPOH', 'Trạm nghỉ Ipoh (Perak Turf Club)', 'rest', NULL, 'Perak', 'Malaysia', 'MY', TRUE, TRUE, TRUE, 4.600000, 101.080000, TRUE),
  ('MY-R-TANJUNGMALIM', 'Trạm nghỉ Tanjung Malim (PLUS)', 'rest', NULL, 'Perak', 'Malaysia', 'MY', FALSE, TRUE, TRUE, 3.680000, 101.520000, TRUE),
  ('MY-R-KUALALUMPUR', 'Trạm thú y Sungai Besi (Kuala Lumpur)', 'rest', NULL, 'Kuala Lumpur', 'Malaysia', 'MY', TRUE, TRUE, TRUE, 3.070000, 101.700000, TRUE),
  ('MY-R-AYERKEROH', 'Trạm nghỉ Ayer Keroh (Melaka)', 'rest', NULL, 'Melaka', 'Malaysia', 'MY', FALSE, TRUE, TRUE, 2.270000, 102.280000, TRUE),
  ('MY-R-YONGPENG', 'Trạm nghỉ Yong Peng (Johor)', 'rest', NULL, 'Johor', 'Malaysia', 'MY', FALSE, TRUE, TRUE, 2.030000, 103.070000, TRUE),
  ('MY-R-JOHORBAHRU', 'Trạm thú y Johor Bahru (Iskandar)', 'rest', NULL, 'Johor', 'Malaysia', 'MY', TRUE, TRUE, TRUE, 1.550000, 103.660000, TRUE),
  ('MY-R-KUCHING', 'Trạm nghỉ Kuching (Sarawak)', 'rest', NULL, 'Sarawak', 'Malaysia', 'MY', TRUE, TRUE, FALSE, 1.550000, 110.340000, TRUE),
  ('MY-R-SIBU', 'Trạm nghỉ Sibu (Sarawak)', 'rest', NULL, 'Sarawak', 'Malaysia', 'MY', FALSE, TRUE, FALSE, 2.290000, 111.830000, TRUE),
  ('MY-R-BINTULU', 'Trạm nghỉ Bintulu (Sarawak)', 'rest', NULL, 'Sarawak', 'Malaysia', 'MY', FALSE, TRUE, FALSE, 3.170000, 113.040000, TRUE),
  ('MY-R-MIRI', 'Trạm nghỉ Miri (Sarawak)', 'rest', NULL, 'Sarawak', 'Malaysia', 'MY', FALSE, TRUE, FALSE, 4.400000, 113.990000, TRUE),
  ('SG-Q-KRANJI', 'Khu cách ly ngựa Kranji (Singapore)', 'quarantine', NULL, 'Singapore', 'Singapore', 'SG', TRUE, TRUE, FALSE, 1.422000, 103.762000, TRUE),
  ('SG-B-TUAS', 'Tuas Checkpoint & Equine Holding Facility', 'border_check', NULL, 'Tuas', 'Singapore', 'SG', TRUE, TRUE, FALSE, 1.343600, 103.636400, TRUE),
  ('MM-R-HPAAN', 'Trạm nghỉ Hpa-An (Kayin)', 'rest', NULL, 'Kayin', 'Myanmar', 'MM', FALSE, TRUE, FALSE, 16.890000, 97.630000, TRUE),
  ('MM-R-BAGO', 'Trạm nghỉ Bago', 'rest', NULL, 'Bago', 'Myanmar', 'MM', FALSE, TRUE, TRUE, 17.340000, 96.480000, TRUE),
  ('MM-R-YANGON', 'Trạm thú y Yangon', 'rest', NULL, 'Yangon', 'Myanmar', 'MM', TRUE, TRUE, TRUE, 16.870000, 96.120000, TRUE),
  ('MM-R-NAYPYIDAW', 'Trạm nghỉ Naypyidaw', 'rest', NULL, 'Naypyidaw', 'Myanmar', 'MM', FALSE, TRUE, TRUE, 19.750000, 96.130000, TRUE),
  ('MM-R-MEIKTILA', 'Trạm nghỉ Meiktila', 'rest', NULL, 'Mandalay', 'Myanmar', 'MM', FALSE, TRUE, TRUE, 20.880000, 95.860000, TRUE),
  ('MM-R-MANDALAY', 'Trạm thú y Mandalay', 'rest', NULL, 'Mandalay', 'Myanmar', 'MM', TRUE, TRUE, TRUE, 21.950000, 96.080000, TRUE),
  ('MM-R-LASHIO', 'Trạm nghỉ Lashio (Shan)', 'rest', NULL, 'Shan', 'Myanmar', 'MM', FALSE, TRUE, FALSE, 22.940000, 97.750000, TRUE),
  ('ID-R-JAKARTA', 'Trạm thú y Pulomas (Jakarta)', 'rest', NULL, 'Jakarta', 'Indonesia', 'ID', TRUE, TRUE, TRUE, -6.180000, 106.890000, TRUE),
  ('ID-R-BANDUNG', 'Trạm nghỉ Bandung', 'rest', NULL, 'Tây Java', 'Indonesia', 'ID', FALSE, TRUE, TRUE, -6.910000, 107.610000, TRUE),
  ('ID-R-CIREBON', 'Trạm nghỉ Cirebon', 'rest', NULL, 'Tây Java', 'Indonesia', 'ID', FALSE, TRUE, TRUE, -6.730000, 108.550000, TRUE),
  ('ID-R-SEMARANG', 'Trạm nghỉ Semarang', 'rest', NULL, 'Trung Java', 'Indonesia', 'ID', TRUE, TRUE, TRUE, -6.990000, 110.420000, TRUE),
  ('ID-R-SURABAYA', 'Trạm thú y Surabaya', 'rest', NULL, 'Đông Java', 'Indonesia', 'ID', TRUE, TRUE, TRUE, -7.260000, 112.750000, TRUE),
  ('ID-R-PROBOLINGGO', 'Trạm nghỉ Probolinggo', 'rest', NULL, 'Đông Java', 'Indonesia', 'ID', FALSE, TRUE, TRUE, -7.750000, 113.200000, TRUE),
  ('ID-R-BANYUWANGI', 'Trạm nghỉ Banyuwangi', 'rest', NULL, 'Đông Java', 'Indonesia', 'ID', FALSE, TRUE, FALSE, -8.200000, 114.370000, TRUE),
  ('ID-R-DENPASAR', 'Trạm thú y Denpasar (Bali)', 'rest', NULL, 'Bali', 'Indonesia', 'ID', TRUE, TRUE, FALSE, -8.650000, 115.220000, TRUE),
  ('ID-R-LAMPUNG', 'Trạm nghỉ Bandar Lampung', 'rest', NULL, 'Lampung', 'Indonesia', 'ID', FALSE, TRUE, TRUE, -5.430000, 105.260000, TRUE),
  ('ID-R-PALEMBANG', 'Trạm nghỉ Palembang', 'rest', NULL, 'Nam Sumatra', 'Indonesia', 'ID', FALSE, TRUE, TRUE, -2.980000, 104.760000, TRUE),
  ('ID-R-JAMBI', 'Trạm nghỉ Jambi', 'rest', NULL, 'Jambi', 'Indonesia', 'ID', FALSE, TRUE, FALSE, -1.610000, 103.610000, TRUE),
  ('ID-R-MUARATEBO', 'Trạm nghỉ Muara Tebo (Jambi)', 'rest', NULL, 'Jambi', 'Indonesia', 'ID', FALSE, TRUE, FALSE, -1.490000, 102.450000, TRUE),
  ('ID-R-PEKANBARU', 'Trạm nghỉ Pekanbaru', 'rest', NULL, 'Riau', 'Indonesia', 'ID', FALSE, TRUE, FALSE, 0.510000, 101.450000, TRUE),
  ('ID-R-RANTAUPRAPAT', 'Trạm nghỉ Rantau Prapat', 'rest', NULL, 'Bắc Sumatra', 'Indonesia', 'ID', FALSE, TRUE, FALSE, 2.100000, 99.830000, TRUE),
  ('ID-R-MEDAN', 'Trạm thú y Medan', 'rest', NULL, 'Bắc Sumatra', 'Indonesia', 'ID', TRUE, TRUE, FALSE, 3.590000, 98.670000, TRUE),
  ('ID-R-PONTIANAK', 'Trạm nghỉ Pontianak (Kalimantan)', 'rest', NULL, 'Tây Kalimantan', 'Indonesia', 'ID', FALSE, TRUE, FALSE, -0.030000, 109.330000, TRUE),
  ('PH-R-MANILA', 'Trạm thú y Metro Manila', 'rest', NULL, 'Manila', 'Philippines', 'PH', TRUE, TRUE, TRUE, 14.600000, 121.000000, TRUE),
  ('PH-R-BATANGAS', 'Trạm nghỉ Batangas (Metro Manila Turf Club)', 'rest', NULL, 'Batangas', 'Philippines', 'PH', TRUE, TRUE, TRUE, 14.070000, 121.130000, TRUE),
  ('PH-R-CLARK', 'Trạm nghỉ Clark (Pampanga)', 'rest', NULL, 'Pampanga', 'Philippines', 'PH', FALSE, TRUE, TRUE, 15.180000, 120.550000, TRUE),
  ('PH-R-BAGUIO', 'Trạm nghỉ Baguio', 'rest', NULL, 'Benguet', 'Philippines', 'PH', FALSE, TRUE, FALSE, 16.400000, 120.600000, TRUE),
  ('PH-R-CALAPAN', 'Trạm nghỉ Calapan (Mindoro)', 'rest', NULL, 'Oriental Mindoro', 'Philippines', 'PH', FALSE, TRUE, FALSE, 13.410000, 121.180000, TRUE),
  ('BN-R-BSB', 'Trạm nghỉ Bandar Seri Begawan', 'rest', NULL, 'Brunei-Muara', 'Brunei', 'BN', TRUE, TRUE, FALSE, 4.900000, 114.940000, TRUE),
  ('HK-R-SHATIN', 'Trạm thú y trường đua Sha Tin (Hồng Kông)', 'rest', NULL, 'Sha Tin', 'Hong Kong', 'HK', TRUE, TRUE, FALSE, 22.400000, 114.200000, TRUE),
  ('CN-Q-CONGHUA', 'Trung tâm phi dịch bệnh ngựa Tòng Hóa (Conghua EDFZ, Quảng Châu)', 'quarantine', NULL, 'Quảng Châu', 'China', 'CN', TRUE, TRUE, TRUE, 23.550000, 113.550000, TRUE),
  ('CN-R-SHENZHEN', 'Trạm nghỉ Thâm Quyến', 'rest', NULL, 'Thâm Quyến', 'China', 'CN', TRUE, TRUE, TRUE, 22.600000, 114.050000, TRUE),
  ('CN-R-HUIZHOU', 'Trạm nghỉ Huệ Châu', 'rest', NULL, 'Huệ Châu', 'China', 'CN', FALSE, TRUE, TRUE, 23.100000, 114.400000, TRUE),
  ('CN-R-SHANTOU', 'Trạm nghỉ Sán Đầu', 'rest', NULL, 'Sán Đầu', 'China', 'CN', FALSE, TRUE, TRUE, 23.350000, 116.680000, TRUE),
  ('CN-R-XIAMEN', 'Trạm thú y Hạ Môn', 'rest', NULL, 'Hạ Môn', 'China', 'CN', TRUE, TRUE, TRUE, 24.480000, 118.090000, TRUE),
  ('CN-R-FUZHOU', 'Trạm nghỉ Phúc Châu', 'rest', NULL, 'Phúc Châu', 'China', 'CN', FALSE, TRUE, TRUE, 26.070000, 119.300000, TRUE),
  ('CN-R-WENZHOU', 'Trạm nghỉ Ôn Châu', 'rest', NULL, 'Ôn Châu', 'China', 'CN', FALSE, TRUE, TRUE, 28.000000, 120.670000, TRUE),
  ('CN-R-HANGZHOU', 'Trạm nghỉ Hàng Châu', 'rest', NULL, 'Hàng Châu', 'China', 'CN', FALSE, TRUE, TRUE, 30.270000, 120.150000, TRUE),
  ('CN-Q-SHANGHAI', 'Trạm kiểm dịch động vật Thượng Hải', 'quarantine', NULL, 'Thượng Hải', 'China', 'CN', TRUE, TRUE, TRUE, 31.200000, 121.400000, TRUE),
  ('CN-R-NANJING', 'Trạm nghỉ Nam Kinh', 'rest', NULL, 'Nam Kinh', 'China', 'CN', FALSE, TRUE, TRUE, 32.060000, 118.790000, TRUE),
  ('CN-R-XUZHOU', 'Trạm nghỉ Từ Châu', 'rest', NULL, 'Từ Châu', 'China', 'CN', FALSE, TRUE, TRUE, 34.260000, 117.180000, TRUE),
  ('CN-R-JINAN', 'Trạm nghỉ Tế Nam', 'rest', NULL, 'Tế Nam', 'China', 'CN', FALSE, TRUE, TRUE, 36.650000, 117.000000, TRUE),
  ('CN-R-QINGDAO', 'Trạm nghỉ Thanh Đảo', 'rest', NULL, 'Thanh Đảo', 'China', 'CN', TRUE, TRUE, TRUE, 36.070000, 120.380000, TRUE),
  ('CN-R-TIANJIN', 'Trạm nghỉ Thiên Tân', 'rest', NULL, 'Thiên Tân', 'China', 'CN', FALSE, TRUE, TRUE, 39.080000, 117.200000, TRUE),
  ('CN-Q-BEIJING', 'Trạm kiểm dịch động vật Bắc Kinh', 'quarantine', NULL, 'Bắc Kinh', 'China', 'CN', TRUE, TRUE, TRUE, 39.900000, 116.400000, TRUE),
  ('CN-R-SHIJIAZHUANG', 'Trạm nghỉ Thạch Gia Trang', 'rest', NULL, 'Thạch Gia Trang', 'China', 'CN', FALSE, TRUE, TRUE, 38.040000, 114.500000, TRUE),
  ('CN-R-ZHENGZHOU', 'Trạm nghỉ Trịnh Châu', 'rest', NULL, 'Trịnh Châu', 'China', 'CN', FALSE, TRUE, TRUE, 34.750000, 113.620000, TRUE),
  ('CN-R-ZHUMADIAN', 'Trạm nghỉ Trú Mã Điếm', 'rest', NULL, 'Trú Mã Điếm', 'China', 'CN', FALSE, TRUE, TRUE, 33.000000, 114.000000, TRUE),
  ('CN-R-WUHAN', 'Trạm thú y Vũ Hán', 'rest', NULL, 'Vũ Hán', 'China', 'CN', TRUE, TRUE, TRUE, 30.600000, 114.300000, TRUE),
  ('CN-R-CHANGSHA', 'Trạm nghỉ Trường Sa', 'rest', NULL, 'Trường Sa', 'China', 'CN', FALSE, TRUE, TRUE, 28.200000, 112.970000, TRUE),
  ('CN-R-SHAOGUAN', 'Trạm nghỉ Thiều Quan', 'rest', NULL, 'Thiều Quan', 'China', 'CN', FALSE, TRUE, TRUE, 24.800000, 113.600000, TRUE),
  ('CN-R-GUILIN', 'Trạm nghỉ Quế Lâm', 'rest', NULL, 'Quế Lâm', 'China', 'CN', FALSE, TRUE, TRUE, 25.270000, 110.290000, TRUE),
  ('CN-R-LIUZHOU', 'Trạm nghỉ Liễu Châu', 'rest', NULL, 'Liễu Châu', 'China', 'CN', FALSE, TRUE, TRUE, 24.330000, 109.400000, TRUE),
  ('CN-R-WUZHOU', 'Trạm nghỉ Ngô Châu', 'rest', NULL, 'Ngô Châu', 'China', 'CN', FALSE, TRUE, TRUE, 23.480000, 111.280000, TRUE),
  ('CN-R-YULIN', 'Trạm nghỉ Ngọc Lâm (Quảng Tây)', 'rest', NULL, 'Ngọc Lâm', 'China', 'CN', FALSE, TRUE, TRUE, 22.650000, 110.150000, TRUE),
  ('CN-R-NANNING', 'Trạm thú y Nam Ninh', 'rest', NULL, 'Nam Ninh', 'China', 'CN', TRUE, TRUE, TRUE, 22.820000, 108.320000, TRUE),
  ('CN-R-PINGXIANG', 'Trạm kiểm dịch Bằng Tường (cửa khẩu Hữu Nghị Quan)', 'rest', NULL, 'Bằng Tường', 'China', 'CN', TRUE, TRUE, FALSE, 22.100000, 106.760000, TRUE),
  ('CN-R-QINZHOU', 'Trạm nghỉ Khâm Châu', 'rest', NULL, 'Khâm Châu', 'China', 'CN', FALSE, TRUE, TRUE, 21.980000, 108.620000, TRUE),
  ('CN-R-ZHANJIANG', 'Trạm nghỉ Trạm Giang', 'rest', NULL, 'Trạm Giang', 'China', 'CN', FALSE, TRUE, TRUE, 21.270000, 110.360000, TRUE),
  ('CN-R-HAIKOU', 'Trạm thú y Hải Khẩu (Hải Nam)', 'rest', NULL, 'Hải Khẩu', 'China', 'CN', TRUE, TRUE, TRUE, 19.980000, 110.330000, TRUE),
  ('CN-R-SANYA', 'Trạm nghỉ Tam Á (Hải Nam)', 'rest', NULL, 'Tam Á', 'China', 'CN', FALSE, TRUE, TRUE, 18.300000, 109.500000, TRUE),
  ('CN-R-KUNMING', 'Trạm thú y Côn Minh', 'rest', NULL, 'Côn Minh', 'China', 'CN', TRUE, TRUE, TRUE, 25.000000, 102.720000, TRUE),
  ('CN-R-MENGZI', 'Trạm nghỉ Mông Tự (Vân Nam)', 'rest', NULL, 'Mông Tự', 'China', 'CN', FALSE, TRUE, TRUE, 23.370000, 103.380000, TRUE),
  ('CN-R-PUER', 'Trạm nghỉ Phổ Nhĩ', 'rest', NULL, 'Phổ Nhĩ', 'China', 'CN', FALSE, TRUE, FALSE, 22.780000, 100.970000, TRUE),
  ('CN-R-JINGHONG', 'Trạm nghỉ Cảnh Hồng (Tây Song Bản Nạp)', 'rest', NULL, 'Cảnh Hồng', 'China', 'CN', FALSE, TRUE, FALSE, 22.000000, 100.800000, TRUE),
  ('CN-R-DALI', 'Trạm nghỉ Đại Lý', 'rest', NULL, 'Đại Lý', 'China', 'CN', FALSE, TRUE, TRUE, 25.600000, 100.270000, TRUE),
  ('CN-R-MANGSHI', 'Trạm nghỉ Mang Thị', 'rest', NULL, 'Mang Thị', 'China', 'CN', FALSE, TRUE, FALSE, 24.430000, 98.580000, TRUE),
  ('CN-R-QUJING', 'Trạm nghỉ Khúc Tịnh', 'rest', NULL, 'Khúc Tịnh', 'China', 'CN', FALSE, TRUE, TRUE, 25.490000, 103.800000, TRUE),
  ('CN-R-GUIYANG', 'Trạm nghỉ Quý Dương', 'rest', NULL, 'Quý Dương', 'China', 'CN', FALSE, TRUE, TRUE, 26.600000, 106.700000, TRUE),
  ('CN-R-CHONGQING', 'Trạm nghỉ Trùng Khánh', 'rest', NULL, 'Trùng Khánh', 'China', 'CN', FALSE, TRUE, TRUE, 29.560000, 106.550000, TRUE),
  ('CN-R-CHENGDU', 'Trạm thú y Thành Đô', 'rest', NULL, 'Thành Đô', 'China', 'CN', TRUE, TRUE, TRUE, 30.660000, 104.060000, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), stop_type = VALUES(stop_type), city = VALUES(city), country = VALUES(country),
  country_code = VALUES(country_code), has_veterinarian = VALUES(has_veterinarian), has_stalls = VALUES(has_stalls),
  is_expressway = VALUES(is_expressway), lat = VALUES(lat), lng = VALUES(lng), is_active = VALUES(is_active);

-- Cửa khẩu Hữu Nghị đã có ở bảng border_crossing; giữ bản ghi master_stop cũ (thuộc VN) nhưng sửa mã quốc gia
UPDATE master_stop SET country_code = 'VN' WHERE name = 'Cửa khẩu Quốc tế Hữu Nghị' AND country = 'Vietnam';

-- 6. Trạm đối tác nước ngoài cho chặng giao cuối (ĐNA + Trung Quốc)
INSERT INTO depot (code, name, country, city, address, lat, lng, type, is_active) VALUES
  ('MY-KUL', 'Trạm Đối tác Kuala Lumpur (Malaysia)', 'Malaysia', 'Kuala Lumpur', 'Jalan Sungai Besi, Kuala Lumpur', 3.0700000, 101.7000000, 'partner', TRUE),
  ('MY-PEN', 'Trạm Đối tác Penang (Malaysia)', 'Malaysia', 'Penang', 'Batu Gantung, Penang', 5.4200000, 100.3000000, 'partner', TRUE),
  ('HK-STN', 'Trạm Đối tác Sha Tin (Hồng Kông)', 'Hong Kong', 'Hong Kong', 'Sha Tin, New Territories', 22.4000000, 114.2000000, 'partner', TRUE),
  ('CN-CAN', 'Trạm Đối tác Quảng Châu – Tòng Hóa (Trung Quốc)', 'China', 'Quảng Châu', 'Conghua, Guangzhou', 23.5500000, 113.5500000, 'partner', TRUE),
  ('CN-NNG', 'Trạm Đối tác Nam Ninh (Trung Quốc)', 'China', 'Nam Ninh', 'Nanning, Guangxi', 22.8200000, 108.3200000, 'partner', TRUE),
  ('CN-KMG', 'Trạm Đối tác Côn Minh (Trung Quốc)', 'China', 'Côn Minh', 'Kunming, Yunnan', 25.0000000, 102.7200000, 'partner', TRUE),
  ('CN-SHA', 'Trạm Đối tác Thượng Hải (Trung Quốc)', 'China', 'Thượng Hải', 'Pudong, Shanghai', 31.2000000, 121.5500000, 'partner', TRUE),
  ('CN-PEK', 'Trạm Đối tác Bắc Kinh (Trung Quốc)', 'China', 'Bắc Kinh', 'Shunyi, Beijing', 40.1300000, 116.6500000, 'partner', TRUE),
  ('LA-VTE', 'Trạm Đối tác Viêng Chăn (Lào)', 'Laos', 'Vientiane', 'Vientiane Capital', 17.9700000, 102.6000000, 'partner', TRUE),
  ('MM-RGN', 'Trạm Đối tác Yangon (Myanmar)', 'Myanmar', 'Yangon', 'Mingaladon, Yangon', 16.9000000, 96.1300000, 'partner', TRUE),
  ('PH-MNL', 'Trạm Đối tác Manila (Philippines)', 'Philippines', 'Manila', 'Pasay, Metro Manila', 14.5400000, 121.0000000, 'partner', TRUE),
  ('ID-JKT', 'Trạm Đối tác Jakarta (Indonesia)', 'Indonesia', 'Jakarta', 'Pulomas, East Jakarta', -6.1800000, 106.8900000, 'partner', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), country = VALUES(country), city = VALUES(city), address = VALUES(address),
  lat = VALUES(lat), lng = VALUES(lng), type = VALUES(type), is_active = VALUES(is_active);
