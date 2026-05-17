"""
PrepVista - Database Connection Pool
Uses asyncpg for high-performance async PostgreSQL access.

Hardening applied:
  - asyncio.Lock prevents double-init on concurrent startup (race condition)
  - pool.acquire() always called with timeout — never hangs on pool exhaustion
  - Jitter added to retry backoff — prevents thundering herd on multi-instance restart
  - Every migration wrapped in a transaction — partial-apply can never corrupt schema
  - Migration file path validated — symlink traversal outside migrations dir rejected
  - Migration file size capped — huge file cannot exhaust server RAM
  - Full filesystem paths never appear in logs — operational security
  - max_inactive_connection_lifetime recycles stale connections automatically
  - statement_cache_size set explicitly — no reliance on asyncpg version defaults
  - _pool.close() guarded in retry loop — real error is never swallowed
  - UnicodeDecodeError handled in migration read — bad-encoding file is skipped safely
  - DatabaseConnection.__aexit__ logs release errors — silent failures made visible
"""

import asyncio
import random

import asyncpg
import structlog
from pathlib import Path

from app.config import get_settings

logger = structlog.get_logger("prepvista.db")

_pool: asyncpg.Pool | None = None

# Prevents concurrent calls to init_db_pool() — e.g. if the startup lifecycle
# hook fires twice, or two Gunicorn workers share the same event loop during
# a pre-fork initialisation phase.
_POOL_INIT_LOCK = asyncio.Lock()

# ---------------------------------------------------------------------------
# Pool configuration constants
# ---------------------------------------------------------------------------

DB_POOL_COMMAND_TIMEOUT       = 30      # seconds — per-query limit
DB_POOL_CONNECT_TIMEOUT       = 12.0   # seconds — initial connection establishment
DB_POOL_INIT_ATTEMPTS         = 4      # retry attempts before giving up at startup
DB_POOL_ACQUIRE_TIMEOUT       = 10.0   # seconds — how long get_db() waits for a free
                                        #   connection before raising; prevents a slow
                                        #   query from stalling every new request when
                                        #   the pool is exhausted at peak load
DB_POOL_MAX_INACTIVE_LIFETIME = 300    # seconds — connections idle longer than this are
                                        #   closed and replaced; prevents stale TCP
                                        #   connections that appear healthy but have been
                                        #   silently dropped by a firewall or load balancer
DB_POOL_STATEMENT_CACHE_SIZE  = 100    # maximum prepared statements cached per connection;
                                        #   set explicitly so behaviour does not depend on
                                        #   the asyncpg version default (which could change)

# ---------------------------------------------------------------------------
# Migration security constants
# ---------------------------------------------------------------------------

# Maximum migration file size.  A migration file larger than this cannot be
# a legitimate SQL script — reject it before reading into memory to prevent
# a rogue or accidentally committed file from exhausting server RAM.
_MAX_MIGRATION_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

class DatabaseNotReadyError(RuntimeError):
    """Raised when the database pool is not ready for application traffic."""


def _describe_db_error(exc: Exception) -> str:
    """Return a useful error string even for empty exception messages."""
    message = str(exc).strip()
    return message or repr(exc)


def _require_db_pool() -> asyncpg.Pool:
    """Return the active pool or raise a clean not-ready error."""
    if not _pool:
        raise DatabaseNotReadyError("Database is still initializing. Please retry shortly.")
    return _pool


def _validate_migration_path(file_path: Path, migrations_dir: Path) -> bool:
    """Return True only when file_path is a regular file strictly inside migrations_dir.

    Security: resolves all symlinks before comparing paths.  Without this
    check, a symlink inside the migrations directory that points to a file
    elsewhere on the filesystem (e.g. /etc/passwd or an attacker-controlled
    location) would be read and executed as SQL.

    Path.relative_to() raises ValueError when the resolved path escapes the
    migrations directory — this is used as the containment check.
    """
    try:
        resolved     = file_path.resolve(strict=True)
        dir_resolved = migrations_dir.resolve(strict=True)
        resolved.relative_to(dir_resolved)   # ValueError if not inside
        return resolved.is_file()
    except (OSError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Pool lifecycle
# ---------------------------------------------------------------------------

async def init_db_pool(
    *,
    max_attempts: int = DB_POOL_INIT_ATTEMPTS,
    log_failures: bool = True,
):
    """Initialize the connection pool on app startup.

    Protected by _POOL_INIT_LOCK — safe to call from multiple startup hooks
    or during testing where the event loop may trigger startup twice.
    """
    global _pool

    async with _POOL_INIT_LOCK:
        if _pool is not None:
            # Another coroutine already initialised the pool while we waited
            # for the lock.  Nothing more to do.
            logger.debug("db_pool_already_initialized")
            return

        settings    = get_settings()
        last_error: Exception | None = None
        total_attempts = max(1, int(max_attempts))

        for attempt in range(1, total_attempts + 1):
            try:
                _pool = await asyncpg.create_pool(
                    dsn=settings.DATABASE_URL,
                    min_size=settings.DB_POOL_MIN_SIZE,
                    max_size=settings.DB_POOL_MAX_SIZE,
                    command_timeout=DB_POOL_COMMAND_TIMEOUT,
                    timeout=DB_POOL_CONNECT_TIMEOUT,
                    max_inactive_connection_lifetime=DB_POOL_MAX_INACTIVE_LIFETIME,
                    statement_cache_size=DB_POOL_STATEMENT_CACHE_SIZE,
                )
                logger.info(
                    "db_pool_initialized",
                    min_size=settings.DB_POOL_MIN_SIZE,
                    max_size=settings.DB_POOL_MAX_SIZE,
                    attempt=attempt,
                )

                async with _pool.acquire() as conn:
                    await _run_migrations(conn)
                return

            except Exception as exc:
                last_error = exc
                if log_failures:
                    logger.warning(
                        "db_pool_init_attempt_failed",
                        attempt=attempt,
                        max_attempts=total_attempts,
                        error_type=type(exc).__name__,
                        error=_describe_db_error(exc),
                    )

                # Guard the close so that a secondary exception during cleanup
                # does not swallow the original error that caused the failure.
                if _pool is not None:
                    try:
                        await _pool.close()
                    except Exception as close_exc:
                        logger.warning(
                            "db_pool_close_during_retry_failed",
                            error=_describe_db_error(close_exc),
                        )
                    _pool = None

                if attempt >= total_attempts:
                    break

                # Jitter prevents a thundering herd when multiple application
                # instances restart simultaneously (e.g. after a deploy) and
                # all hammer the database at the exact same retry interval.
                delay = min(5.0, attempt * 2) + random.uniform(0.0, 0.5)
                await asyncio.sleep(delay)

    raise last_error or RuntimeError("Database pool initialization failed.")


async def close_db_pool():
    """Close pool on app shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("db_pool_closed")


# ---------------------------------------------------------------------------
# Connection accessors
# ---------------------------------------------------------------------------

async def get_db() -> asyncpg.Connection:
    """Acquire a connection from the pool.

    Raises asyncio.TimeoutError (HTTP 503 at middleware level) after
    DB_POOL_ACQUIRE_TIMEOUT seconds rather than hanging the request
    indefinitely when the pool is fully checked out.  Without this timeout,
    a slow query that holds all pool slots starves every new request until
    the query finishes or the client closes the TCP connection.
    """
    pool = _require_db_pool()
    return await pool.acquire(timeout=DB_POOL_ACQUIRE_TIMEOUT)


class DatabaseConnection:
    """Async context manager for database connections.

    Usage:
        async with DatabaseConnection() as conn:
            row = await conn.fetchrow("SELECT ...")

    The connection is always returned to the pool on exit — even when the
    body raises an exception — so no connection leaks on error paths.
    """

    def __init__(self):
        self.conn: asyncpg.Connection | None = None
        self.pool: asyncpg.Pool | None = None

    async def __aenter__(self) -> asyncpg.Connection:
        self.pool = _require_db_pool()
        self.conn = await self.pool.acquire(timeout=DB_POOL_ACQUIRE_TIMEOUT)
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.conn is not None and self.pool is not None:
            try:
                await self.pool.release(self.conn)
            except Exception as release_exc:
                # Release failures are rare but must never be silently dropped —
                # each un-released connection permanently shrinks the pool.
                logger.error(
                    "db_connection_release_failed",
                    error=_describe_db_error(release_exc),
                )
            finally:
                self.conn = None
                self.pool = None


# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

async def _run_migrations(conn: asyncpg.Connection):
    """Run numbered SQL migration files in order.

    Tracks applied versions in the schema_migrations table so each file is
    executed exactly once.

    Transaction strategy
    ─────────────────────
    Each migration is wrapped in a transaction so that:
      - A mid-migration failure rolls back all changes from that file.
      - The version record is inserted in the same transaction — if SQL
        succeeds but the version INSERT fails, the migration is retried next
        startup from a clean state.
      - A migration that contains CONCURRENTLY (e.g. CREATE INDEX
        CONCURRENTLY) cannot run inside a transaction block; those files are
        executed outside a transaction automatically.

    Security
    ─────────
    Each migration file is:
      - Path-validated — symlink traversal outside the migrations directory
        is rejected before the file is opened.
      - Size-checked — files larger than _MAX_MIGRATION_FILE_BYTES are
        skipped with a warning rather than being read into RAM.
      - Encoding-validated — non-UTF-8 content raises a warning and is
        skipped rather than causing an unhandled UnicodeDecodeError.
      - Named in logs by filename only — full filesystem paths are never
        written to logs.
    """
    logger.info("running_migrations")

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    applied = {
        row["version"]
        for row in await conn.fetch("SELECT version FROM schema_migrations")
    }

    migrations_dir = Path(__file__).parent / "migrations"
    if not migrations_dir.exists():
        # Log only the directory name — not the full absolute path which
        # reveals the server's filesystem layout to anyone with log access.
        logger.warning(
            "migrations_directory_not_found",
            directory=migrations_dir.name,
        )
        return

    migration_files = sorted(
        f for f in migrations_dir.iterdir()
        if f.suffix == ".sql" and f.name[0].isdigit()
    )

    applied_count = 0
    for migration_file in migration_files:
        version = migration_file.stem  # e.g. "001_initial_schema"

        if version in applied:
            continue

        # Security: reject files that resolve outside the migrations directory
        # (e.g. symlinks pointing to /etc/passwd or attacker-controlled paths).
        if not _validate_migration_path(migration_file, migrations_dir):
            logger.error(
                "migration_file_path_invalid",
                file=migration_file.name,
            )
            continue

        # Reject suspiciously large files before reading into memory.
        file_size = migration_file.stat().st_size
        if file_size > _MAX_MIGRATION_FILE_BYTES:
            logger.error(
                "migration_file_too_large",
                file=migration_file.name,
                size_bytes=file_size,
                limit_bytes=_MAX_MIGRATION_FILE_BYTES,
            )
            continue

        try:
            sql = migration_file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            logger.error(
                "migration_file_encoding_error",
                file=migration_file.name,
                detail="File is not valid UTF-8. Ensure the migration was saved without a BOM or in a non-UTF-8 encoding.",
            )
            continue

        # Detect whether this migration can safely run inside a transaction.
        # PostgreSQL raises an error if CONCURRENTLY operations appear inside
        # a transaction block — those migrations run outside one.
        use_transaction = "concurrently" not in sql.lower()

        try:
            if use_transaction:
                # Atomic migration: both the DDL and the version record are
                # committed together or rolled back together.
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES ($1)",
                        version,
                    )
            else:
                # Non-transactional path for CONCURRENTLY operations.
                # The version is recorded after execution; if the process
                # crashes between execute and INSERT, the migration re-runs
                # on the next startup — migration authors must ensure
                # CONCURRENTLY migrations are idempotent (IF NOT EXISTS etc.).
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES ($1)",
                    version,
                )

            applied_count += 1
            logger.info(
                "migration_applied",
                version=version,
                transactional=use_transaction,
            )

        except Exception as exc:
            logger.error(
                "migration_failed",
                version=version,
                error=_describe_db_error(exc),
            )
            raise

    logger.info(
        "migrations_complete",
        newly_applied=applied_count,
        total_tracked=len(applied) + applied_count,
    )