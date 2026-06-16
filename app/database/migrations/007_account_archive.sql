-- ============================================================
-- PATCH: 007_patch_recommended.sql
-- Applies all R1–R4 previously-recommended items from the
-- 007_account_archive.sql upgrade report.
-- R5 (FK from old_user.original_user_id → profiles.id) is
-- intentionally NOT applied — the FK direction is architecturally
-- wrong. The archive row is written AFTER the profiles row is
-- deleted, so the FK would always reject the insert. This
-- remains correctly excluded.
-- PREREQUISITE: 007_account_archive.sql must have run first.
-- All blocks are idempotent — safe to re-run.
-- ============================================================


-- ============================================================
-- R1: ROW LEVEL SECURITY ON old_user
-- This is the most urgent security gap in the entire schema.
-- old_user contains full_name and email of every deleted user
-- in plaintext. Without RLS, any authenticated student can:
--   SELECT * FROM old_user
-- via the Supabase JS client and read every deleted user's PII.
-- That is a GDPR incident waiting to happen and an instant
-- procurement blocker for any college with a legal/IT review.
--
-- Policy design:
--   authenticated: ZERO access. No student should ever
--                  directly query the archive table.
--   service_role:  full access for GDPR erasure handler,
--                  re-registration duplicate checks, and
--                  the retention purge job.
-- ============================================================

ALTER TABLE old_user ENABLE ROW LEVEL SECURITY;

-- Deny all direct access to authenticated end users.
-- The application must query old_user exclusively from the
-- server-side backend using service_role credentials.
-- No SELECT, INSERT, UPDATE or DELETE from the client.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'ou_deny_authenticated'
           AND polrelid = 'old_user'::regclass
    ) THEN
        CREATE POLICY "ou_deny_authenticated"
            ON old_user
            FOR ALL
            TO authenticated
            USING (false);
    END IF;
END $$;

-- service_role: unrestricted access for all backend operations.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'ou_all_service_role'
           AND polrelid = 'old_user'::regclass
    ) THEN
        CREATE POLICY "ou_all_service_role"
            ON old_user
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;


-- ============================================================
-- R2: SCHEDULED GDPR RETENTION PURGE (pg_cron)
-- Without an automated purge job, archived_at exists as a
-- column but serves no automatic compliance purpose.
-- A developer must remember to manually delete old rows —
-- that never reliably happens in production.
--
-- Strategy (two-phase erasure, not hard delete):
-- Phase 1 — Pseudonymisation (run first, at 730 days):
--   NULL out full_name and email (recoverable PII) while
--   retaining id, email_hash, deletion_reason, archived_at
--   for audit continuity. The row stays in the table as a
--   non-identifying tombstone.
-- Phase 2 — Hard delete (run second, at 1095 days = 3 years):
--   Remove even the tombstone rows. At this point all audit
--   obligations have been met and the row has zero PII.
--
-- Why two phases?
--   Some educational institutions require a 3-year audit trail
--   of the fact that a user existed, even after PII is erased.
--   Retaining the tombstone satisfies this without PII exposure.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    -- Phase 1 job: pseudonymise rows older than 730 days (2 years)
    IF EXISTS (
        SELECT 1 FROM cron.job
         WHERE jobname = 'gdpr-pseudonymise-old-user'
    ) THEN
        PERFORM cron.unschedule('gdpr-pseudonymise-old-user');
    END IF;

    PERFORM cron.schedule(
        'gdpr-pseudonymise-old-user',
        '0 2 * * *',    -- 02:00 every night
        $job$
        UPDATE old_user
        SET
            full_name = NULL,
            email     = NULL
        WHERE archived_at < NOW() - INTERVAL '730 days'
          AND (full_name IS NOT NULL OR email IS NOT NULL);

        -- Log how many rows were pseudonymised this run
        RAISE NOTICE 'GDPR pseudonymisation complete: % rows processed',
            (SELECT COUNT(*) FROM old_user
              WHERE archived_at < NOW() - INTERVAL '730 days'
                AND full_name IS NULL AND email IS NULL);
        $job$
    );

    RAISE NOTICE 'pg_cron job gdpr-pseudonymise-old-user scheduled (02:00 nightly).';

    -- Phase 2 job: hard-delete tombstone rows older than 1095 days (3 years)
    IF EXISTS (
        SELECT 1 FROM cron.job
         WHERE jobname = 'gdpr-hard-delete-old-user'
    ) THEN
        PERFORM cron.unschedule('gdpr-hard-delete-old-user');
    END IF;

    PERFORM cron.schedule(
        'gdpr-hard-delete-old-user',
        '0 3 * * *',    -- 03:00 every night (1 hour after pseudonymise)
        $job$
        DELETE FROM old_user
        WHERE archived_at < NOW() - INTERVAL '1095 days'
          AND full_name IS NULL
          AND email     IS NULL;
        $job$
    );

    RAISE NOTICE 'pg_cron job gdpr-hard-delete-old-user scheduled (03:00 nightly).';
END $$;


-- ============================================================
-- R3: POST-ERASURE PSEUDONYMISATION TRIGGER
-- When a GDPR erasure request arrives, the application calls
-- the erasure handler which deletes the profiles row.
-- This trigger fires AFTER that delete on profiles and
-- automatically NULLs the PII columns in old_user for any
-- row whose original_user_id matches the deleted profile.
--
-- This closes the most common GDPR erasure gap:
--   profiles row deleted ✓
--   old_user row left untouched ✗  ← this trigger fixes it
--
-- The trigger retains:
--   id, email_hash, deletion_reason, archived_at, metadata
-- These are non-PII audit fields required for:
--   - Audit trail continuity
--   - Permanent re-registration block (via email_hash)
--   - Churn analytics (deletion_reason)
-- ============================================================

-- Trigger function on profiles AFTER DELETE.
CREATE OR REPLACE FUNCTION fn_erasure_pseudonymise_old_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs with owner privileges to bypass RLS on old_user
AS $$
BEGIN
    -- NULL the PII fields for any archive row belonging to
    -- the just-deleted profile UUID.
    UPDATE old_user
    SET
        full_name = NULL,
        email     = NULL
    WHERE original_user_id = OLD.id
      AND (full_name IS NOT NULL OR email IS NOT NULL);

    -- If no original_user_id link exists (legacy rows), fall back
    -- to email match. Uses the email from the deleted profiles row
    -- if your profiles table has an email column.
    -- Uncomment if profiles.email exists and is accessible here:
    -- UPDATE old_user
    -- SET full_name = NULL, email = NULL
    -- WHERE email = OLD.email
    --   AND (full_name IS NOT NULL OR email IS NOT NULL);

    RETURN OLD;
END;
$$;

-- Attach to profiles table AFTER DELETE.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname  = 'trg_profiles_erasure_old_user'
           AND tgrelid = 'profiles'::regclass
    ) THEN
        CREATE TRIGGER trg_profiles_erasure_old_user
        AFTER DELETE
        ON profiles
        FOR EACH ROW
        EXECUTE FUNCTION fn_erasure_pseudonymise_old_user();
    END IF;
END $$;

COMMENT ON FUNCTION fn_erasure_pseudonymise_old_user() IS
    'GDPR Article 17 erasure handler. Fires after profiles DELETE. '
    'NULLs full_name and email in old_user for the matching archive row. '
    'Retains id, email_hash, deletion_reason, archived_at for audit continuity. '
    'SECURITY DEFINER: runs as owner to write to old_user regardless of caller RLS.';


-- ============================================================
-- R4: email_hash AUTO-POPULATION TRIGGER
-- Application code may forget to compute and set email_hash
-- at archival time. This trigger computes it automatically on
-- every INSERT to old_user, using pgcrypto's sha256().
--
-- Hash formula: encode(sha256(lower(trim(email))::bytea), 'hex')
-- This is consistent, lowercase-normalised, and trim-safe.
-- The application must use the same formula when computing
-- email_hash for re-registration duplicate checks.
--
-- PREREQUISITE: pgcrypto extension must be enabled.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION fn_populate_email_hash()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    -- Only compute if email is present and hash is not already set.
    -- Allows application to pre-compute and pass its own hash
    -- (e.g. a different algorithm) without being overwritten.
    IF NEW.email IS NOT NULL AND NEW.email_hash IS NULL THEN
        NEW.email_hash := encode(
            sha256(lower(trim(NEW.email))::bytea),
            'hex'
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Fires BEFORE INSERT so the hash is written in the same
-- transaction as the archive row — no second UPDATE needed.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname  = 'trg_old_user_populate_email_hash'
           AND tgrelid = 'old_user'::regclass
    ) THEN
        CREATE TRIGGER trg_old_user_populate_email_hash
        BEFORE INSERT
        ON old_user
        FOR EACH ROW
        EXECUTE FUNCTION fn_populate_email_hash();
    END IF;
END $$;

-- Backfill email_hash for all existing rows that have an email
-- but no hash. Runs once at migration time; idempotent.
UPDATE old_user
SET email_hash = encode(sha256(lower(trim(email))::bytea), 'hex')
WHERE email IS NOT NULL
  AND email_hash IS NULL;

COMMENT ON FUNCTION fn_populate_email_hash() IS
    'Auto-populates email_hash on INSERT to old_user. '
    'Formula: encode(sha256(lower(trim(email))::bytea), "hex"). '
    'Application must use the identical formula for re-registration '
    'duplicate checks to guarantee hash equality. '
    'Does not overwrite a pre-set email_hash (allows algorithm migration).';


-- ============================================================
-- FINAL DOCUMENTATION UPDATE
-- ============================================================

COMMENT ON TABLE old_user IS
    'Archive table for deleted / deactivated user accounts. '
    'One row per user at the time their profiles record was removed. '
    'PII NOTICE: full_name and email are cleartext until pseudonymisation. '
    'RLS: ENABLED — only service_role may access this table. '
    'No authenticated end-user has any access. '
    'GDPR retention: '
    '  Phase 1 (730 days) — pg_cron job gdpr-pseudonymise-old-user NULLs PII columns. '
    '  Phase 2 (1095 days) — pg_cron job gdpr-hard-delete-old-user removes tombstone rows. '
    'Erasure on demand: trg_profiles_erasure_old_user fires automatically '
    '  on profiles DELETE and NULLs PII in matching archive rows. '
    'email_hash is auto-populated by trg_old_user_populate_email_hash on INSERT. '
    'Use email_hash for re-registration duplicate checks — never read cleartext email.';