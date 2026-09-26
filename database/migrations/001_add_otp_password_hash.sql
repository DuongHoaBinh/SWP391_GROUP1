USE horse_transport_system;

ALTER TABLE otp_verification
  ADD COLUMN password_hash VARCHAR(255) NOT NULL AFTER user_id;