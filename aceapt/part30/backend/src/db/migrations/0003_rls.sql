-- 0003_rls.sql
--
-- Tenant isolation via Postgres RLS. Convention: every request runs inside
-- a transaction that does `SET LOCAL app.current_tenant_id = '<uuid>'`
-- (see src/db/pool.ts:withTenant) before touching any tenant-scoped table.
-- Policies below trust that setting and nothing else -- there is no way to
-- read across tenants through the application's normal connection role.
--
-- A dedicated, non-superuser role is what actually makes RLS enforceable
-- (table owners and superusers bypass RLS by default in Postgres), so this
-- migration also creates `path_app` and forces every tenant-scoped table to
-- apply its policies even to the table owner.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'path_app') THEN
    CREATE ROLE path_app LOGIN PASSWORD 'change_me_path_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO path_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO path_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO path_app;

-- helper macro-by-hand: repeat for every tenant-scoped table
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_students ON students
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_capabilities ON capabilities
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_targets ON targets
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- target_requirements / student_targets / student_capability_state / evidence_events
-- have no tenant_id of their own (Section 6: reuse, don't duplicate) --
-- they inherit isolation by joining through students/targets, both of
-- which are already RLS-protected. An EXISTS policy enforces that a row is
-- only visible if its parent student (and, where relevant, target) is
-- visible under the current tenant setting.
ALTER TABLE target_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_target_requirements ON target_requirements
  USING (EXISTS (SELECT 1 FROM targets t WHERE t.id = target_requirements.target_id))
  WITH CHECK (EXISTS (SELECT 1 FROM targets t WHERE t.id = target_requirements.target_id));

ALTER TABLE student_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_targets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_student_targets ON student_targets
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = student_targets.student_id))
  WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = student_targets.student_id));

ALTER TABLE student_capability_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_capability_state FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_student_capability_state ON student_capability_state
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = student_capability_state.student_id))
  WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = student_capability_state.student_id));

ALTER TABLE evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_evidence_events ON evidence_events
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = evidence_events.student_id))
  WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = evidence_events.student_id));

-- PATH's own tables all carry tenant_id directly.
ALTER TABLE paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE paths FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_paths ON paths
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_stages ON path_stages
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_milestones ON path_milestones
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_actions ON path_actions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_snapshots ON path_snapshots
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_risks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_risks ON path_risks
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE path_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_path_events ON path_events
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
