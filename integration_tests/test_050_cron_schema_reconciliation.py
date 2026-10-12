"""Real pg_cron extension, dormant catalog, synthetic data; no scheduling."""
from uuid import uuid4

import asyncpg
import pytest

from recovery_fixture import real_cron_db,apply_sql,MIGRATIONS

pytestmark=pytest.mark.asyncio


async def prepare(c):
    await apply_sql(c,'048a_current_schema_reconciliation')
    await apply_sql(c,'049_backend_schema_access_hardening')
    await apply_sql(c,'050_cron_schema_reconciliation')


async def test_050_empty_real_cron_catalog_remains_empty(real_cron_db):
    c=real_cron_db
    await prepare(c)
    assert await c.fetchval("SELECT extversion FROM pg_extension WHERE extname='pg_cron'")
    assert await c.fetchval('SELECT count(*) FROM cron.job')==0
    assert not await c.fetchval("SELECT has_function_privilege('prepvista_runtime','cron_gdpr_hard_delete_old_user()','EXECUTE')")
    assert await c.fetchval("SELECT has_function_privilege('prepvista_worker','cron_gdpr_hard_delete_old_user()','EXECUTE')")


async def test_050_completion_counts_use_durable_usage_events(real_cron_db):
    c=real_cron_db
    await prepare(c)
    target=await c.fetchval('INSERT INTO profiles DEFAULT VALUES RETURNING id')
    await c.execute("INSERT INTO user_plan_interviews(user_id,plan,total_interviews) VALUES($1,'free',2)",target)
    await c.execute("INSERT INTO usage_events(user_id,event_type,created_at) VALUES($1,'interview_completed',now()-interval '5 days'),($1,'interview_completed',now())",target)
    await c.execute('SELECT public.cron_refresh_public_growth_metrics()')
    row=await c.fetchrow('SELECT interviews_this_week_count,interviews_today_count FROM public_growth_metrics WHERE id=1')
    assert tuple(row)==(2,1)


async def test_050_retention_preserves_unfinished_or_orphan_receipts(real_cron_db):
    c=real_cron_db
    await prepare(c)
    for number,status in enumerate(('PENDING','FAILED','COMPLETED'),1):
        target=uuid4()
        await c.execute('INSERT INTO account_deletion_requests(id,user_id,status) VALUES($1,$2,$3)',number,target,status)
        await c.execute("INSERT INTO old_user(user_id,archived_at,metadata) VALUES($1,now()-interval '1200 days',jsonb_build_object('deletion_requests',jsonb_build_object($2::text,'{}'::jsonb)))",target,str(number))
    await c.execute("INSERT INTO old_user(user_id,archived_at,metadata) VALUES($1,now()-interval '1200 days','{\"deletion_requests\":{\"999\":{}}}')",uuid4())
    await c.execute('SELECT public.cron_gdpr_hard_delete_old_user()')
    assert await c.fetchval('SELECT count(*) FROM old_user')==3
    assert not await c.fetchval("SELECT EXISTS(SELECT FROM old_user WHERE metadata->'deletion_requests' ? '3')")
    assert await c.fetchval('SELECT count(*) FROM cron.job')==0


async def test_050_retention_boundaries_unchanged(real_cron_db):
    c=real_cron_db
    await prepare(c)
    await c.execute("INSERT INTO usage_events(deleted_at) VALUES(now()-interval '729 days'),(now()-interval '731 days'),(NULL)")
    await c.execute("INSERT INTO billing_events(deleted_at,user_id) VALUES(now()-interval '2556 days',NULL),(now()-interval '2554 days',NULL),(now()-interval '2556 days',$1)",uuid4())
    await c.execute('SELECT public.cron_purge_usage_events(); SELECT public.cron_purge_billing_events()')
    assert await c.fetchval('SELECT count(*) FROM usage_events')==2
    assert await c.fetchval('SELECT count(*) FROM billing_events')==2
