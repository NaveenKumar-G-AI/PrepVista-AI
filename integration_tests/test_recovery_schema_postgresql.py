import asyncio
import re
from datetime import datetime,timedelta,timezone
from uuid import uuid4

import asyncpg
import pytest
from fastapi import HTTPException

from recovery_fixture import recovery_db,repaired_db,apply_sql,MIGRATIONS
from app.routers.admin_grants import AdminGrantRequest,apply_admin_grant
from app.services.quota import _ensure_current_usage_period

pytestmark=pytest.mark.asyncio


async def test_reconciliation_empty_current_tables_and_repeat_validation(recovery_db):
    c=recovery_db.conn
    await apply_sql(c,'048a_current_schema_reconciliation')
    await apply_sql(c,'048a_current_schema_reconciliation')
    for table in ('admin_bonus_grants','org_admin_invites','org_cohort_snapshots'):
        assert await c.fetchval(f'SELECT count(*) FROM {table}')==0
        assert await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',table)
    for legacy in ('institutions','institution_admins','cohort_snapshots'):
        assert await c.fetchval('SELECT to_regclass($1)',legacy) is None
    assert await c.fetchval("SELECT pg_get_serial_sequence('org_cohort_snapshots','id')")=='public.org_cohort_snapshots_id_seq'


async def test_reconciliation_accepts_historical_canonical_tables_preserving_rows(recovery_db):
    c=recovery_db.conn
    for table,file in [('admin_bonus_grants','012_admin_bonus.sql'),('org_admin_invites','017_college_organization.sql'),('org_cohort_snapshots','017_college_organization.sql')]:
        source=(MIGRATIONS/file).read_text(encoding='utf-8-sig')
        ddl=re.search(r'CREATE TABLE IF NOT EXISTS '+table+r' \(.*?\n\);',source,re.S).group()
        await c.execute(ddl)
        for index in re.finditer(r'CREATE (?:UNIQUE )?INDEX\s+IF NOT EXISTS \w+\s+ON '+table+r'\s*\(.*?;',source,re.S):
            await c.execute(index.group())
    actor,target=await seed_grant(c)
    await c.execute("INSERT INTO admin_bonus_grants(granted_by,granted_to,amount,snapshot_after) VALUES($1,$2,2,2)",actor,target)
    before=await c.fetch('SELECT * FROM admin_bonus_grants')
    await apply_sql(c,'048a_current_schema_reconciliation')
    assert await c.fetch('SELECT * FROM admin_bonus_grants')==before
    assert await c.fetchval("SELECT to_regnamespace('pv_reconcile_048a')") is None


@pytest.mark.parametrize('defect', ['column','default','constraint','index','sequence','sequence_increment'])
async def test_reconciliation_fails_on_incompatible_existing_object(recovery_db,defect):
    c=recovery_db.conn
    await apply_sql(c,'048a_current_schema_reconciliation')
    sql={
        'column':'ALTER TABLE org_admin_invites ALTER COLUMN invited_email TYPE varchar(40)',
        'default':"ALTER TABLE org_admin_invites ALTER COLUMN role SET DEFAULT 'viewer'",
        'constraint':'ALTER TABLE admin_bonus_grants DROP CONSTRAINT admin_bonus_grants_amount_check',
        'index':'DROP INDEX idx_org_invites_org; CREATE INDEX idx_org_invites_org ON org_admin_invites(status)',
        'sequence':'ALTER SEQUENCE org_cohort_snapshots_id_seq OWNED BY NONE',
        'sequence_increment':'ALTER SEQUENCE org_cohort_snapshots_id_seq INCREMENT 2',
    }[defect]
    await c.execute(sql)
    with pytest.raises(asyncpg.RaiseError,match='Incompatible'):
        await apply_sql(c,'048a_current_schema_reconciliation')


async def test_corrected_049_absent_helpers_and_browser_column_acl(recovery_db):
    c=recovery_db.conn
    absent_helpers=(
        'public.admin_can_view_department(uuid,text)',
        'public.get_admin_institution_id()',
        'public.is_institution_admin(uuid)',
        'public.get_admin_organization_id()',
        'public.get_student_organization_id()',
        'public.is_org_admin(uuid)',
        'public.is_student_in_org(uuid)',
        'public.org_admin_can_view_department(uuid,uuid)',
        'public.is_admin_user()',
        'public.fn_gdpr_erase_event_records()',
    )
    required_helpers=(
        'public.fn_erasure_pseudonymise_old_user()',
        'public.cron_create_activity_partition()',
    )
    for signature in absent_helpers:
        assert await c.fetchval('SELECT to_regprocedure($1)',signature) is None
    owners={signature:await c.fetchval('SELECT proowner FROM pg_proc WHERE oid=$1::regprocedure',signature)
            for signature in required_helpers}
    assert all(owner is not None for owner in owners.values())
    await apply_sql(c,'048a_current_schema_reconciliation')
    await c.execute('GRANT SELECT(email) ON profiles TO authenticated')
    await c.execute('CREATE UNLOGGED TABLE public.helper_test_partition PARTITION OF public.user_activity_events DEFAULT')
    await c.execute('GRANT SELECT ON public.helper_test_partition TO anon, authenticated')
    await apply_sql(c,'049_backend_schema_access_hardening')
    assert not await c.fetchval("SELECT has_column_privilege('authenticated','profiles','email','SELECT')")
    assert await c.fetchval("SELECT count(*) FROM pg_policy WHERE polrelid='organizations'::regclass AND polname='backend_service'")==1
    for signature in absent_helpers:
        assert await c.fetchval('SELECT to_regprocedure($1)',signature) is None
    for signature,owner in owners.items():
        assert await c.fetchval('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure',signature)==['search_path=pg_catalog, public, pg_temp']
        assert await c.fetchval('SELECT proowner FROM pg_proc WHERE oid=$1::regprocedure',signature)==owner
    for role in ('anon','authenticated'):
        assert not await c.fetchval("SELECT has_table_privilege($1,'helper_test_partition','SELECT')",role)
        assert not await c.fetchval("SELECT has_schema_privilege($1,'public','CREATE')",role)
    for table in ('profiles','helper_test_partition'):
        assert await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',table)


@pytest.mark.parametrize('helper',['fn_erasure_pseudonymise_old_user','cron_create_activity_partition'])
async def test_049_required_helper_still_mandatory_and_atomic(recovery_db,helper):
    c=recovery_db.conn
    await apply_sql(c,'048a_current_schema_reconciliation')
    await c.execute(f'GRANT SELECT ON profiles TO authenticated; DROP FUNCTION public.{helper}()')
    with pytest.raises(asyncpg.UndefinedFunctionError):
        await apply_sql(c,'049_backend_schema_access_hardening')
    assert await c.fetchval("SELECT has_table_privilege('authenticated','profiles','SELECT')")


@pytest.mark.parametrize('signature',['is_org_admin(uuid)','is_admin_user()','fn_gdpr_erase_event_records()'])
async def test_optional_helper_hardened_if_present(recovery_db,signature):
    c=recovery_db.conn
    await apply_sql(c,'048a_current_schema_reconciliation')
    await c.execute(f"CREATE FUNCTION public.{signature} RETURNS boolean LANGUAGE sql AS 'SELECT false'")
    await c.execute(f'ALTER FUNCTION public.{signature} SET search_path=pg_temp,public')
    before=await c.fetchrow('SELECT proowner,prosrc,proacl FROM pg_proc WHERE oid=$1::regprocedure','public.'+signature)
    await apply_sql(c,'049_backend_schema_access_hardening')
    assert await c.fetchval('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure','public.'+signature)==['search_path=pg_catalog, public, pg_temp']
    assert await c.fetchrow('SELECT proowner,prosrc,proacl FROM pg_proc WHERE oid=$1::regprocedure','public.'+signature)==before


async def test_required_current_table_cannot_be_skipped(recovery_db):
    c=recovery_db.conn
    await apply_sql(c,'048a_current_schema_reconciliation')
    await c.execute('DROP TABLE org_admin_invites')
    with pytest.raises(asyncpg.RaiseError,match='Required reviewed table missing: org_admin_invites'):
        await apply_sql(c,'049_backend_schema_access_hardening')


async def test_runtime_acl_rls_and_audit_immutability(repaired_db):
    from app.database.bootstrap import validate_role_attributes
    c=repaired_db.conn
    assert await validate_role_attributes(c,'prepvista_runtime')
    for table in ('admin_bonus_grants','admin_grant_operations','org_admin_invites','org_cohort_snapshots'):
        for browser in ('anon','authenticated','prepvista_worker'):
            assert not await c.fetchval('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\')',browser,table)
        allowed=await c.fetchval('SELECT has_table_privilege(\'prepvista_runtime\',$1,\'SELECT,INSERT\')',table)
        assert allowed == (table in ('admin_bonus_grants','admin_grant_operations'))
    for table in ('admin_bonus_grants','admin_grant_operations'):
        assert not await c.fetchval('SELECT has_table_privilege(\'prepvista_runtime\',$1,\'UPDATE,DELETE,TRUNCATE\')',table)
    organization=await c.fetchval('INSERT INTO organizations DEFAULT VALUES RETURNING id')
    await c.execute('SET ROLE prepvista_runtime')
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await c.execute("INSERT INTO org_admin_invites(organization_id,invited_email,token) VALUES($1,'synthetic@example.test','synthetic')",organization)
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await c.execute('INSERT INTO org_cohort_snapshots(organization_id,snapshot_date) VALUES($1,current_date)',organization)
        for table in ('admin_bonus_grants','admin_grant_operations'):
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await c.execute(f'DELETE FROM {table}')
    finally:
        await c.execute('RESET ROLE')
    assert await c.fetchval('INSERT INTO org_cohort_snapshots(organization_id,snapshot_date) VALUES($1,current_date) RETURNING id',organization)>0


async def test_bonus_domain_preserves_sentinels_and_rejects_bad_data(recovery_db):
    c=recovery_db.conn
    await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(9992),(9993)')
    await apply_sql(c,'052_admin_grant_contract')
    assert [r[0] for r in await c.fetch('SELECT admin_bonus_interviews FROM profiles ORDER BY 1')]==[9992,9993]
    for bonus in (-1,1001,9990,9994,10006):
        with pytest.raises(asyncpg.CheckViolationError):
            await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES($1)',bonus)
    with pytest.raises(asyncpg.NotNullViolationError):
        await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(NULL)')


async def test_invalid_bonus_data_rolls_back_contract(recovery_db):
    c=recovery_db.conn
    await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(1001)')
    with pytest.raises(asyncpg.RaiseError,match='Unsupported bonus data'):
        await apply_sql(c,'052_admin_grant_contract')
    assert await c.fetchval("SELECT to_regclass('admin_grant_operations')") is None


async def test_historical_finite_cap_replaced_without_rewriting_values(recovery_db):
    c=recovery_db.conn
    await c.execute('ALTER TABLE profiles ADD CONSTRAINT chk_profiles_admin_bonus_max CHECK(admin_bonus_interviews<=1000)')
    await c.execute('INSERT INTO profiles(admin_bonus_interviews) VALUES(1000)')
    await apply_sql(c,'052_admin_grant_contract')
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles')==1000
    await c.execute('UPDATE profiles SET admin_bonus_interviews=9991')


async def seed_grant(c,bonus=0,plan='free',expired=False):
    actor=await c.fetchval("INSERT INTO profiles(email) VALUES('actor@example.test') RETURNING id")
    target=await c.fetchval("INSERT INTO profiles(email,plan,admin_bonus_interviews,period_start) VALUES('target@example.test',$1,$2,$3) RETURNING id",
                            plan,bonus,datetime.now(timezone.utc)-timedelta(days=31 if expired else 1))
    return actor,target


def request(target,model='free',value='normal',action='activate',request_id=None):
    return AdminGrantRequest(request_id=request_id or uuid4(),user_id=target,model=model,value=value,action=action)


async def test_idempotency_and_payload_conflict(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c)
    payload=request(target)
    await c.execute('SET ROLE prepvista_runtime')
    result=await apply_admin_grant(c,payload,str(actor))
    assert await apply_admin_grant(c,payload,str(actor))==result
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==2
    with pytest.raises(HTTPException) as exc:
        await apply_admin_grant(c,request(target,value='unlimited',request_id=payload.request_id),str(actor))
    assert exc.value.status_code==409
    assert await c.fetchval('SELECT count(*) FROM admin_grant_operations')==1
    assert await c.fetchval('SELECT count(*) FROM admin_bonus_grants')==1


@pytest.mark.parametrize('duplicate',[True,False])
async def test_independent_sessions_serialize_grants(repaired_db,duplicate):
    actor,target=await seed_grant(repaired_db.conn)
    first=request(target)
    async def run(payload):
        c=await asyncpg.connect(repaired_db.dsn.replace('postgres@','prepvista_runtime@'))
        try: return await apply_admin_grant(c,payload,str(actor))
        finally: await c.close()
    results=await asyncio.gather(run(first),run(first if duplicate else request(target)))
    assert await repaired_db.conn.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==(2 if duplicate else 4)
    if duplicate: assert results[0]==results[1]


async def test_rollover_before_grant_and_retry_after_new_period(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c,bonus=9992,expired=True)
    payload=request(target)
    result=await apply_admin_grant(c,payload,str(actor))
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==2
    await c.execute("UPDATE profiles SET period_start=now()-interval '31 days' WHERE id=$1",target)
    await _ensure_current_usage_period(c,str(target))
    assert await apply_admin_grant(c,payload,str(actor))==result
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==0


@pytest.mark.parametrize('source',['paid-order','manual_grant'])
async def test_purchased_access_and_selection_survive_deactivation(repaired_db,source):
    c=repaired_db.conn
    actor,target=await seed_grant(c,bonus=9992,plan='pro')
    await c.execute("INSERT INTO payments(user_id,plan,status,razorpay_order_id,verified_at) VALUES($1,'pro','verified','paid-order',now())",target)
    expires=await c.fetchval("INSERT INTO user_plan_entitlements(user_id,plan,status,source_order_id,activated_at,expires_at) VALUES($1,'pro','active',$2,now(),now()+interval '20 days') RETURNING expires_at",target,source)
    await apply_admin_grant(c,request(target,model='pro',value='unlimited',action='deactivate'),str(actor))
    assert await c.fetchval("SELECT status FROM user_plan_entitlements WHERE user_id=$1",target)=='active'
    assert await c.fetchval("SELECT expires_at FROM user_plan_entitlements WHERE user_id=$1",target)==expires
    assert await c.fetchval('SELECT plan FROM profiles WHERE id=$1',target)=='pro'
    assert await c.fetchval('SELECT count(*) FROM admin_bonus_grants')==0


async def test_valid_access_retry_preserves_expiry_and_overflow_atomic(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c,plan='pro',bonus=985)
    expiry=await c.fetchval("INSERT INTO user_plan_entitlements(user_id,plan,status,source_order_id,activated_at,expires_at) VALUES($1,'pro','active','paid',now(),now()+interval '20 days') RETURNING expires_at",target)
    payload=request(target,model='pro')
    await apply_admin_grant(c,payload,str(actor))
    await apply_admin_grant(c,payload,str(actor))
    with pytest.raises(HTTPException): await apply_admin_grant(c,request(target,model='pro'),str(actor))
    assert await c.fetchval('SELECT expires_at FROM user_plan_entitlements WHERE user_id=$1',target)==expiry
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==1000
    assert await c.fetchval('SELECT count(*) FROM admin_grant_operations')==1


async def test_journal_failure_rolls_back_grant_and_finite_audit(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c)
    await c.execute('REVOKE INSERT ON admin_grant_operations FROM prepvista_runtime; SET ROLE prepvista_runtime')
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await apply_admin_grant(c,request(target),str(actor))
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==0
    assert await c.fetchval('SELECT count(*) FROM admin_bonus_grants')==0


async def test_grant_and_period_reset_serialize(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c,bonus=9992,expired=True)
    other=await asyncpg.connect(repaired_db.dsn)
    try:
        async with c.transaction():
            await c.fetchrow('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',target)
            reset=asyncio.create_task(_ensure_current_usage_period(other,str(target)))
            await apply_admin_grant(c,request(target),str(actor))
        await reset
        assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==2
    finally: await other.close()


@pytest.mark.parametrize('bonus,model',[(9991,'free'),(9992,'pro'),(9993,'career')])
async def test_matching_unlimited_retries_never_write_finite_adjustment(repaired_db,bonus,model):
    c=repaired_db.conn
    actor,target=await seed_grant(c,bonus=bonus)
    payload=request(target,model=model,value='unlimited')
    assert await apply_admin_grant(c,payload,str(actor))==await apply_admin_grant(c,payload,str(actor))
    assert await c.fetchval('SELECT admin_bonus_interviews FROM profiles WHERE id=$1',target)==bonus
    assert await c.fetchval('SELECT count(*) FROM admin_bonus_grants')==0


async def test_same_id_cannot_change_target_or_actor(repaired_db):
    c=repaired_db.conn
    actor,target=await seed_grant(c)
    payload=request(target)
    await apply_admin_grant(c,payload,str(actor))
    for changed,caller in [(request(actor,request_id=payload.request_id),actor),(payload,target)]:
        with pytest.raises(HTTPException) as exc:
            await apply_admin_grant(c,changed,str(caller))
        assert exc.value.status_code==409
    assert await c.fetchval('SELECT count(*) FROM admin_grant_operations')==1
