"""Connection cleanup under server termination, errors, and cancellation."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import asyncpg
import pytest

from app.database import connection


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["healthy", "closed", "detached"])
@pytest.mark.parametrize("body_error", [None, RuntimeError, asyncio.CancelledError])
async def test_connection_exit_releases_without_discarding_healthy_connection(monkeypatch, state, body_error):
    conn = SimpleNamespace(is_closed=Mock(return_value=state == "closed"), terminate=Mock())
    if state == "detached":
        conn.is_closed.side_effect = asyncpg.InterfaceError("connection has been released back to the pool")
    pool = SimpleNamespace(acquire=AsyncMock(return_value=conn), release=AsyncMock())
    monkeypatch.setattr(connection, "_pool", pool)
    context = connection.DatabaseConnection()

    async def operation():
        async with context as acquired:
            assert acquired is conn
            if body_error:
                raise body_error()

    if body_error:
        with pytest.raises(body_error):
            await operation()
    else:
        await operation()

    pool.release.assert_awaited_once_with(conn)
    assert conn.terminate.call_count == (1 if state == "closed" else 0)
    assert context.conn is None and context.pool is None
