from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException

from app.auth import issue_dev_token, require_ownership, require_staff_role, verify_token
from app.db import get_conn, run_migrations
from app.models.schemas import DevTokenRequest, SubmitAttemptRequest
from app.rate_limit import enforce_submission_rate_limit
from app.seed import load_seed_data
from app.services import (
    diagnosis_service,
    evaluation_service,
    evidence_service,
    explanation_service,
    feedback_service,
    next_challenge_service,
    reporting_service,
    skill_service,
)
from app.services.ai.provider_factory import get_configured_provider
from app.services.complexity_service import estimate_python_complexity, refine_with_ai
from app.services.static_analysis_service import analyze_python


@asynccontextmanager
async def lifespan(_app: FastAPI):
    applied = run_migrations()
    load_seed_data()
    _audit("service_started", None, None, {"migrations_applied": applied})
    yield


app = FastAPI(title="CodeForge Evaluation Engine", version="0.2.0", lifespan=lifespan)


def _audit(event_type: str, student_id: str | None, attempt_id: str | None, payload: dict) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO audit_events (event_id, event_type, student_id, attempt_id, payload_json) VALUES (?,?,?,?,?)",
        (str(uuid.uuid4()), event_type, student_id, attempt_id, json.dumps(payload, default=str)[:4000]),
    )
    conn.commit()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/dev/token")
def dev_token(req: DevTokenRequest):
    """DEV-ONLY convenience endpoint: mints a signed token for any
    subject_id/role with no password, no identity check, nothing. This
    exists only because this sandbox has no real login system for a demo
    frontend to call. A real deployment DELETES this route entirely —
    real tokens come from the host's actual auth flow (Supabase, etc.),
    never from an unauthenticated 'give me a token for whoever I claim to
    be' endpoint. Left in specifically to make that boundary visible and
    easy to grep for and remove, rather than silently baking dev
    convenience into something that looks like real auth."""
    return {"token": issue_dev_token(req.subject_id, req.role), "subject_id": req.subject_id, "role": req.role}


@app.get("/challenges")
def list_challenges():
    conn = get_conn()
    # Plain alphabetical ORDER BY difficulty would put "ADVANCED" before
    # "EASY" (A < E) — confirmed by an actual frontend-driver run that
    # showed the hardest seed challenge loading as the default. Rank by
    # an explicit difficulty order instead so the natural default is the
    # easiest challenge, not whichever name sorts first.
    rows = conn.execute(
        """SELECT challenge_id, challenge_version, title, skill_id, difficulty, language, is_seed
           FROM challenges
           ORDER BY CASE difficulty WHEN 'EASY' THEN 0 WHEN 'INTERMEDIATE' THEN 1 WHEN 'ADVANCED' THEN 2 ELSE 3 END,
                    challenge_id"""
    ).fetchall()
    return {"challenges": [dict(r) for r in rows]}


@app.get("/challenges/{challenge_id}")
def get_challenge(challenge_id: str, challenge_version: int = 1):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM challenges WHERE challenge_id=? AND challenge_version=?",
        (challenge_id, challenge_version),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Challenge not found")
    public_tests = conn.execute(
        "SELECT test_id, input_data, expected_output, ordinal FROM challenge_tests "
        "WHERE challenge_id=? AND challenge_version=? AND is_hidden=0 ORDER BY ordinal",
        (challenge_id, challenge_version),
    ).fetchall()
    return {
        "challenge_id": row["challenge_id"],
        "challenge_version": row["challenge_version"],
        "title": row["title"],
        "skill_id": row["skill_id"],
        "subskill_id": row["subskill_id"],
        "difficulty": row["difficulty"],
        "language": row["language"],
        "description": row["description"],
        "starter_code": row["starter_code"],
        "prompts_explanation": row["prompts_explanation"],
        "public_tests": [dict(t) for t in public_tests],
        "is_seed": bool(row["is_seed"]),
        # hidden tests, expected solutions: intentionally NEVER returned by this endpoint
    }


def _redact_hidden(evaluation) -> dict:
    d = evaluation.model_dump()
    for o in d["outcomes"]:
        if o["is_hidden"]:
            o["expected_result"] = None
            o["actual_result"] = None
    return d


@app.post("/attempts")
def submit_attempt(
    req: SubmitAttemptRequest,
    background_tasks: BackgroundTasks,
    student_id: str = Depends(enforce_submission_rate_limit),
):
    conn = get_conn()

    # In a real deployment the student row already exists (created via the
    # host's own signup/auth flow) by the time anyone can submit code. This
    # sandbox's dev-token auth can mint a token for any string, so we lazily
    # provision a minimal row here — otherwise a legitimately-authenticated
    # but not-yet-seeded student would hit a FOREIGN KEY crash on their very
    # first submission, which is a real bug, not acceptable "fail closed"
    # behavior (Phase 33 wants an explicit, non-crashing failure state, and
    # a brand-new student is not a failure at all).
    conn.execute(
        "INSERT OR IGNORE INTO students (student_id, display_name, track) VALUES (?, ?, ?)",
        (student_id, student_id, "unspecified"),
    )

    # ---- Idempotency (Phase 42): same client_request_id -> return existing attempt ----
    existing = conn.execute(
        "SELECT attempt_id FROM attempts WHERE student_id=? AND challenge_id=? AND client_request_id=?",
        (student_id, req.challenge_id, req.client_request_id),
    ).fetchone()
    if existing:
        return _assemble_attempt_response(existing["attempt_id"], student_id)

    challenge = conn.execute(
        "SELECT * FROM challenges WHERE challenge_id=? AND challenge_version=?",
        (req.challenge_id, req.challenge_version),
    ).fetchone()
    if not challenge:
        raise HTTPException(404, "Challenge not found")

    tests_rows = conn.execute(
        "SELECT * FROM challenge_tests WHERE challenge_id=? AND challenge_version=? ORDER BY ordinal",
        (req.challenge_id, req.challenge_version),
    ).fetchall()
    tests = [
        evaluation_service.EvalTestCase(t["test_id"], bool(t["is_hidden"]), t["input_data"], t["expected_output"])
        for t in tests_rows
    ]

    # ---- Phase 3: immutable attempt record ----
    attempt_id = str(uuid.uuid4())
    prior_count = conn.execute(
        "SELECT COUNT(*) c FROM attempts WHERE student_id=? AND challenge_id=? AND challenge_version=?",
        (student_id, req.challenge_id, req.challenge_version),
    ).fetchone()["c"]
    attempt_number = prior_count + 1

    conn.execute(
        """INSERT INTO attempts
           (attempt_id, student_id, challenge_id, challenge_version, attempt_number, language,
            source_code, explanation_text, hint_count, hint_level, client_request_id,
            submitted_at, execution_status, evaluation_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now'), 'RUNNING', 'PENDING')""",
        (attempt_id, student_id, req.challenge_id, req.challenge_version, attempt_number, req.language,
         req.source_code, req.explanation_text, req.hint_count, req.hint_level, req.client_request_id),
    )
    conn.commit()
    _audit("submission_created", student_id, attempt_id, {"challenge_id": req.challenge_id, "attempt_number": attempt_number})

    # ---- Phase 4-5: real execution + deterministic evaluation (synchronous — this is the
    #      "Immediate deterministic execution" half of Phase 35) ----
    _audit("execution_started", student_id, attempt_id, {})
    evaluation, _last_run = evaluation_service.evaluate_attempt(req.source_code, req.language, tests)

    exec_status_map = {"PASSED": "COMPLETED", "FAILED": "COMPLETED", "SYSTEM_ERROR": "SYSTEM_ERROR"}
    exec_status = exec_status_map.get(evaluation.status, "SYSTEM_ERROR")
    if evaluation.outcomes and evaluation.outcomes[0].status == "COMPILATION_ERROR":
        exec_status = "COMPILATION_ERROR"

    for o in evaluation.outcomes:
        conn.execute(
            """INSERT INTO execution_results
               (execution_id, attempt_id, test_id, status, actual_output, exit_code, runtime_ms, memory_kb, passed)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), attempt_id, o.test_id, o.status, o.actual_result, None,
             o.runtime_ms, o.memory_kb, int(o.passed)),
        )
        if not o.passed and o.failure_category:
            conn.execute(
                """INSERT INTO test_failure_analysis
                   (failure_id, attempt_id, test_id, expected_result, actual_result, category)
                   VALUES (?,?,?,?,?,?)""",
                (str(uuid.uuid4()), attempt_id, o.test_id,
                 None if o.is_hidden else o.expected_result,  # never persist/expose hidden expected values downstream
                 o.actual_result, o.failure_category),
            )
    conn.execute(
        """INSERT INTO evaluation_results
           (evaluation_id, attempt_id, status, tests_total, tests_passed, tests_failed, runtime_ms_max)
           VALUES (?,?,?,?,?,?,?)""",
        (str(uuid.uuid4()), attempt_id, evaluation.status, evaluation.tests_total,
         evaluation.tests_passed, evaluation.tests_failed, evaluation.runtime_ms_max),
    )
    conn.execute(
        "UPDATE attempts SET execution_status=?, evaluation_status=? WHERE attempt_id=?",
        (exec_status, "EVALUATED" if evaluation.status != "SYSTEM_ERROR" else "FAILED", attempt_id),
    )
    conn.commit()
    _audit("evaluation_completed", student_id, attempt_id,
           {"status": evaluation.status, "passed": evaluation.tests_passed, "total": evaluation.tests_total})

    if evaluation.status == "SYSTEM_ERROR":
        # Phase 4 critical rule: infrastructure failure must never be scored
        # against the student. Stop here — no analysis, no evidence, no skill update.
        return {"attempt_id": attempt_id, "attempt_number": attempt_number,
                "execution_status": "SYSTEM_ERROR", "evaluation_status": "FAILED",
                "analysis_status": "NOT_APPLICABLE",
                "message": "Execution infrastructure failed. This attempt was not scored against you; please retry."}

    # ---- Phase 35: everything past this point (analysis, diagnosis, evidence,
    #      skill update, feedback) runs as a BACKGROUND task. In a real ASGI
    #      deployment (uvicorn), the HTTP response below is flushed to the
    #      client BEFORE this task runs — the request does not block on AI
    #      calls. Poll GET /attempts/{attempt_id} for completion. ----
    conn.execute("UPDATE attempts SET analysis_status='PENDING' WHERE attempt_id=?", (attempt_id,))
    conn.commit()
    background_tasks.add_task(_run_background_analysis, attempt_id, student_id, req, dict(challenge), evaluation)

    return {
        "attempt_id": attempt_id,
        "attempt_number": attempt_number,
        "execution_status": exec_status,
        "evaluation_status": "EVALUATED",
        "analysis_status": "PENDING",
        "evaluation": _redact_hidden(evaluation),
        "message": "Deterministic evaluation complete. Diagnosis, evidence, skill update, and feedback are "
                    "processing in the background — poll GET /attempts/{attempt_id} for the full result.",
    }


def _run_background_analysis(attempt_id: str, student_id: str, req: SubmitAttemptRequest,
                              challenge: dict, evaluation) -> None:
    """Phase 35 background stage. Runs after the HTTP response has already
    been sent in a real deployment. Wrapped in try/except so a failure here
    is recorded (analysis_status='FAILED', an AI_failure audit event) rather
    than silently vanishing or crashing the process."""
    conn = get_conn()
    try:
        attempt = conn.execute("SELECT * FROM attempts WHERE attempt_id=?", (attempt_id,)).fetchone()
        provider = get_configured_provider()
        challenge_meta = {"title": challenge["title"], "skill_id": challenge["skill_id"],
                           "difficulty": challenge["difficulty"], "description": challenge["description"]}

        # ---- Phase 7: code analysis ----
        code_analysis = analyze_python(req.source_code) if req.language == "python" else None
        if code_analysis is not None:
            conn.execute(
                """INSERT INTO code_analysis_results
                   (analysis_id, attempt_id, function_count, max_nesting_depth, cyclomatic_estimate,
                    duplicate_blocks, unused_names_json, loc, patterns_json)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4()), attempt_id, code_analysis.function_count, code_analysis.max_nesting_depth,
                 code_analysis.cyclomatic_estimate, code_analysis.duplicate_blocks,
                 json.dumps(code_analysis.unused_names), code_analysis.loc, json.dumps(code_analysis.patterns)),
            )

        # ---- Phase 8: complexity (static + AI-assisted refinement when recursion makes it unreliable) ----
        complexity = estimate_python_complexity(req.source_code)
        complexity, complexity_ai_status, complexity_ai_reasoning = refine_with_ai(
            provider, complexity, req.source_code, challenge_meta
        )
        conn.execute(
            """INSERT INTO complexity_analysis
               (complexity_id, attempt_id, time_complexity, time_basis, space_complexity, space_basis,
                reasoning, ai_status, ai_reasoning)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), attempt_id, complexity.time_complexity, complexity.time_basis,
             complexity.space_complexity, complexity.space_basis, complexity.reasoning,
             complexity_ai_status, complexity_ai_reasoning),
        )
        conn.commit()

        # ---- Phase 9-13: diagnosis (deterministic mistakes + optional AI inference) ----
        outcome = diagnosis_service.diagnose(provider, challenge_meta, req.source_code, evaluation, code_analysis, complexity)
        _audit("diagnosis_created", student_id, attempt_id, {"ai_status": outcome.ai_status})

        for m in outcome.diagnosis.mistakes:
            conn.execute(
                """INSERT INTO mistake_instances
                   (mistake_instance_id, attempt_id, student_id, skill_id, category, evidence_text, confidence, severity)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4()), attempt_id, student_id, challenge["skill_id"], m.category, m.evidence,
                 m.confidence, m.severity),
            )
        conn.execute(
            """INSERT INTO diagnoses
               (diagnosis_id, attempt_id, observations_json, inferences_json, mistakes_json, strengths_json, confidence, ai_status)
               VALUES (?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), attempt_id, json.dumps(outcome.diagnosis.observations),
             json.dumps(outcome.diagnosis.inferences), json.dumps([m.model_dump() for m in outcome.diagnosis.mistakes]),
             json.dumps(outcome.diagnosis.strengths), outcome.diagnosis.confidence, outcome.ai_status),
        )
        conn.commit()

        # ---- Phase 14: repeated mistake -> potential misconception ----
        for m in outcome.diagnosis.mistakes:
            evidence_service.detect_repeated_mistakes(student_id, challenge["skill_id"], m.category, attempt_id)

        # ---- Phase 15-16: explanation evaluation (its own AI responsibility, optional) ----
        explanation_outcome = explanation_service.evaluate_explanation(
            provider, challenge_meta, req.source_code, req.explanation_text
        )
        conn.execute(
            """INSERT INTO explanation_evaluations
               (evaluation_id, attempt_id, provided, conceptual_understanding, consistency_with_code,
                algorithm_reasoning_notes, ai_status)
               VALUES (?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), attempt_id, int(explanation_outcome.provided),
             explanation_outcome.evaluation.conceptual_understanding if explanation_outcome.evaluation else None,
             explanation_outcome.evaluation.consistency_with_code if explanation_outcome.evaluation else None,
             explanation_outcome.evaluation.algorithm_reasoning_notes if explanation_outcome.evaluation else None,
             explanation_outcome.ai_status),
        )

        # ---- Phase 17-18: evidence engine ----
        is_first_attempt = attempt["attempt_number"] == 1
        evidence_rows = evidence_service.build_evidence(
            evaluation, outcome.diagnosis, req.hint_count, is_first_attempt, challenge["difficulty"]
        )
        evidence_rows += evidence_service.build_explanation_evidence(explanation_outcome)
        evidence_service.persist_evidence(
            student_id, attempt_id, req.challenge_id, req.challenge_version,
            challenge["skill_id"], challenge["subskill_id"], evidence_rows,
        )
        _audit("evidence_created", student_id, attempt_id, {"count": len(evidence_rows)})

        # ---- Phase 19-23: skill profile update ----
        skill_state = skill_service.recompute_skill(student_id, challenge["skill_id"])
        skill_service.record_skill_history(student_id, challenge["skill_id"], skill_state["level"], skill_state["score"], attempt_id)
        _audit("skill_updated", student_id, attempt_id, skill_state)

        # ---- Phase 24-25: feedback, at the level the student requested ----
        feedback, feedback_ai_status = feedback_service.generate_feedback(
            provider, challenge_meta, evaluation, outcome.diagnosis, level=req.feedback_level
        )
        conn.execute(
            """INSERT INTO feedback_reports
               (feedback_id, attempt_id, level, what_went_well, what_failed, why_it_failed, what_to_improve,
                optional_hint, next_step, ai_status)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), attempt_id, req.feedback_level, feedback.what_went_well, feedback.what_failed,
             feedback.why_it_failed, feedback.what_to_improve, feedback.optional_hint, feedback.next_step,
             feedback_ai_status),
        )

        conn.execute("UPDATE attempts SET analysis_status='COMPLETE' WHERE attempt_id=?", (attempt_id,))
        conn.commit()
        _audit("feedback_generated", student_id, attempt_id, {"ai_status": feedback_ai_status})
    except Exception as exc:  # noqa: BLE001 - background task: must never crash silently or hang in PENDING
        conn.execute("UPDATE attempts SET analysis_status='FAILED' WHERE attempt_id=?", (attempt_id,))
        conn.commit()
        _audit("AI_failure", student_id, attempt_id, {"error": str(exc)})


def _assemble_attempt_response(attempt_id: str, requesting_student_id: str) -> dict:
    conn = get_conn()
    attempt = conn.execute("SELECT * FROM attempts WHERE attempt_id=?", (attempt_id,)).fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    require_ownership(attempt["student_id"], requesting_student_id)  # Phase 30: strict ownership
    student_id = attempt["student_id"]

    challenge = conn.execute(
        "SELECT * FROM challenges WHERE challenge_id=? AND challenge_version=?",
        (attempt["challenge_id"], attempt["challenge_version"]),
    ).fetchone()

    evaluation_row = conn.execute("SELECT * FROM evaluation_results WHERE attempt_id=?", (attempt_id,)).fetchone()

    outcome_rows = conn.execute(
        """SELECT er.test_id, er.status, er.passed, er.runtime_ms, er.memory_kb, er.actual_output,
                  ct.is_hidden, tfa.category AS failure_category, tfa.expected_result
           FROM execution_results er
           JOIN challenge_tests ct ON ct.challenge_id=? AND ct.challenge_version=? AND ct.test_id=er.test_id
           LEFT JOIN test_failure_analysis tfa ON tfa.attempt_id=er.attempt_id AND tfa.test_id=er.test_id
           WHERE er.attempt_id=? ORDER BY ct.ordinal""",
        (attempt["challenge_id"], attempt["challenge_version"], attempt_id),
    ).fetchall()
    outcomes = []
    for o in outcome_rows:
        is_hidden = bool(o["is_hidden"])
        outcomes.append({
            "test_id": o["test_id"], "is_hidden": is_hidden, "passed": bool(o["passed"]), "status": o["status"],
            "runtime_ms": o["runtime_ms"], "memory_kb": o["memory_kb"],
            "failure_category": o["failure_category"],
            "expected_result": None if is_hidden else o["expected_result"],
            "actual_result": None if is_hidden else o["actual_output"],
        })

    code_analysis = conn.execute("SELECT * FROM code_analysis_results WHERE attempt_id=?", (attempt_id,)).fetchone()
    complexity = conn.execute("SELECT * FROM complexity_analysis WHERE attempt_id=?", (attempt_id,)).fetchone()
    diagnosis = conn.execute("SELECT * FROM diagnoses WHERE attempt_id=?", (attempt_id,)).fetchone()
    explanation_eval = conn.execute("SELECT * FROM explanation_evaluations WHERE attempt_id=?", (attempt_id,)).fetchone()
    feedback = conn.execute("SELECT * FROM feedback_reports WHERE attempt_id=?", (attempt_id,)).fetchone()
    evidence_count = conn.execute("SELECT COUNT(*) c FROM evidence WHERE attempt_id=?", (attempt_id,)).fetchone()["c"]

    skill_id = challenge["skill_id"] if challenge else None
    skill_row = None
    misconceptions: list[dict] = []
    prereq_weaknesses: list[dict] = []
    if skill_id:
        skill_row = conn.execute(
            "SELECT * FROM skill_assessments WHERE student_id=? AND skill_id=?", (student_id, skill_id)
        ).fetchone()
        if diagnosis:
            categories = {m["category"] for m in json.loads(diagnosis["mistakes_json"])}
            if categories:
                placeholders = ",".join("?" * len(categories))
                misconceptions = [dict(r) for r in conn.execute(
                    f"SELECT * FROM potential_misconceptions WHERE student_id=? AND skill_id=? "
                    f"AND category IN ({placeholders})",
                    (student_id, skill_id, *categories),
                ).fetchall()]
        prereq_weaknesses = skill_service.check_prerequisite_weakness(student_id, skill_id)

    retry_comparison = None
    if attempt["attempt_number"] > 1 and evaluation_row:
        prev = conn.execute(
            """SELECT er.tests_passed, er.tests_total FROM evaluation_results er
               JOIN attempts a ON a.attempt_id = er.attempt_id
               WHERE a.student_id=? AND a.challenge_id=? AND a.challenge_version=? AND a.attempt_number=?""",
            (student_id, attempt["challenge_id"], attempt["challenge_version"], attempt["attempt_number"] - 1),
        ).fetchone()
        if prev:
            retry_comparison = {
                "previous_score": f"{prev['tests_passed']}/{prev['tests_total']}",
                "current_score": f"{evaluation_row['tests_passed']}/{evaluation_row['tests_total']}",
                "improved": evaluation_row["tests_passed"] > prev["tests_passed"],
            }

    next_challenge_handoff = None
    next_challenge_suggestion = None
    if skill_row and evaluation_row and evaluation_row["status"] == "PASSED":
        skill_state_dict = dict(skill_row)
        next_challenge_handoff = next_challenge_service.build_handoff_payload(
            student_id, skill_id, skill_state_dict,
            json.loads(diagnosis["mistakes_json"]) if diagnosis else [],
            prereq_weaknesses, improved=bool(retry_comparison and retry_comparison["improved"]),
        )
        next_challenge_suggestion = next_challenge_service.select_next_challenge(
            skill_id, skill_state_dict["level"], prereq_weaknesses
        )

    return {
        "attempt_id": attempt_id,
        "attempt_number": attempt["attempt_number"],
        "execution_status": attempt["execution_status"],
        "evaluation_status": attempt["evaluation_status"],
        "analysis_status": attempt["analysis_status"],
        "evaluation": {**dict(evaluation_row), "outcomes": outcomes} if evaluation_row else None,
        "code_analysis": dict(code_analysis) if code_analysis else None,
        "complexity_analysis": dict(complexity) if complexity else None,
        "diagnosis": {
            "observations": json.loads(diagnosis["observations_json"]),
            "inferences": json.loads(diagnosis["inferences_json"]),
            "mistakes": json.loads(diagnosis["mistakes_json"]),
            "strengths": json.loads(diagnosis["strengths_json"]),
            "confidence": diagnosis["confidence"],
            "ai_status": diagnosis["ai_status"],
        } if diagnosis else None,
        "explanation_evaluation": dict(explanation_eval) if explanation_eval else None,
        "potential_misconceptions": misconceptions,
        "evidence_recorded": evidence_count,
        "skill_state": dict(skill_row) if skill_row else None,
        "prerequisite_weaknesses": prereq_weaknesses,
        "feedback": dict(feedback) if feedback else None,
        "retry_comparison": retry_comparison,
        "next_challenge_handoff": next_challenge_handoff,
        "next_challenge_suggestion": next_challenge_suggestion,
    }


@app.get("/attempts/{attempt_id}")
def get_attempt_result(attempt_id: str, student_id: str = Depends(verify_token)):
    return _assemble_attempt_response(attempt_id, student_id)


@app.get("/students/{student_id}/skills")
def get_student_skills(student_id: str, authenticated: str = Depends(verify_token)):
    require_ownership(student_id, authenticated)
    conn = get_conn()
    rows = conn.execute("SELECT * FROM skill_assessments WHERE student_id=?", (student_id,)).fetchall()
    return {"skills": [dict(r) for r in rows]}


@app.get("/students/{student_id}/report/{attempt_id}")
def student_report(student_id: str, attempt_id: str, authenticated: str = Depends(verify_token)):
    """Phase 28: polished, student-friendly report assembled from stored,
    real evidence (never regenerated fiction)."""
    require_ownership(student_id, authenticated)
    conn = get_conn()
    attempt = conn.execute("SELECT * FROM attempts WHERE attempt_id=? AND student_id=?", (attempt_id, student_id)).fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    challenge = conn.execute(
        "SELECT * FROM challenges WHERE challenge_id=? AND challenge_version=?",
        (attempt["challenge_id"], attempt["challenge_version"]),
    ).fetchone()
    evaluation = conn.execute("SELECT * FROM evaluation_results WHERE attempt_id=?", (attempt_id,)).fetchone()
    feedback = conn.execute("SELECT * FROM feedback_reports WHERE attempt_id=?", (attempt_id,)).fetchone()
    diagnosis = conn.execute("SELECT * FROM diagnoses WHERE attempt_id=?", (attempt_id,)).fetchone()
    evidence_rows = conn.execute("SELECT * FROM evidence WHERE attempt_id=?", (attempt_id,)).fetchall()

    return {
        "title": "CODING ATTEMPT REVIEW",
        "challenge": challenge["title"] if challenge else attempt["challenge_id"],
        "result": f"{evaluation['tests_passed']}/{evaluation['tests_total']} tests passed" if evaluation else "N/A",
        "analysis_status": attempt["analysis_status"],
        "what_went_well": feedback["what_went_well"] if feedback else None,
        "needs_improvement": feedback["what_to_improve"] if feedback else None,
        "technical_diagnosis": json.loads(diagnosis["observations_json"]) + json.loads(diagnosis["inferences_json"]) if diagnosis else [],
        "evidence": [dict(e) for e in evidence_rows],
        "recommended_next_step": feedback["next_step"] if feedback else None,
    }


# ---- Phase 29: management/aggregate reporting, staff-role only ----
# Deliberately cohort-level (see app/services/reporting_service.py docstring)
# — never a per-student browsing surface, never raw code/AI prose.

@app.get("/reports/cohort/skill-distribution")
def report_skill_distribution(skill_id: str | None = None, _staff_id: str = Depends(require_staff_role)):
    return {"distribution": reporting_service.skill_distribution(skill_id)}


@app.get("/reports/cohort/common-mistakes")
def report_common_mistakes(skill_id: str | None = None, limit: int = 10, _staff_id: str = Depends(require_staff_role)):
    return {"mistakes": reporting_service.common_mistakes(skill_id, limit)}


@app.get("/reports/cohort/completion")
def report_completion(_staff_id: str = Depends(require_staff_role)):
    return {"completion": reporting_service.challenge_completion()}


@app.get("/reports/cohort/improvement")
def report_improvement(_staff_id: str = Depends(require_staff_role)):
    return {"improvement": reporting_service.improvement_signals()}
