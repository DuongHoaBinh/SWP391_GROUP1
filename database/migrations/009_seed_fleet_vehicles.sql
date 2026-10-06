-- 009_seed_fleet_vehicles.sql
-- Seed initial transport vehicles for Flow 3 (Fleet & Route Coordination)

USE horse_transport_system;

INSERT INTO vehicle (vehicle_type, plate_or_code, capacity, status)
VALUES
  ('truck', '51C-888.99', 4, 'available'),
  ('truck', '51D-777.22', 2, 'available'),
  ('truck', '29B-999.11', 6, 'available'),
  ('truck', '60C-555.33', 4, 'available'),
  ('aircraft_stall', 'VN-AIR-CARGO-01', 3, 'available'),
  ('aircraft_stall', 'SQ-CARGO-STALL-02', 3, 'available'),
  ('container', 'CONT-CLIMATE-901', 4, 'available')
ON DUPLICATE KEY UPDATE capacity = VALUES(capacity);
