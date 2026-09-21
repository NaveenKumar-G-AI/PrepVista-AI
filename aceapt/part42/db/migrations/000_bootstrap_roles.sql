-- ACEAPT Feature 42 — one-time superuser bootstrap.
-- Run this ONCE, by a superuser (e.g. a DBA / infra pipeline), NOT by the
-- app's normal migration path. Everything after this file runs as
-- diag_owner, which deliberately cannot create roles or alter schema
-- ownership itself.
--
-- Why a dedicated owner/app split at all (lesson carried over from
-- Feature 28 / PROOF): if migrations are ever run as a superuser, that
-- superuser ends up owning the tables, and FORCE ROW LEVEL SECURITY does
-- NOT bind superusers — RLS would silently do nothing. Making a plain,
-- explicitly non-superuser, explicitly NOBYPASSRLS role the real owner is
-- what makes FORCE ROW LEVEL SECURITY meaningful at all.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'diag_owner') then
    create role diag_owner login password 'CHANGE_ME' nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'diag_app') then
    create role diag_app login password 'CHANGE_ME' nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- Real passwords belong in your secrets manager and are set out-of-band via
-- ALTER ROLE ... PASSWORD, never committed. DIAG_OWNER_PASSWORD /
-- DIAG_APP_PASSWORD in .env are read by db/migrate.ts and the app's pg pool.

alter database :"dbname" owner to diag_owner;
alter schema public owner to diag_owner;
create extension if not exists pgcrypto;

revoke all on schema public from public;
grant usage on schema public to diag_app;
