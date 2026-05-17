"""
PrepVista AI - Feedback Router
Collect user feedback and expose user/admin views.
"""

import json

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.middleware.rate_limiter import rate_limit_user

router = APIRouter()
logger = structlog.get_logger("prepvista.feedback")

MAX_FEEDBACK_LENGTH = 2000


class FeedbackCreateRequest(BaseModel):
    feedback_text: str

    @field_validator("feedback_text", mode="before")
    @classmethod
    def _strip_feedback(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


@router.get("")
async def get_feedback_entries(user: UserProfile = Depends(get_current_user)):
    """Return feedback entries for the current user, or all entries for admin."""
    async with DatabaseConnection() as conn:
        if user.is_admin:
            rows = await conn.fetch(
                """SELECT id, email, full_name, feedback_text, created_at
                   FROM feedback_entries
                   ORDER BY created_at DESC
                   LIMIT 200"""
            )
            mode = "admin"
        else:
            rows = await conn.fetch(
                """SELECT id, email, full_name, feedback_text, created_at
                   FROM feedback_entries
                   WHERE user_id = $1
                   ORDER BY created_at DESC
                   LIMIT 50""",
                user.id,
            )
            mode = "self"

    return {
        "mode": mode,
        "items": [
            {
                "id": int(row["id"]),
                "email": row["email"],
                "full_name": row["full_name"],
                "feedback_text": row["feedback_text"],
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ],
    }


@router.post("")
async def submit_feedback(
    req: FeedbackCreateRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Store a feedback entry for the current user."""
    await rate_limit_user(user.id)

    feedback_text = (req.feedback_text or "").strip()
    if not feedback_text:
        raise HTTPException(status_code=400, detail="Feedback cannot be empty.")
    if len(feedback_text) > MAX_FEEDBACK_LENGTH:
        feedback_text = feedback_text[:MAX_FEEDBACK_LENGTH].strip()

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT full_name FROM profiles WHERE id = $1",
            user.id,
        )
        full_name = profile["full_name"] if profile else None

        inserted = await conn.fetchrow(
            """INSERT INTO feedback_entries (user_id, email, full_name, feedback_text)
               VALUES ($1, $2, $3, $4)
               RETURNING id, email, full_name, feedback_text, created_at""",
            user.id,
            user.email,
            full_name,
            feedback_text,
        )

        await conn.execute(
            """INSERT INTO usage_events (user_id, event_type, metadata)
               VALUES ($1, 'feedback_submitted', $2)""",
            user.id,
            json.dumps({"feedback_id": int(inserted["id"])}),
        )

    logger.info("feedback_submitted", user_id=user.id, feedback_id=int(inserted["id"]))

    return {
        "status": "submitted",
        "item": {
            "id": int(inserted["id"]),
            "email": inserted["email"],
            "full_name": inserted["full_name"],
            "feedback_text": inserted["feedback_text"],
            "created_at": str(inserted["created_at"]),
        },
    }
