-- 039_account_deletion_recovery.sql
-- Resolves account deletion recovery, atomicity, and storage cleanup.

-- 1. Unify old_user identity contract.
-- We adopt user_id as the canonical identifier because it matches audit logs.
ALTER TABLE old_user ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;
ALTER TABLE old_user ADD COLUMN IF NOT EXISTS original_user_id UUID;
ALTER TABLE old_user ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE old_user ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();
UPDATE old_user SET user_id = original_user_id WHERE user_id IS NULL AND original_user_id IS NOT NULL;
UPDATE old_user SET original_user_id = user_id WHERE original_user_id IS NULL AND user_id IS NOT NULL;

-- Update the erasure trigger to match user_id instead of original_user_id
CREATE OR REPLACE FUNCTION fn_erasure_pseudonymise_old_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE old_user
    SET
        full_name = NULL,
        email     = NULL
    WHERE user_id = OLD.id
      AND (full_name IS NOT NULL OR email IS NOT NULL);
    RETURN OLD;
END;
$$;

-- 2. offer_documents.uploaded_by FK change
ALTER TABLE offer_documents DROP CONSTRAINT IF EXISTS offer_documents_uploaded_by_fk;
ALTER TABLE offer_documents ADD CONSTRAINT offer_documents_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Account Deletion Requests table for durable saga
CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    email TEXT NOT NULL,
    auth_user_ids TEXT[] NOT NULL,
    storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'DB_DELETED', 'STORAGE_DELETED', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT
);

-- Grant sequence privileges to prepvista_runtime
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'prepvista_runtime') THEN
        GRANT USAGE, SELECT ON SEQUENCE old_user_id_seq TO prepvista_runtime;
        GRANT USAGE, SELECT ON SEQUENCE account_deletion_requests_id_seq TO prepvista_runtime;
        GRANT SELECT, INSERT, UPDATE ON account_deletion_requests TO prepvista_runtime;
        GRANT SELECT, INSERT, UPDATE ON old_user TO prepvista_runtime;
    END IF;
END $$;
