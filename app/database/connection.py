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
  - Migration SQL executes with an extended per-statement timeout
    (MIGRATION_STATEMENT_TIMEOUT), decoupled from the request-serving pool's
    command_timeout — a large multi-table migration can no longer be aborted
    mid-statement by a 30s limit sized for API queries
  - schema_migrations tracks a content checksum per applied migration — if a
    migration file is edited in place after being applied, startup logs a
    warning instead of silently leaving the database on the old schema forever
  - A separate analytics connection pool (init_analytics_pool / get_analytics_db
    / AnalyticsConnection) isolates long-running cohort-aggregation queries from
    the request-serving pool — a slow nightly snapshot job can never starve B2C
    session traffic
"""

import asyncio
import hashlib
import random

import asyncpg
import structlog
from pathlib import Path

from app.config import get_settings

logger = structlog.get_logger("prepvista.db")

_pool: asyncpg.Pool | None = None
_analytics_pool: asyncpg.Pool | None = None

# Prevents concurrent calls to init_db_pool() — e.g. if the startup lifecycle
# hook fires twice, or two Gunicorn workers share the same event loop during
# a pre-fork initialisation phase.
_POOL_INIT_LOCK = asyncio.Lock()

# Mirrors _POOL_INIT_LOCK for the analytics pool — prevents double-init if
# init_analytics_pool() is ever called both from init_db_pool() and directly
# by an analytics-only worker process during the same startup window.
_ANALYTICS_POOL_INIT_LOCK = asyncio.Lock()

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
# Analytics pool configuration constants
# ---------------------------------------------------------------------------
# A separate, small pool for long-running cohort / org-cohort aggregation
# queries (cohort_snapshots, org_cohort_snapshots, compute_score_slope() across
# an entire institution — see 001_initial_schema.sql and
# 017_college_organization.sql). Isolated from the request-serving pool above
# so a slow nightly snapshot job can never exhaust DB_POOL_MAX_SIZE and starve
# B2C session traffic (process_answer, finish_session, etc.).

DB_ANALYTICS_POOL_COMMAND_TIMEOUT = 300.0  # seconds — cohort-wide aggregation queries
                                            #   scan thousands of skill_scores /
                                            #   interview_sessions rows per institution;
                                            #   30s (the request-serving default) is far
                                            #   too tight for these queries.
DB_ANALYTICS_POOL_ACQUIRE_TIMEOUT = 60.0   # seconds — analytics jobs are not latency-
                                            #   sensitive; allow more time to wait for a
                                            #   free connection than DB_POOL_ACQUIRE_TIMEOUT
                                            #   (10s), which is sized for user-facing requests.

# ---------------------------------------------------------------------------
# Migration security constants
# ---------------------------------------------------------------------------

# Maximum migration file size.  A migration file larger than this cannot be
# a legitimate SQL script — reject it before reading into memory to prevent
# a rogue or accidentally committed file from exhausting server RAM.
_MAX_MIGRATION_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

# ---------------------------------------------------------------------------
# Migration execution constants
# ---------------------------------------------------------------------------

MIGRATION_STATEMENT_TIMEOUT = 600.0  # seconds — ceiling for executing a single
                                      #   migration file's SQL via conn.execute().
                                      #   Decoupled from DB_POOL_COMMAND_TIMEOUT
                                      #   (30s): a migration containing many
                                      #   CREATE TABLE / INDEX / FUNCTION / POLICY
                                      #   statements against production-scale
                                      #   tables can legitimately take minutes
                                      #   (e.g. a non-concurrent CREATE INDEX on a
                                      #   multi-million-row table), and must not
                                      #   be aborted by a timeout sized for
                                      #   request-serving queries.


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

class DatabaseNotReadyError(RuntimeError):
    """Raised when the database pool is not ready for application traffic."""


class AnalyticsDatabaseNotReadyError(DatabaseNotReadyError):
    """Raised when the analytics connection pool is not ready.

    Subclasses DatabaseNotReadyError so any existing `except
    DatabaseNotReadyError` handler continues to catch this without
    modification. Callers that need to distinguish — e.g. the cohort/org-cohort
    snapshot job, which should skip this run and retry on the next schedule
    rather than crash — can catch this subclass specifically.
    """


def _describe_db_error(exc: Exception) -> str:
    """Return a useful error string even for empty exception messages."""
    message = str(exc).strip()
    return message or repr(exc)


def _require_db_pool() -> asyncpg.Pool:
    """Return the active pool or raise a clean not-ready error."""
    if not _pool:
        raise DatabaseNotReadyError("Database is still initializing. Please retry shortly.")
    return _pool


def _require_analytics_pool() -> asyncpg.Pool:
    """Return the active analytics pool or raise a clean not-ready error.

    Unlike _require_db_pool(), this pool is best-effort: it may legitimately
    never become ready (e.g. missing DB_ANALYTICS_POOL_* settings — see
    init_analytics_pool()). Callers should treat this as a signal to skip the
    current analytics run, not as a fatal application error.
    """
    if not _analytics_pool:
        raise AnalyticsDatabaseNotReadyError(
            "Analytics database pool is not initialized. "
            "Cohort/org-cohort aggregation queries are unavailable."
        )
    return _analytics_pool


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


def _compute_migration_checksum(sql: str) -> str:
    """Return a SHA-256 hex digest of a migration file's content.

    Used by _run_migrations() to detect when an already-applied migration
    file's content has changed on disk since it was recorded in
    schema_migrations — e.g. a migration was edited in place under its
    original filename instead of being added as a new numbered file.
    """
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


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

    On success, also bootstraps the analytics pool via init_analytics_pool().
    That call is best-effort and never raises — analytics availability must
    never block or fail B2C application startup. If it fails, get_analytics_db()
    / AnalyticsConnection will raise AnalyticsDatabaseNotReadyError until a
    later successful initialization.
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

                # Best-effort: never raises, never blocks B2C startup on failure.
                await init_analytics_pool()
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


async def init_analytics_pool(
    *,
    max_attempts: int = DB_POOL_INIT_ATTEMPTS,
    log_failures: bool = True,
) -> None:
    """Initialize the analytics connection pool.

    Backs get_analytics_db() / AnalyticsConnection, used for long-running
    cohort / org-cohort aggregation queries (cohort_snapshots,
    org_cohort_snapshots, compute_score_slope() across an institution).

    Unlike init_db_pool(), failures here are logged and swallowed — analytics
    availability must NEVER block B2C application startup or be treated as a
    fatal error. If every attempt fails (including, commonly, because
    settings.DB_ANALYTICS_POOL_MIN_SIZE / MAX_SIZE do not yet exist on the
    Settings model — see Phase 4 downstream changes), this function logs
    analytics_pool_init_failed_non_fatal and returns normally. Callers needing
    analytics later get a clean AnalyticsDatabaseNotReadyError from
    get_analytics_db() / AnalyticsConnection, and may call this function again
    to retry.

    Protected by _ANALYTICS_POOL_INIT_LOCK — safe to call from multiple
    startup paths (e.g. both init_db_pool() and a dedicated analytics worker).
    """
    global _analytics_pool

    async with _ANALYTICS_POOL_INIT_LOCK:
        if _analytics_pool is not None:
            logger.debug("analytics_pool_already_initialized")
            return

        settings    = get_settings()
        last_error: Exception | None = None
        total_attempts = max(1, int(max_attempts))

        for attempt in range(1, total_attempts + 1):
            try:
                _analytics_pool = await asyncpg.create_pool(
                    dsn=settings.DATABASE_URL,
                    min_size=settings.DB_ANALYTICS_POOL_MIN_SIZE,
                    max_size=settings.DB_ANALYTICS_POOL_MAX_SIZE,
                    command_timeout=DB_ANALYTICS_POOL_COMMAND_TIMEOUT,
                    timeout=DB_POOL_CONNECT_TIMEOUT,
                    max_inactive_connection_lifetime=DB_POOL_MAX_INACTIVE_LIFETIME,
                    statement_cache_size=DB_POOL_STATEMENT_CACHE_SIZE,
                )
                logger.info(
                    "analytics_pool_initialized",
                    min_size=settings.DB_ANALYTICS_POOL_MIN_SIZE,
                    max_size=settings.DB_ANALYTICS_POOL_MAX_SIZE,
                    attempt=attempt,
                )
                return

            except Exception as exc:
                last_error = exc
                if log_failures:
                    logger.warning(
                        "analytics_pool_init_attempt_failed",
                        attempt=attempt,
                        max_attempts=total_attempts,
                        error_type=type(exc).__name__,
                        error=_describe_db_error(exc),
                    )

                if _analytics_pool is not None:
                    try:
                        await _analytics_pool.close()
                    except Exception as close_exc:
                        logger.warning(
                            "analytics_pool_close_during_retry_failed",
                            error=_describe_db_error(close_exc),
                        )
                    _analytics_pool = None

                if attempt >= total_attempts:
                    break

                delay = min(5.0, attempt * 2) + random.uniform(0.0, 0.5)
                await asyncio.sleep(delay)

    # All attempts exhausted. Unlike init_db_pool(), do NOT raise — analytics
    # is non-fatal. _require_analytics_pool() will surface
    # AnalyticsDatabaseNotReadyError to callers that try to use it.
    logger.error(
        "analytics_pool_init_failed_non_fatal",
        error=_describe_db_error(last_error) if last_error else None,
    )


async def close_db_pool():
    """Close the main pool on app shutdown, then the analytics pool.

    The analytics pool close is additive: a single call to close_db_pool()
    now cleans up both pools. Each is closed independently and guarded so a
    failure closing one never prevents — or is masked by — cleanup of the
    other.
    """
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("db_pool_closed")

    try:
        await close_analytics_pool()
    except Exception as exc:
        logger.warning(
            "analytics_pool_close_failed",
            error=_describe_db_error(exc),
        )


async def close_analytics_pool():
    """Close the analytics pool on app shutdown, if it was initialized."""
    global _analytics_pool
    if _analytics_pool:
        await _analytics_pool.close()
        _analytics_pool = None
        logger.info("analytics_pool_closed")


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


async def get_analytics_db() -> asyncpg.Connection:
    """Acquire a connection from the analytics pool.

    For long-running cohort / org-cohort aggregation queries — e.g. computing
    avg_communication..avg_role_fit and avg_slope across every active student
    in an institution for cohort_snapshots / org_cohort_snapshots, or calling
    compute_score_slope() / compute_cohort_percentile() per student. Backed by
    a separate pool from get_db() so a slow aggregation run can never exhaust
    the connection pool that serves latency-sensitive B2C requests
    (process_answer, finish_session, etc.).

    Raises AnalyticsDatabaseNotReadyError (a DatabaseNotReadyError subclass) if
    the analytics pool failed to initialize. Callers such as the cohort/org-
    cohort snapshot job should catch this, log, and retry on the next
    scheduled run rather than crash the worker process.
    """
    pool = _require_analytics_pool()
    return await pool.acquire(timeout=DB_ANALYTICS_POOL_ACQUIRE_TIMEOUT)


class AnalyticsConnection:
    """Async context manager for analytics-pool database connections.

    Mirrors DatabaseConnection but acquires from the analytics pool, which has
    a much longer command_timeout (DB_ANALYTICS_POOL_COMMAND_TIMEOUT) suited to
    cohort-wide aggregation queries, and a longer acquire timeout
    (DB_ANALYTICS_POOL_ACQUIRE_TIMEOUT) since these jobs are not latency-
    sensitive.

    Usage:
        async with AnalyticsConnection() as conn:
            rows = await conn.fetch(
                "SELECT category, AVG(average_score) "
                "FROM skill_scores WHERE user_id = ANY($1) GROUP BY category",
                student_ids,
            )

    The connection is always returned to the analytics pool on exit — even
    when the body raises — so no connection leaks on error paths.
    """

    def __init__(self):
        self.conn: asyncpg.Connection | None = None
        self.pool: asyncpg.Pool | None = None

    async def __aenter__(self) -> asyncpg.Connection:
        self.pool = _require_analytics_pool()
        self.conn = await self.pool.acquire(timeout=DB_ANALYTICS_POOL_ACQUIRE_TIMEOUT)
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.conn is not None and self.pool is not None:
            try:
                await self.pool.release(self.conn)
            except Exception as release_exc:
                logger.error(
                    "analytics_connection_release_failed",
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
      - The migration SQL itself executes with timeout=MIGRATION_STATEMENT_TIMEOUT
        (10 minutes), decoupled from the connection's pool-level
        command_timeout (30s, sized for request-serving queries). A migration
        with many CREATE TABLE / INDEX / FUNCTION / POLICY statements against
        production-scale tables can legitimately take minutes; the small
        bookkeeping queries (schema_migrations CREATE/ALTER/SELECT/INSERT)
        keep the connection's default timeout.

    Drift detection
    ───────────────
    schema_migrations.checksum stores a SHA-256 of each migration file's
    content at apply time (NULL for rows written before this column existed).
    For every migration file found — applied or not — the current file's
    checksum is computed:
      - Already applied, stored checksum is NULL → backfill the current
        checksum as the baseline and log migration_baseline_recorded (info).
        This does NOT verify the live schema matches this content — only that
        drift from this point forward will be detected.
      - Already applied, stored checksum differs from current → log
        migration_content_changed_since_apply (warning), every startup. The
        migration is NOT re-executed (CREATE POLICY and similar statements are
        not idempotent) — this is a signal to create a new incremental
        migration file, not to edit this one further.
      - Not yet applied → execute normally and record (version, checksum).

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

    For files that are ALREADY applied, path/size/encoding problems are
    skipped silently (no new error logs) — these checks exist to protect
    NEW migrations from being applied incorrectly; an already-applied file
    that has become unreadable does not need re-validating on every startup.
    """
    logger.info("running_migrations")

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # Self-managed column: SHA-256 of each migration file's content at apply
    # time. NULL for rows written before this feature existed — see "Drift
    # detection" above for how NULL is handled.
    await conn.execute("""
        ALTER TABLE schema_migrations
            ADD COLUMN IF NOT EXISTS checksum TEXT
    """)

    applied_checksums: dict[str, str | None] = {
        row["version"]: row["checksum"]
        for row in await conn.fetch("SELECT version, checksum FROM schema_migrations")
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
        already_applied = version in applied_checksums

        # Security: reject files that resolve outside the migrations directory
        # (e.g. symlinks pointing to /etc/passwd or attacker-controlled paths).
        if not _validate_migration_path(migration_file, migrations_dir):
            if not already_applied:
                logger.error(
                    "migration_file_path_invalid",
                    file=migration_file.name,
                )
            continue

        # Reject suspiciously large files before reading into memory.
        file_size = migration_file.stat().st_size
        if file_size > _MAX_MIGRATION_FILE_BYTES:
            if not already_applied:
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
            if not already_applied:
                logger.error(
                    "migration_file_encoding_error",
                    file=migration_file.name,
                    detail="File is not valid UTF-8. Ensure the migration was saved without a BOM or in a non-UTF-8 encoding.",
                )
            continue

        current_checksum = _compute_migration_checksum(sql)

        if already_applied:
            stored_checksum = applied_checksums[version]

            if stored_checksum is None:
                # No baseline recorded — either this row predates the checksum
                # column, or this is the first startup after deploying this
                # feature. Record the file's CURRENT content as the baseline so
                # future edits to this file can be detected.
                await conn.execute(
                    "UPDATE schema_migrations SET checksum = $1 WHERE version = $2",
                    current_checksum,
                    version,
                )
                logger.info(
                    "migration_baseline_recorded",
                    version=version,
                    detail=(
                        "No prior checksum existed for this already-applied "
                        "migration. If this file was edited after being "
                        "applied, the database schema may not reflect its "
                        "current content — verify and create an incremental "
                        "migration if needed."
                    ),
                )
            elif stored_checksum != current_checksum:
                # The file on disk no longer matches what was applied. Common
                # cause: a migration was rewritten in place under its original
                # filename instead of as a new numbered file. This migration is
                # NOT re-executed — CREATE POLICY and similar statements are
                # not idempotent, so re-running could fail or duplicate state.
                logger.warning(
                    "migration_content_changed_since_apply",
                    version=version,
                    detail=(
                        "This migration's file content has changed since it "
                        "was applied. The database schema reflects the OLD "
                        "content. Create a new incremental migration file to "
                        "apply the changes — do not rename or re-run this file."
                    ),
                )
            # else: checksum matches — no drift, nothing to log.

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
                    await conn.execute(sql, timeout=MIGRATION_STATEMENT_TIMEOUT)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
                        version,
                        current_checksum,
                    )
            else:
                # Non-transactional path for CONCURRENTLY operations.
                # The version is recorded after execution; if the process
                # crashes between execute and INSERT, the migration re-runs
                # on the next startup — migration authors must ensure
                # CONCURRENTLY migrations are idempotent (IF NOT EXISTS etc.).
                await conn.execute(sql, timeout=MIGRATION_STATEMENT_TIMEOUT)
                await conn.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
                    version,
                    current_checksum,
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
        total_tracked=len(applied_checksums) + applied_count,
    )