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

SET @road_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'road_trip_id') = 0,
  'ALTER TABLE route_leg ADD COLUMN road_trip_id INT NULL, ADD INDEX idx_route_leg_road_trip (road_trip_id), ADD CONSTRAINT fk_route_leg_road_trip FOREIGN KEY (road_trip_id) REFERENCES road_trip(road_trip_id)', 'SELECT 1');
PREPARE road_statement FROM @road_ddl;
EXECUTE road_statement;
DEALLOCATE PREPARE road_statement;
