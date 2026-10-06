-- OLD-PUSH MIGRATION COMPATIBILITY BOOTSTRAP
-- Creates the missing `old_user` table.
-- Repository and historical evidence (007_account_archive.sql and app/routers/account.py)
-- indicates this table was manually created in production to track deleted users,
-- but the original migration creating it was either lost or overwritten by the 007 patch.
-- 
-- The authentic schema includes `original_user_id` (used by the GDPR erasure trigger in 007)
-- and `user_id` (manually added via instructions in app/routers/account.py for DSAR correlation),
-- along with a unique constraint on email.

CREATE TABLE IF NOT EXISTS old_user (
    id SERIAL PRIMARY KEY,
    original_user_id UUID,
    user_id UUID,
    full_name TEXT,
    email TEXT UNIQUE,
    email_hash TEXT,
    deletion_reason TEXT,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);
