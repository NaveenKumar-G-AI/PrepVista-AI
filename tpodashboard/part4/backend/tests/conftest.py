"""Shared pytest fixtures.

Tests run against a dedicated test database (`POSTGRES_DB=autoeng_test_db`
by default) and never load a developer's real `.env` file --
`SETTINGS_ENV_FILE=""` is set before any application module is imported,
which disables dotenv loading for every configuration section (see
`app.core.config._resolve_env_file`). Every value a test depends on is set
explicitly via `os.environ` below, so test runs are fully deterministic and
isolated from the local machine's configuration.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

os.environ["SETTINGS_ENV_FILE"] = ""
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("POSTGRES_DB", "autoeng_test_db")
os.environ.setdefault("POSTGRES_USER", "autoeng")
os.environ.setdefault("POSTGRES_PASSWORD", "autoeng_dev_password")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "5432")

from app.core.config import Settings, get_settings  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_caches() -> Generator[None]:
    """Ensure lru_cache'd settings/engine don't leak state between tests."""
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


@pytest_asyncio.fixture
async def client(app) -> AsyncGenerator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession]:
    """A database session scoped to a single outer transaction that is
    always rolled back at teardown, so model/constraint tests can freely
    insert rows without polluting the test database or depending on
    execution order between tests.

    Uses `join_transaction_mode="create_savepoint"` so that when a test
    intentionally triggers a constraint violation (a real `IntegrityError`
    from Postgres), the session's automatic recovery only rolls back to a
    SAVEPOINT rather than unwinding the outer transaction itself. Without
    this, the outer transaction ends up deassociated from the connection
    by the time the fixture tries to roll it back at teardown, which
    SQLAlchemy warns about (harmless, but noisy and worth doing correctly).
    """
    engine = get_engine()
    async with engine.connect() as connection:
        outer_transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        async with session_factory() as session:
            yield session
        await outer_transaction.rollback()
