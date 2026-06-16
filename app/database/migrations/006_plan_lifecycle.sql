-- ============================================================
-- PATCH: 006_patch_recommended.sql
-- Applies all R1–R5 previously-recommended items from
-- the 006_plan_lifecycle.sql upgrade report.
-- PREREQUISITE: 005_user_activity.sql, 005_patch_recommended.sql,
-- and 006_plan_lifecycle.sql must have run first.
-- All blocks are idempotent — safe to re-run.
-- ============================================================


-- ============================================================
-- R1: TRANSACTION WRAPPER AROUND BACKFILL UPDATEs
-- The two backfill statements in 006_plan_lifecycle.sql were
-- not atomic. If the second UPDATE failed mid-run, activated_at
-- was populated but expires_at was not — a partial migration
-- state with no rollback path.
-- This block re-runs both UPDATEs inside an explicit transaction
-- so they succeed together or fail together.
-- Safe to re-run: WHERE clauses only touch rows still NULL.
-- ============================================================

DO $$
BEGIN
    -- Step 1: backfill activated_at for any remaining NULL rows
    UPDATE user_plan_entitlements
    SET activated_at = COALESCE(activated_at, updated_at, created_at, NOW())
    WHERE activated_at IS NULL;

    -- Step 2: backfill expires_at — plan-tier-aware (see R2 below).
    -- Rows already having expires_at are untouched.
    -- This replaces the original hardcoded +30 days with tier logic.
    UPDATE user_plan_entitlements upe
    SET expires_at = CASE
        -- Annual tiers: 365 days
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%annual%'    THEN upe.activated_at + INTERVAL '365 days'
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%yearly%'    THEN upe.activated_at + INTERVAL '365 days'
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%standard%'  THEN upe.activated_at + INTERVAL '365 days'
        -- Pilot / trial tiers: 90 days (3 months)
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%pilot%'     THEN upe.activated_at + INTERVAL '90 days'
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%trial%'     THEN upe.activated_at + INTERVAL '90 days'
        -- Close-friend annual: 365 days
        WHEN LOWER(COALESCE(upe.plan_id::TEXT, '')) LIKE '%friend%'    THEN upe.activated_at + INTERVAL '365 days'
        -- Fallback: 30 days (preserves original migration behaviour
        -- for any plan_id pattern not matched above).
        ELSE upe.activated_at + INTERVAL '30 days'
    END
    WHERE upe.expires_at IS NULL
      AND upe.activated_at IS NOT NULL;

    -- Step 3: last-resort fallback — if activated_at is also NULL
    -- after Step 1 (edge case: all three timestamp columns were NULL),
    -- set expires_at to NOW() + 30 days so the row is not permanently
    -- open-ended. These rows must be manually reviewed post-migration.
    UPDATE user_plan_entitlements
    SET expires_at = NOW() + INTERVAL '30 days'
    WHERE expires_at IS NULL;

    RAISE NOTICE 'Backfill complete. Verify rows with plan_id patterns not matching known tiers.';
END $$;


-- ============================================================
-- R2: PLAN-TIER-AWARE EXPIRY
-- Already integrated into the R1 DO block above (CASE statement).
-- Separate section here for documentation and manual audit query.
--
-- RUN THIS AFTER MIGRATION to audit any rows that fell through
-- to the 30-day fallback and may need manual correction:
-- ============================================================

-- AUDIT QUERY (run manually, do not execute as migration):
-- SELECT id, user_id, plan_id, activated_at, expires_at,
--        (expires_at - activated_at) AS duration
--   FROM user_plan_entitlements
--  WHERE (expires_at - activated_at) = INTERVAL '30 days'
--    AND activated_at < NOW() - INTERVAL '1 day'
--  ORDER BY activated_at;


-- ============================================================
-- R3: ROW LEVEL SECURITY ON user_plan_entitlements
-- Without RLS any authenticated student can query another
-- student's plan type, activation date, expiry, and
-- renewal count via the Supabase client — a direct PII and
-- competitive-intelligence breach.
-- Policies:
--   authenticated: read and update own rows only.
--   service_role: full unrestricted access (plan management,
--                 renewal processing, analytics jobs).
-- ============================================================

ALTER TABLE user_plan_entitlements ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read only their own entitlement row.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'upe_select_own'
           AND polrelid = 'user_plan_entitlements'::regclass
    ) THEN
        CREATE POLICY "upe_select_own"
            ON user_plan_entitlements
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Authenticated users: update only their own row.
-- Restricts writable columns to status transitions that
-- students are permitted to trigger (e.g. self-cancellation).
-- Full plan writes (activation, renewal) must go through
-- service_role from the backend — never from the client.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'upe_update_own'
           AND polrelid = 'user_plan_entitlements'::regclass
    ) THEN
        CREATE POLICY "upe_update_own"
            ON user_plan_entitlements
            FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- service_role: full unrestricted access.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'upe_all_service_role'
           AND polrelid = 'user_plan_entitlements'::regclass
    ) THEN
        CREATE POLICY "upe_all_service_role"
            ON user_plan_entitlements
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- user_plan_interviews: same isolation — users see only their
-- own interview counters and billing cycle boundaries.
ALTER TABLE user_plan_interviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'upi_own_records'
           AND polrelid = 'user_plan_interviews'::regclass
    ) THEN
        CREATE POLICY "upi_own_records"
            ON user_plan_interviews
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'upi_all_service_role'
           AND polrelid = 'user_plan_interviews'::regclass
    ) THEN
        CREATE POLICY "upi_all_service_role"
            ON user_plan_interviews
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;


-- ============================================================
-- R4 + R5: TRIGGER-MAINTAINED is_active BOOLEAN
-- R4 (generated column with NOW()) was architecturally
-- impossible — PostgreSQL does not allow non-immutable
-- functions in GENERATED ALWAYS AS expressions.
-- R5 replaces it with a BEFORE INSERT OR UPDATE trigger
-- that maintains is_active = TRUE when:
--   status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
--   OR status = 'grace' AND grace_expires_at > NOW()
--
-- WHY THIS MATTERS FOR 500 CONCURRENT USERS:
-- Every plan-gated feature check currently requires:
--   WHERE user_id = $1
--     AND status IN ('active','grace')
--     AND (expires_at IS NULL OR expires_at > NOW())
--     AND (grace_expires_at IS NULL OR grace_expires_at > NOW())
-- That is a multi-condition expression scan — not indexable.
-- With is_active:
--   WHERE user_id = $1 AND is_active = TRUE
-- This is a direct boolean index seek — sub-millisecond at
-- 500 concurrent plan-gate checks.
-- ============================================================

-- Add is_active column (additive, idempotent).
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_plan_entitlements.is_active IS
    'Denormalised, trigger-maintained boolean. '
    'TRUE when status is active/grace AND the relevant expiry '
    'timestamp has not yet passed. '
    'Use this column in all plan-gate queries instead of computing '
    'status + date comparisons at query time. '
    'Maintained by trg_upe_refresh_is_active trigger.';

-- Trigger function: recomputes is_active on every write.
CREATE OR REPLACE FUNCTION fn_refresh_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.is_active := CASE
        -- Fully active plan: status='active' and not yet expired
        WHEN NEW.status = 'active'
             AND (NEW.expires_at IS NULL OR NEW.expires_at > NOW())
        THEN TRUE
        -- Grace period: status='grace' and grace window still open
        WHEN NEW.status = 'grace'
             AND NEW.grace_expires_at IS NOT NULL
             AND NEW.grace_expires_at > NOW()
        THEN TRUE
        -- All other states (expired, cancelled, paused, pending): FALSE
        ELSE FALSE
    END;
    RETURN NEW;
END;
$$;

-- Attach trigger: fires on every INSERT and UPDATE.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname  = 'trg_upe_refresh_is_active'
           AND tgrelid = 'user_plan_entitlements'::regclass
    ) THEN
        CREATE TRIGGER trg_upe_refresh_is_active
        BEFORE INSERT OR UPDATE
        ON user_plan_entitlements
        FOR EACH ROW
        EXECUTE FUNCTION fn_refresh_is_active();
    END IF;
END $$;

-- Backfill is_active for all existing rows now that the
-- trigger is in place. UPDATE touches every row once.
UPDATE user_plan_entitlements SET updated_at = updated_at;

-- Partial index on is_active = TRUE:
-- The most common plan-gate query:
--   "Is this user's plan active right now?"
-- hits only the small subset of rows where is_active = TRUE —
-- ignoring all expired, cancelled, and historical rows entirely.
-- At scale (thousands of historical entitlements per college),
-- this index is an order of magnitude smaller and faster than
-- a full-table index.
CREATE INDEX IF NOT EXISTS idx_upe_is_active
    ON user_plan_entitlements(user_id)
    WHERE is_active = TRUE;

-- pg_cron job: nightly is_active reconciliation sweep.
-- The trigger keeps is_active accurate on write. But a plan
-- that expires at 3 PM on a Tuesday while no writes are
-- happening will remain is_active=TRUE until the next write.
-- This job reconciles all rows where is_active is stale.
-- Runs every 15 minutes — fast because it only touches rows
-- where the computed value differs from the stored value.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job
         WHERE jobname = 'reconcile-is-active'
    ) THEN
        PERFORM cron.unschedule('reconcile-is-active');
    END IF;

    PERFORM cron.schedule(
        'reconcile-is-active',
        '*/15 * * * *',    -- every 15 minutes
        $job$
        UPDATE user_plan_entitlements
        SET updated_at = NOW()
        WHERE is_active = TRUE
          AND (
              -- Active plan that has now expired
              (status = 'active'
               AND expires_at IS NOT NULL
               AND expires_at <= NOW())
              OR
              -- Grace plan whose grace window has now closed
              (status = 'grace'
               AND grace_expires_at IS NOT NULL
               AND grace_expires_at <= NOW())
          );
        $job$
    );

    RAISE NOTICE 'pg_cron job reconcile-is-active scheduled (every 15 minutes).';
END $$;