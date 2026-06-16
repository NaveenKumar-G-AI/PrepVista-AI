-- =============================================================================
-- Migration 014 — support_messages
-- Bidirectional support chat between students/admins and the PrepVista team.
--
-- SECURITY MODEL:
--   • Row-Level Security isolates each user's messages.
--     Users see only their own conversation.
--     Admins (profiles.is_admin = true) see all conversations.
--   • The is_admin_user() helper function is SECURITY DEFINER so that the
--     admin check runs with elevated privileges once per query plan, not
--     once per row — essential for performance on large message tables.
--   • sender_role is enforced by the INSERT policies:
--     users cannot insert admin messages, and vice versa.
--     The CHECK constraint limits values; the POLICY restricts who can set them.
--   • The external_id (UUID) column is exposed to the API in place of the
--     sequential BIGSERIAL id, preventing message-count enumeration by
--     authenticated users who observe their own external_id values.
--
-- ATTACHMENT DESIGN:
--   ⚠  attachment_data (Base64 TEXT) is retained for backward compatibility
--      but is STRONGLY DISCOURAGED for new features.  Storing large binary
--      data as Base64 in PostgreSQL:
--        - Inflates backup/WAL size by 33% (Base64 overhead)
--        - Loads entire blobs into memory on every row fetch
--        - Bypasses streaming — client receives the full encoded string
--        - Cannot be CDN-cached or range-requested
--      Use attachment_url (object-storage URL) for new attachments.
--      A CHECK caps attachment_data at ≈ 1.5 MB (2 MB Base64) to bound
--      the damage from existing code paths.
--
-- SOFT DELETE:
--   Messages are never hard-deleted — use is_deleted = TRUE.
--   Reasons: dispute resolution, compliance retention, admin audit trail.
--   The application filters WHERE is_deleted = FALSE for normal display.
--
-- PII / DPDP ACT 2023:
--   • content and attachment_data contain user communications (PII).
--   • On user erasure requests: set content = '[redacted]',
--     attachment_data = NULL, attachment_url = NULL — preserve the
--     row structure for audit purposes.
--   • Do NOT include this table in general analytics exports.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Admin-check helper function (used by RLS policies)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: executes with the function owner's privileges so that
-- the SELECT on profiles succeeds even if the calling role has no direct
-- access to profiles.  STABLE tells the planner the result is constant
-- within a query, allowing it to be evaluated once rather than per-row.

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT COALESCE(
        (SELECT is_admin FROM profiles WHERE id = auth.uid() LIMIT 1),
        FALSE
    );
$$;

COMMENT ON FUNCTION is_admin_user() IS
    'Returns TRUE when the calling Supabase auth user is a platform admin. '
    'SECURITY DEFINER + STABLE allows RLS policies to call this once per '
    'query plan rather than once per row.';


-- ---------------------------------------------------------------------------
-- 2. Table definition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS support_messages (

    -- BIGSERIAL for internal use (efficient joins, ordering).
    id           BIGSERIAL   PRIMARY KEY,

    -- external_id is the UUID exposed to API clients.
    -- Using a random UUID prevents message-count enumeration:
    -- a user observing their own external_ids gains no information about
    -- the total volume of support messages or the IDs of other users' messages.
    external_id  UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- The student's profile ID.  References profiles so that:
    --   ON DELETE CASCADE removes messages when the profile is deleted.
    user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Which admin replied (NULL for user-originated messages).
    -- ON DELETE SET NULL: if the admin account is deleted, messages remain
    -- but the admin attribution is cleared.
    admin_user_id UUID       REFERENCES profiles(id) ON DELETE SET NULL,

    -- Enforced by CHECK and by INSERT RLS policies:
    --   users can only insert 'user'; admins can only insert 'admin'.
    sender_role  TEXT        NOT NULL CHECK (sender_role IN ('user', 'admin')),

    -- Cross-column consistency: admin messages must have admin_user_id set;
    -- user messages must not (prevents users from spoofing admin_user_id).
    CONSTRAINT sender_role_admin_user_consistency CHECK (
        (sender_role = 'admin' AND admin_user_id IS NOT NULL)
        OR
        (sender_role = 'user'  AND admin_user_id IS NULL)
    ),

    -- Message body.  Capped at 10,000 characters — generous for support
    -- messages while preventing the 100 MB single-message DoS.
    content      TEXT        CHECK (content IS NULL OR length(content) <= 10000),

    -- ⚠ DEPRECATED PATH: Base64 image data stored directly in PostgreSQL.
    -- See migration header for why this is a serious anti-pattern.
    -- Cap at 2,097,152 bytes of Base64 ≈ 1.5 MB decoded image.
    -- New features must use attachment_url instead.
    attachment_data TEXT     CHECK (
        attachment_data IS NULL OR length(attachment_data) <= 2097152
    ),

    -- RECOMMENDED: URL of an image/file stored in object storage (S3 /
    -- Supabase Storage).  Use this for all new attachment features.
    -- The URL should be a signed short-lived URL generated server-side —
    -- never a public permanent URL for sensitive support screenshots.
    attachment_url TEXT,

    -- Every message must carry at least one piece of content.
    CONSTRAINT message_not_empty CHECK (
        content      IS NOT NULL OR
        attachment_data IS NOT NULL OR
        attachment_url   IS NOT NULL
    ),

    -- Read status tracking.  NOT NULL — no ambiguous NULL tri-state.
    is_read      BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Soft-delete: messages are never physically removed.
    -- Set is_deleted = TRUE and deleted_at = NOW() instead of DELETE.
    -- Reason: dispute resolution, compliance audit, admin review.
    is_deleted   BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT deleted_at_consistency CHECK (
        (is_deleted = TRUE  AND deleted_at IS NOT NULL) OR
        (is_deleted = FALSE AND deleted_at IS NULL)
    ),

    -- Notification deduplication: set to NOW() after an admin-notification
    -- webhook or email fires for this message.  NULL = not yet notified.
    -- Without this, polling notification jobs re-alert on every run.
    notified_at  TIMESTAMPTZ,

    -- NOT NULL on temporal columns — DEFAULT handles insertion, but NULL
    -- must be explicitly prevented to avoid application bugs that omit
    -- these fields producing invisible NULL timestamps.
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 3. Column documentation
-- ---------------------------------------------------------------------------

COMMENT ON TABLE support_messages IS
    'Bidirectional support chat between users and PrepVista admins. '
    'Never hard-delete rows — use is_deleted = TRUE. '
    'On user erasure requests: redact content and clear attachments, '
    'keep the row for audit purposes. '
    'Contains PII (message content) — exclude from analytics exports. '
    'Client SDK access governed by RLS (users see own messages only).';

COMMENT ON COLUMN support_messages.external_id IS
    'UUID exposed to API clients instead of the sequential BIGSERIAL id. '
    'Prevents message-count enumeration by authenticated users.';

COMMENT ON COLUMN support_messages.admin_user_id IS
    'Which admin sent this message (NULL for user messages). '
    'Enforced by sender_role_admin_user_consistency constraint. '
    'ON DELETE SET NULL preserves the message if the admin account is deleted.';

COMMENT ON COLUMN support_messages.attachment_data IS
    'DEPRECATED — Base64-encoded image stored directly in PostgreSQL. '
    'New features must use attachment_url (object-storage URL) instead. '
    'Capped at 2 MB Base64 by CHECK constraint. '
    'See migration 014 header for the full anti-pattern explanation.';

COMMENT ON COLUMN support_messages.attachment_url IS
    'URL of an attachment stored in object storage (Supabase Storage / S3). '
    'Must be a signed, short-lived URL generated server-side — '
    'never a permanent public URL for sensitive support screenshots.';

COMMENT ON COLUMN support_messages.notified_at IS
    'Timestamp when the admin-notification job processed this message. '
    'NULL = not yet notified. Set by the notification service after sending. '
    'Used to prevent duplicate alerts on repeated job runs.';

COMMENT ON COLUMN support_messages.is_deleted IS
    'Soft-delete flag. Use this instead of DELETE. '
    'Application filters WHERE is_deleted = FALSE for normal display. '
    'Deleted rows remain for dispute resolution and compliance.';


-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users see only their own conversation; admins see all conversations.
CREATE POLICY support_messages_select ON support_messages
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR is_admin_user()
    );

-- Users can insert their own messages only, and cannot set sender_role = 'admin'.
-- The WITH CHECK enforces both conditions at the DB layer — bypassing the
-- application API and sending a crafted Supabase SDK insert still fails here.
CREATE POLICY support_messages_user_insert ON support_messages
    FOR INSERT
    WITH CHECK (
        user_id     = auth.uid()
        AND sender_role = 'user'
        AND admin_user_id IS NULL  -- users cannot set admin attribution
    );

-- Admins can insert admin-side messages with any user_id.
CREATE POLICY support_messages_admin_insert ON support_messages
    FOR INSERT
    WITH CHECK (
        is_admin_user()
        AND sender_role    = 'admin'
        AND admin_user_id  = auth.uid()  -- admin must attribute to themselves
    );

-- Only admins can mark messages as read or soft-delete them.
-- Users cannot alter is_read or is_deleted — prevents a user from hiding
-- messages from the admin view or marking admin messages as unread.
CREATE POLICY support_messages_admin_update ON support_messages
    FOR UPDATE
    USING (is_admin_user())
    WITH CHECK (is_admin_user());


-- ---------------------------------------------------------------------------
-- 5. Permission hardening
-- ---------------------------------------------------------------------------

REVOKE ALL ON support_messages FROM PUBLIC;
REVOKE ALL ON support_messages FROM anon;
-- authenticated role accesses data only via RLS policies above.
GRANT SELECT, INSERT ON support_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON support_messages TO service_role;


-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------

-- Per-user conversation: fetch all messages for a user, oldest first.
-- Primary use: loading the chat history panel.
CREATE INDEX IF NOT EXISTS idx_sm_user_created
    ON support_messages (user_id, created_at ASC)
    WHERE is_deleted = FALSE;

-- Admin inbox: all unread messages across all users, newest first.
-- Partial — only unread, non-deleted messages.  The admin queue is almost
-- always a tiny fraction of total messages; a full-table index would be
-- orders of magnitude larger for the same query performance.
CREATE INDEX IF NOT EXISTS idx_sm_unread_queue
    ON support_messages (created_at DESC)
    WHERE is_read = FALSE AND is_deleted = FALSE;

-- Notification job: find messages not yet notified.
-- Partial — only rows where notified_at is still NULL.
CREATE INDEX IF NOT EXISTS idx_sm_unnotified
    ON support_messages (created_at ASC)
    WHERE notified_at IS NULL AND sender_role = 'user' AND is_deleted = FALSE;

-- External ID lookup: API routes use external_id, not the internal BIGSERIAL.
CREATE INDEX IF NOT EXISTS idx_sm_external_id
    ON support_messages (external_id);