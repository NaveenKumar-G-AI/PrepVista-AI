-- Run once, as a Postgres superuser, before the first migration.
-- Creates the database and the dedicated non-superuser application role
-- that Row Level Security is enforced against.
--
-- IMPORTANT: the Express app must connect as goal_app, never as the
-- migration/owner role and never as a superuser. RLS policies are not
-- applied to superusers or table owners unless FORCE ROW LEVEL SECURITY
-- is set, and even then, superusers still bypass RLS entirely.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'goal_app') THEN
    CREATE ROLE goal_app LOGIN PASSWORD 'local_dev_only_change_me';
  END IF;
END
$$;

-- Database owned by whichever role runs migrations (defaults to the
-- connecting superuser, e.g. postgres). goal_app is NOT the owner.
