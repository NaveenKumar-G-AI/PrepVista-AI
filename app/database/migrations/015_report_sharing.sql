-- =============================================================================
-- Migration 015 — report sharing: share_token + audit columns
-- Adds public shareable report links to interview_sessions.
--
-- SECURITY MODEL — READ BEFORE IMPLEMENTING THE PUBLIC ENDPOINT:
--
--   Token requirements (enforced by DB constraints below):
--     • Minimum 32 URL-safe characters — provides ≥ 190 bits of entropy
--       when generated with a CSPRNG (crypto.randomBytes(32) or
--       secrets.token_urlsafe(32)).  This makes exhaustive enumeration
--       computationally infeasible even at 1,000,000 attempts/second.
--     • Maximum 128 characters — bounds the unique index entry size.
--     • URL-safe characters only (A-Za-z0-9_-) — prevents log injection,
--       path traversal, and URL-parsing edge cases in the public endpoint.
--
--   Public endpoint requirements (application layer — not enforced here):
--     1. Rate-limit token lookups aggressively (recommend: 10 req/min per IP).
--        Without rate limiting, the entropy advantage is negated by volume.
--     2. Return HTTP 404 for both "invalid token" AND "expired token" —
--        never distinguish between the two.  Different responses allow
--        an attacker to determine whether a token existed before expiry.
--     3. Return only the public-safe subset of the session:
--        questions, scores, feedback — never user PII beyond candidate_name.
--     4. Log share_view_count increments asynchronously (via a background job
--        or queue) if the session is high-traffic, to avoid write contention
--        on a hot interview_sessions row.
--
--   GDPR / DPDP Act 2023:
--     • A shared report is personal data made public.  shared_at records
--       when the user gave consent to share.
--     • share_expires_at enforces a retention limit on public exposure.
--       Recommend defaulting to 90 days from shared_at at the application layer.
--     • On user erasure requests: SET share_token = NULL, shared_at = NULL,
--       share_expires_at = NULL to revoke all public access before redacting content.
--
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add columns (all IF NOT EXISTS for idempotency)
-- ---------------------------------------------------------------------------

-- The public share token.  UNIQUE enforced by PostgreSQL (NULLs are not
-- considered equal — multiple sessions may have share_token = NULL).
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS share_token       TEXT        UNIQUE;

-- Audit: when sharing was activated.  Set by the application at the same
-- time as share_token.  Used for GDPR consent timestamp and share-age
-- calculations (e.g. "shared 3 days ago").
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS shared_at         TIMESTAMPTZ;

-- Optional expiry for time-limited sharing.  NULL = never expires (permanent link).
-- Recommend: application sets this to shared_at + INTERVAL '90 days' by default,
-- giving students a reasonable sharing window without permanent public exposure.
-- The public endpoint must treat expired tokens identically to missing tokens
-- (HTTP 404 — never reveal which condition applies).
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS share_expires_at  TIMESTAMPTZ;

-- Running count of public accesses via the share link.
-- Used for security monitoring: a sudden spike in share_view_count on a
-- session whose owner has not opened it suggests a brute-force probe is
-- working through the token space.
-- Recommend: alert when share_view_count exceeds 500 on a single session.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS share_view_count  INT         NOT NULL DEFAULT 0;

-- Hard cap on tracked views per session.  Beyond this threshold the counter
-- saturates rather than growing without bound.  Prevents: (a) integer
-- overflow on viral links; (b) unbounded row-lock contention if a link is
-- hammered by a bot (once the cap is reached, UPDATE is a no-op and the DB
-- engine may skip the write).  1 million views is well above any legitimate
-- use; reaching it almost certainly indicates automated abuse.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS max_share_views   INT         NOT NULL DEFAULT 1000000;


-- ---------------------------------------------------------------------------
-- 2. Constraints  (DO blocks for safe idempotent execution)
-- ---------------------------------------------------------------------------

DO $$
BEGIN

    -- Token entropy: minimum 32 URL-safe chars ≈ 190+ bits of entropy.
    -- Rejects trivially weak tokens ("abc", UUIDs without dashes removed
    -- at wrong length, etc.) at the DB layer regardless of which application
    -- code path generated the token.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_token_entropy'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_token_entropy
            CHECK (
                share_token IS NULL
                OR (length(share_token) BETWEEN 32 AND 128)
            );
    END IF;

    -- Token format: URL-safe characters only (A-Za-z0-9, hyphen, underscore).
    -- Prevents: log injection (newlines), HTML injection (<script>),
    -- null-byte attacks (\x00), and URL parsing edge cases (?#&= chars).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_token_format'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_token_format
            CHECK (
                share_token IS NULL
                OR share_token ~ '^[A-Za-z0-9_\-]+$'
            );
    END IF;

    -- Temporal consistency: if a token is set, shared_at must also be set
    -- (captures the consent timestamp).  Prevents the audit gap where a
    -- token exists but the sharing date is unknown.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_token_requires_shared_at'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_token_requires_shared_at
            CHECK (
                (share_token IS NULL)
                OR (share_token IS NOT NULL AND shared_at IS NOT NULL)
            );
    END IF;

    -- Expiry must be after sharing activation.
    -- Prevents a clock bug that sets share_expires_at in the past,
    -- immediately expiring the link the moment it is created.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_expires_after_shared_at'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_expires_after_shared_at
            CHECK (
                share_expires_at IS NULL
                OR shared_at      IS NULL
                OR share_expires_at > shared_at
            );
    END IF;

    -- View count non-negative (prevents decrement bugs corrupting monitoring).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_view_count_non_negative'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_view_count_non_negative
            CHECK (share_view_count >= 0);
    END IF;

    -- View count must not exceed the session's own cap.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_share_view_count_within_cap'
          AND conrelid = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_share_view_count_within_cap
            CHECK (share_view_count <= max_share_views);
    END IF;

END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Column documentation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN interview_sessions.share_token IS
    'Cryptographically random URL-safe token for public report sharing. '
    'Must be generated with a CSPRNG: crypto.randomBytes(32) base64url or '
    'Python secrets.token_urlsafe(32). '
    'Constraints enforce: 32–128 chars, A-Za-z0-9_- only. '
    'NULL = report is private. SET to NULL to immediately revoke public access. '
    'On user erasure: SET share_token = NULL before redacting session content.';

COMMENT ON COLUMN interview_sessions.shared_at IS
    'UTC timestamp when the user activated public sharing. '
    'Acts as the GDPR/DPDP consent timestamp for public data exposure. '
    'Must be set in the same transaction as share_token. '
    'NULL when share_token is NULL.';

COMMENT ON COLUMN interview_sessions.share_expires_at IS
    'Optional UTC timestamp after which the public link stops working. '
    'NULL = never expires (permanent link — use with caution). '
    'Recommend: default to shared_at + 90 days at the application layer. '
    'Public endpoint must return HTTP 404 for expired tokens — never '
    'distinguish "invalid token" from "expired token" in the response.';

COMMENT ON COLUMN interview_sessions.share_view_count IS
    'Running count of accesses via the public share link. '
    'Saturates at max_share_views — no further increments beyond the cap. '
    'Alert threshold: > 500 views on a session whose owner has not opened '
    'it recently likely indicates automated token enumeration.';

COMMENT ON COLUMN interview_sessions.max_share_views IS
    'Hard cap for share_view_count. Default 1,000,000. '
    'Once reached, the UPDATE increment in the public endpoint becomes a '
    'no-op (share_view_count <= max_share_views constraint prevents it). '
    'Prevents integer overflow and bounds write contention on hot links.';


-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: public endpoint resolves token → session.
-- Partial: only sessions with an active share token are indexed.
-- Covers the WHERE share_token IS NOT NULL filter implicitly.
CREATE INDEX IF NOT EXISTS idx_sessions_share_token
    ON interview_sessions (share_token)
    WHERE share_token IS NOT NULL;

-- Expiry cleanup job: find and deactivate expired share links.
-- SELECT id FROM interview_sessions
--     WHERE share_expires_at < NOW() AND share_token IS NOT NULL
-- Runs periodically (cron, pg_cron, or application startup).
CREATE INDEX IF NOT EXISTS idx_sessions_share_expires
    ON interview_sessions (share_expires_at)
    WHERE share_expires_at IS NOT NULL AND share_token IS NOT NULL;

-- Security monitoring: find sessions with anomalously high view counts.
-- SELECT id, share_view_count FROM interview_sessions
--     WHERE share_view_count > 500 ORDER BY share_view_count DESC
CREATE INDEX IF NOT EXISTS idx_sessions_share_view_count
    ON interview_sessions (share_view_count DESC)
    WHERE share_view_count > 500;