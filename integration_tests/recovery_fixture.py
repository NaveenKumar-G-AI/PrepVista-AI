"""Explicit workspace-owned disposable clusters only; never ambient DSNs.

The schema fixture models current prerequisites, not the complete historical
Supabase bootstrap. The real 048a/049/052 SQL runs without transformations.
"""
import os
import re
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import asyncpg
import pytest_asyncio

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=ROOT/'app/database/migrations'
DSN='postgresql://postgres@127.0.0.1:55472/postgres'
for key,value in {
    'ENVIRONMENT':'development','PREPVISTA_DEBUG':'false','DATABASE_URL':DSN,
    'SUPABASE_URL':'https://test.supabase.co','SUPABASE_ANON_KEY':'synthetic',
    'SUPABASE_SERVICE_KEY':'synthetic','SUPABASE_JWT_SECRET':'synthetic-secret-long-enough-for-tests',
}.items(): os.environ[key]=value
for key in ('MIGRATION_DATABASE_URL','PG_QUAL_DSN','PREPVISTA_IGNORE_MISSING_CRON'):
    os.environ.pop(key,None)


async def verified_admin(*, cron=False):
    dsn='postgresql://postgres@127.0.0.1:55473/postgres' if cron else DSN
    conn=await asyncpg.connect(dsn,timeout=5)
    data=(await conn.fetchval('SHOW data_directory')).replace('\\','/').lower()
    expected=('/mnt/g/PrepVista-Old-Push/.audit-runtime/recovery-pg18-mount/data' if cron
              else str(ROOT/'.audit-runtime/recovery-pg')).replace('\\','/').lower()
    if data!=expected:
        await conn.close()
        raise RuntimeError('Refusing cluster outside the explicit workspace disposable directory')
    if cron and await conn.fetchval('SHOW cron.launch_active_jobs')!='off':
        await conn.close()
        raise RuntimeError('Cron launching must be disabled for this qualification')
    return conn


async def provision_roles(conn):
    for role in ('anon','authenticated','service_role','prepvista_runtime','prepvista_worker'):
        if not await conn.fetchval('SELECT 1 FROM pg_roles WHERE rolname=$1',role):
            await conn.execute(f'CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS')


BASE_SQL='''
CREATE TABLE profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, full_name text, plan text NOT NULL DEFAULT 'free',
 subscription_status text DEFAULT 'none', admin_bonus_interviews integer NOT NULL DEFAULT 0,
 interviews_used_this_period integer NOT NULL DEFAULT 0, referral_bonus_interviews integer NOT NULL DEFAULT 0,
 org_student boolean DEFAULT false, period_start timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 created_at timestamptz DEFAULT now(), last_seen_at timestamptz,organization_id uuid
);
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,category text);
CREATE TABLE college_departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE college_years(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE college_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE user_plan_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES profiles(id), plan text,
 status text, source_order_id text, activated_at timestamptz, expires_at timestamptz,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 UNIQUE(user_id,plan)
);
CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,plan text,status text,
 razorpay_order_id text,verified_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE user_purchase_stats (
 user_id uuid PRIMARY KEY,email text,selected_plan text,highest_owned_plan text,subscription_status text,
 free_status text,free_access boolean,free_purchase_count integer,pro_status text,pro_access boolean,pro_purchase_count integer,
 career_status text,career_access boolean,career_purchase_count integer,expired_plans text[],updated_at timestamptz
);
CREATE TABLE launch_offer_grants(id uuid PRIMARY KEY,user_id uuid,status text,plan text,slot_number integer,
 requested_at timestamptz,approved_at timestamptz,reviewed_at timestamptz,expires_at timestamptz,updated_at timestamptz);
CREATE TABLE launch_offer_settings(id integer PRIMARY KEY,max_approved_slots integer);
CREATE TABLE user_plan_interviews(user_id uuid,plan text,total_interviews integer,current_cycle_start timestamptz);
CREATE TABLE user_activity_events(user_id uuid,event_type text,created_at timestamptz) PARTITION BY RANGE(created_at);
CREATE TABLE user_activity_stats(id integer PRIMARY KEY,total_users_count integer DEFAULT 0,active_users_count integer DEFAULT 0,
 inactive_users_count integer DEFAULT 0,live_window_minutes integer DEFAULT 15,updated_at timestamptz);
CREATE TABLE public_growth_metrics(id integer PRIMARY KEY,total_users_count integer,active_users_count integer,total_interviews_count integer,
 colleges_count integer,interviews_this_week_count integer,interviews_today_count integer,new_users_this_week_count integer,
 updated_at timestamptz,milestone_users_1k_at timestamptz,milestone_interviews_10k_at timestamptz);
CREATE TABLE old_user(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,full_name text,email text,archived_at timestamptz,metadata jsonb);
CREATE TABLE account_deletion_requests(id integer PRIMARY KEY,user_id uuid,status text);
CREATE TABLE usage_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,event_type text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,metadata jsonb);
CREATE TABLE billing_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
CREATE TABLE schema_migrations(version text PRIMARY KEY,checksum text,applied_at timestamptz DEFAULT now());
'''


async def base_schema(conn):
    await conn.execute(BASE_SQL)
    source=(MIGRATIONS/'049_backend_schema_access_hardening.sql').read_text(encoding='utf-8-sig')
    names=re.findall(r"'([a-z_]+)'",source.split('names text[] := ARRAY[',1)[1].split('];',1)[0])
    absent={'institutions','institution_admins','cohort_snapshots','admin_bonus_grants','org_admin_invites','org_cohort_snapshots'}
    for name in names:
        if name not in absent and not await conn.fetchval('SELECT to_regclass($1)', 'public.'+name):
            await conn.execute(f'CREATE TABLE public.{name}(id uuid PRIMARY KEY DEFAULT gen_random_uuid())')
    for name in ('fn_erasure_pseudonymise_old_user','cron_create_activity_partition'):
        await conn.execute(f"CREATE FUNCTION public.{name}() RETURNS void LANGUAGE sql AS 'SELECT';")
    await conn.execute('GRANT USAGE ON SCHEMA public TO prepvista_runtime,prepvista_worker,anon,authenticated,service_role')
    await conn.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO prepvista_runtime')
    for name in ('organizations','organization_admins','organization_students','college_departments','college_years','college_batches'):
        await conn.execute(f'ALTER TABLE {name} ENABLE ROW LEVEL SECURITY; CREATE POLICY backend_service ON {name} TO prepvista_runtime USING(true) WITH CHECK(true)')


async def apply_sql(conn, version):
    from app.database.connection import _read_migration_sql,_strip_outer_transaction
    sql=_read_migration_sql(MIGRATIONS/(version+'.sql'))
    execution,_=_strip_outer_transaction(sql)
    async with conn.transaction():
        await conn.execute(execution)


@pytest_asyncio.fixture
async def recovery_db():
    admin=await verified_admin()
    name='pv_recovery_'+uuid4().hex
    conn=None
    try:
        await provision_roles(admin)
        await admin.execute(f'CREATE DATABASE "{name}"')
        dsn=DSN.rsplit('/',1)[0]+'/'+name
        conn=await asyncpg.connect(dsn)
        await base_schema(conn)
        yield SimpleNamespace(conn=conn,dsn=dsn)
    finally:
        if conn: await conn.close()
        assert re.fullmatch(r'pv_recovery_[0-9a-f]{32}',name)
        await admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await admin.close()


@pytest_asyncio.fixture
async def repaired_db(recovery_db):
    for version in ('048a_current_schema_reconciliation','049_backend_schema_access_hardening','052_admin_grant_contract'):
        await apply_sql(recovery_db.conn,version)
    yield recovery_db


@pytest_asyncio.fixture
async def real_cron_db():
    admin=await verified_admin(cron=True)
    name='pv_recovery_cron'  # Must match the isolated postmaster's cron.database_name.
    conn=None
    try:
        await provision_roles(admin)
        if await admin.fetchval('SELECT 1 FROM pg_database WHERE datname=$1',name):
            raise RuntimeError('Unexplained existing cron fixture database; refusing reuse')
        await admin.execute(f'CREATE DATABASE {name}')
        conn=await asyncpg.connect('postgresql://postgres@127.0.0.1:55473/'+name)
        await conn.execute('CREATE EXTENSION pg_cron')
        await base_schema(conn)
        assert await conn.fetchval('SELECT count(*) FROM cron.job')==0
        yield conn
        assert await conn.fetchval('SELECT count(*) FROM cron.job')==0
    finally:
        if conn:
            await conn.close()
            await admin.execute(f'DROP DATABASE {name} WITH (FORCE)')
        await admin.close()
