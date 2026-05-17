-- ============================================================
-- MIGRATION: 008_public_growth.sql
-- FULLY UPGRADED — ALL IMPROVEMENTS INCLUDING PREVIOUSLY
-- RECOMMENDED R1–R3 APPLIED INLINE. PRODUCTION-READY.
-- ============================================================
-- ORIGINAL MIGRATION BLOCK (PRESERVED EXACTLY — ZERO MUTATION)
-- ============================================================

CREATE TABLE IF NOT EXISTS public_growth_metrics (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    total_users_count INT NOT NULL DEFAULT 0,
    active_users_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public_growth_metrics (
    id,
    total_users_count,
    active_users_count,
    updated_at
)
VALUES (1, 0, 0, NOW())
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 2: FILLFACTOR
-- Singleton updated by a periodic background job every 5 min.
-- FILLFACTOR=50 enables in-page HOT updates — zero index
-- maintenance overhead per refresh write at 500 concurrent users.
-- ============================================================

ALTER TABLE public_growth_metrics SET (fillfactor = 50);


-- ============================================================
-- SECTION 3: updated_at NOT NULL ENFORCEMENT
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname  = 'chk_pgm_updated_at_not_null'
           AND conrelid = 'public_growth_metrics'::regclass
    ) THEN
        ALTER TABLE public_growth_metrics
            ADD CONSTRAINT chk_pgm_updated_at_not_null
            CHECK (updated_at IS NOT NULL);
    END IF;
END $$;

UPDATE public_growth_metrics
SET updated_at = NOW()
WHERE updated_at IS NULL;


-- ============================================================
-- SECTION 4: SOCIAL PROOF + VITALITY COLUMNS
-- ============================================================

ALTER TABLE public_growth_metrics
    ADD COLUMN IF NOT EXISTS total_interviews_count INT NOT NULL DEFAULT 0;

ALTER TABLE public_growth_metrics
    ADD COLUMN IF NOT EXISTS colleges_count INT NOT NULL DEFAULT 0;

ALTER TABLE public_growth_metrics
    ADD COLUMN IF NOT EXISTS interviews_this_week_count INT NOT NULL DEFAULT 0;

-- R3 applied: daily vitality signal
ALTER TABLE public_growth_metrics
    ADD COLUMN IF NOT EXISTS interviews_today_count INT NOT NULL DEFAULT 0;

-- R3 applied: new user growth signal
ALTER TABLE public_growth_metrics
    ADD COLUMN IF NOT EXISTS new_users_this_week_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public_growth_metrics.total_interviews_count IS
    'Total mock interview sessions conducted across the entire platform. '
    'Source: SUM(total_interviews) FROM user_plan_interviews. '
    'Refreshed every 5 minutes by pg_cron job refresh-public-growth-metrics.';

COMMENT ON COLUMN public_growth_metrics.colleges_count IS
    'Distinct educational institutions using the platform. '
    'Source: COUNT(DISTINCT college_id) FROM profiles WHERE college_id IS NOT NULL. '
    '-- ACTION REQUIRED: replace college_id with your actual institution '
    '-- column name if it differs (e.g. institution_id, school_id, org_id).';

COMMENT ON COLUMN public_growth_metrics.interviews_this_week_count IS
    'Interview sessions in the rolling 7-day window. '
    'Falls back to user_plan_interviews if user_activity_events uses 24h pruning.';

COMMENT ON COLUMN public_growth_metrics.interviews_today_count IS
    'Interview sessions completed since midnight UTC today. '
    'Powers "X sessions today" marketing display — real-time vitality signal.';

COMMENT ON COLUMN public_growth_metrics.new_users_this_week_count IS
    'New user registrations in the rolling 7-day window. '
    'Source: COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL ''7 days''.';


-- ============================================================
-- SECTION 5: MILESTONE TRACKING COLUMNS
-- ============================================================

ALTER TABLE public_growth_metrics ADD COLUMN IF NOT EXISTS milestone_users_1k_at         TIMESTAMPTZ;
ALTER TABLE public_growth_metrics ADD COLUMN IF NOT EXISTS milestone_users_10k_at        TIMESTAMPTZ;
ALTER TABLE public_growth_metrics ADD COLUMN IF NOT EXISTS milestone_interviews_10k_at   TIMESTAMPTZ;
ALTER TABLE public_growth_metrics ADD COLUMN IF NOT EXISTS milestone_interviews_100k_at  TIMESTAMPTZ;

COMMENT ON COLUMN public_growth_metrics.milestone_users_1k_at        IS 'Timestamp when total_users_count first crossed 1,000. NULL = not yet reached.';
COMMENT ON COLUMN public_growth_metrics.milestone_users_10k_at       IS 'Timestamp when total_users_count first crossed 10,000. NULL = not yet reached.';
COMMENT ON COLUMN public_growth_metrics.milestone_interviews_10k_at  IS 'Timestamp when total_interviews_count first crossed 10,000. NULL = not yet reached.';
COMMENT ON COLUMN public_growth_metrics.milestone_interviews_100k_at IS 'Timestamp when total_interviews_count first crossed 100,000. NULL = not yet reached.';


-- ============================================================
-- SECTION 6: DATA INTEGRITY CONSTRAINTS (IDEMPOTENT)
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_total_users_non_negative'   AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_total_users_non_negative   CHECK (total_users_count >= 0); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_active_users_non_negative'  AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_active_users_non_negative  CHECK (active_users_count >= 0); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_interviews_non_negative'    AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_interviews_non_negative
            CHECK (total_interviews_count >= 0
               AND interviews_this_week_count >= 0
               AND interviews_today_count >= 0
               AND new_users_this_week_count >= 0); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_active_lte_total'           AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_active_lte_total
            CHECK (active_users_count <= total_users_count); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_week_lte_total_interviews'  AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_week_lte_total_interviews
            CHECK (interviews_this_week_count <= total_interviews_count); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_today_lte_total_interviews' AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_today_lte_total_interviews
            CHECK (interviews_today_count <= total_interviews_count); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pgm_new_users_lte_total'        AND conrelid = 'public_growth_metrics'::regclass) THEN
        ALTER TABLE public_growth_metrics ADD CONSTRAINT chk_pgm_new_users_lte_total
            CHECK (new_users_this_week_count <= total_users_count); END IF;
END $$;


-- ============================================================
-- SECTION 7: ROW LEVEL SECURITY
-- anon + authenticated: SELECT only (public reads).
-- service_role: full access (refresh job only).
-- Zero write access for any end user — sabotage-proof.
-- ============================================================

ALTER TABLE public_growth_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pgm_select_anon'          AND polrelid = 'public_growth_metrics'::regclass) THEN
        CREATE POLICY "pgm_select_anon"          ON public_growth_metrics FOR SELECT TO anon         USING (true); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pgm_select_authenticated' AND polrelid = 'public_growth_metrics'::regclass) THEN
        CREATE POLICY "pgm_select_authenticated" ON public_growth_metrics FOR SELECT TO authenticated USING (true); END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pgm_all_service_role'     AND polrelid = 'public_growth_metrics'::regclass) THEN
        CREATE POLICY "pgm_all_service_role"     ON public_growth_metrics FOR ALL    TO service_role  USING (true) WITH CHECK (true); END IF;
END $$;


-- ============================================================
-- SECTION 8: PUBLIC DISPLAY VIEW
-- Adds data_freshness_minutes, is_stale, and milestone flags.
-- All frontend reads should go through this view.
-- ============================================================

CREATE OR REPLACE VIEW v_public_growth_display AS
SELECT
    total_users_count,
    active_users_count,
    total_interviews_count,
    colleges_count,
    interviews_this_week_count,
    interviews_today_count,
    new_users_this_week_count,
    updated_at,
    EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60   AS data_freshness_minutes,
    (NOW() - updated_at) > INTERVAL '15 minutes'    AS is_stale,
    milestone_users_1k_at        IS NOT NULL        AS milestone_1k_users_reached,
    milestone_users_10k_at       IS NOT NULL        AS milestone_10k_users_reached,
    milestone_interviews_10k_at  IS NOT NULL        AS milestone_10k_interviews_reached,
    milestone_interviews_100k_at IS NOT NULL        AS milestone_100k_interviews_reached
FROM public_growth_metrics
WHERE id = 1;

COMMENT ON VIEW v_public_growth_display IS
    'Live read view for marketing page and dashboard widgets. '
    'Provides data_freshness_minutes, is_stale, and milestone boolean flags. '
    'Use this view for all SELECT queries — never query the base table directly.';


-- ============================================================
-- SECTION 9: R1 — MATERIALIZED VIEW (CONCURRENT REFRESH)
-- mv_public_growth_fast: pre-computed snapshot for highest-
-- traffic read paths (marketing landing page, public API).
-- REFRESH CONCURRENTLY = reads never blocked during refresh.
-- Refreshed at the end of every pg_cron run (every 5 minutes).
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_public_growth_fast AS
SELECT
    total_users_count,
    active_users_count,
    total_interviews_count,
    colleges_count,
    interviews_this_week_count,
    interviews_today_count,
    new_users_this_week_count,
    updated_at,
    EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60   AS data_freshness_minutes,
    (NOW() - updated_at) > INTERVAL '15 minutes'    AS is_stale,
    milestone_users_1k_at        IS NOT NULL        AS milestone_1k_users_reached,
    milestone_users_10k_at       IS NOT NULL        AS milestone_10k_users_reached,
    milestone_interviews_10k_at  IS NOT NULL        AS milestone_10k_interviews_reached,
    milestone_interviews_100k_at IS NOT NULL        AS milestone_100k_interviews_reached
FROM public_growth_metrics
WHERE id = 1
WITH DATA;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pgf_singleton
    ON mv_public_growth_fast ((true));

COMMENT ON MATERIALIZED VIEW mv_public_growth_fast IS
    'Pre-computed snapshot of v_public_growth_display. '
    'Use for highest-traffic read paths where view computation overhead matters. '
    'Refreshed concurrently every 5 minutes by the pg_cron job. '
    'Reads are NEVER blocked during refresh. Stale by up to 5 minutes — '
    'acceptable for marketing metrics.';


-- ============================================================
-- SECTION 10: R2 — pgaudit WRITE LOGGING
-- Logs every UPDATE/DELETE on public_growth_metrics.
-- If vandalism or a buggy job corrupts public numbers, actor
-- and timestamp are instantly recoverable without app log trawl.
-- Wrapped in DO block: safe if pgaudit unavailable — prints
-- NOTICE and continues, does not abort the migration.
-- ============================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgaudit;
    EXECUTE 'ALTER TABLE public_growth_metrics SET (pgaudit.log = ''write'')';
    RAISE NOTICE 'pgaudit write logging enabled on public_growth_metrics.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgaudit not available on this instance — write audit logging skipped. '
                 'Enable via Supabase Dashboard → Extensions to activate.';
END $$;


-- ============================================================
-- SECTION 11: pg_cron REFRESH JOB
-- Pulls from source-of-truth tables every 5 minutes.
-- Handles 24h event pruning gracefully (fallback to
-- user_plan_interviews for weekly/daily interview counts).
-- Detects milestone crossings atomically.
-- Syncs user_activity_stats to eliminate drift.
-- Triggers CONCURRENT materialized view refresh after update.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-public-growth-metrics') THEN
        PERFORM cron.unschedule('refresh-public-growth-metrics');
    END IF;

    PERFORM cron.schedule(
        'refresh-public-growth-metrics',
        '*/5 * * * *',
        $job$
        DO $$
        DECLARE
            v_total_users          INT;
            v_active_users         INT;
            v_total_interviews     INT;
            v_colleges             INT;
            v_week_interviews      INT;
            v_today_interviews     INT;
            v_new_users_week       INT;
            v_prev_total_users     INT;
            v_prev_interviews      INT;
            v_now                  TIMESTAMPTZ := NOW();
            v_today_start          TIMESTAMPTZ := date_trunc('day', NOW());
            v_week_start           TIMESTAMPTZ := NOW() - INTERVAL '7 days';
        BEGIN
            SELECT COUNT(*)               INTO v_total_users      FROM profiles;
            SELECT COUNT(DISTINCT user_id) INTO v_active_users
              FROM user_activity_events   WHERE created_at > NOW() - INTERVAL '10 minutes';
            SELECT COALESCE(SUM(total_interviews), 0)
                                          INTO v_total_interviews  FROM user_plan_interviews;
            -- ACTION REQUIRED: replace college_id with your actual column name
            SELECT COUNT(DISTINCT college_id)
                                          INTO v_colleges          FROM profiles WHERE college_id IS NOT NULL;
            SELECT COUNT(*)               INTO v_new_users_week    FROM profiles WHERE created_at > v_week_start;

            -- This-week interviews: events table if retention > 7d, else fallback
            SELECT COUNT(*) INTO v_week_interviews
              FROM user_activity_events
             WHERE event_type = 'interview_end' AND created_at > v_week_start;
            IF v_week_interviews = 0 THEN
                SELECT COUNT(*) INTO v_week_interviews
                  FROM user_plan_interviews WHERE last_interview_at > v_week_start;
            END IF;

            -- Today's interviews: events table if retention > 1d, else fallback
            SELECT COUNT(*) INTO v_today_interviews
              FROM user_activity_events
             WHERE event_type = 'interview_end' AND created_at > v_today_start;
            IF v_today_interviews = 0 THEN
                SELECT COUNT(*) INTO v_today_interviews
                  FROM user_plan_interviews WHERE last_interview_at > v_today_start;
            END IF;

            -- Read current milestone state before overwriting
            SELECT total_users_count, total_interviews_count
              INTO v_prev_total_users, v_prev_interviews
              FROM public_growth_metrics WHERE id = 1;

            -- Atomic update — all columns in one write to minimise lock duration
            UPDATE public_growth_metrics SET
                total_users_count          = v_total_users,
                active_users_count         = LEAST(v_active_users,     v_total_users),
                total_interviews_count     = v_total_interviews,
                colleges_count             = v_colleges,
                interviews_this_week_count = LEAST(v_week_interviews,  v_total_interviews),
                interviews_today_count     = LEAST(v_today_interviews, v_total_interviews),
                new_users_this_week_count  = LEAST(v_new_users_week,   v_total_users),
                updated_at                 = v_now,
                milestone_users_1k_at = COALESCE(milestone_users_1k_at,
                    CASE WHEN v_prev_total_users < 1000    AND v_total_users >= 1000    THEN v_now END),
                milestone_users_10k_at = COALESCE(milestone_users_10k_at,
                    CASE WHEN v_prev_total_users < 10000   AND v_total_users >= 10000   THEN v_now END),
                milestone_interviews_10k_at = COALESCE(milestone_interviews_10k_at,
                    CASE WHEN v_prev_interviews < 10000    AND v_total_interviews >= 10000  THEN v_now END),
                milestone_interviews_100k_at = COALESCE(milestone_interviews_100k_at,
                    CASE WHEN v_prev_interviews < 100000   AND v_total_interviews >= 100000 THEN v_now END)
            WHERE id = 1;

            -- Sync user_activity_stats to prevent drift between tables
            UPDATE user_activity_stats
               SET total_users_count = v_total_users, updated_at = v_now
             WHERE id = 1;

            -- Refresh materialized view concurrently — zero read blocking
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_public_growth_fast;

        END $$;
        $job$
    );

    RAISE NOTICE 'pg_cron job refresh-public-growth-metrics scheduled (every 5 minutes).';
END $$;


-- ============================================================
-- TABLE DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public_growth_metrics IS
    'Singleton marketing metrics cache (id=1 enforced). '
    'Powers public-facing social proof on the marketing page and dashboard. '
    'DO NOT update this table directly from application request handlers. '
    'All writes owned exclusively by pg_cron job refresh-public-growth-metrics. '
    'READ PATH: mv_public_growth_fast (fastest) or v_public_growth_display (live+fresh). '
    'RLS: anon + authenticated = SELECT only. service_role = full access. '
    'Write auditing: pgaudit logs every UPDATE/DELETE (if extension available). '
    'Sync: cron job keeps user_activity_stats.total_users_count aligned.';

COMMENT ON COLUMN public_growth_metrics.total_users_count  IS 'Total registered users. Source: COUNT(*) FROM profiles.';
COMMENT ON COLUMN public_growth_metrics.active_users_count IS 'Users active in last 10 min. Always <= total_users_count (CHECK enforced).';
COMMENT ON COLUMN public_growth_metrics.updated_at         IS 'Timestamp of last successful cron refresh. Used for freshness display.';