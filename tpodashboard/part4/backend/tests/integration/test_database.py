"""Database connectivity and migration workflow tests.

These require a reachable PostgreSQL instance (see `POSTGRES_*` env vars in
`tests/conftest.py`). They are integration tests by design -- Part 1's
acceptance criteria explicitly requires proving real database connectivity
and a working migration workflow, not just mocked behavior.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from sqlalchemy import text

from app.db.session import check_database_connection, get_engine

BACKEND_ROOT = Path(__file__).resolve().parents[2]


async def test_database_connection_succeeds(settings) -> None:
    assert await check_database_connection(settings) is True


async def test_session_executes_a_query() -> None:
    engine = get_engine()
    async with engine.connect() as connection:
        result = await connection.execute(text("SELECT 1 AS value"))
        assert result.scalar_one() == 1


def test_alembic_head_migration_is_applied_and_idempotent(settings) -> None:
    """Runs the real `alembic` CLI against the shared test database.

    Deliberately does NOT downgrade here: this database is shared with
    every other integration test in this run, and other tests depend on
    the domain schema being present. `tests/integration/test_migrations.py`
    covers the full upgrade/downgrade/upgrade cycle safely, against its own
    throwaway database, instead of tearing down shared state. This test
    only proves that running `upgrade head` against a database already at
    head is a safe no-op (idempotent), which is what actually happens every
    time the application/CI starts up.
    """
    env = {"POSTGRES_DB": settings.database.name, "PATH": "/usr/bin:/bin:/usr/local/bin"}
    import os

    full_env = {**os.environ, **env}

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=full_env,
        capture_output=True,
        text=True,
    )
    assert upgrade.returncode == 0, upgrade.stderr

    current = subprocess.run(
        [sys.executable, "-m", "alembic", "current"],
        cwd=BACKEND_ROOT,
        env=full_env,
        capture_output=True,
        text=True,
    )
    assert current.returncode == 0, current.stderr
    assert "(head)" in current.stdout
