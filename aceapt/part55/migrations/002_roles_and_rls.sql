-- =============================================================================
-- FEATURE 55 — Migration 002: roles + Row Level Security
--
-- Two application roles, least privilege:
--   difficulty_app          full column access to all difficulty_* tables,
--                            row-scoped to tenant. Used by the admin API and
--                            the calibration workers.
--   difficulty_student_app  column-restricted read access to ONE view
--                            (student_difficulty_view) — no facility, no
--                            sample size, no evidence. Used by student-facing
--                            endpoints (spec §115, §156-157: a student must
--                            never be able to query raw item statistics).
--
-- Both roles are created LOGIN but WITHOUT a password here — passwords are
-- set separately via scripts/set-role-passwords.sh, sourced from environment
-- variables that are left blank in .env.example.
--
-- Migrations run as a privileged owner (postgres / a migration-only role in
-- real deployment) which owns every table below. Table owners are exempt
-- from their own RLS policies by default, which is exactly what we want:
-- migrations and admin tooling run as the owner; difficulty_app and
-- difficulty_student_app are non-owner grantees and are therefore always
-- subject to RLS, with no FORCE ROW LEVEL SECURITY needed.
-- =============================================================================

DO $$ BEGIN
  CREATE ROLE difficulty_app LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE difficulty_student_app LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- difficulty_app: full columns, tenant-scoped rows -----------------------

GRANT SELECT, INSERT, UPDATE ON
  difficulty_calibration_runs,
  difficulty_snapshots,
  difficulty_history,
  difficulty_anomalies,
  difficulty_review_actions,
  difficulty_initial_estimates
TO difficulty_app;
-- No DELETE grant anywhere: history/snapshots/anomalies are append-and-supersede,
-- never deleted, so the audit trail (spec §158) can't be erased through this role.

ALTER TABLE difficulty_calibration_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_anomalies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_review_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_initial_estimates  ENABLE ROW LEVEL SECURITY;

-- app.tenant_id is set per-request by the API layer via
-- SET LOCAL app.tenant_id = '<uuid>' inside the request's transaction
-- (see src/db/pool.ts withTenant()). current_setting(..., true) returns NULL
-- rather than raising when unset, so a request that forgets to set it fails
-- closed (NULL = anything is never true) instead of open.

CREATE POLICY app_tenant_isolation ON difficulty_calibration_runs
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY app_tenant_isolation ON difficulty_snapshots
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY app_tenant_isolation ON difficulty_history
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY app_tenant_isolation ON difficulty_anomalies
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY app_tenant_isolation ON difficulty_review_actions
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY app_tenant_isolation ON difficulty_initial_estimates
  FOR ALL TO difficulty_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- difficulty_app also needs to read the existing analytics it doesn't own.
-- In the real ACEAPT codebase, replace this with whatever grant/role the
-- existing attempts/question-versions repositories already use — Feature 55
-- should not need a bespoke grant here if an existing analytics-readonly
-- role already covers these tables.
GRANT SELECT ON questions, question_versions, attempts, students, skills TO difficulty_app;

-- ---- difficulty_student_app: column-restricted, tenant + active-only -------

-- Column-level grant: even a misconfigured application query against the
-- base table (bypassing the view) cannot select facility, sample_size,
-- confidence intervals, or any other evidence column. This is tested in
-- scripts/verify-rls.sh — see README "Bugs found and fixed".
GRANT SELECT (question_version_id, population_id, mode, category, status, tenant_id)
  ON difficulty_snapshots TO difficulty_student_app;

CREATE POLICY student_tenant_isolation ON difficulty_snapshots
  FOR SELECT TO difficulty_student_app
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND is_active = true
  );

-- security_invoker means Postgres checks privileges/RLS as the querying role
-- (difficulty_student_app), not the view owner — so the column grant and
-- policy above are what actually protect the data; the view is a convenience,
-- not the security boundary.
CREATE OR REPLACE VIEW student_difficulty_view
  WITH (security_invoker = true) AS
SELECT
  question_version_id,
  population_id,
  mode,
  category,
  (status = 'CALIBRATED') AS is_well_established,
  tenant_id
FROM difficulty_snapshots;

GRANT SELECT ON student_difficulty_view TO difficulty_student_app;
