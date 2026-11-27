-- Migration 040: Expand global seaports, bidirectional vessel sea_routes, and add sea to route_leg.leg_type.
-- Idempotent: safe to re-run without duplicating or breaking existing rows. Uses vessel sea_mode only (no ferry).

-- 1. Allow sea leg type in route_leg
ALTER TABLE route_leg MODIFY COLUMN leg_type ENUM('road', 'flight', 'sea') NOT NULL DEFAULT 'road';

-- 2. Upsert expanded global seaports synced with frontend maritime-routing / KNOWN_SEAPORTS
INSERT INTO seaport (code, name, country, city, lat, lng, is_active) VALUES
  ('VN-CLI', 'Cảng Cát Lái (TP.HCM)', 'Vietnam', 'Hồ Chí Minh', 10.761700, 106.789400, TRUE),
  ('VN-VUT', 'Cảng Cái Mép - Thị Vải (Vũng Tàu)', 'Vietnam', 'Bà Rịa - Vũng Tàu', 10.525600, 107.018500, TRUE),
  ('VN-HPH', 'Cảng Hải Phòng (Lạch Huyện)', 'Vietnam', 'Hải Phòng', 20.844900, 106.889100, TRUE),
  ('VN-DAD', 'Cảng Tiên Sa (Đà Nẵng)', 'Vietnam', 'Đà Nẵng', 16.121900, 108.219400, TRUE),
  ('VN-NHA', 'Cảng Nha Trang (Khánh Hòa)', 'Vietnam', 'Khánh Hòa', 12.203600, 109.217500, TRUE),
  ('VN-RGI', 'Cảng Rạch Giá (Kiên Giang)', 'Vietnam', 'Kiên Giang', 10.012500, 105.080900, TRUE),
  ('VN-PQC', 'Cảng Bãi Vòng (Phú Quốc)', 'Vietnam', 'Phú Quốc', 10.155700, 104.040200, TRUE),
  ('SG-PSA', 'Cảng Pasir Panjang (Singapore)', 'Singapore', 'Singapore', 1.273700, 103.790900, TRUE),
  ('TH-LCB', 'Cảng Laem Chabang (Thái Lan)', 'Thailand', 'Chonburi', 13.082700, 100.883000, TRUE),
  ('MY-PKG', 'Cảng Port Klang (Malaysia)', 'Malaysia', 'Selangor', 2.999900, 101.392800, TRUE),
  ('MY-PEN', 'Cảng Penang (Malaysia)', 'Malaysia', 'Penang', 5.414100, 100.345000, TRUE),
  ('KH-KOS', 'Cảng Sihanoukville (Campuchia)', 'Cambodia', 'Sihanoukville', 10.646200, 103.501500, TRUE),
  ('ID-JKT', 'Cảng Tanjung Priok (Jakarta, Indonesia)', 'Indonesia', 'Jakarta', -6.104500, 106.880500, TRUE),
  ('ID-SUB', 'Cảng Tanjung Perak (Surabaya, Indonesia)', 'Indonesia', 'Surabaya', -7.200800, 112.733000, TRUE),
  ('ID-BDJ', 'Cảng Trisakti (Banjarmasin, Indonesia)', 'Indonesia', 'Banjarmasin', -3.332000, 114.558000, TRUE),
  ('ID-BPN', 'Cảng Semayang (Balikpapan, Indonesia)', 'Indonesia', 'Balikpapan', -1.274000, 116.805000, TRUE),
  ('PH-MNL', 'Cảng Manila (Philippines)', 'Philippines', 'Manila', 14.585000, 120.961000, TRUE),
  ('HK-HKG', 'Cảng Kwai Tsing (Hồng Kông)', 'Hong Kong', 'Hong Kong', 22.345600, 114.122800, TRUE),
  ('TW-KHH', 'Cảng Cao Hùng / Kaohsiung (Đài Loan)', 'Taiwan', 'Kaohsiung', 22.565000, 120.285000, TRUE),
  ('CN-SHA', 'Cảng Dương Sơn / Thượng Hải (Trung Quốc)', 'China', 'Shanghai', 30.626000, 122.065000, TRUE),
  ('CN-GZH', 'Cảng Nam Sa / Quảng Châu (Trung Quốc)', 'China', 'Guangzhou', 22.665000, 113.665000, TRUE),
  ('CN-TSN', 'Cảng Thiên Tân / Bắc Kinh (Trung Quốc)', 'China', 'Tianjin', 38.985000, 117.785000, TRUE),
  ('JP-TYO', 'Cảng Yokohama / Tokyo (Nhật Bản)', 'Japan', 'Yokohama', 35.443700, 139.650300, TRUE),
  ('JP-OSA', 'Cảng Osaka / Kobe (Nhật Bản)', 'Japan', 'Osaka', 34.650000, 135.425000, TRUE),
  ('KR-PUS', 'Cảng Busan (Hàn Quốc)', 'South Korea', 'Busan', 35.102800, 129.040300, TRUE),
  ('KR-INC', 'Cảng Incheon (Seoul, Hàn Quốc)', 'South Korea', 'Incheon', 37.450000, 126.605000, TRUE),
  ('IN-NSA', 'Cảng Nhava Sheva / JNPT (Mumbai, Ấn Độ)', 'India', 'Mumbai', 18.950000, 72.950000, TRUE),
  ('IN-MAA', 'Cảng Chennai (Ấn Độ)', 'India', 'Chennai', 13.085000, 80.295000, TRUE),
  ('AE-DXB', 'Cảng Jebel Ali (Dubai, UAE)', 'UAE', 'Dubai', 25.011200, 55.061200, TRUE),
  ('QA-DOH', 'Cảng Hamad (Doha, Qatar)', 'Qatar', 'Doha', 25.025000, 51.620000, TRUE),
  ('SA-DMM', 'Cảng King Abdulaziz (Dammam, Ả Rập Xê Út)', 'Saudi Arabia', 'Dammam', 26.440000, 50.150000, TRUE),
  ('SA-JED', 'Cảng Jeddah Islamic Port (Ả Rập Xê Út)', 'Saudi Arabia', 'Jeddah', 21.485800, 39.170000, TRUE),
  ('AU-SYD', 'Cảng Port Botany (Sydney, Úc)', 'Australia', 'Sydney', -33.970800, 151.216500, TRUE),
  ('AU-MEL', 'Cảng Port of Melbourne (Melbourne, Úc)', 'Australia', 'Melbourne', -37.835000, 144.915000, TRUE),
  ('AU-BNE', 'Cảng Port of Brisbane (Brisbane, Úc)', 'Australia', 'Brisbane', -27.385000, 153.175000, TRUE),
  ('AU-FRE', 'Cảng Fremantle (Perth, Úc)', 'Australia', 'Perth', -32.055000, 115.740000, TRUE),
  ('NZ-AKL', 'Cảng Ports of Auckland (New Zealand)', 'New Zealand', 'Auckland', -36.843000, 174.777000, TRUE),
  ('BE-ANR', 'Cảng Antwerp (Bỉ)', 'Belgium', 'Antwerp', 51.265000, 4.350000, TRUE),
  ('NL-RTM', 'Cảng Rotterdam (Hà Lan)', 'Netherlands', 'Rotterdam', 51.950000, 4.135000, TRUE),
  ('FR-LEH', 'Cảng Le Havre (Pháp)', 'France', 'Le Havre', 49.475000, 0.115000, TRUE),
  ('GB-FXT', 'Cảng Felixstowe (Vương quốc Anh)', 'United Kingdom', 'Felixstowe', 51.955000, 1.320000, TRUE),
  ('DE-HAM', 'Cảng Hamburg (Đức)', 'Germany', 'Hamburg', 53.525000, 9.935000, TRUE),
  ('ES-BCN', 'Cảng Barcelona (Tây Ban Nha)', 'Spain', 'Barcelona', 41.345000, 2.165000, TRUE),
  ('IT-GOA', 'Cảng Genoa (Ý)', 'Italy', 'Genoa', 44.405000, 8.915000, TRUE),
  ('US-LAX', 'Cảng Los Angeles / Long Beach (Hoa Kỳ)', 'United States', 'Los Angeles', 33.740000, -118.270000, TRUE),
  ('US-NYC', 'Cảng New York / New Jersey (Hoa Kỳ)', 'United States', 'New York', 40.670000, -74.140000, TRUE),
  ('US-SAV', 'Cảng Savannah (Hoa Kỳ)', 'United States', 'Savannah', 32.130000, -81.150000, TRUE),
  ('US-MIA', 'Cảng PortMiami (Hoa Kỳ)', 'United States', 'Miami', 25.775000, -80.170000, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), country = VALUES(country), city = VALUES(city),
  lat = VALUES(lat), lng = VALUES(lng), is_active = VALUES(is_active);

-- 3. Seed vessel sea_route corridors with maritime polyline distances (bidirectional in PricingService)
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', v.distance_km, v.typical_hours, TRUE, v.notes
FROM (
SELECT 'VN-CLI' AS from_code, 'SG-PSA' AS to_code, 1175.00 AS distance_km, 50.00 AS typical_hours, 'Tuyến tàu biển chuyên dụng VN-CLI - SG-PSA' AS notes
  UNION ALL SELECT 'VN-CLI', 'TH-LCB', 1209.00, 51.40, 'Tuyến tàu biển chuyên dụng VN-CLI - TH-LCB'
  UNION ALL SELECT 'VN-CLI', 'MY-PKG', 1581.00, 66.20, 'Tuyến tàu biển chuyên dụng VN-CLI - MY-PKG'
  UNION ALL SELECT 'VN-CLI', 'MY-PEN', 1935.00, 80.40, 'Tuyến tàu biển chuyên dụng VN-CLI - MY-PEN'
  UNION ALL SELECT 'VN-CLI', 'KH-KOS', 761.00, 33.40, 'Tuyến tàu biển chuyên dụng VN-CLI - KH-KOS'
  UNION ALL SELECT 'VN-CLI', 'ID-JKT', 2020.00, 83.80, 'Tuyến tàu biển chuyên dụng VN-CLI - ID-JKT'
  UNION ALL SELECT 'VN-CLI', 'ID-SUB', 2252.00, 93.10, 'Tuyến tàu biển chuyên dụng VN-CLI - ID-SUB'
  UNION ALL SELECT 'VN-CLI', 'ID-BDJ', 2448.00, 100.90, 'Tuyến tàu biển chuyên dụng VN-CLI - ID-BDJ'
  UNION ALL SELECT 'VN-CLI', 'ID-BPN', 3146.00, 128.80, 'Tuyến tàu biển chuyên dụng VN-CLI - ID-BPN'
  UNION ALL SELECT 'VN-CLI', 'PH-MNL', 1652.00, 69.10, 'Tuyến tàu biển chuyên dụng VN-CLI - PH-MNL'
  UNION ALL SELECT 'VN-CLI', 'HK-HKG', 1684.00, 70.40, 'Tuyến tàu biển chuyên dụng VN-CLI - HK-HKG'
  UNION ALL SELECT 'VN-CLI', 'TW-KHH', 2264.00, 93.60, 'Tuyến tàu biển chuyên dụng VN-CLI - TW-KHH'
  UNION ALL SELECT 'VN-CLI', 'CN-SHA', 3159.00, 129.40, 'Tuyến tàu biển chuyên dụng VN-CLI - CN-SHA'
  UNION ALL SELECT 'VN-CLI', 'CN-GZH', 1729.00, 72.20, 'Tuyến tàu biển chuyên dụng VN-CLI - CN-GZH'
  UNION ALL SELECT 'VN-CLI', 'CN-TSN', 4434.00, 180.40, 'Tuyến tàu biển chuyên dụng VN-CLI - CN-TSN'
  UNION ALL SELECT 'VN-CLI', 'JP-TYO', 4679.00, 190.20, 'Tuyến tàu biển chuyên dụng VN-CLI - JP-TYO'
  UNION ALL SELECT 'VN-CLI', 'JP-OSA', 4306.00, 175.20, 'Tuyến tàu biển chuyên dụng VN-CLI - JP-OSA'
  UNION ALL SELECT 'VN-CLI', 'KR-PUS', 3871.00, 157.80, 'Tuyến tàu biển chuyên dụng VN-CLI - KR-PUS'
  UNION ALL SELECT 'VN-CLI', 'KR-INC', 3974.00, 162.00, 'Tuyến tàu biển chuyên dụng VN-CLI - KR-INC'
  UNION ALL SELECT 'VN-CLI', 'IN-NSA', 5815.00, 235.60, 'Tuyến tàu biển chuyên dụng VN-CLI - IN-NSA'
  UNION ALL SELECT 'VN-CLI', 'IN-MAA', 4377.00, 178.10, 'Tuyến tàu biển chuyên dụng VN-CLI - IN-MAA'
  UNION ALL SELECT 'VN-CLI', 'AE-DXB', 7703.00, 311.10, 'Tuyến tàu biển chuyên dụng VN-CLI - AE-DXB'
  UNION ALL SELECT 'VN-CLI', 'QA-DOH', 8055.00, 325.20, 'Tuyến tàu biển chuyên dụng VN-CLI - QA-DOH'
  UNION ALL SELECT 'VN-CLI', 'SA-DMM', 8131.00, 328.20, 'Tuyến tàu biển chuyên dụng VN-CLI - SA-DMM'
  UNION ALL SELECT 'VN-CLI', 'SA-JED', 9291.00, 374.60, 'Tuyến tàu biển chuyên dụng VN-CLI - SA-JED'
  UNION ALL SELECT 'VN-CLI', 'AU-SYD', 8804.00, 355.20, 'Tuyến tàu biển chuyên dụng VN-CLI - AU-SYD'
  UNION ALL SELECT 'VN-CLI', 'AU-MEL', 8372.00, 337.90, 'Tuyến tàu biển chuyên dụng VN-CLI - AU-MEL'
  UNION ALL SELECT 'VN-CLI', 'AU-BNE', 7991.00, 322.60, 'Tuyến tàu biển chuyên dụng VN-CLI - AU-BNE'
  UNION ALL SELECT 'VN-CLI', 'AU-FRE', 5332.00, 216.30, 'Tuyến tàu biển chuyên dụng VN-CLI - AU-FRE'
  UNION ALL SELECT 'VN-CLI', 'NZ-AKL', 10206.00, 411.20, 'Tuyến tàu biển chuyên dụng VN-CLI - NZ-AKL'
  UNION ALL SELECT 'VN-CLI', 'BE-ANR', 16666.00, 669.60, 'Tuyến tàu biển chuyên dụng VN-CLI - BE-ANR'
  UNION ALL SELECT 'VN-CLI', 'NL-RTM', 16635.00, 668.40, 'Tuyến tàu biển chuyên dụng VN-CLI - NL-RTM'
  UNION ALL SELECT 'VN-CLI', 'FR-LEH', 16372.00, 657.90, 'Tuyến tàu biển chuyên dụng VN-CLI - FR-LEH'
  UNION ALL SELECT 'VN-CLI', 'GB-FXT', 16607.00, 667.30, 'Tuyến tàu biển chuyên dụng VN-CLI - GB-FXT'
  UNION ALL SELECT 'VN-CLI', 'DE-HAM', 17101.00, 687.00, 'Tuyến tàu biển chuyên dụng VN-CLI - DE-HAM'
  UNION ALL SELECT 'VN-CLI', 'ES-BCN', 13672.00, 549.90, 'Tuyến tàu biển chuyên dụng VN-CLI - ES-BCN'
  UNION ALL SELECT 'VN-CLI', 'IT-GOA', 13417.00, 539.70, 'Tuyến tàu biển chuyên dụng VN-CLI - IT-GOA'
  UNION ALL SELECT 'VN-CLI', 'US-LAX', 13799.00, 555.00, 'Tuyến tàu biển chuyên dụng VN-CLI - US-LAX'
  UNION ALL SELECT 'VN-CLI', 'US-NYC', 20054.00, 805.20, 'Tuyến tàu biển chuyên dụng VN-CLI - US-NYC'
  UNION ALL SELECT 'VN-CLI', 'US-SAV', 21204.00, 851.20, 'Tuyến tàu biển chuyên dụng VN-CLI - US-SAV'
  UNION ALL SELECT 'VN-CLI', 'US-MIA', 21665.00, 869.60, 'Tuyến tàu biển chuyên dụng VN-CLI - US-MIA'
  UNION ALL SELECT 'VN-HPH', 'SG-PSA', 2513.00, 103.50, 'Tuyến tàu biển chuyên dụng VN-HPH - SG-PSA'
  UNION ALL SELECT 'VN-HPH', 'TH-LCB', 2558.00, 105.30, 'Tuyến tàu biển chuyên dụng VN-HPH - TH-LCB'
  UNION ALL SELECT 'VN-HPH', 'MY-PKG', 2918.00, 119.70, 'Tuyến tàu biển chuyên dụng VN-HPH - MY-PKG'
  UNION ALL SELECT 'VN-HPH', 'MY-PEN', 3273.00, 133.90, 'Tuyến tàu biển chuyên dụng VN-HPH - MY-PEN'
  UNION ALL SELECT 'VN-HPH', 'KH-KOS', 2110.00, 87.40, 'Tuyến tàu biển chuyên dụng VN-HPH - KH-KOS'
  UNION ALL SELECT 'VN-HPH', 'ID-JKT', 3357.00, 137.30, 'Tuyến tàu biển chuyên dụng VN-HPH - ID-JKT'
  UNION ALL SELECT 'VN-HPH', 'ID-SUB', 3569.00, 145.80, 'Tuyến tàu biển chuyên dụng VN-HPH - ID-SUB'
  UNION ALL SELECT 'VN-HPH', 'ID-BDJ', 3765.00, 153.60, 'Tuyến tàu biển chuyên dụng VN-HPH - ID-BDJ'
  UNION ALL SELECT 'VN-HPH', 'ID-BPN', 4463.00, 181.50, 'Tuyến tàu biển chuyên dụng VN-HPH - ID-BPN'
  UNION ALL SELECT 'VN-HPH', 'PH-MNL', 1855.00, 77.20, 'Tuyến tàu biển chuyên dụng VN-HPH - PH-MNL'
  UNION ALL SELECT 'VN-HPH', 'HK-HKG', 1226.00, 52.00, 'Tuyến tàu biển chuyên dụng VN-HPH - HK-HKG'
  UNION ALL SELECT 'VN-HPH', 'TW-KHH', 1806.00, 75.20, 'Tuyến tàu biển chuyên dụng VN-HPH - TW-KHH'
  UNION ALL SELECT 'VN-HPH', 'CN-SHA', 2702.00, 111.10, 'Tuyến tàu biển chuyên dụng VN-HPH - CN-SHA'
  UNION ALL SELECT 'VN-HPH', 'CN-GZH', 1271.00, 53.80, 'Tuyến tàu biển chuyên dụng VN-HPH - CN-GZH'
  UNION ALL SELECT 'VN-HPH', 'CN-TSN', 3977.00, 162.10, 'Tuyến tàu biển chuyên dụng VN-HPH - CN-TSN'
  UNION ALL SELECT 'VN-HPH', 'JP-TYO', 4221.00, 171.80, 'Tuyến tàu biển chuyên dụng VN-HPH - JP-TYO'
  UNION ALL SELECT 'VN-HPH', 'JP-OSA', 3848.00, 156.90, 'Tuyến tàu biển chuyên dụng VN-HPH - JP-OSA'
  UNION ALL SELECT 'VN-HPH', 'KR-PUS', 3413.00, 139.50, 'Tuyến tàu biển chuyên dụng VN-HPH - KR-PUS'
  UNION ALL SELECT 'VN-HPH', 'KR-INC', 3516.00, 143.60, 'Tuyến tàu biển chuyên dụng VN-HPH - KR-INC'
  UNION ALL SELECT 'VN-HPH', 'IN-NSA', 7153.00, 289.10, 'Tuyến tàu biển chuyên dụng VN-HPH - IN-NSA'
  UNION ALL SELECT 'VN-HPH', 'IN-MAA', 5715.00, 231.60, 'Tuyến tàu biển chuyên dụng VN-HPH - IN-MAA'
  UNION ALL SELECT 'VN-HPH', 'AE-DXB', 9041.00, 364.60, 'Tuyến tàu biển chuyên dụng VN-HPH - AE-DXB'
  UNION ALL SELECT 'VN-HPH', 'QA-DOH', 9393.00, 378.70, 'Tuyến tàu biển chuyên dụng VN-HPH - QA-DOH'
  UNION ALL SELECT 'VN-HPH', 'SA-DMM', 9469.00, 381.80, 'Tuyến tàu biển chuyên dụng VN-HPH - SA-DMM'
  UNION ALL SELECT 'VN-HPH', 'SA-JED', 10629.00, 428.20, 'Tuyến tàu biển chuyên dụng VN-HPH - SA-JED'
  UNION ALL SELECT 'VN-HPH', 'AU-SYD', 10025.00, 404.00, 'Tuyến tàu biển chuyên dụng VN-HPH - AU-SYD'
  UNION ALL SELECT 'VN-HPH', 'AU-MEL', 9689.00, 390.60, 'Tuyến tàu biển chuyên dụng VN-HPH - AU-MEL'
  UNION ALL SELECT 'VN-HPH', 'AU-BNE', 9212.00, 371.50, 'Tuyến tàu biển chuyên dụng VN-HPH - AU-BNE'
  UNION ALL SELECT 'VN-HPH', 'AU-FRE', 6649.00, 269.00, 'Tuyến tàu biển chuyên dụng VN-HPH - AU-FRE'
  UNION ALL SELECT 'VN-HPH', 'NZ-AKL', 11397.00, 458.90, 'Tuyến tàu biển chuyên dụng VN-HPH - NZ-AKL'
  UNION ALL SELECT 'VN-HPH', 'BE-ANR', 18004.00, 723.20, 'Tuyến tàu biển chuyên dụng VN-HPH - BE-ANR'
  UNION ALL SELECT 'VN-HPH', 'NL-RTM', 17973.00, 721.90, 'Tuyến tàu biển chuyên dụng VN-HPH - NL-RTM'
  UNION ALL SELECT 'VN-HPH', 'FR-LEH', 17710.00, 711.40, 'Tuyến tàu biển chuyên dụng VN-HPH - FR-LEH'
  UNION ALL SELECT 'VN-HPH', 'GB-FXT', 17945.00, 720.80, 'Tuyến tàu biển chuyên dụng VN-HPH - GB-FXT'
  UNION ALL SELECT 'VN-HPH', 'DE-HAM', 18438.00, 740.50, 'Tuyến tàu biển chuyên dụng VN-HPH - DE-HAM'
  UNION ALL SELECT 'VN-HPH', 'ES-BCN', 15010.00, 603.40, 'Tuyến tàu biển chuyên dụng VN-HPH - ES-BCN'
  UNION ALL SELECT 'VN-HPH', 'IT-GOA', 14755.00, 593.20, 'Tuyến tàu biển chuyên dụng VN-HPH - IT-GOA'
  UNION ALL SELECT 'VN-HPH', 'US-LAX', 13341.00, 536.60, 'Tuyến tàu biển chuyên dụng VN-HPH - US-LAX'
  UNION ALL SELECT 'VN-HPH', 'US-NYC', 21392.00, 858.70, 'Tuyến tàu biển chuyên dụng VN-HPH - US-NYC'
  UNION ALL SELECT 'VN-HPH', 'US-SAV', 21752.00, 873.10, 'Tuyến tàu biển chuyên dụng VN-HPH - US-SAV'
  UNION ALL SELECT 'VN-HPH', 'US-MIA', 21208.00, 851.30, 'Tuyến tàu biển chuyên dụng VN-HPH - US-MIA'
  UNION ALL SELECT 'VN-DAD', 'SG-PSA', 2023.00, 83.90, 'Tuyến tàu biển chuyên dụng VN-DAD - SG-PSA'
  UNION ALL SELECT 'VN-DAD', 'TH-LCB', 2068.00, 85.70, 'Tuyến tàu biển chuyên dụng VN-DAD - TH-LCB'
  UNION ALL SELECT 'VN-DAD', 'MY-PKG', 2429.00, 100.20, 'Tuyến tàu biển chuyên dụng VN-DAD - MY-PKG'
  UNION ALL SELECT 'VN-DAD', 'MY-PEN', 2783.00, 114.30, 'Tuyến tàu biển chuyên dụng VN-DAD - MY-PEN'
  UNION ALL SELECT 'VN-DAD', 'KH-KOS', 1620.00, 67.80, 'Tuyến tàu biển chuyên dụng VN-DAD - KH-KOS'
  UNION ALL SELECT 'VN-DAD', 'ID-JKT', 2868.00, 117.70, 'Tuyến tàu biển chuyên dụng VN-DAD - ID-JKT'
  UNION ALL SELECT 'VN-DAD', 'ID-SUB', 3079.00, 126.20, 'Tuyến tàu biển chuyên dụng VN-DAD - ID-SUB'
  UNION ALL SELECT 'VN-DAD', 'ID-BDJ', 3275.00, 134.00, 'Tuyến tàu biển chuyên dụng VN-DAD - ID-BDJ'
  UNION ALL SELECT 'VN-DAD', 'ID-BPN', 3974.00, 162.00, 'Tuyến tàu biển chuyên dụng VN-DAD - ID-BPN'
  UNION ALL SELECT 'VN-DAD', 'PH-MNL', 1392.00, 58.70, 'Tuyến tàu biển chuyên dụng VN-DAD - PH-MNL'
  UNION ALL SELECT 'VN-DAD', 'HK-HKG', 1016.00, 43.60, 'Tuyến tàu biển chuyên dụng VN-DAD - HK-HKG'
  UNION ALL SELECT 'VN-DAD', 'TW-KHH', 1596.00, 66.80, 'Tuyến tàu biển chuyên dụng VN-DAD - TW-KHH'
  UNION ALL SELECT 'VN-DAD', 'CN-SHA', 2491.00, 102.60, 'Tuyến tàu biển chuyên dụng VN-DAD - CN-SHA'
  UNION ALL SELECT 'VN-DAD', 'CN-GZH', 1061.00, 45.40, 'Tuyến tàu biển chuyên dụng VN-DAD - CN-GZH'
  UNION ALL SELECT 'VN-DAD', 'CN-TSN', 3766.00, 153.60, 'Tuyến tàu biển chuyên dụng VN-DAD - CN-TSN'
  UNION ALL SELECT 'VN-DAD', 'JP-TYO', 4011.00, 163.40, 'Tuyến tàu biển chuyên dụng VN-DAD - JP-TYO'
  UNION ALL SELECT 'VN-DAD', 'JP-OSA', 3638.00, 148.50, 'Tuyến tàu biển chuyên dụng VN-DAD - JP-OSA'
  UNION ALL SELECT 'VN-DAD', 'KR-PUS', 3202.00, 131.10, 'Tuyến tàu biển chuyên dụng VN-DAD - KR-PUS'
  UNION ALL SELECT 'VN-DAD', 'KR-INC', 3306.00, 135.20, 'Tuyến tàu biển chuyên dụng VN-DAD - KR-INC'
  UNION ALL SELECT 'VN-DAD', 'IN-NSA', 6663.00, 269.50, 'Tuyến tàu biển chuyên dụng VN-DAD - IN-NSA'
  UNION ALL SELECT 'VN-DAD', 'IN-MAA', 5225.00, 212.00, 'Tuyến tàu biển chuyên dụng VN-DAD - IN-MAA'
  UNION ALL SELECT 'VN-DAD', 'AE-DXB', 8551.00, 345.00, 'Tuyến tàu biển chuyên dụng VN-DAD - AE-DXB'
  UNION ALL SELECT 'VN-DAD', 'QA-DOH', 8903.00, 359.10, 'Tuyến tàu biển chuyên dụng VN-DAD - QA-DOH'
  UNION ALL SELECT 'VN-DAD', 'SA-DMM', 8979.00, 362.20, 'Tuyến tàu biển chuyên dụng VN-DAD - SA-DMM'
  UNION ALL SELECT 'VN-DAD', 'SA-JED', 10139.00, 408.60, 'Tuyến tàu biển chuyên dụng VN-DAD - SA-JED'
  UNION ALL SELECT 'VN-DAD', 'AU-SYD', 9631.00, 388.20, 'Tuyến tàu biển chuyên dụng VN-DAD - AU-SYD'
  UNION ALL SELECT 'VN-DAD', 'AU-MEL', 9199.00, 371.00, 'Tuyến tàu biển chuyên dụng VN-DAD - AU-MEL'
  UNION ALL SELECT 'VN-DAD', 'AU-BNE', 8818.00, 355.70, 'Tuyến tàu biển chuyên dụng VN-DAD - AU-BNE'
  UNION ALL SELECT 'VN-DAD', 'AU-FRE', 6159.00, 249.40, 'Tuyến tàu biển chuyên dụng VN-DAD - AU-FRE'
  UNION ALL SELECT 'VN-DAD', 'NZ-AKL', 11034.00, 444.40, 'Tuyến tàu biển chuyên dụng VN-DAD - NZ-AKL'
  UNION ALL SELECT 'VN-DAD', 'BE-ANR', 17514.00, 703.60, 'Tuyến tàu biển chuyên dụng VN-DAD - BE-ANR'
  UNION ALL SELECT 'VN-DAD', 'NL-RTM', 17483.00, 702.30, 'Tuyến tàu biển chuyên dụng VN-DAD - NL-RTM'
  UNION ALL SELECT 'VN-DAD', 'FR-LEH', 17220.00, 691.80, 'Tuyến tàu biển chuyên dụng VN-DAD - FR-LEH'
  UNION ALL SELECT 'VN-DAD', 'GB-FXT', 17455.00, 701.20, 'Tuyến tàu biển chuyên dụng VN-DAD - GB-FXT'
  UNION ALL SELECT 'VN-DAD', 'DE-HAM', 17949.00, 721.00, 'Tuyến tàu biển chuyên dụng VN-DAD - DE-HAM'
  UNION ALL SELECT 'VN-DAD', 'ES-BCN', 14520.00, 583.80, 'Tuyến tàu biển chuyên dụng VN-DAD - ES-BCN'
  UNION ALL SELECT 'VN-DAD', 'IT-GOA', 14265.00, 573.60, 'Tuyến tàu biển chuyên dụng VN-DAD - IT-GOA'
  UNION ALL SELECT 'VN-DAD', 'US-LAX', 13131.00, 528.20, 'Tuyến tàu biển chuyên dụng VN-DAD - US-LAX'
  UNION ALL SELECT 'VN-DAD', 'US-NYC', 20902.00, 839.10, 'Tuyến tàu biển chuyên dụng VN-DAD - US-NYC'
  UNION ALL SELECT 'VN-DAD', 'US-SAV', 21542.00, 864.70, 'Tuyến tàu biển chuyên dụng VN-DAD - US-SAV'
  UNION ALL SELECT 'VN-DAD', 'US-MIA', 20997.00, 842.90, 'Tuyến tàu biển chuyên dụng VN-DAD - US-MIA'
  UNION ALL SELECT 'VN-VUT', 'SG-PSA', 1143.00, 48.70, 'Tuyến tàu biển chuyên dụng VN-VUT - SG-PSA'
  UNION ALL SELECT 'VN-VUT', 'TH-LCB', 1176.00, 50.00, 'Tuyến tàu biển chuyên dụng VN-VUT - TH-LCB'
  UNION ALL SELECT 'VN-VUT', 'MY-PKG', 1548.00, 64.90, 'Tuyến tàu biển chuyên dụng VN-VUT - MY-PKG'
  UNION ALL SELECT 'VN-VUT', 'MY-PEN', 1902.00, 79.10, 'Tuyến tàu biển chuyên dụng VN-VUT - MY-PEN'
  UNION ALL SELECT 'VN-VUT', 'KH-KOS', 728.00, 32.10, 'Tuyến tàu biển chuyên dụng VN-VUT - KH-KOS'
  UNION ALL SELECT 'VN-VUT', 'ID-JKT', 1987.00, 82.50, 'Tuyến tàu biển chuyên dụng VN-VUT - ID-JKT'
  UNION ALL SELECT 'VN-VUT', 'ID-SUB', 2219.00, 91.80, 'Tuyến tàu biển chuyên dụng VN-VUT - ID-SUB'
  UNION ALL SELECT 'VN-VUT', 'ID-BDJ', 2415.00, 99.60, 'Tuyến tàu biển chuyên dụng VN-VUT - ID-BDJ'
  UNION ALL SELECT 'VN-VUT', 'ID-BPN', 3114.00, 127.60, 'Tuyến tàu biển chuyên dụng VN-VUT - ID-BPN'
  UNION ALL SELECT 'VN-VUT', 'PH-MNL', 1611.00, 67.40, 'Tuyến tàu biển chuyên dụng VN-VUT - PH-MNL'
  UNION ALL SELECT 'VN-VUT', 'HK-HKG', 1644.00, 68.80, 'Tuyến tàu biển chuyên dụng VN-VUT - HK-HKG'
  UNION ALL SELECT 'VN-VUT', 'TW-KHH', 2224.00, 92.00, 'Tuyến tàu biển chuyên dụng VN-VUT - TW-KHH'
  UNION ALL SELECT 'VN-VUT', 'CN-SHA', 3119.00, 127.80, 'Tuyến tàu biển chuyên dụng VN-VUT - CN-SHA'
  UNION ALL SELECT 'VN-VUT', 'CN-GZH', 1689.00, 70.60, 'Tuyến tàu biển chuyên dụng VN-VUT - CN-GZH'
  UNION ALL SELECT 'VN-VUT', 'CN-TSN', 4394.00, 178.80, 'Tuyến tàu biển chuyên dụng VN-VUT - CN-TSN'
  UNION ALL SELECT 'VN-VUT', 'JP-TYO', 4639.00, 188.60, 'Tuyến tàu biển chuyên dụng VN-VUT - JP-TYO'
  UNION ALL SELECT 'VN-VUT', 'JP-OSA', 4266.00, 173.60, 'Tuyến tàu biển chuyên dụng VN-VUT - JP-OSA'
  UNION ALL SELECT 'VN-VUT', 'KR-PUS', 3830.00, 156.20, 'Tuyến tàu biển chuyên dụng VN-VUT - KR-PUS'
  UNION ALL SELECT 'VN-VUT', 'KR-INC', 3934.00, 160.40, 'Tuyến tàu biển chuyên dụng VN-VUT - KR-INC'
  UNION ALL SELECT 'VN-VUT', 'IN-NSA', 5782.00, 234.30, 'Tuyến tàu biển chuyên dụng VN-VUT - IN-NSA'
  UNION ALL SELECT 'VN-VUT', 'IN-MAA', 4344.00, 176.80, 'Tuyến tàu biển chuyên dụng VN-VUT - IN-MAA'
  UNION ALL SELECT 'VN-VUT', 'AE-DXB', 7671.00, 309.80, 'Tuyến tàu biển chuyên dụng VN-VUT - AE-DXB'
  UNION ALL SELECT 'VN-VUT', 'QA-DOH', 8022.00, 323.90, 'Tuyến tàu biển chuyên dụng VN-VUT - QA-DOH'
  UNION ALL SELECT 'VN-VUT', 'SA-DMM', 8098.00, 326.90, 'Tuyến tàu biển chuyên dụng VN-VUT - SA-DMM'
  UNION ALL SELECT 'VN-VUT', 'SA-JED', 9258.00, 373.30, 'Tuyến tàu biển chuyên dụng VN-VUT - SA-JED'
  UNION ALL SELECT 'VN-VUT', 'AU-SYD', 8771.00, 353.80, 'Tuyến tàu biển chuyên dụng VN-VUT - AU-SYD'
  UNION ALL SELECT 'VN-VUT', 'AU-MEL', 8339.00, 336.60, 'Tuyến tàu biển chuyên dụng VN-VUT - AU-MEL'
  UNION ALL SELECT 'VN-VUT', 'AU-BNE', 7958.00, 321.30, 'Tuyến tàu biển chuyên dụng VN-VUT - AU-BNE'
  UNION ALL SELECT 'VN-VUT', 'AU-FRE', 5299.00, 215.00, 'Tuyến tàu biển chuyên dụng VN-VUT - AU-FRE'
  UNION ALL SELECT 'VN-VUT', 'NZ-AKL', 10174.00, 410.00, 'Tuyến tàu biển chuyên dụng VN-VUT - NZ-AKL'
  UNION ALL SELECT 'VN-VUT', 'BE-ANR', 16634.00, 668.40, 'Tuyến tàu biển chuyên dụng VN-VUT - BE-ANR'
  UNION ALL SELECT 'VN-VUT', 'NL-RTM', 16602.00, 667.10, 'Tuyến tàu biển chuyên dụng VN-VUT - NL-RTM'
  UNION ALL SELECT 'VN-VUT', 'FR-LEH', 16340.00, 656.60, 'Tuyến tàu biển chuyên dụng VN-VUT - FR-LEH'
  UNION ALL SELECT 'VN-VUT', 'GB-FXT', 16575.00, 666.00, 'Tuyến tàu biển chuyên dụng VN-VUT - GB-FXT'
  UNION ALL SELECT 'VN-VUT', 'DE-HAM', 17068.00, 685.70, 'Tuyến tàu biển chuyên dụng VN-VUT - DE-HAM'
  UNION ALL SELECT 'VN-VUT', 'ES-BCN', 13640.00, 548.60, 'Tuyến tàu biển chuyên dụng VN-VUT - ES-BCN'
  UNION ALL SELECT 'VN-VUT', 'IT-GOA', 13384.00, 538.40, 'Tuyến tàu biển chuyên dụng VN-VUT - IT-GOA'
  UNION ALL SELECT 'VN-VUT', 'US-LAX', 13759.00, 553.40, 'Tuyến tàu biển chuyên dụng VN-VUT - US-LAX'
  UNION ALL SELECT 'VN-VUT', 'US-NYC', 20022.00, 803.90, 'Tuyến tàu biển chuyên dụng VN-VUT - US-NYC'
  UNION ALL SELECT 'VN-VUT', 'US-SAV', 21171.00, 849.80, 'Tuyến tàu biển chuyên dụng VN-VUT - US-SAV'
  UNION ALL SELECT 'VN-VUT', 'US-MIA', 21625.00, 868.00, 'Tuyến tàu biển chuyên dụng VN-VUT - US-MIA'
  UNION ALL SELECT 'VN-NHA', 'SG-PSA', 1542.00, 64.70, 'Tuyến tàu biển chuyên dụng VN-NHA - SG-PSA'
  UNION ALL SELECT 'VN-NHA', 'TH-LCB', 1587.00, 66.50, 'Tuyến tàu biển chuyên dụng VN-NHA - TH-LCB'
  UNION ALL SELECT 'VN-NHA', 'MY-PKG', 1947.00, 80.90, 'Tuyến tàu biển chuyên dụng VN-NHA - MY-PKG'
  UNION ALL SELECT 'VN-NHA', 'MY-PEN', 2302.00, 95.10, 'Tuyến tàu biển chuyên dụng VN-NHA - MY-PEN'
  UNION ALL SELECT 'VN-NHA', 'KH-KOS', 1139.00, 48.60, 'Tuyến tàu biển chuyên dụng VN-NHA - KH-KOS'
  UNION ALL SELECT 'VN-NHA', 'ID-JKT', 2386.00, 98.40, 'Tuyến tàu biển chuyên dụng VN-NHA - ID-JKT'
  UNION ALL SELECT 'VN-NHA', 'ID-SUB', 2598.00, 106.90, 'Tuyến tàu biển chuyên dụng VN-NHA - ID-SUB'
  UNION ALL SELECT 'VN-NHA', 'ID-BDJ', 2794.00, 114.80, 'Tuyến tàu biển chuyên dụng VN-NHA - ID-BDJ'
  UNION ALL SELECT 'VN-NHA', 'ID-BPN', 3492.00, 142.70, 'Tuyến tàu biển chuyên dụng VN-NHA - ID-BPN'
  UNION ALL SELECT 'VN-NHA', 'PH-MNL', 1308.00, 55.30, 'Tuyến tàu biển chuyên dụng VN-NHA - PH-MNL'
  UNION ALL SELECT 'VN-NHA', 'HK-HKG', 1336.00, 56.40, 'Tuyến tàu biển chuyên dụng VN-NHA - HK-HKG'
  UNION ALL SELECT 'VN-NHA', 'TW-KHH', 1916.00, 79.60, 'Tuyến tàu biển chuyên dụng VN-NHA - TW-KHH'
  UNION ALL SELECT 'VN-NHA', 'CN-SHA', 2811.00, 115.40, 'Tuyến tàu biển chuyên dụng VN-NHA - CN-SHA'
  UNION ALL SELECT 'VN-NHA', 'CN-GZH', 1381.00, 58.20, 'Tuyến tàu biển chuyên dụng VN-NHA - CN-GZH'
  UNION ALL SELECT 'VN-NHA', 'CN-TSN', 4086.00, 166.40, 'Tuyến tàu biển chuyên dụng VN-NHA - CN-TSN'
  UNION ALL SELECT 'VN-NHA', 'JP-TYO', 4331.00, 176.20, 'Tuyến tàu biển chuyên dụng VN-NHA - JP-TYO'
  UNION ALL SELECT 'VN-NHA', 'JP-OSA', 3958.00, 161.30, 'Tuyến tàu biển chuyên dụng VN-NHA - JP-OSA'
  UNION ALL SELECT 'VN-NHA', 'KR-PUS', 3523.00, 143.90, 'Tuyến tàu biển chuyên dụng VN-NHA - KR-PUS'
  UNION ALL SELECT 'VN-NHA', 'KR-INC', 3626.00, 148.00, 'Tuyến tàu biển chuyên dụng VN-NHA - KR-INC'
  UNION ALL SELECT 'VN-NHA', 'IN-NSA', 6182.00, 250.30, 'Tuyến tàu biển chuyên dụng VN-NHA - IN-NSA'
  UNION ALL SELECT 'VN-NHA', 'IN-MAA', 4744.00, 192.80, 'Tuyến tàu biển chuyên dụng VN-NHA - IN-MAA'
  UNION ALL SELECT 'VN-NHA', 'AE-DXB', 8070.00, 325.80, 'Tuyến tàu biển chuyên dụng VN-NHA - AE-DXB'
  UNION ALL SELECT 'VN-NHA', 'QA-DOH', 8422.00, 339.90, 'Tuyến tàu biển chuyên dụng VN-NHA - QA-DOH'
  UNION ALL SELECT 'VN-NHA', 'SA-DMM', 8498.00, 342.90, 'Tuyến tàu biển chuyên dụng VN-NHA - SA-DMM'
  UNION ALL SELECT 'VN-NHA', 'SA-JED', 9658.00, 389.30, 'Tuyến tàu biển chuyên dụng VN-NHA - SA-JED'
  UNION ALL SELECT 'VN-NHA', 'AU-SYD', 9150.00, 369.00, 'Tuyến tàu biển chuyên dụng VN-NHA - AU-SYD'
  UNION ALL SELECT 'VN-NHA', 'AU-MEL', 8718.00, 351.70, 'Tuyến tàu biển chuyên dụng VN-NHA - AU-MEL'
  UNION ALL SELECT 'VN-NHA', 'AU-BNE', 8337.00, 336.50, 'Tuyến tàu biển chuyên dụng VN-NHA - AU-BNE'
  UNION ALL SELECT 'VN-NHA', 'AU-FRE', 5678.00, 230.10, 'Tuyến tàu biển chuyên dụng VN-NHA - AU-FRE'
  UNION ALL SELECT 'VN-NHA', 'NZ-AKL', 10553.00, 425.10, 'Tuyến tàu biển chuyên dụng VN-NHA - NZ-AKL'
  UNION ALL SELECT 'VN-NHA', 'BE-ANR', 17033.00, 684.30, 'Tuyến tàu biển chuyên dụng VN-NHA - BE-ANR'
  UNION ALL SELECT 'VN-NHA', 'NL-RTM', 17002.00, 683.10, 'Tuyến tàu biển chuyên dụng VN-NHA - NL-RTM'
  UNION ALL SELECT 'VN-NHA', 'FR-LEH', 16739.00, 672.60, 'Tuyến tàu biển chuyên dụng VN-NHA - FR-LEH'
  UNION ALL SELECT 'VN-NHA', 'GB-FXT', 16974.00, 682.00, 'Tuyến tàu biển chuyên dụng VN-NHA - GB-FXT'
  UNION ALL SELECT 'VN-NHA', 'DE-HAM', 17467.00, 701.70, 'Tuyến tàu biển chuyên dụng VN-NHA - DE-HAM'
  UNION ALL SELECT 'VN-NHA', 'ES-BCN', 14039.00, 564.60, 'Tuyến tàu biển chuyên dụng VN-NHA - ES-BCN'
  UNION ALL SELECT 'VN-NHA', 'IT-GOA', 13784.00, 554.40, 'Tuyến tàu biển chuyên dụng VN-NHA - IT-GOA'
  UNION ALL SELECT 'VN-NHA', 'US-LAX', 13451.00, 541.00, 'Tuyến tàu biển chuyên dụng VN-NHA - US-LAX'
  UNION ALL SELECT 'VN-NHA', 'US-NYC', 20421.00, 819.80, 'Tuyến tàu biển chuyên dụng VN-NHA - US-NYC'
  UNION ALL SELECT 'VN-NHA', 'US-SAV', 21571.00, 865.80, 'Tuyến tàu biển chuyên dụng VN-NHA - US-SAV'
  UNION ALL SELECT 'VN-NHA', 'US-MIA', 21317.00, 855.70, 'Tuyến tàu biển chuyên dụng VN-NHA - US-MIA'
  UNION ALL SELECT 'VN-RGI', 'VN-PQC', 137.00, 6.50, 'Tuyến tàu biển nội địa VN-RGI - VN-PQC'
  UNION ALL SELECT 'VN-RGI', 'VN-CLI', 707.00, 29.30, 'Tuyến tàu biển nội địa VN-RGI - VN-CLI'
  UNION ALL SELECT 'VN-RGI', 'VN-VUT', 674.00, 28.00, 'Tuyến tàu biển nội địa VN-RGI - VN-VUT'
  UNION ALL SELECT 'VN-CLI', 'VN-PQC', 672.00, 27.90, 'Tuyến tàu biển nội địa VN-CLI - VN-PQC'
  UNION ALL SELECT 'VN-CLI', 'VN-HPH', 1487.00, 60.50, 'Tuyến tàu biển nội địa VN-CLI - VN-HPH'
  UNION ALL SELECT 'VN-CLI', 'VN-DAD', 997.00, 40.90, 'Tuyến tàu biển nội địa VN-CLI - VN-DAD'
  UNION ALL SELECT 'VN-CLI', 'VN-NHA', 520.00, 21.80, 'Tuyến tàu biển nội địa VN-CLI - VN-NHA'
  UNION ALL SELECT 'VN-HPH', 'VN-DAD', 737.00, 30.50, 'Tuyến tàu biển nội địa VN-HPH - VN-DAD'
  UNION ALL SELECT 'VN-HPH', 'VN-NHA', 1142.00, 46.70, 'Tuyến tàu biển nội địa VN-HPH - VN-NHA'
  UNION ALL SELECT 'VN-DAD', 'VN-NHA', 652.00, 27.10, 'Tuyến tàu biển nội địa VN-DAD - VN-NHA'
  UNION ALL SELECT 'VN-VUT', 'VN-HPH', 1447.00, 58.90, 'Tuyến tàu biển nội địa VN-VUT - VN-HPH'
  UNION ALL SELECT 'VN-VUT', 'VN-DAD', 957.00, 39.30, 'Tuyến tàu biển nội địa VN-VUT - VN-DAD'
  UNION ALL SELECT 'SG-PSA', 'TH-LCB', 1468.00, 61.70, 'Tuyến tàu biển chuyên dụng SG-PSA - TH-LCB'
  UNION ALL SELECT 'SG-PSA', 'MY-PKG', 419.00, 19.80, 'Tuyến tàu biển chuyên dụng SG-PSA - MY-PKG'
  UNION ALL SELECT 'SG-PSA', 'MY-PEN', 773.00, 33.90, 'Tuyến tàu biển chuyên dụng SG-PSA - MY-PEN'
  UNION ALL SELECT 'SG-PSA', 'KH-KOS', 1207.00, 51.30, 'Tuyến tàu biển chuyên dụng SG-PSA - KH-KOS'
  UNION ALL SELECT 'SG-PSA', 'ID-JKT', 993.00, 42.70, 'Tuyến tàu biển chuyên dụng SG-PSA - ID-JKT'
  UNION ALL SELECT 'SG-PSA', 'ID-SUB', 1492.00, 62.70, 'Tuyến tàu biển chuyên dụng SG-PSA - ID-SUB'
  UNION ALL SELECT 'SG-PSA', 'PH-MNL', 2661.00, 109.40, 'Tuyến tàu biển chuyên dụng SG-PSA - PH-MNL'
  UNION ALL SELECT 'SG-PSA', 'HK-HKG', 2709.00, 111.40, 'Tuyến tàu biển chuyên dụng SG-PSA - HK-HKG'
  UNION ALL SELECT 'SG-PSA', 'TW-KHH', 3289.00, 134.60, 'Tuyến tàu biển chuyên dụng SG-PSA - TW-KHH'
  UNION ALL SELECT 'SG-PSA', 'CN-SHA', 4184.00, 170.40, 'Tuyến tàu biển chuyên dụng SG-PSA - CN-SHA'
  UNION ALL SELECT 'SG-PSA', 'JP-TYO', 5704.00, 231.20, 'Tuyến tàu biển chuyên dụng SG-PSA - JP-TYO'
  UNION ALL SELECT 'SG-PSA', 'KR-PUS', 4896.00, 198.80, 'Tuyến tàu biển chuyên dụng SG-PSA - KR-PUS'
  UNION ALL SELECT 'SG-PSA', 'IN-NSA', 4653.00, 189.10, 'Tuyến tàu biển chuyên dụng SG-PSA - IN-NSA'
  UNION ALL SELECT 'SG-PSA', 'IN-MAA', 3215.00, 131.60, 'Tuyến tàu biển chuyên dụng SG-PSA - IN-MAA'
  UNION ALL SELECT 'SG-PSA', 'AE-DXB', 6542.00, 264.70, 'Tuyến tàu biển chuyên dụng SG-PSA - AE-DXB'
  UNION ALL SELECT 'SG-PSA', 'QA-DOH', 6893.00, 278.70, 'Tuyến tàu biển chuyên dụng SG-PSA - QA-DOH'
  UNION ALL SELECT 'SG-PSA', 'SA-DMM', 6969.00, 281.80, 'Tuyến tàu biển chuyên dụng SG-PSA - SA-DMM'
  UNION ALL SELECT 'SG-PSA', 'SA-JED', 8129.00, 328.20, 'Tuyến tàu biển chuyên dụng SG-PSA - SA-JED'
  UNION ALL SELECT 'SG-PSA', 'AU-SYD', 8044.00, 324.80, 'Tuyến tàu biển chuyên dụng SG-PSA - AU-SYD'
  UNION ALL SELECT 'SG-PSA', 'AU-MEL', 7612.00, 307.50, 'Tuyến tàu biển chuyên dụng SG-PSA - AU-MEL'
  UNION ALL SELECT 'SG-PSA', 'AU-BNE', 7231.00, 292.20, 'Tuyến tàu biển chuyên dụng SG-PSA - AU-BNE'
  UNION ALL SELECT 'SG-PSA', 'AU-FRE', 4572.00, 185.90, 'Tuyến tàu biển chuyên dụng SG-PSA - AU-FRE'
  UNION ALL SELECT 'SG-PSA', 'NZ-AKL', 9446.00, 380.80, 'Tuyến tàu biển chuyên dụng SG-PSA - NZ-AKL'
  UNION ALL SELECT 'SG-PSA', 'NL-RTM', 15473.00, 621.90, 'Tuyến tàu biển chuyên dụng SG-PSA - NL-RTM'
  UNION ALL SELECT 'SG-PSA', 'GB-FXT', 15446.00, 620.80, 'Tuyến tàu biển chuyên dụng SG-PSA - GB-FXT'
  UNION ALL SELECT 'SG-PSA', 'BE-ANR', 15505.00, 623.20, 'Tuyến tàu biển chuyên dụng SG-PSA - BE-ANR'
  UNION ALL SELECT 'SG-PSA', 'FR-LEH', 15211.00, 611.40, 'Tuyến tàu biển chuyên dụng SG-PSA - FR-LEH'
  UNION ALL SELECT 'SG-PSA', 'DE-HAM', 15939.00, 640.60, 'Tuyến tàu biển chuyên dụng SG-PSA - DE-HAM'
  UNION ALL SELECT 'SG-PSA', 'ES-BCN', 12511.00, 503.40, 'Tuyến tàu biển chuyên dụng SG-PSA - ES-BCN'
  UNION ALL SELECT 'SG-PSA', 'IT-GOA', 12255.00, 493.20, 'Tuyến tàu biển chuyên dụng SG-PSA - IT-GOA'
  UNION ALL SELECT 'SG-PSA', 'US-LAX', 14824.00, 596.00, 'Tuyến tàu biển chuyên dụng SG-PSA - US-LAX'
  UNION ALL SELECT 'SG-PSA', 'US-NYC', 18893.00, 758.70, 'Tuyến tàu biển chuyên dụng SG-PSA - US-NYC'
  UNION ALL SELECT 'AE-DXB', 'QA-DOH', 490.00, 22.60, 'Tuyến tàu biển chuyên dụng AE-DXB - QA-DOH'
  UNION ALL SELECT 'AE-DXB', 'SA-DMM', 566.00, 25.60, 'Tuyến tàu biển chuyên dụng AE-DXB - SA-DMM'
  UNION ALL SELECT 'AE-DXB', 'SA-JED', 4306.00, 175.20, 'Tuyến tàu biển chuyên dụng AE-DXB - SA-JED'
  UNION ALL SELECT 'AE-DXB', 'IN-NSA', 2411.00, 99.40, 'Tuyến tàu biển chuyên dụng AE-DXB - IN-NSA'
  UNION ALL SELECT 'AE-DXB', 'IN-MAA', 4771.00, 193.80, 'Tuyến tàu biển chuyên dụng AE-DXB - IN-MAA'
  UNION ALL SELECT 'AE-DXB', 'NL-RTM', 11651.00, 469.00, 'Tuyến tàu biển chuyên dụng AE-DXB - NL-RTM'
  UNION ALL SELECT 'AE-DXB', 'GB-FXT', 11623.00, 467.90, 'Tuyến tàu biển chuyên dụng AE-DXB - GB-FXT'
  UNION ALL SELECT 'AE-DXB', 'BE-ANR', 11682.00, 470.30, 'Tuyến tàu biển chuyên dụng AE-DXB - BE-ANR'
  UNION ALL SELECT 'AE-DXB', 'FR-LEH', 11388.00, 458.50, 'Tuyến tàu biển chuyên dụng AE-DXB - FR-LEH'
  UNION ALL SELECT 'AE-DXB', 'DE-HAM', 12116.00, 487.60, 'Tuyến tàu biển chuyên dụng AE-DXB - DE-HAM'
  UNION ALL SELECT 'AE-DXB', 'ES-BCN', 8688.00, 350.50, 'Tuyến tàu biển chuyên dụng AE-DXB - ES-BCN'
  UNION ALL SELECT 'AE-DXB', 'IT-GOA', 8433.00, 340.30, 'Tuyến tàu biển chuyên dụng AE-DXB - IT-GOA'
  UNION ALL SELECT 'AE-DXB', 'US-NYC', 15070.00, 605.80, 'Tuyến tàu biển chuyên dụng AE-DXB - US-NYC'
  UNION ALL SELECT 'HK-HKG', 'JP-TYO', 3078.00, 126.10, 'Tuyến tàu biển chuyên dụng HK-HKG - JP-TYO'
  UNION ALL SELECT 'HK-HKG', 'KR-PUS', 2269.00, 93.80, 'Tuyến tàu biển chuyên dụng HK-HKG - KR-PUS'
  UNION ALL SELECT 'HK-HKG', 'CN-SHA', 1558.00, 65.30, 'Tuyến tàu biển chuyên dụng HK-HKG - CN-SHA'
  UNION ALL SELECT 'HK-HKG', 'US-LAX', 12197.00, 490.90, 'Tuyến tàu biển chuyên dụng HK-HKG - US-LAX'
  UNION ALL SELECT 'JP-TYO', 'KR-PUS', 1601.00, 67.00, 'Tuyến tàu biển chuyên dụng JP-TYO - KR-PUS'
  UNION ALL SELECT 'JP-TYO', 'CN-SHA', 2002.00, 83.10, 'Tuyến tàu biển chuyên dụng JP-TYO - CN-SHA'
  UNION ALL SELECT 'JP-TYO', 'US-LAX', 9211.00, 371.40, 'Tuyến tàu biển chuyên dụng JP-TYO - US-LAX'
  UNION ALL SELECT 'JP-TYO', 'AU-SYD', 9484.00, 382.40, 'Tuyến tàu biển chuyên dụng JP-TYO - AU-SYD'
  UNION ALL SELECT 'NL-RTM', 'GB-FXT', 193.00, 10.70, 'Tuyến tàu biển chuyên dụng NL-RTM - GB-FXT'
  UNION ALL SELECT 'NL-RTM', 'BE-ANR', 205.00, 11.20, 'Tuyến tàu biển chuyên dụng NL-RTM - BE-ANR'
  UNION ALL SELECT 'NL-RTM', 'FR-LEH', 435.00, 20.40, 'Tuyến tàu biển chuyên dụng NL-RTM - FR-LEH'
  UNION ALL SELECT 'NL-RTM', 'DE-HAM', 585.00, 26.40, 'Tuyến tàu biển chuyên dụng NL-RTM - DE-HAM'
  UNION ALL SELECT 'NL-RTM', 'US-NYC', 6608.00, 267.30, 'Tuyến tàu biển chuyên dụng NL-RTM - US-NYC'
  UNION ALL SELECT 'GB-FXT', 'US-NYC', 6581.00, 266.20, 'Tuyến tàu biển chuyên dụng GB-FXT - US-NYC'
  UNION ALL SELECT 'AU-SYD', 'NZ-AKL', 2332.00, 96.30, 'Tuyến tàu biển chuyên dụng AU-SYD - NZ-AKL'
  UNION ALL SELECT 'AU-SYD', 'AU-MEL', 1171.00, 49.80, 'Tuyến tàu biển chuyên dụng AU-SYD - AU-MEL'
) v
JOIN seaport p1 ON p1.code = v.from_code
JOIN seaport p2 ON p2.code = v.to_code
ON DUPLICATE KEY UPDATE
  distance_km = VALUES(distance_km),
  typical_hours = VALUES(typical_hours),
  is_active = TRUE,
  notes = VALUES(notes);
