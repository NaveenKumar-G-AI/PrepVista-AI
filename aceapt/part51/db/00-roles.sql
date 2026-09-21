-- ACEAPT Feature 51 — role provisioning (run once, as a Postgres superuser).
--
-- Three roles, matching the RLS pattern used across ACEAPT features:
--   aceapt51_owner   — owns the schema; used ONLY for migrations (db:migrate).
--                      Never used by the running API server. A table owner is
--                      exempt from its own RLS policies by default in Postgres,
--                      so this role must stay out of the request path.
--   aceapt51_app     — used by the API server for normal per-student requests.
--                      RLS-bound: can only see/write rows for the student_id
--                      set on its connection via `SET LOCAL app.student_id`.
--   aceapt51_service — used for background/system work (outbox dispatch,
--                      cross-student profile snapshots, admin reporting).
--                      RLS-bound to a broader "service" policy, not to a
--                      single student.
--
-- Change the passwords below before using this anywhere but local dev —
-- these are throwaway local-dev values, not real secrets.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aceapt51_owner') THEN
    CREATE ROLE aceapt51_owner LOGIN PASSWORD 'owner_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aceapt51_app') THEN
    CREATE ROLE aceapt51_app LOGIN PASSWORD 'app_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aceapt51_service') THEN
    CREATE ROLE aceapt51_service LOGIN PASSWORD 'service_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

SELECT 'aceapt51_owner / aceapt51_app / aceapt51_service ready' AS status;
