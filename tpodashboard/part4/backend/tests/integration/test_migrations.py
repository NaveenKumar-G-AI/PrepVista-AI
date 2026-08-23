"""Migration workflow tests against a genuinely fresh database.

Part 1's `test_database.py` already exercises `alembic upgrade`/`downgrade`
against the persistent test database. This module goes further, per Part
3's requirement to prove the workflow against an empty database rather
than relying on one that already happens to exist: it creates a
throwaway PostgreSQL database, runs the full migration cycle against it,
inspects the resulting schema directly, and drops the database again.

This test is exactly what caught a real bug during development: an
`upgrade -> downgrade -> upgrade` cycle used to fail because `downgrade()`
dropped tables but left their native PostgreSQL ENUM types behind, so the
second `upgrade()` failed with "type already exists". The fix (explicit
`DROP TYPE` statements at the end of `downgrade()`) is verified here.
"""

from __future__ import annotations

import subprocess
import sys
import uuid
from pathlib import Path

import psycopg2
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parents[2]

EXPECTED_TABLES = {
    "agent_runs",
    "alembic_version",
    "evaluations",
    "git_checkpoints",
    "organization_memberships",
    "organizations",
    "project_events",
    "projects",
    "repair_attempts",
    "repositories",
    "task_dependencies",
    "tasks",
    "test_runs",
    "tool_executions",
    "users",
}

EXPECTED_ENUM_TYPES = {
    "agent_run_status",
    "evaluation_status",
    "event_severity",
    "git_checkpoint_status",
    "organization_role",
    "organization_status",
    "project_status",
    "repair_attempt_status",
    "repository_provider",
    "repository_status",
    "task_priority",
    "task_status",
    "task_type",
    "test_run_status",
    "tool_execution_status",
    "user_status",
}


def _run_alembic(command: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *command.split()],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.mark.slow
async def test_full_migration_cycle_against_a_fresh_database(settings) -> None:
    import os

    admin_dsn = (
        f"dbname=postgres user={settings.database.user} "
        f"password={settings.database.password.get_secret_value()} "
        f"host={settings.database.host} port={settings.database.port}"
    )
    fresh_db_name = f"autoeng_migration_test_{uuid.uuid4().hex[:10]}"

    admin_conn = psycopg2.connect(admin_dsn)
    admin_conn.autocommit = True
    try:
        with admin_conn.cursor() as cur:
            cur.execute(f'CREATE DATABASE "{fresh_db_name}" OWNER {settings.database.user}')

        env = {**os.environ, "POSTGRES_DB": fresh_db_name}

        try:
            # 1. empty database -> alembic upgrade head
            upgraded = _run_alembic("upgrade head", env)
            assert upgraded.returncode == 0, upgraded.stderr

            fresh_engine = create_async_engine(
                settings.database.async_url.replace(
                    f"/{settings.database.name}", f"/{fresh_db_name}"
                )
            )
            async with fresh_engine.connect() as conn:
                tables = {
                    row[0]
                    for row in (
                        await conn.execute(
                            text(
                                "SELECT table_name FROM information_schema.tables "
                                "WHERE table_schema = 'public'"
                            )
                        )
                    ).all()
                }
                enum_types = {
                    row[0]
                    for row in (
                        await conn.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'"))
                    ).all()
                }
                # application can connect and query through the ORM engine
                await conn.execute(text("SELECT 1"))
            await fresh_engine.dispose()

            assert tables >= EXPECTED_TABLES, f"missing tables: {EXPECTED_TABLES - tables}"
            assert enum_types >= EXPECTED_ENUM_TYPES, (
                f"missing enum types: {EXPECTED_ENUM_TYPES - enum_types}"
            )

            # 2. downgrade to base must fully reverse the migration,
            #    including the native enum types (the bug this test caught)
            downgraded = _run_alembic("downgrade base", env)
            assert downgraded.returncode == 0, downgraded.stderr

            with admin_conn.cursor() as cur:
                cur.execute("SELECT typname FROM pg_type WHERE typtype = 'e'")
                remaining_enums = {row[0] for row in cur.fetchall()}
            assert not (EXPECTED_ENUM_TYPES & remaining_enums), (
                f"orphaned enum types after downgrade: {EXPECTED_ENUM_TYPES & remaining_enums}"
            )

            # 3. upgrading again from a clean base must succeed -- this is
            #    exactly the step that failed before the downgrade() fix
            re_upgraded = _run_alembic("upgrade head", env)
            assert re_upgraded.returncode == 0, re_upgraded.stderr
        finally:
            with admin_conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = %s AND pid <> pg_backend_pid()",
                    (fresh_db_name,),
                )
                cur.execute(f'DROP DATABASE IF EXISTS "{fresh_db_name}"')
    finally:
        admin_conn.close()
