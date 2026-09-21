-- LOCAL DEV/TEST BOOTSTRAP ONLY.
-- Real Supabase projects already provide `auth.users`, `auth.uid()`, and
-- the `authenticated` / `service_role` Postgres roles — none of this file
-- runs against a real Supabase project. It exists purely so the actual
-- migration (20260820000000_growth_tracking.sql, unmodified) can be
-- applied and its RLS policies genuinely exercised against a local
-- Postgres instance for this reference build's own testing.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Mirrors Supabase's auth.uid(): reads the caller's id from a session
-- variable set via `SET LOCAL` per request (see src/server/db.ts).
create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$ language sql stable;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_authenticated_login') then
    -- A real login role that assumes `authenticated` per-request, since
    -- Postgres roles used only with `nologin` can't open a session at all.
    create role app_authenticated_login login password 'local_dev_only' in role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role login password 'local_dev_only' bypassrls;
  end if;
end $$;

grant usage on schema public to authenticated, service_role;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant all on auth.users to service_role;

-- Minimal stand-in for CodeForge's real roster table, referenced by the
-- growth-tracking RLS policies for instructor authorization.
create table if not exists course_enrollments (
  instructor_id uuid not null references auth.users(id),
  student_id    uuid not null references auth.users(id),
  role          text not null check (role in ('instructor','student')),
  primary key (instructor_id, student_id, role)
);
grant select on course_enrollments to authenticated, service_role;
grant all on course_enrollments to service_role;

-- The real migration's tables, once created below, need matching grants:
-- SELECT for `authenticated` (RLS still restricts rows), full rights for
-- `service_role` (which bypasses RLS entirely via BYPASSRLS above).
