"""
PrepVista - Global Support Chat Plugin (User Facing)
Endpoints allowing end-users to persist their conversations and query admin responses directly.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, root_validator
import structlog

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user

router = APIRouter()
logger = structlog.get_logger("prepvista.support")


class SupportMessageRequest(BaseModel):
    content: str
    attachment_data: str | None = None

    @root_validator(pre=True)
    def check_empty(cls, values):
        content = values.get('content', '').strip()
        attachment = values.get('attachment_data')
        if not content and not attachment:
            raise ValueError("Message must contain either text content or an image attachment.")
        return values


@router.get("/me")
async def get_my_chat_history(
    current_user: UserProfile = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    """Fetch the thread history for the active user."""
    async with DatabaseConnection() as conn:
        messages = await conn.fetch(
            """
            SELECT id, sender_role, content, attachment_data, is_read, created_at
            FROM support_messages
            WHERE user_id = $1 AND is_archived = FALSE
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
            """,
            current_user.id,
            limit,
            offset
        )

        # Mark any unread admin messages as read now that the user explicitly checked them
        await conn.execute(
            """
            UPDATE support_messages 
            SET is_read = TRUE 
            WHERE user_id = $1 AND sender_role = 'admin' AND is_read = FALSE
            """,
            current_user.id
        )

        return {
            "messages": [dict(m) for m in messages]
        }


@router.post("/me")
async def send_support_message(
    payload: SupportMessageRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """Allow a user to send a new message optionally containing Base64 image data to the Admin."""
    async with DatabaseConnection() as conn:
        inserted = await conn.fetchrow(
            """
            INSERT INTO support_messages (user_id, sender_role, content, attachment_data)
            VALUES ($1, 'user', $2, $3)
            RETURNING id, sender_role, content, attachment_data, created_at
            """,
            current_user.id,
            payload.content.strip(),
            payload.attachment_data
        )

        logger.info("support_message_received", user_id=current_user.id, has_attachment=bool(payload.attachment_data))
        
        return {
            "status": "success",
            "message": dict(inserted)
        }
