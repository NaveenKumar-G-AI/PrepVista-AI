"""
PrepVista AI - Interviews Session endpoints
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, field_validator
from uuid import uuid4

from app.config import (
    can_access_plan,
    get_settings,
    is_valid_difficulty_mode,
    is_valid_plan,
    normalize_difficulty_mode,
)
from app.database.connection import DatabaseConnection
from app.services.interview_terminal import connection_scope, connection, terminalize, register_question
from app.services.interview_summary import coerce_runtime_state
from app.dependencies import UserProfile, get_current_user
from app.routers.interviews_helpers import (
    _normalize_plan, _MAX_PDF_SIZE_BYTES, _SETUP_SEMAPHORE,
    _check_prompt_injection, _compute_resume_fingerprint, _MIN_DURATION_SECONDS,
    _MAX_DURATION_SECONDS, _normalize_proctoring_mode, _normalize_candidate_name,
    _validate_session_id, _session_is_active, _safe_json_loads, _normalize_violation_text,
    _MAX_REASON_LEN, _build_proctoring_event, _safe_json_dumps, _clip_text,
    _MAX_VIOLATION_TYPE_LEN, _MAX_VIOLATIONS_PER_SESSION
)
from app.middleware.rate_limiter import rate_limit_session, rate_limit_user
from app.services.evaluator import evaluate_single_question, normalize_rubric_category
from app.services.funnel_tracking import track_funnel_event
from app.services.interviewer import create_session, finish_session, process_answer
from app.services.quota import enforce_quota
from app.services.resume_parser import (
    extract_text_from_resume,
    parse_resume_structured,
    validate_resume_upload,
    SUPPORTED_RESUME_EXTENSIONS,
)

from app.routers.interviews_schemas import (
    AnswerRequest,
    FinishRequest,
    TerminateRequest,
    ViolationRequest,
)

router = APIRouter()
logger = structlog.get_logger("prepvista.interviews")


@router.post("/setup")
async def setup_interview(
    request: Request,
    resume: UploadFile = File(...),
    plan: str = Form("free"),
    difficulty_mode: str = Form("auto"),
    duration: int = Form(600),
    proctoring_mode: str = Form("practice"),
    guided_assistance: str = Form("false"),
    user: UserProfile = Depends(get_current_user),
):
    """Set up a new interview session.

    Validates the plan, difficulty mode, PDF upload, and resume content
    before creating a session and returning the session credentials.
    """
    await rate_limit_user(user.id)
    await enforce_quota(user)

    normalized_plan = _normalize_plan(plan)
    if not is_valid_plan(normalized_plan):
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan!r}. Expected: free, pro, or career.")

    if not is_valid_difficulty_mode(difficulty_mode):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid difficulty mode: {difficulty_mode!r}. Expected: auto, basic, medium, or difficult.",
        )
    normalized_difficulty = normalize_difficulty_mode(difficulty_mode)

    current_user_plan = _normalize_plan(
        getattr(user, "effective_plan", getattr(user, "plan", "free"))
    )
    if not can_access_plan(current_user_plan, normalized_plan):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Your current plan ({current_user_plan!r}) does not include "
                f"{normalized_plan!r} features. Upgrade to access this plan."
            ),
        )

    if not resume.filename:
        raise HTTPException(status_code=400, detail="A resume file is required.")
    if not resume.filename.lower().endswith(SUPPORTED_RESUME_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported resume format. Please upload one of: "
                f"{', '.join(SUPPORTED_RESUME_EXTENSIONS)}."
            ),
        )

    # --- PDF size guard (DoS prevention) ------------------------------------
    # Check Content-Length header first as a fast path before reading the body.
    # This rejects oversized uploads before they consume server memory.
    content_length_hdr = request.headers.get("content-length")
    if content_length_hdr:
        try:
            if int(content_length_hdr) > _MAX_PDF_SIZE_BYTES + 65536:  # +64 KB form overhead
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload too large. Resume PDF must be under {_MAX_PDF_SIZE_BYTES // (1024*1024)} MB.",
                )
        except ValueError:
            pass  # Malformed Content-Length — proceed and check actual size below

    pdf_bytes = await resume.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The uploaded resume file is empty.")

    # Actual size check after read (catches chunked uploads that bypass Content-Length)
    if len(pdf_bytes) > _MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Resume PDF must be under {_MAX_PDF_SIZE_BYTES // (1024*1024)} MB.",
        )

    # --- Content-level validation (file-type spoofing prevention) -----------
    # Per-format magic-byte checks: a renamed .exe/.html/.zip passes a filename
    # -only check but fails here before reaching any parser (Fix 6 — supports
    # PDF, DOCX, DOC, and image uploads, not just PDF).
    validate_resume_upload(pdf_bytes, resume.filename or "resume", resume.content_type)

    # Acquire the setup semaphore before the CPU-bound extraction (PDF parse /
    # OCR / LibreOffice conversion) and the network-bound LLM parse.  This caps
    # concurrent work at _SETUP_SEMAPHORE slots regardless of how many users hit
    # /setup simultaneously, preventing CPU spikes and LLM rate-limit exhaustion
    # during peak load (e.g. a college placement drive where 200 students start
    # within minutes of each other).
    async with _SETUP_SEMAPHORE:
        # Format-aware extraction; raises 400 on unreadable files and a clear
        # message when the extracted text is under the 200-char quality gate.
        resume_text = extract_text_from_resume(
            pdf_bytes, resume.filename or "resume", resume.content_type
        )

        # Check for prompt injection patterns in the resume text.
        # We log (not reject) to avoid blocking legitimate resumes that
        # contain phrases like "ignore previous technical requirements."
        _check_prompt_injection(resume_text, source="resume_text")

        resume_summary = await parse_resume_structured(resume_text)

    if not isinstance(resume_summary, dict):
        resume_summary = {}

    # Compute a stable fingerprint of this exact PDF for cross-session question
    # de-duplication.  The fingerprint is persisted against the session so that
    # the interviewer service can detect when the same resume has been used in
    # prior sessions and avoid repeating the same question patterns.
    resume_fingerprint = _compute_resume_fingerprint(pdf_bytes)

    # Clamp duration to a safe range
    clamped_duration = max(_MIN_DURATION_SECONDS, min(_MAX_DURATION_SECONDS, int(duration)))
    normalized_proctoring_mode = _normalize_proctoring_mode(proctoring_mode)

    # Track that setup was initiated — allows us to measure how many sessions
    # drop out during PDF processing vs after (setup started / mock started ratio).
    try:
        async with connection_scope(DatabaseConnection) as conn:
            await track_funnel_event(
                conn, "cta clicked",
                user_id=user.id,
                metadata={"action": "setup_started", "plan": normalized_plan, "resume_fingerprint": resume_fingerprint},
            )
    except Exception as exc:
        logger.warning("funnel_tracking_setup_started_failed", user_id=user.id, error=str(exc))

    result = await create_session(
        user_id=user.id,
        plan=normalized_plan,
        difficulty_mode=normalized_difficulty,
        resume_text=resume_text,
        resume_summary=resume_summary,
        resume_file_path=None,
        duration_seconds=clamped_duration,
        proctoring_mode=normalized_proctoring_mode,
    )

    session_id = result["session_id"]

    assistance_enabled = guided_assistance.lower() == 'true'
    try:
        async with connection_scope(DatabaseConnection) as conn:
            await conn.execute(
                """INSERT INTO interview_assistance_policy
                   (session_id, enabled, hints_enabled, answer_guidance_enabled)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (session_id) DO NOTHING""",
                session_id,
                assistance_enabled,
                assistance_enabled,
                assistance_enabled,
            )
    except Exception as exc:
        assistance_enabled = False
        logger.warning("assistance_policy_create_failed", exception_type=type(exc).__name__)

    logger.info(
        "interview_setup_complete",
        user_id=user.id,
        session_id=session_id,
        plan=normalized_plan,
        difficulty_mode=normalized_difficulty,
        proctoring_mode=normalized_proctoring_mode,
        duration=clamped_duration,
        resume_fingerprint=resume_fingerprint,
    )

    # Persist the resume fingerprint against the session so the interviewer
    # service can use it for cross-session question variation.
    # SEPARATE try/except from funnel tracking — these two operations are
    # independent.  A fingerprint write failure must NOT prevent funnel events
    # from firing, and a funnel event failure must NOT prevent fingerprint storage.
    try:
        async with connection_scope(DatabaseConnection) as conn:
            await conn.execute(
                """UPDATE interview_sessions
                   SET resume_fingerprint = $2
                   WHERE id = $1""",
                session_id,
                resume_fingerprint,
            )
    except Exception as exc:
        logger.warning(
            "resume_fingerprint_store_failed",
            session_id=session_id,
            resume_fingerprint=resume_fingerprint,
            error=str(exc),
        )

    # Non-critical funnel tracking — in its own try/except so that a tracking
    # failure never blocks or corrupts the session response.
    try:
        async with connection_scope(DatabaseConnection) as conn:
            await track_funnel_event(
                conn, "resume uploaded",
                user_id=user.id,
                metadata={
                    "session_id": session_id,
                    "plan": normalized_plan,
                    "resume_fingerprint": resume_fingerprint,
                },
            )
            await track_funnel_event(
                conn, "mock started",
                user_id=user.id,
                metadata={"session_id": session_id, "plan": normalized_plan},
            )
    except Exception as exc:
        logger.warning("funnel_tracking_setup_failed", session_id=session_id, error=str(exc))

    return {
        "session_id":         session_id,
        "access_token":       result["access_token"],
        "plan":               result["plan"],
        "difficulty_mode":    result["difficulty_mode"],
        "max_turns":          result["max_turns"],
        "duration_seconds":   result["duration_seconds"],
        "proctoring_mode":    result["proctoring_mode"],
        "candidate_name":     _normalize_candidate_name(
            resume_summary.get("candidate_name", "Candidate")
        ),
        # Additive: lets the client track which resume fingerprint this session
        # was built on — useful for debugging cross-session dedup and for
        # showing the student "session #N with this resume".
        "resume_fingerprint": resume_fingerprint,
        "assistance_enabled": assistance_enabled,
    }


@router.post("/{session_id}/finish")
async def end_interview(
    session_id: str,
    req: FinishRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Explicitly finish the interview and compute the final score.

    Safe to call even if the session was already finished — the service
    layer returns an error payload instead of crashing.
    """
    _validate_session_id(session_id)
    async with connection_scope(DatabaseConnection) as conn:
        owner = await conn.fetchval("SELECT user_id FROM interview_sessions WHERE id = $1 AND access_token = $2", session_id, req.access_token)
    if not owner or str(owner) != str(user.id):
        raise HTTPException(404, "Session not found.")
    was_active = await _session_is_active(session_id, req.access_token)
    result = await finish_session(
        session_id=session_id,
        access_token=req.access_token,
        duration_actual=req.duration_actual,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    logger.info("interview_finished_explicit", session_id=session_id, score=result.get("final_score"))

    if was_active:
        try:
            async with connection_scope(DatabaseConnection) as conn:
                await track_funnel_event(
                    conn, "mock completed",
                    user_id=user.id,
                    metadata={"session_id": session_id},
                )
        except Exception as exc:
            logger.warning("funnel_tracking_finish_failed", session_id=session_id, error=str(exc))

    return result


@router.post("/{session_id}/terminate")
async def terminate_interview(session_id: str, req: TerminateRequest, user: UserProfile = Depends(get_current_user)):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT user_id, total_turns, runtime_state FROM interview_sessions WHERE id = $1 AND access_token = $2 FOR UPDATE",
                                      session_id, req.access_token)
            if not row or str(row["user_id"]) != str(user.id):
                raise HTTPException(404, "Session not found.")
            state = coerce_runtime_state(row["runtime_state"])
            if state.get("termination_response"):
                return state["termination_response"]
            if state.get("finish_response"):
                return {"action": "finish", **state["finish_response"]}
            marker = connection.set(conn)
            try:
                if state.get("terminal_contract_version") != 1:
                    from app.services.interviewer_session import adopt_active_terminal_contract
                    state = await adopt_active_terminal_contract(conn, session_id, state)
                from app.services.answer_acceptance import settle_accepted_evidence
                settle_accepted_evidence(state)
                await conn.execute("UPDATE interview_sessions SET runtime_state = $2 WHERE id = $1", session_id, _safe_json_dumps(state))
                current = state.get("active_question_id")
                if req.question_instance_id and str(req.question_instance_id) != str(current):
                    raise HTTPException(409, "The answer belongs to a different question.")
                if current and not state["question_records"][current].get("outcome"):
                    terminalize(state, current, "ABORTED", req.user_text[:8000], req.capture_evidence)
                    if req.user_text:
                        await conn.execute("INSERT INTO conversation_messages (session_id, role, content, turn_number) VALUES ($1, 'user', $2, $3)",
                                           session_id, req.user_text[:8000], row["total_turns"])
                    await conn.execute("UPDATE interview_sessions SET runtime_state = $2 WHERE id = $1", session_id, _safe_json_dumps(state))
                result = await _terminate_interview_impl(session_id, req, user)
                row = await conn.fetchrow("SELECT runtime_state FROM interview_sessions WHERE id = $1", session_id)
                state = coerce_runtime_state(row["runtime_state"])
                state["termination_response"] = result
                state["finish_response"] = {k:v for k,v in result.items() if k not in {"action","termination_reason"}}
                await conn.execute("UPDATE interview_sessions SET runtime_state = $2 WHERE id = $1", session_id, _safe_json_dumps(state))
                return result
            finally:
                connection.reset(marker)


async def _terminate_interview_impl(
    session_id: str,
    req: TerminateRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Force-end the interview due to a hard client-side proctoring violation."""
    _validate_session_id(session_id)
    async with connection_scope(DatabaseConnection) as conn:
        session = await conn.fetchrow(
            """SELECT id, state, proctoring_violations
               FROM interview_sessions
               WHERE id = $1 AND access_token = $2""",
            session_id,
            req.access_token,
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
        if session["state"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="This interview session is no longer active.")

        violations = _safe_json_loads(session["proctoring_violations"], [])
        if not isinstance(violations, list):
            violations = []

        reason = _normalize_violation_text(req.reason, _MAX_REASON_LEN)
        if reason:
            violations.append(_build_proctoring_event("termination", reason))

        await conn.execute(
            """UPDATE interview_sessions
               SET termination_reason    = $2,
                   proctoring_violations = $3
               WHERE id = $1""",
            session_id,
            reason,
            _safe_json_dumps(violations),
        )

    logger.info("interview_terminated", session_id=session_id, reason=reason[:80] if reason else "")

    result = await finish_session(
        session_id=session_id,
        access_token=req.access_token,
        duration_actual=req.duration_actual,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {"action": "terminated", "termination_reason": reason, **result}


@router.post("/{session_id}/violation")
async def log_proctoring_violation(
    session_id: str,
    req: ViolationRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Log a non-terminal proctoring event without ending the session.

    Use this endpoint for soft integrity events that should be recorded
    but that do not warrant session termination:
      - Tab switch / window blur
      - Camera not detected
      - Copy-paste attempt
      - Phone detected in frame
      - Multiple faces detected

    The session remains ACTIVE.  All logged events are visible in the
    college admin dashboard and in the per-student integrity report.
    Use /terminate for hard violations that must end the session immediately.

    This endpoint is idempotency-safe: calling it multiple times with the
    same violation_type and timestamp produces distinct log entries, which
    is the correct behaviour for repeated events (e.g. 5 tab-switches).
    """
    # UUID format check and rate limit before any DB access
    _validate_session_id(session_id)
    await rate_limit_session(session_id)

    event = _build_proctoring_event(
        _clip_text(req.violation_type, _MAX_VIOLATION_TYPE_LEN),
        _normalize_violation_text(req.detail),
    )
    event_json = _safe_json_dumps(event)

    async with connection_scope(DatabaseConnection) as conn:
        # Two-phase: fast state check, then atomic JSONB append.
        # The atomic || append eliminates the Python-side read-modify-write
        # race condition that occurred when multiple tab-switch events fired
        # within the same millisecond (e.g. 10 rapid blur events on mobile).
        # Old pattern: SELECT violations → Python list.append → UPDATE  (3 ops, TOCTOU race)
        # New pattern: SELECT state     → atomic JSONB append          (2 ops, race-free)
        state = await conn.fetchval(
            "SELECT state FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id,
            req.access_token,
        )
        if state is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        if state != "ACTIVE":
            raise HTTPException(
                status_code=400,
                detail="This interview session is no longer active.",
            )

        # Violation count cap — prevent DB bloat via automated violation spam.
        current_count = await conn.fetchval(
            "SELECT jsonb_array_length(COALESCE(proctoring_violations, '[]'::jsonb)) FROM interview_sessions WHERE id = $1",
            session_id,
        ) or 0
        if current_count >= _MAX_VIOLATIONS_PER_SESSION:
            logger.warning(
                "violation_cap_reached",
                session_id=session_id,
                count=current_count,
            )
            return {
                "logged":          False,
                "violation_type":  event["type"],
                "violation_count": current_count,
                "timestamp":       event["timestamp"],
                "capped":          True,
            }

        # PostgreSQL's jsonb || jsonb_build_array() appends the event atomically.
        # RETURNING gives us the new array length without an extra SELECT.
        row = await conn.fetchrow(
            """UPDATE interview_sessions
               SET proctoring_violations =
                     COALESCE(proctoring_violations, '[]'::jsonb)
                     || jsonb_build_array($2::jsonb)
               WHERE id = $1
               RETURNING jsonb_array_length(
                           COALESCE(proctoring_violations, '[]'::jsonb)
                         ) AS violation_count""",
            session_id,
            event_json,
        )

    violation_count = (row["violation_count"] if row else 0) + 1  # +1 for the appended event

    logger.info(
        "proctoring_violation_logged",
        session_id=session_id,
        violation_type=event["type"],
        total_violations=violation_count,
    )

    return {
        "logged":            True,
        "violation_type":    event["type"],
        "violation_count":   violation_count,
        "timestamp":         event["timestamp"],
    }


# ---------------------------------------------------------------------------
# Background evaluation task
# ---------------------------------------------------------------------------


class RetryQuestionRequest(BaseModel):
    access_token: str = Field(min_length=32, max_length=256)
    client_request_id: str = Field(min_length=1, max_length=200)
    expected_turn: int = Field(ge=1)
    question_instance_id: str
    active_question_instance_id: str
    captured_text: str = Field(default="", max_length=10000)
    capture_evidence: dict = Field(default_factory=dict)


@router.post("/{session_id}/retry-question")
async def retry_question(session_id: str, req: RetryQuestionRequest,
                         user: UserProfile = Depends(get_current_user)):
    """Ask the same question as a new attempt; original evidence is immutable."""
    from app.config import PLAN_CONFIG
    from app.services.interviewer_session import _question_signature
    for value in (session_id, req.question_instance_id, req.active_question_instance_id):
        _validate_session_id(value)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""SELECT user_id, state, total_turns, plan, runtime_state
                FROM interview_sessions WHERE id = $1 AND access_token = $2 FOR UPDATE""",
                session_id, req.access_token)
            if not row or str(row["user_id"]) != str(user.id):
                raise HTTPException(404, "Interview not found.")
            runtime = coerce_runtime_state(row["runtime_state"])
            previous = runtime.get("retry_responses", {}).get(req.client_request_id)
            if previous:
                return previous
            if (row["state"] != "ACTIVE" or runtime.get("terminal_contract_version") != 1
                    or int(row["total_turns"] or 0) != req.expected_turn
                    or str(runtime.get("active_question_id")) != req.active_question_instance_id):
                raise HTTPException(409, "Refresh the interview before asking again.")
            from app.services.answer_acceptance import evidence_ack, pending_accepted_answers, settle_accepted_evidence
            pending = pending_accepted_answers(runtime)
            if pending:
                accepted = [runtime["accepted_attempts"][item["evidence_ack"]["client_request_id"]]
                            for item in pending]
                if any(item["outcome"] != "ABORTED"
                       or item["question_instance_id"] != req.active_question_instance_id
                       for item in accepted):
                    raise HTTPException(409, "Finish processing the accepted answer before asking again.")
                # Ask Again explicitly abandons this attempt. Its accepted
                # original remains authoritative even if a later request sends
                # different capture text or metadata.
                settle_accepted_evidence(runtime)
                for item in accepted:
                    runtime.setdefault("answer_responses", {})[item["client_request_id"]] = {
                        "action": "accepted", "processing_state": "COMPLETE",
                        "evidence_ack": evidence_ack(item),
                    }
            records = runtime.get("question_records", {})
            original = records.get(req.question_instance_id)
            current = records.get(req.active_question_instance_id)
            if not original or not current or not original.get("question_text"):
                raise HTTPException(409, "The original question is unavailable.")
            maximum = PLAN_CONFIG[_normalize_plan(row["plan"])]["max_turns"]
            if req.expected_turn >= maximum:
                raise HTTPException(409, "The interview question limit is reached. Finish this session.")
            if not current.get("outcome"):
                terminalize(runtime, req.active_question_instance_id, "ABORTED",
                            req.captured_text, {**req.capture_evidence, "reason": "ask_me_again"})
            turn = req.expected_turn + 1
            instance = register_question(runtime, session_id, turn, original["question_text"], str(uuid4()))
            retry_record = records[instance]
            retry_record["retry_of_question_instance_id"] = req.question_instance_id
            category = await conn.fetchval("SELECT rubric_category FROM question_evaluations WHERE session_id = $1 AND question_instance_id = $2",
                                          session_id, req.question_instance_id)
            if category or original.get("rubric_category"):
                retry_record["rubric_category"] = category or original["rubric_category"]
            runtime["active_question_id"] = instance
            runtime["question_state"] = "active_question_open"
            payload = {"action": "continue", "question": original["question_text"],
                       "turn": turn, "max_turns": maximum, "remaining_turns": maximum-turn,
                       "question_instance_id": instance, "retry_of_question_instance_id": req.question_instance_id}
            runtime.setdefault("retry_responses", {})[req.client_request_id] = payload
            await conn.execute("INSERT INTO conversation_messages (session_id, role, content, turn_number) VALUES ($1, 'assistant', $2, $3)",
                               session_id, original["question_text"], turn)
            await conn.execute("""UPDATE interview_sessions SET total_turns = $2, runtime_state = $3,
                active_question_turn = $2, active_question_signature = $4, question_retry_count = 0,
                last_answer_status = NULL WHERE id = $1""", session_id, turn, json.dumps(runtime),
                _question_signature(original["question_text"]))
            return payload


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id as session_id, access_token, plan, difficulty_mode, 
                      total_turns as turn, runtime_state, duration_planned_seconds as duration_seconds, proctoring_mode, resume_summary,
                      state
               FROM interview_sessions WHERE id = $1 AND user_id = $2""",
            session_id, user.id
        )
        if not session:
            raise HTTPException(404, "Session not found")
            
        policy = await conn.fetchrow("SELECT enabled FROM interview_assistance_policy WHERE session_id = $1", session_id)
        
        from app.config import PLAN_CONFIG
        result = dict(session)
        summary = _safe_json_loads(result.pop("resume_summary", None), {})
        result["candidate_name"] = _normalize_candidate_name(summary.get("candidate_name", "Candidate"))
        runtime = coerce_runtime_state(result.pop("runtime_state", {}))
        instance = runtime.get("active_question_id")
        record = runtime.get("question_records", {}).get(str(instance), {})
        question = record.get("question_text")
        if not question and result["turn"]:
            question = await conn.fetchval("SELECT content FROM conversation_messages WHERE session_id = $1 AND role = 'assistant' AND turn_number = $2 ORDER BY id DESC LIMIT 1", session_id, result["turn"])
        from app.services.assistance_evidence import resolve_provenance
        provenance = record.get("assistance_provenance")
        if provenance is None and instance:
            now = await conn.fetchval("SELECT clock_timestamp() AS answered_at")
            provenance = await resolve_provenance(conn, session_id, instance, user.id, now,
                                                  result["turn"], mark_used=False)
        from app.services.answer_acceptance import pending_accepted_answers
        result["pending_accepted_answers"] = pending_accepted_answers(runtime)
        result.update(current_assistance_provenance=provenance or "unknown",
                      max_turns=PLAN_CONFIG[_normalize_plan(result["plan"])]["max_turns"],
                      question_instance_id=instance, current_question_text=question,
                      terminal_outcome=record.get("outcome"), finish_response=runtime.get("finish_response"),
                      assistance_enabled=policy["enabled"] if policy else False)
        return result
