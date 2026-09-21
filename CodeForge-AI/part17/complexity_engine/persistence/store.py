"""
complexity_engine.persistence.store
======================================
A real, working persistence layer backed by SQLite — genuinely
testable end-to-end without standing up Postgres. The schema mirrors
schema_postgres.sql (same three tables the master spec names:
complexity_assessments, complexity_findings, complexity_history) so
swapping the driver for asyncpg/psycopg2 against a real Supabase
Postgres instance is a connection-layer change, not a redesign.

IDEMPOTENCY: save_assessment() is keyed on source_hash (see report.py's
source_identity()). Calling it twice for the same immutable submission
returns the existing row instead of creating a duplicate.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..report import ComplexityReport

SCHEMA = """
CREATE TABLE IF NOT EXISTS complexity_assessments (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    problem_id TEXT,
    language TEXT NOT NULL,
    function_name TEXT NOT NULL,
    source_hash TEXT NOT NULL UNIQUE,
    analysis_version TEXT NOT NULL,
    time_complexity TEXT NOT NULL,
    space_complexity TEXT NOT NULL,
    best_case TEXT,
    dominant_cost TEXT NOT NULL,
    confidence TEXT NOT NULL,
    constraint_risk TEXT,
    is_recursive INTEGER NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complexity_findings (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES complexity_assessments(id),
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    confidence TEXT NOT NULL,
    line INTEGER,
    col INTEGER,
    function_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_assessment ON complexity_findings(assessment_id);

CREATE TABLE IF NOT EXISTS complexity_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    assessment_id TEXT NOT NULL REFERENCES complexity_assessments(id),
    time_complexity_rank REAL NOT NULL,
    time_complexity_notation TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_user_problem ON complexity_history(user_id, problem_id, attempt_number);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rank_of(time_dict: Dict[str, Any]) -> float:
    """A simple, explainable ordering proxy for 'did complexity get
    worse or better' across attempts — not a rigorous total order
    (none exists across incomparable multi-variable terms), just a
    reasonable regression signal."""
    if time_dict.get("has_unknown_component") and not time_dict.get("terms"):
        return -1.0
    best = 0.0
    for t in time_dict.get("terms", []):
        if t.get("exp_base"):
            best = max(best, 1000.0 + float(t["exp_base"]))
            continue
        powers = t.get("powers") or {}
        logs = t.get("log_powers") or {}
        rank = sum(powers.values()) + 0.1 * sum(logs.values())
        best = max(best, rank)
    return best


@dataclass(frozen=True)
class StoredAssessment:
    id: str
    submission_id: str
    source_hash: str
    time_complexity: str
    space_complexity: str
    dominant_cost: str
    confidence: str
    report_json: Dict[str, Any]
    created_at: str
    was_cached: bool


class Store:
    def __init__(self, path: str = ":memory:"):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def save_assessment(self, report: ComplexityReport, submission_id: str, user_id: str,
                         problem_id: Optional[str] = None) -> StoredAssessment:
        existing = self.conn.execute(
            "SELECT * FROM complexity_assessments WHERE source_hash = ?", (report.source_hash,)
        ).fetchone()
        if existing:
            return StoredAssessment(
                id=existing["id"], submission_id=existing["submission_id"], source_hash=existing["source_hash"],
                time_complexity=existing["time_complexity"], space_complexity=existing["space_complexity"],
                dominant_cost=existing["dominant_cost"], confidence=existing["confidence"],
                report_json=json.loads(existing["report_json"]), created_at=existing["created_at"], was_cached=True,
            )

        assessment_id = str(uuid.uuid4())
        created_at = _now()
        report_dict = report.to_dict()
        self.conn.execute(
            "INSERT INTO complexity_assessments "
            "(id, submission_id, user_id, problem_id, language, function_name, source_hash, analysis_version, "
            " time_complexity, space_complexity, best_case, dominant_cost, confidence, constraint_risk, "
            " is_recursive, report_json, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (assessment_id, submission_id, user_id, problem_id, report.language, report.function_name,
             report.source_hash, report.analysis_version,
             report.time_complexity.render(), report.space_complexity.render(),
             report.best_case.render() if report.best_case else None,
             report.dominant_cost, report.confidence.value,
             report.constraint_assessment.risk.value if report.constraint_assessment else None,
             1 if report.recursive else 0, json.dumps(report_dict), created_at),
        )
        for f in report.findings:
            self.conn.execute(
                "INSERT INTO complexity_findings (id, assessment_id, kind, description, confidence, line, col, function_name) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), assessment_id, f.kind.value, f.description, f.confidence.value,
                 f.line, f.col, f.function),
            )

        if problem_id:
            prior_count = self.conn.execute(
                "SELECT COUNT(*) c FROM complexity_history WHERE user_id=? AND problem_id=?",
                (user_id, problem_id),
            ).fetchone()["c"]
            self.conn.execute(
                "INSERT INTO complexity_history "
                "(id, user_id, problem_id, assessment_id, time_complexity_rank, time_complexity_notation, "
                " attempt_number, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), user_id, problem_id, assessment_id, _rank_of(report_dict["time_complexity"]),
                 report.time_complexity.render(), prior_count + 1, created_at),
            )
        self.conn.commit()
        return StoredAssessment(
            id=assessment_id, submission_id=submission_id, source_hash=report.source_hash,
            time_complexity=report.time_complexity.render(), space_complexity=report.space_complexity.render(),
            dominant_cost=report.dominant_cost, confidence=report.confidence.value,
            report_json=report_dict, created_at=created_at, was_cached=False,
        )

    def get_assessment(self, assessment_id: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute("SELECT * FROM complexity_assessments WHERE id=?", (assessment_id,)).fetchone()
        return dict(row) if row else None

    def get_by_source_hash(self, source_hash: str) -> Optional[Dict[str, Any]]:
        row = self.conn.execute("SELECT * FROM complexity_assessments WHERE source_hash=?", (source_hash,)).fetchone()
        return dict(row) if row else None

    def get_findings(self, assessment_id: str) -> List[Dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM complexity_findings WHERE assessment_id=?", (assessment_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_history(self, user_id: str, problem_id: str) -> List[Dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM complexity_history WHERE user_id=? AND problem_id=? ORDER BY attempt_number",
            (user_id, problem_id),
        ).fetchall()
        return [dict(r) for r in rows]

    def detect_regression(self, user_id: str, problem_id: str) -> Optional[str]:
        """Compares the two most recent attempts for this user+problem.
        Returns 'regression', 'improvement', 'unchanged', or None if
        there's fewer than two attempts or either rank is unknown."""
        history = self.get_history(user_id, problem_id)
        if len(history) < 2:
            return None
        prev, curr = history[-2], history[-1]
        if prev["time_complexity_rank"] < 0 or curr["time_complexity_rank"] < 0:
            return None
        if curr["time_complexity_rank"] > prev["time_complexity_rank"]:
            return "regression"
        if curr["time_complexity_rank"] < prev["time_complexity_rank"]:
            return "improvement"
        return "unchanged"
