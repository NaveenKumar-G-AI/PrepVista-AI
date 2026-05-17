-- =============================================================================
-- Migration 013 — manual_signup_verification_codes
-- Short-lived OTP table for email verification during manual signup.
--
-- SECURITY MODEL:
--   • code_hash stores a cryptographic hash of the OTP (never plaintext).
--     Expected algorithm: SHA-256 hex (64 chars) or bcrypt (≥60 chars).
--     The CHECK on code_hash length rejects plaintext codes at the DB layer.
--   • failed_attempts is incremented by the application on every wrong code.
--     When it reaches the lockout threshold (application-defined, recommend 5),
--     locked_until is set to NOW() + interval '15 minutes'.
--     The application MUST check locked_until > NOW() before accepting attempts.
--   • resend_count is incremented on every resend.  When it reaches the resend
--     cap (recommend 3 per code lifetime), new resend requests are rejected
--     until the code expires.  Prevents email-flood abuse of the resend endpoint.
--   • Rows are owned by email_normalized (one active code per email at a time).
--     A new signup request overwrites the existing row, invalidating the old code.
--   • Rows MUST be deleted by the application when:
--       (a) verification succeeds, or
--       (b) expires_at < NOW() (cleaned up by scheduled job).
--     The index on expires_at supports efficient expiry cleanup.
--
-- PII / DPDP ACT 2023:
--   • email and email_normalized are personal data.
--   • Rows auto-expire (expires_at) and must be deleted on successful
--     verification — do not retain verification codes after they are used.
--   • This table must be excluded from analytics exports and BI tools.
--
-- ACCESS:
--   • RLS enabled — Supabase client SDK (anon/authenticated) has zero access.
--   • Backend service role has SELECT, INSERT, UPDATE, DELETE.
--   • No direct client-side verification flow — all code-checking happens
--     server-side in the backend API.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Table definition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS manual_signup_verification_codes (

    -- Normalized email as primary key ensures exactly one active code per
    -- email address.  Must be lowercase + trimmed — enforced by constraint.
    email_normalized TEXT PRIMARY KEY
        CHECK (email_normalized = LOWER(TRIM(email_normalized))),

    -- Original-case email for display in the verification email body.
    -- PII — deleted when the row is deleted (expiry or successful verify).
    email            TEXT        NOT NULL,

    -- Cryptographic hash of the OTP.  NEVER store plaintext codes.
    -- Expected: SHA-256 hex (64 chars) or bcrypt (≥60 chars).
    -- CHECK rejects any value shorter than 32 chars — a plaintext 6-digit
    -- OTP ("123456") or UUID would fail this check, catching the bug where
    -- a developer accidentally stores an unhashed code.
    code_hash        TEXT        NOT NULL
        CHECK (length(code_hash) >= 32),

    -- Code lifetime.  Must be strictly after created_at — a clock bug that
    -- produces an already-expired timestamp is rejected at the DB layer.
    expires_at       TIMESTAMPTZ NOT NULL
        CHECK (expires_at > created_at),

    last_sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- How many times this code has been sent to the email address.
    -- Application should cap resends (recommend: 3 per code lifetime).
    -- The CHECK prevents overflow from application bugs and caps the
    -- maximum observable resend count at a sentinel value (99).
    resend_count     INT         NOT NULL DEFAULT 0
        CHECK (resend_count >= 0)
        CHECK (resend_count <= 99),

    -- Incremented on every failed verification attempt.
    -- The CHECK >= 0 prevents a decrement bug from producing a negative count
    -- that would make the lockout condition (>= threshold) unreachable.
    failed_attempts  INT         NOT NULL DEFAULT 0
        CHECK (failed_attempts >= 0)
        CHECK (failed_attempts <= 20),  -- sentinel cap; application locks at ≤5

    -- Timestamp until which further verification attempts are refused.
    -- NULL = not locked.  Set by the application when failed_attempts
    -- reaches the lockout threshold.  Time-based lockout automatically
    -- expires without needing a separate unlock job or manual intervention.
    locked_until     TIMESTAMPTZ DEFAULT NULL,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Maintained by trigger — reflects when failed_attempts, resend_count,
    -- or locked_until last changed.  Used by security monitoring to detect
    -- accounts under active brute-force attack.
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 2. Column documentation
-- ---------------------------------------------------------------------------

COMMENT ON TABLE manual_signup_verification_codes IS
    'Short-lived OTP store for manual email signup verification. '
    'One row per email address (email_normalized PK). '
    'Rows MUST be deleted immediately on successful verification. '
    'Expired rows cleaned by scheduled job using idx_msvc_expires_at. '
    'Contains PII (email) — exclude from analytics/BI exports. '
    'All access via backend service role only (RLS blocks client SDK).';

COMMENT ON COLUMN manual_signup_verification_codes.code_hash IS
    'Cryptographic hash of the OTP. '
    'Required algorithm: SHA-256 hex (64 chars) or bcrypt (≥60 chars). '
    'The CHECK (length >= 32) rejects plaintext codes at the DB layer. '
    'NEVER store the raw OTP — treat this column like a password hash.';

COMMENT ON COLUMN manual_signup_verification_codes.email IS
    'PII — original-case email for display in the verification email body. '
    'Deleted when the verification row is deleted. '
    'Never log, export to analytics, or retain after verification.';

COMMENT ON COLUMN manual_signup_verification_codes.failed_attempts IS
    'Incremented by the application on every wrong-code submission. '
    'Application must lock the row (set locked_until) when this reaches '
    'the lockout threshold (recommend: 5 attempts). '
    'Reset to 0 on successful verification before row deletion.';

COMMENT ON COLUMN manual_signup_verification_codes.locked_until IS
    'NULL = not locked. '
    'Set to NOW() + interval (recommend 15 min) when failed_attempts '
    'reaches the lockout threshold. '
    'Application MUST check locked_until > NOW() before accepting attempts. '
    'Time-based — automatically unlocks without manual intervention.';

COMMENT ON COLUMN manual_signup_verification_codes.resend_count IS
    'How many times the OTP has been re-sent for this row. '
    'Application must refuse resend requests when resend_count >= cap '
    '(recommend: 3) to prevent email-flood abuse of the resend endpoint.';


-- ---------------------------------------------------------------------------
-- 3. updated_at auto-maintenance trigger
-- ---------------------------------------------------------------------------
-- Without this trigger, updated_at reflects only the INSERT time.
-- The column must reflect the most recent failed_attempt increment or
-- locked_until change so that security monitoring can detect active
-- brute-force patterns ("this row was updated 50 times in 2 minutes").

CREATE OR REPLACE FUNCTION _set_updated_at_msvc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_msvc_updated_at
    ON manual_signup_verification_codes;

CREATE TRIGGER trg_msvc_updated_at
    BEFORE UPDATE ON manual_signup_verification_codes
    FOR EACH ROW
    EXECUTE FUNCTION _set_updated_at_msvc();


-- ---------------------------------------------------------------------------
-- 4. Row-Level Security — block all client SDK access
-- ---------------------------------------------------------------------------
-- Verification codes are authentication credentials.
-- A student who can query this table via the Supabase SDK can:
--   (a) See which email addresses have active verification attempts.
--   (b) Enumerate failed_attempts to time brute-force attacks.
--   (c) Read locked_until to know when a lockout expires.
-- RLS with no permissive policy = complete block for anon/authenticated.
-- Backend service role bypasses RLS by design.

ALTER TABLE manual_signup_verification_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON manual_signup_verification_codes FROM PUBLIC;
REVOKE ALL ON manual_signup_verification_codes FROM anon;
REVOKE ALL ON manual_signup_verification_codes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON manual_signup_verification_codes TO service_role;


-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

-- Expiry cleanup: DELETE FROM manual_signup_verification_codes
--     WHERE expires_at < NOW()
-- Run by a scheduled job (cron, pg_cron, or application startup).
CREATE INDEX IF NOT EXISTS idx_msvc_expires_at
    ON manual_signup_verification_codes (expires_at);

-- Locked accounts: quickly find rows currently under lockout for monitoring.
-- Partial — only indexes rows that are actively locked (locked_until IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_msvc_locked
    ON manual_signup_verification_codes (locked_until)
    WHERE locked_until IS NOT NULL;

-- High failed-attempt rows: quickly surface accounts under active brute-force.
-- Partial — only rows with meaningful failure counts (> 2).
CREATE INDEX IF NOT EXISTS idx_msvc_high_failed_attempts
    ON manual_signup_verification_codes (failed_attempts DESC)
    WHERE failed_attempts > 2;