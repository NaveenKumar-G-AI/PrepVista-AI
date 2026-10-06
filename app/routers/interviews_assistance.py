from __future__ import annotations

import asyncio
import hashlib
import json
import structlog
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.routers.interviews_helpers import _validate_session_id
from app.services.assistance import generate_hint, generate_answer_guidance, valid_content
from app.services.assistance_families import classify_question_family
from app.services.history_retention import require_history_access
from app.services.interview_summary import coerce_runtime_state

router = APIRouter()
logger = structlog.get_logger("prepvista.interviews.assistance")


class AssistanceHintRequest(BaseModel):
    client_request_id: str = Field(min_length=1, max_length=200)
    level: int = Field(default=1, ge=1, le=2)
    question_text: str
    question_instance_id: str
    access_token: str


class AssistanceGuidanceRequest(BaseModel):
    client_request_id: str = Field(min_length=1, max_length=200)
    question_text: str
    question_instance_id: str
    access_token: str


class AssistanceViewedRequest(BaseModel):
    access_token: str


async def _locked_session(conn, session_id, token, user):
    session = await conn.fetchrow(
        """SELECT id, state, resume_summary, total_turns, plan, runtime_state
           FROM interview_sessions WHERE id = $1 AND access_token = $2 AND user_id = $3 FOR UPDATE""",
        session_id, token, user.id)
    if not session:
        raise HTTPException(404, "Session not found or invalid access token.")
    if session["state"] != "ACTIVE":
        raise HTTPException(409, "Session is not active.")
    return session


async def _active_question(conn, session, instance):
    runtime = coerce_runtime_state(session["runtime_state"])
    if str(runtime.get("active_question_id") or "") != str(instance):
        raise HTTPException(409, "This question has already advanced.")
    record = runtime.get("question_records", {}).get(str(instance))
    if record:
        if record.get("outcome") or int(record["turn"]) != int(session["total_turns"]):
            raise HTTPException(409, "This question is already closed.")
        return record["question_text"], record["turn"]
    # Active legacy state requires an actual asked question, never client text.
    asked = await conn.fetchrow(
        """SELECT content, turn_number FROM conversation_messages WHERE session_id = $1
           AND role = 'assistant' AND turn_number = $2 AND turn_number > 0""",
        session["id"], session["total_turns"])
    if not asked:
        raise HTTPException(409, "Refresh the interview before requesting assistance.")
    return asked["content"], asked["turn_number"]


def _response(row):
    stored = row["generated_content"]
    try:
        decoded = json.loads(stored)
    except (TypeError, ValueError):
        decoded = None
    content = decoded.get("content") if isinstance(decoded, dict) and decoded.get("format") == 1 else stored
    if row.get("invalidated") or row.get("model_provider") == "fallback" or not row.get("generated_at") or not isinstance(content, str) or not content.strip():
        raise HTTPException(409, "This assistance event is unavailable.")
    result = dict(event_id=str(row["id"]), content=content, turn_number=row["turn_number"],
                  question_instance_id=str(row["question_instance_id"]), question_family=row["question_family"])
    if row["assistance_type"] == "hint":
        result["level"] = row["assistance_level"]
    else:
        result["why_it_works"] = decoded.get("why_it_works", []) if isinstance(decoded, dict) else []
    return result


async def _request_assistance(session_id, req, user, kind, level, insert_sql):
    _validate_session_id(session_id)
    _validate_session_id(req.question_instance_id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            session = await _locked_session(conn, session_id, req.access_token, user)
            policy = await conn.fetchrow("SELECT enabled, hints_enabled, answer_guidance_enabled FROM interview_assistance_policy WHERE session_id = $1", session_id)
            flag = "hints_enabled" if kind == "hint" else "answer_guidance_enabled"
            if not policy or not policy["enabled"] or not policy[flag]:
                raise HTTPException(403, "Assistance is not enabled for this session.")
            existing = await conn.fetchrow("SELECT * FROM interview_assistance_event WHERE request_id = $1", req.client_request_id)
            if existing:
                if (str(existing["session_id"]), str(existing["user_id"]), str(existing["question_instance_id"]), existing["assistance_type"], existing["assistance_level"]) != (str(session_id), str(user.id), str(req.question_instance_id), kind, level):
                    raise HTTPException(409, "Assistance request identity does not match this question.")
                return _response(existing)
            question, turn = await _active_question(conn, session, req.question_instance_id)
            existing = await conn.fetchrow(
                "SELECT * FROM interview_assistance_event WHERE session_id = $1 AND question_instance_id = $2 AND assistance_type = $3 AND assistance_level = $4",
                session_id, req.question_instance_id, kind, level)
            if existing:
                return _response(existing)
            recent = await conn.fetchval("SELECT count(*) FROM interview_assistance_event WHERE session_id = $1 AND requested_at > now() - interval '1 minute'", session_id)
            if recent and recent > 10:
                raise HTTPException(429, "Too many assistance requests. Please wait a moment.")
            family = classify_question_family(question)
            resume = session["resume_summary"] or "{}"
            try:
                operation = generate_hint(question, family, level, resume, "Interview Candidate") if kind == "hint" else generate_answer_guidance(question, family, resume, "Interview Candidate", coerce_runtime_state(resume))
                generated = await asyncio.wait_for(operation, timeout=20)
                content = valid_content(generated)
                if generated.get("safety_passed") is False or generated.get("model_provider") == "fallback":
                    raise ValueError("Unavailable assistance")
                reasons = generated.get("why_it_works", [])
                if not isinstance(reasons, list) or any(not isinstance(value, str) or not value.strip() for value in reasons):
                    raise ValueError("Incomplete assistance")
            except Exception as exc:
                logger.warning("assistance_generation_unavailable", exception_type=type(exc).__name__)
                raise HTTPException(503, "Assistance is temporarily unavailable. You can answer independently or try again.") from None
            stored = json.dumps(dict(format=1, content=content, why_it_works=reasons))
            row = await conn.fetchrow(insert_sql, session_id, user.id, turn, req.question_instance_id, kind, level,
                                      req.client_request_id, question, family, stored,
                                      generated.get("model_provider", ""), generated.get("model_version", ""),
                                      hashlib.sha256(content.encode()).hexdigest())
            if not row:
                raise HTTPException(409, "Assistance request conflicts with an existing event.")
            return _response(row)


@router.post("/{session_id}/assistance/hint")
async def request_hint(session_id: str, req: AssistanceHintRequest, user: UserProfile = Depends(get_current_user)):
    return await _request_assistance(session_id, req, user, "hint", req.level,
        """INSERT INTO interview_assistance_event
           (session_id, user_id, turn_number, question_instance_id, assistance_type, assistance_level,
            request_id, question_text, question_family, generated_content, model_provider, model_version, content_hash, generated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, clock_timestamp())
           ON CONFLICT (session_id, question_instance_id, assistance_type, assistance_level)
           WHERE question_instance_id IS NOT NULL DO NOTHING RETURNING *""")


@router.post("/{session_id}/assistance/answer-guidance")
async def request_answer_guidance(session_id: str, req: AssistanceGuidanceRequest, user: UserProfile = Depends(get_current_user)):
    return await _request_assistance(session_id, req, user, "answer_guidance", 1,
        """INSERT INTO interview_assistance_event
           (session_id, user_id, turn_number, question_instance_id, assistance_type, assistance_level,
            request_id, question_text, question_family, generated_content, model_provider, model_version, content_hash, generated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, clock_timestamp())
           ON CONFLICT (session_id, question_instance_id, assistance_type, assistance_level)
           WHERE question_instance_id IS NOT NULL DO NOTHING RETURNING *""")


@router.post("/{session_id}/assistance/{event_id}/viewed")
async def mark_event_viewed(session_id: str, event_id: str, req: AssistanceViewedRequest, user: UserProfile = Depends(get_current_user)):
    _validate_session_id(session_id)
    _validate_session_id(event_id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            session = await _locked_session(conn, session_id, req.access_token, user)
            event = await conn.fetchrow("SELECT * FROM interview_assistance_event WHERE id = $1 AND session_id = $2 AND user_id = $3", event_id, session_id, user.id)
            if not event:
                raise HTTPException(404, "Assistance event not found.")
            await _active_question(conn, session, event["question_instance_id"])
            _response(event)
            row = await conn.fetchrow(
                """UPDATE interview_assistance_event SET viewed_at = COALESCE(viewed_at, clock_timestamp())
                   WHERE id = $1 AND session_id = $2 AND user_id = $3 AND invalidated = FALSE
                   RETURNING viewed_at""", event_id, session_id, user.id)
            if not row:
                raise HTTPException(409, "This assistance event is unavailable.")
            return {"status": "ok", "viewed_at": row["viewed_at"], "question_instance_id": str(event["question_instance_id"])}


@router.get("/{session_id}/assistance/summary")
async def get_assistance_summary(session_id: str, access_token: str, user: UserProfile = Depends(get_current_user)):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow("SELECT id, state FROM interview_sessions WHERE id = $1 AND access_token = $2 AND user_id = $3", session_id, access_token, user.id)
        if not session:
            raise HTTPException(404, "Session not found or invalid access token.")
        if session["state"] == "FINISHED":
            await require_history_access(conn, user, session_id)
        events = await conn.fetch(
            """SELECT turn_number, question_instance_id, assistance_type, assistance_level, question_family,
                      generated_at, viewed_at, used_before_answer, invalidated
               FROM interview_assistance_event WHERE session_id = $1
               ORDER BY turn_number, requested_at, id""", session_id)
        summary = {}
        for event in events:
            summary.setdefault(event["turn_number"], []).append(dict(event))
        return {"summary": summary}
