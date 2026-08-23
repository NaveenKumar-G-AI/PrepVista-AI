"""
Part 5 — Persistence.

IMPORTANT: two kinds of tables live in this schema, and they are NOT
the same kind of thing.

  1. UPSTREAM STUB tables (students, drives, applications, source_rounds,
     institutions) — these represent data that Parts 1/3/4 actually own
     in the real PrepVista system. They exist here ONLY so this module
     can run standalone and be demoed/tested without the rest of
     PrepVista present. In a real merge, every read against these
     becomes a foreign key into — or a service call against — the real
     Part 1/3/4 tables/services. Part 5 must never become their source
     of truth. Nothing outside seed_demo.py should ever INSERT into
     these tables.

  2. PART-5-OWNED tables (interviews, interview_results, round_executions,
     interview_issues, audit_log, event_log) — this module is the
     source of truth for these, per the ownership boundary in section 6
     of the spec.
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "prepvista_part5.db"

SCHEMA_SQL = """
-- ============================================================
-- UPSTREAM STUBS — NOT owned by Part 5. Demo/test scaffolding only.
-- ============================================================
CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    register_no TEXT NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    batch TEXT NOT NULL DEFAULT '',
    UNIQUE(institution_id, register_no)
);

-- Represents the EXISTING PrepVista AI readiness system (section 5/50) —
-- mock-interview performance, skills, coaching history. Part 5 does not
-- compute this and must not merge it into real interview outcomes; it is
-- read-only reference context for the readiness-vs-outcome comparison in
-- analytics.py, exactly as section 46 describes.
CREATE TABLE IF NOT EXISTS readiness_scores_stub (
    student_id TEXT PRIMARY KEY,
    readiness_score REAL NOT NULL,
    mock_interview_score REAL
);

CREATE TABLE IF NOT EXISTS drives (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    role_title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_rounds (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SHORTLISTED'
);

-- ============================================================
-- PART 5 — OWNED. Source of truth lives here.
-- ============================================================
CREATE TABLE IF NOT EXISTS round_executions (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL,
    source_round_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    planned_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    drive_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    round_execution_id TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,          -- ISO-8601, UTC. Display layer converts to institution/student local time.
    timezone TEXT NOT NULL DEFAULT 'UTC',-- authoritative tz the scheduled_at was captured in, for audit/display
    duration_minutes INTEGER NOT NULL,
    mode TEXT NOT NULL,                  -- ONLINE | ON_CAMPUS | PHONE | EXTERNAL
    location TEXT,
    meeting_reference TEXT,              -- only exposed to the authorized student; see security.py
    instructions TEXT,
    interview_status TEXT NOT NULL,
    attendance_status TEXT NOT NULL DEFAULT 'NOT_RECORDED',
    student_confirmed INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,  -- optimistic concurrency token
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interviews_drive ON interviews(drive_id);
CREATE INDEX IF NOT EXISTS idx_interviews_student ON interviews(student_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(interview_status);
CREATE INDEX IF NOT EXISTS idx_interviews_institution ON interviews(institution_id);

CREATE TABLE IF NOT EXISTS interview_results (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    result TEXT NOT NULL,
    remarks TEXT,
    result_source TEXT NOT NULL,
    publication_state TEXT NOT NULL,
    entered_by TEXT NOT NULL,
    entered_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    published_at TEXT,
    version INTEGER NOT NULL,             -- 1, 2, 3... every correction is a new row, never an UPDATE
    supersedes_version INTEGER,           -- null for v1
    correction_reason TEXT,
    is_current INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_results_interview ON interview_results(interview_id, is_current);

CREATE TABLE IF NOT EXISTS interview_issues (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reported_at TEXT NOT NULL,
    resolved_by TEXT,
    resolved_at TEXT,
    resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS reschedule_requests (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | ACCEPTED | DECLINED
    requested_at TEXT NOT NULL,
    decided_by TEXT,
    decided_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    metadata TEXT,
    at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    at TEXT NOT NULL
);
"""


def init_db(path: Path = DB_PATH, fresh: bool = False):
    if fresh and path.exists():
        path.unlink()
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    return conn


@contextmanager
def get_conn(path: Path = DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
