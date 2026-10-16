-- ============================================================================
-- Seed data for development
-- Database: horse_transport_system
-- Password for all seed accounts: Password123
-- Hash: $2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2
-- ============================================================================

USE horse_transport_system;

-- 1. Admin
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'System Administrator', 'admin@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Admin'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 2. Logistics Manager
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Logistics Manager', 'manager@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Logistics Manager'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 3. Transport Specialist
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Transport Specialist', 'specialist@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Transport Specialist'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 4. Fleet & Route Coordinator
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Fleet Coordinator', 'coordinator@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Fleet & Route Coordinator'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 5. Vehicle Driver / Escort
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Driver Escort', 'driver@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO `user` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Trần Văn Lái (Tài xế chuyên dụng 1)', 'driver1@example.com', '0901234561', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO `user` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Lê Hoàng Nam (Tài xế đường trường 2)', 'driver2@example.com', '0901234562', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO `user` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Phạm Minh Tuấn (Tài xế container lạnh 3)', 'driver3@example.com', '0901234563', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO `user` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'BS. Hoàng Văn Y (Bác sĩ thú y hộ tống)', 'escort1@example.com', '0909876541', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO `user` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Đặng Quốc Hưng (Chuyên viên hộ tống bay)', 'escort2@example.com', '0909876542', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'system_created', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Vehicle Driver / Escort'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 6. Sample Customer
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Nguyễn Văn Chủ Ngựa', 'customer@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'self_registered', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Customer'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 7. Sample Regulations for Flow 2 (Singapore & Malaysia & Vietnam)
INSERT INTO regulation (country, document_type, description, effective_date)
VALUES
  ('Singapore', 'horse_passport', 'Hộ chiếu ngựa quốc tế do FEI hoặc Liên đoàn đua ngựa cấp, có chứng thực vi mạch microchip.', '2026-01-01'),
  ('Singapore', 'vaccination_certificate', 'Chứng nhận tiêm phòng cúm ngựa (Equine Influenza) mũi nhắc lại trong vòng 6 tháng gần nhất.', '2026-01-01'),
  ('Singapore', 'health_certificate', 'Giấy chứng nhận kiểm dịch động vật xuất khẩu do Cục Thú Y cấp trước ngày xuất phát không quá 72 giờ.', '2026-01-01'),
  ('Singapore', 'import_permit', 'Giấy phép nhập khẩu do Cơ quan Thực phẩm và Thú y Singapore (AVS) cấp.', '2026-01-01'),
  ('Malaysia', 'horse_passport', 'Hộ chiếu ngựa đua chính thức kèm bản khai lịch sử thi đấu và chủ sở hữu.', '2026-01-01'),
  ('Malaysia', 'vaccination_certificate', 'Chứng nhận tiêm chủng cúm và viêm não ngựa hợp lệ.', '2026-01-01'),
  ('Malaysia', 'import_permit', 'Giấy phép nhập khẩu cấp bởi Cục Dịch vụ Thú y Malaysia (DVS).', '2026-01-01')
ON DUPLICATE KEY UPDATE description = VALUES(description);

