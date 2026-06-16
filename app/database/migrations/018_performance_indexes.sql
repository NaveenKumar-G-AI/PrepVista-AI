-- =============================================================================
-- Migration 018: Performance Indexes
-- =============================================================================
-- Purpose:
--   Adds covering indexes for high-frequency query patterns identified during
--   the production performance audit. All indexes use IF NOT EXISTS for
--   idempotent re-runs.
--
-- Safety:
--   Pure additive — no tables or columns are modified.
--   All CREATE INDEX statements are safe to re-run.
-- =============================================================================

-- Covering index for profile email lookups (auth, account-status, admin queries)
-- Supports: WHERE LOWER(email) = LOWER($1) in auth.py, dependencies.py
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
    ON profiles (LOWER(email));

-- Partial index for active interview sessions (terminate, proctoring, active-session checks)
-- Supports: WHERE state = 'ACTIVE' AND user_id = $1
CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON interview_sessions (user_id, access_token)
    WHERE state = 'ACTIVE';

-- Covering index for finished session stats (dashboard AVG, session history)
-- Supports: WHERE user_id = $1 AND state = 'FINISHED' ORDER BY finished_at
CREATE INDEX IF NOT EXISTS idx_sessions_finished_user
    ON interview_sessions (user_id, finished_at DESC)
    WHERE state = 'FINISHED';

-- Partial index for finished session score aggregation (dashboard average)
-- Supports: AVG(final_score) WHERE user_id = $1 AND state = 'FINISHED'
CREATE INDEX IF NOT EXISTS idx_sessions_finished_score
    ON interview_sessions (user_id, final_score)
    WHERE state = 'FINISHED' AND final_score IS NOT NULL;

-- Index for presence tracking (user_activity COUNT with window filter)
-- Supports: WHERE last_seen_at >= NOW() - interval
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
    ON profiles (last_seen_at)
    WHERE last_seen_at IS NOT NULL;

-- Index for active plan entitlement lookups (quota enforcement, plan sync)
-- Supports: WHERE user_id = $1 AND plan = $2 AND status = 'active'
CREATE INDEX IF NOT EXISTS idx_entitlements_active_plan
    ON user_plan_entitlements (user_id, plan)
    WHERE status = 'active';

-- Index for user_plan_interviews cycle lookup (quota counting)
-- Supports: WHERE user_id = $1 AND plan = $2 AND current_cycle_start >= $3
CREATE INDEX IF NOT EXISTS idx_plan_interviews_cycle
    ON user_plan_interviews (user_id, plan, current_cycle_start);

-- Index for reports by session (report lookup, PDF generation)
-- Supports: WHERE session_id = $1
-- (reports.session_id already has UNIQUE constraint, but adding for clarity)
CREATE INDEX IF NOT EXISTS idx_reports_user
    ON reports (user_id, created_at DESC);

-- Index for support messages per user (support chat, archive cleanup)
CREATE INDEX IF NOT EXISTS idx_support_messages_user_created
    ON support_messages (user_id, created_at DESC);

-- Index for skill_scores session lookup (analytics sync check)
CREATE INDEX IF NOT EXISTS idx_skill_scores_session
    ON skill_scores (session_id);
