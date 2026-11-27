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
  -- gender: male (Đực), female (Cái), gelding (Thiến), other (Khác)
  gender ENUM('male','female','gelding','other') NULL DEFAULT NULL,
  date_of_birth DATE,
  age INT,
  microchip_no VARCHAR(50) UNIQUE,
  passport_no VARCHAR(50) UNIQUE,
  photo_url VARCHAR(500) NULL,
  color VARCHAR(100),
  weight VARCHAR(100),
  medical_status VARCHAR(255),
  special_requirements TEXT,
  requires_private_stall BOOLEAN NOT NULL DEFAULT FALSE,
  temperament ENUM('calm','normal','difficult') NOT NULL DEFAULT 'normal',
  status ENUM('active','in_transit','retired','deceased') NOT NULL DEFAULT 'active',
  quantity INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_horse_owner FOREIGN KEY (owner_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE regulation (
  regulation_id INT AUTO_INCREMENT PRIMARY KEY,
  country VARCHAR(100) NOT NULL,
  border_gate VARCHAR(100) NULL,
  transport_mode ENUM('road','air','sea','both') NOT NULL DEFAULT 'both',
  doc_tier ENUM('A','B') NOT NULL DEFAULT 'A',
  lead_time_days INT NOT NULL DEFAULT 2,
  max_issue_age_days INT NULL,
  requires_authority_approval BOOLEAN NOT NULL DEFAULT FALSE,
  min_validity_buffer_hours INT NOT NULL DEFAULT 24,
  document_type VARCHAR(100) NOT NULL,
  document_type_code VARCHAR(50) NULL,
  description TEXT,
  effective_date DATE,
  legal_reference VARCHAR(255) NULL,
  is_demo_data BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reg_document_type FOREIGN KEY (document_type_code) REFERENCES document_type(code)
) ENGINE=InnoDB;

CREATE TABLE document_type (
  code VARCHAR(50) PRIMARY KEY,
  name_vi VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  default_validity_days INT NULL,
  is_identity BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO document_type (code, name_vi, name_en, default_validity_days, is_identity, sort_order) VALUES
  ('horse_passport', 'Hộ chiếu ngựa', 'Horse passport', NULL, TRUE, 10),
  ('microchip_certificate', 'Giấy chứng nhận vi mạch', 'Microchip certificate', NULL, TRUE, 20),
  ('ownership_certificate', 'Giấy chứng nhận quyền sở hữu', 'Ownership certificate', NULL, TRUE, 30),
  ('vaccination_influenza', 'Tiêm phòng cúm ngựa', 'Equine influenza vaccination', 180, FALSE, 40),
  ('vaccination_certificate', 'Sổ tiêm phòng tổng hợp', 'Vaccination record', 365, FALSE, 45),
  ('vaccination_tetanus', 'Tiêm phòng uốn ván', 'Tetanus vaccination', 365, FALSE, 50),
  ('eia_coggins_test', 'Xét nghiệm EIA (Coggins)', 'EIA (Coggins) test', 180, FALSE, 60),
  ('health_certificate', 'Giấy chứng nhận sức khỏe', 'Health certificate', 10, FALSE, 70),
  ('export_quarantine_certificate', 'Giấy chứng nhận kiểm dịch xuất khẩu', 'Export quarantine certificate', 10, FALSE, 80),
  ('quarantine_certificate', 'Giấy chứng nhận kiểm dịch', 'Quarantine certificate', 10, FALSE, 85),
  ('import_permit', 'Giấy phép nhập khẩu', 'Import permit', 30, FALSE, 90),
  ('customs_declaration', 'Tờ khai hải quan', 'Customs declaration', 30, FALSE, 95);

CREATE TABLE transport_document (
  document_id INT AUTO_INCREMENT PRIMARY KEY,
  horse_id INT NOT NULL,
  regulation_id INT NULL,
  document_type_code VARCHAR(50) NULL,
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
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_horse FOREIGN KEY (horse_id) REFERENCES horse(horse_id),
  CONSTRAINT fk_doc_regulation FOREIGN KEY (regulation_id) REFERENCES regulation(regulation_id),
  CONSTRAINT fk_doc_document_type FOREIGN KEY (document_type_code) REFERENCES document_type(code),
  CONSTRAINT fk_doc_uploader FOREIGN KEY (uploaded_by) REFERENCES `user`(user_id),
  CONSTRAINT fk_doc_reviewer FOREIGN KEY (reviewed_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB;

CREATE TABLE document_review_log (
  review_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  reviewer_id INT NULL,
  reason TEXT NULL,
  checked_fields_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_drl_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id) ON DELETE CASCADE,
  CONSTRAINT fk_drl_reviewer FOREIGN KEY (reviewer_id) REFERENCES `user`(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE document_expiry_notice (
  notice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  days_before INT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_notice (document_id, days_before),
  CONSTRAINT fk_den_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shipment_doc_deadline_notice (
  notice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  horse_id INT NOT NULL,
  document_type_code VARCHAR(80) NOT NULL,
  threshold_hours INT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ship_doc_deadline_notice (shipment_id, horse_id, document_type_code, threshold_hours),
  CONSTRAINT fk_sddn_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  status ENUM('requested','under_review','change_requested','approved','rejected','planning','confirmed','ready_to_depart','in_transit','return_pending','completed','delivered','cancelled','cancelled_operational','awaiting_payment','paid_pending_review','refund_requested','refunded') NOT NULL DEFAULT 'requested',
  payment_flow ENUM('postpaid_legacy','prepaid') NOT NULL DEFAULT 'postpaid_legacy',
  payment_due_at DATETIME NULL,
  cancel_reason_code VARCHAR(50) NULL,
  feasibility_decided_by INT NULL,
  feasibility_decided_at DATETIME NULL,
  feasibility_reason_code VARCHAR(50) NULL,
  feasibility_note TEXT NULL,
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  transport_cost DECIMAL(15,2) NULL DEFAULT NULL,
  insurance_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- shared_stall: chỉ còn ở đơn cũ (bỏ gom chuyến sau review 11/2026)
  booking_type ENUM('shared_stall','dedicated_charter') NOT NULL DEFAULT 'dedicated_charter',
  stall_unit_price DECIMAL(15,2) NULL DEFAULT NULL,
  quote_id INT NULL,
  pricing_snapshot JSON NULL,
  deferred_documents_json JSON NULL,
  distance_km DECIMAL(10,2) NULL,
  distance_source ENUM('ors','osrm','air','table','estimated') NULL,
  origin_lat DECIMAL(10,6) NULL,
  origin_lng DECIMAL(10,6) NULL,
  destination_lat DECIMAL(10,6) NULL,
  destination_lng DECIMAL(10,6) NULL,
  transport_mode ENUM('road','air','sea') NULL DEFAULT NULL,
  sea_mode ENUM('ferry','vessel') NULL DEFAULT NULL,
  trip_type ENUM('one_way','round_trip') NOT NULL DEFAULT 'one_way',
  return_departure_at DATETIME NULL,
  return_wait_minutes INT NOT NULL DEFAULT 120,
  return_status ENUM('not_applicable','scheduled','in_progress','cancelled','no_show','completed') NOT NULL DEFAULT 'not_applicable',
  return_no_show BOOLEAN NOT NULL DEFAULT FALSE,
  return_freight BIGINT NOT NULL DEFAULT 0,
  return_insurance_fee BIGINT NOT NULL DEFAULT 0,
  return_policy_snapshot JSON NULL,
  return_policy_accepted_at DATETIME NULL,
  return_cancelled_at DATETIME NULL,
  return_cancel_reason VARCHAR(255) NULL,
  return_reschedule_fee BIGINT NOT NULL DEFAULT 0,
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
  -- Step 9: phương án xe khách chọn, giờ đón đã chốt (sau khi dời giờ cấm), phụ phí đêm
  allocation_option_code VARCHAR(30) NULL,
  allocation_snapshot JSON NULL,
  pickup_at DATETIME NULL,
  night_surcharge_applied BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Trạm xe (Step 3, review 11/2026). Dữ liệu demo.
CREATE TABLE depot (
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
) ENGINE=InnoDB;

-- Dữ liệu demo: tọa độ trung tâm khu vực, cần thay bằng địa chỉ thật của doanh nghiệp.
INSERT INTO depot (code, name, country, city, address, lat, lng, type) VALUES
  ('VN-HCM-TD', 'Trạm Thủ Đức', 'Vietnam', 'Hồ Chí Minh', 'Xa lộ Hà Nội, TP. Thủ Đức, TP.HCM', 10.8494000, 106.7537000, 'own'),
  ('VN-HN-LB', 'Trạm Long Biên', 'Vietnam', 'Hà Nội', 'Quận Long Biên, Hà Nội', 21.0486000, 105.8880000, 'own'),
  ('VN-DN', 'Trạm Đà Nẵng', 'Vietnam', 'Đà Nẵng', 'Quận Liên Chiểu, Đà Nẵng', 16.0718000, 108.1508000, 'own'),
  ('VN-CT', 'Trạm Cần Thơ', 'Vietnam', 'Cần Thơ', 'Quận Cái Răng, Cần Thơ', 10.0003000, 105.7637000, 'own'),
  ('KH-PNH', 'Đối tác Phnom Penh', 'Cambodia', 'Phnom Penh', 'Phnom Penh, Cambodia', 11.5564000, 104.9282000, 'partner'),
  ('TH-BKK', 'Đối tác Bangkok', 'Thailand', 'Bangkok', 'Bangkok, Thailand', 13.7563000, 100.5018000, 'partner'),
  ('SG-SIN', 'Đối tác Singapore', 'Singapore', 'Singapore', 'Singapore', 1.3521000, 103.8198000, 'partner');

-- Loại phương tiện và sức chứa (số ngựa). horse_capacity NULL = theo xe chở trên phà.
CREATE TABLE vehicle_class (
  code VARCHAR(30) PRIMARY KEY,
  mode ENUM('road','air','sea') NOT NULL,
  name_vi VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  horse_capacity INT NULL,
  price_coefficient DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  is_heavy_truck BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO vehicle_class (code, mode, name_vi, name_en, horse_capacity, price_coefficient, is_heavy_truck, sort_order) VALUES
  ('truck_1', 'road', 'Xe chở ngựa 1 chỗ', '1-horse transporter', 1, 1.00, FALSE, 10),
  ('truck_2', 'road', 'Xe chở ngựa 2 chỗ (≈7,5 tấn)', '2-horse lorry (~7.5 t)', 2, 1.00, FALSE, 20),
  ('truck_4', 'road', 'Xe tải ngựa 4 chỗ (≈18 tấn)', '4-horse lorry (~18 t)', 4, 1.30, TRUE, 30),
  ('truck_6', 'road', 'Xe tải ngựa 6 chỗ (≈26 tấn)', '6-horse lorry (~26 t)', 6, 1.60, TRUE, 40),
  ('jet_stall', 'air', 'Chuồng bay (jet stall)', 'Jet stall', 3, 1.00, FALSE, 50),
  ('ferry_slot', 'sea', 'Chỗ xe trên phà RoRo', 'RoRo ferry slot', NULL, 1.00, FALSE, 60),
  ('vessel_pen', 'sea', 'Ô chuồng trên tàu', 'Vessel pen', 1, 1.00, FALSE, 70);

CREATE TABLE vehicle (
  vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_type ENUM('truck','aircraft_stall','container') NOT NULL,
  vehicle_class_code VARCHAR(30) NULL,
  plate_or_code VARCHAR(50) NOT NULL UNIQUE,
  depot_id INT NULL,
  -- capacity: lấy theo vehicle_class.horse_capacity khi tạo xe; giữ cột để tương thích
  capacity INT NOT NULL,
  status ENUM('available','in_use','maintenance') NOT NULL DEFAULT 'available',
  current_location VARCHAR(255) NULL DEFAULT 'Fleet Operations Depot',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_class FOREIGN KEY (vehicle_class_code) REFERENCES vehicle_class(code),
  CONSTRAINT fk_vehicle_depot FOREIGN KEY (depot_id) REFERENCES depot(depot_id)
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
  direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound',
  lat DECIMAL(10,6) NULL,
  lng DECIMAL(10,6) NULL,
  geofence_radius_m INT NULL,
  location_ref_type ENUM('master_stop','airport','seaport','depot','address','manual') NULL,
  location_ref_id INT NULL,
  actual_arrival DATETIME NULL,
  actual_departure DATETIME NULL,
  updated_by INT NULL,
  notes TEXT NULL,
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
  lat DECIMAL(10,6) NULL,
  lng DECIMAL(10,6) NULL,
  accuracy_m DECIMAL(8,2) NULL,
  location_source ENUM('gps','simulated','manual','override') NULL,
  distance_to_stop_m INT NULL,
  geofence_passed BOOLEAN NULL,
  manual_reason VARCHAR(500) NULL,
  evidence_url VARCHAR(500) NULL,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
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
('Logistics Manager', 'Operations Manager: approves orders, reviews compliance documents, plans routes and dispatches the fleet'),
-- Hai role dưới đây đã gộp vào Logistics Manager (review 11/2026); giữ lại để không lệch role_id của dữ liệu cũ.
('Transport Specialist', 'Deprecated (review 11/2026): merged into Logistics Manager'),
('Fleet & Route Coordinator', 'Deprecated (review 11/2026): merged into Logistics Manager'),
('Vehicle Driver / Escort', 'Executes assigned trips and records horse health'),
('Customer', 'Club or horse owner; self-registers with email and OTP');

-- Internal accounts are provisioned separately with bcrypt/argon2 hashes.
-- Do not insert plaintext passwords or CHANGE_ME_HASH into a shared environment.

SET FOREIGN_KEY_CHECKS = 1;


-- Official invoices are issued only after Flow 3 confirmation. Historical payments are preserved.
CREATE TABLE IF NOT EXISTS shipment_invoice (
  invoice_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_id INT NULL,
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
  active_primary_shipment_key INT GENERATED ALWAYS AS (
    CASE WHEN invoice_type = 'primary' AND status <> 'void' AND route_id IS NULL THEN shipment_id ELSE NULL END
  ) STORED,
  INDEX idx_invoice_route (route_id),
  UNIQUE KEY uq_active_primary_invoice_route (active_primary_route_id),
  UNIQUE KEY uq_active_primary_invoice_shipment (active_primary_shipment_key),
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
  country_code CHAR(2) NULL,
  has_quarantine_facility BOOLEAN NOT NULL DEFAULT TRUE,
  has_equine_cargo_ramp BOOLEAN NOT NULL DEFAULT TRUE,
  air_role ENUM('hub','gateway','regional') NOT NULL DEFAULT 'gateway',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  lat DECIMAL(10, 6) NULL,
  lng DECIMAL(10, 6) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS master_stop (
  stop_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NULL,
  name VARCHAR(150) NOT NULL,
  stop_type ENUM('rest', 'quarantine', 'refuel', 'border_check') NOT NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NOT NULL,
  country_code CHAR(2) NULL,
  has_veterinarian BOOLEAN NOT NULL DEFAULT FALSE,
  has_stalls BOOLEAN NOT NULL DEFAULT TRUE,
  is_expressway BOOLEAN NOT NULL DEFAULT FALSE,
  lat DECIMAL(10, 6) NULL,
  lng DECIMAL(10, 6) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_master_stop_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS route_leg (
  leg_id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  sequence_no INT NOT NULL,
  leg_type ENUM('road', 'flight', 'sea') NOT NULL DEFAULT 'road',
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
  direction ENUM('outbound', 'return') NOT NULL DEFAULT 'outbound',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  road_trip_id INT NULL,
  jet_stall_count INT NULL,
  allocation_override_reason VARCHAR(255) NULL,
  origin_lat DECIMAL(10,6) NULL,
  origin_lng DECIMAL(10,6) NULL,
  destination_lat DECIMAL(10,6) NULL,
  destination_lng DECIMAL(10,6) NULL,
  route_polyline MEDIUMTEXT NULL,
  actual_departure DATETIME NULL,
  actual_arrival DATETIME NULL,
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
  recipient_bank_name VARCHAR(150) NULL,
  recipient_account_holder VARCHAR(150) NULL,
  customer_note TEXT NULL,
  form_submitted_at DATETIME NULL,
  sla_due_at DATETIME NULL,
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
  lat DECIMAL(10,6) NULL,
  lng DECIMAL(10,6) NULL,
  accuracy_m DECIMAL(8,2) NULL,
  location_source ENUM('gps','simulated','manual','override') NULL,
  distance_to_stop_m INT NULL,
  geofence_passed BOOLEAN NULL,
  manual_reason VARCHAR(500) NULL,
  evidence_url VARCHAR(500) NULL,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
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
  respiratory_rate_bpm INT NULL,
  route_stop_id INT NULL,
  lat DECIMAL(10,6) NULL,
  lng DECIMAL(10,6) NULL,
  location_source ENUM('gps','simulated','manual') NULL,
  alert_tier ENUM('green','amber_observational','amber_escalatable','red') NOT NULL DEFAULT 'green',
  alert_reason VARCHAR(500) NULL,
  notes TEXT NULL,
  attachments_json MEDIUMTEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hhl_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vehicle_position_ping (
  ping_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  leg_id INT NULL,
  vehicle_id INT NULL,
  reported_by INT NOT NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  accuracy_m DECIMAL(8,2) NULL,
  speed_kmh DECIMAL(6,2) NULL,
  heading_deg DECIMAL(5,2) NULL,
  source ENUM('gps','simulated') NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_ping_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ping_shipment_time (shipment_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- STEP 4: CẢNG BIỂN, TUYẾN BIỂN, BẢNG GIÁ, BÁO GIÁ (Review 11/2026)
-- ============================================================

CREATE TABLE IF NOT EXISTS seaport (
  port_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NULL,
  country VARCHAR(100) NOT NULL,
  country_code CHAR(2) NULL,
  city VARCHAR(100) NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  is_international BOOLEAN NOT NULL DEFAULT TRUE,
  supports_ferry BOOLEAN NOT NULL DEFAULT FALSE,
  supports_vessel BOOLEAN NOT NULL DEFAULT TRUE,
  has_quarantine BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS sea_route (
  sea_route_id INT AUTO_INCREMENT PRIMARY KEY,
  from_port_id INT NOT NULL,
  to_port_id INT NOT NULL,
  sea_mode ENUM('ferry','vessel') NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  typical_hours DECIMAL(6,2) NOT NULL,
  via_points JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_sea_route (from_port_id, to_port_id, sea_mode),
  CONSTRAINT fk_sea_route_from FOREIGN KEY (from_port_id) REFERENCES seaport(port_id),
  CONSTRAINT fk_sea_route_to FOREIGN KEY (to_port_id) REFERENCES seaport(port_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS shipment_quote (
  quote_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  transport_mode ENUM('road','air','sea') NOT NULL,
  sea_mode ENUM('ferry','vessel') NULL,
  trip_type ENUM('one_way','round_trip') NOT NULL DEFAULT 'one_way',
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
  CONSTRAINT fk_quote_shipment FOREIGN KEY (used_by_shipment_id) REFERENCES shipment(shipment_id) ON DELETE SET NULL,
  INDEX idx_quote_customer (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_return_change (
  change_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  old_return_departure_at DATETIME NOT NULL,
  new_return_departure_at DATETIME NOT NULL,
  reschedule_fee BIGINT NOT NULL DEFAULT 0,
  requested_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_return_change_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE shipment ADD CONSTRAINT fk_shipment_quote FOREIGN KEY (quote_id) REFERENCES shipment_quote(quote_id) ON DELETE SET NULL;


-- Migration 033: Insurance Policy v2, Payout Rules, Package Config and Claims Workflow

CREATE TABLE IF NOT EXISTS insurance_package_config (
  config_id INT AUTO_INCREMENT PRIMARY KEY,
  policy_version VARCHAR(20) NOT NULL,
  package_code ENUM('basic','standard','premium') NOT NULL,
  fee_bps INT NOT NULL DEFAULT 0,
  minimum_fee_vnd BIGINT NOT NULL DEFAULT 0,
  emergency_vet_cap_vnd BIGINT NULL,
  emergency_vet_covered BOOLEAN NOT NULL DEFAULT FALSE,
  display_name_vi VARCHAR(100) NOT NULL,
  display_name_en VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_package_config (policy_version, package_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insurance_payout_rule (
  rule_id INT AUTO_INCREMENT PRIMARY KEY,
  policy_version VARCHAR(20) NOT NULL,
  package_code ENUM('basic','standard','premium') NOT NULL,
  severity ENUM('M1','M2','M3','M4') NOT NULL,
  payout_type ENUM('percent_of_value','vet_cost_capped') NOT NULL,
  percent_bps INT NULL,
  cap_vnd BIGINT NULL,
  UNIQUE KEY uq_payout_rule (policy_version, package_code, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insurance_claim (
  claim_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  shipment_horse_id INT NOT NULL,
  customer_id INT NOT NULL,
  severity ENUM('M1','M2','M3','M4') NOT NULL,
  description TEXT NOT NULL,
  vet_cost_vnd BIGINT NULL,
  evidence_json JSON NULL,
  vet_report_document_id INT NULL,
  requested_amount BIGINT NOT NULL,
  suggested_amount BIGINT NOT NULL,
  approved_amount BIGINT NULL,
  policy_version VARCHAR(20) NOT NULL,
  package_code ENUM('basic','standard','premium') NOT NULL,
  declared_value_vnd BIGINT NOT NULL,
  status ENUM('submitted','under_review','approved','rejected','paid') NOT NULL DEFAULT 'submitted',
  rejection_reason_code VARCHAR(50) NULL,
  decision_reason TEXT NULL,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  refund_record_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim_horse_status (shipment_horse_id, status),
  INDEX idx_claim_shipment (shipment_id),
  CONSTRAINT fk_claim_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_claim_horse FOREIGN KEY (shipment_horse_id) REFERENCES shipment_horse(shipment_horse_id),
  CONSTRAINT fk_claim_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_claim_doc FOREIGN KEY (vet_report_document_id) REFERENCES transport_document(document_id),
  CONSTRAINT fk_claim_refund FOREIGN KEY (refund_record_id) REFERENCES shipment_refund_record(refund_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insurance_claim_event (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor_id INT NOT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_claim_event_claim FOREIGN KEY (claim_id) REFERENCES insurance_claim(claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_status_history (
  history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(40) NOT NULL,
  reason_code VARCHAR(50) NULL,
  note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ssh_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ssh_shipment (shipment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- STEP 9: GIỮ CHỖ XE, GIỜ CẤM XE TẢI NỘI ĐÔ, CẤU HÌNH HỆ THỐNG, BẢNG GIÁ ĐỐI TÁC (migration 036)
-- Dữ liệu giờ cấm và bảng giá đối tác là dữ liệu demo, cần đối chiếu văn bản gốc.
-- ============================================================
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
  ('journey.rules', '{"maxDriveHoursBeforeRest": 8, "restMinutes": 60, "maxJourneyHours": 24, "mandatoryRestHours": 24, "nightWindow": {"from": "22:00", "to": "06:00"}}'),
  ('tracking.geofence', '{"defaultRadiusM": 300, "largeSiteRadiusM": 1000, "maxAccuracyM": 200}'),
  ('tracking.simulation_enabled', 'false'),
  ('tracking.customer_vitals_detail', 'true');

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
