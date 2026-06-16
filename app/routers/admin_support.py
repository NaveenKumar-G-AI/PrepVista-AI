"""
PrepVista - Global Support Chat Plugin (Admin Facing)
Endpoints allowing administrators to query all platform messages and manually send responses.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB MIGRATIONS — RUN BEFORE DEPLOYING (use CONCURRENTLY in production)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These indexes directly accelerate the two hot queries in this file.
Without them, every inbox load and every thread fetch performs a full
sequential scan on support_messages — the highest-write table in the
system (every student session writes to it). At 50,000 messages (year 2)
these scans become measurable. At 200,000 (year 3) they are visible.

Run each statement during a low-traffic window with CONCURRENTLY to
avoid locking student-facing writes:

    -- Powers the inbox GROUP BY / COUNT FILTER / MAX aggregation
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_messages_active
        ON support_messages (user_id, is_archived, sender_role, is_read, created_at);

    -- Powers the thread fetch ORDER BY created_at ASC
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_messages_thread
        ON support_messages (user_id, is_archived, created_at ASC);

    -- Powers the bulk read-receipt UPDATE
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_messages_unread
        ON support_messages (user_id, sender_role, is_read)
        WHERE is_read = FALSE;
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import structlog

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
import uuid

router = APIRouter()
logger = structlog.get_logger("prepvista.admin.support")

_MAX_REPLY_CONTENT_LENGTH: int = 5_000

# Attachment data size cap. attachment_data is expected to be a base64-encoded
# file. 500,000 base64 characters ≈ 375 KB decoded — generous for a support
# attachment (screenshots, small documents). Prevents a 50 MB base64 string
# from being stored in a single support_messages row and later causing the
# student's chat widget to attempt rendering an unbuffered payload.
_MAX_ATTACHMENT_DATA_LENGTH: int = 500_000

# Allowed attachment data prefixes for format enforcement.
# Base64 data URIs must begin with "data:" followed by a recognised MIME type.
# Raw base64 without a data URI prefix is also accepted for backward compat.
_ALLOWED_ATTACHMENT_PREFIXES: tuple[str, ...] = (
    "data:image/",
    "data:application/pdf",
    "data:text/",
)

# Inbox page size. Smaller than the old fixed cap (200) to allow cursor
# pagination to work efficiently. Admins page through cohorts of 50 at a time.
_SUPPORT_USERS_PAGE_SIZE: int = 50


def require_admin(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """
    FastAPI dependency that enforces admin-only access.
    Centralised here so a future auth change touches one function, not five.
    """
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required.")
    return current_user


class AdminReplyRequest(BaseModel):
    content: str
    attachment_data: str | None = None


@router.get("/users")
async def get_support_users(
    current_user: UserProfile = Depends(require_admin),
    before: str | None = Query(
        default=None,
        description=(
            "Cursor for pagination. Pass the `next_cursor` value from the previous "
            "response to fetch the next page of support users. Omit for the first page."
        ),
    ),
):
    """
    Fetch users who have active support threads, ordered by most-recent message.

    Returns up to 50 users per page. If `next_cursor` is present in the response,
    pass it as `?before=<next_cursor>` to retrieve the following page.

    Cursor-based pagination replaces the old fixed LIMIT 200 cap. Colleges with
    large cohorts (1,000+ students) can now page through all active threads
    without a single unbounded aggregation query, and each page cost is O(50)
    regardless of total thread count.
    """
    async with DatabaseConnection() as conn:
        if before:
            users = await conn.fetch(
                """
                SELECT p.id, p.email,
                       MAX(m.created_at) AS last_message_at,
                       COUNT(m.id) FILTER (WHERE m.sender_role = 'user' AND m.is_read = FALSE)
                           AS unread_count
                FROM support_messages m
                JOIN profiles p ON p.id = m.user_id
                WHERE m.is_archived = FALSE
                GROUP BY p.id, p.email
                HAVING MAX(m.created_at) < $1::timestamptz
                ORDER BY last_message_at DESC
                LIMIT $2
                """,
                before,
                _SUPPORT_USERS_PAGE_SIZE,
            )
        else:
            users = await conn.fetch(
                """
                SELECT p.id, p.email,
                       MAX(m.created_at) AS last_message_at,
                       COUNT(m.id) FILTER (WHERE m.sender_role = 'user' AND m.is_read = FALSE)
                           AS unread_count
                FROM support_messages m
                JOIN profiles p ON p.id = m.user_id
                WHERE m.is_archived = FALSE
                GROUP BY p.id, p.email
                ORDER BY last_message_at DESC
                LIMIT $1
                """,
                _SUPPORT_USERS_PAGE_SIZE,
            )

    user_list = [dict(u) for u in users]

    # Emit next_cursor when the page is full — there may be more results.
    # When the page is partial (< page size), we are on the last page.
    next_cursor: str | None = None
    if len(user_list) == _SUPPORT_USERS_PAGE_SIZE:
        # Use the last item's last_message_at as the cursor for the next page.
        last_ts = user_list[-1].get("last_message_at")
        next_cursor = str(last_ts) if last_ts else None

    return {
        "users": user_list,
        "next_cursor": next_cursor,
        "page_size": _SUPPORT_USERS_PAGE_SIZE,
    }


@router.get("/{target_user_id}")
async def get_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(require_admin),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Retrieve the full context thread for a specific targeted user."""
    try:
        uuid.UUID(target_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT email FROM profiles WHERE id = $1", target_user_id
        )
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        # ── Atomic read-receipt: fetch + mark-read in one transaction ─────────
        async with conn.transaction():
            messages = await conn.fetch(
                """
                SELECT id, sender_role, content, attachment_data,
                       is_read, is_archived, created_at
                FROM support_messages
                WHERE user_id = $1 AND is_archived = FALSE
                ORDER BY created_at ASC
                LIMIT $2
                """,
                target_user_id,
                limit,
            )
            await conn.execute(
                """
                UPDATE support_messages
                SET is_read = TRUE
                WHERE user_id = $1 AND sender_role = 'user' AND is_read = FALSE
                """,
                target_user_id,
            )

        return {
            "email": profile["email"],
            "messages": [dict(m) for m in messages],
        }


@router.post("/{target_user_id}")
async def send_admin_reply(
    target_user_id: str,
    payload: AdminReplyRequest,
    current_user: UserProfile = Depends(require_admin),
):
    """Send an official reply directly to the end-user's chat widget."""
    try:
        uuid.UUID(target_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")

    if not payload.content.strip() and not payload.attachment_data:
        raise HTTPException(status_code=400, detail="Cannot send an entirely empty reply.")

    if len(payload.content) > _MAX_REPLY_CONTENT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Reply content exceeds maximum allowed length of {_MAX_REPLY_CONTENT_LENGTH} characters.",
        )

    # ── Attachment validation: size + format ──────────────────────────────────
    # Without these guards, an admin can store a 50 MB base64 string in a single
    # support_messages row. The student's chat widget then attempts to render it —
    # potentially crashing the widget on low-memory mobile devices.
    # Format enforcement ensures attachment_data is a recognised data URI,
    # preventing arbitrary text or binary blobs being passed off as attachments.
    if payload.attachment_data is not None:
        if len(payload.attachment_data) > _MAX_ATTACHMENT_DATA_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Attachment data exceeds maximum allowed size of "
                    f"{_MAX_ATTACHMENT_DATA_LENGTH // 1000} KB."
                ),
            )
        # Format check: must be a data URI with an allowed MIME type prefix,
        # OR raw base64 (no "data:" prefix) for backward compatibility.
        if payload.attachment_data.startswith("data:"):
            if not any(
                payload.attachment_data.startswith(prefix)
                for prefix in _ALLOWED_ATTACHMENT_PREFIXES
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Unsupported attachment type. Allowed types: "
                        "images, PDF, and plain text."
                    ),
                )

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT email FROM profiles WHERE id = $1", target_user_id
        )
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
            payload.attachment_data,
        )

        logger.info(
            "admin_support_reply_sent",
            admin_email=current_user.email,
            target_user_id=target_user_id,
            target_email=profile["email"],
            content_length=len(payload.content.strip()),
            has_attachment=bool(payload.attachment_data),
        )

        return {
            "status": "success",
            "message": dict(inserted),
        }


@router.post("/{target_user_id}/archive")
async def archive_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(require_admin),
):
    """Soft-archive all messages in a user's support thread (non-destructive)."""
    try:
        uuid.UUID(target_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT email FROM profiles WHERE id = $1", target_user_id
        )
        if not profile:
            raise HTTPException(status_code=404, detail="User target not found.")

        logger.info(
            "support_thread_archive_initiated",
            admin_email=current_user.email,
            target_user_id=target_user_id,
            target_email=profile["email"],
        )

        result = await conn.execute(
            """
            UPDATE support_messages
            SET is_archived = TRUE
            WHERE user_id = $1 AND is_archived = FALSE
            """,
            target_user_id,
        )

        try:
            messages_archived = int(result.split()[-1])
        except (AttributeError, ValueError, IndexError):
            messages_archived = None

        logger.info(
            "support_thread_archived",
            admin_email=current_user.email,
            target_user_id=target_user_id,
            target_email=profile["email"],
            messages_archived=messages_archived,
        )

        return {
            "status": "success",
            "messages_archived": messages_archived,
            "message": f"Support thread for {profile['email']} has been archived.",
        }


@router.post("/{target_user_id}/unarchive")
async def unarchive_user_thread(
    target_user_id: str,
    current_user: UserProfile = Depends(require_admin),
):
    """Restore an archived support thread."""
    try:
        uuid.UUID(target_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT email FROM profiles WHERE id = $1", target_user_id
        )
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

        logger.info(
            "support_thread_unarchived",
            admin_email=current_user.email,
            target_user_id=target_user_id,
            target_email=profile["email"],
        )

        return {
            "status": "success",
            "message": f"Support thread for {profile['email']} has been restored.",
        }
