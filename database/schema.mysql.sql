-- ============================================================================
-- Cross-Border Racehorse Transport System
-- MySQL 8.0+ / InnoDB / utf8mb4
--
-- This is the reviewed MySQL version of the supplied horse_transport_schema.sql.
-- The backend currently does not connect to this database; auth uses in-memory
-- storage for local API testing. Run this script only when MySQL is available.
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
  status ENUM('active','in_transit','retired','deceased') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_horse_owner FOREIGN KEY (owner_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE regulation (
  regulation_id INT AUTO_INCREMENT PRIMARY KEY,
  country VARCHAR(100) NOT NULL,
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
  requested_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  departure_date DATETIME,
  expected_arrival_date DATETIME,
  actual_arrival_date DATETIME,
  special_requirements TEXT,
  rejection_reason VARCHAR(500),
  status ENUM('requested','approved','rejected','planning','in_transit','completed','cancelled') NOT NULL DEFAULT 'requested',
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipment_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_shipment_requester FOREIGN KEY (requested_by) REFERENCES `user`(user_id),
  CONSTRAINT fk_shipment_approver FOREIGN KEY (approved_by) REFERENCES `user`(user_id),
  INDEX idx_shipment_status (status),
  INDEX idx_shipment_customer (customer_id)
) ENGINE=InnoDB;

CREATE TABLE shipment_horse (
  shipment_horse_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NOT NULL,
  stall_number VARCHAR(20),
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id)
) ENGINE=InnoDB;

CREATE TABLE route_stop (
  route_stop_id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  sequence_no INT NOT NULL,
  stop_type ENUM('rest','quarantine','refuel','border_check','other') NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  planned_arrival DATETIME,
  planned_departure DATETIME,
  status ENUM('pending','arrived','cleared','departed') NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_stop_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  UNIQUE KEY uq_route_sequence (route_id, sequence_no)
) ENGINE=InnoDB;

CREATE TABLE shipment_assignment (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  user_id INT NOT NULL,
  role_in_shipment ENUM('transport_specialist','fleet_coordinator','driver','escort') NOT NULL,
  assigned_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sa_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE route_stop_update (
  update_id INT AUTO_INCREMENT PRIMARY KEY,
  route_stop_id INT NOT NULL,
  updated_by INT NOT NULL,
  actual_arrival DATETIME,
  actual_departure DATETIME,
  status ENUM('departed','arrived','customs_cleared','delivered') NOT NULL,
  notes TEXT,
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
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  CONSTRAINT fk_ir_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_ir_user FOREIGN KEY (reported_by) REFERENCES `user`(user_id),
  INDEX idx_incident_shipment (shipment_id)
) ENGINE=InnoDB;

CREATE TABLE attachment (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  related_type ENUM('shipment','horse_condition_log','incident_report') NOT NULL,
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
  handover_datetime DATETIME NOT NULL,
  horse_condition_at_handover ENUM('healthy','minor_issue','needs_attention') NOT NULL DEFAULT 'healthy',
  customer_signature_url VARCHAR(500),
  notes TEXT,
  status ENUM('pending','confirmed','disputed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
