-- OLD-PUSH MIGRATION COMPATIBILITY BOOTSTRAP
-- Creates the missing `fn_set_updated_at()` trigger function.
-- Repository and historical evidence (010_cascade_fixes.sql) indicates this
-- function was originally created in the legacy 005_user_activity.sql migration.
-- However, that migration was overwritten by 005_patch_recommended.sql, which
-- removed the function's creation.
-- Migration 010 still expects it to exist to attach to usage_events and billing_events.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
