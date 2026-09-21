-- LOCAL TEST-ONLY STUB — NOT part of the shipped migration.
--
-- Real Supabase projects provide `auth.users`, `auth.uid()`, and `auth.jwt()`
-- automatically. This file recreates the minimum surface needed to exercise
-- 001_init.sql's RLS policies against a plain, local Postgres instance in
-- this sandbox, where no live Supabase project is available. It is not
-- shipped as part of the CodeForge integration — do not run this against a
-- real Supabase database (auth.users etc. already exist there).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's real auth.uid()/auth.jwt() read from the request's verified JWT
-- claims. Here they read from a session-local setting instead, so a test can
-- simulate "logged in as user X" with `select set_config('request.jwt.claims', ...)`.
create or replace function auth.uid() returns uuid as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$ language sql stable;

create or replace function auth.jwt() returns jsonb as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ language sql stable;
