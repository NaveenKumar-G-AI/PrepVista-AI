"""Shared migration serialization; no application configuration or pool access."""
from contextlib import asynccontextmanager

MIGRATION_LOCK_KEY = 73142090


async def transaction_migration_lock(conn):
    """Hold the same migration key for an already-open transaction."""
    if not conn.is_in_transaction():
        raise RuntimeError('An explicit migration transaction is required.')
    if not await conn.fetchval('SELECT pg_try_advisory_xact_lock($1)', MIGRATION_LOCK_KEY):
        raise RuntimeError('Another database migration operation is running.')


@asynccontextmanager
async def migration_lock(conn):
    # Session lock spans migration transactions. Try immediately rather than
    # waiting behind a deployment while occupying another pool connection.
    acquired = await conn.fetchval('SELECT pg_try_advisory_lock($1)', MIGRATION_LOCK_KEY)
    if not acquired:
        raise RuntimeError('Another database migration operation is running.')
    try:
        yield
    finally:
        try:
            await conn.fetchval('SELECT pg_advisory_unlock($1)', MIGRATION_LOCK_KEY)
        except BaseException:
            # A connection with uncertain session-lock state must not return to
            # a pool. Closing its session releases the PostgreSQL lock.
            conn.terminate()
            raise
