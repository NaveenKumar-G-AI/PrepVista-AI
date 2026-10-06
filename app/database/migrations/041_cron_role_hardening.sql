-- Migration 041: Cron Role Hardening

DO $$
BEGIN
    -- Fail closed if prepvista_worker does not exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prepvista_worker') THEN
        RAISE EXCEPTION 'prepvista_worker role does not exist. Create it via deployment script first.';
    END IF;
END $$;

-- 1. Create SECURITY DEFINER function for partition creation (requires DDL)
CREATE OR REPLACE FUNCTION cron_create_activity_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

-- Revoke default public execute, grant explicitly to worker
REVOKE EXECUTE ON FUNCTION cron_create_activity_partition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cron_create_activity_partition() TO prepvista_worker;

-- 2. Grant necessary privileges to prepvista_worker
DO $$
DECLARE
    t text;
BEGIN
    GRANT USAGE ON SCHEMA public TO prepvista_worker;
    FOREACH t IN ARRAY ARRAY['user_activity_events', 'user_activity_settings', 'user_activity_stats', 'user_plan_entitlements', 'old_user', 'profiles', 'user_plan_interviews', 'organizations', 'public_growth_metrics', 'usage_events', 'billing_events'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO prepvista_worker;', t);
        END IF;
    END LOOP;
END $$;
-- Explicit Backend RLS Service Policies for worker on RLS-enabled tables
DO $$
DECLARE
    rls_tables text[] := ARRAY['profiles', 'organizations'];
    t text;
BEGIN
    FOREACH t IN ARRAY rls_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN EXECUTE format('CREATE POLICY prepvista_worker_service_all ON %I FOR ALL TO prepvista_worker USING (true) WITH CHECK (true);', t); END IF;
    END LOOP;
END $$;

-- 3. Reschedule cron jobs to run as prepvista_worker
DO $$
DECLARE
    -- pg_cron allows updating the username directly via UPDATE cron.job.
    -- This is fully transactional and prevents duplicates.
    v_jobs text[] := ARRAY[
        'refresh-activity-stats',
        'create-activity-partition',
        'reconcile-is-active',
        'gdpr-pseudonymise-old-user',
        'gdpr-hard-delete-old-user',
        'refresh-public-growth-metrics',
        'purge-usage-events',
        'purge-billing-events'
    ];
    j text;
BEGIN
    -- Only update if pg_cron is installed
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        FOREACH j IN ARRAY v_jobs LOOP
            UPDATE cron.job SET username = 'prepvista_worker' WHERE jobname = j;
            
            -- If job is create-activity-partition, update the command to call our secure function
            IF j = 'create-activity-partition' THEN
                UPDATE cron.job SET command = 'SELECT cron_create_activity_partition();' WHERE jobname = j;
            END IF;
        END LOOP;
    END IF;
END $$;
