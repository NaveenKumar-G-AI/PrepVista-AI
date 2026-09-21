"""
Phase 27 explicitly says: do NOT duplicate the real next-challenge
selection engine here. No such engine exists in this standalone sandbox
(there is no host CodeForge repo to call into), so this module is an
INTEGRATION POINT, not a real recommender: it packages exactly the
signals Phase 27 says the evaluation engine should hand off, and applies
a minimal, clearly-labeled selection rule so the demo flow is real
end-to-end. In a real deployment, `select_next_challenge` is replaced by
a call into the existing challenge-selection engine with this same
handoff payload.
"""
from __future__ import annotations

from app.db import get_conn


def build_handoff_payload(student_id: str, skill_id: str, skill_state: dict,
                           mistakes: list[dict], prereq_weaknesses: list[dict],
                           improved: bool) -> dict:
    return {
        "student_id": student_id,
        "skill_id": skill_id,
        "updated_skill_evidence": skill_state,
        "mistakes": mistakes,
        "confidence": skill_state.get("is_consistent"),
        "current_level": skill_state.get("level"),
        "prerequisite_signals": prereq_weaknesses,
        "improvement_signal": improved,
    }


def select_next_challenge(skill_id: str, current_level: str, prereq_weaknesses: list[dict]) -> dict | None:
    """Minimal, explicitly-labeled placeholder selection rule — NOT the
    real CodeForge next-challenge engine."""
    conn = get_conn()
    target_skill = prereq_weaknesses[0]["skill_id"] if prereq_weaknesses else skill_id
    difficulty_for_level = {
        "FOUNDATION": "EASY", "DEVELOPING": "EASY", "COMPETENT": "INTERMEDIATE",
        "STRONG": "INTERMEDIATE", "ADVANCED": "ADVANCED",
    }.get(current_level, "EASY")

    row = conn.execute(
        """SELECT challenge_id, challenge_version, title, difficulty FROM challenges
           WHERE skill_id = ? AND difficulty = ? ORDER BY challenge_id LIMIT 1""",
        (target_skill, difficulty_for_level),
    ).fetchone()
    if row is None:
        row = conn.execute(
            "SELECT challenge_id, challenge_version, title, difficulty FROM challenges WHERE skill_id = ? LIMIT 1",
            (target_skill,),
        ).fetchone()
    if row is None:
        return None
    return {
        "challenge_id": row["challenge_id"],
        "challenge_version": row["challenge_version"],
        "title": row["title"],
        "difficulty": row["difficulty"],
        "reason": "prerequisite_reinforcement" if prereq_weaknesses else "level_matched",
        "placeholder_engine": True,
    }
