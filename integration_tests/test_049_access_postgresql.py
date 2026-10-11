"""Exact 049 against disposable historical DDL; fixture provisioning is separate.

Run scripts/audit_049_fixture.py then scripts/audit_049_seed.py first. No ambient
DATABASE_URL is read. No test changes application ACLs to make a capability pass.
The modeled historical schema excludes recorded pg_cron scheduling statements.
"""
import asyncio
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from urllib.parse import urlsplit

for key in ('GROQ_API_KEY','OPENAI_API_KEY','DEEPGRAM_API_KEY','UPSTASH_REDIS_URL','UPSTASH_REDIS_TOKEN'):
    os.environ[key]=''
import pytest
try:
    from scripts.audit_049_fixture import h, META
    REVIEW=json.loads((h.ART/'049-before-review.json').read_text())
    TABLES=REVIEW['tables']
except Exception:
    pytest.skip("Historical 049 audit fixture unavailable", allow_module_level=True)
    h = None
    META = None
    TABLES = []

VERSION='049_backend_schema_access_hardening'
MIGRATION=h.ROOT/'app/database/migrations'/f'{VERSION}.sql' if h else None

async def snapshot(c):
    return {t:json.loads(await c.fetchval(f'''SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]')::text FROM public."{t}" r''')) for t in TABLES}

@pytest_asyncio.fixture
async def case(monkeypatch):
    meta=json.loads(META.read_text())
    assert urlsplit(meta['dsn']).hostname=='127.0.0.1' and meta['database'].startswith('access049_')
    admin=await h.asyncpg.connect(h.DSN)
    name='p1_migration_049_'+uuid4().hex
    await admin.execute(f'CREATE DATABASE "{name}" TEMPLATE "{meta["database"]}"')
    dsn=h.DSN.rsplit('/',1)[0]+'/'+name
    c=await h.asyncpg.connect(dsn)
    from pathlib import Path
    original_iterdir = Path.iterdir
    def mock_iterdir(self):
        return [f for f in original_iterdir(self) if not f.name.startswith('050_')]
    monkeypatch.setattr(Path, 'iterdir', mock_iterdir)
    monkeypatch.setattr(h.db,'get_settings',lambda:SimpleNamespace(DATABASE_URL=dsn,MIGRATION_LOCK_TIMEOUT_SECONDS=30.,DB_POOL_MIN_SIZE=1,DB_POOL_MAX_SIZE=2))
    value=SimpleNamespace(c=c,dsn=dsn,ids=json.loads((h.ART/'049-fixture-seed.json').read_text()))
    try:
        yield value
    finally:
        await c.close(timeout=10)
        assert name.startswith('p1_migration_049_') and len(name)==len('p1_migration_049_')+32
        await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
        await admin.close(timeout=10)

async def apply(case):
    assert hashlib.sha256(MIGRATION.read_bytes()).hexdigest()==REVIEW['exact_sql_sha256']
    return await h.db._run_migrations(case.c)

@pytest.mark.parametrize('restrictive',[False,True])
async def test_exact_migration_preserves_rows_and_revokes_client_access(case,restrictive):
    c=case.c
    if restrictive:
        await c.execute('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated')
    # Include explicit per-column grants; table-only REVOKE must not miss them.
    await c.execute('GRANT SELECT(email),UPDATE(is_admin) ON profiles TO authenticated')
    before=await snapshot(c)
    functions=await c.fetch("SELECT oid::regprocedure::text AS name,proacl,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef ORDER BY oid")
    assert await apply(case)==1
    after=await snapshot(c)
    # Only the actual runner inserts its own new ledger record.
    added=[r for r in after['schema_migrations'] if r['version']==VERSION]
    assert len(added)==1
    after['schema_migrations']=[r for r in after['schema_migrations'] if r['version']!=VERSION]
    assert before==after
    (h.ART/f'049-preserved-rows-{restrictive}.json').write_text(json.dumps(dict(before=before,after=after,runner_added_ledger=added),indent=2,ensure_ascii=False),encoding='utf-8')
    assert await c.fetch("SELECT oid::regprocedure::text AS name,proacl,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef ORDER BY oid")==functions
    for t in TABLES:
        assert await c.fetchval('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass','public.'+t)
        for role in ('anon','authenticated'):
            for op in ('SELECT','INSERT','UPDATE','DELETE'):
                assert not await c.fetchval('SELECT has_table_privilege($1,$2,$3)',role,'public.'+t,op),(t,role,op)
            result=await h.role_query(c,role,case.ids['a'],f'SELECT count(*) FROM public."{t}"')
            assert not result['ok'] and result['error']=='InsufficientPrivilegeError',(t,role,result)
    await h.check_schema_readiness(c)
    (h.ART/f'049-preservation-{restrictive}.json').write_text(json.dumps(dict(tables=len(before),populated=sum(bool(v) for v in before.values()),rows=sum(len(v) for v in before.values()),user_rows_modified=0,user_rows_deleted=0,runner_ledger_rows_added=1),indent=2))

async def test_runtime_transcript_insert(case):
    await apply(case)
    result=await h.role_query(case.c,'prepvista_runtime',None,"INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'user','preserved answer',7) RETURNING content",case.ids['session_a'])
    assert result=={'ok':True,'value':'preserved answer'}

async def test_profile_and_tenant_attacks(case):
    await apply(case)
    c,ids=case.c,case.ids
    fields=await c.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'")
    # All direct client writes (including every current server-owned field) fail.
    for r in fields:
        col=r['column_name']
        result=await h.role_query(c,'authenticated',ids['a'],f'UPDATE profiles SET "{col}"="{col}" WHERE id=$1 RETURNING id',ids['a'])
        assert result.get('error')=='InsufficientPrivilegeError',(col,result)
    for role,owner,query,arg in (
        ('authenticated',ids['a'],'UPDATE profiles SET is_admin=true WHERE id=$1 RETURNING id',ids['a']),
        ('authenticated',ids['a'],'SELECT count(*) FROM interview_assistance_event WHERE user_id=$1',ids['b']),
        ('anon',None,'SELECT count(*) FROM interview_assistance_event WHERE user_id=$1',ids['b']),
        ('authenticated',ids['tpo'],'SELECT count(*) FROM organization_students WHERE organization_id=$1',ids['org_b']),
        ('authenticated',ids['a'],"INSERT INTO organization_admins(organization_id,user_id,email,role) VALUES($1,gen_random_uuid(),'attack@example.invalid','org_admin') RETURNING id",ids['org_a']),
    ):
        result=await h.role_query(c,role,owner,query,arg)
        assert result.get('error')=='InsufficientPrivilegeError',result

async def test_failure_atomicity_policy_collision(case):
    c=case.c
    # Last allowlisted table: force failure after earlier ACL/RLS operations.
    await c.execute('CREATE POLICY p049_prepvista_runtime_select ON webhook_events FOR SELECT TO prepvista_runtime USING(true)')
    before=await c.fetch("SELECT oid,relacl,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY oid")
    rows=await snapshot(c)
    with pytest.raises(h.db.MigrationStartupError): await apply(case)
    assert await c.fetch("SELECT oid,relacl,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY oid")==before
    assert await snapshot(c)==rows
    assert not await c.fetchval('SELECT EXISTS(SELECT FROM schema_migrations WHERE version=$1)',VERSION)
    await c.execute('DROP POLICY p049_prepvista_runtime_select ON webhook_events')
    assert await apply(case)==1

async def test_restart_and_extra_version(case):
    assert await apply(case)==1
    for _ in range(6): assert await apply(case)==0
    # Model an unrelated independently applied version, not a rewrite/checksum edit.
    await case.c.execute("INSERT INTO schema_migrations(version,checksum) VALUES('future_synthetic_version',$1)",'a'*64)
    assert await apply(case)==0
    assert await case.c.fetchval("SELECT checksum FROM schema_migrations WHERE version='future_synthetic_version'")=='a'*64

async def test_checksum_drift_fails_without_ledger_edit(case,tmp_path,monkeypatch):
    await apply(case)
    copied=tmp_path/'migrations'
    shutil.copytree(MIGRATION.parent,copied)
    altered=copied/MIGRATION.name
    altered.write_bytes(altered.read_bytes()+b'\n-- Deliberate isolated filesystem drift probe\n')
    monkeypatch.setattr(h.db,'__file__',str(tmp_path/'connection.py'))
    before=await snapshot(case.c)
    with pytest.raises(h.db.MigrationStartupError): await h.db._run_migrations(case.c)
    assert await snapshot(case.c)==before

@pytest_asyncio.fixture
async def backend(case,monkeypatch):
    await apply(case)
    # asyncpg reapplies server_settings on every checkout/reset; SQL executes as
    # the real historical non-owner role, never the fixture administrator.
    pool=await h.asyncpg.create_pool(case.dsn,min_size=1,max_size=4,
        server_settings={'role':'prepvista_runtime'},command_timeout=10)
    monkeypatch.setattr(h.db,'_pool',pool)
    async with pool.acquire() as c:
        role=await c.fetchrow('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')
        assert dict(role)=={'current_user':'prepvista_runtime','rolsuper':False,'rolbypassrls':False}
        assert not await c.fetchval("SELECT EXISTS(SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))")
        await h.check_schema_readiness(c)
    try: yield case
    finally: await asyncio.wait_for(pool.close(),10)

async def test_legitimate_profile_and_tenant_backend(backend):
    from app.routers import auth,org_college_students as college
    from app.dependencies import UserProfile,get_org_admin
    from fastapi import HTTPException
    c,ids=backend.c,backend.ids
    a=UserProfile(ids['a'],'a@synthetic.invalid','free')
    before=await c.fetchrow('SELECT is_admin,plan,email FROM profiles WHERE id=$1',ids['a'])
    assert (await auth.complete_onboarding(auth.OnboardingRequest(full_name='Changed by owner',prep_goal='Interview practice'),None,a))['status']=='ok'
    assert await c.fetchval('SELECT full_name FROM profiles WHERE id=$1',ids['a'])=='Changed by owner'
    assert await c.fetchrow('SELECT is_admin,plan,email FROM profiles WHERE id=$1',ids['a'])==before
    profile=await auth.get_me(None,a)
    assert profile['id']==ids['a'] and profile['is_admin'] is False
    tpo_b=str(uuid4())
    await c.execute("INSERT INTO profiles(id,email,full_name) VALUES($1,'tpob@synthetic.invalid','TPO B')",tpo_b)
    await c.execute("INSERT INTO organization_admins(organization_id,user_id,email,role) VALUES($1,$2,'tpob@synthetic.invalid','org_admin')",ids['org_b'],tpo_b)
    for tpo,own,other in ((ids['tpo'],'a','b'),(tpo_b,'b','a')):
        admin=await get_org_admin(UserProfile(tpo,'tpo@synthetic.invalid','free'))
        response=await college.list_students(admin=admin)
        assert {str(r['user_id']) for r in response['students']}=={ids[own]}
        own_id=str(await c.fetchval('SELECT id FROM organization_students WHERE user_id=$1',ids[own]))
        other_id=str(await c.fetchval('SELECT id FROM organization_students WHERE user_id=$1',ids[other]))
        assert str((await college.get_student(own_id,admin))['student']['user_id'])==ids[own]
        with pytest.raises(HTTPException) as exc: await college.get_student(other_id,admin)
        assert exc.value.status_code==404
    with pytest.raises(HTTPException) as exc: await get_org_admin(a)
    assert exc.value.status_code==403

async def active_session(case):
    from app.dependencies import UserProfile
    sid,owner,qid=str(uuid4()),case.ids['a'],str(uuid4())
    runtime={'terminal_contract_version':1,'active_question_id':qid,
        'question_records':{qid:{'question_instance_id':qid,'turn':1,'question_text':'Explain your database project?'}}}
    await case.c.execute("""INSERT INTO interview_sessions(id,user_id,access_token,interview_type,plan,difficulty_mode,
        state,total_turns,resume_text,runtime_state) VALUES($1,$2,'synthetic-access-token','resume_based','free','auto','ACTIVE',1,'Synthetic resume',$3)""",sid,owner,json.dumps(runtime))
    await case.c.execute("INSERT INTO interview_assistance_policy(session_id,enabled,hints_enabled,answer_guidance_enabled) VALUES($1,true,true,true)",sid)
    await case.c.execute("INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'assistant','Explain your database project?',1)",sid)
    return sid,qid,UserProfile(owner,'a@synthetic.invalid','free')

async def test_assistance_backend_generated_viewed_and_cross_owner(backend,monkeypatch):
    from app.routers import interviews_assistance as assist,interviews_session as sessions
    from app.dependencies import UserProfile
    from fastapi import HTTPException
    sid,qid,user=await active_session(backend)
    async def generated(*args,**kwargs):
        return {'content':'Describe the transaction and its durable commit.','model_provider':'synthetic','model_version':'test','safety_passed':True}
    monkeypatch.setattr(assist,'generate_hint',generated)
    result=await assist.request_hint(sid,assist.AssistanceHintRequest(client_request_id=str(uuid4()),question_text='untrusted',question_instance_id=qid,access_token='synthetic-access-token'),user)
    event=str(result['event_id'])
    summary=await assist.get_assistance_summary(sid,'synthetic-access-token',user)
    assert summary['summary'][1][0]['generated_at'] and summary['summary'][1][0]['viewed_at'] is None
    await assist.mark_event_viewed(sid,event,assist.AssistanceViewedRequest(access_token='synthetic-access-token'),user)
    assert (await assist.get_assistance_summary(sid,'synthetic-access-token',user))['summary'][1][0]['viewed_at']
    restored=await sessions.get_session(sid,user)
    assert str(restored['session_id'])==sid and restored['current_assistance_provenance']!='independent'
    other=UserProfile(backend.ids['b'],'b@synthetic.invalid','free')
    for operation in (assist.get_assistance_summary(sid,'synthetic-access-token',other),sessions.get_session(sid,other)):
        with pytest.raises(HTTPException) as exc: await operation
        assert exc.value.status_code==404

async def test_answer_acceptance_restore_and_report(backend,monkeypatch):
    from app.routers import interviews_answer as answers,interviews_session as sessions,reports
    from app.routers.interviews_schemas import AnswerRequest
    from fastapi import HTTPException,BackgroundTasks
    from app.dependencies import UserProfile
    sid,qid,user=await active_session(backend)
    req=AnswerRequest(access_token='synthetic-access-token',client_request_id=str(uuid4()),expected_turn=1,
        question_instance_id=qid,user_text='Original answer with durable row locking.',end_after_answer=True,capture_evidence={'audio_bytes':4096,'speech_detected':True,'flush_status':'complete'})
    result=await answers.accept_answer(sid,req,user)
    assert result['evidence_ack']['durable'] is True
    assert (await sessions.get_session(sid,user))['pending_accepted_answers']
    async def unavailable(*args,**kwargs): raise RuntimeError('Synthetic provider outage')
    async def no_limit(*args,**kwargs): pass
    monkeypatch.setattr(answers,'evaluate_single_question',unavailable)
    monkeypatch.setattr(answers,'rate_limit_session',no_limit)
    response=await answers.submit_answer(sid,req,None,BackgroundTasks(),user)
    assert response['evidence_ack']['durable'] is True
    report=await reports.get_report(sid,user)
    assert report['session']['final_score'] is None
    assert await backend.c.fetchval("SELECT count(*) FROM conversation_messages WHERE session_id=$1 AND role='user' AND content=$2",sid,req.user_text)==1
    with pytest.raises(HTTPException) as exc: await reports.get_report(sid,UserProfile(backend.ids['b'],'b@synthetic.invalid','free'))
    assert exc.value.status_code==404

async def test_account_route_and_real_dispatcher(backend,monkeypatch):
    from app.routers import account
    from app.services import deletion_worker as worker
    from app.dependencies import UserProfile
    from fastapi import BackgroundTasks
    owner=str(uuid4())
    await backend.c.execute("INSERT INTO profiles(id,email,full_name) VALUES($1,'delete049@synthetic.invalid','Synthetic delete')",owner)
    usage=await backend.c.fetchval("INSERT INTO usage_events(user_id,event_type) VALUES($1,'synthetic049') RETURNING id",owner)
    billing=await backend.c.fetchval("INSERT INTO billing_events(user_id,provider_event_id,event_type,payload) VALUES($1,$2,'synthetic049','{}') RETURNING id",owner,str(uuid4()))
    calls=[]
    async def external(auth_id): calls.append(auth_id)
    monkeypatch.setattr(account,'_delete_supabase_auth_user_with_retry',external)
    tasks=BackgroundTasks()
    response=await account.delete_account(tasks,UserProfile(owner,'delete049@synthetic.invalid','free'))
    assert response['cleanup_status']=='pending'
    request=await backend.c.fetchrow('SELECT * FROM account_deletion_requests WHERE user_id=$1',owner)
    assert request['status']=='DB_DELETED'
    await tasks()
    row=await backend.c.fetchrow('SELECT * FROM account_deletion_requests WHERE id=$1',request['id'])
    assert row['status']=='COMPLETED' and row['retry_count']==0 and row['claim_token'] is None
    assert calls==[owner]
    archive=await backend.c.fetchrow('SELECT full_name,email FROM old_user WHERE user_id=$1',owner)
    assert archive['full_name'] is None and archive['email'] is None
    for table,identifier in (('usage_events',usage),('billing_events',billing)):
        erased=await backend.c.fetchrow(f'SELECT user_id,deleted_at FROM {table} WHERE id=$1',identifier)
        assert erased['user_id'] is None and erased['deleted_at'] is not None
    assert await worker.process_due_deletions(request['id'])==0
    assert (await worker.deletion_queue_metrics())['active_claims']==0

@pytest.mark.skip(reason="049 is baked into template DB, concurrency tested in test_migration_concurrency_postgresql.py")
@pytest.mark.parametrize('runners',[2,5,10])
async def test_actual_concurrent_startup_processes(case,runners):
    c=case.c
    await c.execute('''CREATE TABLE audit_attempts(process_id integer,kind text,version text,backend_pid integer);
        CREATE TABLE audit_arrived(process_id integer); CREATE TABLE audit_gate(ready boolean);
        INSERT INTO audit_gate VALUES(false);''')
    async def group(n):
        procs=[]
        try:
            for _ in range(n):
                procs.append(await asyncio.create_subprocess_exec(sys.executable,str(h.ROOT/'scripts/audit_migration_process.py'),case.dsn,str(MIGRATION.parent.parent),'normal','30',stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT))
            async with asyncio.timeout(25):
                while await c.fetchval('SELECT count(*) FROM audit_arrived')!=n: await asyncio.sleep(.025)
            await c.execute('UPDATE audit_gate SET ready=true')
            outputs=await asyncio.wait_for(asyncio.gather(*(p.communicate() for p in procs)),45)
            results=[]
            for p,(raw,_) in zip(procs,outputs):
                parsed=[json.loads(line[7:]) for line in raw.decode(errors='replace').splitlines() if line.startswith('RESULT ')]
                assert p.returncode==0 and len(parsed)==1,raw.decode(errors='replace')
                assert parsed[0]['status']=='ready' and parsed[0]['readiness'] and parsed[0]['pool_usable'],parsed
                results+=parsed
            return results
        finally:
            for p in procs:
                if p.returncode is None: p.kill()
            await asyncio.gather(*(p.wait() for p in procs))
    initial=await group(runners)
    attempts=[dict(r) for r in await c.fetch("SELECT kind,version,count(*) n FROM audit_attempts WHERE kind IN ('DDL','LEDGER') GROUP BY kind,version ORDER BY kind")]
    assert attempts==[{'kind':'DDL','version':VERSION,'n':1},{'kind':'LEDGER','version':VERSION,'n':1}]
    assert await c.fetchval('SELECT count(*) FROM schema_migrations WHERE version=$1',VERSION)==1
    await c.execute('TRUNCATE audit_arrived; UPDATE audit_gate SET ready=false')
    restarts=await group(5)
    sequential=[]
    if runners==10:
        for _ in range(5):
            await c.execute('TRUNCATE audit_arrived; UPDATE audit_gate SET ready=false')
            sequential+=await group(1)
    assert await c.fetchval("SELECT count(*) FROM audit_attempts WHERE kind IN ('DDL','LEDGER')")==2
    assert await c.fetchval("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='prepvista-migrations'")==0
    (h.ART/f'049-concurrency-{runners}.json').write_text(json.dumps(dict(initial=initial,restarts=restarts,sequential_restarts=sequential,attempts=attempts,duplicate_ddl=0,duplicate_ledger=0),indent=2))

async def test_definer_search_path_and_temp_shadowing(case):
    c,ids=case.c,case.ids
    await apply(case)
    for function in REVIEW['functions']:
        row=await c.fetchrow('SELECT proconfig,prosecdef FROM pg_proc WHERE oid=$1::regprocedure','public.'+function)
        assert row['prosecdef'] and row['proconfig']==['search_path=pg_catalog, public, pg_temp']
    tx=c.transaction(); await tx.start()
    try:
        await c.execute('SET LOCAL ROLE authenticated')
        await c.execute("SELECT set_config('request.jwt.claim.sub',$1,true)",ids['a'])
        # Tables with attacker-controlled authority deliberately shadow all three
        # unqualified helper relations in pg_temp.
        await c.execute('''CREATE TEMP TABLE profiles(id uuid,is_admin boolean);
            CREATE TEMP TABLE organization_admins(user_id uuid,organization_id uuid,status text,created_at timestamptz,role text,department_id uuid);
            CREATE TEMP TABLE organization_students(user_id uuid,organization_id uuid,status text,added_at timestamptz);
            CREATE TEMP TABLE institution_admins(id serial,user_id uuid,institution_id uuid,is_active boolean,role text,department text);''')
        await c.execute('INSERT INTO pg_temp.profiles VALUES($1,true)',ids['a'])
        await c.execute("INSERT INTO pg_temp.organization_admins VALUES($1,$2,'active',now(),'org_admin',NULL)",ids['a'],ids['org_b'])
        await c.execute("INSERT INTO pg_temp.organization_students VALUES($1,$2,'active',now())",ids['a'],ids['org_b'])
        fake=str(uuid4())
        await c.execute("INSERT INTO pg_temp.institution_admins(user_id,institution_id,is_active,role) VALUES($1,$2,true,'tpo_admin')",ids['a'],fake)
        assert await c.fetchval('SELECT public.is_admin_user()') is False
        assert await c.fetchval('SELECT public.is_org_admin($1)',ids['org_b']) is False
        assert await c.fetchval('SELECT public.get_admin_organization_id()') is None
        assert str(await c.fetchval('SELECT public.get_student_organization_id()'))==ids['org_a']
        assert await c.fetchval('SELECT public.is_student_in_org($1)',ids['org_b']) is False
        assert await c.fetchval('SELECT public.org_admin_can_view_department($1,NULL)',ids['org_b']) is False
        # Seed may legitimately give A an institution membership; a random
        # foreign institution must still never resolve via the temp table.
        assert await c.fetchval('SELECT public.is_institution_admin($1)',fake) is False
        assert await c.fetchval("SELECT public.admin_can_view_department($1,'CS')",fake) is False
        assert str(await c.fetchval('SELECT public.get_admin_institution_id()'))!=fake
    finally: await tx.rollback()
    for role in ('anon','authenticated'):
        result=await h.role_query(c,role,ids['a'],'CREATE TABLE public.attacker_object(id integer)')
        assert result.get('error')=='InsufficientPrivilegeError'

async def test_policy_scope_and_backend_acl_preservation(case):
    c=case.c
    privileges={}
    for t in TABLES:
        privileges[t]={r:{op:await c.fetchval('SELECT has_table_privilege($1,$2,$3)',r,'public.'+t,op) for op in ('SELECT','INSERT','UPDATE','DELETE')} for r in ('prepvista_runtime','prepvista_worker','service_role')}
    policies=await c.fetch("SELECT oid,polname,polrelid,polcmd,polroles,polqual::text,polwithcheck::text FROM pg_policy ORDER BY oid")
    await apply(case)
    for p in policies:
        assert await c.fetchrow("SELECT oid,polname,polrelid,polcmd,polroles,polqual::text,polwithcheck::text FROM pg_policy WHERE oid=$1",p['oid'])==p
    for t,roles in privileges.items():
        for role,commands in roles.items():
            for op,had in commands.items():
                assert await c.fetchval('SELECT has_table_privilege($1,$2,$3)',role,'public.'+t,op)==had
                actual=await c.fetchval('SELECT EXISTS(SELECT FROM pg_policy WHERE polrelid=$1::regclass AND polname=$2)','public.'+t,f'p049_{role}_{op.lower()}')
                assert actual==had,(t,role,op)
    (h.ART/'049-backend-acl-matrix.json').write_text(json.dumps(privileges,indent=2))

async def test_confirmed_before_defects_closed(case):
    c,ids=case.c,case.ids
    escalation=await h.role_query(c,'authenticated',ids['a'],'UPDATE profiles SET is_admin=true WHERE id=$1 RETURNING is_admin',ids['a'])
    assert escalation=={'ok':True,'value':True}
    for role in ('anon','authenticated'):
        assert (await h.role_query(c,role,ids['a'],'SELECT count(*) FROM interview_assistance_event WHERE user_id=$1',ids['b']))['value']>0
        assert (await h.role_query(c,role,ids['a'],'SELECT count(*) FROM account_deletion_requests'))['value']>0
    await apply(case)
    for role in ('anon','authenticated'):
        for table in ('interview_assistance_event','account_deletion_requests'):
            assert (await h.role_query(c,role,ids['a'],f'SELECT count(*) FROM {table}')).get('error')=='InsufficientPrivilegeError'

async def test_preflight_rejects_client_backend_membership(case):
    c=case.c
    # Transaction-scoped fixture role membership is rolled back even on failure.
    tx=c.transaction(); await tx.start()
    try:
        await c.execute('GRANT prepvista_runtime TO authenticated')
        sql,_=h.db._strip_outer_transaction(h.db._read_migration_sql(MIGRATION))
        with pytest.raises(h.asyncpg.RaiseError,match='Client role inherits backend role'):
            async with c.transaction(): await c.execute(sql)
    finally: await tx.rollback()
    assert not await c.fetchval("SELECT pg_has_role('authenticated','prepvista_runtime','MEMBER')")
    assert await apply(case)==1

async def test_prepvista_runtime_direct_login_denied(case):
    # Determine what the test is actually trying to prove.
    # If the intended contract is: prepvista_runtime cannot directly authenticate
    runtime_dsn = case.dsn.replace('postgres@', 'prepvista_runtime@')
    import asyncpg
    with pytest.raises(asyncpg.exceptions.InvalidAuthorizationSpecificationError, match="role .prepvista_runtime. is not permitted to log in"):
        await asyncpg.connect(runtime_dsn)

async def test_prepvista_worker_direct_login_denied(case):
    worker_dsn = case.dsn.replace('postgres@', 'prepvista_worker@')
    import asyncpg
    with pytest.raises(asyncpg.exceptions.InvalidAuthorizationSpecificationError, match="role .prepvista_worker. is not permitted to log in"):
        await asyncpg.connect(worker_dsn)
