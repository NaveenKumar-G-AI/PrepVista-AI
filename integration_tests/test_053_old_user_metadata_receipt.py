"""Exact production archive shape on the guarded disposable real-pg_cron DB."""
import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from fastapi import BackgroundTasks, HTTPException

from recovery_fixture import real_cron_db, apply_sql, MIGRATIONS, ROOT
from app.database import connection, readiness
from app.dependencies import UserProfile
from app.routers import account
from app.services import deletion_worker as worker

pytestmark = pytest.mark.asyncio
VERSION = '053_old_user_metadata_receipt'
ARCHIVE_DDL = """
DROP TABLE public.old_user;
CREATE SEQUENCE public.old_user_id_seq;
CREATE TABLE public.old_user (
    full_name text,
    email text NOT NULL,
    id integer NOT NULL DEFAULT nextval('public.old_user_id_seq'),
    original_user_id uuid,
    user_id uuid,
    archived_at timestamptz DEFAULT now()
);
ALTER SEQUENCE public.old_user_id_seq OWNED BY public.old_user.id;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.old_user TO prepvista_runtime;
"""


@pytest_asyncio.fixture
async def archive_db(real_cron_db, monkeypatch):
    c = real_cron_db
    await c.execute(ARCHIVE_DDL)
    # Complete the other declared contracts in this synthetic fixture; do not
    # change or mock REQUIRED_SCHEMA or readiness's real catalog/ACL queries.
    claim_columns = {'claim_token','lease_expires_at','next_attempt_at'}
    for table, groups in readiness.REQUIRED_SCHEMA.items():
        if table == 'old_user':
            continue
        for kind, names in groups.items():
            for name in names.split():
                if table == 'account_deletion_requests' and name in claim_columns:
                    continue
                exists = await c.fetchval("SELECT EXISTS(SELECT FROM pg_attribute WHERE attrelid=to_regclass($1) AND attname=$2 AND attnum>0 AND NOT attisdropped)", 'public.'+table, name)
                if not exists:
                    # 048a/052 create these tables from their real SQL below.
                    if table in ('admin_bonus_grants','admin_grant_operations'):
                        continue
                    await c.execute(f'ALTER TABLE public.{table} ADD COLUMN {name} {kind}')
    await c.execute("""
        ALTER TABLE auth_identity_links ADD COLUMN auth_user_id uuid,
            ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        ALTER TABLE interview_sessions ADD COLUMN resume_file_path text;
        ALTER TABLE reports ADD COLUMN user_id uuid, ADD COLUMN pdf_file_path text;
        ALTER TABLE support_messages ADD COLUMN user_id uuid, ADD COLUMN attachment_url text;
        CREATE SEQUENCE fixture_deletion_request_seq OWNED BY account_deletion_requests.id;
        ALTER TABLE account_deletion_requests ALTER COLUMN id SET DEFAULT nextval('fixture_deletion_request_seq'),
            ALTER COLUMN retry_count SET DEFAULT 0, ALTER COLUMN created_at SET DEFAULT now(),
            ALTER COLUMN updated_at SET DEFAULT now();
    """)
    await apply_sql(c, '048_account_deletion_claim_leases')
    baseline = {p.stem: connection._compute_migration_checksum(connection._read_migration_sql(p))
                for p in MIGRATIONS.glob('*.sql') if p.stem <= '048_account_deletion_claim_leases'}
    await c.executemany('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', baseline.items())
    assert await connection._run_migrations(c, through='052_admin_grant_contract') == 5
    await c.execute('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO prepvista_runtime')

    @asynccontextmanager
    async def local_connection():
        yield c
    monkeypatch.setattr(account, 'DatabaseConnection', local_connection)
    monkeypatch.setattr(worker, 'DatabaseConnection', local_connection)
    monkeypatch.setattr(account, 'refresh_public_growth_metrics', AsyncMock())
    # No test in this module may call an external provider.
    monkeypatch.setattr(worker, '_auth_delete', AsyncMock(side_effect=AssertionError('Unexpected provider call')))
    monkeypatch.setattr(worker, 'delete_storage_target', AsyncMock(side_effect=AssertionError('Unexpected provider call')))
    yield c


async def archive_columns(c):
    return await c.fetch("""SELECT attname,atttypid::regtype::text AS type,attnotnull,
        pg_get_expr(d.adbin,d.adrelid) AS default_value
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='public.old_user'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""")


async def test_053_exact_production_rows_and_readiness(archive_db):
    c = archive_db
    columns_before = await archive_columns(c)
    assert [r['attname'] for r in columns_before] == ['full_name','email','id','original_user_id','user_id','archived_at']
    await c.execute("INSERT INTO old_user(full_name,email,original_user_id,user_id) VALUES('Legacy','legacy@example.test',$1,$2),(NULL,'legacy@example.test',NULL,NULL)", uuid4(), uuid4())
    projection = 'xmin::text AS row_version,full_name,email,id,original_user_id,user_id,archived_at'
    rows_before = await c.fetch(f'SELECT {projection} FROM old_user ORDER BY id')
    seq_before = await c.fetchrow('SELECT * FROM old_user_id_seq')
    seq_catalog = await c.fetchrow("SELECT * FROM pg_sequence WHERE seqrelid='public.old_user_id_seq'::regclass")
    table_before = await c.fetchrow("SELECT relfilenode,relowner,relacl,relrowsecurity FROM pg_class WHERE oid='public.old_user'::regclass")
    cron_before = await c.fetch('SELECT * FROM cron.job ORDER BY jobid')
    ledger_before = dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    assert await connection._run_migrations(c, through=VERSION) == 1
    assert await connection._run_migrations(c, through=VERSION) == 0
    assert (await archive_columns(c))[:-1] == columns_before
    column = (await archive_columns(c))[-1]
    assert tuple(column) == ('metadata','jsonb',False,None)
    assert await c.fetch(f'SELECT {projection} FROM old_user ORDER BY id') == rows_before
    assert await c.fetchval('SELECT count(*) FROM old_user WHERE metadata IS NULL') == 2
    assert await c.fetchrow('SELECT * FROM old_user_id_seq') == seq_before
    assert await c.fetchrow("SELECT * FROM pg_sequence WHERE seqrelid='public.old_user_id_seq'::regclass") == seq_catalog
    assert await c.fetchval("SELECT pg_get_serial_sequence('public.old_user','id')") == 'public.old_user_id_seq'
    assert await c.fetchrow("SELECT relfilenode,relowner,relacl,relrowsecurity FROM pg_class WHERE oid='public.old_user'::regclass") == table_before
    assert await c.fetch('SELECT * FROM cron.job ORDER BY jobid') == cron_before == []
    assert await c.fetchval('SELECT count(*) FROM cron.job WHERE active') == 0
    ledger = dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    assert len(ledger) == len(ledger_before)+1
    assert all(ledger[k] == v for k,v in ledger_before.items())
    await c.execute('SET ROLE prepvista_runtime')
    try:
        await readiness.check_schema_readiness(c)
    finally:
        await c.execute('RESET ROLE')
    # Readiness must still reject a missing column even with a valid ledger.
    async with c.transaction():
        await c.execute('ALTER TABLE old_user DROP COLUMN metadata')
        with pytest.raises(connection.DatabaseNotReadyError, match='old_user.metadata'):
            await readiness.check_schema_readiness(c)


async def test_053_cli_cutoff_atomic_ledger_failure_and_retry(archive_db):
    c = archive_db
    await c.execute("INSERT INTO old_user(full_name,email) VALUES('Legacy','atomic@example.test')")
    projection = 'xmin::text AS row_version,full_name,email,id,original_user_id,user_id,archived_at'
    before = await c.fetch(f'SELECT {projection} FROM old_user')
    ledger_before = dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    # Fail after 053 DDL, during the runner's ledger insert. Both must roll back.
    await c.execute("""
        CREATE FUNCTION public.reject_053_test_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.version='053_old_user_metadata_receipt' THEN
                IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='public.old_user'::regclass
                    AND attname='metadata' AND NOT attisdropped) THEN
                    RAISE EXCEPTION 'Test expected DDL before ledger insertion';
                END IF;
                RAISE EXCEPTION 'Synthetic 053 ledger insertion failure';
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER reject_053_test_ledger BEFORE INSERT ON schema_migrations
            FOR EACH ROW EXECUTE FUNCTION public.reject_053_test_ledger();
    """)

    async def cli():
        env = dict(os.environ)
        env['MIGRATION_DATABASE_URL'] = 'postgresql://postgres@127.0.0.1:55473/pv_recovery_cron'
        env['DATABASE_URL'] = env['MIGRATION_DATABASE_URL']
        proc = await asyncio.create_subprocess_exec(
            sys.executable, '-m', 'app.database.migrate', '--execute', '--through', VERSION,
            cwd=str(ROOT), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            output, _ = await asyncio.wait_for(proc.communicate(), 45)
            return proc.returncode, output.decode(errors='replace')
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    code, output = await cli()
    assert code != 0 and 'Synthetic 053 ledger insertion failure' in output, output
    assert [r['attname'] for r in await archive_columns(c)] == ['full_name','email','id','original_user_id','user_id','archived_at']
    assert dict(await c.fetch('SELECT version,checksum FROM schema_migrations')) == ledger_before
    assert await c.fetch(f'SELECT {projection} FROM old_user') == before
    await c.execute('DROP TRIGGER reject_053_test_ledger ON schema_migrations; DROP FUNCTION public.reject_053_test_ledger()')
    code, output = await cli()
    assert code == 0, output
    assert tuple((await archive_columns(c))[-1]) == ('metadata','jsonb',False,None)
    assert await c.fetch(f'SELECT {projection} FROM old_user') == before
    assert await c.fetchval('SELECT count(*) FROM old_user WHERE metadata IS NULL') == 1
    ledger = dict(await c.fetch('SELECT version,checksum FROM schema_migrations'))
    expected = connection._compute_migration_checksum(connection._read_migration_sql(MIGRATIONS/(VERSION+'.sql')))
    assert ledger == {**ledger_before, VERSION: expected}
    code, output = await cli()
    assert code == 0, output
    assert dict(await c.fetch('SELECT version,checksum FROM schema_migrations')) == ledger
    assert await c.fetchval('SELECT count(*) FROM cron.job') == 0


async def test_053_existing_jsonb_preserved(archive_db):
    c = archive_db
    await c.execute('ALTER TABLE old_user ADD COLUMN metadata jsonb')
    await c.execute("INSERT INTO old_user(email,metadata) VALUES('existing@example.test','{\"unrelated\":true}'),('legacy@example.test',NULL)")
    before = await c.fetch('SELECT xmin::text AS row_version,* FROM old_user ORDER BY id')
    await apply_sql(c, VERSION)
    await apply_sql(c, VERSION)
    assert await c.fetch('SELECT xmin::text AS row_version,* FROM old_user ORDER BY id') == before


@pytest.mark.parametrize('kind',['text','json','integer'])
async def test_053_wrong_type_fails_closed(archive_db, kind):
    c = archive_db
    await c.execute(f'ALTER TABLE old_user ADD COLUMN metadata {kind}')
    with pytest.raises(connection.MigrationStartupError):
        await connection._run_migrations(c, through=VERSION)
    assert (await archive_columns(c))[-1]['type'] == kind
    assert not await c.fetchval('SELECT EXISTS(SELECT FROM schema_migrations WHERE version=$1)', VERSION)


async def test_053_missing_table_fails_closed(archive_db):
    c = archive_db
    await c.execute('DROP TABLE old_user')
    with pytest.raises(connection.MigrationStartupError):
        await connection._run_migrations(c, through=VERSION)
    assert await c.fetchval("SELECT to_regclass('public.old_user')") is None
    assert not await c.fetchval('SELECT EXISTS(SELECT FROM schema_migrations WHERE version=$1)', VERSION)


async def test_endpoint_new_receipt_and_worker_validation(archive_db):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    await c.execute("INSERT INTO profiles(id,email,full_name) VALUES($1,'new@example.test','New')", owner)
    await c.execute("INSERT INTO old_user(email) VALUES('unrelated-legacy@example.test')")
    background = BackgroundTasks()
    result = await account.delete_account(background, UserProfile(str(owner),'new@example.test','free'))
    assert result['status'] == 'deleted' and len(background.tasks) == 1
    job = dict(await c.fetchrow('SELECT * FROM account_deletion_requests'))
    metadata = json.loads(await c.fetchval('SELECT metadata FROM old_user WHERE user_id=$1',owner))
    receipt = metadata['deletion_requests'][str(job['id'])]
    assert receipt['db_deleted'] is True and receipt['user_id'] == str(owner)
    assert receipt['request_id'] == job['id'] and receipt['version'] == 1
    assert await worker._validated_targets(job) == ([str(owner)], [])
    assert not await c.fetchval('SELECT EXISTS(SELECT FROM profiles WHERE id=$1)',owner)
    assert await c.fetchval("SELECT metadata FROM old_user WHERE email='unrelated-legacy@example.test'") is None
    assert await c.fetchval('SELECT count(*) FROM old_user') == 2


@pytest.mark.parametrize('metadata',[None,'{}','{"deletion_requests":{}}'])
async def test_endpoint_legacy_missing_receipt_requires_review(archive_db, metadata):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    await c.execute("INSERT INTO profiles(id,email) VALUES($1,'legacy@example.test')", owner)
    await c.execute("INSERT INTO old_user(user_id,email,metadata) VALUES($1,'legacy@example.test',$2::jsonb)", owner, metadata)
    before = await c.fetch('SELECT xmin::text AS row_version,* FROM old_user')
    background = BackgroundTasks()
    with pytest.raises(HTTPException) as error:
        await account.delete_account(background, UserProfile(str(owner),'legacy@example.test','free'))
    assert error.value.status_code == 409
    assert await c.fetch('SELECT xmin::text AS row_version,* FROM old_user') == before
    assert await c.fetchval('SELECT count(*) FROM profiles') == 1
    assert await c.fetchval('SELECT count(*) FROM account_deletion_requests') == 0
    assert not background.tasks


@pytest.mark.parametrize('legacy_owner',['null','other'])
async def test_endpoint_shared_email_is_not_archive_identity(archive_db, legacy_owner):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    other = None if legacy_owner == 'null' else uuid4()
    await c.execute("INSERT INTO profiles(id,email,full_name) VALUES($1,'shared@example.test','Current')", owner)
    legacy_id = await c.fetchval("INSERT INTO old_user(user_id,email,full_name) VALUES($1,'shared@example.test','Legacy') RETURNING id", other)
    before = await c.fetchrow('SELECT xmin::text AS row_version,* FROM old_user WHERE id=$1', legacy_id)
    background = BackgroundTasks()
    result = await account.delete_account(background, UserProfile(str(owner),'shared@example.test','free'))
    assert result['status'] == 'deleted' and len(background.tasks) == 1
    assert await c.fetchrow('SELECT xmin::text AS row_version,* FROM old_user WHERE id=$1', legacy_id) == before
    assert await c.fetchval('SELECT count(*) FROM old_user') == 2
    archive = await c.fetchrow('SELECT * FROM old_user WHERE user_id=$1', owner)
    assert archive['id'] != legacy_id
    assert archive['email'] == 'shared@example.test' and archive['full_name'] == 'Current'
    job = dict(await c.fetchrow('SELECT * FROM account_deletion_requests'))
    receipt = json.loads(archive['metadata'])['deletion_requests'][str(job['id'])]
    assert receipt['request_id'] == job['id'] and receipt['user_id'] == str(owner)
    assert receipt['db_deleted'] is True
    assert await worker._validated_targets(job) == ([str(owner)], [])


@pytest.mark.parametrize('archive_email',['current@example.test','previous@example.test'])
async def test_endpoint_same_user_appends_receipt_regardless_of_email(archive_db, archive_email):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    await c.execute("INSERT INTO profiles(id,email,full_name) VALUES($1,'current@example.test','Current')", owner)
    previous = {'version':1,'request_id':9001,'user_id':str(owner),'auth_user_ids':[str(owner)],
                'storage_paths':[],'storage_bindings':[],'db_deleted':True,'completed_operations':[]}
    metadata = {'deletion_requests':{'9001':previous},'unrelated':'preserved'}
    archive_id = await c.fetchval("INSERT INTO old_user(user_id,email,full_name,metadata) VALUES($1,$2,'Original',$3::jsonb) RETURNING id",owner,archive_email,json.dumps(metadata))
    columns = 'full_name,email,id,original_user_id,user_id,archived_at'
    before = await c.fetchrow(f'SELECT {columns} FROM old_user')
    background = BackgroundTasks()
    await account.delete_account(background, UserProfile(str(owner),'current@example.test','free'))
    assert await c.fetchval('SELECT count(*) FROM old_user') == 1
    assert await c.fetchrow(f'SELECT {columns} FROM old_user') == before
    after = json.loads(await c.fetchval('SELECT metadata FROM old_user WHERE id=$1',archive_id))
    job = dict(await c.fetchrow('SELECT * FROM account_deletion_requests'))
    assert set(after['deletion_requests']) == {'9001',str(job['id'])}
    assert after['deletion_requests']['9001'] == previous
    assert after['unrelated'] == 'preserved'
    assert await worker._validated_targets(job) == ([str(owner)], [])


@pytest.mark.parametrize('metadata',[None,'{"deletion_requests":{"9001":{"version":1}}}'])
async def test_endpoint_duplicate_user_archives_require_review(archive_db, metadata):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    await c.execute("INSERT INTO profiles(id,email) VALUES($1,'current@example.test')", owner)
    await c.execute("INSERT INTO old_user(user_id,email,metadata) VALUES($1,'first@example.test',$2::jsonb),($1,'second@example.test',$2::jsonb)",owner,metadata)
    before = await c.fetch('SELECT xmin::text AS row_version,* FROM old_user ORDER BY id')
    background = BackgroundTasks()
    with pytest.raises(HTTPException) as error:
        await account.delete_account(background, UserProfile(str(owner),'current@example.test','free'))
    assert error.value.status_code == 409
    assert await c.fetch('SELECT xmin::text AS row_version,* FROM old_user ORDER BY id') == before
    assert await c.fetchval('SELECT count(*) FROM profiles') == 1
    assert await c.fetchval('SELECT count(*) FROM account_deletion_requests') == 0
    assert not background.tasks


async def test_worker_null_receipt_is_manual_review_without_provider(archive_db):
    c = archive_db
    await connection._run_migrations(c, through=VERSION)
    owner = uuid4()
    await c.execute("INSERT INTO old_user(user_id,email) VALUES($1,'legacy@example.test')", owner)
    rid = await c.fetchval("INSERT INTO account_deletion_requests(user_id,email,auth_user_ids,storage_paths,status) VALUES($1,'legacy@example.test',$2,'[]','AUTH_PENDING') RETURNING id",owner,[str(owner)])
    before = await c.fetch('SELECT xmin::text AS row_version,* FROM old_user')
    assert await worker.process_due_deletions(rid) == 1
    job = await c.fetchrow('SELECT * FROM account_deletion_requests WHERE id=$1',rid)
    assert job['status'] == 'FAILED' and job['last_error'] == 'OWNERSHIP_UNVERIFIED'
    assert job['claim_token'] is None and job['next_attempt_at'] is None
    worker._auth_delete.assert_not_awaited()
    worker.delete_storage_target.assert_not_awaited()
    assert await c.fetch('SELECT xmin::text AS row_version,* FROM old_user') == before
