-- Migration 050: Cron and Schema Reconciliation (Final)
-- Resolves defects in entitlement triggers, GDPR cron syntax, old_user RLS,
-- growth metrics college mapping, and activity partition RLS inheritance.
-- Fully enforces strict execution boundaries and least-privilege for pg_cron.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prepvista_worker') THEN
        RAISE EXCEPTION 'prepvista_worker role does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'pg_cron extension is required.';
    END IF;
END $$;


-- ============================================================================
-- 1. ENTITLEMENT RECONCILIATION
-- ============================================================================

DO $$
DECLARE
    v_jobid BIGINT;
    v_count INT;
BEGIN
    SELECT count(*), max(jobid) INTO v_count, v_jobid 
      FROM cron.job 
     WHERE jobname = 'reconcile-is-active' AND username = 'prepvista_worker';
     
    IF v_count = 1 THEN
        PERFORM cron.unschedule(v_jobid);
        RAISE NOTICE 'Unscheduled obsolete cron job: reconcile-is-active';
    ELSIF v_count > 1 THEN
        RAISE EXCEPTION 'Multiple jobs found for reconcile-is-active under prepvista_worker.';
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_upe_refresh_is_active ON public.user_plan_entitlements;
DROP FUNCTION IF EXISTS public.fn_refresh_is_active();
COMMENT ON COLUMN public.user_plan_entitlements.is_active IS 'DEPRECATED: Unused by backend. Replaced by explicit status updates.';


-- ============================================================================
-- 2. GDPR PSEUDONYMISATION & HARD DELETE (SD FUNCTIONS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_gdpr_pseudonymise_old_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.old_user
    SET full_name = NULL,
        email = NULL
    WHERE archived_at < NOW() - INTERVAL '730 days'
      AND (full_name IS NOT NULL OR email IS NOT NULL);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'GDPR pseudonymisation complete: % rows processed', v_count;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_gdpr_pseudonymise_old_user() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_gdpr_pseudonymise_old_user() TO prepvista_worker;


CREATE OR REPLACE FUNCTION public.cron_gdpr_hard_delete_old_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM public.old_user
    WHERE archived_at < NOW() - INTERVAL '1095 days'
      AND full_name IS NULL
      AND email IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'GDPR hard delete complete: % rows processed', v_count;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_gdpr_hard_delete_old_user() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_gdpr_hard_delete_old_user() TO prepvista_worker;


-- ============================================================================
-- 3. PUBLIC GROWTH METRICS (SD FUNCTION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_refresh_public_growth_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    v_total_users INT;
    v_active_users INT;
    v_total_interviews INT;
    v_colleges INT;
    v_week_interviews INT;
    v_today_interviews INT;
    v_new_users_week INT;
    v_now TIMESTAMPTZ := NOW();
    v_today_start TIMESTAMPTZ := date_trunc('day', v_now);
    v_week_start TIMESTAMPTZ := v_now - INTERVAL '7 days';
BEGIN
    SELECT COUNT(*) INTO v_total_users FROM public.profiles;
    SELECT COUNT(DISTINCT user_id) INTO v_active_users FROM public.user_activity_events WHERE created_at > v_now - INTERVAL '10 minutes';
    SELECT COALESCE(SUM(total_interviews), 0) INTO v_total_interviews FROM public.user_plan_interviews;
    
    SELECT COUNT(DISTINCT p.organization_id) INTO v_colleges 
      FROM public.profiles p 
      JOIN public.organizations o ON p.organization_id = o.id 
     WHERE o.category = 'college';
    
    SELECT COUNT(*) INTO v_new_users_week FROM public.profiles WHERE created_at > v_week_start;
    SELECT COUNT(*) INTO v_week_interviews FROM public.user_activity_events WHERE event_type = 'interview_completed' AND created_at > v_week_start;
    SELECT COUNT(*) INTO v_today_interviews FROM public.user_activity_events WHERE event_type = 'interview_completed' AND created_at > v_today_start;

    INSERT INTO public.public_growth_metrics (
        id, total_users_count, active_users_count, total_interviews_count,
        colleges_count, interviews_this_week_count, interviews_today_count,
        new_users_this_week_count, updated_at, milestone_users_1k_at, milestone_interviews_10k_at
    ) VALUES (
        1, v_total_users, LEAST(v_active_users, v_total_users), v_total_interviews,
        v_colleges, LEAST(v_week_interviews, v_total_interviews), LEAST(v_today_interviews, v_total_interviews),
        LEAST(v_new_users_week, v_total_users), v_now,
        CASE WHEN v_total_users >= 1000 THEN v_now ELSE NULL END,
        CASE WHEN v_total_interviews >= 10000 THEN v_now ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE SET
        total_users_count = EXCLUDED.total_users_count,
        active_users_count = EXCLUDED.active_users_count,
        total_interviews_count = EXCLUDED.total_interviews_count,
        colleges_count = EXCLUDED.colleges_count,
        interviews_this_week_count = EXCLUDED.interviews_this_week_count,
        interviews_today_count = EXCLUDED.interviews_today_count,
        new_users_this_week_count = EXCLUDED.new_users_this_week_count,
        updated_at = EXCLUDED.updated_at,
        milestone_users_1k_at = COALESCE(public.public_growth_metrics.milestone_users_1k_at, EXCLUDED.milestone_users_1k_at),
        milestone_interviews_10k_at = COALESCE(public.public_growth_metrics.milestone_interviews_10k_at, EXCLUDED.milestone_interviews_10k_at);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_refresh_public_growth_metrics() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_refresh_public_growth_metrics() TO prepvista_worker;


-- ============================================================================
-- 4. PURGE JOBS (SD FUNCTIONS)
-- ============================================================================
-- Performance indexes intentionally omitted from transactional scope.

CREATE OR REPLACE FUNCTION public.cron_purge_usage_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE v_count INT;
BEGIN
    DELETE FROM public.usage_events WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '730 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Purged % usage_events', v_count;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_purge_usage_events() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_purge_usage_events() TO prepvista_worker;


CREATE OR REPLACE FUNCTION public.cron_purge_billing_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE v_count INT;
BEGIN
    DELETE FROM public.billing_events WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '2555 days' AND user_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Purged % billing_events', v_count;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_purge_billing_events() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_purge_billing_events() TO prepvista_worker;


-- ============================================================================
-- 5. ACTIVITY PARTITIONING (DETERMINISTIC CONCURRENCY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_create_activity_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $func$
DECLARE
    v_target_start TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '1 month');
    v_target_end   TIMESTAMPTZ := date_trunc('month', NOW() + INTERVAL '2 months');
    v_part_name    TEXT        := 'user_activity_events_' || to_char(v_target_start, 'YYYY_MM');
    v_is_part      BOOLEAN;
    v_relrowsec    BOOLEAN;
BEGIN
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
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE c.relname = v_part_name AND p.relname = 'user_activity_events'
    ) INTO v_is_part;

    IF NOT v_is_part THEN
        RAISE EXCEPTION 'Relation % exists but is NOT a partition of user_activity_events.', v_part_name;
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_part_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_part_name);

    -- Check if RLS is enabled
    SELECT relrowsecurity INTO v_relrowsec
    FROM pg_class WHERE relname = v_part_name;

    IF NOT v_relrowsec THEN
        RAISE EXCEPTION 'Failed to enable RLS on partition %.', v_part_name;
    END IF;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.cron_create_activity_partition() FROM PUBLIC, anon, authenticated, service_role, prepvista_runtime;
GRANT EXECUTE ON FUNCTION public.cron_create_activity_partition() TO prepvista_worker;

-- Retroactive existing partition self-healing
DO $$
DECLARE part_rel regclass;
BEGIN
    FOR part_rel IN
        SELECT relid::regclass FROM pg_partition_tree('public.user_activity_events') WHERE level > 0
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated', part_rel);
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', part_rel);
    END LOOP;
END $$;


-- ============================================================================
-- 6. CRON.JOB MANAGEMENT (EXACT IDENTITY)
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_count INT;
    v_jobid BIGINT;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES 
            ('gdpr-pseudonymise-old-user', 'SELECT public.cron_gdpr_pseudonymise_old_user();'),
            ('gdpr-hard-delete-old-user', 'SELECT public.cron_gdpr_hard_delete_old_user();'),
            ('refresh-public-growth-metrics', 'SELECT public.cron_refresh_public_growth_metrics();'),
            ('purge-usage-events', 'SELECT public.cron_purge_usage_events();'),
            ('purge-billing-events', 'SELECT public.cron_purge_billing_events();')
        ) AS jobs(jobname, command)
    LOOP
        SELECT count(*), max(jobid) INTO v_count, v_jobid 
          FROM cron.job WHERE jobname = r.jobname AND username = 'prepvista_worker';
          
        IF v_count = 1 THEN
            PERFORM cron.alter_job(job_id := v_jobid, command := r.command);
            IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = v_jobid AND command = r.command) THEN
                RAISE EXCEPTION 'cron.alter_job failed to update %', r.jobname;
            END IF;
        ELSE
            RAISE EXCEPTION 'Expected 1 job for % under prepvista_worker, found %', r.jobname, v_count;
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- 7. WORKER LEAST PRIVILEGE
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'old_user', 'user_activity_events', 'user_activity_settings', 'user_plan_entitlements',
        'profiles', 'user_plan_interviews', 'organizations',
        'public_growth_metrics', 'usage_events', 'billing_events'
    ] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM prepvista_worker;', t);
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_stats') THEN
        REVOKE INSERT, DELETE ON public.user_activity_stats FROM prepvista_worker;
    END IF;
END $$;

-- ============================================================================
-- 8. FAIL-CLOSED SECURITY DEFINER OWNERSHIP CHECK
-- ============================================================================
DO $$
DECLARE
    f RECORD;
    v_table_owner OID;
    v_func_owner OID;
    v_rls_forced BOOLEAN;
BEGIN
    FOR f IN
        SELECT * FROM (VALUES 
            ('cron_gdpr_pseudonymise_old_user', 'old_user'),
            ('cron_gdpr_hard_delete_old_user', 'old_user'),
            ('cron_refresh_public_growth_metrics', 'public_growth_metrics'),
            ('cron_purge_usage_events', 'usage_events'),
            ('cron_purge_billing_events', 'billing_events'),
            ('cron_create_activity_partition', 'user_activity_events')
        ) AS funcs(funcname, tabname)
    LOOP
        -- Get Table info
        SELECT c.relowner, c.relforcerowsecurity INTO v_table_owner, v_rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = f.tabname AND n.nspname = 'public';

        IF v_table_owner IS NULL THEN
            RAISE EXCEPTION 'Table % not found', f.tabname;
        END IF;

        IF v_rls_forced THEN
            RAISE EXCEPTION 'Table % has FORCE ROW LEVEL SECURITY enabled, blocking table-owner bypass.', f.tabname;
        END IF;

        -- Get Function info
        SELECT p.proowner INTO v_func_owner
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = f.funcname AND n.nspname = 'public';

        IF v_func_owner IS NULL THEN
            RAISE EXCEPTION 'Function % not found', f.funcname;
        END IF;

        IF v_func_owner != v_table_owner THEN
            RAISE EXCEPTION 'Function owner (%) does not match table owner (%) for %, bypassing RLS incorrectly.', v_func_owner, v_table_owner, f.funcname;
        END IF;
    END LOOP;
END $$;
