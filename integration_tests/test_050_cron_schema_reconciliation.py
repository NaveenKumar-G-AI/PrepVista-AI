import pytest
import pytest_asyncio
import asyncpg
import json
import hashlib
import urllib.parse
from uuid import uuid4
from types import SimpleNamespace
try:
    from scripts.audit_049_fixture import h, META
except Exception:
    pytest.skip("Historical 050 audit fixture unavailable", allow_module_level=True)
    h = None
    META = None
from pathlib import Path

# Note: this requires PREPVISTA_IGNORE_MISSING_CRON=1 when pg_cron is not present locally.

@pytest_asyncio.fixture
async def case050(monkeypatch):
    meta = json.loads(META.read_text())
    admin = await h.asyncpg.connect(h.DSN)
    name = 'p1_migration_050_' + uuid4().hex
    await admin.execute(f'CREATE DATABASE "{name}" TEMPLATE "{meta["database"]}"')
    dsn = h.DSN.rsplit('/', 1)[0] + '/' + name
    c = await h.asyncpg.connect(dsn)
    
    # We want 050 to run.
    monkeypatch.setattr(h.db, 'get_settings', lambda: SimpleNamespace(DATABASE_URL=dsn, MIGRATION_LOCK_TIMEOUT_SECONDS=30., DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=2))
    
    # We must mock pg_cron for the migration if it's not present.
    await c.execute('''
        CREATE SCHEMA IF NOT EXISTS cron;
        DROP TABLE IF EXISTS cron.job CASCADE;
        CREATE TABLE cron.job (
            jobid bigint primary key,
            schedule text,
            command text,
            nodename text,
            nodeport integer,
            database text,
            username text,
            active boolean,
            jobname text
        );
        CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text) RETURNS bigint AS $$ SELECT 1::bigint; $$ LANGUAGE sql;
        CREATE OR REPLACE FUNCTION cron.schedule(jobname text, schedule text, command text) RETURNS bigint AS $$ SELECT 1::bigint; $$ LANGUAGE sql;
        CREATE OR REPLACE FUNCTION cron.unschedule(jobid bigint) RETURNS boolean AS $$ SELECT true; $$ LANGUAGE sql;
        CREATE OR REPLACE FUNCTION cron.unschedule(jobname text) RETURNS boolean AS $$ SELECT true; $$ LANGUAGE sql;
        CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null) RETURNS void AS $$ BEGIN UPDATE cron.job SET command = COALESCE($3, cron.job.command) WHERE jobid = $1; END; $$ LANGUAGE plpgsql;
        
        INSERT INTO cron.job (jobid, schedule, command, nodename, nodeport, database, username, active, jobname) VALUES 
        (1, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'reconcile-is-active'),
        (2, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'gdpr-pseudonymise-old-user'),
        (3, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'gdpr-hard-delete-old-user'),
        (4, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'refresh-public-growth-metrics'),
        (5, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'purge-usage-events'),
        (6, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'purge-billing-events'),
        (7, '0 0 * * *', 'old', 'localhost', 5432, 'postgres', 'prepvista_worker', true, 'create-activity-partition');
    ''')

    import os
    monkeypatch.setenv("PREPVISTA_IGNORE_MISSING_CRON", "1")
    
    # Apply all migrations including 050
    await h.db._run_migrations(c)
    
    yield SimpleNamespace(c=c, dsn=dsn, ids=json.loads((h.ART / '049-fixture-seed.json').read_text()))
    
    await c.close()
    await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
    await admin.close()

@pytest.mark.asyncio
async def test_entitlement_cleanup(case050):
    c = case050.c
    # Verify is_active still exists but triggers are removed
    assert await c.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='user_plan_entitlements' AND column_name='is_active')")
    assert not await c.fetchval("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_upe_refresh_is_active')")
    assert not await c.fetchval("SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_refresh_is_active')")

@pytest.mark.asyncio
async def test_security_definer_functions(case050):
    c = case050.c
    funcs = ['cron_gdpr_pseudonymise_old_user', 'cron_gdpr_hard_delete_old_user', 'cron_refresh_public_growth_metrics', 'cron_purge_usage_events', 'cron_purge_billing_events', 'cron_create_activity_partition']
    for f in funcs:
        row = await c.fetchrow("SELECT prosecdef, proconfig FROM pg_proc WHERE proname=$1", f)
        assert row is not None
        assert row['prosecdef'] is True
        assert row['proconfig'] == ['search_path=pg_catalog, public, pg_temp']

@pytest.mark.asyncio
async def test_function_acls(case050):
    c = case050.c
    funcs = ['cron_gdpr_pseudonymise_old_user', 'cron_refresh_public_growth_metrics']
    for f in funcs:
        # Worker allowed
        assert await c.fetchval("SELECT has_function_privilege('prepvista_worker', $1 || '()', 'execute')", f)
        # Public denied
        assert not await c.fetchval("SELECT has_function_privilege('anon', $1 || '()', 'execute')", f)
        assert not await c.fetchval("SELECT has_function_privilege('authenticated', $1 || '()', 'execute')", f)
        assert not await c.fetchval("SELECT has_function_privilege('prepvista_runtime', $1 || '()', 'execute')", f)

@pytest.mark.asyncio
async def test_worker_direct_dml(case050):
    c = case050.c
    tables = ['old_user', 'usage_events', 'billing_events', 'public_growth_metrics', 'profiles']
    for t in tables:
        assert not await c.fetchval("SELECT has_table_privilege('prepvista_worker', 'public.' || $1, 'INSERT')", t)
        assert not await c.fetchval("SELECT has_table_privilege('prepvista_worker', 'public.' || $1, 'UPDATE')", t)
        assert not await c.fetchval("SELECT has_table_privilege('prepvista_worker', 'public.' || $1, 'DELETE')", t)
    
    # user_activity_stats UPDATE remains
    assert await c.fetchval("SELECT has_table_privilege('prepvista_worker', 'public.user_activity_stats', 'UPDATE')")

@pytest.mark.asyncio
async def test_migration_ledger(case050):
    c = case050.c
    # 050 ledger row exactly once
    assert await c.fetchval("SELECT COUNT(*) FROM schema_migrations WHERE version LIKE '050_%'") == 1
    
    # Verify 049 checksum remains unchanged
    chk = await c.fetchval("SELECT checksum FROM schema_migrations WHERE version LIKE '049_%'")
    assert chk == "40b5d3476fdf105fd6204659a6c87f835a56304b64aed28260413eac4787cb09"

