-- Migration 037: GPS Check-in, Geofencing, Position Pings, and Simulation Config (Step 10)

-- 1. route_stop: Tọa độ điểm dừng, bán kính geofence tùy biến và loại tham chiếu địa điểm
SET @m037_a = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'lat') = 0,
  'ALTER TABLE route_stop ADD COLUMN lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_a_stmt FROM @m037_a;
EXECUTE m037_a_stmt;
DEALLOCATE PREPARE m037_a_stmt;

SET @m037_b = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'lng') = 0,
  'ALTER TABLE route_stop ADD COLUMN lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_b_stmt FROM @m037_b;
EXECUTE m037_b_stmt;
DEALLOCATE PREPARE m037_b_stmt;

SET @m037_c = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'geofence_radius_m') = 0,
  'ALTER TABLE route_stop ADD COLUMN geofence_radius_m INT NULL',
  'SELECT 1'
);
PREPARE m037_c_stmt FROM @m037_c;
EXECUTE m037_c_stmt;
DEALLOCATE PREPARE m037_c_stmt;

SET @m037_d = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'location_ref_type') = 0,
  "ALTER TABLE route_stop ADD COLUMN location_ref_type ENUM('master_stop','airport','seaport','depot','address','manual') NULL",
  'SELECT 1'
);
PREPARE m037_d_stmt FROM @m037_d;
EXECUTE m037_d_stmt;
DEALLOCATE PREPARE m037_d_stmt;

SET @m037_e = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'location_ref_id') = 0,
  'ALTER TABLE route_stop ADD COLUMN location_ref_id INT NULL',
  'SELECT 1'
);
PREPARE m037_e_stmt FROM @m037_e;
EXECUTE m037_e_stmt;
DEALLOCATE PREPARE m037_e_stmt;

-- 2. route_leg: Tọa độ điểm đầu, điểm cuối và đường đa tuyến (polyline giản lược)
SET @m037_f = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'origin_lat') = 0,
  'ALTER TABLE route_leg ADD COLUMN origin_lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_f_stmt FROM @m037_f;
EXECUTE m037_f_stmt;
DEALLOCATE PREPARE m037_f_stmt;

SET @m037_g = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'origin_lng') = 0,
  'ALTER TABLE route_leg ADD COLUMN origin_lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_g_stmt FROM @m037_g;
EXECUTE m037_g_stmt;
DEALLOCATE PREPARE m037_g_stmt;

SET @m037_h = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'destination_lat') = 0,
  'ALTER TABLE route_leg ADD COLUMN destination_lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_h_stmt FROM @m037_h;
EXECUTE m037_h_stmt;
DEALLOCATE PREPARE m037_h_stmt;

SET @m037_i = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'destination_lng') = 0,
  'ALTER TABLE route_leg ADD COLUMN destination_lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_i_stmt FROM @m037_i;
EXECUTE m037_i_stmt;
DEALLOCATE PREPARE m037_i_stmt;

SET @m037_j = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'route_polyline') = 0,
  'ALTER TABLE route_leg ADD COLUMN route_polyline MEDIUMTEXT NULL',
  'SELECT 1'
);
PREPARE m037_j_stmt FROM @m037_j;
EXECUTE m037_j_stmt;
DEALLOCATE PREPARE m037_j_stmt;

-- 3. route_stop_update: Bằng chứng vị trí cho mỗi check-in điểm dừng
SET @m037_k = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'lat') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_k_stmt FROM @m037_k;
EXECUTE m037_k_stmt;
DEALLOCATE PREPARE m037_k_stmt;

SET @m037_l = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'lng') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_l_stmt FROM @m037_l;
EXECUTE m037_l_stmt;
DEALLOCATE PREPARE m037_l_stmt;

SET @m037_m = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'accuracy_m') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN accuracy_m DECIMAL(8,2) NULL',
  'SELECT 1'
);
PREPARE m037_m_stmt FROM @m037_m;
EXECUTE m037_m_stmt;
DEALLOCATE PREPARE m037_m_stmt;

SET @m037_n = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'location_source') = 0,
  "ALTER TABLE route_stop_update ADD COLUMN location_source ENUM('gps','simulated','manual','override') NULL",
  'SELECT 1'
);
PREPARE m037_n_stmt FROM @m037_n;
EXECUTE m037_n_stmt;
DEALLOCATE PREPARE m037_n_stmt;

SET @m037_o = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'distance_to_stop_m') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN distance_to_stop_m INT NULL',
  'SELECT 1'
);
PREPARE m037_o_stmt FROM @m037_o;
EXECUTE m037_o_stmt;
DEALLOCATE PREPARE m037_o_stmt;

SET @m037_p = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'geofence_passed') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN geofence_passed BOOLEAN NULL',
  'SELECT 1'
);
PREPARE m037_p_stmt FROM @m037_p;
EXECUTE m037_p_stmt;
DEALLOCATE PREPARE m037_p_stmt;

SET @m037_q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'manual_reason') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN manual_reason VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE m037_q_stmt FROM @m037_q;
EXECUTE m037_q_stmt;
DEALLOCATE PREPARE m037_q_stmt;

SET @m037_r = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'evidence_url') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN evidence_url VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE m037_r_stmt FROM @m037_r;
EXECUTE m037_r_stmt;
DEALLOCATE PREPARE m037_r_stmt;

SET @m037_s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop_update' AND COLUMN_NAME = 'flagged') = 0,
  'ALTER TABLE route_stop_update ADD COLUMN flagged BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE m037_s_stmt FROM @m037_s;
EXECUTE m037_s_stmt;
DEALLOCATE PREPARE m037_s_stmt;

-- 4. trip_status_log: Bằng chứng vị trí cho mỗi mốc bắt đầu / kết thúc chặng
SET @m037_t = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'lat') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_t_stmt FROM @m037_t;
EXECUTE m037_t_stmt;
DEALLOCATE PREPARE m037_t_stmt;

SET @m037_u = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'lng') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_u_stmt FROM @m037_u;
EXECUTE m037_u_stmt;
DEALLOCATE PREPARE m037_u_stmt;

SET @m037_v = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'accuracy_m') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN accuracy_m DECIMAL(8,2) NULL',
  'SELECT 1'
);
PREPARE m037_v_stmt FROM @m037_v;
EXECUTE m037_v_stmt;
DEALLOCATE PREPARE m037_v_stmt;

SET @m037_w = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'location_source') = 0,
  "ALTER TABLE trip_status_log ADD COLUMN location_source ENUM('gps','simulated','manual','override') NULL",
  'SELECT 1'
);
PREPARE m037_w_stmt FROM @m037_w;
EXECUTE m037_w_stmt;
DEALLOCATE PREPARE m037_w_stmt;

SET @m037_x = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'distance_to_stop_m') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN distance_to_stop_m INT NULL',
  'SELECT 1'
);
PREPARE m037_x_stmt FROM @m037_x;
EXECUTE m037_x_stmt;
DEALLOCATE PREPARE m037_x_stmt;

SET @m037_y = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'geofence_passed') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN geofence_passed BOOLEAN NULL',
  'SELECT 1'
);
PREPARE m037_y_stmt FROM @m037_y;
EXECUTE m037_y_stmt;
DEALLOCATE PREPARE m037_y_stmt;

SET @m037_z = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'manual_reason') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN manual_reason VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE m037_z_stmt FROM @m037_z;
EXECUTE m037_z_stmt;
DEALLOCATE PREPARE m037_z_stmt;

SET @m037_aa = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'evidence_url') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN evidence_url VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE m037_aa_stmt FROM @m037_aa;
EXECUTE m037_aa_stmt;
DEALLOCATE PREPARE m037_aa_stmt;

SET @m037_ab = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_status_log' AND COLUMN_NAME = 'flagged') = 0,
  'ALTER TABLE trip_status_log ADD COLUMN flagged BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE m037_ab_stmt FROM @m037_ab;
EXECUTE m037_ab_stmt;
DEALLOCATE PREPARE m037_ab_stmt;

-- 5. horse_health_log: Nhịp thở, liên kết điểm dừng và tọa độ đo sinh hiệu
SET @m037_ac = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log' AND COLUMN_NAME = 'respiratory_rate_bpm') = 0,
  'ALTER TABLE horse_health_log ADD COLUMN respiratory_rate_bpm INT NULL',
  'SELECT 1'
);
PREPARE m037_ac_stmt FROM @m037_ac;
EXECUTE m037_ac_stmt;
DEALLOCATE PREPARE m037_ac_stmt;

SET @m037_ad = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log' AND COLUMN_NAME = 'route_stop_id') = 0,
  'ALTER TABLE horse_health_log ADD COLUMN route_stop_id INT NULL',
  'SELECT 1'
);
PREPARE m037_ad_stmt FROM @m037_ad;
EXECUTE m037_ad_stmt;
DEALLOCATE PREPARE m037_ad_stmt;

SET @m037_ae = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log' AND COLUMN_NAME = 'lat') = 0,
  'ALTER TABLE horse_health_log ADD COLUMN lat DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_ae_stmt FROM @m037_ae;
EXECUTE m037_ae_stmt;
DEALLOCATE PREPARE m037_ae_stmt;

SET @m037_af = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log' AND COLUMN_NAME = 'lng') = 0,
  'ALTER TABLE horse_health_log ADD COLUMN lng DECIMAL(10,6) NULL',
  'SELECT 1'
);
PREPARE m037_af_stmt FROM @m037_af;
EXECUTE m037_af_stmt;
DEALLOCATE PREPARE m037_af_stmt;

SET @m037_ag = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse_health_log' AND COLUMN_NAME = 'location_source') = 0,
  "ALTER TABLE horse_health_log ADD COLUMN location_source ENUM('gps','simulated','manual') NULL",
  'SELECT 1'
);
PREPARE m037_ag_stmt FROM @m037_ag;
EXECUTE m037_ag_stmt;
DEALLOCATE PREPARE m037_ag_stmt;

-- 6. Bảng lưu ping vị trí liên tục từ phương tiện / tài xế
CREATE TABLE IF NOT EXISTS vehicle_position_ping (
  ping_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  leg_id INT NULL,
  vehicle_id INT NULL,
  reported_by INT NOT NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  accuracy_m DECIMAL(8,2) NULL,
  speed_kmh DECIMAL(6,2) NULL,
  heading_deg DECIMAL(5,2) NULL,
  source ENUM('gps','simulated') NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_ping_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ping_shipment_time (shipment_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Cấu hình hệ thống dùng chung cho GPS, Geofence, Giả lập & Chi tiết sinh hiệu
CREATE TABLE IF NOT EXISTS system_setting (
  setting_key VARCHAR(100) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_setting (setting_key, value_json) VALUES
  ('tracking.geofence', '{"defaultRadiusM": 300, "largeSiteRadiusM": 1000, "maxAccuracyM": 200}'),
  ('tracking.simulation_enabled', 'false'),
  ('tracking.customer_vitals_detail', 'true');
