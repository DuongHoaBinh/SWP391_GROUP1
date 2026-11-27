-- Migration 046: Remove the 7-day (168h) sea voyage duration cap by reactivating all vessel sea_route corridors.
-- Ferry routes remain deactivated (vessel-only policy). Idempotent and safe to re-run.

UPDATE sea_route
SET is_active = TRUE
WHERE sea_mode = 'vessel' AND is_active = FALSE;

UPDATE sea_route
SET is_active = FALSE
WHERE sea_mode = 'ferry';
