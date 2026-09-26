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

-- 6. Sample Customer
INSERT INTO `user` (role_id, full_name, email, password_hash, account_origin, auth_provider, email_verified, status)
SELECT role_id, 'Nguyễn Văn Chủ Ngựa', 'customer@example.com', '$2a$12$quGJF8AqfNcYhzz7SECw6e587nncfQc653h55ns39/hR5ALggJST2', 'self_registered', 'local', TRUE, 'active'
FROM `role` WHERE role_name = 'Customer'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);
