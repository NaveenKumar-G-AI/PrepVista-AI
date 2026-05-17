"""
PrepVista - Global Support Chat Plugin (Admin Facing)
Endpoints allowing administrators to query all platform messages and manually send responses.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import structlog

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user

router = APIRouter()
logger = structlog.get_logger("prepvista.admin.support")

class AdminReplyRequest(BaseModel):
    content: str
    attachment_data: str | None = None


@router.get("/users")
async def get_support_users(current_user: UserProfile = Depends(get_current_user)):
    """Fetch all users who have initiated support threads, ordered by the most recent message so admins know who is active."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")

    async with DatabaseConnection() as conn:
        users = await conn.fetch(
            """
            SELECT p.id, p.email, MAX(m.created_at) as last_message_at, 
                   COUNT(m.id) FILTER(WHERE m.sender_role = 'user' AND m.is_read = FALSE) as unread_count
            FROM support_messages m
            JOIN profiles p ON p.id = m.user_id
            WHERE m.is_archived = FALSE
            GROUP BY p.id, p.email
            ORDER BY last_message_at DESC
            """
        )
        return {"users": [dict(u) for u in users]}


@router.get("/{target_user_id}")
async def get_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(get_current_user),
    limit: int = 100
):
    """Retrieve the full context thread for a specific targeted user."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT email FROM profiles WHERE id = $1", target_user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        messages = await conn.fetch(
            """
            SELECT id, sender_role, content, attachment_data, is_read, is_archived, created_at
            FROM support_messages
            WHERE user_id = $1 AND is_archived = FALSE
            ORDER BY created_at ASC
            LIMIT $2
            """,
            target_user_id, limit
        )

        # Mark the user's messages as read by admin
        await conn.execute(
            """
            UPDATE support_messages 
            SET is_read = TRUE 
            WHERE user_id = $1 AND sender_role = 'user' AND is_read = FALSE
            """,
            target_user_id
        )

        return {
            "email": profile["email"],
            "messages": [dict(m) for m in messages]
        }


@router.post("/{target_user_id}")
async def send_admin_reply(
    target_user_id: str,
    payload: AdminReplyRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """Send an official reply directly to the end-user's chat widget."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")

    if not payload.content.strip() and not payload.attachment_data:
        raise HTTPException(status_code=400, detail="Cannot send an entirely empty reply.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT email FROM profiles WHERE id = $1", target_user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        inserted = await conn.fetchrow(
            """
            INSERT INTO support_messages (user_id, sender_role, content, attachment_data, is_read)
            VALUES ($1, 'admin', $2, $3, FALSE)
            RETURNING id, sender_role, content, attachment_data, created_at
            """,
            target_user_id, 
            payload.content.strip(), 
            payload.attachment_data
        )

        logger.info("admin_support_reply_sent", admin=current_user.email, target=target_user_id)

        return {
            "status": "success",
            "message": dict(inserted)
        }


@router.post("/{target_user_id}/archive")
async def archive_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Soft-archive all messages in a user's support thread (non-destructive)."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT email FROM profiles WHERE id = $1", target_user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        result = await conn.execute(
            """
            UPDATE support_messages
            SET is_archived = TRUE
            WHERE user_id = $1 AND is_archived = FALSE
            """,
            target_user_id,
        )

        logger.info("support_thread_archived", admin=current_user.email, target=target_user_id)

        return {
            "status": "success",
            "message": f"Support thread for {profile['email']} has been archived.",
        }


@router.post("/{target_user_id}/unarchive")
async def unarchive_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Restore an archived support thread."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT email FROM profiles WHERE id = $1", target_user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        await conn.execute(
            """
            UPDATE support_messages
            SET is_archived = FALSE
            WHERE user_id = $1 AND is_archived = TRUE
            """,
            target_user_id,
        )

        logger.info("support_thread_unarchived", admin=current_user.email, target=target_user_id)

        return {
            "status": "success",
            "message": f"Support thread for {profile['email']} has been restored.",
        }
