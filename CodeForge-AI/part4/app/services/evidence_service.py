"""
Evidence engine (Phase 17-18). Every meaningful observation produces a
traceable row: who, which attempt, which skill, what was observed, where
it came from, and how strong/confident it is. Nothing here is inferred
silently — strength/confidence are set by explicit rules, documented below,
not by an AI call.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.db import get_conn
from app.models.schemas import AIStructuredDiagnosis, DeterministicEvaluation


@dataclass
class EvidenceRow:
    evidence_type: str
    observation: str
    source: str
    strength: str
    confidence: str


def build_evidence(
    evaluation: DeterministicEvaluation,
    diagnosis: AIStructuredDiagnosis,
    hint_count: int,
    is_first_attempt_on_challenge: bool,
    challenge_difficulty: str,
) -> list[EvidenceRow]:
    rows: list[EvidenceRow] = []

    # --- EXECUTION / TEST_RESULTS ---
    if evaluation.status == "PASSED":
        # Independent, hint-free, first-attempt pass on a harder challenge is
        # the strongest single signal the system produces.
        strength = "HIGH" if hint_count == 0 else "MEDIUM"
        if challenge_difficulty == "ADVANCED" and hint_count == 0:
            strength = "HIGH"
        rows.append(EvidenceRow(
            evidence_type="challenge_passed",
            observation=f"All {evaluation.tests_total} tests passed"
                        + (" without hints." if hint_count == 0 else f" after {hint_count} hint(s)."),
            source="TEST_RESULTS",
            strength=strength,
            confidence="HIGH",  # deterministic fact, not a guess
        ))
    elif evaluation.status == "FAILED":
        rows.append(EvidenceRow(
            evidence_type="challenge_partial_or_failed",
            observation=f"{evaluation.tests_passed}/{evaluation.tests_total} tests passed.",
            source="TEST_RESULTS",
            strength="MEDIUM",
            confidence="HIGH",
        ))
    # SYSTEM_ERROR intentionally produces NO evidence — infrastructure
    # failure must never be treated as a signal about the student.

    # --- CODE_ANALYSIS / COMPLEXITY_ANALYSIS (only as LOW-strength signals) ---
    for mistake in diagnosis.mistakes:
        rows.append(EvidenceRow(
            evidence_type=f"mistake:{mistake.category}",
            observation=mistake.evidence,
            source="CODE_ANALYSIS",
            strength="LOW" if mistake.confidence == "LOW" else "MEDIUM",
            confidence=mistake.confidence,
        ))

    # --- HINT_USAGE ---
    if hint_count > 0:
        rows.append(EvidenceRow(
            evidence_type="hint_usage",
            observation=f"Student used {hint_count} hint(s) before this submission.",
            source="HINT_USAGE",
            strength="LOW",
            confidence="HIGH",
        ))

    # --- CHALLENGE_DIFFICULTY context marker ---
    rows.append(EvidenceRow(
        evidence_type="challenge_context",
        observation=f"Attempt made on a {challenge_difficulty} challenge.",
        source="CHALLENGE_DIFFICULTY",
        strength="LOW",
        confidence="HIGH",
    ))

    return rows


def build_explanation_evidence(explanation_outcome) -> list[EvidenceRow]:
    """Phase 16: if the student's explanation was actually evaluated (not
    just submitted), it becomes its own EXPLANATION-sourced evidence row —
    conceptual understanding evidenced by their own words, separate from
    whether the code happened to pass."""
    if explanation_outcome is None or explanation_outcome.ai_status != "AI_GENERATED":
        return []
    evaluation = explanation_outcome.evaluation
    if evaluation is None:
        return []
    strength = {"HIGH": "MEDIUM", "MEDIUM": "LOW", "LOW": "LOW"}.get(evaluation.conceptual_understanding, "LOW")
    return [EvidenceRow(
        evidence_type="explanation_conceptual_understanding",
        observation=f"Explanation shows {evaluation.conceptual_understanding} conceptual understanding. "
                    f"{evaluation.consistency_with_code}",
        source="EXPLANATION",
        strength=strength,
        confidence="MEDIUM",  # AI-assessed, not a deterministic fact -> capped below HIGH
    )]


def persist_evidence(
    student_id: str, attempt_id: str, challenge_id: str, challenge_version: int,
    skill_id: str, subskill_id: str | None, rows: list[EvidenceRow],
) -> list[str]:
    conn = get_conn()
    ids = []
    for row in rows:
        evidence_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO evidence
               (evidence_id, student_id, attempt_id, challenge_id, challenge_version,
                skill_id, subskill_id, evidence_type, observation, source, strength, confidence)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (evidence_id, student_id, attempt_id, challenge_id, challenge_version,
             skill_id, subskill_id, row.evidence_type, row.observation, row.source,
             row.strength, row.confidence),
        )
        ids.append(evidence_id)
    conn.commit()
    return ids


def detect_repeated_mistakes(student_id: str, skill_id: str, category: str, attempt_id: str) -> dict | None:
    """Phase 14: one mistake is not a misconception. Three+ independent
    attempts with the same category is. Records/updates a row and returns
    it if the threshold is met."""
    conn = get_conn()
    rows = conn.execute(
        """SELECT DISTINCT attempt_id, created_at FROM mistake_instances
           WHERE student_id=? AND skill_id=? AND category=?
           ORDER BY created_at""",
        (student_id, skill_id, category),
    ).fetchall()
    if len(rows) < 3:
        return None

    supporting = [r["attempt_id"] for r in rows]
    confidence = "HIGH" if len(rows) >= 5 else "MEDIUM"
    misconception_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO potential_misconceptions
           (misconception_id, student_id, skill_id, category, occurrence_count,
            confidence, supporting_attempt_ids_json, first_observed_at, last_observed_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(student_id, skill_id, category) DO UPDATE SET
             occurrence_count=excluded.occurrence_count,
             confidence=excluded.confidence,
             supporting_attempt_ids_json=excluded.supporting_attempt_ids_json,
             last_observed_at=excluded.last_observed_at""",
        (misconception_id, student_id, skill_id, category, len(rows), confidence,
         __import__("json").dumps(supporting), rows[0]["created_at"], rows[-1]["created_at"]),
    )
    conn.commit()
    return {"category": category, "occurrence_count": len(rows), "confidence": confidence}
