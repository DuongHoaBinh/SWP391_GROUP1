-- Migration 029: Hồ sơ ngựa sau review hội đồng (11/2026) — Step 2.
-- 1) Bỏ giới tính / ngày sinh khỏi nghiệp vụ (KHÔNG xóa cột để giữ dữ liệu cũ), thêm cờ chuồng riêng + tính khí.
-- 2) Danh mục loại giấy tờ `document_type`.
-- 3) Giấy tờ gắn với ngựa, dùng lại cho nhiều đơn: `transport_document.document_type_code`, `regulation_id` cho phép NULL.
-- Idempotent: chạy lại không lỗi, không đổi kết quả.

-- 1. horse.requires_private_stall
SET @m029_hps = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'requires_private_stall') = 0,
  'ALTER TABLE horse ADD COLUMN requires_private_stall BOOLEAN NOT NULL DEFAULT FALSE AFTER special_requirements',
  'SELECT 1'
);
PREPARE m029_hps_stmt FROM @m029_hps;
EXECUTE m029_hps_stmt;
DEALLOCATE PREPARE m029_hps_stmt;

-- 1b. horse.temperament
SET @m029_ht = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'horse' AND COLUMN_NAME = 'temperament') = 0,
  'ALTER TABLE horse ADD COLUMN temperament ENUM(''calm'',''normal'',''difficult'') NOT NULL DEFAULT ''normal'' AFTER requires_private_stall',
  'SELECT 1'
);
PREPARE m029_ht_stmt FROM @m029_ht;
EXECUTE m029_ht_stmt;
DEALLOCATE PREPARE m029_ht_stmt;

-- 2. Danh mục loại giấy tờ
CREATE TABLE IF NOT EXISTS document_type (
  code VARCHAR(50) PRIMARY KEY,
  name_vi VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  default_validity_days INT NULL,
  is_identity BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO document_type (code, name_vi, name_en, default_validity_days, is_identity, sort_order) VALUES
  ('horse_passport', 'Hộ chiếu ngựa', 'Horse passport', NULL, TRUE, 10),
  ('microchip_certificate', 'Giấy chứng nhận vi mạch', 'Microchip certificate', NULL, TRUE, 20),
  ('ownership_certificate', 'Giấy chứng nhận quyền sở hữu', 'Ownership certificate', NULL, TRUE, 30),
  ('vaccination_influenza', 'Tiêm phòng cúm ngựa', 'Equine influenza vaccination', 180, FALSE, 40),
  ('vaccination_tetanus', 'Tiêm phòng uốn ván', 'Tetanus vaccination', 365, FALSE, 50),
  ('eia_coggins_test', 'Xét nghiệm EIA (Coggins)', 'EIA (Coggins) test', 180, FALSE, 60),
  ('health_certificate', 'Giấy chứng nhận sức khỏe', 'Health certificate', 10, FALSE, 70),
  ('export_quarantine_certificate', 'Giấy chứng nhận kiểm dịch xuất khẩu', 'Export quarantine certificate', 10, FALSE, 80),
  ('import_permit', 'Giấy phép nhập khẩu', 'Import permit', 30, FALSE, 90),
  -- Mã đã dùng trong preset quy định trước Step 2 (giữ để giấy tờ cũ khớp danh mục)
  ('vaccination_certificate', 'Sổ tiêm phòng tổng hợp', 'Vaccination record', 365, FALSE, 45),
  ('quarantine_certificate', 'Giấy chứng nhận kiểm dịch', 'Quarantine certificate', 10, FALSE, 85),
  ('customs_declaration', 'Tờ khai hải quan', 'Customs declaration', 30, FALSE, 95)
ON DUPLICATE KEY UPDATE
  name_vi = VALUES(name_vi),
  name_en = VALUES(name_en),
  default_validity_days = VALUES(default_validity_days),
  is_identity = VALUES(is_identity),
  sort_order = VALUES(sort_order);

-- 3. transport_document.document_type_code
SET @m029_tdc = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transport_document' AND COLUMN_NAME = 'document_type_code') = 0,
  'ALTER TABLE transport_document ADD COLUMN document_type_code VARCHAR(50) NULL AFTER regulation_id',
  'SELECT 1'
);
PREPARE m029_tdc_stmt FROM @m029_tdc;
EXECUTE m029_tdc_stmt;
DEALLOCATE PREPARE m029_tdc_stmt;

SET @m029_tdfk = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transport_document' AND CONSTRAINT_NAME = 'fk_doc_document_type') = 0,
  'ALTER TABLE transport_document ADD CONSTRAINT fk_doc_document_type FOREIGN KEY (document_type_code) REFERENCES document_type(code)',
  'SELECT 1'
);
PREPARE m029_tdfk_stmt FROM @m029_tdfk;
EXECUTE m029_tdfk_stmt;
DEALLOCATE PREPARE m029_tdfk_stmt;

-- 3b. Giấy tờ chung (hộ chiếu...) không thuộc riêng quy định nào → regulation_id được NULL.
ALTER TABLE transport_document MODIFY COLUMN regulation_id INT NULL;

-- 3c. Gắn mã loại cho giấy tờ cũ có doc_type trùng mã danh mục.
UPDATE transport_document d
JOIN document_type t ON t.code = d.doc_type
SET d.document_type_code = t.code
WHERE d.document_type_code IS NULL;
