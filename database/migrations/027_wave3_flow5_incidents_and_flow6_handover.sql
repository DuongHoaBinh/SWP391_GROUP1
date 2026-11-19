-- Migration 027: Wave 3 (Release 2 Optional Scope) Flow 5 Incident & 2-Step Change Request + Flow 6 Per-Horse Handover & Dispute Resolution
-- Safe for inspection; programmatic runner database/apply-wave3-migration.cjs enforces INFORMATION_SCHEMA idempotency.

ALTER TABLE incident_report
  ADD COLUMN location_text VARCHAR(255) NULL,
  ADD COLUMN immediate_actions TEXT NULL,
  ADD COLUMN resolution_notes TEXT NULL,
  ADD COLUMN resolved_by INT NULL,
  ADD COLUMN affected_border_gate VARCHAR(150) NULL,
  ADD COLUMN evidence_urls_json MEDIUMTEXT NULL;

ALTER TABLE shipment_change_request
  ADD COLUMN estimated_extra_cost BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN cost_allocation ENUM('none','operating_cost','emergency_vet_covered','customer_addendum') NOT NULL DEFAULT 'none',
  ADD COLUMN crosses_new_border BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN decision_notes TEXT NULL,
  ADD COLUMN published_at DATETIME NULL,
  ADD COLUMN published_by INT NULL,
  ADD COLUMN ripple_notified_count INT NOT NULL DEFAULT 0;

ALTER TABLE delivery_handover
  ADD COLUMN handover_location VARCHAR(255) NULL,
  ADD COLUMN delivered_quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN identity_verified BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN documents_handed_over BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN evidence_urls_json MEDIUMTEXT NULL,
  ADD COLUMN dispute_reason TEXT NULL,
  ADD COLUMN confirmed_by INT NULL,
  ADD COLUMN confirmed_at DATETIME NULL,
  ADD COLUMN resolution_notes TEXT NULL,
  ADD COLUMN compensation_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN resolved_by INT NULL,
  ADD COLUMN resolved_at DATETIME NULL,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE attachment
  MODIFY COLUMN related_type ENUM('shipment','horse_condition_log','incident_report','delivery_handover') NOT NULL;
