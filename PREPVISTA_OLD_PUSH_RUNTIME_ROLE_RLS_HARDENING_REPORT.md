# PrepVista Old-Push Runtime Role / RLS Hardening Report

## Executive Summary
The backend application uses a trusted-service model where a FastAPI Python server connects via a shared `asyncpg` connection pool. The pool connects using the `prepvista_runtime` PostgreSQL role.

Currently, `prepvista_runtime` has the `BYPASSRLS` property and a `GRANT ALL ON ALL TABLES IN SCHEMA public` privilege. 

## BYPASSRLS Decision
**Decision: C (Architecture depends on bypass; schema migration required).**

The application does NOT inject per-request JWT claims (like `request.jwt.claims`) into the database session context. As a result, the `auth.uid()` function evaluates to `NULL` for every single query executed by the backend. 

Because the backend operates with `auth.uid() = NULL`, every existing user-specific RLS policy (e.g., `(auth.uid() = user_id)`) evaluates to `FALSE` or `NULL`, effectively denying access.

The entire application relies on the global `BYPASSRLS` role property to function. It delegates tenant isolation entirely to the application layer. When `BYPASSRLS` is removed locally, all integration tests immediately fail with `asyncpg.exceptions.InsufficientPrivilegeError: new row violates row-level security policy`.

We cannot remove `BYPASSRLS` safely without deploying a forward schema migration.

## Original Role State
- `rolsuper`: False
- `rolcreaterole`: False
- `rolcreatedb`: False
- `rolcanlogin`: True
- `rolbypassrls`: True
- Broad Grant: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`

## Required Privilege Model (Schema Change Needed)
To achieve the `NOBYPASSRLS` least-privilege target, we must execute a forward migration that:
1. Replaces the global `BYPASSRLS` property with explicit, table-scoped RLS policies for `prepvista_runtime`.
2. Replaces the broad `GRANT ALL ON ALL TABLES` with explicit, table-scoped `GRANT` statements.

### Exact Required Schema/Policy Changes
A new migration (e.g., `040_runtime_least_privilege.sql`) must be created with the following structure:

```sql
-- 1. Create explicit RLS policies for the trusted backend role
CREATE POLICY prepvista_backend_bypass ON profiles FOR ALL TO prepvista_runtime USING (true) WITH CHECK (true);
CREATE POLICY prepvista_backend_bypass ON interview_sessions FOR ALL TO prepvista_runtime USING (true) WITH CHECK (true);
CREATE POLICY prepvista_backend_bypass ON organizations FOR ALL TO prepvista_runtime USING (true) WITH CHECK (true);
-- (Repeat for the ~20 other RLS-enabled application tables the backend requires)

-- 2. Revoke the broad blanket grant
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM prepvista_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM prepvista_runtime;

-- 3. Grant targeted minimal privileges
GRANT SELECT ON schema_migrations TO prepvista_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO prepvista_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON interview_sessions TO prepvista_runtime;
-- (Repeat ONLY for the application tables it needs, omitting internal/system/migration tables)

-- 4. Strip the global bypass property
ALTER ROLE prepvista_runtime NOBYPASSRLS;
```

## Security-Definer Audit
Functions marked `SECURITY DEFINER` run under the owner's privileges (typically `postgres`). These functions must be strictly scoped to prevent privilege escalation. Since `prepvista_runtime` currently operates globally as an unrestricted backend, `SECURITY DEFINER` functions do not introduce *new* risks to the runtime role itself, but they are architecturally necessary for untrusted frontend flows to safely write to the GDPR archive or trigger cron-like tasks.

## `schema_migrations` Protection
Currently, `schema_migrations` is fully writable by `prepvista_runtime` due to the broad `ALL TABLES` grant. Under the proposed model, it will be locked to `SELECT` only.

## Old User / Deletion Protection
The deletion outbox (`account_deletion_requests`) and `old_user` archive tables should retain `SELECT, INSERT, UPDATE` for the `prepvista_runtime` role to support the background saga worker.

## Conclusion
The backend is securely applying application-layer isolation. However, the database role is over-privileged. Because correcting this requires a new forward migration, and per the strict task rules I must stop and report before creating a new migration, I am halting at **Decision C**. 
