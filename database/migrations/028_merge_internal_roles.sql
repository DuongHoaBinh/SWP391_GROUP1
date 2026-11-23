-- Migration 028: Gộp Transport Specialist + Fleet & Route Coordinator vào Logistics Manager (góp ý hội đồng, review 11/2026).
-- Idempotent: chạy lại không đổi kết quả. Không xóa role cũ để giữ khóa ngoại và lịch sử; chỉ đánh dấu deprecated.

UPDATE `user` u
JOIN `role` old_role ON old_role.role_id = u.role_id
JOIN `role` manager_role ON manager_role.role_name = 'Logistics Manager'
SET u.role_id = manager_role.role_id
WHERE old_role.role_name IN ('Transport Specialist', 'Fleet & Route Coordinator');

UPDATE `role`
SET description = 'Deprecated (review 11/2026): merged into Logistics Manager'
WHERE role_name IN ('Transport Specialist', 'Fleet & Route Coordinator');

UPDATE `role`
SET description = 'Operations Manager: approves orders, reviews compliance documents, plans routes and dispatches the fleet'
WHERE role_name = 'Logistics Manager';
