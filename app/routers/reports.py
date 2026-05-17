"""
PrepVista AI — Reports Router
Retrieve interview reports and download PDFs.
"""

import json
import secrets
from datetime import datetime
import structlog
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response

from app.dependencies import get_current_user, require_plan, UserProfile
from app.config import PLAN_CONFIG
from app.database.connection import DatabaseConnection
from app.services.evaluator import (
    build_career_readiness_summary,
    build_pro_readiness_summary,
    get_score_interpretation,
)
from app.services.interview_summary import compute_interview_summary

router = APIRouter()
logger = structlog.get_logger("prepvista.reports")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _is_latest_finished_session(conn, user_id: str, session_id: str) -> bool:
    latest_finished_session_id = await conn.fetchval(
        """SELECT id
           FROM interview_sessions
           WHERE user_id = $1
             AND state = 'FINISHED'
           ORDER BY COALESCE(finished_at, created_at) DESC
           LIMIT 1""",
        user_id,
    )
    return bool(latest_finished_session_id and str(latest_finished_session_id) == str(session_id))


def _build_pdf_filename(session_id: str, plan: str | None) -> str:
    """Build a clean, human-readable PDF filename."""
    plan_label = str(plan or "interview").strip().title()
    date_stamp = datetime.utcnow().strftime("%Y%m%d")
    short_id = str(session_id)[:8]
    return f"PrepVista_{plan_label}_Report_{short_id}_{date_stamp}.pdf"


def _safe_pdf_response_headers(filename: str, byte_length: int) -> dict:
    """Return hardened HTTP headers for a PDF download response."""
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Length": str(byte_length),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
    }


def _is_valid_pdf(data: bytes) -> bool:
    """Return True if *data* looks like a real PDF output."""
    return bool(data) and len(data) >= 100 and data[:5] == b"%PDF-"


# ---------------------------------------------------------------------------
# GET /{session_id}  — full report data (JSON)
# ---------------------------------------------------------------------------

@router.get("/{session_id}")
async def get_report(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Get the full interview report for a session."""
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, user_id, plan, final_score, rubric_scores,
                      strengths, weaknesses, total_turns, duration_actual_seconds,
                      state, created_at, finished_at, proctoring_mode, proctoring_violations,
                      resume_summary, question_plan, runtime_state
               FROM interview_sessions
               WHERE id = $1 AND user_id = $2""",
            session_id, user.id,
        )

        if not session:
            raise HTTPException(status_code=404, detail="Report not found.")

        if session["state"] != "FINISHED":
            raise HTTPException(status_code=400, detail="Interview not yet completed.")

        if not user.premium_override and user.effective_plan == "free":
            is_current_feedback = await _is_latest_finished_session(conn, user.id, session_id)
            if not is_current_feedback:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "session_history_locked",
                        "message": "Session history is available on Pro",
                        "required": "pro",
                        "upgrade_url": "/pricing",
                    },
                )

        session_data = dict(session)

        # Fetch per-question evaluations
        eval_rows = await conn.fetch(
            """SELECT turn_number, rubric_category, question_text, raw_answer,
                      normalized_answer, classification, score, scoring_rationale,
                      missing_elements, ideal_answer, communication_score, communication_notes,
                      relevance_score, clarity_score, specificity_score, structure_score,
                      answer_status, content_understanding, depth_quality, communication_clarity,
                      what_worked, what_was_missing, how_to_improve, answer_blueprint, corrected_intent,
                      answer_duration_seconds
               FROM question_evaluations
               WHERE session_id = $1
               ORDER BY turn_number""",
            session_id,
        )

    plan = session_data["plan"]
    # Use effective_plan to respect admin override
    effective_cfg = PLAN_CONFIG.get(user.effective_plan, PLAN_CONFIG["free"])
    has_premium_access = effective_cfg["has_ideal_answers"]
    has_free_guidance = plan == "free"
    expose_guidance = has_premium_access or has_free_guidance
    score = float(session_data["final_score"]) if session_data["final_score"] else 0

    # Build per-question data with plan-based gating
    evaluations = []
    for row in eval_rows:
        q = {
            "turn_number": row["turn_number"],
            "rubric_category": row["rubric_category"],
            "question_text": row["question_text"],
            "raw_answer": row["raw_answer"] or "",
            "normalized_answer": row["normalized_answer"] or row["raw_answer"] or "",
            "classification": row["classification"],
            "score": float(row["score"]),
            "scoring_rationale": row["scoring_rationale"] if expose_guidance else None,
            "missing_elements": (row["missing_elements"] or []) if expose_guidance else [],
            "ideal_answer": row["ideal_answer"] if expose_guidance else None,
            "communication_score": float(row["communication_score"]) if row["communication_score"] and expose_guidance else 0,
            "communication_notes": row["communication_notes"] if expose_guidance else None,
            "relevance_score": float(row["relevance_score"]) if row["relevance_score"] is not None and expose_guidance else 0,
            "clarity_score": float(row["clarity_score"]) if row["clarity_score"] is not None and expose_guidance else 0,
            "specificity_score": float(row["specificity_score"]) if row["specificity_score"] is not None and expose_guidance else 0,
            "structure_score": float(row["structure_score"]) if row["structure_score"] is not None and expose_guidance else 0,
            "answer_status": row["answer_status"] if expose_guidance else None,
            "content_understanding": row["content_understanding"] if expose_guidance else None,
            "depth_quality": row["depth_quality"] if expose_guidance else None,
            "communication_clarity": row["communication_clarity"] if expose_guidance else None,
            "what_worked": row["what_worked"] if expose_guidance else None,
            "what_was_missing": row["what_was_missing"] if expose_guidance else None,
            "how_to_improve": row["how_to_improve"] if expose_guidance else None,
            "answer_blueprint": row["answer_blueprint"] if expose_guidance else None,
            "corrected_intent": row["corrected_intent"] if expose_guidance else None,
            "answer_duration_seconds": row["answer_duration_seconds"],
        }
        evaluations.append(q)

    rubric_scores = json.loads(session_data["rubric_scores"]) if session_data["rubric_scores"] else {}
    violations = json.loads(session_data["proctoring_violations"]) if session_data["proctoring_violations"] else []

    summary = compute_interview_summary(
        plan=plan,
        question_plan=session_data["question_plan"],
        total_turns=int(session_data["total_turns"] or 0),
        evaluations=evaluations,
        duration_seconds=session_data["duration_actual_seconds"],
        runtime_state=session_data.get("runtime_state"),
    )
    expected_questions = summary["planned_questions"]
    answered_questions = summary["answered_questions"]
    average_answer_time_seconds = summary["average_response_seconds"]

    career_summary = (
        build_career_readiness_summary(
            evaluations,
            session_data["resume_summary"],
            expected_questions=expected_questions,
        )
        if plan == "career" and has_premium_access
        else None
    )
    pro_summary = (
        build_pro_readiness_summary(evaluations, expected_questions=expected_questions)
        if plan == "pro" and has_premium_access
        else None
    )

    interpretation = get_score_interpretation(int(score), plan)
    if expected_questions and summary["closed_questions"] < expected_questions:
        interpretation = (
            f"{interpretation} This report reflects {summary['closed_questions']} of "
            f"{expected_questions} planned questions completed."
        )

    return {
        "session": {
            "id": session_id,
            "plan": plan,
            "final_score": score,
            "total_turns": session_data["total_turns"],
            "expected_questions": expected_questions,
            "answered_questions": answered_questions,
            "closed_questions": summary["closed_questions"],
            "strengths": session_data["strengths"] or [],
            "weaknesses": session_data["weaknesses"] or [],
            "rubric_scores": rubric_scores if effective_cfg["has_rubric_breakdown"] else {},
            "created_at": str(session_data["created_at"]),
            "finished_at": str(session_data["finished_at"]) if session_data["finished_at"] else None,
            "duration_seconds": session_data["duration_actual_seconds"],
            "average_answer_time_seconds": average_answer_time_seconds,
            "summary": summary,
        },
        "evaluations": evaluations,
        "user_plan": user.plan,
        "has_premium_access": has_premium_access,
        "premium_lock_reason": (
            user.premium_lock_message("ideal answers, rubric breakdown, and PDF reports")
            if not has_premium_access
            else None
        ),
        "interpretation": interpretation,
        "total_questions": summary["closed_questions"],
        "expected_questions": expected_questions,
        "answered_questions": answered_questions,
        "duration_seconds": session_data["duration_actual_seconds"],
        "average_answer_time_seconds": average_answer_time_seconds,
        "summary": summary,
        "proctoring_mode": session_data["proctoring_mode"],
        "proctoring_violations_count": len(violations),
        "has_pdf": effective_cfg["has_pdf_report"],
        "has_free_guidance": has_free_guidance,
        "pro_summary": pro_summary,
        "career_summary": career_summary,
    }


# ---------------------------------------------------------------------------
# GET /{session_id}/pdf  — download PDF (Pro / Career only)
# ---------------------------------------------------------------------------

@router.get("/{session_id}/pdf")
async def download_pdf(
    session_id: str,
    user: UserProfile = Depends(require_plan("pro")),
):
    """Download the interview report as a PDF. Pro/Career only."""
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, user_id, plan, final_score, rubric_scores,
                      strengths, weaknesses, total_turns,
                      duration_actual_seconds, created_at, finished_at,
                      resume_summary, question_plan, runtime_state
               FROM interview_sessions
               WHERE id = $1 AND user_id = $2 AND state = 'FINISHED'""",
            session_id, user.id,
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Report not found or interview not completed.",
            )

        eval_rows = await conn.fetch(
            """SELECT turn_number, rubric_category, question_text, raw_answer,
                      normalized_answer, classification, score, scoring_rationale,
                      missing_elements, ideal_answer, communication_notes,
                      relevance_score, clarity_score, specificity_score, structure_score,
                      answer_status, content_understanding, depth_quality, communication_clarity,
                      what_worked, what_was_missing, how_to_improve, answer_blueprint, corrected_intent,
                      communication_score, answer_duration_seconds
               FROM question_evaluations
               WHERE session_id = $1
               ORDER BY turn_number""",
            session_id,
        )

    # Build PDF payload
    from app.services.report_builder import generate_pdf_report

    session_payload = dict(session)
    eval_dicts = [dict(r) for r in eval_rows]

    summary = compute_interview_summary(
        plan=str(session_payload.get("plan") or "free"),
        question_plan=session_payload.get("question_plan"),
        total_turns=int(session_payload.get("total_turns") or 0),
        evaluations=eval_dicts,
        duration_seconds=session_payload.get("duration_actual_seconds"),
        runtime_state=session_payload.get("runtime_state"),
    )
    expected_questions = summary["planned_questions"]

    # Inject plan-specific coaching summaries into the session payload
    if session_payload.get("plan") == "pro":
        session_payload["pro_summary"] = build_pro_readiness_summary(
            eval_dicts,
            expected_questions=expected_questions,
        )
    if session_payload.get("plan") == "career":
        session_payload["career_summary"] = build_career_readiness_summary(
            eval_dicts,
            session_payload.get("resume_summary"),
            expected_questions=expected_questions,
        )

    try:
        pdf_bytes = await generate_pdf_report(
            session=session_payload,
            evaluations=eval_dicts,
            user_email=user.email,
            session_summary=summary,
        )
    except Exception as exc:
        logger.error(
            "pdf_generation_failed",
            session_id=session_id,
            user_id=user.id,
            plan=session_payload.get("plan"),
            error=str(exc),
        )
        raise HTTPException(
            status_code=500,
            detail="PDF generation failed. Please try again.",
        ) from exc

    if not _is_valid_pdf(pdf_bytes):
        logger.error(
            "pdf_generation_invalid_output",
            session_id=session_id,
            user_id=user.id,
            output_size=len(pdf_bytes or b""),
        )
        raise HTTPException(
            status_code=500,
            detail="PDF generation failed. Please try again.",
        )

    logger.info("pdf_downloaded", session_id=session_id, user_id=user.id, size_bytes=len(pdf_bytes))

    # Record usage event
    async with DatabaseConnection() as conn:
        await conn.execute(
            "INSERT INTO usage_events (user_id, event_type, metadata) VALUES ($1, 'report_downloaded', $2)",
            user.id, json.dumps({"session_id": session_id}),
        )

    filename = _build_pdf_filename(session_id, session_payload.get("plan"))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=_safe_pdf_response_headers(filename, len(pdf_bytes)),
    )


# ---------------------------------------------------------------------------
# POST /{session_id}/share  — create shareable link
# ---------------------------------------------------------------------------

@router.post("/{session_id}/share")
async def create_share_link(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Create a shareable link for a finished interview report. Pro/Career only."""
    from app.config import get_settings  # noqa: avoid circular at module level
    settings = get_settings()

    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT share_token, state, plan FROM interview_sessions
               WHERE id = $1 AND user_id = $2""",
            session_id, user.id,
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
        if session["state"] != "FINISHED":
            raise HTTPException(status_code=400, detail="Only finished interviews can be shared.")

        # Return existing token if already shared
        if session["share_token"]:
            share_url = f"{settings.FRONTEND_URL or 'https://prepvista.in'}/report/shared/{session['share_token']}"
            return {"share_token": session["share_token"], "share_url": share_url}

        # Generate new token
        token = secrets.token_urlsafe(24)
        await conn.execute(
            "UPDATE interview_sessions SET share_token = $1 WHERE id = $2",
            token, session_id,
        )

    share_url = f"{settings.FRONTEND_URL or 'https://prepvista.in'}/report/shared/{token}"
    logger.info("report_shared", session_id=session_id, user_id=user.id)
    return {"share_token": token, "share_url": share_url}


# ---------------------------------------------------------------------------
# GET /shared/{share_token}  — public read-only view
# ---------------------------------------------------------------------------

@router.get("/shared/{share_token}")
async def get_shared_report(share_token: str):
    """Public endpoint — returns limited report data without auth."""
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, plan, final_score, rubric_scores, strengths, weaknesses,
                      total_turns, duration_actual_seconds, created_at, finished_at,
                      question_plan, runtime_state
               FROM interview_sessions
               WHERE share_token = $1 AND state = 'FINISHED'""",
            share_token,
        )
        if not session:
            raise HTTPException(status_code=404, detail="Shared report not found or link expired.")

        eval_rows = await conn.fetch(
            """SELECT turn_number, rubric_category, question_text,
                      classification, score, answer_status
               FROM question_evaluations
               WHERE session_id = $1
               ORDER BY turn_number""",
            str(session["id"]),
        )

    rubric_scores = json.loads(session["rubric_scores"]) if session["rubric_scores"] else {}
    score = float(session["final_score"]) if session["final_score"] else 0

    # Limited per-question data — no answers, no ideal answers
    evaluations_limited = [
        {
            "turn_number": row["turn_number"],
            "rubric_category": row["rubric_category"],
            "question_text": row["question_text"],
            "classification": row["classification"],
            "score": float(row["score"]),
        }
        for row in eval_rows
    ]

    summary = compute_interview_summary(
        plan=str(session["plan"]),
        question_plan=session["question_plan"],
        total_turns=int(session["total_turns"] or 0),
        evaluations=[dict(r) for r in eval_rows],
        duration_seconds=session["duration_actual_seconds"],
        runtime_state=session.get("runtime_state"),
    )

    return {
        "session": {
            "plan": session["plan"],
            "final_score": score,
            "strengths": session["strengths"] or [],
            "weaknesses": session["weaknesses"] or [],
            "rubric_scores": rubric_scores,
            "total_turns": session["total_turns"],
            "completed_at": str(session["finished_at"]) if session["finished_at"] else None,
            "duration_seconds": session["duration_actual_seconds"],
            "summary": summary,
        },
        "evaluations": evaluations_limited,
        "interpretation": get_score_interpretation(int(score), str(session["plan"])),
        "is_shared": True,
    }
