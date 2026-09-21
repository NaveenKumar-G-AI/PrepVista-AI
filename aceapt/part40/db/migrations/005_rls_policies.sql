-- =============================================================================
-- 005_rls_policies.sql
-- Per-student data isolation (spec ??85: "student ownership, tenant isolation").
--
-- DESIGN NOTE (learned the hard way on Feature 29): a table's OWNING role is
-- exempt from RLS by default in Postgres, so if the app connects as the same
-- role that ran the migrations, every policy below is silently a no-op. This
-- build avoids that from the start by using two distinct roles:
--   - aceapt_owner  : owns the schema, runs migrations. NEVER used by the app.
--   - aceapt_app    : the only role the HTTP server connects as. RLS binds to
--                      it because it does not own any table. Every request
--                      handler must SET LOCAL app.current_student_id before
--                      touching a student-scoped table (see
--                      src/db/pool.ts -> withStudentContext()).
--   - aceapt_worker : BYPASSRLS. Used ONLY by the offline market-intelligence
--                      batch job (src/services/marketIntelligence.service.ts
--                      run in worker mode), which legitimately needs to read
--                      across students to fan out gap recomputation, then
--                      writes each student's rows under their own
--                      app.current_student_id anyway (belt-and-suspenders).
--                      This role's credentials must never be handed to the
--                      HTTP-facing process.
-- =============================================================================

CREATE OR REPLACE FUNCTION current_student_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_student_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- NOTE: "ALTER ROLE aceapt_worker BYPASSRLS" is deliberately NOT here.
-- Granting BYPASSRLS requires the CREATEROLE attribute, which aceapt_owner
-- (a plain schema-owning role, by design) does not have and should not be
-- given -- role bootstrapping is a separate, more privileged operation from
-- ordinary schema migrations. Run db/bootstrap-roles.sql once as a Postgres
-- superuser before this migration. (Discovered by actually running this
-- migration end to end: aceapt_owner correctly got "permission denied to
-- alter role", which is exactly the least-privilege behavior we want.)

-- Give the app role usage + row-level DML on everything; RLS policies below
-- then narrow what each statement can actually see/touch.
GRANT USAGE ON SCHEMA public TO aceapt_app, aceapt_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aceapt_app, aceapt_worker;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO aceapt_app, aceapt_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aceapt_app, aceapt_worker;

-- ---- students: a student may only see their own row --------------------------
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY students_self ON students
  USING (id = current_student_id());

-- ---- Feature 33-39 stand-ins that carry private student data -----------------
ALTER TABLE career_directions ENABLE ROW LEVEL SECURITY;
CREATE POLICY career_directions_isolation ON career_directions
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_items_isolation ON evidence_items
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE positioning_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY positioning_snapshots_isolation ON positioning_snapshots
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY applications_isolation ON applications
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

-- ---- Feature 40's own student-scoped tables -----------------------------------
ALTER TABLE future_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY future_gaps_isolation ON future_gaps
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE career_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY career_scenarios_isolation ON career_scenarios
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE career_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY career_experiments_isolation ON career_experiments
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

ALTER TABLE market_insights ENABLE ROW LEVEL SECURITY;
-- market_insights can be role-level (student_id IS NULL, not yet personalized)
-- as well as personalized; expose role-level rows to everyone, personal rows
-- only to their owner.
CREATE POLICY market_insights_isolation ON market_insights
  USING (student_id IS NULL OR student_id = current_student_id())
  WITH CHECK (student_id IS NULL OR student_id = current_student_id());

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_isolation ON outbox_events
  USING (student_id IS NULL OR student_id = current_student_id())
  WITH CHECK (student_id IS NULL OR student_id = current_student_id());

-- Market-level tables (roles, skills, market_snapshots, market_signals,
-- role_evolutions, skill_trends, skill_combinations, technology_signals,
-- opportunities) intentionally have NO RLS: they are not student-owned data,
-- and every student targeting a role needs to read the same market rows.
