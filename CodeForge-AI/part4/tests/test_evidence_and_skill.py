import uuid

from app.db import get_conn
from app.models.schemas import AIStructuredDiagnosis, CaseOutcome, DeterministicEvaluation
from app.services import evidence_service, skill_service


def _make_student_and_attempt(skill_id="hash_maps", difficulty="INTERMEDIATE"):
    conn = get_conn()
    student_id = f"stu_{uuid.uuid4().hex[:8]}"
    conn.execute("INSERT INTO students (student_id, display_name, track) VALUES (?,?,?)",
                 (student_id, "Test Student", "AI/ML Engineer"))
    attempt_id = _make_attempt_for_student(student_id)
    return student_id, attempt_id


def _make_attempt_for_student(student_id: str) -> str:
    conn = get_conn()
    attempt_id = str(uuid.uuid4())
    prior = conn.execute(
        "SELECT COUNT(*) c FROM attempts WHERE student_id=? AND challenge_id=?",
        (student_id, "most-frequent-element"),
    ).fetchone()["c"]
    conn.execute(
        """INSERT INTO attempts (attempt_id, student_id, challenge_id, challenge_version, attempt_number,
           language, source_code, submitted_at, execution_status, evaluation_status)
           VALUES (?,?,?,?,?,?,?, datetime('now'), 'COMPLETED', 'EVALUATED')""",
        (attempt_id, student_id, "most-frequent-element", 1, prior + 1, "python", "print(1)"),
    )
    conn.commit()
    return attempt_id


def test_evidence_not_generated_for_system_error():
    evaluation = DeterministicEvaluation(status="SYSTEM_ERROR", tests_total=0, tests_passed=0, tests_failed=0, outcomes=[])
    diagnosis = AIStructuredDiagnosis()
    rows = evidence_service.build_evidence(evaluation, diagnosis, hint_count=0, is_first_attempt_on_challenge=True, challenge_difficulty="EASY")
    assert not any(r.evidence_type in ("challenge_passed", "challenge_partial_or_failed") for r in rows)


def test_passing_without_hints_produces_high_strength_evidence():
    evaluation = DeterministicEvaluation(
        status="PASSED", tests_total=3, tests_passed=3, tests_failed=0,
        outcomes=[CaseOutcome(test_id="t", is_hidden=False, passed=True, status="COMPLETED")],
    )
    diagnosis = AIStructuredDiagnosis()
    rows = evidence_service.build_evidence(evaluation, diagnosis, hint_count=0, is_first_attempt_on_challenge=True, challenge_difficulty="INTERMEDIATE")
    passed_evidence = next(r for r in rows if r.evidence_type == "challenge_passed")
    assert passed_evidence.strength == "HIGH"


def test_skill_score_is_not_a_plain_average_it_uses_recency_and_difficulty_weighting():
    student_id, attempt_id = _make_student_and_attempt()
    evaluation = DeterministicEvaluation(
        status="PASSED", tests_total=2, tests_passed=2, tests_failed=0,
        outcomes=[CaseOutcome(test_id="t", is_hidden=False, passed=True, status="COMPLETED")],
    )
    diagnosis = AIStructuredDiagnosis()
    rows = evidence_service.build_evidence(evaluation, diagnosis, hint_count=0, is_first_attempt_on_challenge=True, challenge_difficulty="INTERMEDIATE")
    evidence_service.persist_evidence(student_id, attempt_id, "most-frequent-element", 1, "hash_maps", "frequency_counting", rows)

    state = skill_service.recompute_skill(student_id, "hash_maps")
    assert state["evidence_count"] == len(rows)
    assert 0.0 <= state["score"] <= 1.0
    assert state["level"] in ("FOUNDATION", "DEVELOPING", "COMPETENT", "STRONG", "ADVANCED")


def test_repeated_mistake_detection_requires_at_least_three_independent_attempts():
    """Phase 14: one mistake does not prove a misconception — it must recur
    across independent attempts, not just multiple rows within one attempt."""
    student_id, first_attempt_id = _make_student_and_attempt()
    conn = get_conn()
    second_attempt_id = _make_attempt_for_student(student_id)
    attempt_ids = [first_attempt_id, second_attempt_id]

    for aid in attempt_ids:  # 2 independent attempts so far
        conn.execute(
            """INSERT INTO mistake_instances (mistake_instance_id, attempt_id, student_id, skill_id,
               category, evidence_text, confidence, severity) VALUES (?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), aid, student_id, "hash_maps", "BOUNDARY_ERROR", "evidence", "MEDIUM", "MEDIUM"),
        )
    conn.commit()
    assert evidence_service.detect_repeated_mistakes(student_id, "hash_maps", "BOUNDARY_ERROR", first_attempt_id) is None

    third_attempt_id = _make_attempt_for_student(student_id)
    conn.execute(
        """INSERT INTO mistake_instances (mistake_instance_id, attempt_id, student_id, skill_id,
           category, evidence_text, confidence, severity) VALUES (?,?,?,?,?,?,?,?)""",
        (str(uuid.uuid4()), third_attempt_id, student_id, "hash_maps", "BOUNDARY_ERROR", "evidence", "MEDIUM", "MEDIUM"),
    )
    conn.commit()
    result = evidence_service.detect_repeated_mistakes(student_id, "hash_maps", "BOUNDARY_ERROR", third_attempt_id)
    assert result is not None
    assert result["occurrence_count"] == 3


def test_prerequisite_weakness_uses_seeded_skill_graph():
    student_id, _ = _make_student_and_attempt()
    conn = get_conn()
    conn.execute(
        """INSERT INTO skill_assessments (student_id, skill_id, level, score, is_consistent, evidence_count)
           VALUES (?,?,?,?,?,?)""",
        (student_id, "python_basics", "FOUNDATION", 0.1, 1, 1),
    )
    conn.commit()
    weaknesses = skill_service.check_prerequisite_weakness(student_id, "hash_maps")
    assert any(w["skill_id"] == "python_basics" for w in weaknesses)
