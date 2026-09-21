-- =============================================================================
-- bootstrap-roles.sql
-- Run ONCE, by a Postgres superuser, before the numbered migrations. This is
-- deliberately separate from db/migrations/*.sql: creating roles and granting
-- BYPASSRLS are cluster-level privileged operations, not schema changes owned
-- by the application. Keeping them apart means the ordinary migration runner
-- (which authenticates as aceapt_owner, a non-superuser) can never accidentally
-- be used to mint a new BYPASSRLS role.
--
-- Usage:
--   psql -U postgres -f db/bootstrap-roles.sql
--
-- Change every password below before using this anywhere but local dev.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aceapt_owner') THEN
    CREATE ROLE aceapt_owner LOGIN PASSWORD 'aceapt_owner_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aceapt_app') THEN
    CREATE ROLE aceapt_app LOGIN PASSWORD 'aceapt_app_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aceapt_worker') THEN
    CREATE ROLE aceapt_worker LOGIN PASSWORD 'aceapt_worker_pw';
  END IF;
END
$$;

-- aceapt_worker is the ONLY role allowed to bypass RLS, and only because the
-- offline market-intelligence batch job legitimately needs to read across
-- students to fan out recomputation. Its credentials must stay out of the
-- HTTP-facing process's environment.
ALTER ROLE aceapt_worker BYPASSRLS;

-- aceapt_owner owns the database and schema so it can run migrations
-- (CREATE TABLE / CREATE POLICY / etc). It is NEVER used by the running app,
-- because Postgres exempts a table's own owner from that table's RLS
-- policies -- connecting as the owner would silently make every policy in
-- 005_rls_policies.sql a no-op.
SELECT 'CREATE DATABASE aceapt_feature40 OWNER aceapt_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aceapt_feature40')\gexec

GRANT ALL ON SCHEMA public TO aceapt_owner;
GRANT CONNECT ON DATABASE aceapt_feature40 TO aceapt_app, aceapt_worker;
