"""
PrepVista - Non-destructive history access.
Plan limits cap visibility; all sessions and their dependent records stay stored.
"""

from __future__ import annotations

from fastapi import HTTPException

HISTORY_LIMITS = {
    "free": 1,  # Current feedback remains accessible; history listing is locked.
    "pro": 5,
    "career": 15,
}


def get_history_limit(plan: str | None) -> int | None:
    """Return the visible finished-session window, failing closed for unknown plans."""
    return HISTORY_LIMITS.get(plan or "", HISTORY_LIMITS["free"])


# Shared by dashboard previews, pagination and direct report access. UUID is the
# final tie-breaker so equally timed sessions cannot move across the boundary.
VISIBLE_FINISHED_HISTORY_SQL = """SELECT * FROM interview_sessions
    WHERE user_id = $1 AND state = 'FINISHED'
    ORDER BY COALESCE(finished_at, created_at) DESC NULLS LAST,
             created_at DESC NULLS LAST, id DESC
    LIMIT $2"""


def get_visible_history_limit(user) -> int | None:
    return None if user.premium_override else get_history_limit(user.effective_plan)


async def require_history_access(conn, user, session_id: str) -> None:
    """Call only after checking ownership; hidden owner history receives a lock."""
    visible = await conn.fetchval(
        f"""SELECT EXISTS (SELECT 1 FROM ({VISIBLE_FINISHED_HISTORY_SQL}) visible
                           WHERE id = $3::uuid)""",
        user.id,
        get_visible_history_limit(user),
        session_id,
    )
    if not visible:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "session_history_locked",
                "message": "This report is outside your current plan's history window.",
                "lock_reason": "history_limit",
                "upgrade_url": "/pricing",
            },
        )


async def enforce_history_retention(conn, user_id: str, highest_active_plan: str | None) -> int:
    """Compatibility no-op: stale callers must never physically prune history."""
    return 0
