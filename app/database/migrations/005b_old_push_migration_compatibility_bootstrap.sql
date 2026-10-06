-- OLD-PUSH MIGRATION COMPATIBILITY BOOTSTRAP
-- Adds missing plan_id column.
-- Repository and historical evidence indicates this column was manually added
-- in production to track external provider plan patterns (e.g., 'pro-annual'),
-- but was never codified in a historical migration before 006_plan_lifecycle.sql
-- was written to depend on it.

ALTER TABLE user_plan_entitlements
ADD COLUMN IF NOT EXISTS plan_id TEXT;
