"""Database engine and session management.

Provides a single async engine per process, an async session factory, and a
FastAPI dependency (`get_db`) that yields a scoped session per request and
guarantees it is closed afterward.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    """Return a cached async SQLAlchemy engine for the current process."""
    settings = get_settings()
    return create_async_engine(
        settings.database.async_url,
        echo=settings.app.debug,
        pool_pre_ping=True,
    )


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return a session factory bound to the process-wide engine."""
    return async_sessionmaker(bind=get_engine(), expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency yielding a database session scoped to one request."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session


async def check_database_connection(settings: Settings | None = None) -> bool:
    """Attempt a lightweight round-trip query to verify connectivity.

    Used by the health endpoint and startup diagnostics. Returns `False`
    instead of raising so callers can decide how to report the failure.
    """
    from sqlalchemy import text

    engine = get_engine()
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - deliberately broad for a health probe
        return False
