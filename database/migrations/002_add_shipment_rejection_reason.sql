USE horse_transport_system;

ALTER TABLE shipment
  ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER special_requirements;
