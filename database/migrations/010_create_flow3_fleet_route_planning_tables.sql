-- Migration 010: Create Master Data & Schema Enhancements for Flow 3 Route Planning & Multi-modal Legs

USE horse_transport_system;

-- 1. Master Data: Airlines
CREATE TABLE IF NOT EXISTS `airline` (
  `airline_id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(10) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `cargo_service_name` VARCHAR(150) NULL,
  `contact_phone` VARCHAR(50) NULL,
  `contact_email` VARCHAR(150) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Master Data: Airports
CREATE TABLE IF NOT EXISTS `airport` (
  `airport_id` INT AUTO_INCREMENT PRIMARY KEY,
  `iata_code` VARCHAR(10) NOT NULL UNIQUE,
  `icao_code` VARCHAR(10) NULL,
  `name` VARCHAR(150) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `country` VARCHAR(100) NOT NULL,
  `has_quarantine_facility` BOOLEAN NOT NULL DEFAULT TRUE,
  `has_equine_cargo_ramp` BOOLEAN NOT NULL DEFAULT TRUE,
  `lat` DECIMAL(10, 6) NULL,
  `lng` DECIMAL(10, 6) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Master Data: Stops & Waypoints Catalog
CREATE TABLE IF NOT EXISTS `master_stop` (
  `stop_id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `stop_type` ENUM('rest', 'quarantine', 'refuel', 'border_check') NOT NULL,
  `address` VARCHAR(255) NULL,
  `city` VARCHAR(100) NULL,
  `country` VARCHAR(100) NOT NULL,
  `has_veterinarian` BOOLEAN NOT NULL DEFAULT FALSE,
  `has_stalls` BOOLEAN NOT NULL DEFAULT TRUE,
  `lat` DECIMAL(10, 6) NULL,
  `lng` DECIMAL(10, 6) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Extend Route table with Strategic Framework and Plan Status
ALTER TABLE `route`
  ADD COLUMN `assigned_coordinator_id` INT NULL,
  ADD COLUMN `manager_vehicle_type` VARCHAR(100) NULL,
  ADD COLUMN `manager_airline_id` INT NULL,
  ADD COLUMN `manager_departure_airport_id` INT NULL,
  ADD COLUMN `manager_arrival_airport_id` INT NULL,
  ADD COLUMN `manager_main_corridor` VARCHAR(255) NULL,
  ADD COLUMN `strategic_notes` TEXT NULL,
  ADD COLUMN `rejection_reason` VARCHAR(500) NULL,
  ADD COLUMN `plan_status` ENUM('draft', 'pending_approval', 'approved', 'confirmed', 'ready_to_depart', 'in_transit', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  ADD COLUMN `approved_by` INT NULL,
  ADD COLUMN `approved_at` DATETIME NULL;

-- 5. Multi-modal Route Legs
CREATE TABLE IF NOT EXISTS `route_leg` (
  `leg_id` INT AUTO_INCREMENT PRIMARY KEY,
  `route_id` INT NOT NULL,
  `sequence_no` INT NOT NULL,
  `leg_type` ENUM('road', 'flight') NOT NULL DEFAULT 'road',
  `origin_location` VARCHAR(255) NOT NULL,
  `destination_location` VARCHAR(255) NOT NULL,
  `distance_km` DECIMAL(10, 2) NULL,
  `duration_hours` DECIMAL(6, 2) NULL,
  `planned_departure` DATETIME NULL,
  `planned_arrival` DATETIME NULL,
  -- For Road Legs:
  `vehicle_id` INT NULL,
  -- For Flight Legs:
  `airline_id` INT NULL,
  `airline_name` VARCHAR(150) NULL,
  `flight_number` VARCHAR(50) NULL,
  `departure_airport_id` INT NULL,
  `departure_airport_code` VARCHAR(10) NULL,
  `arrival_airport_id` INT NULL,
  `arrival_airport_code` VARCHAR(10) NULL,
  `booking_reference` VARCHAR(100) NULL,
  `stalls_booked` INT NOT NULL DEFAULT 0,
  `status` ENUM('pending', 'active', 'completed') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_leg_route` FOREIGN KEY (`route_id`) REFERENCES `route`(`route_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leg_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle`(`vehicle_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leg_airline` FOREIGN KEY (`airline_id`) REFERENCES `airline`(`airline_id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 6. Link Route Stop to Route Leg
ALTER TABLE `route_stop`
  ADD COLUMN `leg_id` INT NULL;

-- 7. Extend Shipment Assignment with Driver / Staff Confirmation
ALTER TABLE `shipment_assignment`
  ADD COLUMN `is_confirmed` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `confirmed_at` DATETIME NULL,
  ADD COLUMN `confirmation_notes` VARCHAR(255) NULL;

-- 8. Extend Shipment Status ENUM to include 'confirmed' and 'ready_to_depart'
ALTER TABLE `shipment`
  MODIFY COLUMN `status` ENUM('requested', 'change_requested', 'approved', 'rejected', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'completed', 'cancelled') NOT NULL DEFAULT 'requested';

-- 9. Seed Master Data (Airlines, Airports, Master Stops)
INSERT IGNORE INTO `airline` (`code`, `name`, `cargo_service_name`, `contact_phone`, `contact_email`) VALUES
('SQ', 'Singapore Airlines Cargo', 'SQ Equine SkyCargo', '+65 6542 5588', 'cargo_equine@singaporeair.com.sg'),
('EK', 'Emirates SkyCargo', 'Emirates Equine Air Cargo', '+971 4 703 6666', 'skycargo.equine@emirates.com'),
('QR', 'Qatar Airways Cargo', 'Live Animal Cargo Support', '+974 4022 0000', 'liveanimals@qatarairways.com.qa'),
('CX', 'Cathay Pacific Cargo', 'Cathay Live Animal Transport', '+852 2747 1888', 'cargo_live@cathaypacific.com'),
('VN', 'Vietnam Airlines Cargo', 'Lotus Cargo Special Care', '+84 28 3844 6667', 'cargo.liveanimal@vietnamairlines.com');

INSERT IGNORE INTO `airport` (`iata_code`, `icao_code`, `name`, `city`, `country`, `has_quarantine_facility`, `has_equine_cargo_ramp`, `lat`, `lng`) VALUES
('SGN', 'VVTS', 'Sân bay Quốc tế Tân Sơn Nhất (Cargo Terminal)', 'TP. Hồ Chí Minh', 'Vietnam', TRUE, TRUE, 10.8185, 106.6519),
('VCA', 'VVCT', 'Sân bay Quốc tế Cần Thơ (Mekong Cargo Terminal)', 'Cần Thơ', 'Vietnam', TRUE, TRUE, 10.0851, 105.7119),
('HAN', 'VVNB', 'Sân bay Quốc tế Nội Bài (North Cargo Hub)', 'Hà Nội', 'Vietnam', TRUE, TRUE, 21.2212, 105.8072),
('DAD', 'VVDN', 'Sân bay Quốc tế Đà Nẵng (Central Cargo Terminal)', 'Đà Nẵng', 'Vietnam', TRUE, TRUE, 16.0538, 108.1994),
('SIN', 'WSSS', 'Singapore Changi International Airport (ALPS Cargo Hub)', 'Singapore', 'Singapore', TRUE, TRUE, 1.3644, 103.9915),
('SYD', 'YSSY', 'Sydney Kingsford Smith Airport (Equine Air Center)', 'Sydney', 'Australia', TRUE, TRUE, -33.9461, 151.1772),
('MEL', 'YMML', 'Melbourne Tullamarine Airport (Victoria Cargo Hub)', 'Melbourne', 'Australia', TRUE, TRUE, -37.6733, 144.8433),
('HKG', 'VHHH', 'Hong Kong International Airport (SuperTerminal 1)', 'Hồng Kông', 'Hong Kong', TRUE, TRUE, 22.3080, 113.9185),
('NRT', 'RJAA', 'Tokyo Narita International Airport', 'Tokyo', 'Japan', TRUE, TRUE, 35.7647, 140.3863),
('KUL', 'WMKK', 'Kuala Lumpur International Airport (KLIA Cargo)', 'Sepang', 'Malaysia', TRUE, TRUE, 2.7456, 101.7099),
('BKK', 'VTBS', 'Bangkok Suvarnabhumi Airport (Free Zone Cargo)', 'Bangkok', 'Thailand', TRUE, TRUE, 13.6900, 100.7501),
('CGK', 'WIII', 'Soekarno-Hatta International Airport (Jakarta Cargo Hub)', 'Jakarta', 'Indonesia', TRUE, TRUE, -6.1256, 106.6559),
('BDJ', 'WAOO', 'Syamsudin Noor Airport (Kalimantan Regional Cargo Hub)', 'Banjarmasin', 'Indonesia', TRUE, TRUE, -3.4474, 114.7578),
('DPS', 'WADD', 'Ngurah Rai International Airport (Bali Cargo Terminal)', 'Denpasar', 'Indonesia', TRUE, TRUE, -8.7482, 115.1672),
('SUB', 'WARR', 'Juanda International Airport (Surabaya Cargo Hub)', 'Surabaya', 'Indonesia', TRUE, TRUE, -7.3798, 112.7876),
('PNH', 'VDPP', 'Phnom Penh International Airport (Live Animal Cargo)', 'Phnom Penh', 'Campuchia', TRUE, TRUE, 11.5466, 104.8441),
('DXB', 'OMDB', 'Dubai International Airport (Emirates Equine Hub)', 'Dubai', 'UAE', TRUE, TRUE, 25.2532, 55.3657),
('FRA', 'EDDF', 'Frankfurt Airport (Lufthansa Animal Lounge Hub)', 'Frankfurt', 'Đức', TRUE, TRUE, 50.0379, 8.5622),
('CDG', 'LFPG', 'Paris Charles de Gaulle Airport (Air France Cargo Hub)', 'Paris', 'Pháp', TRUE, TRUE, 49.0097, 2.5479),
('JFK', 'KJFK', 'John F. Kennedy International Airport (The ARK Equine Center)', 'New York', 'Mỹ', TRUE, TRUE, 40.6413, -73.7781);

INSERT IGNORE INTO `master_stop` (`name`, `stop_type`, `address`, `city`, `country`, `has_veterinarian`, `has_stalls`, `lat`, `lng`) VALUES
('Trạm trung chuyển & Nghỉ dưỡng ngựa Củ Chi', 'rest', 'Đường Tỉnh Lộ 15, Huyện Củ Chi', 'TP. Hồ Chí Minh', 'Vietnam', TRUE, TRUE, 11.0267, 106.5167),
('Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài', 'quarantine', 'Quốc lộ 22, Bến Cầu', 'Tây Ninh', 'Vietnam', TRUE, TRUE, 11.0667, 106.1833),
('Trạm dừng chân & Tiếp nhiên liệu Tiền Giang', 'rest', 'Cao tốc Trung Lương - Mỹ Thuận', 'Tiền Giang', 'Vietnam', FALSE, TRUE, 10.4167, 106.1667),
('Trạm kiểm dịch Thú y Vùng VI (Cảng SGN Cargo)', 'quarantine', 'Đường Trường Sơn, Phường 2, Tân Bình', 'TP. Hồ Chí Minh', 'Vietnam', TRUE, TRUE, 10.8150, 106.6600),
('Cửa khẩu Quốc tế Hữu Nghị', 'border_check', 'Thị trấn Đồng Đăng, Huyện Cao Lộc', 'Lạng Sơn', 'Vietnam', TRUE, TRUE, 21.9833, 106.7167),
('Tuas Checkpoint & Equine Holding Facility', 'border_check', 'Tuas South Way', 'Tuas', 'Singapore', TRUE, TRUE, 1.3436, 103.6364),
('Eastern Creek Quarantine Facility', 'quarantine', '60 Wallgrove Rd, Eastern Creek', 'Sydney', 'Australia', TRUE, TRUE, -33.8050, 150.8520);
