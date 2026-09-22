from __future__ import annotations

import json
from datetime import datetime, timezone
import structlog
from fastapi import APIRouter, HTTPException, Depends

from pydantic import BaseModel

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.routers.interviews_helpers import _validate_session_id
from app.services.assistance import generate_hint, generate_answer_guidance
from app.services.assistance_families import classify_question_family

router = APIRouter()
logger = structlog.get_logger("prepvista.interviews.assistance")

class AssistanceHintRequest(BaseModel):
    client_request_id: str
    level: int = 1
    question_text: str
    access_token: str

class AssistanceGuidanceRequest(BaseModel):
    client_request_id: str
    question_text: str
    access_token: str

class AssistanceViewedRequest(BaseModel):
    access_token: str

@router.post("/{session_id}/assistance/hint")
async def request_hint(
    session_id: str,
    req: AssistanceHintRequest,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)

    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            "SELECT state, resume_summary, total_turns, plan FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id, req.access_token
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or invalid access token.")
        if session["state"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Session is not active.")

        policy = await conn.fetchrow(
            "SELECT enabled, hints_enabled FROM interview_assistance_policy WHERE session_id = $1",
            session_id
        )
        if not policy or not policy["enabled"] or not policy["hints_enabled"]:
            raise HTTPException(status_code=403, detail="Hints are not enabled for this session.")

        turn_number = (session["total_turns"] or 0) + 1

        existing = await conn.fetchrow(
            "SELECT id, generated_content, question_family, assistance_level, viewed_at FROM interview_assistance_event WHERE session_id = $1 AND request_id = $2",
            session_id, req.client_request_id
        )
        if existing:
            return {
                "event_id": str(existing["id"]),
                "content": existing["generated_content"] or "",
                "level": existing["assistance_level"],
                "turn_number": turn_number,
                "question_family": existing["question_family"],
            }

        family = classify_question_family(req.question_text)
        
        # generate hint
        resume_summary = session["resume_summary"] or "{}"
        role_context = "Interview Candidate"
        result = await generate_hint(req.question_text, family, req.level, resume_summary, role_context)

        # insert
        row = await conn.fetchrow(
            """INSERT INTO interview_assistance_event 
               (session_id, user_id, turn_number, assistance_type, assistance_level, 
                request_id, question_text, question_family, generated_content,
                model_provider, model_version, generated_at)
               VALUES ($1, $2, $3, 'hint', $4, $5, $6, $7, $8, $9, $10, now())
               ON CONFLICT (session_id, turn_number, assistance_type, assistance_level) DO UPDATE SET generated_content = EXCLUDED.generated_content
               RETURNING id, generated_content, question_family, assistance_level, viewed_at""",
            session_id, str(user.id), turn_number, req.level, req.client_request_id,
            req.question_text, family, result["content"],
            result.get("model_provider", ""), result.get("model_version", ""),
        )
        return {
            "event_id": str(row["id"]),
            "content": row["generated_content"] or "",
            "level": row["assistance_level"],
            "turn_number": turn_number,
            "question_family": row["question_family"],
        }

@router.post("/{session_id}/assistance/answer-guidance")
async def request_answer_guidance(
    session_id: str,
    req: AssistanceGuidanceRequest,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)

    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            "SELECT state, resume_summary, total_turns FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id, req.access_token
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or invalid access token.")
        if session["state"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Session is not active.")

        policy = await conn.fetchrow(
            "SELECT enabled, answer_guidance_enabled FROM interview_assistance_policy WHERE session_id = $1",
            session_id
        )
        if not policy or not policy["enabled"] or not policy["answer_guidance_enabled"]:
            raise HTTPException(status_code=403, detail="Answer guidance is not enabled for this session.")

        turn_number = (session["total_turns"] or 0) + 1

        existing = await conn.fetchrow(
            "SELECT id, generated_content, question_family, viewed_at FROM interview_assistance_event WHERE session_id = $1 AND request_id = $2",
            session_id, req.client_request_id
        )
        if existing:
            return {
                "event_id": str(existing["id"]),
                "content": existing["generated_content"] or "",
                "turn_number": turn_number,
                "question_family": existing["question_family"],
            }

        family = classify_question_family(req.question_text)
        
        resume_summary = session["resume_summary"] or "{}"
        role_context = "Interview Candidate"
        candidate_facts = []
        try:
            parsed = json.loads(resume_summary) if isinstance(resume_summary, str) else resume_summary
            if isinstance(parsed, dict):
                candidate_facts = list(parsed.values()) if parsed else []
            elif isinstance(parsed, list):
                candidate_facts = parsed
        except Exception:
            pass

        result = await generate_answer_guidance(req.question_text, family, resume_summary, role_context, candidate_facts)

        row = await conn.fetchrow(
            """INSERT INTO interview_assistance_event 
               (session_id, user_id, turn_number, assistance_type, assistance_level,
                request_id, question_text, question_family, generated_content,
                model_provider, model_version, generated_at)
               VALUES ($1, $2, $3, 'answer_guidance', 1, $4, $5, $6, $7, $8, $9, now())
               ON CONFLICT (session_id, turn_number, assistance_type, assistance_level) DO UPDATE SET generated_content = EXCLUDED.generated_content
               RETURNING id, generated_content, question_family, viewed_at""",
            session_id, str(user.id), turn_number, req.client_request_id,
            req.question_text, family, result["content"],
            result.get("model_provider", ""), result.get("model_version", ""),
        )
        return {
            "event_id": str(row["id"]),
            "content": row["generated_content"] or "",
            "turn_number": turn_number,
            "question_family": row["question_family"],
            "why_it_works": result.get("why_it_works", []),
        }

@router.post("/{session_id}/assistance/{event_id}/viewed")
async def mark_event_viewed(
    session_id: str,
    event_id: str,
    req: AssistanceViewedRequest,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            "SELECT state FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id, req.access_token
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or invalid access token.")
        
        await conn.execute(
            "UPDATE interview_assistance_event SET viewed_at = now() WHERE id = $1 AND session_id = $2 AND viewed_at IS NULL",
            event_id, session_id
        )
        return {"status": "ok"}

@router.get("/{session_id}/assistance/summary")
async def get_assistance_summary(
    session_id: str,
    access_token: str,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            "SELECT id FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id, access_token
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or invalid access token.")
        
        events = await conn.fetch(
            """SELECT turn_number, assistance_type, assistance_level, question_family, viewed_at 
               FROM interview_assistance_event 
               WHERE session_id = $1 
               ORDER BY turn_number, created_at""",
            session_id
        )
        
        summary = {}
        for ev in events:
            turn = ev["turn_number"]
            if turn not in summary:
                summary[turn] = []
            summary[turn].append(dict(ev))
            
        return {"summary": summary}
