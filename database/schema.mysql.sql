-- ============================================================================
-- Cross-Border Racehorse Transport System
-- MySQL 8.0+ / InnoDB / utf8mb4
--
-- Canonical MySQL 8.0+ schema for Cross-Border Racehorse Transport System.
-- Run `node database/migrate.cjs` (or `npm run migrate:all` in backend/) after loading base schema
-- to apply incremental feature tables/migrations and record them in `schema_migrations`.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS horse_transport_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE horse_transport_system;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `role` (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
) ENGINE=InnoDB;

-- `user` is quoted because USER is a reserved/system identifier in MySQL.
CREATE TABLE `user` (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  specialization VARCHAR(50) NULL DEFAULT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  account_origin ENUM('self_registered','system_created') NOT NULL DEFAULT 'system_created',
  auth_provider ENUM('local','google') NOT NULL DEFAULT 'local',
  google_id VARCHAR(100),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT,
  avatar_url VARCHAR(500),
  gender ENUM('male','female','other'),
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  current_shift VARCHAR(100) NULL DEFAULT 'Ca Hành Chính (08:00 - 17:00)',
  duty_status VARCHAR(32) NULL DEFAULT 'ON_DUTY',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES `role`(role_id),
  CONSTRAINT fk_user_created_by FOREIGN KEY (created_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE otp_verification (
  otp_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL,
  user_id INT,
  password_hash VARCHAR(255) NOT NULL,
  otp_code VARCHAR(10) NOT NULL,
  purpose ENUM('register','login','reset_password') NOT NULL DEFAULT 'register',
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES `user`(user_id),
  INDEX idx_otp_email_purpose (email, purpose)
) ENGINE=InnoDB;

CREATE TABLE horse (
  horse_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  breed VARCHAR(100),
  gender ENUM('male','female','gelding'),
  date_of_birth DATE,
  age INT,
  microchip_no VARCHAR(50) UNIQUE,
  passport_no VARCHAR(50) UNIQUE,
  photo_url VARCHAR(500) NULL,
  color VARCHAR(100),
  weight VARCHAR(100),
  medical_status VARCHAR(255),
  special_requirements TEXT,
  status ENUM('active','in_transit','retired','deceased') NOT NULL DEFAULT 'active',
  quantity INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_horse_owner FOREIGN KEY (owner_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE regulation (
  regulation_id INT AUTO_INCREMENT PRIMARY KEY,
  country VARCHAR(100) NOT NULL,
  border_gate VARCHAR(100) NULL,
  transport_mode ENUM('road','air','both') NOT NULL DEFAULT 'both',
  doc_tier ENUM('A','B') NOT NULL DEFAULT 'A',
  lead_time_days INT NOT NULL DEFAULT 5,
  requires_authority_approval BOOLEAN NOT NULL DEFAULT FALSE,
  min_validity_buffer_hours INT NOT NULL DEFAULT 24,
  document_type VARCHAR(100) NOT NULL,
  description TEXT,
  effective_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE transport_document (
  document_id INT AUTO_INCREMENT PRIMARY KEY,
  horse_id INT NOT NULL,
  regulation_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  doc_type VARCHAR(100) NOT NULL,
  doc_number VARCHAR(100),
  file_url VARCHAR(500) NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  status ENUM('draft','submitted','approved','rejected','expired') NOT NULL DEFAULT 'draft',
  reviewer_notes VARCHAR(500),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_document_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_horse FOREIGN KEY (horse_id) REFERENCES horse(horse_id),
  CONSTRAINT fk_doc_regulation FOREIGN KEY (regulation_id) REFERENCES regulation(regulation_id),
  CONSTRAINT fk_doc_uploader FOREIGN KEY (uploaded_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE document_approval (
  approval_id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  approved_by INT,
  authority_name VARCHAR(150) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approval_date DATETIME,
  notes TEXT,
  CONSTRAINT fk_approval_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id),
  CONSTRAINT fk_approval_user FOREIGN KEY (approved_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE shipment (
  shipment_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  requested_by INT NOT NULL,
  approved_by INT,
  contact_name VARCHAR(150),
  contact_address VARCHAR(255),
  contact_phone VARCHAR(20) NOT NULL,
  contact_email VARCHAR(150) NOT NULL,
  requested_horse_count INT NOT NULL DEFAULT 1,
  origin_location VARCHAR(255) NOT NULL,
  destination_location VARCHAR(255) NOT NULL,
  transportation_type VARCHAR(50) NULL DEFAULT NULL,
  requested_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  departure_date DATETIME,
  expected_arrival_date DATETIME,
  actual_arrival_date DATETIME,
  special_requirements TEXT,
  rejection_reason VARCHAR(500),
  change_request_notes VARCHAR(500),
  status ENUM('requested','change_requested','approved','rejected','planning','confirmed','ready_to_depart','in_transit','completed','cancelled','cancelled_operational') NOT NULL DEFAULT 'requested',
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  transport_cost DECIMAL(15,2) NULL DEFAULT NULL,
  insurance_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booking_type ENUM('shared_stall','dedicated_charter') NOT NULL DEFAULT 'shared_stall',
  stall_unit_price DECIMAL(15,2) NULL DEFAULT NULL,
  transport_mode ENUM('road','air') NULL DEFAULT NULL,
  excused_delay BOOLEAN NOT NULL DEFAULT FALSE,
  excused_delay_reason TEXT NULL,
  excused_delay_confirmed_by INT NULL,
  excused_delay_confirmed_at DATETIME NULL,
  in_transit_compliance_alert BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_category VARCHAR(64) NULL,
  cancellation_reason TEXT NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME NULL,
  payment_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  sla_escalation_status VARCHAR(40) NULL,
  sla_fallback_option VARCHAR(40) NULL,
  sla_fallback_notes TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipment_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_shipment_requester FOREIGN KEY (requested_by) REFERENCES `user`(user_id),
  CONSTRAINT fk_shipment_approver FOREIGN KEY (approved_by) REFERENCES `user`(user_id),
  INDEX idx_shipment_status (status),
  INDEX idx_shipment_customer (customer_id)
) ENGINE=InnoDB;

CREATE TABLE shipment_booking_revision (
  revision_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  changed_by INT NOT NULL,
  previous_booking_type ENUM('shared_stall','dedicated_charter') NOT NULL,
  booking_type ENUM('shared_stall','dedicated_charter') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_booking_revision_shipment (shipment_id, created_at),
  CONSTRAINT fk_booking_revision_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_booking_revision_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE shipment_horse (
  shipment_horse_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  stall_number VARCHAR(20),
  declared_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  declared_currency CHAR(3) NOT NULL DEFAULT 'VND',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1,
  declared_value_vnd DECIMAL(15,2) NOT NULL DEFAULT 0,
  insurance_package VARCHAR(50) NOT NULL DEFAULT 'basic',
  insurance_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  max_compensation DECIMAL(15,2) NOT NULL DEFAULT 50000000,
  emergency_vet_covered BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_policy_version VARCHAR(30) NOT NULL DEFAULT 'equine-v1',

  notes VARCHAR(255),
  UNIQUE KEY uq_shipment_horse (shipment_id, horse_id),
  CONSTRAINT fk_sh_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sh_horse FOREIGN KEY (horse_id) REFERENCES horse(horse_id)
) ENGINE=InnoDB;

CREATE TABLE vehicle (
  vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_type ENUM('truck','aircraft_stall','container') NOT NULL,
  plate_or_code VARCHAR(50) NOT NULL UNIQUE,
  capacity INT NOT NULL,
  status ENUM('available','in_use','maintenance') NOT NULL DEFAULT 'available',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE shipment_vehicle (
  shipment_vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  assigned_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sv_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sv_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id)
) ENGINE=InnoDB;

CREATE TABLE route (
  route_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_name VARCHAR(150),
  total_distance_km DECIMAL(10,2),
  status ENUM('planned','active','completed','cancelled') NOT NULL DEFAULT 'planned',
  assigned_coordinator_id INT NULL,
  manager_vehicle_type VARCHAR(100) NULL,
  manager_airline_id INT NULL,
  manager_departure_airport_id INT NULL,
  manager_arrival_airport_id INT NULL,
  manager_main_corridor VARCHAR(255) NULL,
  strategic_notes TEXT NULL,
  rejection_reason VARCHAR(500) NULL,
  plan_status ENUM('draft','pending_approval','approved','confirmed','ready_to_depart','in_transit','completed','cancelled') NOT NULL DEFAULT 'draft',
  approved_by INT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id)
) ENGINE=InnoDB;

CREATE TABLE route_stop (
  route_stop_id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  leg_id INT NULL,
  sequence_no INT NOT NULL,
  stop_type ENUM('rest','quarantine','refuel','border_check','transfer_hub','other') NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  planned_arrival DATETIME,
  planned_departure DATETIME,
  status ENUM('pending','arrived','cleared','customs_cleared','departed') NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_stop_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  UNIQUE KEY uq_route_sequence (route_id, sequence_no)
) ENGINE=InnoDB;

CREATE TABLE shipment_assignment (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  user_id INT NOT NULL,
  role_in_shipment ENUM('transport_specialist','fleet_coordinator','driver','escort') NOT NULL,
  assigned_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at DATETIME NULL,
  confirmation_notes TEXT NULL,
  is_backup_pool BOOLEAN NOT NULL DEFAULT FALSE,
  sla_due_at DATETIME NULL,
  sla_reminder_sent_at DATETIME NULL,
  sla_escalated_at DATETIME NULL,
  CONSTRAINT fk_sa_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sa_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE route_stop_update (
  update_id INT AUTO_INCREMENT PRIMARY KEY,
  route_stop_id INT NOT NULL,
  updated_by INT NOT NULL,
  updated_by_role VARCHAR(50) NULL,
  actual_arrival DATETIME,
  actual_departure DATETIME,
  status ENUM('departed','arrived','customs_cleared','delivered') NOT NULL,
  notes TEXT,
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rsu_stop FOREIGN KEY (route_stop_id) REFERENCES route_stop(route_stop_id),
  CONSTRAINT fk_rsu_user FOREIGN KEY (updated_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE horse_condition_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_horse_id INT NOT NULL,
  recorded_by INT NOT NULL,
  condition_status ENUM('stable','not_eating','stressed','climate_change','other') NOT NULL,
  notes TEXT,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hcl_sh FOREIGN KEY (shipment_horse_id) REFERENCES shipment_horse(shipment_horse_id),
  CONSTRAINT fk_hcl_user FOREIGN KEY (recorded_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE incident_report (
  incident_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  reported_by INT NOT NULL,
  incident_type ENUM('vehicle_breakdown','traffic_delay','horse_medical','weather','border_issue','other') NOT NULL,
  description TEXT NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status ENUM('open','in_review','resolved','closed') NOT NULL DEFAULT 'open',
  location_text VARCHAR(255) NULL,
  immediate_actions TEXT NULL,
  resolution_notes TEXT NULL,
  resolved_by INT NULL,
  affected_border_gate VARCHAR(150) NULL,
  evidence_urls_json MEDIUMTEXT NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  CONSTRAINT fk_ir_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_ir_user FOREIGN KEY (reported_by) REFERENCES `user`(user_id),
  INDEX idx_incident_shipment (shipment_id)
) ENGINE=InnoDB;

CREATE TABLE attachment (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  related_type ENUM('shipment','horse_condition_log','incident_report','delivery_handover') NOT NULL,
  related_id INT NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type ENUM('image','document','video') NOT NULL DEFAULT 'document',
  uploaded_by INT NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES `user`(user_id),
  INDEX idx_attachment_related (related_type, related_id)
) ENGINE=InnoDB;

CREATE TABLE notification (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shipment_id INT,
  horse_id INT,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  notif_type ENUM('document_missing','status_update','incident','handover_complete','custom') NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_notif_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_notif_horse FOREIGN KEY (horse_id) REFERENCES horse(horse_id),
  INDEX idx_notification_user_read (user_id, is_read)
) ENGINE=InnoDB;

CREATE TABLE shipment_change_request (
  change_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  incident_id INT,
  requested_by INT NOT NULL,
  approved_by INT,
  change_type ENUM('route','cost','schedule','vehicle','other') NOT NULL,
  old_value VARCHAR(500),
  new_value VARCHAR(500),
  reason TEXT NOT NULL,
  estimated_extra_cost BIGINT NOT NULL DEFAULT 0,
  cost_allocation ENUM('none','operating_cost','emergency_vet_covered','customer_addendum') NOT NULL DEFAULT 'none',
  crosses_new_border BOOLEAN NOT NULL DEFAULT FALSE,
  decision_notes TEXT NULL,
  published_at DATETIME NULL,
  published_by INT NULL,
  ripple_notified_count INT NOT NULL DEFAULT 0,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  CONSTRAINT fk_scr_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_scr_incident FOREIGN KEY (incident_id) REFERENCES incident_report(incident_id),
  CONSTRAINT fk_scr_requester FOREIGN KEY (requested_by) REFERENCES `user`(user_id),
  CONSTRAINT fk_scr_approver FOREIGN KEY (approved_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE delivery_handover (
  handover_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  shipment_horse_id INT,
  handed_over_by INT NOT NULL,
  received_by_name VARCHAR(150) NOT NULL,
  handover_location VARCHAR(255) NULL,
  handover_datetime DATETIME NOT NULL,
  delivered_quantity INT NOT NULL DEFAULT 1,
  horse_condition_at_handover ENUM('healthy','minor_issue','needs_attention') NOT NULL DEFAULT 'healthy',
  identity_verified BOOLEAN NOT NULL DEFAULT TRUE,
  documents_handed_over BOOLEAN NOT NULL DEFAULT TRUE,
  customer_signature_url VARCHAR(500),
  evidence_urls_json MEDIUMTEXT NULL,
  notes TEXT,
  dispute_reason TEXT NULL,
  status ENUM('pending','confirmed','disputed') NOT NULL DEFAULT 'pending',
  confirmed_by INT NULL,
  confirmed_at DATETIME NULL,
  resolution_notes TEXT NULL,
  compensation_amount BIGINT NOT NULL DEFAULT 0,
  resolved_by INT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dh_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_dh_sh FOREIGN KEY (shipment_horse_id) REFERENCES shipment_horse(shipment_horse_id),
  CONSTRAINT fk_dh_driver FOREIGN KEY (handed_over_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

INSERT INTO `role` (role_name, description) VALUES
('Admin', 'System administrator'),
('Logistics Manager', 'Approves orders and manages transport plans'),
('Transport Specialist', 'Manages legal, quarantine, and customs documents'),
('Fleet & Route Coordinator', 'Manages fleet and routes'),
('Vehicle Driver / Escort', 'Executes assigned trips and records horse health'),
('Customer', 'Club or horse owner; self-registers with email and OTP');

-- Internal accounts are provisioned separately with bcrypt/argon2 hashes.
-- Do not insert plaintext passwords or CHANGE_ME_HASH into a shared environment.

SET FOREIGN_KEY_CHECKS = 1;


-- Official invoices are issued only after Flow 3 confirmation. Historical payments are preserved.
CREATE TABLE IF NOT EXISTS shipment_invoice (
  invoice_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_id INT NOT NULL,
  customer_id INT NOT NULL,
  invoice_type ENUM('primary','supplemental') NOT NULL DEFAULT 'primary',
  status ENUM('active','paid','void','overdue') NOT NULL DEFAULT 'active',
  parent_invoice_id INT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  snapshot JSON NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  payment_due_at DATETIME(3) NULL,
  grace_granted_at DATETIME(3) NULL,
  grace_due_at DATETIME(3) NULL,
  grace_count TINYINT NOT NULL DEFAULT 0,
  grace_granted_by INT NULL,
  payment_reminder_sent_at DATETIME(3) NULL,
  active_primary_route_id INT GENERATED ALWAYS AS (
    CASE WHEN invoice_type = 'primary' AND status <> 'void' THEN route_id ELSE NULL END
  ) STORED,
  INDEX idx_invoice_route (route_id),
  UNIQUE KEY uq_active_primary_invoice_route (active_primary_route_id),
  INDEX idx_invoice_shipment (shipment_id, issued_at),
  CONSTRAINT fk_invoice_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_invoice_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_insurance_revision (
  revision_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  changed_by INT NOT NULL,
  previous_snapshot JSON NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT 'customer_resubmission',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_insurance_revision_shipment (shipment_id, created_at),
  CONSTRAINT fk_insurance_revision_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_insurance_revision_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No historical shipment, quote or route leg is rewritten.
CREATE TABLE IF NOT EXISTS road_trip (
  road_trip_id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  booking_type ENUM('shared_stall','dedicated_charter') NOT NULL,
  origin_location VARCHAR(255) NOT NULL,
  destination_location VARCHAR(255) NOT NULL,
  planned_departure DATETIME NOT NULL,
  planned_arrival DATETIME NOT NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_road_trip_vehicle_time (vehicle_id, planned_departure, planned_arrival),
  CONSTRAINT fk_road_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id),
  CONSTRAINT fk_road_trip_actor FOREIGN KEY (created_by) REFERENCES `user`(user_id),
  CONSTRAINT chk_road_trip_interval CHECK (planned_arrival > planned_departure)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS airline (
  airline_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  cargo_service_name VARCHAR(150) NULL,
  contact_phone VARCHAR(50) NULL,
  contact_email VARCHAR(150) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS airport (
  airport_id INT AUTO_INCREMENT PRIMARY KEY,
  iata_code VARCHAR(10) NOT NULL UNIQUE,
  icao_code VARCHAR(10) NULL,
  name VARCHAR(150) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  has_quarantine_facility BOOLEAN NOT NULL DEFAULT TRUE,
  has_equine_cargo_ramp BOOLEAN NOT NULL DEFAULT TRUE,
  lat DECIMAL(10, 6) NULL,
  lng DECIMAL(10, 6) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS master_stop (
  stop_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  stop_type ENUM('rest', 'quarantine', 'refuel', 'border_check') NOT NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NOT NULL,
  has_veterinarian BOOLEAN NOT NULL DEFAULT FALSE,
  has_stalls BOOLEAN NOT NULL DEFAULT TRUE,
  lat DECIMAL(10, 6) NULL,
  lng DECIMAL(10, 6) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS route_leg (
  leg_id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  sequence_no INT NOT NULL,
  leg_type ENUM('road', 'flight') NOT NULL DEFAULT 'road',
  origin_location VARCHAR(255) NOT NULL,
  destination_location VARCHAR(255) NOT NULL,
  distance_km DECIMAL(10, 2) NULL,
  duration_hours DECIMAL(6, 2) NULL,
  planned_departure DATETIME NULL,
  planned_arrival DATETIME NULL,
  vehicle_id INT NULL,
  airline_id INT NULL,
  airline_name VARCHAR(150) NULL,
  flight_number VARCHAR(50) NULL,
  departure_airport_id INT NULL,
  departure_airport_code VARCHAR(10) NULL,
  arrival_airport_id INT NULL,
  arrival_airport_code VARCHAR(10) NULL,
  booking_reference VARCHAR(100) NULL,
  stalls_booked INT NOT NULL DEFAULT 0,
  status ENUM('pending', 'active', 'completed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  road_trip_id INT NULL,
  INDEX idx_route_leg_road_trip (road_trip_id),
  CONSTRAINT fk_leg_route FOREIGN KEY (route_id) REFERENCES route(route_id) ON DELETE CASCADE,
  CONSTRAINT fk_leg_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL,
  CONSTRAINT fk_leg_airline FOREIGN KEY (airline_id) REFERENCES airline(airline_id) ON DELETE SET NULL,
  CONSTRAINT fk_route_leg_road_trip FOREIGN KEY (road_trip_id) REFERENCES road_trip(road_trip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO airline (code, name, cargo_service_name, contact_phone, contact_email) VALUES
('SQ', 'Singapore Airlines Cargo', 'SQ Equine SkyCargo', '+65 6542 5588', 'cargo_equine@singaporeair.com.sg'),
('EK', 'Emirates SkyCargo', 'Emirates Equine Air Cargo', '+971 4 703 6666', 'skycargo.equine@emirates.com'),
('QR', 'Qatar Airways Cargo', 'Live Animal Cargo Support', '+974 4022 0000', 'liveanimals@qatarairways.com.qa'),
('CX', 'Cathay Pacific Cargo', 'Cathay Live Animal Transport', '+852 2747 1888', 'cargo_live@cathaypacific.com'),
('VN', 'Vietnam Airlines Cargo', 'Lotus Cargo Special Care', '+84 28 3844 6667', 'cargo.liveanimal@vietnamairlines.com');

INSERT IGNORE INTO airport (iata_code, icao_code, name, city, country, has_quarantine_facility, has_equine_cargo_ramp, lat, lng) VALUES
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

INSERT IGNORE INTO master_stop (name, stop_type, address, city, country, has_veterinarian, has_stalls, lat, lng) VALUES
('Trạm trung chuyển & Nghỉ dưỡng ngựa Củ Chi', 'rest', 'Đường Tỉnh Lộ 15, Huyện Củ Chi', 'TP. Hồ Chí Minh', 'Vietnam', TRUE, TRUE, 11.0267, 106.5167),
('Trạm kiểm dịch Cửa khẩu Quốc tế Mộc Bài', 'quarantine', 'Quốc lộ 22, Bến Cầu', 'Tây Ninh', 'Vietnam', TRUE, TRUE, 11.0667, 106.1833),
('Trạm dừng chân & Tiếp nhiên liệu Tiền Giang', 'rest', 'Cao tốc Trung Lương - Mỹ Thuận', 'Tiền Giang', 'Vietnam', FALSE, TRUE, 10.4167, 106.1667),
('Trạm kiểm dịch Thú y Vùng VI (Cảng SGN Cargo)', 'quarantine', 'Đường Trường Sơn, Phường 2, Tân Bình', 'TP. Hồ Chí Minh', 'Vietnam', TRUE, TRUE, 10.8150, 106.6600),
('Cửa khẩu Quốc tế Hữu Nghị', 'border_check', 'Thị trấn Đồng Đăng, Huyện Cao Lộc', 'Lạng Sơn', 'Vietnam', TRUE, TRUE, 21.9833, 106.7167),
('Tuas Checkpoint & Equine Holding Facility', 'border_check', 'Tuas South Way', 'Tuas', 'Singapore', TRUE, TRUE, 1.3436, 103.6364),
('Eastern Creek Quarantine Facility', 'quarantine', '60 Wallgrove Rd, Eastern Creek', 'Sydney', 'Australia', TRUE, TRUE, -33.8050, 150.8520);

CREATE TABLE IF NOT EXISTS shipment_sandbox_payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  customer_id INT NOT NULL,
  partner_code VARCHAR(50) NOT NULL,
  request_type VARCHAR(32) NOT NULL DEFAULT 'captureWallet',
  order_id VARCHAR(100) NOT NULL UNIQUE,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  order_info VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  status ENUM('creating','pending','succeeded','failed','unknown') NOT NULL DEFAULT 'creating',
  pay_url TEXT NULL,
  qr_content TEXT NULL,
  result_code INT NULL,
  result_message VARCHAR(1000) NULL,
  trans_id VARCHAR(30) NULL,
  last_checked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sandbox_payment_shipment (shipment_id, payment_id),
  CONSTRAINT fk_sandbox_payment_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sandbox_payment_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_sandbox_payment_event (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  event_key VARCHAR(100) NOT NULL,
  source ENUM('create','query','ipn') NOT NULL,
  new_status ENUM('creating','pending','succeeded','failed','unknown') NOT NULL,
  result_code INT NULL,
  result_message VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sandbox_payment_event (payment_id, event_key),
  CONSTRAINT fk_sandbox_payment_event FOREIGN KEY (payment_id) REFERENCES shipment_sandbox_payment(payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_sepay_payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  invoice_id INT NULL,
  customer_id INT NOT NULL,
  payment_code VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  bank_code VARCHAR(30) NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  status ENUM('pending','review','succeeded','cancelled') NOT NULL DEFAULT 'pending',
  transaction_id BIGINT UNSIGNED NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  active_shipment_invoice_key VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN status <> 'cancelled' THEN CONCAT(shipment_id, ':', COALESCE(invoice_id, 0)) ELSE NULL END
  ) STORED,
  INDEX idx_sepay_shipment (shipment_id),
  UNIQUE KEY uq_sepay_active_shipment_invoice (active_shipment_invoice_key),
  UNIQUE KEY uq_sepay_code (payment_code),
  UNIQUE KEY uq_sepay_paid_transaction (transaction_id),
  CONSTRAINT fk_sepay_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sepay_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sepay_webhook_receipt (
  transaction_id BIGINT UNSIGNED PRIMARY KEY,
  payment_id INT NULL,
  identity_hash CHAR(64) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  payload JSON NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sepay_receipt_payment (payment_id, received_at),
  CONSTRAINT fk_sepay_receipt_payment FOREIGN KEY (payment_id) REFERENCES shipment_sepay_payment(payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS route_schedule_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  route_stop_id INT NOT NULL,
  old_planned_arrival DATETIME NULL,
  new_planned_arrival DATETIME NULL,
  old_planned_departure DATETIME NULL,
  new_planned_departure DATETIME NULL,
  reason TEXT NOT NULL,
  changed_by INT NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rsh_stop (route_stop_id),
  CONSTRAINT fk_rsh_stop FOREIGN KEY (route_stop_id) REFERENCES route_stop(route_stop_id),
  CONSTRAINT fk_rsh_user FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_operating_cost (
  cost_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_leg_id INT NULL,
  cost_category ENUM(
    'fuel',
    'toll_border',
    'airline_freight',
    'quarantine_fee',
    'staff_allowance',
    'incident_absorbed',
    'disbursement_absorbed_on_company_fault'
  ) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  receipt_url VARCHAR(500) NULL,
  notes TEXT NULL,
  recorded_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_soc_shipment (shipment_id),
  INDEX idx_soc_category (cost_category),
  CONSTRAINT fk_soc_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_soc_recorded_by FOREIGN KEY (recorded_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_disbursement (
  disbursement_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  authority_name VARCHAR(150) NOT NULL,
  fee_type VARCHAR(80) NOT NULL,
  amount BIGINT NOT NULL,
  authority_receipt_url VARCHAR(500) NULL,
  notes TEXT NULL,
  settled_status ENUM('advanced','reimbursed','deducted_from_refund','absorbed_company_fault') NOT NULL DEFAULT 'advanced',
  recorded_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sd_shipment (shipment_id),
  CONSTRAINT fk_sd_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sd_recorded_by FOREIGN KEY (recorded_by) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_refund_record (
  refund_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  customer_id INT NOT NULL,
  cancellation_category VARCHAR(64) NOT NULL,
  refund_mode ENUM('cash_refund','credit_30d') NOT NULL DEFAULT 'cash_refund',
  freight_refund_amount BIGINT NOT NULL DEFAULT 0,
  insurance_refund_amount BIGINT NOT NULL DEFAULT 0,
  non_refundable_air_deduction BIGINT NOT NULL DEFAULT 0,
  disbursement_deduction BIGINT NOT NULL DEFAULT 0,
  amount BIGINT NOT NULL DEFAULT 0,
  receivable_excess_amount BIGINT NOT NULL DEFAULT 0,
  status ENUM(
    'pending_approval',
    'pending_second_approval',
    'approved_for_transfer',
    'transferred',
    'converted_to_credit',
    'rejected'
  ) NOT NULL DEFAULT 'pending_approval',
  requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,
  requested_by INT NOT NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL,
  second_approved_by INT NULL,
  second_approved_at DATETIME NULL,
  transferred_by INT NULL,
  transferred_at DATETIME NULL,
  recipient_bank_account VARCHAR(100) NULL,
  bank_transaction_ref VARCHAR(150) NULL,
  transfer_receipt_url VARCHAR(500) NULL,
  credit_expires_at DATETIME NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_srr_shipment (shipment_id),
  INDEX idx_srr_status (status),
  CONSTRAINT fk_srr_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_srr_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_srr_requested_by FOREIGN KEY (requested_by) REFERENCES `user`(user_id),
  CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equine_vital_config (
  config_id INT AUTO_INCREMENT PRIMARY KEY,
  config_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  temp_green_min DECIMAL(4,2) NOT NULL DEFAULT 37.50,
  temp_green_max DECIMAL(4,2) NOT NULL DEFAULT 38.50,
  temp_amber_low_min DECIMAL(4,2) NOT NULL DEFAULT 37.00,
  temp_amber_high_max DECIMAL(4,2) NOT NULL DEFAULT 39.30,
  hr_green_min INT NOT NULL DEFAULT 28,
  hr_green_max INT NOT NULL DEFAULT 44,
  hr_amber_low_min INT NOT NULL DEFAULT 24,
  hr_amber_high_max INT NOT NULL DEFAULT 60,
  consecutive_alert_window_hours INT NOT NULL DEFAULT 6,
  escalatable_conditions JSON NOT NULL,
  observational_conditions JSON NOT NULL,
  calibrated_by VARCHAR(150) NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trip_status_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_id INT NOT NULL,
  leg_id INT NULL,
  route_stop_id INT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  milestone_type VARCHAR(50) NOT NULL,
  milestone_name VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  updated_by INT NOT NULL,
  updated_by_role VARCHAR(50) NOT NULL,
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tsl_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS horse_health_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NULL,
  horse_name VARCHAR(150) NOT NULL,
  leg_name VARCHAR(255) NULL,
  recorded_by INT NOT NULL,
  recorded_by_role VARCHAR(50) NULL,
  condition_status ENUM('stable','not_eating','stressed','climate_change','other') NOT NULL DEFAULT 'stable',
  temperature_c DECIMAL(5,2) NULL,
  heart_rate_bpm INT NULL,
  alert_tier ENUM('green','amber_observational','amber_escalatable','red') NOT NULL DEFAULT 'green',
  alert_reason VARCHAR(500) NULL,
  notes TEXT NULL,
  attachments_json MEDIUMTEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hhl_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
