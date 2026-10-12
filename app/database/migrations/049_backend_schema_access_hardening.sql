BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;

-- Existing historical roles only. No role creation, membership grants, ownership
-- transfer, BYPASSRLS grant, or grant of migration DDL to the web role.
DO $preflight$
DECLARE r record;
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='prepvista_runtime')
       OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='prepvista_worker') THEN
        RAISE EXCEPTION 'Qualified historical role baseline is required before 049';
    END IF;
    FOR r IN SELECT * FROM pg_roles
             WHERE rolname IN ('prepvista_runtime','prepvista_worker') LOOP
        IF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls THEN
            RAISE EXCEPTION 'Unsafe backend role attributes: %', r.rolname;
        END IF;
        IF EXISTS (
            SELECT FROM pg_roles parent
            WHERE parent.oid<>r.oid
              AND pg_has_role(r.oid,parent.oid,'MEMBER')
              AND (parent.rolsuper OR parent.rolcreaterole OR parent.rolcreatedb
                   OR parent.rolreplication OR parent.rolbypassrls)
        ) THEN
            RAISE EXCEPTION 'Unsafe backend role membership: %',r.rolname;
        END IF;
    END LOOP;
    IF pg_has_role('authenticated','prepvista_runtime','MEMBER')
       OR pg_has_role('anon','prepvista_runtime','MEMBER')
       OR pg_has_role('authenticated','prepvista_worker','MEMBER')
       OR pg_has_role('anon','prepvista_worker','MEMBER') THEN
        RAISE EXCEPTION 'Client role inherits backend role';
    END IF;
END $preflight$;

-- Public-schema private data is mediated by the authenticated FastAPI routes.
-- Preserve the existing policies, but remove direct browser-role table/column
-- privileges; client reads and mutations use the same checked API boundary.
DO $access$
DECLARE
    names text[] := ARRAY[
        'account_deletion_requests',
        'admin_bonus_grants',
        'answer_quality_flags',
        'assessment',
        'assessment_attempt',
        'assessment_question',
        'assessment_result',
        'assessment_version',
        'audit_log',
        'auth_identity_links',
        'billing_events',
        'cohort_snapshots',
        'college_batches',
        'college_departments',
        'college_placement_config',
        'college_years',
        'conversation_messages',
        'drive_audit_log',
        'drive_eligibility_rule_versions',
        'drive_eligibility_snapshots',
        'drive_round_executions',
        'feedback_entries',
        'institution_admins',
        'institution_offer_policy',
        'institutions',
        'intervention',
        'intervention_assignment',
        'interview_assistance_event',
        'interview_assistance_policy',
        'interview_audio_turns',
        'interview_sessions',
        'joining_records',
        'launch_offer_grants',
        'launch_offer_settings',
        'manual_signup_verification_codes',
        'offer_documents',
        'offer_versions',
        'offers',
        'old_user',
        'org_admin_invites',
        'org_cohort_snapshots',
        'org_communication_issues',
        'org_communication_recipients',
        'org_communications',
        'org_payments',
        'org_plan_allocations',
        'org_report_schedules',
        'organization_access_log',
        'organization_admins',
        'organization_students',
        'organizations',
        'payments',
        'placement_drives',
        'placement_interview_audit',
        'placement_interview_events',
        'placement_interview_issues',
        'placement_interview_results',
        'placement_interviews',
        'placement_outcomes',
        'placement_parameters',
        'placement_seasons',
        'product_funnel_events',
        'profiles',
        'question_evaluations',
        'readiness_snapshot',
        'recruiter_activities',
        'recruiter_companies',
        'recruiter_company_notes',
        'recruiter_contacts',
        'recruiter_followups',
        'recruiter_industries',
        'recruiter_status_history',
        'referrals',
        'reports',
        'schema_migrations',
        'skill_measurement',
        'skill_scores',
        'student_placement_outcomes',
        'student_success_event',
        'support_messages',
        'taxonomy_term',
        'training_attendance',
        'training_cohort',
        'training_cohort_member',
        'training_enrollment',
        'training_program',
        'training_session',
        'usage_events',
        'user_activity_events',
        'user_activity_stats',
        'user_output_fingerprints',
        'user_plan_entitlements',
        'user_plan_interviews',
        'user_purchase_stats',
        'user_revenue_analytics',
        'user_topic_progress',
        'webhook_events'
    ];
    t text; c record; target oid; backend text; operation text; policy_name text;
BEGIN
    FOREACH t IN ARRAY names LOOP
        target := to_regclass(format('public.%I',t));
        IF target IS NULL THEN
            -- Obsolete institution-era tables may be absent. Harden them if
            -- retained; all current reviewed tables remain mandatory.
            IF t IN ('institutions','institution_admins','cohort_snapshots') THEN
                CONTINUE;
            END IF;
            RAISE EXCEPTION 'Required reviewed table missing: %',t;
        END IF;
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
        FOR c IN SELECT attname FROM pg_attribute
                 WHERE attrelid=target AND attnum>0 AND NOT attisdropped LOOP
            EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',c.attname,t);
        END LOOP;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        -- Restore row access only for operations already authorized by an
        -- existing explicit/inherited backend table ACL. Never add table ACLs.
        FOREACH backend IN ARRAY ARRAY['prepvista_runtime','prepvista_worker','service_role'] LOOP
            FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
                IF has_table_privilege(backend,target,operation) THEN
                    policy_name := 'p049_' || backend || '_' || lower(operation);
                    IF operation='INSERT' THEN
                        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO %I WITH CHECK (true)',policy_name,t,backend);
                    ELSIF operation='UPDATE' THEN
                        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO %I USING (true) WITH CHECK (true)',policy_name,t,backend);
                    ELSE
                        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %I USING (true)',policy_name,t,operation,backend);
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    -- Partitions can also be queried directly. They inherit neither the
    -- parent's ACL nor its RLS when addressed by their own relation name.
    FOR c IN SELECT relid::regclass AS relation
             FROM pg_partition_tree('public.user_activity_events')
             WHERE level>0 LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated',c.relation);
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',c.relation);
    END LOOP;
END $access$;

-- Prevent untrusted clients creating names resolved by definer helpers.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Preserve existing routines and owners, pin resolution to trusted schemas.
DO $optional_helpers$
DECLARE signature text; routine regprocedure;
BEGIN
    FOREACH signature IN ARRAY ARRAY[
        'public.admin_can_view_department(uuid,text)',
        'public.get_admin_institution_id()',
        'public.is_institution_admin(uuid)',
        'public.get_admin_organization_id()',
        'public.get_student_organization_id()',
        'public.is_org_admin(uuid)',
        'public.is_student_in_org(uuid)',
        'public.org_admin_can_view_department(uuid,uuid)',
        'public.is_admin_user()',
        'public.fn_gdpr_erase_event_records()'
    ] LOOP
        routine := to_regprocedure(signature);
        IF routine IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,public,pg_temp', routine);
        END IF;
    END LOOP;
END $optional_helpers$;
ALTER FUNCTION public.fn_erasure_pseudonymise_old_user() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.cron_create_activity_partition() SET search_path=pg_catalog,public,pg_temp;

COMMIT;
