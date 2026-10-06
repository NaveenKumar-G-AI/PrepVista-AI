-- MIGRATION 040: RUNTIME ROLE RLS HARDENING
-- Replaces global BYPASSRLS with explicit targeted least-privilege service policies
-- for the backend application pool.

-- 1. Remove automatic CRUD on future tables to ensure they fail closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM prepvista_runtime;

-- 2. Revoke broad ALL TABLES privileges granted during initial setup.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM prepvista_runtime;

-- 3. Explicit Table ACLs for Application Tables
-- schema_migrations is intentionally restricted to SELECT.
GRANT SELECT ON schema_migrations TO prepvista_runtime;

DO $$
DECLARE
    app_tables text[] := ARRAY[
        'account_deletion_requests', 'auth_identity_links', 'institutions', 'institution_admins', 
        'conversation_messages', 'cohort_snapshots', 'product_funnel_events', 'user_purchase_stats', 
        'referrals', 'feedback_entries', 'reports', 'user_activity_stats', 'user_output_fingerprints', 
        'user_activity_events_default', 'user_activity_events_2026_10', 'user_activity_events_2026_11', 
        'intervention', 'intervention_assignment', 'user_activity_events_2026_12', 'user_activity_events_2027_01', 
        'user_topic_progress', 'user_plan_interviews', 'old_user', 'public_growth_metrics', 
        'launch_offer_settings', 'launch_offer_grants', 'usage_events', 'billing_events', 
        'user_revenue_analytics', 'admin_bonus_grants', 'manual_signup_verification_codes', 
        'interview_type_definitions', 'support_messages', 'user_plan_entitlements', 'organizations', 
        'organization_admins', 'college_departments', 'college_years', 'college_batches', 'organization_students', 
        'organization_access_log', 'org_plan_allocations', 'webhook_events', 'org_payments', 'org_admin_invites', 
        'org_cohort_snapshots', 'profiles', 'answer_quality_flags', 'placement_outcomes', 'placement_parameters', 
        'interview_audio_turns', 'college_placement_config', 'recruiter_industries', 'recruiter_companies', 
        'recruiter_contacts', 'recruiter_activities', 'recruiter_followups', 'recruiter_company_notes', 
        'recruiter_status_history', 'placement_drives', 'drive_eligibility_rule_versions', 
        'drive_eligibility_snapshots', 'drive_audit_log', 'drive_round_executions', 'placement_interviews', 
        'placement_interview_results', 'placement_interview_issues', 'placement_interview_audit', 
        'placement_interview_events', 'offers', 'offer_versions', 'offer_documents', 'joining_records', 
        'student_placement_outcomes', 'training_session', 'training_attendance', 'training_cohort', 
        'training_cohort_member', 'training_program', 'training_enrollment', 'assessment_version', 
        'assessment_attempt', 'assessment_question', 'assessment_result', 'assessment', 'org_communications', 
        'org_communication_recipients', 'org_communication_issues', 'taxonomy_term', 'audit_log', 
        'student_success_event', 'skill_measurement', 'readiness_snapshot', 'institution_offer_policy', 
        'placement_seasons', 'payments', 'org_report_schedules', 'interview_assistance_policy', 
        'interview_assistance_event', 'interview_sessions', 'question_evaluations', 'skill_scores'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY app_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO prepvista_runtime;', t); END IF;
    END LOOP;
END $$;

-- 4. Explicit Sequence Grants
DO $$
DECLARE
    app_seqs text[] := ARRAY[
        'account_deletion_requests_id_seq', 'institution_admins_id_seq', 'conversation_messages_id_seq', 
        'skill_scores_id_seq', 'answer_quality_flags_id_seq', 'cohort_snapshots_id_seq', 'usage_events_id_seq', 
        'product_funnel_events_id_seq', 'user_plan_entitlements_id_seq', 'billing_events_id_seq', 
        'feedback_entries_id_seq', 'user_activity_stats_id_seq', 'user_output_fingerprints_id_seq', 
        'user_topic_progress_id_seq', 'user_plan_interviews_id_seq', 'user_activity_events_id_seq', 
        'old_user_id_seq', 'launch_offer_grants_id_seq', 'support_messages_id_seq', 'organization_access_log_id_seq', 
        'org_cohort_snapshots_id_seq', 'drive_audit_log_id_seq', 'placement_interview_audit_id_seq', 
        'placement_interview_events_id_seq'
    ];
    s text;
BEGIN
    FOREACH s IN ARRAY app_seqs LOOP
        IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_schema = 'public' AND sequence_name = s) THEN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO prepvista_runtime;', s); END IF;
    END LOOP;
END $$;

-- 5. Explicit Backend RLS Service Policies
DO $$
DECLARE
    -- These 17 tables are the core RLS-enabled data the backend must manage directly.
    rls_tables text[] := ARRAY[
        'organization_admins', 'college_departments', 'college_years', 'college_batches', 
        'organization_students', 'organization_access_log', 'org_plan_allocations', 'webhook_events', 
        'org_payments', 'org_admin_invites', 'org_cohort_snapshots', 'profiles', 
        'answer_quality_flags', 'payments', 'interview_sessions', 'question_evaluations', 'skill_scores', 'organizations'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY rls_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN EXECUTE format('CREATE POLICY prepvista_runtime_service_all ON %I FOR ALL TO prepvista_runtime USING (true) WITH CHECK (true);', t); END IF;
    END LOOP;
END $$;

-- 6. Strip Global BYPASSRLS
-- (Role attributes shouldn't be here if architecture delegates to deployment scripts,
-- but the instructions request stripping it locally directly if possible. Since we want
-- to ensure it's removed immediately upon migration in integration tests:)
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'prepvista_runtime') THEN
        ALTER ROLE prepvista_runtime NOBYPASSRLS;
    END IF;
END $$;
