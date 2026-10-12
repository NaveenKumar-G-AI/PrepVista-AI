"""No ambient DB probing, scheduler activation, or production credentials."""
import asyncio

import asyncpg
import pytest

from recovery_fixture import real_cron_db,apply_sql
from test_050_cron_schema_reconciliation import prepare

pytestmark=pytest.mark.asyncio


async def test_051_empty_catalog_full_release_chain(real_cron_db):
    c=real_cron_db
    await prepare(c)
    await apply_sql(c,'051_pg_cron_runtime_reconciliation')
    await apply_sql(c,'052_admin_grant_contract')
    assert await c.fetchval('SELECT count(*) FROM cron.job')==0
    assert not await c.fetchval("SELECT has_table_privilege('prepvista_worker','user_activity_events','DELETE')")
    assert not await c.fetchval("SELECT has_function_privilege('authenticated','cron_refresh_activity_stats()','EXECUTE')")


@pytest.mark.parametrize('legacy_is_active',[False,True],ids=['is_active_absent','is_active_present'])
async def test_runner_production_shaped_drift_cutoff_and_complete_chain(real_cron_db,legacy_is_active):
    from app.database import connection
    from recovery_fixture import MIGRATIONS
    c=real_cron_db
    column_exists_sql="""SELECT EXISTS(SELECT FROM pg_catalog.pg_attribute
        WHERE attrelid='public.user_plan_entitlements'::regclass
          AND attname='is_active' AND attnum>0 AND NOT attisdropped)"""
    assert not await c.fetchval(column_exists_sql)
    if legacy_is_active:
        await c.execute('ALTER TABLE public.user_plan_entitlements ADD COLUMN is_active boolean')
    baseline={p.stem:connection._compute_migration_checksum(connection._read_migration_sql(p))
              for p in MIGRATIONS.glob('*.sql') if p.stem<='048_account_deletion_claim_leases'}
    baseline['046_production_only']='synthetic-preserved-history'
    await c.executemany('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',baseline.items())
    await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(9992),(9993)')
    assert await connection._run_migrations(c,through='049_backend_schema_access_hardening')==2
    assert await c.fetchval("SELECT to_regclass('admin_grant_operations')") is None
    committed_before=dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    functions={
        'cron_gdpr_pseudonymise_old_user':'old_user',
        'cron_gdpr_hard_delete_old_user':'old_user',
        'cron_refresh_public_growth_metrics':'public_growth_metrics',
        'cron_purge_usage_events':'usage_events',
        'cron_purge_billing_events':'billing_events',
    }
    for name in functions:
        assert await c.fetchval('SELECT to_regprocedure($1)','public.'+name+'()') is None
    assert await c.fetchval("SELECT to_regprocedure('public.fn_refresh_is_active()')") is None
    assert not await c.fetchval("SELECT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.user_plan_entitlements'::regclass AND tgname='trg_upe_refresh_is_active')")
    target=await c.fetchval('SELECT id FROM profiles ORDER BY id LIMIT 1')
    await c.execute("""INSERT INTO user_plan_entitlements(user_id,plan,status,source_order_id,activated_at,expires_at)
        VALUES($1,'pro','active','synthetic_purchase',now()-interval '1 day',now()+interval '29 days'),
              ($1,'career','expired','manual_grant',now()-interval '60 days',now()-interval '30 days')""",target)
    if legacy_is_active:
        await c.execute("UPDATE user_plan_entitlements SET is_active=(status='active')")
        await c.execute("""CREATE FUNCTION public.fn_refresh_is_active() RETURNS trigger LANGUAGE plpgsql
            AS $$ BEGIN NEW.is_active := (NEW.status='active'); RETURN NEW; END $$;
            CREATE TRIGGER trg_upe_refresh_is_active BEFORE INSERT OR UPDATE ON public.user_plan_entitlements
            FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_is_active()""")
    # These rows would change if a retention/metrics function were executed.
    await c.execute("INSERT INTO old_user(full_name,email,archived_at) VALUES('Synthetic','synthetic@example.test',now()-interval '1200 days'),(NULL,NULL,now()-interval '1200 days')")
    await c.execute("INSERT INTO usage_events(deleted_at) VALUES(now()-interval '800 days')")
    await c.execute("INSERT INTO billing_events(deleted_at) VALUES(now()-interval '2600 days')")
    await c.execute('INSERT INTO public_growth_metrics(id,total_users_count) VALUES(1,987)')
    await c.execute('INSERT INTO user_activity_stats(id,total_users_count) VALUES(1,654)')
    tables=('user_plan_entitlements','old_user','usage_events','billing_events','public_growth_metrics','user_activity_stats')
    rows_before={table:await c.fetch(f'SELECT xmin::text AS row_version,* FROM public.{table} ORDER BY id') for table in tables}
    partitions_before=await c.fetch("SELECT relid FROM pg_partition_tree('public.user_activity_events') ORDER BY relid")
    rls_before={table:await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass','public.'+table)
                for table in set(functions.values())|{'user_activity_events'}}

    async def assert_security():
        for name,table in {**functions,'cron_create_activity_partition':'user_activity_events'}.items():
            signature='public.'+name+'()'
            routine=await c.fetchrow('SELECT prosecdef,proconfig,proowner,proacl FROM pg_proc WHERE oid=$1::regprocedure',signature)
            assert routine['prosecdef']
            assert routine['proconfig']==['search_path=pg_catalog, public, pg_temp']
            assert routine['proowner']==await c.fetchval('SELECT relowner FROM pg_class WHERE oid=$1::regclass','public.'+table)
            assert not await c.fetchval("SELECT EXISTS(SELECT FROM pg_proc p,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')",signature)
            for role in ('anon','authenticated','service_role','prepvista_runtime'):
                assert not await c.fetchval("SELECT has_function_privilege($1,$2,'EXECUTE')",role,signature)
            assert await c.fetchval("SELECT has_function_privilege('prepvista_worker',$1,'EXECUTE')",signature)
            assert await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass','public.'+table)==rls_before[table]
            assert not await c.fetchval("SELECT has_table_privilege('prepvista_worker',$1,'INSERT,UPDATE,DELETE')",'public.'+table)

    for version in ('050_cron_schema_reconciliation','051_pg_cron_runtime_reconciliation','052_admin_grant_contract'):
        assert await connection._run_migrations(c,through=version)==1
        assert await c.fetchval('SELECT count(*) FROM schema_migrations WHERE version=$1',version)==1
        assert await c.fetchval('SELECT count(*) FROM cron.job')==0
        assert await c.fetchval('SELECT count(*) FROM cron.job WHERE active')==0
        assert await c.fetchval(column_exists_sql)==legacy_is_active
        for table,rows in rows_before.items():
            assert await c.fetch(f'SELECT xmin::text AS row_version,* FROM public.{table} ORDER BY id')==rows
        assert await c.fetch("SELECT relid FROM pg_partition_tree('public.user_activity_events') ORDER BY relid")==partitions_before
        await assert_security()
    assert await connection._run_migrations(c,through='052_admin_grant_contract')==0
    assert await c.fetchval("SELECT to_regprocedure('public.fn_refresh_is_active()')") is None
    assert not await c.fetchval("SELECT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.user_plan_entitlements'::regclass AND tgname='trg_upe_refresh_is_active')")
    if legacy_is_active:
        assert await c.fetchval("SELECT col_description(attrelid,attnum) FROM pg_attribute WHERE attrelid='public.user_plan_entitlements'::regclass AND attname='is_active' AND NOT attisdropped")=='DEPRECATED: Unused by backend. Replaced by explicit status updates.'
    assert await c.fetchval("SELECT to_regclass('public.admin_grant_operations')") is not None
    assert await c.fetchval('SELECT count(*) FROM admin_grant_operations')==0
    with pytest.raises(asyncpg.CheckViolationError):
        await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(1001)')
    ledger=dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    assert all(ledger[v]==checksum for v,checksum in committed_before.items())
    assert len(ledger)==len(committed_before)+3
    for version in ('050_cron_schema_reconciliation','051_pg_cron_runtime_reconciliation','052_admin_grant_contract'):
        assert ledger[version]==connection._compute_migration_checksum(connection._read_migration_sql(MIGRATIONS/(version+'.sql')))
    assert await c.fetchval('SELECT count(*) FROM cron.job')==0
    assert [r[0] for r in await c.fetch('SELECT admin_bonus_interviews FROM profiles ORDER BY 1')]==[9992,9993]


async def test_051_missing_stats_fails_before_retention(real_cron_db):
    c=real_cron_db
    await prepare(c)
    await apply_sql(c,'051_pg_cron_runtime_reconciliation')
    await c.execute('CREATE UNLOGGED TABLE activity_default PARTITION OF user_activity_events DEFAULT')
    await c.execute("INSERT INTO user_activity_events(created_at) VALUES(now()-interval '2 days')")
    with pytest.raises(asyncpg.RaiseError,match='singleton missing'):
        await c.execute('SELECT public.cron_refresh_activity_stats()')
    assert await c.fetchval('SELECT count(*) FROM user_activity_events')==1
    await c.execute('INSERT INTO user_activity_stats(id,total_users_count) VALUES(1,1)')
    await c.execute('SELECT public.cron_refresh_activity_stats()')
    assert await c.fetchval('SELECT count(*) FROM user_activity_events')==0


async def test_051_partition_wrong_end_fails(real_cron_db):
    c=real_cron_db
    await prepare(c)
    await apply_sql(c,'051_pg_cron_runtime_reconciliation')
    name,start,end=await c.fetchrow("SELECT 'user_activity_events_'||to_char(now()+interval '1 month','YYYY_MM'),date_trunc('month',now()+interval '1 month'),date_trunc('month',now()+interval '3 months')")
    await c.execute(f"CREATE UNLOGGED TABLE {name} PARTITION OF user_activity_events FOR VALUES FROM ('{start.isoformat()}') TO ('{end.isoformat()}')")
    with pytest.raises(asyncpg.RaiseError,match='bound expression'):
        await c.execute('SELECT public.cron_create_activity_partition()')


async def test_051_concurrent_partition_creation_and_temp_shadow(real_cron_db):
    c=real_cron_db
    await prepare(c)
    await apply_sql(c,'051_pg_cron_runtime_reconciliation')
    name=await c.fetchval("SELECT 'user_activity_events_'||to_char(now()+interval '1 month','YYYY_MM')")
    async def create():
        worker=await asyncpg.connect('postgresql://prepvista_worker@127.0.0.1:55473/pv_recovery_cron')
        try:
            await worker.execute(f'CREATE TEMP TABLE {name}(id integer)')
            await worker.execute('SELECT public.cron_create_activity_partition()')
        finally: await worker.close()
    await asyncio.gather(create(),create())
    assert await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass','public.'+name)
    assert not await c.fetchval("SELECT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE')",'public.'+name)
