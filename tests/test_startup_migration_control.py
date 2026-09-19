import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.database import connection
from app.database.migration_control import migration_lock, transaction_migration_lock, MIGRATION_LOCK_KEY
from scripts import apply_unified_schema as schema
from scripts.unified_release_preflight import flag_issues


class FakePool:
    def __init__(self):
        self.closed = False
        self.terminated = False

    def acquire(self): return self
    async def __aenter__(self): return object()
    async def __aexit__(self, *args): pass
    async def close(self): self.closed = True
    def terminate(self): self.terminated = True


def prepare_pool(monkeypatch, enabled):
    pool = FakePool()
    monkeypatch.setattr(connection, '_pool', None)
    monkeypatch.setattr(connection, '_POOL_INIT_LOCK', asyncio.Lock())
    monkeypatch.setattr(connection, 'get_settings', lambda: SimpleNamespace(DATABASE_URL='explicit-unit-fixture',
        DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=2, DATABASE_MIGRATIONS_ON_STARTUP=enabled))
    monkeypatch.setattr(connection.asyncpg, 'create_pool', AsyncMock(return_value=pool))
    return pool


@pytest.mark.parametrize('enabled,override,expected', [(True,None,True),(False,None,False),(True,False,False),(False,True,True)])
def test_startup_switch_and_worker_override_control_migrations(monkeypatch, enabled, override, expected):
    pool = prepare_pool(monkeypatch, enabled)
    async def migrate(conn):
        assert connection._pool is None
        with pytest.raises(connection.DatabaseNotReadyError): connection._require_db_pool()
    operation = AsyncMock(side_effect=migrate)
    monkeypatch.setattr(connection, '_run_migrations', operation)
    asyncio.run(connection.init_db_pool(max_attempts=1, run_migrations=override))
    assert operation.await_count == int(expected)
    assert connection._pool is pool and not pool.closed


@pytest.mark.parametrize('cancel', [False, True])
def test_failed_or_cancelled_initialization_never_exposes_candidate(monkeypatch, cancel):
    pool = prepare_pool(monkeypatch, True)
    error = asyncio.CancelledError() if cancel else RuntimeError('fixture failure')
    monkeypatch.setattr(connection, '_run_migrations', AsyncMock(side_effect=error))
    with pytest.raises(type(error)): asyncio.run(connection.init_db_pool(max_attempts=1, log_failures=False))
    assert connection._pool is None and pool.closed


def test_migration_lock_is_released_on_body_failure_and_busy_lock_does_not_run():
    async def run():
        conn = SimpleNamespace(fetchval=AsyncMock(side_effect=[True, True]), terminate=lambda: None)
        with pytest.raises(ValueError):
            async with migration_lock(conn): raise ValueError('failed fixture')
        assert conn.fetchval.await_args_list[0].args == ('SELECT pg_try_advisory_lock($1)', MIGRATION_LOCK_KEY)
        assert conn.fetchval.await_args_list[1].args == ('SELECT pg_advisory_unlock($1)', MIGRATION_LOCK_KEY)
        conn.fetchval = AsyncMock(return_value=False)
        with pytest.raises(RuntimeError, match='Another database migration'):
            async with migration_lock(conn): raise AssertionError('Busy lock entered')
    asyncio.run(run())


def test_failed_pool_cleanup_terminates_unpublished_connections(monkeypatch):
    pool = prepare_pool(monkeypatch, True)
    monkeypatch.setattr(connection, '_run_migrations', AsyncMock(side_effect=RuntimeError('migration failed')))
    pool.close = AsyncMock(side_effect=RuntimeError('close failed'))
    with pytest.raises(RuntimeError, match='migration failed'):
        asyncio.run(connection.init_db_pool(max_attempts=1, log_failures=False))
    assert pool.terminated and connection._pool is None


def test_uncertain_unlock_terminates_connection():
    terminated = []
    async def run():
        conn = SimpleNamespace(fetchval=AsyncMock(side_effect=[True, RuntimeError('fixture disconnect')]), terminate=lambda: terminated.append(True))
        with pytest.raises(RuntimeError):
            async with migration_lock(conn): pass
    asyncio.run(run())
    assert terminated == [True]


def test_transaction_lock_cannot_be_claimed_in_autocommit():
    conn = SimpleNamespace(is_in_transaction=lambda: False, fetchval=AsyncMock())
    with pytest.raises(RuntimeError, match='explicit migration transaction'):
        asyncio.run(transaction_migration_lock(conn))
    conn.fetchval.assert_not_called()


def test_unified_apply_scope_matches_current_inventory_and_ignores_ambient_dsn(monkeypatch):
    local, sql = schema.local_plan_inputs()
    assert set(sql) == set(schema.VERSIONS) and len(local) == 42
    monkeypatch.delenv('UNIFIED_MIGRATION_DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@production/live')
    with pytest.raises(schema.MigrationPlanError, match='EXPLICIT_MIGRATION_DATABASE_URL_REQUIRED'):
        asyncio.run(schema.run(SimpleNamespace(command='plan', target='staging-test', through_version=schema.VERSIONS[-1])))


def test_rollout_preflight_requires_explicit_startup_opt_out():
    flags = {'CODING_WORKSPACE_ENABLED': True, 'CODING_PILOT_PROFILE_IDS': '11111111-1111-4111-8111-111111111111'}
    assert 'UNIFIED_ROLLOUT_REQUIRES_SEPARATE_MIGRATIONS' in flag_issues(flags)
    assert 'UNIFIED_ROLLOUT_REQUIRES_SEPARATE_MIGRATIONS' in flag_issues({**flags, 'DATABASE_MIGRATIONS_ON_STARTUP': True})
    assert flag_issues({**flags, 'DATABASE_MIGRATIONS_ON_STARTUP': False}) == []
