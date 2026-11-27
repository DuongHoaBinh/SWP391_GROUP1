-- Migration 047: Expand global equine airports, seaports, vessel sea routes, and partner depots
-- synced 1-to-1 with frontend geo-corridors.ts & maritime-routing.ts.
-- Supports both Air Cargo and Sea Vessel last-mile delivery via international partner depots.
-- Idempotent: safe to re-run without duplicating rows.

-- 1. Global equine cargo airports (outside already-seeded ASEAN/China base)
INSERT INTO airport (iata_code, name, city, country, country_code, has_quarantine_facility, has_equine_cargo_ramp, air_role, is_active, lat, lng) VALUES
  -- East Asia (Japan, South Korea, Taiwan, China hubs)
  ('HND', 'Sân bay Quốc tế Haneda (HND Cargo)', 'Tokyo', 'Japan', 'JP', TRUE, TRUE, 'hub', TRUE, 35.549400, 139.779800),
  ('KIX', 'Sân bay Quốc tế Kansai (KIX Cargo)', 'Osaka', 'Japan', 'JP', TRUE, TRUE, 'hub', TRUE, 34.434700, 135.244000),
  ('NGO', 'Sân bay Quốc tế Chubu Centrair (NGO Cargo)', 'Nagoya', 'Japan', 'JP', TRUE, TRUE, 'gateway', TRUE, 34.858400, 136.805400),
  ('FUK', 'Sân bay Quốc tế Fukuoka (FUK Cargo)', 'Fukuoka', 'Japan', 'JP', TRUE, TRUE, 'gateway', TRUE, 33.585900, 130.450700),
  ('CTS', 'Sân bay Quốc tế New Chitose (CTS Cargo)', 'Sapporo', 'Japan', 'JP', TRUE, TRUE, 'gateway', TRUE, 42.775200, 141.692300),
  ('ICN', 'Sân bay Quốc tế Incheon (ICN Equine Cargo)', 'Seoul', 'South Korea', 'KR', TRUE, TRUE, 'hub', TRUE, 37.460200, 126.440700),
  ('PUS', 'Sân bay Quốc tế Gimhae (PUS Cargo)', 'Busan', 'South Korea', 'KR', TRUE, TRUE, 'gateway', TRUE, 35.179500, 128.938200),
  ('TPE', 'Sân bay Quốc tế Đào Viên (TPE Cargo)', 'Taipei', 'Taiwan', 'TW', TRUE, TRUE, 'hub', TRUE, 25.079700, 121.234200),
  ('KHH', 'Sân bay Quốc tế Cao Hùng (KHH Cargo)', 'Kaohsiung', 'Taiwan', 'TW', TRUE, TRUE, 'gateway', TRUE, 22.577100, 120.350000),
  ('HGH', 'Sân bay Quốc tế Tiêu Sơn Hàng Châu (HGH Cargo)', 'Hangzhou', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 30.229500, 120.434400),
  ('CKG', 'Sân bay Quốc tế Giang Bắc Trùng Khánh (CKG Cargo)', 'Chongqing', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 29.719200, 106.641700),
  ('XIY', 'Sân bay Quốc tế Hàm Dương Tây An (XIY Cargo)', 'Xian', 'China', 'CN', TRUE, TRUE, 'gateway', TRUE, 34.447100, 108.751600),
  -- South Asia (India)
  ('DEL', 'Sân bay Quốc tế Indira Gandhi (DEL Cargo)', 'New Delhi', 'India', 'IN', TRUE, TRUE, 'hub', TRUE, 28.556200, 77.100000),
  ('BOM', 'Sân bay Quốc tế Chhatrapati Shivaji (BOM Cargo)', 'Mumbai', 'India', 'IN', TRUE, TRUE, 'hub', TRUE, 19.089600, 72.865600),
  ('BLR', 'Sân bay Quốc tế Kempegowda (BLR Cargo)', 'Bengaluru', 'India', 'IN', TRUE, TRUE, 'gateway', TRUE, 13.198600, 77.706600),
  ('MAA', 'Sân bay Quốc tế Chennai (MAA Cargo)', 'Chennai', 'India', 'IN', TRUE, TRUE, 'gateway', TRUE, 12.994100, 80.170900),
  -- Middle East
  ('AUH', 'Sân bay Quốc tế Zayed Abu Dhabi (AUH Cargo)', 'Abu Dhabi', 'UAE', 'AE', TRUE, TRUE, 'hub', TRUE, 24.433000, 54.651100),
  ('DOH', 'Sân bay Quốc tế Hamad (DOH Equine Cargo)', 'Doha', 'Qatar', 'QA', TRUE, TRUE, 'hub', TRUE, 25.273100, 51.608100),
  ('RUH', 'Sân bay Quốc tế King Khalid (RUH Equine Cargo)', 'Riyadh', 'Saudi Arabia', 'SA', TRUE, TRUE, 'hub', TRUE, 24.957600, 46.698800),
  ('JED', 'Sân bay Quốc tế King Abdulaziz (JED Cargo)', 'Jeddah', 'Saudi Arabia', 'SA', TRUE, TRUE, 'gateway', TRUE, 21.679600, 39.156500),
  ('KWI', 'Sân bay Quốc tế Kuwait (KWI Cargo)', 'Kuwait City', 'Kuwait', 'KW', TRUE, TRUE, 'gateway', TRUE, 29.226600, 47.968900),
  ('BAH', 'Sân bay Quốc tế Bahrain (BAH Cargo)', 'Manama', 'Bahrain', 'BH', TRUE, TRUE, 'gateway', TRUE, 26.270800, 50.633600),
  ('MCT', 'Sân bay Quốc tế Muscat (MCT Cargo)', 'Muscat', 'Oman', 'OM', TRUE, TRUE, 'gateway', TRUE, 23.593300, 58.284400),
  -- Oceania (Australia & New Zealand)
  ('BNE', 'Sân bay Quốc tế Brisbane (BNE Cargo)', 'Brisbane', 'Australia', 'AU', TRUE, TRUE, 'gateway', TRUE, -27.384200, 153.117500),
  ('PER', 'Sân bay Quốc tế Perth (PER Cargo)', 'Perth', 'Australia', 'AU', TRUE, TRUE, 'gateway', TRUE, -31.940300, 115.966900),
  ('ADL', 'Sân bay Quốc tế Adelaide (ADL Cargo)', 'Adelaide', 'Australia', 'AU', TRUE, TRUE, 'gateway', TRUE, -34.945000, 138.530600),
  ('AKL', 'Sân bay Quốc tế Auckland (AKL Equine Cargo)', 'Auckland', 'New Zealand', 'NZ', TRUE, TRUE, 'hub', TRUE, -37.008200, 174.785000),
  ('CHC', 'Sân bay Quốc tế Christchurch (CHC Cargo)', 'Christchurch', 'New Zealand', 'NZ', TRUE, TRUE, 'gateway', TRUE, -43.489400, 172.532200),
  -- Europe
  ('LHR', 'Sân bay Quốc tế Heathrow (LHR Animal Reception Centre)', 'London', 'United Kingdom', 'GB', TRUE, TRUE, 'hub', TRUE, 51.470000, -0.454300),
  ('STN', 'Sân bay Quốc tế London Stansted (STN Equine Hub)', 'London', 'United Kingdom', 'GB', TRUE, TRUE, 'hub', TRUE, 51.886000, 0.238900),
  ('MAN', 'Sân bay Quốc tế Manchester (MAN Cargo)', 'Manchester', 'United Kingdom', 'GB', TRUE, TRUE, 'gateway', TRUE, 53.353700, -2.275000),
  ('EDI', 'Sân bay Quốc tế Edinburgh (EDI Cargo)', 'Edinburgh', 'United Kingdom', 'GB', TRUE, TRUE, 'gateway', TRUE, 55.950800, -3.361500),
  ('DUB', 'Sân bay Quốc tế Dublin (DUB Equine Cargo)', 'Dublin', 'Ireland', 'IE', TRUE, TRUE, 'hub', TRUE, 53.426400, -6.249900),
  ('LYS', 'Sân bay Lyon-Saint-Exupéry (LYS Cargo)', 'Lyon', 'France', 'FR', TRUE, TRUE, 'gateway', TRUE, 45.725600, 5.081100),
  ('NCE', 'Sân bay Nice Côte d''Azur (NCE Cargo)', 'Nice', 'France', 'FR', TRUE, TRUE, 'gateway', TRUE, 43.658400, 7.215900),
  ('MUC', 'Sân bay Quốc tế Munich (MUC Cargo)', 'Munich', 'Germany', 'DE', TRUE, TRUE, 'gateway', TRUE, 48.353700, 11.775000),
  ('BER', 'Sân bay Quốc tế Berlin Brandenburg (BER Cargo)', 'Berlin', 'Germany', 'DE', TRUE, TRUE, 'gateway', TRUE, 52.366700, 13.503300),
  ('HAM', 'Sân bay Quốc tế Hamburg (HAM Cargo)', 'Hamburg', 'Germany', 'DE', TRUE, TRUE, 'gateway', TRUE, 53.630400, 9.988200),
  ('AMS', 'Sân bay Quốc tế Schiphol (AMS Animal Hotel)', 'Amsterdam', 'Netherlands', 'NL', TRUE, TRUE, 'hub', TRUE, 52.310500, 4.768300),
  ('BRU', 'Sân bay Quốc tế Brussels (BRU Live Animal Hub)', 'Brussels', 'Belgium', 'BE', TRUE, TRUE, 'hub', TRUE, 50.901000, 4.485600),
  ('LGG', 'Sân bay Hàng hóa Liège (LGG Horse Inn)', 'Liège', 'Belgium', 'BE', TRUE, TRUE, 'hub', TRUE, 50.637400, 5.443200),
  ('MXP', 'Sân bay Quốc tế Milan Malpensa (MXP Cargo)', 'Milan', 'Italy', 'IT', TRUE, TRUE, 'hub', TRUE, 45.630100, 8.725500),
  ('FCO', 'Sân bay Quốc tế Rome Fiumicino (FCO Cargo)', 'Rome', 'Italy', 'IT', TRUE, TRUE, 'gateway', TRUE, 41.800300, 12.238900),
  ('MAD', 'Sân bay Quốc tế Madrid-Barajas (MAD Cargo)', 'Madrid', 'Spain', 'ES', TRUE, TRUE, 'hub', TRUE, 40.498300, -3.567600),
  ('BCN', 'Sân bay Quốc tế Barcelona-El Prat (BCN Cargo)', 'Barcelona', 'Spain', 'ES', TRUE, TRUE, 'gateway', TRUE, 41.297400, 2.083300),
  ('ZRH', 'Sân bay Quốc tế Zurich (ZRH Cargo)', 'Zurich', 'Switzerland', 'CH', TRUE, TRUE, 'hub', TRUE, 47.464700, 8.549200),
  ('VIE', 'Sân bay Quốc tế Vienna (VIE Cargo)', 'Vienna', 'Austria', 'AT', TRUE, TRUE, 'gateway', TRUE, 48.110300, 16.569700),
  ('IST', 'Sân bay Quốc tế Istanbul (IST Live Animal Hub)', 'Istanbul', 'Turkey', 'TR', TRUE, TRUE, 'hub', TRUE, 41.275300, 28.751900),
  -- North America (USA & Canada)
  ('LAX', 'Sân bay Quốc tế Los Angeles (LAX Equine Cargo)', 'Los Angeles', 'United States', 'US', TRUE, TRUE, 'hub', TRUE, 33.941600, -118.408500),
  ('SDF', 'Sân bay Quốc tế Louisville (SDF Worldport Cargo)', 'Louisville', 'United States', 'US', TRUE, TRUE, 'hub', TRUE, 38.174400, -85.736000),
  ('ORD', 'Sân bay Quốc tế O''Hare (ORD Cargo)', 'Chicago', 'United States', 'US', TRUE, TRUE, 'hub', TRUE, 41.974200, -87.907300),
  ('MIA', 'Sân bay Quốc tế Miami (MIA Live Animal Cargo)', 'Miami', 'United States', 'US', TRUE, TRUE, 'hub', TRUE, 25.795900, -80.287000),
  ('DFW', 'Sân bay Quốc tế Dallas/Fort Worth (DFW Cargo)', 'Dallas', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 32.899800, -97.040300),
  ('SFO', 'Sân bay Quốc tế San Francisco (SFO Cargo)', 'San Francisco', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 37.621300, -122.379000),
  ('SEA', 'Sân bay Quốc tế Seattle-Tacoma (SEA Cargo)', 'Seattle', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 47.450200, -122.308800),
  ('ATL', 'Sân bay Quốc tế Hartsfield-Jackson (ATL Cargo)', 'Atlanta', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 33.640700, -84.427700),
  ('BOS', 'Sân bay Quốc tế Logan (BOS Cargo)', 'Boston', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 42.365600, -71.009600),
  ('IAD', 'Sân bay Quốc tế Dulles (IAD Cargo)', 'Washington D.C.', 'United States', 'US', TRUE, TRUE, 'gateway', TRUE, 38.953100, -77.456500),
  ('YYZ', 'Sân bay Quốc tế Toronto Pearson (YYZ Cargo)', 'Toronto', 'Canada', 'CA', TRUE, TRUE, 'hub', TRUE, 43.677700, -79.624800),
  ('YVR', 'Sân bay Quốc tế Vancouver (YVR Cargo)', 'Vancouver', 'Canada', 'CA', TRUE, TRUE, 'hub', TRUE, 49.196700, -123.181500),
  ('YUL', 'Sân bay Quốc tế Montréal-Trudeau (YUL Cargo)', 'Montreal', 'Canada', 'CA', TRUE, TRUE, 'gateway', TRUE, 45.470600, -73.740800)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  city = VALUES(city),
  country = VALUES(country),
  country_code = VALUES(country_code),
  has_quarantine_facility = VALUES(has_quarantine_facility),
  has_equine_cargo_ramp = VALUES(has_equine_cargo_ramp),
  air_role = VALUES(air_role),
  is_active = TRUE,
  lat = VALUES(lat),
  lng = VALUES(lng);

-- 2. Additional global seaports (synced with frontend KNOWN_SEAPORTS & MARITIME_NODES)
INSERT INTO seaport (code, name, name_en, country, country_code, city, lat, lng, is_international, supports_ferry, supports_vessel, has_quarantine, is_active) VALUES
  ('AE-AUH', 'Cảng Khalifa (Abu Dhabi, UAE)', 'Khalifa Port (Abu Dhabi)', 'UAE', 'AE', 'Abu Dhabi', 24.810000, 54.650000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('OM-MCT', 'Cảng Sultan Qaboos (Muscat, Oman)', 'Port Sultan Qaboos (Muscat)', 'Oman', 'OM', 'Muscat', 23.628000, 58.570000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('FR-MRS', 'Cảng Marseille-Fos (Pháp)', 'Port of Marseille-Fos', 'France', 'FR', 'Marseille', 43.340000, 5.330000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('GB-SOU', 'Cảng Southampton (Vương quốc Anh)', 'Port of Southampton', 'United Kingdom', 'GB', 'Southampton', 50.897000, -1.404000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('IE-DUB', 'Cảng Dublin (Ireland)', 'Dublin Port', 'Ireland', 'IE', 'Dublin', 53.347000, -6.205000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('IT-NAP', 'Cảng Naples (Ý)', 'Port of Naples', 'Italy', 'IT', 'Naples', 40.840000, 14.270000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('TR-IST', 'Cảng Ambarli / Istanbul (Thổ Nhĩ Kỳ)', 'Ambarli Port (Istanbul)', 'Turkey', 'TR', 'Istanbul', 40.970000, 28.690000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('US-OAK', 'Cảng Oakland / San Francisco (Hoa Kỳ)', 'Port of Oakland', 'United States', 'US', 'Oakland', 37.795000, -122.280000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('US-SEA', 'Cảng Seattle (Hoa Kỳ)', 'Port of Seattle', 'United States', 'US', 'Seattle', 47.580000, -122.350000, TRUE, FALSE, TRUE, TRUE, TRUE),
  ('CA-VAN', 'Cảng Vancouver (Canada)', 'Port of Vancouver', 'Canada', 'CA', 'Vancouver', 49.290000, -123.110000, TRUE, FALSE, TRUE, TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_en = VALUES(name_en),
  country = VALUES(country),
  country_code = VALUES(country_code),
  city = VALUES(city),
  lat = VALUES(lat),
  lng = VALUES(lng),
  is_international = TRUE,
  supports_ferry = FALSE,
  supports_vessel = TRUE,
  has_quarantine = TRUE,
  is_active = TRUE;

-- 3. Vessel sea_route corridors for the 10 new global seaports (exact maritime polyline distances)
INSERT INTO sea_route (from_port_id, to_port_id, sea_mode, distance_km, typical_hours, is_active, notes)
SELECT p1.port_id, p2.port_id, 'vessel', v.distance_km, v.typical_hours, TRUE, v.notes
FROM (
  SELECT 'VN-CLI' AS from_code, 'AE-AUH' AS to_code, 7742.00 AS distance_km, 312.70 AS typical_hours, 'Tuyến tàu biển chuyên dụng VN-CLI - AE-AUH' AS notes
  UNION ALL SELECT 'VN-CLI', 'OM-MCT', 7147.00, 288.90, 'Tuyến tàu biển chuyên dụng VN-CLI - OM-MCT'
  UNION ALL SELECT 'VN-CLI', 'FR-MRS', 13649.00, 549.00, 'Tuyến tàu biển chuyên dụng VN-CLI - FR-MRS'
  UNION ALL SELECT 'VN-CLI', 'GB-SOU', 16256.00, 653.20, 'Tuyến tàu biển chuyên dụng VN-CLI - GB-SOU'
  UNION ALL SELECT 'VN-CLI', 'IE-DUB', 16380.00, 658.20, 'Tuyến tàu biển chuyên dụng VN-CLI - IE-DUB'
  UNION ALL SELECT 'VN-CLI', 'IT-NAP', 13128.00, 528.10, 'Tuyến tàu biển chuyên dụng VN-CLI - IT-NAP'
  UNION ALL SELECT 'VN-CLI', 'TR-IST', 12076.00, 486.00, 'Tuyến tàu biển chuyên dụng VN-CLI - TR-IST'
  UNION ALL SELECT 'VN-CLI', 'US-OAK', 13393.00, 538.70, 'Tuyến tàu biển chuyên dụng VN-CLI - US-OAK'
  UNION ALL SELECT 'VN-CLI', 'US-SEA', 14040.00, 564.60, 'Tuyến tàu biển chuyên dụng VN-CLI - US-SEA'
  UNION ALL SELECT 'VN-CLI', 'CA-VAN', 14001.00, 563.00, 'Tuyến tàu biển chuyên dụng VN-CLI - CA-VAN'
  UNION ALL SELECT 'VN-HPH', 'AE-AUH', 9080.00, 366.20, 'Tuyến tàu biển chuyên dụng VN-HPH - AE-AUH'
  UNION ALL SELECT 'VN-HPH', 'OM-MCT', 8485.00, 342.40, 'Tuyến tàu biển chuyên dụng VN-HPH - OM-MCT'
  UNION ALL SELECT 'VN-HPH', 'FR-MRS', 14987.00, 602.50, 'Tuyến tàu biển chuyên dụng VN-HPH - FR-MRS'
  UNION ALL SELECT 'VN-HPH', 'GB-SOU', 17594.00, 706.80, 'Tuyến tàu biển chuyên dụng VN-HPH - GB-SOU'
  UNION ALL SELECT 'VN-HPH', 'IE-DUB', 17718.00, 711.70, 'Tuyến tàu biển chuyên dụng VN-HPH - IE-DUB'
  UNION ALL SELECT 'VN-HPH', 'IT-NAP', 14466.00, 581.60, 'Tuyến tàu biển chuyên dụng VN-HPH - IT-NAP'
  UNION ALL SELECT 'VN-HPH', 'TR-IST', 13414.00, 539.60, 'Tuyến tàu biển chuyên dụng VN-HPH - TR-IST'
  UNION ALL SELECT 'VN-HPH', 'US-OAK', 12935.00, 520.40, 'Tuyến tàu biển chuyên dụng VN-HPH - US-OAK'
  UNION ALL SELECT 'VN-HPH', 'US-SEA', 13582.00, 546.30, 'Tuyến tàu biển chuyên dụng VN-HPH - US-SEA'
  UNION ALL SELECT 'VN-HPH', 'CA-VAN', 13543.00, 544.70, 'Tuyến tàu biển chuyên dụng VN-HPH - CA-VAN'
  UNION ALL SELECT 'VN-DAD', 'AE-AUH', 8590.00, 346.60, 'Tuyến tàu biển chuyên dụng VN-DAD - AE-AUH'
  UNION ALL SELECT 'VN-DAD', 'OM-MCT', 7995.00, 322.80, 'Tuyến tàu biển chuyên dụng VN-DAD - OM-MCT'
  UNION ALL SELECT 'VN-DAD', 'FR-MRS', 14497.00, 582.90, 'Tuyến tàu biển chuyên dụng VN-DAD - FR-MRS'
  UNION ALL SELECT 'VN-DAD', 'GB-SOU', 17104.00, 687.20, 'Tuyến tàu biển chuyên dụng VN-DAD - GB-SOU'
  UNION ALL SELECT 'VN-DAD', 'IE-DUB', 17228.00, 692.10, 'Tuyến tàu biển chuyên dụng VN-DAD - IE-DUB'
  UNION ALL SELECT 'VN-DAD', 'IT-NAP', 13976.00, 562.00, 'Tuyến tàu biển chuyên dụng VN-DAD - IT-NAP'
  UNION ALL SELECT 'VN-DAD', 'TR-IST', 12924.00, 520.00, 'Tuyến tàu biển chuyên dụng VN-DAD - TR-IST'
  UNION ALL SELECT 'VN-DAD', 'US-OAK', 12725.00, 512.00, 'Tuyến tàu biển chuyên dụng VN-DAD - US-OAK'
  UNION ALL SELECT 'VN-DAD', 'US-SEA', 13372.00, 537.90, 'Tuyến tàu biển chuyên dụng VN-DAD - US-SEA'
  UNION ALL SELECT 'VN-DAD', 'CA-VAN', 13333.00, 536.30, 'Tuyến tàu biển chuyên dụng VN-DAD - CA-VAN'
  UNION ALL SELECT 'SG-PSA', 'AE-AUH', 6580.00, 266.20, 'Tuyến tàu biển chuyên dụng SG-PSA - AE-AUH'
  UNION ALL SELECT 'SG-PSA', 'OM-MCT', 5985.00, 242.40, 'Tuyến tàu biển chuyên dụng SG-PSA - OM-MCT'
  UNION ALL SELECT 'SG-PSA', 'FR-MRS', 12487.00, 502.50, 'Tuyến tàu biển chuyên dụng SG-PSA - FR-MRS'
  UNION ALL SELECT 'SG-PSA', 'GB-SOU', 15095.00, 606.80, 'Tuyến tàu biển chuyên dụng SG-PSA - GB-SOU'
  UNION ALL SELECT 'SG-PSA', 'IE-DUB', 15219.00, 611.80, 'Tuyến tàu biển chuyên dụng SG-PSA - IE-DUB'
  UNION ALL SELECT 'SG-PSA', 'IT-NAP', 11967.00, 481.70, 'Tuyến tàu biển chuyên dụng SG-PSA - IT-NAP'
  UNION ALL SELECT 'SG-PSA', 'TR-IST', 10914.00, 439.60, 'Tuyến tàu biển chuyên dụng SG-PSA - TR-IST'
  UNION ALL SELECT 'SG-PSA', 'US-OAK', 14418.00, 579.70, 'Tuyến tàu biển chuyên dụng SG-PSA - US-OAK'
  UNION ALL SELECT 'SG-PSA', 'US-SEA', 15065.00, 605.60, 'Tuyến tàu biển chuyên dụng SG-PSA - US-SEA'
  UNION ALL SELECT 'SG-PSA', 'CA-VAN', 15026.00, 604.00, 'Tuyến tàu biển chuyên dụng SG-PSA - CA-VAN'
  UNION ALL SELECT 'HK-HKG', 'AE-AUH', 9276.00, 374.00, 'Tuyến tàu biển chuyên dụng HK-HKG - AE-AUH'
  UNION ALL SELECT 'HK-HKG', 'OM-MCT', 8681.00, 350.20, 'Tuyến tàu biển chuyên dụng HK-HKG - OM-MCT'
  UNION ALL SELECT 'HK-HKG', 'FR-MRS', 15183.00, 610.30, 'Tuyến tàu biển chuyên dụng HK-HKG - FR-MRS'
  UNION ALL SELECT 'HK-HKG', 'GB-SOU', 17790.00, 714.60, 'Tuyến tàu biển chuyên dụng HK-HKG - GB-SOU'
  UNION ALL SELECT 'HK-HKG', 'IE-DUB', 17914.00, 719.60, 'Tuyến tàu biển chuyên dụng HK-HKG - IE-DUB'
  UNION ALL SELECT 'HK-HKG', 'IT-NAP', 14662.00, 589.50, 'Tuyến tàu biển chuyên dụng HK-HKG - IT-NAP'
  UNION ALL SELECT 'HK-HKG', 'TR-IST', 13610.00, 547.40, 'Tuyến tàu biển chuyên dụng HK-HKG - TR-IST'
  UNION ALL SELECT 'HK-HKG', 'US-OAK', 11791.00, 474.60, 'Tuyến tàu biển chuyên dụng HK-HKG - US-OAK'
  UNION ALL SELECT 'HK-HKG', 'US-SEA', 12438.00, 500.50, 'Tuyến tàu biển chuyên dụng HK-HKG - US-SEA'
  UNION ALL SELECT 'HK-HKG', 'CA-VAN', 12399.00, 499.00, 'Tuyến tàu biển chuyên dụng HK-HKG - CA-VAN'
  UNION ALL SELECT 'GB-SOU', 'IE-DUB', 873.00, 37.90, 'Tuyến tàu biển chuyên dụng GB-SOU - IE-DUB'
  UNION ALL SELECT 'GB-SOU', 'FR-LEH', 231.00, 12.20, 'Tuyến tàu biển chuyên dụng GB-SOU - FR-LEH'
  UNION ALL SELECT 'GB-SOU', 'NL-RTM', 468.00, 21.70, 'Tuyến tàu biển chuyên dụng GB-SOU - NL-RTM'
  UNION ALL SELECT 'FR-MRS', 'ES-BCN', 346.00, 16.80, 'Tuyến tàu biển chuyên dụng FR-MRS - ES-BCN'
  UNION ALL SELECT 'FR-MRS', 'IT-GOA', 381.00, 18.20, 'Tuyến tàu biển chuyên dụng FR-MRS - IT-GOA'
  UNION ALL SELECT 'IT-NAP', 'IT-GOA', 659.00, 29.40, 'Tuyến tàu biển chuyên dụng IT-NAP - IT-GOA'
  UNION ALL SELECT 'IT-NAP', 'TR-IST', 2771.00, 113.80, 'Tuyến tàu biển chuyên dụng IT-NAP - TR-IST'
  UNION ALL SELECT 'AE-AUH', 'AE-DXB', 110.00, 7.40, 'Tuyến tàu biển chuyên dụng AE-AUH - AE-DXB'
  UNION ALL SELECT 'AE-AUH', 'OM-MCT', 881.00, 38.20, 'Tuyến tàu biển chuyên dụng AE-AUH - OM-MCT'
  UNION ALL SELECT 'AE-AUH', 'QA-DOH', 441.00, 20.60, 'Tuyến tàu biển chuyên dụng AE-AUH - QA-DOH'
  UNION ALL SELECT 'US-OAK', 'US-LAX', 674.00, 30.00, 'Tuyến tàu biển chuyên dụng US-OAK - US-LAX'
  UNION ALL SELECT 'US-OAK', 'US-SEA', 1465.00, 61.60, 'Tuyến tàu biển chuyên dụng US-OAK - US-SEA'
  UNION ALL SELECT 'US-SEA', 'CA-VAN', 336.00, 16.40, 'Tuyến tàu biển chuyên dụng US-SEA - CA-VAN'
  UNION ALL SELECT 'CA-VAN', 'JP-TYO', 9413.00, 379.50, 'Tuyến tàu biển chuyên dụng CA-VAN - JP-TYO'
  UNION ALL SELECT 'US-OAK', 'JP-TYO', 8805.00, 355.20, 'Tuyến tàu biển chuyên dụng US-OAK - JP-TYO'
) v
JOIN seaport p1 ON p1.code = v.from_code
JOIN seaport p2 ON p2.code = v.to_code
ON DUPLICATE KEY UPDATE
  distance_km = VALUES(distance_km),
  typical_hours = VALUES(typical_hours),
  is_active = TRUE,
  notes = VALUES(notes);

-- 4. Global partner depots (used for both Air Cargo & Sea Vessel last-mile delivery)
INSERT INTO depot (code, name, country, city, address, lat, lng, type, is_active) VALUES
  -- East Asia
  ('JP-TYO', 'Trạm Đối tác Tokyo – Miho (Nhật Bản)', 'Japan', 'Tokyo', 'Narita / Miho Equine Logistics Hub, Chiba', 35.764700, 140.386300, 'partner', TRUE),
  ('JP-OSA', 'Trạm Đối tác Osaka – Ritto (Nhật Bản)', 'Japan', 'Osaka', 'Kansai Equine Transport Center, Osaka', 34.480000, 135.400000, 'partner', TRUE),
  ('KR-SEL', 'Trạm Đối tác Seoul – Gwacheon (Hàn Quốc)', 'South Korea', 'Seoul', 'LetsRun Park Equine Hub, Incheon / Seoul', 37.448000, 126.980000, 'partner', TRUE),
  ('KR-PUS', 'Trạm Đối tác Busan (Hàn Quốc)', 'South Korea', 'Busan', 'Busan Gyeongnam Equine Logistics, Busan', 35.158000, 128.910000, 'partner', TRUE),
  ('TW-TPE', 'Trạm Đối tác Đài Bắc – Đào Viên (Đài Loan)', 'Taiwan', 'Taipei', 'Taoyuan Equine Cargo Depot, Taipei', 25.060000, 121.250000, 'partner', TRUE),
  -- South Asia
  ('IN-BOM', 'Trạm Đối tác Mumbai – Mahalaxmi (Ấn Độ)', 'India', 'Mumbai', 'Mahalaxmi Equine Transport Depot, Mumbai', 19.010000, 72.830000, 'partner', TRUE),
  ('IN-DEL', 'Trạm Đối tác New Delhi (Ấn Độ)', 'India', 'New Delhi', 'Delhi Race Club Equine Hub, New Delhi', 28.580000, 77.180000, 'partner', TRUE),
  -- Middle East
  ('AE-DXB', 'Trạm Đối tác Dubai – Meydan (UAE)', 'UAE', 'Dubai', 'Meydan Equine Logistics Center, Dubai', 25.156000, 55.302000, 'partner', TRUE),
  ('AE-AUH', 'Trạm Đối tác Abu Dhabi (UAE)', 'UAE', 'Abu Dhabi', 'Abu Dhabi Equestrian Logistics Hub', 24.453900, 54.447000, 'partner', TRUE),
  ('QA-DOH', 'Trạm Đối tác Doha – Al Rayyan (Qatar)', 'Qatar', 'Doha', 'Al Shaqab Equine Transport Center, Doha', 25.310000, 51.440000, 'partner', TRUE),
  ('SA-RUH', 'Trạm Đối tác Riyadh – Janadriyah (Ả Rập Xê Út)', 'Saudi Arabia', 'Riyadh', 'King Abdulaziz Racecourse Equine Hub, Riyadh', 24.940000, 46.780000, 'partner', TRUE),
  ('SA-JED', 'Trạm Đối tác Jeddah (Ả Rập Xê Út)', 'Saudi Arabia', 'Jeddah', 'Jeddah Equine Port & Air Depot', 21.580000, 39.180000, 'partner', TRUE),
  ('OM-MCT', 'Trạm Đối tác Muscat (Oman)', 'Oman', 'Muscat', 'Royal Cavalry Equine Logistics, Muscat', 23.600000, 58.350000, 'partner', TRUE),
  -- Oceania
  ('AU-SYD', 'Trạm Đối tác Sydney – Randwick (Úc)', 'Australia', 'Sydney', 'Eastern Creek / Randwick Equine Hub, Sydney', -33.908000, 151.230000, 'partner', TRUE),
  ('AU-MEL', 'Trạm Đối tác Melbourne – Flemington (Úc)', 'Australia', 'Melbourne', 'Mickleham / Flemington Equine Hub, Melbourne', -37.788000, 144.912000, 'partner', TRUE),
  ('AU-BNE', 'Trạm Đối tác Brisbane – Eagle Farm (Úc)', 'Australia', 'Brisbane', 'Eagle Farm Equine Logistics, Brisbane', -27.431000, 153.068000, 'partner', TRUE),
  ('AU-PER', 'Trạm Đối tác Perth – Ascot (Úc)', 'Australia', 'Perth', 'Ascot Equine Logistics, Perth', -31.930000, 115.930000, 'partner', TRUE),
  ('NZ-AKL', 'Trạm Đối tác Auckland – Ellerslie (New Zealand)', 'New Zealand', 'Auckland', 'Karaka / Ellerslie Equine Transport, Auckland', -36.960000, 174.820000, 'partner', TRUE),
  -- Europe
  ('GB-LON', 'Trạm Đối tác London – Newmarket (Vương quốc Anh)', 'United Kingdom', 'London', 'Newmarket / Heathrow Equine Logistics, UK', 51.520000, -0.350000, 'partner', TRUE),
  ('IE-DUB', 'Trạm Đối tác Dublin – Kildare (Ireland)', 'Ireland', 'Dublin', 'The Curragh / Dublin Equine Depot, Ireland', 53.350000, -6.320000, 'partner', TRUE),
  ('FR-PAR', 'Trạm Đối tác Paris – Chantilly (Pháp)', 'France', 'Paris', 'Chantilly / Roissy Equine Logistics, Paris', 49.060000, 2.510000, 'partner', TRUE),
  ('FR-MRS', 'Trạm Đối tác Marseille – Provence (Pháp)', 'France', 'Marseille', 'Marseille-Fos Equine Logistics Hub, France', 43.360000, 5.340000, 'partner', TRUE),
  ('DE-FRA', 'Trạm Đối tác Frankfurt (Đức)', 'Germany', 'Frankfurt', 'Frankfurt Equine Cargo Lounge Depot, Germany', 50.045000, 8.580000, 'partner', TRUE),
  ('NL-AMS', 'Trạm Đối tác Amsterdam – Schiphol (Hà Lan)', 'Netherlands', 'Amsterdam', 'Schiphol / Rotterdam Equine Transport, NL', 52.280000, 4.740000, 'partner', TRUE),
  ('BE-BRU', 'Trạm Đối tác Brussels – Liège (Bỉ)', 'Belgium', 'Brussels', 'Liège / Brussels Equine Logistics, Belgium', 50.850000, 4.520000, 'partner', TRUE),
  ('IT-MIL', 'Trạm Đối tác Milan – San Siro (Ý)', 'Italy', 'Milan', 'San Siro / Malpensa Equine Depot, Milan', 45.510000, 9.080000, 'partner', TRUE),
  ('ES-MAD', 'Trạm Đối tác Madrid – Barcelona (Tây Ban Nha)', 'Spain', 'Madrid', 'Hipódromo de la Zarzuela Equine Depot, Madrid', 40.470000, -3.720000, 'partner', TRUE),
  ('CH-ZRH', 'Trạm Đối tác Zurich (Thụy Sĩ)', 'Switzerland', 'Zurich', 'Zurich Airport Equine Logistics, Switzerland', 47.450000, 8.560000, 'partner', TRUE),
  ('TR-IST', 'Trạm Đối tác Istanbul – Veliefendi (Thổ Nhĩ Kỳ)', 'Turkey', 'Istanbul', 'Veliefendi Equine Logistics Center, Istanbul', 41.020000, 28.860000, 'partner', TRUE),
  -- North America
  ('US-NYC', 'Trạm Đối tác New York – Belmont (Hoa Kỳ)', 'United States', 'New York', 'Belmont / JFK Equine Transport Depot, NY', 40.680000, -73.740000, 'partner', TRUE),
  ('US-LAX', 'Trạm Đối tác Los Angeles – Santa Anita (Hoa Kỳ)', 'United States', 'Los Angeles', 'Santa Anita / LAX Equine Hub, California', 34.080000, -118.180000, 'partner', TRUE),
  ('US-LEX', 'Trạm Đối tác Lexington – Louisville (Hoa Kỳ)', 'United States', 'Louisville', 'Keeneland / Kentucky Equine Logistics Hub', 38.050000, -84.600000, 'partner', TRUE),
  ('US-MIA', 'Trạm Đối tác Miami – Gulfstream (Hoa Kỳ)', 'United States', 'Miami', 'Miami Equine Air & Port Depot, Florida', 25.820000, -80.240000, 'partner', TRUE),
  ('US-SFO', 'Trạm Đối tác San Francisco – Oakland (Hoa Kỳ)', 'United States', 'San Francisco', 'Bay Area Equine Logistics, California', 37.750000, -122.250000, 'partner', TRUE),
  ('CA-TOR', 'Trạm Đối tác Toronto – Woodbine (Canada)', 'Canada', 'Toronto', 'Woodbine Equine Transport Center, Toronto', 43.710000, -79.600000, 'partner', TRUE),
  ('CA-VAN', 'Trạm Đối tác Vancouver (Canada)', 'Canada', 'Vancouver', 'Hastings / YVR Equine Logistics, Vancouver', 49.240000, -123.130000, 'partner', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  country = VALUES(country),
  city = VALUES(city),
  address = VALUES(address),
  lat = VALUES(lat),
  lng = VALUES(lng),
  type = 'partner',
  is_active = TRUE;
