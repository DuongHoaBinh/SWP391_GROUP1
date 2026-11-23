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

-- Seed Package Configs for equine-v2
INSERT IGNORE INTO insurance_package_config 
(policy_version, package_code, fee_bps, minimum_fee_vnd, emergency_vet_cap_vnd, emergency_vet_covered, display_name_vi, display_name_en)
VALUES
('equine-v2', 'basic', 0, 0, NULL, FALSE, 'Cơ bản', 'Basic'),
('equine-v2', 'standard', 150, 1000000, 20000000, TRUE, 'Tiêu chuẩn', 'Standard'),
('equine-v2', 'premium', 300, 2000000, NULL, TRUE, 'Toàn diện', 'Premium');

-- Seed Payout Rules for equine-v2 (Table C4.2)
INSERT IGNORE INTO insurance_payout_rule 
(policy_version, package_code, severity, payout_type, percent_bps, cap_vnd)
VALUES
-- Basic package
('equine-v2', 'basic', 'M1', 'vet_cost_capped', NULL, 5000000),
('equine-v2', 'basic', 'M2', 'vet_cost_capped', NULL, 10000000),
('equine-v2', 'basic', 'M3', 'percent_of_value', 2000, 50000000),
('equine-v2', 'basic', 'M4', 'percent_of_value', 10000, 50000000),
-- Standard package
('equine-v2', 'standard', 'M1', 'vet_cost_capped', 100, NULL),
('equine-v2', 'standard', 'M2', 'percent_of_value', 1500, NULL),
('equine-v2', 'standard', 'M3', 'percent_of_value', 5000, NULL),
('equine-v2', 'standard', 'M4', 'percent_of_value', 8000, NULL),
-- Premium package
('equine-v2', 'premium', 'M1', 'vet_cost_capped', 200, NULL),
('equine-v2', 'premium', 'M2', 'percent_of_value', 3000, NULL),
('equine-v2', 'premium', 'M3', 'percent_of_value', 8000, NULL),
('equine-v2', 'premium', 'M4', 'percent_of_value', 10000, NULL);
