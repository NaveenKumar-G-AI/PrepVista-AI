"""Offline startup/readiness tests: no database, network or migrations run."""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import main
from app.database import connection, readiness, migrate


class SchemaConnection:
    def __init__(self):
        self.ledger = []
        self.columns = [
            {"table_name": table, "column_name": name, "column_type": kind}
            for table, groups in readiness.REQUIRED_SCHEMA.items()
            for kind, names in groups.items() for name in names.split()
        ]
        self.queries = []
        self.transaction_readonly = False

    @asynccontextmanager
    async def transaction(self, *, readonly):
        assert readonly is True
        self.transaction_readonly = readonly
        yield

    async def fetch(self, sql, *args):
        assert self.transaction_readonly
        assert sql.lstrip().upper().startswith("SELECT")
        self.queries.append(sql)
        if "FROM schema_migrations" in sql:
            return self.ledger
        if "pg_catalog.pg_attribute" in sql:
            return self.columns
        return []

    @asynccontextmanager
    async def connection(self):
        yield self


from unittest.mock import MagicMock

def test_pool_initialization_executes_migrations(monkeypatch):
    pool = SimpleNamespace(close=AsyncMock(), acquire=MagicMock())
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value="mock_conn")
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    create = AsyncMock(return_value=pool)
    runner = AsyncMock()
    monkeypatch.setattr(connection, "_pool", None)
    monkeypatch.setattr(connection, "_POOL_INIT_LOCK", asyncio.Lock())
    monkeypatch.setattr(connection.asyncpg, "create_pool", create)
    monkeypatch.setattr(connection, "_run_migrations", runner)
    asyncio.run(connection.init_db_pool(max_attempts=1))
    create.assert_awaited_once()
    runner.assert_awaited_once_with("mock_conn")


def test_lifespan_uses_schema_check_and_migrates(monkeypatch):
    conn = SchemaConnection()
    init = AsyncMock()
    runner = AsyncMock()
    monkeypatch.setattr(main, "init_db_pool", init)
    monkeypatch.setattr(main, "close_db_pool", AsyncMock())
    monkeypatch.setattr(main, "DatabaseConnection", conn.connection)
    monkeypatch.setattr(main, "_init_sentry", lambda: None)
    monkeypatch.setattr(main, "refresh_user_activity_stats", AsyncMock())
    monkeypatch.setattr(connection, "_run_migrations", runner)
    from app.services import calibration, report_schedules
    monkeypatch.setattr(calibration, "load_calibrated_parameters", AsyncMock())
    monkeypatch.setattr(report_schedules, "run_report_schedule_loop", AsyncMock())
    monkeypatch.setattr(main, "_run_user_activity_refresh_loop", AsyncMock())
    application = main.create_app()

    async def run():
        async with main.lifespan(application):
            await application.state.runtime_bootstrap_task
            assert application.state.db_ready is True
    asyncio.run(run())
    init.assert_awaited_once()
    assert conn.queries


def test_incompatible_schema_prevents_db_backed_startup_jobs(monkeypatch):
    conn = SchemaConnection()
    conn.columns = []
    monkeypatch.setattr(main, "init_db_pool", AsyncMock())
    monkeypatch.setattr(main, "DatabaseConnection", conn.connection)
    refresh = AsyncMock()
    monkeypatch.setattr(main, "refresh_user_activity_stats", refresh)
    monkeypatch.setattr(main.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    application = main.create_app()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(main._bootstrap_runtime_services(application))
    assert application.state.db_ready is False
    refresh.assert_not_awaited()
    assert not hasattr(application.state, "report_schedule_task")


def test_liveness_is_independent_of_database(monkeypatch):
    unavailable = AsyncMock(side_effect=AssertionError("Liveness cannot touch database"))
    monkeypatch.setattr(main, "check_schema_readiness", unavailable)
    application = main.create_app()
    client = TestClient(application)  # No lifespan: do not initialize real services.
    for path in ("/", "/health", "/health/awake"):
        assert client.get(path).status_code == 200
    assert client.get("/health/ready").status_code == 503
    unavailable.assert_not_awaited()


def test_compatible_schema_readiness_is_read_only(monkeypatch):
    conn = SchemaConnection()
    monkeypatch.setattr(main, "DatabaseConnection", conn.connection)
    application = main.create_app()
    application.state.db_ready = True
    response = TestClient(application).get("/health/ready")
    assert response.status_code == 200 and response.json()["status"] == "ready"
    assert conn.transaction_readonly
    assert all(sql.lstrip().upper().startswith("SELECT") for sql in conn.queries)


@pytest.mark.parametrize("defect", ["missing_column", "wrong_type", "missing_assistance", "read_denied"])
def test_readiness_rejects_incompatible_contract_without_repairs(monkeypatch, defect):
    conn = SchemaConnection()
    if defect == "missing_column":
        conn.columns.pop(0)
    elif defect == "wrong_type":
        conn.columns[0]["column_type"] = "text"
    elif defect == "missing_assistance":
        conn.columns = [row for row in conn.columns if not row["table_name"].startswith("interview_assistance")]
    else:
        original_fetch = conn.fetch
        async def deny_table_read(sql, *args):
            if "WHERE FALSE" in sql:
                raise PermissionError("runtime role cannot read required table")
            return await original_fetch(sql, *args)
        conn.fetch = deny_table_read
    monkeypatch.setattr(main, "DatabaseConnection", conn.connection)
    application = main.create_app()
    application.state.db_ready = True
    response = TestClient(application).get("/health/ready")
    assert response.status_code == 503


def test_explicit_migration_command_requires_execute_flag(monkeypatch):
    monkeypatch.setattr("sys.argv", ["migrate"])
    runner = AsyncMock()
    monkeypatch.setattr(migrate, "run_release_migrations", runner)
    with pytest.raises(SystemExit) as exc:
        migrate.main()
    assert exc.value.code == 2
    runner.assert_not_awaited()


def test_explicit_admin_migration_entrypoint_is_separate_from_runtime(monkeypatch):
    conn = SimpleNamespace(close=AsyncMock())
    runner = AsyncMock()
    monkeypatch.setattr(migrate.asyncpg, "connect", AsyncMock(return_value=conn))
    monkeypatch.setattr(migrate, "_run_migrations", runner)
    asyncio.run(migrate.run_release_migrations())
    runner.assert_awaited_once_with(conn)
    conn.close.assert_awaited_once()
