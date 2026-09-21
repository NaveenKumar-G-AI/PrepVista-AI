-- 0004_rls_policies.sql
--
-- Threat model this file defends against (see spec's SECURITY / SUPABASE-RLS
-- sections):
--   * Student A reading Student B's correctness assessment / findings /
--     requirement coverage (cross-user read).
--   * Student A modifying ANY correctness row — including their own —
--     from the client. Correctness is a server-derived fact, not a
--     client-editable one, so `authenticated` gets no INSERT/UPDATE/DELETE
--     policy at all on these tables. Only the server's service-role
--     connection (which bypasses RLS, per Supabase convention) writes
--     rows, after deriving user_id/submission ownership itself — never
--     from client-supplied fields (see SECURITY requirement: "Never trust
--     client-provided user_id/submission_id/verdict/...").
--
-- On real Supabase, `auth.uid()`, the `authenticated` role, and the
-- `service_role` role already exist — this file only adds policies. The
-- LOCAL-ONLY shim that recreates auth.uid()/roles for verification in
-- this sandbox lives in db-verification/, clearly separated so it is
-- never mistaken for something to run against a real Supabase project.

ALTER TABLE correctness_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE correctness_findings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_checks      ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner, so a misconfigured connection pool
-- that connects as the owning role doesn't silently bypass these checks.
ALTER TABLE correctness_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE correctness_findings    FORCE ROW LEVEL SECURITY;
ALTER TABLE requirement_checks      FORCE ROW LEVEL SECURITY;

CREATE POLICY correctness_assessments_select_own
  ON correctness_assessments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY correctness_findings_select_own
  ON correctness_findings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY requirement_checks_select_own
  ON requirement_checks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Deliberately NO INSERT/UPDATE/DELETE policies for `authenticated` on any
-- of the three tables: with RLS enabled and no permissive policy for a
-- command, that command is denied outright for that role. Writes happen
-- exclusively through the server's service_role connection.
