-- Security model, matching the pattern used across every prior ACEAPT/CodeForge
-- feature in this series: a non-superuser OWNER role (BYPASSRLS, like Supabase's
-- service_role) that owns every table and every SECURITY DEFINER function, and
-- an APP role with ZERO raw table grants that can only call those functions.
-- RLS is enabled AND FORCED on every table as a second, independent layer.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qve_owner') THEN
    CREATE ROLE qve_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qve_app') THEN
    CREATE ROLE qve_app LOGIN PASSWORD 'qve_app_dev_password_replace_me';
  END IF;
END $$;

ALTER ROLE qve_owner BYPASSRLS;

ALTER TABLE questions               OWNER TO qve_owner;
ALTER TABLE question_versions       OWNER TO qve_owner;
ALTER TABLE validator_definitions   OWNER TO qve_owner;
ALTER TABLE question_validation_runs     OWNER TO qve_owner;
ALTER TABLE question_validation_results  OWNER TO qve_owner;
ALTER TABLE validation_dependencies OWNER TO qve_owner;
ALTER TABLE validation_issues       OWNER TO qve_owner;
ALTER TABLE validation_audit_events OWNER TO qve_owner;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM qve_app;
REVOKE ALL ON SCHEMA public FROM qve_app;
GRANT USAGE ON SCHEMA public TO qve_app;
-- Deliberately no GRANT SELECT/INSERT/UPDATE/DELETE to qve_app on anything —
-- verified by a live permission-denied test (test/integration/rls.postgres.test.ts).

ALTER TABLE questions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions               FORCE ROW LEVEL SECURITY;
ALTER TABLE question_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_versions       FORCE ROW LEVEL SECURITY;
ALTER TABLE question_validation_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_validation_runs     FORCE ROW LEVEL SECURITY;
ALTER TABLE question_validation_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_validation_results  FORCE ROW LEVEL SECURITY;
ALTER TABLE validation_issues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_issues       FORCE ROW LEVEL SECURITY;
ALTER TABLE validation_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_audit_events FORCE ROW LEVEL SECURITY;

-- Tenant-isolation policies (spec §152). NULLIF(...,'')::uuid guards against the
-- exact GUC pitfall hit in a prior feature (a `SET LOCAL` GUC reverting to an
-- empty string rather than NULL once touched) — cast-of-empty-string would throw
-- instead of failing closed, so we neutralize it before the cast.
CREATE POLICY tenant_isolation ON questions
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.current_role', true) IN ('ADMIN', 'SYSTEM'));

CREATE POLICY tenant_isolation ON question_versions
  USING (question_id IN (SELECT id FROM questions)); -- inherits via FK; questions policy already filters

CREATE POLICY tenant_isolation ON question_validation_runs
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.current_role', true) IN ('ADMIN', 'SYSTEM'));

CREATE POLICY tenant_isolation ON question_validation_results
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.current_role', true) IN ('ADMIN', 'SYSTEM'));

CREATE POLICY tenant_isolation ON validation_issues
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.current_role', true) IN ('ADMIN', 'SYSTEM'));

CREATE POLICY tenant_isolation ON validation_audit_events
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.current_role', true) IN ('ADMIN', 'SYSTEM'));

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions — the ONLY way qve_app touches these tables.
-- Each takes the caller's tenant/role EXPLICITLY as parameters (rather than
-- relying solely on session GUCs) so a function's own filtering can never be
-- defeated by a GUC-timing subtlety; RLS above remains a second, independent
-- layer in case a future role is ever granted table access directly.
-- Returning JSONB (not RETURNS TABLE with nested composites) deliberately
-- avoids the wire-protocol parsing bug class hit twice in prior features.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION qve_insert_validation_run(
  p_tenant_id UUID,
  p_question_id UUID,
  p_question_version_id UUID,
  p_version_number INT,
  p_content_hash TEXT,
  p_mode TEXT,
  p_profile TEXT,
  p_overall_status TEXT,
  p_highest_severity TEXT,
  p_blocking_codes TEXT[],
  p_eligibility_practice BOOLEAN,
  p_eligibility_timed BOOLEAN,
  p_eligibility_assessment BOOLEAN,
  p_validator_version_set JSONB,
  p_requested_by_role TEXT,
  p_requested_by_id TEXT,
  p_started_at TIMESTAMPTZ,
  p_completed_at TIMESTAMPTZ,
  p_results JSONB -- array of {validator_name,category,validator_version,status,severity,code,message,evidence,duration_ms,validated_at}
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  INSERT INTO question_validation_runs (
    question_id, question_version_id, tenant_id, version_number, content_hash, mode, profile,
    overall_status, highest_severity, blocking_codes, eligibility_practice, eligibility_timed,
    eligibility_assessment, validator_version_set, requested_by_role, requested_by_id, started_at, completed_at
  ) VALUES (
    p_question_id, p_question_version_id, p_tenant_id, p_version_number, p_content_hash, p_mode, p_profile,
    p_overall_status, p_highest_severity, p_blocking_codes, p_eligibility_practice, p_eligibility_timed,
    p_eligibility_assessment, p_validator_version_set, p_requested_by_role, p_requested_by_id, p_started_at, p_completed_at
  ) RETURNING id INTO v_run_id;

  INSERT INTO question_validation_results (validation_run_id, tenant_id, validator_name, category, validator_version, status, severity, code, message, evidence, duration_ms, validated_at)
  SELECT v_run_id, p_tenant_id, r.validator_name, r.category, r.validator_version, r.status, r.severity, r.code, r.message, r.evidence, r.duration_ms, r.validated_at
  FROM jsonb_to_recordset(p_results) AS r(
    validator_name TEXT, category TEXT, validator_version TEXT, status TEXT, severity TEXT,
    code TEXT, message TEXT, evidence JSONB, duration_ms INT, validated_at TIMESTAMPTZ
  );

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION qve_get_run_by_id(p_caller_tenant_id UUID, p_caller_role TEXT, p_run_id UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'runId', run.id, 'questionId', run.question_id, 'versionId', run.question_version_id,
    'versionNumber', run.version_number, 'mode', run.mode, 'profile', run.profile,
    'startedAt', run.started_at, 'completedAt', run.completed_at,
    'overallStatus', run.overall_status, 'highestSeverity', run.highest_severity,
    'blockingCodes', run.blocking_codes,
    'eligibility', jsonb_build_object('practice', run.eligibility_practice, 'timed', run.eligibility_timed, 'assessment', run.eligibility_assessment),
    'contentHash', run.content_hash, 'validatorVersionSet', run.validator_version_set,
    'results', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'validator', res.validator_name, 'category', res.category, 'status', res.status, 'severity', res.severity,
        'code', res.code, 'message', res.message, 'evidence', res.evidence,
        'validatorVersion', res.validator_version, 'validatedAt', res.validated_at, 'durationMs', res.duration_ms
      ))
      FROM question_validation_results res WHERE res.validation_run_id = run.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM question_validation_runs run
  WHERE run.id = p_run_id
    AND (run.tenant_id IS NULL OR run.tenant_id = p_caller_tenant_id OR p_caller_role IN ('ADMIN', 'SYSTEM'));

  RETURN v_result; -- NULL if not found OR not visible to this caller (indistinguishable on purpose)
END;
$$;

CREATE OR REPLACE FUNCTION qve_get_latest_run_for_version(p_caller_tenant_id UUID, p_caller_role TEXT, p_question_version_id UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  SELECT id INTO v_run_id FROM question_validation_runs
  WHERE question_version_id = p_question_version_id
    AND (tenant_id IS NULL OR tenant_id = p_caller_tenant_id OR p_caller_role IN ('ADMIN', 'SYSTEM'))
  ORDER BY created_at DESC LIMIT 1;

  IF v_run_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN qve_get_run_by_id(p_caller_tenant_id, p_caller_role, v_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION qve_get_validation_history(p_caller_tenant_id UUID, p_caller_role TEXT, p_question_id UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(qve_get_run_by_id(p_caller_tenant_id, p_caller_role, run.id) ORDER BY run.version_number, run.created_at), '[]'::jsonb)
  INTO v_result
  FROM question_validation_runs run
  WHERE run.question_id = p_question_id
    AND (run.tenant_id IS NULL OR run.tenant_id = p_caller_tenant_id OR p_caller_role IN ('ADMIN', 'SYSTEM'));

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION qve_insert_audit_event(
  p_tenant_id UUID, p_question_id UUID, p_validation_run_id UUID,
  p_actor_role TEXT, p_actor_id TEXT, p_action TEXT, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO validation_audit_events (tenant_id, question_id, validation_run_id, actor_role, actor_id, action, reason)
  VALUES (p_tenant_id, p_question_id, p_validation_run_id, p_actor_role, p_actor_id, p_action, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Administrative (owner-only, no EXECUTE grant to qve_app): keeps the registry
-- table in sync with the code's ValidatorRegistry at boot time, for the admin
-- Validator Health Center (spec §132) to introspect via a privileged path.
CREATE OR REPLACE FUNCTION qve_owner_upsert_validator_definition(p_name TEXT, p_category TEXT, p_version TEXT, p_depends_on TEXT[]) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO validator_definitions (name, category, current_version, depends_on, updated_at)
  VALUES (p_name, p_category, p_version, p_depends_on, now())
  ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, current_version = EXCLUDED.current_version, depends_on = EXCLUDED.depends_on, updated_at = now();
END;
$$;

ALTER FUNCTION qve_insert_validation_run OWNER TO qve_owner;
ALTER FUNCTION qve_get_run_by_id OWNER TO qve_owner;
ALTER FUNCTION qve_get_latest_run_for_version OWNER TO qve_owner;
ALTER FUNCTION qve_get_validation_history OWNER TO qve_owner;
ALTER FUNCTION qve_insert_audit_event OWNER TO qve_owner;
ALTER FUNCTION qve_owner_upsert_validator_definition OWNER TO qve_owner;

GRANT EXECUTE ON FUNCTION qve_insert_validation_run TO qve_app;
GRANT EXECUTE ON FUNCTION qve_get_run_by_id TO qve_app;
GRANT EXECUTE ON FUNCTION qve_get_latest_run_for_version TO qve_app;
GRANT EXECUTE ON FUNCTION qve_get_validation_history TO qve_app;
GRANT EXECUTE ON FUNCTION qve_insert_audit_event TO qve_app;
-- qve_owner_upsert_validator_definition is deliberately NOT granted to qve_app —
-- registry sync runs as an owner-level migration/boot step, not app traffic.

-- Minimal seed data + a global question fixture, useful for smoke-testing the
-- functions immediately after migration.
INSERT INTO questions (id, tenant_id, is_global) VALUES ('00000000-0000-0000-0000-000000000000', NULL, true) ON CONFLICT DO NOTHING;
