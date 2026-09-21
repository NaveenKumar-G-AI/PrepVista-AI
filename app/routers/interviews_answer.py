"""
PrepVista AI - Interviews Answer endpoints
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
from pydantic import BaseModel, field_validator

from app.config import (
    can_access_plan,
    get_settings,
    is_valid_difficulty_mode,
    is_valid_plan,
    normalize_difficulty_mode,
)
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.routers.interviews_helpers import (
    _validate_session_id, _pre_validate_answer, _check_prompt_injection,
    _get_cached_client_response, _session_is_active, _cache_client_response,
    _normalize_plan, _safe_json_loads, _EVAL_SEMAPHORE
)
from app.middleware.rate_limiter import rate_limit_session, rate_limit_user
from app.services.evaluator import evaluate_single_question, normalize_rubric_category
from app.services.funnel_tracking import track_funnel_event
from app.services.interviewer import create_session, finish_session, process_answer
from app.services.quota import enforce_quota
from app.services.resume_parser import extract_text_from_pdf, parse_resume_structured, validate_pdf_upload
from app.routers.interviews_schemas import AnswerRequest

router = APIRouter()
logger = structlog.get_logger("prepvista.interviews")


@router.post("/{session_id}/answer")
async def submit_answer(
    session_id: str,
    req: AnswerRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: UserProfile = Depends(get_current_user),
):
    """Submit a user answer and receive the next AI question or the finish payload.

    Idempotent: duplicate submissions with the same client_request_id return
    the cached response instantly without reprocessing.

    The response may include an optional ``answer_quality_hint`` field when
    the submitted answer is detected as low-quality (too short, empty,
    repetitive, or a keyboard mash).  The frontend can use this hint to
    show the student a non-blocking nudge like "Consider adding more detail
    to your answer."  Clients that do not recognise this field can safely
    ignore it — it is purely informational.
    """
    # UUID format check before any DB query — eliminates path-traversal probes
    _validate_session_id(session_id)
    await rate_limit_session(session_id)

    settings = get_settings()
    max_answer_length = getattr(settings, "MAX_ANSWER_TEXT_LENGTH", 3000)

    # --- Pre-validate and normalize the answer text ---
    normalized_text, pre_validation_warning = _pre_validate_answer(
        req.user_text, max_answer_length
    )
    answer_word_count = len(normalized_text.split()) if normalized_text else 0

    if pre_validation_warning:
        logger.info(
            "answer_pre_validation_flag",
            session_id=session_id,
            warning=pre_validation_warning,
            answer_word_count=answer_word_count,
        )

    # Check for prompt injection in the answer text — a sophisticated attacker
    # may craft an answer designed to manipulate the LLM evaluator's output.
    if normalized_text:
        _check_prompt_injection(normalized_text, source="answer_text", session_context=session_id)

    # --- Fast path: idempotent cache check ---
    cached = await _get_cached_client_response(
        session_id=session_id,
        access_token=req.access_token,
        client_request_id=req.client_request_id,
    )
    if cached:
        logger.debug("idempotent_cache_hit", session_id=session_id,
                     client_request_id=req.client_request_id)
        return cached

    # --- Core answer processing ---
    result = await process_answer(
        session_id=session_id,
        user_text=normalized_text,
        access_token=req.access_token,
    )

    if result.get("action") == "error":
        raise HTTPException(status_code=400, detail=result.get("detail", "Answer processing failed."))

    question_for_eval = result.get("question_for_eval")
    turn_for_eval     = result.get("turn_for_eval")

    # Log the question text that was served to the student.  This creates an
    # audit trail that the deduplication layer (in interviewer.py) can use to
    # detect when the same or similar question has been asked in previous
    # sessions for the same resume fingerprint.
    next_question_text = result.get("question") or result.get("next_question") or ""
    if next_question_text:
        logger.debug(
            "question_served",
            session_id=session_id,
            turn=turn_for_eval,
            answer_word_count=answer_word_count,
            answer_quality_hint=pre_validation_warning,
            question_preview=next_question_text[:80],
        )

    # Only evaluate turns with real answer content and a valid question+turn pair
    should_evaluate = bool(
        normalized_text
        and normalized_text.strip()
        and question_for_eval
        and turn_for_eval is not None
        and pre_validation_warning not in {"empty_answer"}
    )

    # --- Final answer → synchronous eval + finish ---
    if result.get("action") == "finish":
        was_active = await _session_is_active(session_id, req.access_token)

        if should_evaluate:
            try:
                await _evaluate_and_store(
                    session_id=session_id,
                    turn_number=int(turn_for_eval),
                    question_text=str(question_for_eval),
                    raw_answer=normalized_text,
                    answer_duration_seconds=req.answer_duration_seconds,
                    answer_word_count=answer_word_count,
                )
            except Exception as exc:
                logger.error(
                    "final_eval_failed",
                    session_id=session_id,
                    turn=turn_for_eval,
                    error=str(exc),
                )

        final_result = await finish_session(
            session_id=session_id,
            access_token=req.access_token,
            duration_actual=req.duration_actual,
        )
        if "error" in final_result:
            raise HTTPException(status_code=400, detail=final_result["error"])

        logger.info(
            "interview_finished_via_answer",
            session_id=session_id,
            score=final_result.get("final_score"),
        )

        if was_active:
            try:
                async with DatabaseConnection() as conn:
                    await track_funnel_event(
                        conn, "mock completed",
                        user_id=user.id,
                        metadata={"session_id": session_id},
                    )
            except Exception as exc:
                logger.warning("funnel_tracking_finish_failed", session_id=session_id, error=str(exc))

        payload = {"action": "finish", **final_result}
        # Additive: surface quality hint to frontend on the finish path too
        if pre_validation_warning:
            payload["answer_quality_hint"] = pre_validation_warning
        await _cache_client_response(session_id, req.client_request_id, payload)
        return payload

    # --- Mid-interview → background evaluation ---
    if should_evaluate:
        background_tasks.add_task(
            _evaluate_and_store,
            session_id=session_id,
            turn_number=int(turn_for_eval),
            question_text=str(question_for_eval),
            raw_answer=normalized_text,
            answer_duration_seconds=req.answer_duration_seconds,
            answer_word_count=answer_word_count,
        )

    # Additive: surface answer quality hint to the frontend so it can
    # show a non-blocking nudge ("Your answer seems a bit short — consider
    # adding specific examples") without affecting scoring logic.
    if pre_validation_warning:
        result = {**result, "answer_quality_hint": pre_validation_warning}

    await _cache_client_response(session_id, req.client_request_id, result)
    return result


async def _evaluate_and_store(
    session_id: str,
    turn_number: int,
    question_text: str,
    raw_answer: str,
    answer_duration_seconds: int | None = None,
    answer_word_count: int | None = None,
) -> None:
    """Run per-question AI evaluation and persist the result.

    Structured in three DB-separated phases so the connection is never
    held open during the LLM evaluation call:

      Phase 1 — Read session data; early-exit if already evaluated.
      Phase 2 — Run the LLM evaluator (outside any DB connection).
      Phase 3 — Write the result with a post-eval double-insert guard.

    The Phase 3 INSERT uses ON CONFLICT DO NOTHING so concurrent finish
    calls cannot create duplicate rows.

    answer_word_count is an optional performance hint for the evaluator —
    a 3-word answer should be scored differently from a 300-word answer
    even when the AI evaluator sees similar content quality.
    """
    try:
        # ---- Phase 1: read ------------------------------------------------
        async with DatabaseConnection() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM question_evaluations WHERE session_id = $1 AND turn_number = $2",
                session_id,
                turn_number,
            )
            if existing:
                logger.debug(
                    "eval_already_exists_skip",
                    session_id=session_id,
                    turn=turn_number,
                )
                return  # Already evaluated — skip

            session = await conn.fetchrow(
                "SELECT plan, resume_summary, question_plan FROM interview_sessions WHERE id = $1",
                session_id,
            )
            if not session:
                logger.warning("eval_session_missing", session_id=session_id, turn=turn_number)
                return

        # ---- Derive rubric category (no DB connection) --------------------
        plan = _normalize_plan(session["plan"])
        resume_summary = session["resume_summary"] or "{}"
        question_plan = _safe_json_loads(session["question_plan"], [])
        if not isinstance(question_plan, list):
            question_plan = []

        rubric_category = "technical_depth"
        for item in question_plan:
            if isinstance(item, dict) and int(item.get("turn", 0) or 0) == int(turn_number):
                rubric_category = str(item.get("category") or "technical_depth")
                break
        rubric_category = normalize_rubric_category(question_text, rubric_category, plan)

        # ---- Phase 2: LLM evaluation (no DB connection) -------------------
        # Acquire the eval semaphore before calling the LLM.  Under 500
        # concurrent users, answer submissions arrive in bursts (end-of-question
        # silence timeout fires for many users simultaneously).  Without a
        # semaphore, a burst of 100+ simultaneous LLM calls hits API rate limits,
        # returns 429s, and the background tasks all fail silently.  The semaphore
        # queues excess tasks — they still run, just not all at once.
        async with _EVAL_SEMAPHORE:
            eval_result = await evaluate_single_question(
                question_text=question_text,
                raw_answer=raw_answer,
                resume_summary=str(resume_summary),
                rubric_category=rubric_category,
                plan=plan,
                session_id=session_id,
                turn_id=turn_number,
            )
        if not isinstance(eval_result, dict):
            logger.warning(
                "invalid_eval_result_type",
                session_id=session_id,
                turn=turn_number,
                category=rubric_category,
            )
            return

        # ---- Phase 3: write (new connection, double-insert guard) ---------
        async with DatabaseConnection() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM question_evaluations WHERE session_id = $1 AND turn_number = $2",
                session_id,
                turn_number,
            )
            if existing:
                return  # Race condition — already inserted by another task

            await conn.execute(
                """INSERT INTO question_evaluations
                   (session_id, turn_number, rubric_category, question_text,
                    raw_answer, normalized_answer, classification, score,
                    scoring_rationale, missing_elements, ideal_answer,
                    communication_score, communication_notes, relevance_score,
                    clarity_score, specificity_score, structure_score,
                    answer_status, content_understanding, depth_quality,
                    communication_clarity, what_worked, what_was_missing,
                    how_to_improve, answer_blueprint, corrected_intent,
                    answer_duration_seconds, repaired_answer)
                   VALUES
                   ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                    $12,$13,$14,$15,$16,$17,$18,$19,$20,
                    $21,$22,$23,$24,$25,$26,$27,$28)
                   ON CONFLICT (session_id, turn_number) DO NOTHING""",
                session_id,
                turn_number,
                rubric_category,
                question_text,
                eval_result.get("raw_answer", raw_answer),
                eval_result.get("normalized_answer", raw_answer),
                eval_result.get("classification", ""),
                eval_result.get("score", 0),
                eval_result.get("scoring_rationale") or eval_result.get("why_score", ""),
                eval_result.get("missing_elements", []),
                eval_result.get("ideal_answer") or eval_result.get("better_answer", ""),
                eval_result.get("communication_score", 0),
                eval_result.get("communication_notes", ""),
                eval_result.get("relevance_score") or eval_result.get("question_match_score", 0),
                eval_result.get("clarity_score") or eval_result.get("depth_score", 0),
                eval_result.get("specificity_score", 0),
                eval_result.get("structure_score", 0),
                eval_result.get("answer_status", ""),
                (eval_result.get("content_understanding")
                 or eval_result.get("content_quality")
                 or eval_result.get("technical_understanding", "")),
                eval_result.get("depth_quality", ""),
                eval_result.get("communication_clarity") or eval_result.get("communication_quality", ""),
                eval_result.get("what_worked", ""),
                eval_result.get("what_was_missing", ""),
                eval_result.get("how_to_improve", ""),
                eval_result.get("answer_blueprint", ""),
                eval_result.get("corrected_intent", ""),
                answer_duration_seconds,
                eval_result.get("repaired_answer") or eval_result.get("raw_answer", raw_answer),
            )

        logger.info(
            "question_evaluated",
            session_id=session_id,
            turn=turn_number,
            score=eval_result.get("score", 0),
            category=rubric_category,
            answer_word_count=answer_word_count,
            answer_duration_seconds=answer_duration_seconds,
        )

    except Exception as exc:
        logger.error(
            "background_eval_failed",
            session_id=session_id,
            turn=turn_number,
            error=str(exc),
        )