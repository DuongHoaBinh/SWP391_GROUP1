-- Migration 025: Wave 1 Gap G1 (Reporting, OTD, Operating Costs) & Gap G2 (Multi-dimensional Regulations, 2-Tier Compliance, Runtime Expiry)
-- Safe for direct inspection; programmatic runner database/apply-wave1-migration.cjs enforces INFORMATION_SCHEMA idempotency.

ALTER TABLE shipment
  ADD COLUMN excused_delay BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN excused_delay_reason TEXT NULL,
  ADD COLUMN excused_delay_confirmed_by INT NULL,
  ADD COLUMN excused_delay_confirmed_at DATETIME NULL,
  ADD COLUMN in_transit_compliance_alert BOOLEAN NOT NULL DEFAULT FALSE;

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

ALTER TABLE regulation
  ADD COLUMN border_gate VARCHAR(100) NULL,
  ADD COLUMN transport_mode ENUM('road','air','both') NOT NULL DEFAULT 'both',
  ADD COLUMN doc_tier ENUM('A','B') NOT NULL DEFAULT 'A',
  ADD COLUMN lead_time_days INT NOT NULL DEFAULT 5,
  ADD COLUMN requires_authority_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN min_validity_buffer_hours INT NOT NULL DEFAULT 24;
