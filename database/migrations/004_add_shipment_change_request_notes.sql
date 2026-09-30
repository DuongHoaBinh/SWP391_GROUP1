USE horse_transport_system;

ALTER TABLE shipment
  MODIFY COLUMN status ENUM('requested','change_requested','approved','rejected','planning','in_transit','completed','cancelled') NOT NULL DEFAULT 'requested',
  ADD COLUMN change_request_notes VARCHAR(500) NULL AFTER rejection_reason;
