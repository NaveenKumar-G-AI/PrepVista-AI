"""
Skill profile update engine (Phases 19-23). Deliberately NOT
"score = average of all challenge scores". Score is a weighted composite
over evidence rows, where weight depends on: strength, confidence,
difficulty of the challenge that produced it, and recency. Older evidence
is down-weighted, never deleted (Phase 21).
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from app.db import get_conn

_STRENGTH_WEIGHT = {"LOW": 0.3, "MEDIUM": 0.6, "HIGH": 1.0}
_CONFIDENCE_WEIGHT = {"LOW": 0.4, "MEDIUM": 0.7, "HIGH": 1.0}
_DIFFICULTY_WEIGHT = {"EASY": 0.6, "INTERMEDIATE": 1.0, "ADVANCED": 1.4}

_LEVEL_THRESHOLDS = [
    (0.80, "ADVANCED"),
    (0.60, "STRONG"),
    (0.40, "COMPETENT"),
    (0.20, "DEVELOPING"),
    (0.0, "FOUNDATION"),
]


def _recency_weight(created_at_iso: str, now: datetime) -> float:
    try:
        ts = datetime.fromisoformat(created_at_iso.replace(" ", "T")).replace(tzinfo=timezone.utc)
    except ValueError:
        return 0.5
    age_days = max((now - ts).total_seconds() / 86400.0, 0.0)
    # Half-life of ~30 days: recent evidence matters more, but nothing is discarded.
    return math.pow(0.5, age_days / 30.0)


def _level_from_score(score: float) -> str:
    for threshold, level in _LEVEL_THRESHOLDS:
        if score >= threshold:
            return level
    return "FOUNDATION"


def _is_positive_evidence(evidence_type: str, source: str) -> bool:
    return evidence_type in ("challenge_passed",) or (
        source == "TEST_RESULTS" and "passed" in evidence_type
    )


def recompute_skill(student_id: str, skill_id: str) -> dict:
    conn = get_conn()
    rows = conn.execute(
        """SELECT e.*, a.challenge_id, a.challenge_version, c.difficulty
           FROM evidence e
           JOIN attempts a ON a.attempt_id = e.attempt_id
           JOIN challenges c ON c.challenge_id = a.challenge_id AND c.challenge_version = a.challenge_version
           WHERE e.student_id = ? AND e.skill_id = ?""",
        (student_id, skill_id),
    ).fetchall()

    if not rows:
        return {"skill_id": skill_id, "level": "FOUNDATION", "score": 0.0, "is_consistent": True, "evidence_count": 0}

    now = datetime.now(timezone.utc)
    weighted_sum = 0.0
    weight_total = 0.0
    positive_scores: list[float] = []
    negative_scores: list[float] = []

    for row in rows:
        w = (
            _STRENGTH_WEIGHT.get(row["strength"], 0.3)
            * _CONFIDENCE_WEIGHT.get(row["confidence"], 0.4)
            * _DIFFICULTY_WEIGHT.get(row["difficulty"], 1.0)
            * _recency_weight(row["created_at"], now)
        )
        is_positive = _is_positive_evidence(row["evidence_type"], row["source"])
        value = 1.0 if is_positive else 0.0
        weighted_sum += value * w
        weight_total += w
        (positive_scores if is_positive else negative_scores).append(w)

    score = (weighted_sum / weight_total) if weight_total > 0 else 0.0

    # Contradictory-evidence detection (Phase 22): meaningful positive and
    # negative weight both present, and score sits in an ambiguous middle
    # band -> flag rather than pretend certainty.
    is_consistent = True
    if positive_scores and negative_scores and 0.35 <= score <= 0.65:
        is_consistent = False

    level = _level_from_score(score)

    conn.execute(
        """INSERT INTO skill_assessments (student_id, skill_id, level, score, is_consistent, evidence_count, updated_at)
           VALUES (?,?,?,?,?,?, datetime('now'))
           ON CONFLICT(student_id, skill_id) DO UPDATE SET
             level=excluded.level, score=excluded.score, is_consistent=excluded.is_consistent,
             evidence_count=excluded.evidence_count, updated_at=excluded.updated_at""",
        (student_id, skill_id, level, score, int(is_consistent), len(rows)),
    )
    conn.commit()

    return {
        "skill_id": skill_id, "level": level, "score": round(score, 4),
        "is_consistent": is_consistent, "evidence_count": len(rows),
    }


def record_skill_history(student_id: str, skill_id: str, level: str, score: float, attempt_id: str) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO skill_history (history_id, student_id, skill_id, level, score, triggering_attempt_id)
           VALUES (?,?,?,?,?,?)""",
        (str(uuid.uuid4()), student_id, skill_id, level, score, attempt_id),
    )
    conn.commit()


def check_prerequisite_weakness(student_id: str, skill_id: str) -> list[dict]:
    """Phase 23: if this skill is weak, look at its declared prerequisites
    (from skill_prerequisites, owned by the existing CodeForge skill graph
    in a real deployment) and surface which ones are also weak, instead of
    blaming the advanced skill in isolation."""
    conn = get_conn()
    prereqs = conn.execute(
        "SELECT requires_skill_id FROM skill_prerequisites WHERE skill_id = ?", (skill_id,)
    ).fetchall()
    weak_prereqs = []
    for p in prereqs:
        req_id = p["requires_skill_id"]
        assessment = conn.execute(
            "SELECT level, score FROM skill_assessments WHERE student_id=? AND skill_id=?",
            (student_id, req_id),
        ).fetchone()
        if assessment and assessment["level"] in ("FOUNDATION", "DEVELOPING"):
            weak_prereqs.append({"skill_id": req_id, "level": assessment["level"], "score": assessment["score"]})
    return weak_prereqs
