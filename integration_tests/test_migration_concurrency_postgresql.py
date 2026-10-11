"""Migration synchronization on real independent PostgreSQL sessions/processes.

Only randomly named disposable loopback databases are used. Synthetic migrations
create the readiness column contract; real 048 is copied unchanged. Historical
Supabase/cron/role migrations are neither rewritten nor replayed by this fixture.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit,urlunsplit
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio

ROOT=Path(__file__).resolve().parents[1]
DSN=os.environ.get("PREPVISTA_TEST_DATABASE_URL","postgresql://postgres@127.0.0.1:55322/postgres")
TARGET=urlsplit(DSN)
if TARGET.scheme not in {"postgres","postgresql"} or TARGET.hostname not in {"127.0.0.1","localhost","::1"} or TARGET.query or TARGET.fragment:
    raise RuntimeError("Migration tests require loopback-only disposable PostgreSQL")
for key,value in {
    "ENVIRONMENT":"development","PREPVISTA_DEBUG":"false","DATABASE_URL":DSN,
    "SUPABASE_URL":"https://test.supabase.co","SUPABASE_ANON_KEY":"synthetic",
    "SUPABASE_SERVICE_KEY":"synthetic","SUPABASE_JWT_SECRET":"synthetic-secret-long-enough-for-tests",
}.items(): os.environ[key]=value
from app.database import connection as db
from app.database.readiness import REQUIRED_SCHEMA,check_schema_readiness

pytestmark=pytest.mark.asyncio

def contract_sql():
    statements=[]
    for table,types in REQUIRED_SCHEMA.items():
        columns=[]
        for kind,names in types.items():
            for name in names.split():
                if table=="account_deletion_requests" and name in {"claim_token","lease_expires_at","next_attempt_at"}:
                    continue
                columns.append(f'"{name}" {kind}')
        statements.append(f'CREATE TABLE "{table}" ('+",".join(columns)+");")
    return "\n".join(statements)+"\nSELECT pg_sleep(0.15);"


@pytest_asyncio.fixture
async def case(monkeypatch):
    name="p1_migration_"+uuid4().hex
    admin=await asyncpg.connect(DSN)
    await admin.execute(f'CREATE DATABASE "{name}"')
    dsn=urlunsplit(TARGET._replace(path="/"+name))
    conn=await asyncpg.connect(dsn)
    directory=ROOT/".audit-runtime"/"migration-tests"/uuid4().hex
    (directory/"migrations").mkdir(parents=True)
    (directory/"migrations"/"001_contract.sql").write_text(contract_sql())
    (directory/"migrations"/"034_a_probe.sql").write_text("CREATE TABLE prefix_a(id integer); INSERT INTO prefix_a VALUES(1);")
    (directory/"migrations"/"034_b_probe.sql").write_text("CREATE TABLE prefix_b(id integer); INSERT INTO prefix_b VALUES(1);")
    actual048=ROOT/"app/database/migrations/048_account_deletion_claim_leases.sql"
    (directory/"migrations"/actual048.name).write_bytes(actual048.read_bytes())
    await conn.execute("""
        CREATE TABLE audit_attempts(process_id integer,kind text,version text,backend_pid integer);
        CREATE TABLE audit_arrived(process_id integer);
        CREATE TABLE audit_gate(ready boolean);
        INSERT INTO audit_gate VALUES(true);
    """)
    assert await conn.fetchval("SHOW fsync")=="on"
    assert await conn.fetchval("SHOW synchronous_commit")=="on"
    monkeypatch.setattr(db,"__file__",str(directory/"connection.py"))
    monkeypatch.setattr(db,"_pool",None)
    monkeypatch.setattr(db,"_POOL_INIT_LOCK",asyncio.Lock())
    settings=SimpleNamespace(DATABASE_URL=dsn,MIGRATION_LOCK_TIMEOUT_SECONDS=2.,DB_POOL_MIN_SIZE=1,DB_POOL_MAX_SIZE=2)
    monkeypatch.setattr(db,"get_settings",lambda:settings)
    children=[]
    item=SimpleNamespace(conn=conn,dsn=dsn,directory=directory,settings=settings,children=children)
    try:
        yield item
    finally:
        for proc in children:
            if proc.returncode is None: proc.kill()
        await asyncio.gather(*(proc.wait() for proc in children))
        try:
            await asyncio.wait_for(db.close_db_pool(),10)
        finally:
            await conn.close(timeout=10)
            assert name.startswith("p1_migration_") and len(name)==len("p1_migration_")+32
            await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            await admin.close(timeout=10)


async def launch(case,mode="normal",wait="5"):
    proc=await asyncio.create_subprocess_exec(
        sys.executable,str(ROOT/"scripts/audit_migration_process.py"),case.dsn,str(case.directory),mode,wait,
        stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT)
    case.children.append(proc)
    return proc


async def finish(proc):
    output,_=await asyncio.wait_for(proc.communicate(),30)
    lines=output.decode(errors="replace").splitlines()
    results=[json.loads(line[7:]) for line in lines if line.startswith("RESULT ")]
    assert proc.returncode==0 and len(results)==1,output.decode(errors="replace")
    return results[0]


async def parked(proc):
    async with asyncio.timeout(15):
        while True:
            line=await proc.stdout.readline()
            if not line: raise AssertionError("Worker exited before fault seam")
            if line.startswith(b"PARKED "): return int(line.split()[1])


async def wait_for(predicate):
    async with asyncio.timeout(30):
        while not await predicate(): await asyncio.sleep(.01)


async def lock_count(case):
    return await case.conn.fetchval("""
        SELECT count(*) FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND locktype='advisory'
    """)


async def assert_clean_and_pool_usable(case):
    assert await lock_count(case)==0
    assert await case.conn.fetchval("""
        SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
          AND application_name='prepvista-migrations'
    """)==0
    # Independent application-size pool must remain usable after failure/cleanup.
    pool=await asyncpg.create_pool(case.dsn,min_size=2,max_size=2)
    try:
        async with pool.acquire() as a,pool.acquire() as b:
            assert await a.fetchval("SELECT 1")==1
            assert await b.fetchval("SELECT 1")==1
    finally: await asyncio.wait_for(pool.close(),5)


async def ledger(case):
    return {r["version"]:r["checksum"] for r in await case.conn.fetch("SELECT version,checksum FROM schema_migrations")}


async def apply(case):
    mconn = await asyncpg.connect(case.dsn, server_settings={"application_name": "prepvista-migrations"})
    try:
        await db._run_migrations(mconn)
    finally:
        await mconn.close()
    await db.init_db_pool(max_attempts=1)
    async with db.DatabaseConnection() as conn:
        await check_schema_readiness(conn)
    await db.close_db_pool()


@pytest.mark.parametrize("runners",[1,2,5,10])
async def test_simultaneous_clean_startups(case,runners):
    await case.conn.execute("UPDATE audit_gate SET ready=false")
    procs=[await launch(case) for _ in range(runners)]
    async def arrived(): return await case.conn.fetchval("SELECT count(*) FROM audit_arrived")==runners
    await wait_for(arrived)
    await case.conn.execute("UPDATE audit_gate SET ready=true")
    results=await asyncio.gather(*(finish(p) for p in procs))
    assert all(r["status"]=="ready" and r["readiness"] and r["pool_usable"] for r in results),results
    attempts=await case.conn.fetch("SELECT kind,version,count(*) n FROM audit_attempts WHERE kind IN ('DDL','LEDGER') GROUP BY kind,version")
    assert len(attempts)==8 and all(r["n"]==1 for r in attempts)
    assert len(await ledger(case))==4
    assert await case.conn.fetchval("SELECT count(*) FROM prefix_a")==1
    assert await case.conn.fetchval("SELECT count(*) FROM prefix_b")==1
    await assert_clean_and_pool_usable(case)
    print("CONCURRENCY",runners,"DDL=4 LEDGER=4 DUPLICATES=0 READY="+str(runners))


async def test_all_applied_and_unknown_versions(case):
    await apply(case)
    await case.conn.execute("INSERT INTO schema_migrations(version,checksum) VALUES('046_remote_only','remote-checksum')")
    before=await ledger(case)
    procs=[await launch(case) for _ in range(5)]
    results=await asyncio.gather(*(finish(p) for p in procs))
    assert all(r["status"]=="ready" for r in results)
    assert await case.conn.fetchval("SELECT count(*) FROM audit_attempts WHERE kind IN ('DDL','LEDGER')")==0
    assert await ledger(case)==before
    await assert_clean_and_pool_usable(case)


async def test_only_048_missing_preserves_rows_under_10_processes(case):
    # Model an existing schema/ledger matching every repository migration except
    # 048. Do not replay historical role/cron/data migrations to test synchronization.
    await case.conn.execute(contract_sql())
    await case.conn.execute("""
        CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT now(),checksum TEXT)
    """)
    for name in ("001_contract.sql","034_a_probe.sql","034_b_probe.sql"):
        (case.directory/"migrations"/name).unlink()  # This fixture's synthetic files only.
    repository=ROOT/"app/database/migrations"
    for original in repository.glob("*.sql"):
        (case.directory/"migrations"/original.name).write_bytes(original.read_bytes())
        if original.stem!="048_account_deletion_claim_leases":
            await case.conn.execute("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",
                                    original.stem,db._compute_migration_checksum(db._read_migration_sql(original)))
    assert await case.conn.fetchval("SELECT count(*) FROM schema_migrations")==(len(list(ROOT.joinpath("app/database/migrations").glob("*.sql")))-1)
    owner=uuid4()
    await case.conn.execute("""
        INSERT INTO account_deletion_requests(id,user_id,email,auth_user_ids,storage_paths,status,retry_count,created_at,updated_at)
        VALUES(7,$1,'synthetic@example.invalid',$2,'["original/path"]','AUTH_DELETED',4,now(),now())
    """,owner,[str(owner)])
    before=dict(await case.conn.fetchrow("SELECT * FROM account_deletion_requests"))
    procs=[await launch(case) for _ in range(10)]
    results=await asyncio.gather(*(finish(p) for p in procs))
    assert all(r["status"]=="ready" for r in results),results
    after=dict(await case.conn.fetchrow("SELECT * FROM account_deletion_requests"))
    assert {k:v for k,v in after.items() if k in before}==before
    assert all(after[k] is None for k in ("claim_token","lease_expires_at","next_attempt_at"))
    attempts=await case.conn.fetch("SELECT kind,version FROM audit_attempts WHERE kind IN ('DDL','LEDGER')")
    assert sorted((r["kind"],r["version"]) for r in attempts)==[
        ("DDL","048_account_deletion_claim_leases"),("LEDGER","048_account_deletion_claim_leases")]
    await assert_clean_and_pool_usable(case)


@pytest.mark.parametrize("checksum",[None,"", "invalid", "0"*64])
async def test_checksum_fatal_after_wait_and_before_any_new_ddl(case,checksum):
    await apply(case)
    (case.directory/"migrations"/"000_new_earlier.sql").write_text("CREATE TABLE forbidden_ddl(id integer);")
    holder=await asyncpg.connect(case.dsn)
    await holder.execute("SELECT pg_advisory_lock($1::bigint)",db.MIGRATION_LOCK_KEY)
    proc=await launch(case)
    async def waiting():
        return await case.conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted)")
    await wait_for(waiting)
    await holder.execute("UPDATE schema_migrations SET checksum=$1 WHERE version='034_b_probe'",checksum)
    await holder.close()
    result=await finish(proc)
    assert result["status"]=="error" and result["error_type"]=="MigrationStartupError",result
    assert result["pool_created"] is False
    assert await case.conn.fetchval("SELECT to_regclass('forbidden_ddl')") is None
    assert (await ledger(case))["034_b_probe"]==checksum
    await assert_clean_and_pool_usable(case)


@pytest.mark.parametrize("point",["holding","during","after_ledger"])
async def test_process_death_releases_lock_and_rolls_back(case,point):
    proc=await launch(case,point)
    backend=await parked(proc)
    successor=await launch(case)
    async def waiting():
        return await case.conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted)")
    await wait_for(waiting)
    assert await case.conn.fetchval("SELECT to_regclass('profiles')") is None
    if point!="holding":
        assert await case.conn.fetchval("SELECT count(*) FROM schema_migrations")==0
    proc.kill()
    await asyncio.wait_for(proc.wait(),10)
    result=await finish(successor)
    assert result["status"]=="ready",result
    assert len(await ledger(case))==4
    assert not await case.conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1)",backend)
    await assert_clean_and_pool_usable(case)


async def test_connection_loss_rolls_back_and_releases_lock(case):
    proc=await launch(case,"during")
    backend=await parked(proc)
    assert await case.conn.fetchval("SELECT pg_terminate_backend($1)",backend)
    # Parked Python is deliberately not awaiting its socket. Kill it after proving
    # the database session ended; a new process must proceed immediately.
    successor=await launch(case)
    result=await finish(successor)
    assert result["status"]=="ready",result
    proc.kill()
    await proc.wait()
    await assert_clean_and_pool_usable(case)


async def test_bounded_lock_timeout_does_not_create_pool(case):
    holder=await asyncpg.connect(case.dsn)
    await holder.execute("SELECT pg_advisory_lock($1::bigint)",db.MIGRATION_LOCK_KEY)
    try:
        result=await finish(await launch(case,wait="0.15"))
        assert result["status"]=="error" and result["error_type"]=="MigrationLockTimeout",result
        assert not result["pool_created"]
        assert await lock_count(case)==1  # Holder only, not a leaked waiter.
    finally: await holder.close()
    await apply(case)
    await assert_clean_and_pool_usable(case)


async def test_startup_cancellation_while_waiting(case):
    holder=await asyncpg.connect(case.dsn)
    await holder.execute("SELECT pg_advisory_lock($1::bigint)",db.MIGRATION_LOCK_KEY)
    async def migrate_task():
        mconn = await asyncpg.connect(case.dsn, server_settings={"application_name": "prepvista-migrations"})
        try:
            await db._run_migrations(mconn)
        finally:
            await mconn.close()
    task=asyncio.create_task(migrate_task())
    try:
        async def waiting():
            return await case.conn.fetchval("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")>0
        await wait_for(waiting)
        task.cancel()
        with pytest.raises(asyncio.CancelledError): await task
        assert db._pool is None and await lock_count(case)==1
    finally:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)
        await holder.close()
    await apply(case)
    await assert_clean_and_pool_usable(case)


async def test_startup_cancellation_while_holding(case,monkeypatch):
    original=db._run_migrations_locked
    entered=asyncio.Event()
    async def blocked(conn):
        async with conn.transaction():
            await conn.execute("CREATE TABLE uncommitted_probe(id integer)")
            entered.set()
            await asyncio.Event().wait()
    monkeypatch.setattr(db,"_run_migrations_locked",blocked)
    async def migrate_task():
        mconn = await asyncpg.connect(case.dsn, server_settings={"application_name": "prepvista-migrations"})
        try:
            await db._run_migrations(mconn)
        finally:
            await mconn.close()
    task=asyncio.create_task(migrate_task())
    await asyncio.wait_for(entered.wait(),5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert db._pool is None
    assert await case.conn.fetchval("SELECT to_regclass('uncommitted_probe')") is None
    await assert_clean_and_pool_usable(case)
    monkeypatch.setattr(db,"_run_migrations_locked",original)
    await apply(case)


async def test_failed_migration_no_false_ledger_and_successful_retry(case):
    path=case.directory/"migrations"/"034_b_probe.sql"
    original=path.read_text()
    path.write_text("CREATE TABLE rolled_back(id integer); SELECT 1/0;")
    with pytest.raises(db.MigrationStartupError):
        mconn = await asyncpg.connect(case.dsn, server_settings={"application_name": "prepvista-migrations"})
        try:
            await db._run_migrations(mconn)
        finally:
            await mconn.close()
    assert db._pool is None
    assert "034_b_probe" not in await ledger(case)
    assert await case.conn.fetchval("SELECT to_regclass('rolled_back')") is None
    await assert_clean_and_pool_usable(case)
    path.write_text(original)  # Restore failed, unapplied synthetic fixture.
    await apply(case)


async def test_nontransactional_index_path_remains_supported(case):
    await apply(case)
    path=case.directory/"migrations"/"035_nontransactional_probe.sql"
    path.write_text("CREATE INDEX CONCURRENTLY IF NOT EXISTS prefix_a_idx ON prefix_a(id);")
    await apply(case)
    assert "035_nontransactional_probe" in await ledger(case)
    assert await case.conn.fetchval("SELECT indisvalid FROM pg_index WHERE indexrelid='prefix_a_idx'::regclass")
    await assert_clean_and_pool_usable(case)


async def test_database_scoped_lock_does_not_block_other_database(case):
    holder=await asyncpg.connect(DSN)
    await holder.execute("SELECT pg_advisory_lock($1::bigint)",db.MIGRATION_LOCK_KEY)
    try: await apply(case)
    finally: await holder.close()
    await assert_clean_and_pool_usable(case)


async def test_readiness_still_rejects_schema_drift_after_lock_success(case):
    await apply(case)
    await case.conn.execute("ALTER TABLE profiles DROP COLUMN email")
    result=await finish(await launch(case))
    assert result["status"]=="error" and result["error_type"]=="DatabaseNotReadyError",result
    await assert_clean_and_pool_usable(case)


async def test_connection_loss_during_executing_sql_is_fatal_and_cleans_up(case):
    path=case.directory/"migrations"/"001_contract.sql"
    original=path.read_text()
    path.write_text(original+"\nSELECT pg_sleep(60);")
    async def migrate_task():
        mconn = await asyncpg.connect(case.dsn, server_settings={"application_name": "prepvista-migrations"})
        try:
            await db._run_migrations(mconn)
        finally:
            await mconn.close()
    task=asyncio.create_task(migrate_task())
    try:
        async def executing():
            return await case.conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
                  AND application_name='prepvista-migrations' AND wait_event='PgSleep')
            """)
        await wait_for(executing)
        backend=await case.conn.fetchval("""
            SELECT pid FROM pg_stat_activity WHERE datname=current_database()
              AND application_name='prepvista-migrations'
        """)
        assert await case.conn.fetchval("SELECT pg_terminate_backend($1)",backend)
        with pytest.raises(db.MigrationStartupError):
            await asyncio.wait_for(task,5)
        assert db._pool is None
        assert await case.conn.fetchval("SELECT to_regclass('profiles')") is None
        assert await case.conn.fetchval("SELECT count(*) FROM schema_migrations")==0
        await assert_clean_and_pool_usable(case)
        path.write_text(original)
        await apply(case)
    finally:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)


async def test_nontransactional_success_then_process_death_replays_safely(case):
    await apply(case)
    path=case.directory/"migrations"/"035_nontransactional_probe.sql"
    path.write_text("CREATE INDEX CONCURRENTLY IF NOT EXISTS prefix_a_idx ON prefix_a(id);")
    proc=await launch(case,"during")
    await parked(proc)
    assert await case.conn.fetchval("SELECT to_regclass('prefix_a_idx')") is not None
    assert "035_nontransactional_probe" not in await ledger(case)
    proc.kill()
    await proc.wait()
    result=await finish(await launch(case))
    assert result["status"]=="ready",result
    assert "035_nontransactional_probe" in await ledger(case)
    assert await case.conn.fetchval("SELECT indisvalid FROM pg_index WHERE indexrelid='prefix_a_idx'::regclass")
    await assert_clean_and_pool_usable(case)


async def test_pooled_connection_cannot_be_used_for_session_migration_lock(case):
    pool=await asyncpg.create_pool(case.dsn,min_size=1,max_size=1)
    try:
        async with pool.acquire() as conn:
            with pytest.raises(db.MigrationStartupError,match="dedicated"):
                await db._run_migrations(conn)
            assert await conn.fetchval("SELECT 1")==1
        async with pool.acquire() as conn:
            assert await conn.fetchval("SELECT 1")==1
    finally: await pool.close()
    await assert_clean_and_pool_usable(case)


async def test_cancellation_during_pool_creation_cleans_partial_connections(case,monkeypatch):
    create_pool=asyncpg.create_pool
    entered=asyncio.Event()
    initialized=0
    async def init(conn):
        nonlocal initialized
        initialized+=1
        if initialized==2:
            entered.set()
            await asyncio.Event().wait()
    def partial_pool(**kwargs):
        return create_pool(**kwargs,init=init,server_settings={"application_name":"prepvista-pool-cancel-test"})
    case.settings.DB_POOL_MIN_SIZE=2
    monkeypatch.setattr(db.asyncpg,"create_pool",partial_pool)
    task=asyncio.create_task(db.init_db_pool(max_attempts=1))
    await asyncio.wait_for(entered.wait(),10)
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert db._pool is None
    async def gone():
        return await case.conn.fetchval("""
            SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
              AND application_name='prepvista-pool-cancel-test'
        """)==0
    await wait_for(gone)
    monkeypatch.setattr(db.asyncpg,"create_pool",create_pool)
    await apply(case)
    await assert_clean_and_pool_usable(case)
