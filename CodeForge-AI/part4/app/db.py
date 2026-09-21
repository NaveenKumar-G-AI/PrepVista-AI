"""
Database access layer.

Uses SQLite as a stand-in for the host application's real database
(Postgres/Supabase in a real CodeForge deployment). All access goes
through this module so swapping the driver later is a one-file change.
Migrations are plain, ordered .sql files applied idempotently — never
silent schema drift.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("CODEFORGE_DB_PATH", str(BASE_DIR / "codeforge_eval.db"))
MIGRATIONS_DIR = BASE_DIR / "migrations"

_local = threading.local()


def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        # timeout=30 + WAL: with BackgroundTasks now running the analysis
        # pipeline on a separate worker thread from the one that handled
        # the HTTP request, two genuinely different sqlite3.Connection
        # objects (one per OS thread, per this module's threading.local
        # caching) can legitimately want to write around the same moment.
        # isolation_level=None (autocommit): Python's sqlite3 module's
        # legacy default implicitly opens a transaction before any
        # INSERT/UPDATE/DELETE and leaves it open until an explicit
        # commit(). If a write raises (e.g. a constraint violation) before
        # reaching its commit(), that thread's cached connection is left
        # holding a dangling open transaction indefinitely — poisoning
        # every future write that contends with it on the same file, for
        # the life of that thread. Autocommit mode means each statement is
        # its own transaction, so a failed write can never leave one open.
        # This trades cross-statement atomicity within a single Python
        # function (e.g. a loop of INSERTs followed by one commit() now
        # commits row-by-row) for eliminating that whole bug class — an
        # acceptable, documented tradeoff for this reference/demo backend;
        # a real Postgres deployment uses real connection-pooled
        # transactions and does not inherit this constraint.
        conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        _local.conn = conn
    return _local.conn


def run_migrations() -> list[str]:
    conn = get_conn()
    conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"""
    )
    applied = {row[0] for row in conn.execute("SELECT filename FROM schema_migrations")}
    newly_applied = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in applied:
            continue
        sql = path.read_text()
        conn.executescript(sql)
        conn.execute("INSERT INTO schema_migrations (filename) VALUES (?)", (path.name,))
        conn.commit()
        newly_applied.append(path.name)
    return newly_applied


def reset_db_for_tests() -> None:
    """Test-only helper: drops the sqlite file and re-applies migrations."""
    conn = get_conn()
    conn.close()
    if hasattr(_local, "conn"):
        del _local.conn
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    run_migrations()
