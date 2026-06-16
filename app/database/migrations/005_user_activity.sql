-- ============================================================
-- PATCH: 005_patch_recommended.sql
-- Applies all R1–R5 previously-recommended items from
-- the 005_user_activity.sql upgrade report.
-- PREREQUISITE: 005_user_activity.sql must have run first.
-- All blocks are idempotent — safe to re-run.
-- ============================================================


-- ============================================================
-- R1: ROW LEVEL SECURITY
-- Without RLS, every authenticated user (every student) can
-- query all tables added in 005 via the Supabase client —
-- reading other students' topic progress, output fingerprints,
-- and global platform user counts.
-- Policies follow standard Supabase role conventions:
--   authenticated = logged-in end user
--   service_role  = server-side backend (full bypass)
-- ============================================================

-- user_activity_stats
-- Read-only for authenticated users (dashboard display).
-- Only service_role may write (via background refresh job).
ALTER TABLE user_activity_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uas_read_authenticated'
           AND polrelid = 'user_activity_stats'::regclass
    ) THEN
        CREATE POLICY "uas_read_authenticated"
            ON user_activity_stats
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uas_all_service_role'
           AND polrelid = 'user_activity_stats'::regclass
    ) THEN
        CREATE POLICY "uas_all_service_role"
            ON user_activity_stats
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- user_activity_events
-- Authenticated users: INSERT and SELECT their own events only.
-- service_role: full access (for aggregation job and admin).
ALTER TABLE user_activity_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uae_insert_own'
           AND polrelid = 'user_activity_events'::regclass
    ) THEN
        CREATE POLICY "uae_insert_own"
            ON user_activity_events
            FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uae_select_own'
           AND polrelid = 'user_activity_events'::regclass
    ) THEN
        CREATE POLICY "uae_select_own"
            ON user_activity_events
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uae_all_service_role'
           AND polrelid = 'user_activity_events'::regclass
    ) THEN
        CREATE POLICY "uae_all_service_role"
            ON user_activity_events
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- user_output_fingerprints
-- Users manage their own fingerprint records only.
-- Prevents any student from reading what content another
-- student has or hasn't received.
ALTER TABLE user_output_fingerprints ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uof_own_records'
           AND polrelid = 'user_output_fingerprints'::regclass
    ) THEN
        CREATE POLICY "uof_own_records"
            ON user_output_fingerprints
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'uof_all_service_role'
           AND polrelid = 'user_output_fingerprints'::regclass
    ) THEN
        CREATE POLICY "uof_all_service_role"
            ON user_output_fingerprints
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- user_topic_progress
-- Users can read and update their own progress records.
-- Prevents any student from reading another student's
-- topic mastery scores or difficulty levels.
ALTER TABLE user_topic_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'utp_own_records'
           AND polrelid = 'user_topic_progress'::regclass
    ) THEN
        CREATE POLICY "utp_own_records"
            ON user_topic_progress
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname  = 'utp_all_service_role'
           AND polrelid = 'user_topic_progress'::regclass
    ) THEN
        CREATE POLICY "utp_all_service_role"
            ON user_topic_progress
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;


-- ============================================================
-- R2: UNLOGGED user_activity_events
-- ALTER TABLE ... SET UNLOGGED rewrites the table in-place,
-- bypassing WAL for all future writes.
-- Result: 3–5× higher INSERT throughput for heartbeat events.
-- Trade-off accepted: heartbeat data is ephemeral — losing
-- in-flight events on a PostgreSQL crash has zero business
-- impact. Do NOT apply if you use this table for billing audit.
-- ============================================================

ALTER TABLE user_activity_events SET UNLOGGED;


-- ============================================================
-- R3: TIME-BASED MONTHLY PARTITIONING — user_activity_events
-- Partitioning by RANGE(created_at) provides:
--   1. Partition pruning: "last 10 min" query scans only the
--      current month's partition — not the entire table.
--   2. Instant partition drop for retention (vs slow DELETE).
--   3. Future-proof: add next month's partition via pg_cron.
--
-- SAFETY GUARD: this block checks the row count before acting.
--   - 0 rows (fresh deployment): converts automatically.
--   - N rows (live deployment): prints NOTICE and skips safely.
--     Apply manually using the zero-downtime procedure:
--     1. CREATE new partitioned table with a temp name
--     2. INSERT INTO new_table SELECT * FROM user_activity_events
--     3. BEGIN; ALTER TABLE ... RENAME; COMMIT;
-- ============================================================

DO $$
DECLARE
    v_count        BIGINT;
    v_cur_month    TEXT        := to_char(date_trunc('month', NOW()), 'YYYY_MM');
    v_next1_month  TEXT        := to_char(date_trunc('month', NOW() + INTERVAL '1 month'),  'YYYY_MM');
    v_next2_month  TEXT        := to_char(date_trunc('month', NOW() + INTERVAL '2 months'), 'YYYY_MM');
    v_next3_month  TEXT        := to_char(date_trunc('month', NOW() + INTERVAL '3 months'), 'YYYY_MM');
    v_cur_start    TIMESTAMPTZ := date_trunc('month', NOW());
    v_next1_start  TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '1 month');
    v_next2_start  TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '2 months');
    v_next3_start  TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '3 months');
    v_next4_start  TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '4 months');
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_activity_events;

    IF v_count > 0 THEN
        RAISE NOTICE
            'user_activity_events has % rows. Automatic partitioning skipped. '
            'Apply manually via zero-downtime procedure.', v_count;
        RETURN;
    END IF;

    -- Drop the empty non-partitioned table and recreate as partitioned + UNLOGGED
    DROP TABLE user_activity_events;

    CREATE UNLOGGED TABLE user_activity_events (
        id          BIGSERIAL,
        user_id     UUID         NOT NULL
                                 REFERENCES profiles(id) ON DELETE CASCADE,
        event_type  TEXT         NOT NULL DEFAULT 'heartbeat'
                                 CHECK (event_type IN (
                                     'heartbeat', 'login', 'logout',
                                     'interview_start', 'interview_end'
                                 )),
        metadata    JSONB,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    ) PARTITION BY RANGE (created_at);

    -- Default partition: catches any inserts outside defined ranges.
    -- Prevents INSERT failures when a heartbeat arrives on the first
    -- second of an uncreated future partition.
    EXECUTE 'CREATE UNLOGGED TABLE user_activity_events_default '
            'PARTITION OF user_activity_events DEFAULT';

    -- Monthly partitions: current + 3 months ahead
    EXECUTE format(
        'CREATE UNLOGGED TABLE user_activity_events_%s '
        'PARTITION OF user_activity_events '
        'FOR VALUES FROM (%L) TO (%L)',
        v_cur_month, v_cur_start, v_next1_start
    );
    EXECUTE format(
        'CREATE UNLOGGED TABLE user_activity_events_%s '
        'PARTITION OF user_activity_events '
        'FOR VALUES FROM (%L) TO (%L)',
        v_next1_month, v_next1_start, v_next2_start
    );
    EXECUTE format(
        'CREATE UNLOGGED TABLE user_activity_events_%s '
        'PARTITION OF user_activity_events '
        'FOR VALUES FROM (%L) TO (%L)',
        v_next2_month, v_next2_start, v_next3_start
    );
    EXECUTE format(
        'CREATE UNLOGGED TABLE user_activity_events_%s '
        'PARTITION OF user_activity_events '
        'FOR VALUES FROM (%L) TO (%L)',
        v_next3_month, v_next3_start, v_next4_start
    );

    -- Recreate indexes on parent table (inherited by all partitions in PG13+)
    CREATE INDEX idx_uae_created_at
        ON user_activity_events(created_at DESC);
    CREATE INDEX idx_uae_user_created
        ON user_activity_events(user_id, created_at DESC);
    CREATE INDEX idx_uae_heartbeat_recent
        ON user_activity_events(created_at DESC)
        WHERE event_type = 'heartbeat';

    -- Reapply RLS (parent-level; inherited by partitions in PG14+)
    ALTER TABLE user_activity_events ENABLE ROW LEVEL SECURITY;

    RAISE NOTICE
        'user_activity_events converted to monthly UNLOGGED partitioned table. '
        'Partitions: %, %, %, % + default catch-all.',
        v_cur_month, v_next1_month, v_next2_month, v_next3_month;
END $$;


-- ============================================================
-- R4: pg_cron JOB — ACTIVITY STATS REFRESH (EVERY MINUTE)
-- This job is the bridge between the event-sourced write path
-- and the singleton read path:
--   Writes: parallel INSERTs → user_activity_events (no lock)
--   Reads:  SELECT from user_activity_stats (single cached row)
--   Sync:   this job updates the singleton every 60 seconds
-- Also prunes events older than 24 hours to bound table growth.
--
-- PREREQUISITE: pg_cron must be enabled.
-- On Supabase: Dashboard → Extensions → enable pg_cron, OR:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    -- Unschedule previous version of this job (idempotent re-run)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-activity-stats') THEN
        PERFORM cron.unschedule('refresh-activity-stats');
    END IF;

    PERFORM cron.schedule(
        'refresh-activity-stats',
        '* * * * *',   -- every minute
        $job$
        UPDATE user_activity_stats
        SET
            active_users_count = (
                SELECT COUNT(DISTINCT e.user_id)
                  FROM user_activity_events e
                 WHERE e.created_at > NOW() - (
                     SELECT s.live_window_minutes * INTERVAL '1 minute'
                       FROM user_activity_stats s
                      WHERE s.id = 1
                 )
            ),
            inactive_users_count = GREATEST(
                total_users_count - (
                    SELECT COUNT(DISTINCT e.user_id)
                      FROM user_activity_events e
                     WHERE e.created_at > NOW() - (
                         SELECT s.live_window_minutes * INTERVAL '1 minute'
                           FROM user_activity_stats s
                          WHERE s.id = 1
                     )
                ), 0
            ),
            updated_at = NOW()
        WHERE id = 1;

        DELETE FROM user_activity_events
        WHERE created_at < NOW() - INTERVAL '24 hours';
        $job$
    );

    RAISE NOTICE 'pg_cron job refresh-activity-stats scheduled (every 1 minute).';
END $$;

-- pg_cron job — create next month's partition before it is needed.
-- Runs at 00:01 on the 25th of each month.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-activity-partition') THEN
        PERFORM cron.unschedule('create-activity-partition');
    END IF;

    PERFORM cron.schedule(
        'create-activity-partition',
        '1 0 25 * *',   -- 00:01 on the 25th of each month
        $job$
        DO $$
        DECLARE
            v_target_month TEXT        := to_char(date_trunc('month', NOW() + INTERVAL '1 month'), 'YYYY_MM');
            v_target_start TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '1 month');
            v_target_end   TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '2 months');
            v_part_name    TEXT        := 'user_activity_events_' || to_char(date_trunc('month', NOW() + INTERVAL '1 month'), 'YYYY_MM');
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_class
                 WHERE relname = v_part_name
            ) THEN
                EXECUTE format(
                    'CREATE UNLOGGED TABLE %I '
                    'PARTITION OF user_activity_events '
                    'FOR VALUES FROM (%L) TO (%L)',
                    v_part_name, v_target_start, v_target_end
                );
                RAISE NOTICE 'Created partition: %', v_part_name;
            END IF;
        END $$;
        $job$
    );

    RAISE NOTICE 'pg_cron job create-activity-partition scheduled (25th of each month).';
END $$;


-- ============================================================
-- R5: correct_count <= attempts CONSTRAINT
-- Correct answers cannot exceed total attempts — logically
-- impossible and indicates a bug in the answer-tracking code.
-- CAVEAT: if your application increments correct_count and
-- attempts in two separate non-atomic statements, this
-- constraint fires on the intermediate state. Fix: combine
-- both increments into a single UPDATE before applying this.
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname  = 'chk_utp_correct_lte_attempts'
           AND conrelid = 'user_topic_progress'::regclass
    ) THEN
        ALTER TABLE user_topic_progress
            ADD CONSTRAINT chk_utp_correct_lte_attempts
            CHECK (correct_count <= attempts);
    END IF;
END $$;