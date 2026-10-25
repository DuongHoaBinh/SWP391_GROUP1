USE horse_transport_system;

ALTER TABLE transport_document
  ADD COLUMN reviewer_notes VARCHAR(500) NULL AFTER status;
