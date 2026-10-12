-- Migration 051: pg_cron Runtime Reconciliation and Concurrency Hardening
-- Resolves pg_cron runtime execution defects:
-- 1. Defect #1: Reconciles prepvista_worker LOGIN requirement for genuine pg_cron execution.
-- 2. Defect #2: Encapsulates refresh-activity-stats in a dedicated SECURITY DEFINER function
--    and revokes unnecessary direct table DML from prepvista_worker.
-- 3. Defect #3: Serializes partition creation via dedicated transaction advisory lock
--    preventing catalog / tuple concurrency conflicts.

-- ============================================================================
-- 1. FAIL-CLOSED PRECONDITIONS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'pg_cron extension is required for 051 reconciliation.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prepvista_worker') THEN
        RAISE EXCEPTION 'prepvista_worker role does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_roles 
        WHERE rolname = 'prepvista_worker' 
          AND rolcanlogin = true 
          AND NOT rolsuper 
          AND NOT rolcreaterole 
          AND NOT rolcreatedb 
          AND NOT rolreplication 
          AND NOT rolbypassrls
    ) THEN
        RAISE EXCEPTION 'prepvista_worker must be provisioned with LOGIN and least-privilege non-admin attributes before 051.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_stats') THEN
        RAISE EXCEPTION 'Required table user_activity_stats does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_events') THEN
        RAISE EXCEPTION 'Required table user_activity_events does not exist.';
    END IF;

    IF EXISTS (SELECT FROM cron.job) AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-activity-stats' AND username = 'prepvista_worker') THEN
        RAISE EXCEPTION 'Required cron job refresh-activity-stats under prepvista_worker does not exist.';
    END IF;
END $$;


-- ============================================================================
-- 2. REFRESH ACTIVITY STATS SECURITY DEFINER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_refresh_activity_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    v_live_mins INT;
    v_distinct_active INT;
    v_total_users INT;
    v_active_count INT;
    v_inactive_count INT;
BEGIN
    -- Obtain live window minutes and total users from user_activity_stats row id = 1
    SELECT live_window_minutes, total_users_count 
      INTO v_live_mins, v_total_users
      FROM public.user_activity_stats
     WHERE id = 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Activity stats singleton missing; refusing refresh and retention purge';
    END IF;

    IF v_live_mins IS NULL THEN
        v_live_mins := 15; -- Fallback default if unset
    END IF;

    -- Compute active users in window
    SELECT COUNT(DISTINCT user_id)
      INTO v_distinct_active
      FROM public.user_activity_events
     WHERE created_at > NOW() - (v_live_mins * INTERVAL '1 minute');

    v_active_count := v_distinct_active;
    v_inactive_count := GREATEST(COALESCE(v_total_users, 0) - v_distinct_active, 0);

    UPDATE public.user_activity_stats
       SET active_users_count = v_active_count,
           inactive_users_count = v_inactive_count,
           updated_at = NOW()
     WHERE id = 1;

    -- Purge activity events older than 24 hours
    DELETE FROM public.user_activity_events
     WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$func$;

REVOKE ALL ON FUNCTION public.cron_refresh_activity_stats() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_refresh_activity_stats() TO prepvista_worker;


-- ============================================================================
-- 3. FAIL-CLOSED FUNCTION OWNERSHIP & RLS VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_stats_owner OID;
    v_events_owner OID;
    v_func_owner OID;
    v_rls_forced BOOLEAN;
BEGIN
    SELECT c.relowner, c.relforcerowsecurity INTO v_stats_owner, v_rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'user_activity_stats' AND n.nspname = 'public';

    IF v_rls_forced THEN
        RAISE EXCEPTION 'user_activity_stats has FORCE ROW LEVEL SECURITY enabled.';
    END IF;

    SELECT c.relowner, c.relforcerowsecurity INTO v_events_owner, v_rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'user_activity_events' AND n.nspname = 'public';

    IF v_rls_forced THEN
        RAISE EXCEPTION 'user_activity_events has FORCE ROW LEVEL SECURITY enabled.';
    END IF;

    SELECT p.proowner INTO v_func_owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'cron_refresh_activity_stats' AND n.nspname = 'public';

    IF v_func_owner != v_stats_owner OR v_func_owner != v_events_owner THEN
        RAISE EXCEPTION 'Function owner (%) does not match table owners (% / %) for cron_refresh_activity_stats.',
            v_func_owner, v_stats_owner, v_events_owner;
    END IF;
END $$;


-- ============================================================================
-- 4. RECONCILE refresh-activity-stats CRON JOB
-- ============================================================================

DO $$
DECLARE
    v_count INT;
    v_jobid BIGINT;
    c_target_cmd CONSTANT TEXT := 'SELECT public.cron_refresh_activity_stats();';
BEGIN
    SELECT count(*), max(jobid) INTO v_count, v_jobid
      FROM cron.job
     WHERE jobname = 'refresh-activity-stats' AND username = 'prepvista_worker';

    IF v_count = 1 THEN
        PERFORM cron.alter_job(job_id := v_jobid, command := c_target_cmd);
        IF NOT EXISTS (
            SELECT 1 FROM cron.job 
            WHERE jobid = v_jobid 
              AND command = c_target_cmd
        ) THEN
            RAISE EXCEPTION 'cron.alter_job failed to update refresh-activity-stats command';
        END IF;
    ELSIF v_count = 0 AND NOT EXISTS (SELECT FROM cron.job) THEN
        -- Dormant installation: do not create, schedule or activate any job.
        NULL;
    ELSE
        RAISE EXCEPTION 'Expected exactly 1 job for refresh-activity-stats under prepvista_worker, found %', v_count;
    END IF;
END $$;


-- ============================================================================
-- 5. REVOKE DIRECT TABLE DML FROM PREPVISTA_WORKER
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_stats') THEN
        REVOKE INSERT, UPDATE, DELETE ON public.user_activity_stats FROM prepvista_worker;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_events') THEN
        REVOKE INSERT, UPDATE, DELETE ON public.user_activity_events FROM prepvista_worker;
    END IF;
END $$;


-- ============================================================================
-- 6. SERIALIZED PARTITION CREATION FUNCTION (TRANSACTION ADVISORY LOCK)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_create_activity_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    -- Dedicated deterministic advisory lock key for activity partition creation.
    -- Distinct from the migration runner's hashed lock and bootstrap lock (20261010).
    c_partition_lock_key CONSTANT BIGINT := 202610110051;
    v_target_start TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '1 month');
    v_target_end   TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '2 months');
    v_part_name    TEXT        := 'user_activity_events_' || to_char(v_target_start, 'YYYY_MM');
    v_is_part      BOOLEAN;
    v_relrowsec    BOOLEAN;
    v_bounds_valid BOOLEAN;
BEGIN
    -- Acquire transaction-scoped advisory lock serializing all partition creation DDL
    PERFORM pg_advisory_xact_lock(c_partition_lock_key);

    BEGIN
        EXECUTE format(
            'CREATE UNLOGGED TABLE public.%I PARTITION OF public.user_activity_events FOR VALUES FROM (%L) TO (%L)',
            v_part_name, v_target_start, v_target_end
        );
        RAISE NOTICE 'Created partition: %', v_part_name;
    EXCEPTION WHEN duplicate_table THEN
        RAISE NOTICE 'Partition % already exists. Proceeding to explicit hardening.', v_part_name;
    END;
    
    -- POSTCONDITION VERIFICATION
    -- Check if it actually belongs to user_activity_events
    SELECT EXISTS (
        SELECT 1 FROM pg_inherits i
        WHERE i.inhrelid = to_regclass(format('public.%I',v_part_name))
          AND i.inhparent = 'public.user_activity_events'::regclass
    ) INTO v_is_part;

    IF NOT v_is_part THEN
        RAISE EXCEPTION 'Relation % exists but is NOT a partition of user_activity_events.', v_part_name;
    END IF;

    -- Verify partition bound expression matches target month
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        WHERE c.oid = to_regclass(format('public.%I',v_part_name))
          AND pg_get_expr(c.relpartbound, c.oid) = format('FOR VALUES FROM (%L) TO (%L)',v_target_start,v_target_end)
    ) INTO v_bounds_valid;

    IF NOT v_bounds_valid THEN
        RAISE EXCEPTION 'Partition % bound expression does not match expected target range.', v_part_name;
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_part_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_part_name);

    -- Check if RLS is enabled
    SELECT relrowsecurity INTO v_relrowsec
    FROM pg_class WHERE oid = to_regclass(format('public.%I',v_part_name));

    IF NOT v_relrowsec THEN
        RAISE EXCEPTION 'Failed to enable RLS on partition %.', v_part_name;
    END IF;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_create_activity_partition() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_create_activity_partition() TO prepvista_worker;
