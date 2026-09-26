USE horse_transport_system;

ALTER TABLE horse
  ADD COLUMN age INT NULL AFTER date_of_birth;
