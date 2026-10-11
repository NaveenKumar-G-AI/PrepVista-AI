"""Real deletion leases on a unique disposable loopback database; fake providers only."""
import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

import asyncpg
import pytest
import pytest_asyncio

DSN = os.environ.get("PREPVISTA_TEST_DATABASE_URL", "postgresql://postgres@127.0.0.1:55322/postgres")
url = urlsplit(DSN)
if url.scheme not in {"postgres", "postgresql"} or url.hostname not in {"localhost", "127.0.0.1", "::1"} or url.query or url.fragment:
    raise RuntimeError("P1 requires disposable loopback PostgreSQL")
for key, value in {
    "ENVIRONMENT": "development", "PREPVISTA_DEBUG": "false",
    "SUPABASE_URL": "https://test.supabase.co", "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_KEY": "test-service-key", "SUPABASE_JWT_SECRET": "test-jwt-secret-padded-to-thirty-two-plus-chars",
    "DATABASE_URL": DSN, "GROQ_API_KEY": "", "OPENAI_API_KEY": "", "DEEPGRAM_API_KEY": "",
    "UPSTASH_REDIS_URL": "", "UPSTASH_REDIS_TOKEN": "",
}.items():
    os.environ[key] = value

from fastapi import BackgroundTasks, HTTPException
from app.database import connection as db
from app.database.readiness import check_deletion_claim_constraint
from app.dependencies import UserProfile
from app.routers import account
from app.services import deletion_worker as worker
from app.services.storage_cleanup import StorageDeleteResult

REAL_AUTH_DELETE = worker._auth_delete
pytestmark = pytest.mark.asyncio
DDL = """
CREATE TABLE account_deletion_requests(
 id SERIAL PRIMARY KEY, user_id UUID NOT NULL, email TEXT NOT NULL,
 auth_user_ids TEXT[] NOT NULL, storage_paths JSONB NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'REQUESTED',
 retry_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_error TEXT,
 CONSTRAINT account_deletion_requests_status_check CHECK(status IN
 ('REQUESTED','DB_DELETED','AUTH_PENDING','AUTH_DELETED','STORAGE_PENDING','STORAGE_DELETED',
 'COMPLETED','FAILED','RETRY_REQUIRED'))
);
CREATE TABLE profiles(id UUID PRIMARY KEY, email TEXT, full_name TEXT);
CREATE TABLE auth_identity_links(auth_user_id UUID PRIMARY KEY, profile_id UUID REFERENCES profiles ON DELETE CASCADE);
CREATE TABLE interview_sessions(id UUID PRIMARY KEY,user_id UUID REFERENCES profiles ON DELETE CASCADE,resume_file_path TEXT);
CREATE TABLE interview_audio_turns(session_id UUID REFERENCES interview_sessions ON DELETE CASCADE,audio_object_path TEXT);
CREATE TABLE reports(user_id UUID REFERENCES profiles ON DELETE CASCADE,pdf_file_path TEXT);
CREATE TABLE support_messages(user_id UUID REFERENCES profiles ON DELETE CASCADE,attachment_url TEXT);
CREATE TABLE launch_offer_grants(user_id UUID,status TEXT);
CREATE TABLE old_user(id SERIAL PRIMARY KEY,user_id UUID,email TEXT UNIQUE,full_name TEXT,metadata JSONB);
CREATE TABLE provider_attempts(kind TEXT,target TEXT);
CREATE TABLE provider_effects(kind TEXT,target TEXT,PRIMARY KEY(kind,target));
"""

async def fake_call(pool, kind, target):
    # Independent connection simulates the provider's independently committed side effect.
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("INSERT INTO provider_attempts VALUES($1,$2)", kind, target)
            await conn.execute("INSERT INTO provider_effects VALUES($1,$2) ON CONFLICT DO NOTHING", kind, target)


@pytest_asyncio.fixture
async def case(monkeypatch):
    name = "p1_deletion_" + uuid4().hex
    admin = await asyncpg.connect(DSN)
    await admin.execute(f'CREATE DATABASE "{name}"')
    local_dsn = urlunsplit(url._replace(path="/"+name))
    conn = await asyncpg.connect(local_dsn)
    pool = None
    try:
        assert await conn.fetchval("SHOW fsync") == "on"
        assert await conn.fetchval("SHOW synchronous_commit") == "on"
        await conn.execute(DDL)
        # All original status/array/retry/error/timestamp values survive exact 048.
        for i, status in enumerate([*worker.RECOVERABLE, "FAILED", "COMPLETED"]):
            await conn.execute("""
                INSERT INTO account_deletion_requests(user_id,email,auth_user_ids,storage_paths,status,retry_count,last_error)
                VALUES($1,'synthetic@example.invalid',$2,'["unchanged/reference"]',$3,$4,'unchanged')
            """, uuid4(), [str(uuid4())], status, i)
        before = [dict(r) for r in await conn.fetch("SELECT * FROM account_deletion_requests ORDER BY id")]
        await conn.execute(Path("app/database/migrations/048_account_deletion_claim_leases.sql").read_text())
        after = [dict(r) for r in await conn.fetch("SELECT * FROM account_deletion_requests ORDER BY id")]
        assert [{k:v for k,v in r.items() if k not in {"claim_token","lease_expires_at","next_attempt_at"}} for r in after] == before
        assert all(r["claim_token"] is None and r["lease_expires_at"] is None and r["next_attempt_at"] is None for r in after)
        await check_deletion_claim_constraint(conn)
        await conn.execute("TRUNCATE account_deletion_requests RESTART IDENTITY")
        pool = await asyncpg.create_pool(local_dsn, min_size=1, max_size=16, command_timeout=10)
        monkeypatch.setattr(db, "_pool", pool)
        async def auth(target):
            await fake_call(pool, "auth", target)
        async def storage(bucket, key):
            await fake_call(pool, "storage", bucket+"/"+key)
            return StorageDeleteResult(True)
        monkeypatch.setattr(worker, "_auth_delete", auth)
        monkeypatch.setattr(worker, "delete_storage_target", storage)
        async def no_metrics(*args): pass
        monkeypatch.setattr(account, "refresh_public_growth_metrics", no_metrics)
        yield SimpleNamespace(conn=conn, pool=pool, dsn=local_dsn, auth=auth, storage=storage)
    finally:
        try:
            if pool:
                await asyncio.wait_for(pool.close(), 10)
        finally:
            await conn.close(timeout=10)
            assert name.startswith("p1_deletion_") and len(name) == len("p1_deletion_")+32
            await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            await admin.close(timeout=10)


async def seed(case, status="DB_DELETED", retry=0, targets=1):
    owner, session = uuid4(), uuid4()
    auth = [str(uuid4()) for _ in range(targets)]
    paths = [f"{session}/{uuid4()}/1.webm" for _ in range(targets)]
    rid = await case.conn.fetchval("""
        INSERT INTO account_deletion_requests(user_id,email,auth_user_ids,storage_paths,status,retry_count)
        VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id
    """, owner, str(owner)+"@example.invalid", auth, json.dumps(paths), status, retry)
    receipt = {"version":1,"request_id":rid,"user_id":str(owner),"auth_user_ids":auth,
               "storage_paths":paths,"db_deleted":True,
               "storage_bindings":[{"path":p,"user_id":str(owner),"session_id":str(session)} for p in paths]}
    await case.conn.execute("INSERT INTO old_user(user_id,email,metadata) VALUES($1,$2,$3::jsonb)",
                            owner, str(owner)+"@example.invalid", json.dumps({"deletion_requests":{str(rid):receipt}}))
    return SimpleNamespace(id=rid, owner=owner, session=session, auth=auth, paths=paths, receipt=receipt)


async def row(case, rid):
    return dict(await case.conn.fetchrow("SELECT * FROM account_deletion_requests WHERE id=$1", rid))


async def counts(case):
    return {kind: (
        await case.conn.fetchval("SELECT count(*) FROM provider_attempts WHERE kind=$1", kind),
        await case.conn.fetchval("SELECT count(*) FROM provider_effects WHERE kind=$1", kind)
    ) for kind in ("auth","storage")}


async def drain():
    while await worker.process_due_deletions():
        pass


async def expire(case, rid):
    await case.conn.execute("""
        UPDATE account_deletion_requests SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE id=$1 AND claim_token IS NOT NULL
    """, rid)


@pytest.mark.parametrize("consumers", [1,2,10])
async def test_same_request_exclusive(case, consumers):
    job = await seed(case)
    await asyncio.gather(*[worker.dispatch_deletion(job.id) for _ in range(consumers)])
    assert (await row(case,job.id))["status"] == "COMPLETED"
    assert (await row(case,job.id))["retry_count"] == 0
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}
    await asyncio.gather(*[drain() for _ in range(consumers)])
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


async def test_100_requests_10_workers(case):
    for _ in range(100):
        await seed(case)
    await asyncio.gather(*[drain() for _ in range(10)])
    assert await case.conn.fetchval("SELECT count(*) FROM account_deletion_requests WHERE status='COMPLETED'") == 100
    assert await counts(case) == {"auth":(100,100),"storage":(100,100)}
    metrics = await worker.deletion_queue_metrics()
    assert metrics["pending"] == 0 and metrics["active_claims"] == 0


async def test_expiry_fences_every_write_and_renewal(case):
    item = await seed(case)
    first = await worker.claim_deletion(item.id)
    assert await worker.claim_deletion(item.id) is None
    assert (await row(case,item.id))["retry_count"] == 0
    await expire(case,item.id)
    with pytest.raises(worker.LostClaim):
        await worker._checkpoint(first,"AUTH_PENDING")
    with pytest.raises(worker.LostClaim):
        await worker._owns_claim(first,True)
    second = await worker.claim_deletion(item.id)
    assert first["claim_token"] != second["claim_token"]
    assert second["retry_count"] == 1
    for operation in [
        lambda:worker._checkpoint(first,"AUTH_PENDING"),
        lambda:worker._failure(first,"STALE"),
        lambda:worker._owns_claim(first,True),
        lambda:worker._remember_operation(first,"auth",item.auth[0]),
    ]:
        with pytest.raises(worker.LostClaim):
            await operation()
    assert (await row(case,item.id))["claim_token"] == second["claim_token"]
    await worker._checkpoint(second,"AUTH_PENDING")
    await worker.dispatch_deletion(item.id)
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


@pytest.mark.parametrize("phase", ["AUTH_PENDING","STORAGE_PENDING"])
async def test_temporary_failure_backoff_and_count(case, monkeypatch, phase):
    item = await seed(case,phase)
    calls = 0
    async def fail(*args):
        nonlocal calls
        calls += 1
        raise worker.InvalidTargets("TEMPORARY_PROVIDER_FAILURE",False)
    monkeypatch.setattr(worker, "_auth_delete" if phase=="AUTH_PENDING" else "delete_storage_target", fail)
    assert await worker.process_due_deletions(item.id) == 1
    failed = await row(case,item.id)
    assert failed["status"] == phase and failed["retry_count"] == 1
    assert failed["claim_token"] is None and failed["lease_expires_at"] is None
    assert failed["next_attempt_at"] > failed["updated_at"]
    assert await worker.process_due_deletions(item.id) == 0
    assert calls == 1
    monkeypatch.setattr(worker, "_auth_delete",case.auth)
    monkeypatch.setattr(worker, "delete_storage_target",case.storage)
    await case.conn.execute("UPDATE account_deletion_requests SET next_attempt_at=clock_timestamp() WHERE id=$1",item.id)
    await worker.dispatch_deletion(item.id)
    assert (await row(case,item.id))["status"] == "COMPLETED"
    assert (await row(case,item.id))["retry_count"] == 1


async def test_successful_target_not_replayed_after_later_failure(case, monkeypatch):
    item = await seed(case, "AUTH_PENDING", targets=2)
    async def fail_second(target):
        if target == item.auth[1]:
            raise worker.InvalidTargets("TEMPORARY_PROVIDER_FAILURE",False)
        await case.auth(target)
    monkeypatch.setattr(worker,"_auth_delete",fail_second)
    await worker.process_due_deletions(item.id)
    assert await counts(case) == {"auth":(1,1),"storage":(0,0)}
    monkeypatch.setattr(worker,"_auth_delete",case.auth)
    await case.conn.execute("UPDATE account_deletion_requests SET next_attempt_at=clock_timestamp() WHERE id=$1",item.id)
    await worker.dispatch_deletion(item.id)
    assert await counts(case) == {"auth":(2,2),"storage":(2,2)}


async def test_poison_does_not_starve_and_exhausts(case):
    poison = await seed(case)
    good = await seed(case)
    await case.conn.execute("UPDATE account_deletion_requests SET storage_paths='{}' WHERE id=$1", poison.id)
    await drain()
    assert (await row(case,good.id))["status"] == "COMPLETED"
    for n in range(1,10):
        assert (await row(case,poison.id))["retry_count"] == n
        await case.conn.execute("UPDATE account_deletion_requests SET next_attempt_at=clock_timestamp() WHERE id=$1",poison.id)
        await worker.process_due_deletions(poison.id)
    final = await row(case,poison.id)
    assert final["status"] == "FAILED" and final["retry_count"] == 10
    assert final["last_error"] == "RETRY_EXHAUSTED:MALFORMED_PAYLOAD"
    assert final["claim_token"] is None and final["next_attempt_at"] is None
    assert await worker.process_due_deletions(poison.id) == 0
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


@pytest.mark.parametrize("status", ["AUTH_DELETED","STORAGE_DELETED","REQUESTED","RETRY_REQUIRED","FAILED","COMPLETED"])
async def test_checkpoint_and_legacy_recovery(case,status):
    item = await seed(case,status)
    await worker.dispatch_deletion(item.id)
    final = await row(case,item.id)
    if status in {"RETRY_REQUIRED","FAILED"}:
        assert final["status"] == "FAILED"
    else:
        assert final["status"] == "COMPLETED"
    expected = {"auth":(0,0),"storage":(0,0)}
    if status in {"AUTH_DELETED","REQUESTED"}:
        expected["storage"] = (1,1)
    if status == "REQUESTED":
        expected["auth"] = (1,1)
    assert await counts(case) == expected


@pytest.mark.parametrize("unsafe", ["foreign_url","receipt_owner","auth_owner","storage_owner","legacy","requested_live","changed_targets"])
async def test_unsafe_targets_have_zero_calls(case,unsafe):
    item = await seed(case, "REQUESTED" if unsafe=="requested_live" else "DB_DELETED")
    if unsafe == "foreign_url":
        await case.conn.execute("UPDATE account_deletion_requests SET storage_paths=$2::jsonb WHERE id=$1",
                                item.id,json.dumps(["https://foreign.invalid/storage/v1/object/public/bucket/a"]))
    elif unsafe == "changed_targets":
        await case.conn.execute("UPDATE account_deletion_requests SET auth_user_ids=$2 WHERE id=$1",item.id,[str(uuid4())])
    elif unsafe in {"auth_owner","requested_live"}:
        other = uuid4() if unsafe=="auth_owner" else item.owner
        await case.conn.execute("INSERT INTO profiles VALUES($1,'synthetic@example.invalid','Synthetic')",other)
        if unsafe=="auth_owner":
            await case.conn.execute("INSERT INTO auth_identity_links VALUES($1,$2)",UUID(item.auth[0]),other)
    elif unsafe == "legacy":
        await case.conn.execute("UPDATE old_user SET metadata=NULL WHERE user_id=$1",item.owner)
    else:
        if unsafe == "receipt_owner":
            item.receipt["user_id"] = str(uuid4())
        else:
            item.receipt["storage_bindings"][0]["user_id"] = str(uuid4())
        await case.conn.execute("UPDATE old_user SET metadata=$2::jsonb WHERE user_id=$1",item.owner,
                                json.dumps({"deletion_requests":{str(item.id):item.receipt}}))
    await worker.dispatch_deletion(item.id)
    assert (await row(case,item.id))["status"] == "FAILED"
    assert await counts(case) == {"auth":(0,0),"storage":(0,0)}


async def test_endpoint_immediate_poller_collision(case):
    owner, session, identity = uuid4(),uuid4(),uuid4()
    path = f"{session}/{uuid4()}/1.webm"
    await case.conn.execute("INSERT INTO profiles VALUES($1,'synthetic@example.invalid','Synthetic')",owner)
    await case.conn.execute("INSERT INTO auth_identity_links VALUES($1,$2)",identity,owner)
    await case.conn.execute("INSERT INTO interview_sessions VALUES($1,$2,NULL)",session,owner)
    await case.conn.execute("INSERT INTO interview_audio_turns VALUES($1,$2)",session,path)
    background = BackgroundTasks()
    result = await account.delete_account(background,UserProfile(str(owner),"synthetic@example.invalid","free"))
    assert result["cleanup_status"] == "pending"
    assert await case.conn.fetchval("SELECT count(*) FROM profiles") == 0
    assert len(background.tasks) == 1
    assert background.tasks[0].func is worker.dispatch_deletion
    await asyncio.gather(background(), *[drain() for _ in range(10)])
    assert await case.conn.fetchval("SELECT status FROM account_deletion_requests") == "COMPLETED"
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


async def test_readiness_rejects_unvalidated_or_wrong_pair(case):
    await case.conn.execute("ALTER TABLE account_deletion_requests DROP CONSTRAINT account_deletion_requests_claim_pair_check")
    with pytest.raises(db.DatabaseNotReadyError):
        await check_deletion_claim_constraint(case.conn)
    await case.conn.execute("""
        ALTER TABLE account_deletion_requests ADD CONSTRAINT account_deletion_requests_claim_pair_check
        CHECK ((claim_token IS NULL)=(lease_expires_at IS NULL)) NOT VALID
    """)
    with pytest.raises(db.DatabaseNotReadyError):
        await check_deletion_claim_constraint(case.conn)
    await case.conn.execute("ALTER TABLE account_deletion_requests VALIDATE CONSTRAINT account_deletion_requests_claim_pair_check")
    await check_deletion_claim_constraint(case.conn)
    with pytest.raises(asyncpg.CheckViolationError):
        await case.conn.execute("INSERT INTO account_deletion_requests(user_id,email,auth_user_ids,claim_token) VALUES($1,'x','{}',$2)",uuid4(),uuid4())
    await case.conn.execute("ALTER TABLE account_deletion_requests DROP CONSTRAINT account_deletion_requests_claim_pair_check")
    await case.conn.execute("""
        ALTER TABLE account_deletion_requests ADD CONSTRAINT account_deletion_requests_claim_pair_check
        CHECK (claim_token IS NULL OR lease_expires_at IS NOT NULL)
    """)
    with pytest.raises(db.DatabaseNotReadyError):
        await check_deletion_claim_constraint(case.conn)


# The child uses the real dispatcher/SQL and a separately committed fake provider.
CHILD = r"""
import asyncio,json,os,sys
import asyncpg
from urllib.parse import urlsplit
from app.database import connection as db
from app.services import deletion_worker as w
from app.services.storage_cleanup import StorageDeleteResult
dsn,rid,point=sys.argv[1],int(sys.argv[2]),sys.argv[3]
assert urlsplit(dsn).hostname in {'127.0.0.1','localhost','::1'}
assert urlsplit(dsn).path.startswith('/p1_deletion_')
async def park():
    print('PARKED',flush=True)
    await asyncio.Event().wait()
async def main():
    pool=await asyncpg.create_pool(dsn,min_size=1,max_size=4,command_timeout=10)
    db._pool=pool
    async def provider(kind,target):
        async with pool.acquire() as c:
            async with c.transaction():
                await c.execute('INSERT INTO provider_attempts VALUES($1,$2)',kind,target)
                await c.execute('INSERT INTO provider_effects VALUES($1,$2) ON CONFLICT DO NOTHING',kind,target)
    async def auth(target):
        if point=='B': await park()
        await provider('auth',target)
        if point=='C': await park()
    async def storage(bucket,key):
        await provider('storage',bucket+'/'+key)
        if point=='E': await park()
        return StorageDeleteResult(True)
    claim=w.claim_deletion
    async def wrapped_claim(request_id=None):
        job=await claim(request_id)
        if job and point=='A': await park()
        return job
    checkpoint=w._checkpoint
    async def wrapped_checkpoint(job,status):
        if point=='G' and status=='COMPLETED': await park()
        await checkpoint(job,status)
        if (point=='D' and status=='AUTH_DELETED') or (point=='F' and status=='STORAGE_DELETED'):
            await park()
    w._auth_delete=auth
    w.delete_storage_target=storage
    w.claim_deletion=wrapped_claim
    w._checkpoint=wrapped_checkpoint
    await w.dispatch_deletion(rid)
    await pool.close()
asyncio.run(main())
"""


@pytest.mark.parametrize("point", list("ABCDEFG"))
async def test_real_process_death_and_restart(case,point):
    item = await seed(case)
    env = dict(os.environ)
    env["DATABASE_URL"] = case.dsn
    proc = await asyncio.create_subprocess_exec(sys.executable,"-u","-c",CHILD,case.dsn,str(item.id),point,
                                               stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT,env=env)
    lines = []
    try:
        async def parked():
            while True:
                line = await proc.stdout.readline()
                if not line:
                    raise AssertionError("Child exited: "+b"".join(lines).decode(errors="replace"))
                lines.append(line)
                if line.strip() == b"PARKED":
                    return
        await asyncio.wait_for(parked(),20)
        proc.kill()
        await asyncio.wait_for(proc.wait(),10)
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
    await expire(case,item.id)
    await worker.dispatch_deletion(item.id)
    assert (await row(case,item.id))["status"] == "COMPLETED"
    expected = {"auth":(2 if point=="C" else 1,1),"storage":(2 if point=="E" else 1,1)}
    assert await counts(case) == expected
    print("CRASH",point,"ATTEMPTS/EFFECTS",await counts(case))


async def test_heartbeat_renews_lease_and_lost_ownership_stops_calls(case,monkeypatch):
    item = await seed(case,"AUTH_PENDING",targets=2)
    entered, cancelled = asyncio.Event(), asyncio.Event()
    calls = []
    async def blocked(target):
        calls.append(target)
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    monkeypatch.setattr(worker,"_auth_delete",blocked)
    monkeypatch.setattr(worker,"RENEW_SECONDS",0.02)
    task = asyncio.create_task(worker.process_due_deletions(item.id))
    try:
        await asyncio.wait_for(entered.wait(),3)
        original = await row(case,item.id)
        await asyncio.sleep(0.08)
        renewed = await row(case,item.id)
        assert renewed["lease_expires_at"] > original["lease_expires_at"]
        successor = uuid4()
        await case.conn.execute("UPDATE account_deletion_requests SET claim_token=$2 WHERE id=$1",item.id,successor)
        await asyncio.wait_for(task,3)
        assert cancelled.is_set() and len(calls) == 1
        final = await row(case,item.id)
        assert final["claim_token"] == successor and final["status"] == "AUTH_PENDING" and final["retry_count"] == 0
    finally:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)


async def test_both_providers_already_absent_remain_success(case):
    item = await seed(case)
    # A previous independently committed deletion has already removed these targets.
    await case.conn.execute("INSERT INTO provider_effects VALUES('auth',$1)",item.auth[0])
    await case.conn.execute("INSERT INTO provider_effects VALUES('storage',$1)","interview-audio/"+item.paths[0])
    before = await counts(case)
    await worker.dispatch_deletion(item.id)
    assert (await row(case,item.id))["status"] == "COMPLETED"
    after = await counts(case)
    assert after == {"auth":(1,1),"storage":(1,1)}
    assert all(after[k][1]-before[k][1] == 0 for k in after)


@pytest.mark.parametrize("retry", [10,11])
async def test_preexisting_exhausted_row_transitions_without_provider(case,retry):
    item = await seed(case,"AUTH_PENDING",retry)
    await worker.dispatch_deletion(item.id)
    final = await row(case,item.id)
    assert final["status"] == "FAILED" and final["retry_count"] == retry
    assert final["claim_token"] is None
    assert await counts(case) == {"auth":(0,0),"storage":(0,0)}


async def test_endpoint_archive_conflict_rolls_back_local_delete_and_request(case):
    owner, other = uuid4(),uuid4()
    await case.conn.execute("INSERT INTO profiles VALUES($1,'synthetic@example.invalid','Synthetic')",owner)
    await case.conn.execute("INSERT INTO old_user(user_id,email,metadata) VALUES($1,'synthetic@example.invalid','{}')",other)
    background = BackgroundTasks()
    with pytest.raises(HTTPException) as error:
        await account.delete_account(background,UserProfile(str(owner),"synthetic@example.invalid","free"))
    assert error.value.status_code == 409
    assert await case.conn.fetchval("SELECT count(*) FROM profiles") == 1
    assert await case.conn.fetchval("SELECT count(*) FROM account_deletion_requests") == 0
    assert not background.tasks
    assert await counts(case) == {"auth":(0,0),"storage":(0,0)}


async def test_duplicate_references_do_not_duplicate_provider_calls(case):
    item = await seed(case)
    alternate = "https://test.supabase.co/storage/v1/object/sign/interview-audio/"+item.paths[0]+"?token=synthetic"
    item.receipt["auth_user_ids"] *= 2
    item.receipt["storage_paths"].append(alternate)
    item.receipt["storage_bindings"].append({"path":alternate,"user_id":str(item.owner),"session_id":str(item.session)})
    await case.conn.execute("UPDATE account_deletion_requests SET auth_user_ids=$2,storage_paths=$3::jsonb WHERE id=$1",
                           item.id,item.receipt["auth_user_ids"],json.dumps(item.receipt["storage_paths"]))
    await case.conn.execute("UPDATE old_user SET metadata=$2::jsonb WHERE user_id=$1",
                           item.owner,json.dumps({"deletion_requests":{str(item.id):item.receipt}}))
    await worker.dispatch_deletion(item.id)
    assert (await row(case,item.id))["status"] == "COMPLETED"
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


async def test_provider_internal_retry_does_not_consume_processing_attempt(case,monkeypatch):
    item = await seed(case,"AUTH_PENDING")
    attempts = 0
    async def provider(target):
        nonlocal attempts
        attempts += 1
        assert await case.conn.fetchval("""
            SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
              AND state='idle in transaction' AND pid<>pg_backend_pid()
        """) == 0
        if attempts < 3:
            raise account.AuthDeletionError(True)
        await case.auth(target)
    monkeypatch.setattr(account,"_delete_supabase_auth_user",provider)
    monkeypatch.setattr(account,"_AUTH_DELETE_RETRY_BASE_DELAY",0)
    monkeypatch.setattr(worker,"_auth_delete",REAL_AUTH_DELETE)
    await worker.dispatch_deletion(item.id)
    assert attempts == 3 and (await row(case,item.id))["retry_count"] == 0
    assert (await row(case,item.id))["status"] == "COMPLETED"
    assert await counts(case) == {"auth":(1,1),"storage":(1,1)}


async def test_endpoint_waits_for_concurrent_audio_reference_update(case):
    owner, session = uuid4(),uuid4()
    old_path,new_path = f"{session}/{uuid4()}/old.webm",f"{session}/{uuid4()}/new.webm"
    await case.conn.execute("INSERT INTO profiles VALUES($1,'synthetic@example.invalid','Synthetic')",owner)
    await case.conn.execute("INSERT INTO interview_sessions VALUES($1,$2,NULL)",session,owner)
    await case.conn.execute("INSERT INTO interview_audio_turns VALUES($1,$2)",session,old_path)
    editor = await asyncpg.connect(case.dsn)
    task = None
    try:
        transaction = editor.transaction()
        await transaction.start()
        await editor.execute("UPDATE interview_audio_turns SET audio_object_path=$2 WHERE session_id=$1",session,new_path)
        background = BackgroundTasks()
        task = asyncio.create_task(account.delete_account(background,UserProfile(str(owner),"synthetic@example.invalid","free")))
        # Wait until the endpoint is blocked on the source-row lock.
        async def blocked():
            while not await case.conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
                  AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF a%')
            """):
                if task.done(): await task
                await asyncio.sleep(0.01)
        await asyncio.wait_for(blocked(),5)
        await transaction.commit()
        await asyncio.wait_for(task,5)
        paths = json.loads(await case.conn.fetchval("SELECT storage_paths FROM account_deletion_requests"))
        assert paths == [new_path]
        await background()
        assert await counts(case) == {"auth":(1,1),"storage":(1,1)}
    finally:
        if task:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
        await editor.close()
