-- ACEAPT Feature 42 — Migration 006
--
-- REAL BUG, found by the integration test suite (not by inspection):
--
-- Once a connection has EVER called set_config('app.current_student_id', v,
-- true) — which every legitimate SECURITY DEFINER call does — Postgres
-- registers that custom GUC name as a known "placeholder" on that backend
-- for the rest of the connection's lifetime. After the transaction that set
-- it ends (commit OR rollback), the value reverts — but to an EMPTY STRING,
-- not back to "unset". current_setting(name, true) on a NEVER-touched
-- custom GUC returns NULL; on a touched-then-reverted one it returns ''.
--
-- The original policies did:
--   student_id = current_setting('app.current_student_id', true)::uuid
-- ''::uuid raises "invalid input syntax for type uuid", and per Postgres's
-- own planning behavior this can surface DURING QUERY PLANNING (current_setting
-- is STABLE, so the planner may evaluate it while building the RLS-augmented
-- plan) — BEFORE the executor-start permission check would otherwise report
-- "permission denied". Net effect verified: diag_app still cannot read or
-- write a single row either way (confirmed via a dedicated grant-check test
-- both before and after this fix) — there is no data exposure — but a
-- connection's prior history changed which SAFE failure mode a caller saw,
-- which is a real robustness bug and made one test assertion
-- (expecting a specific error message) fragile.
--
-- Fix: nullif(x, '') turns the reverted-placeholder empty string into a
-- real NULL before the cast, so it's always the NULL-safe path — matching
-- the "never set" case exactly, with no cast error possible either way.

begin;

drop policy diag_sessions_isolation on diagnostic_sessions;
create policy diag_sessions_isolation on diagnostic_sessions
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_exposures_isolation on diagnostic_question_exposures;
create policy diag_exposures_isolation on diagnostic_question_exposures
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_responses_isolation on diagnostic_responses;
create policy diag_responses_isolation on diagnostic_responses
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_evidence_isolation on diagnostic_evidence;
create policy diag_evidence_isolation on diagnostic_evidence
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_skill_estimates_isolation on diagnostic_skill_estimates;
create policy diag_skill_estimates_isolation on diagnostic_skill_estimates
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_snapshots_isolation on diagnostic_snapshots;
create policy diag_snapshots_isolation on diagnostic_snapshots
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy diag_recommendations_isolation on diagnostic_recommendations;
create policy diag_recommendations_isolation on diagnostic_recommendations
  using (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
         and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (student_id = nullif(current_setting('app.current_student_id', true), '')::uuid
              and tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

commit;
