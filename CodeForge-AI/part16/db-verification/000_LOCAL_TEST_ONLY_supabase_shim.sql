-- =============================================================================
-- LOCAL VERIFICATION ONLY. DO NOT RUN THIS AGAINST A REAL SUPABASE PROJECT.
-- =============================================================================
-- On real Supabase, `auth.uid()`, the `authenticated` role, and the
-- `service_role` role are provided by the platform itself. This file
-- recreates the same *shape* on a bare local Postgres so the RLS policies
-- in src/persistence/migrations/0004_rls_policies.sql can be verified for
-- real, against real query results, rather than just read and trusted.
--
-- The recreation mirrors Supabase's real convention: PostgREST sets the
-- GUC `request.jwt.claims` (a JSON string) per request, and Supabase's
-- auth.uid() extracts the `sub` claim from it.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
  $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cf_app_authenticated') THEN
    -- A real LOGIN role (distinct from the `postgres` superuser) so tests
    -- connect as a genuinely non-superuser session. Superuser status can
    -- interact with RLS bypass semantics in ways that would make a
    -- superuser-based test unconvincing; connecting as an ordinary login
    -- role removes that ambiguity entirely.
    CREATE ROLE cf_app_authenticated LOGIN PASSWORD 'local_test_only' NOSUPERUSER NOBYPASSRLS;
    GRANT authenticated TO cf_app_authenticated;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON correctness_assessments, correctness_findings, requirement_checks TO authenticated;
-- Deliberately NOT granting INSERT/UPDATE/DELETE to `authenticated` — see 0004_rls_policies.sql.
