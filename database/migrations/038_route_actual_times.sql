-- Migration 038: Bổ sung cột thời gian thực tế cho route_leg/route_stop.
-- Trước đây các cột này chỉ được TrackingStore tự ALTER lúc khởi động app;
-- DB dựng mới từ schema/migrations sẽ thiếu và làm lỗi query fleet, reports, routes.

SET @m038_1 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'actual_departure') = 0,
  'ALTER TABLE route_leg ADD COLUMN actual_departure DATETIME NULL',
  'SELECT 1'
);
PREPARE m038_1_stmt FROM @m038_1;
EXECUTE m038_1_stmt;
DEALLOCATE PREPARE m038_1_stmt;

SET @m038_2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_leg' AND COLUMN_NAME = 'actual_arrival') = 0,
  'ALTER TABLE route_leg ADD COLUMN actual_arrival DATETIME NULL',
  'SELECT 1'
);
PREPARE m038_2_stmt FROM @m038_2;
EXECUTE m038_2_stmt;
DEALLOCATE PREPARE m038_2_stmt;

SET @m038_3 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'actual_arrival') = 0,
  'ALTER TABLE route_stop ADD COLUMN actual_arrival DATETIME NULL',
  'SELECT 1'
);
PREPARE m038_3_stmt FROM @m038_3;
EXECUTE m038_3_stmt;
DEALLOCATE PREPARE m038_3_stmt;

SET @m038_4 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'actual_departure') = 0,
  'ALTER TABLE route_stop ADD COLUMN actual_departure DATETIME NULL',
  'SELECT 1'
);
PREPARE m038_4_stmt FROM @m038_4;
EXECUTE m038_4_stmt;
DEALLOCATE PREPARE m038_4_stmt;

SET @m038_5 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'updated_by') = 0,
  'ALTER TABLE route_stop ADD COLUMN updated_by INT NULL',
  'SELECT 1'
);
PREPARE m038_5_stmt FROM @m038_5;
EXECUTE m038_5_stmt;
DEALLOCATE PREPARE m038_5_stmt;

SET @m038_6 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_stop' AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE route_stop ADD COLUMN notes TEXT NULL',
  'SELECT 1'
);
PREPARE m038_6_stmt FROM @m038_6;
EXECUTE m038_6_stmt;
DEALLOCATE PREPARE m038_6_stmt;
