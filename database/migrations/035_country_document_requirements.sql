-- Migration 035: Step 8 - Giấy tờ theo quốc gia, dùng lại giấy còn hạn, Manager duyệt, job hết hạn
-- Idempotent schema modifications for regulation, transport_document, document_review_log, document_expiry_notice

-- 1. Modify regulation.transport_mode to ensure 'sea' is supported
ALTER TABLE regulation MODIFY COLUMN transport_mode ENUM('road','air','sea','both') NOT NULL DEFAULT 'both';

-- 2. Add columns to regulation
SET @dbname = DATABASE();

SET @col_doc_type_code = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND COLUMN_NAME = 'document_type_code');
SET @sql_doc_type_code = IF(@col_doc_type_code = 0, 'ALTER TABLE regulation ADD COLUMN document_type_code VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_doc_type_code; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_max_issue_age = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND COLUMN_NAME = 'max_issue_age_days');
SET @sql_max_issue_age = IF(@col_max_issue_age = 0, 'ALTER TABLE regulation ADD COLUMN max_issue_age_days INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_max_issue_age; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_is_active = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND COLUMN_NAME = 'is_active');
SET @sql_is_active = IF(@col_is_active = 0, 'ALTER TABLE regulation ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @sql_is_active; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_legal_ref = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND COLUMN_NAME = 'legal_reference');
SET @sql_legal_ref = IF(@col_legal_ref = 0, 'ALTER TABLE regulation ADD COLUMN legal_reference VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql_legal_ref; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_is_demo = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND COLUMN_NAME = 'is_demo_data');
SET @sql_is_demo = IF(@col_is_demo = 0, 'ALTER TABLE regulation ADD COLUMN is_demo_data BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @sql_is_demo; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill document_type_code from document_type table
UPDATE regulation r
JOIN document_type t ON t.code = r.document_type
SET r.document_type_code = t.code
WHERE r.document_type_code IS NULL;

-- Add FK on regulation.document_type_code if not present
SET @fk_reg_dt = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'regulation' AND CONSTRAINT_NAME = 'fk_reg_document_type');
SET @sql_fk_reg_dt = IF(@fk_reg_dt = 0, 'ALTER TABLE regulation ADD CONSTRAINT fk_reg_document_type FOREIGN KEY (document_type_code) REFERENCES document_type(code)', 'SELECT 1');
PREPARE stmt FROM @sql_fk_reg_dt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Add reviewer audit columns to transport_document
SET @col_rev_by = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'transport_document' AND COLUMN_NAME = 'reviewed_by');
SET @sql_rev_by = IF(@col_rev_by = 0, 'ALTER TABLE transport_document ADD COLUMN reviewed_by INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_rev_by; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_rev_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'transport_document' AND COLUMN_NAME = 'reviewed_at');
SET @sql_rev_at = IF(@col_rev_at = 0, 'ALTER TABLE transport_document ADD COLUMN reviewed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql_rev_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_doc_rev = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'transport_document' AND CONSTRAINT_NAME = 'fk_doc_reviewer');
SET @sql_fk_doc_rev = IF(@fk_doc_rev = 0, 'ALTER TABLE transport_document ADD CONSTRAINT fk_doc_reviewer FOREIGN KEY (reviewed_by) REFERENCES `user`(user_id)', 'SELECT 1');
PREPARE stmt FROM @sql_fk_doc_rev; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Create document_review_log table (append-only)
CREATE TABLE IF NOT EXISTS document_review_log (
  review_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  reviewer_id INT NULL,
  reason TEXT NULL,
  checked_fields_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_drl_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id) ON DELETE CASCADE,
  CONSTRAINT fk_drl_reviewer FOREIGN KEY (reviewer_id) REFERENCES `user`(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Create document_expiry_notice table (idempotent notification tracker)
CREATE TABLE IF NOT EXISTS document_expiry_notice (
  notice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  days_before INT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_notice (document_id, days_before),
  CONSTRAINT fk_den_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Seed demo requirements for 7 countries × transport modes
-- Vietnam (domestic road & sea)
INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT 'Vietnam', 'road', 'A', 2, NULL, FALSE, 24, 'horse_passport', 'horse_passport', 'Hộ chiếu ngựa quốc gia / FEI', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = 'Vietnam' AND transport_mode = 'road' AND document_type_code = 'horse_passport');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT 'Vietnam', 'road', 'B', 1, 3, FALSE, 24, 'health_certificate', 'health_certificate', 'Giấy kiểm dịch động vật nội địa (Mẫu 15b-TY)', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = 'Vietnam' AND transport_mode = 'road' AND document_type_code = 'health_certificate');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT 'Vietnam', 'sea', 'A', 2, NULL, FALSE, 24, 'horse_passport', 'horse_passport', 'Hộ chiếu ngựa đường thủy / nội địa', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = 'Vietnam' AND transport_mode = 'sea' AND document_type_code = 'horse_passport');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT 'Vietnam', 'sea', 'B', 1, 3, FALSE, 24, 'health_certificate', 'health_certificate', 'Giấy kiểm dịch động vật đường thủy (Mẫu 15b-TY)', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = 'Vietnam' AND transport_mode = 'sea' AND document_type_code = 'health_certificate');

-- Cambodia, Laos, Thailand (Cross-border road & both)
INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, 'road', 'A', 7, NULL, FALSE, 48, 'horse_passport', 'horse_passport', 'Hộ chiếu ngựa quốc tế FEI', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Cambodia' AS name UNION SELECT 'Laos' UNION SELECT 'Thailand') c
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = 'road' AND document_type_code = 'horse_passport');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, 'road', 'A', 7, NULL, FALSE, 48, 'vaccination_influenza', 'vaccination_influenza', 'Chứng nhận tiêm phòng cúm ngựa hợp lệ', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Cambodia' AS name UNION SELECT 'Laos' UNION SELECT 'Thailand') c
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = 'road' AND document_type_code = 'vaccination_influenza');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, 'road', 'A', 10, 90, FALSE, 48, 'eia_coggins_test', 'eia_coggins_test', 'Phiếu xét nghiệm EIA (Coggins) âm tính trong 90 ngày', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Cambodia' AS name UNION SELECT 'Laos' UNION SELECT 'Thailand') c
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = 'road' AND document_type_code = 'eia_coggins_test');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, 'road', 'B', 7, 10, TRUE, 48, 'export_quarantine_certificate', 'export_quarantine_certificate', 'Chứng nhận kiểm dịch xuất khẩu song phương', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Cambodia' AS name UNION SELECT 'Laos' UNION SELECT 'Thailand') c
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = 'road' AND document_type_code = 'export_quarantine_certificate');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, 'road', 'A', 14, NULL, TRUE, 48, 'import_permit', 'import_permit', 'Giấy phép nhập khẩu động vật từ cơ quan thú y nước đến', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Cambodia' AS name UNION SELECT 'Laos' UNION SELECT 'Thailand') c
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = 'road' AND document_type_code = 'import_permit');

-- Singapore, Malaysia, Hong Kong (air & sea)
-- Singapore
INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'A', 14, NULL, FALSE, 48, 'horse_passport', 'horse_passport', 'Hộ chiếu ngựa quốc tế FEI có nhận diện vi mạch', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'horse_passport');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'A', 14, NULL, FALSE, 48, 'microchip_certificate', 'microchip_certificate', 'Chứng thư cấy vi mạch chuẩn ISO 11784/11785', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'microchip_certificate');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'A', 14, NULL, FALSE, 48, 'vaccination_influenza', 'vaccination_influenza', 'Sổ tiêm chủng cúm ngựa (Equine Influenza) trong 6 tháng', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'vaccination_influenza');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'A', 21, 60, FALSE, 48, 'eia_coggins_test', 'eia_coggins_test', 'Xét nghiệm EIA Coggins Test âm tính trong 60 ngày', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'eia_coggins_test');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'B', 3, 10, FALSE, 48, 'health_certificate', 'health_certificate', 'Giấy chứng nhận sức khỏe kiểm dịch quốc tế (cấp trong 10 ngày)', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'health_certificate');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'B', 7, 10, TRUE, 48, 'export_quarantine_certificate', 'export_quarantine_certificate', 'Chứng nhận cách ly kiểm dịch xuất khẩu chính thức', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'export_quarantine_certificate');

INSERT INTO regulation (country, transport_mode, doc_tier, lead_time_days, max_issue_age_days, requires_authority_approval, min_validity_buffer_hours, document_type, document_type_code, description, effective_date, legal_reference, is_demo_data, is_active)
SELECT c.name, m.mode, 'A', 21, NULL, TRUE, 48, 'import_permit', 'import_permit', 'Giấy phép nhập cảnh động vật chính thức (AVS/DVS/AFCD)', '2026-01-01', 'Dữ liệu demo — cần đối chiếu cơ quan thú y', TRUE, TRUE
FROM (SELECT 'Singapore' AS name UNION SELECT 'Malaysia' UNION SELECT 'Hong Kong') c
CROSS JOIN (SELECT 'air' AS mode UNION SELECT 'sea') m
WHERE NOT EXISTS (SELECT 1 FROM regulation WHERE country = c.name AND transport_mode = m.mode AND document_type_code = 'import_permit');
