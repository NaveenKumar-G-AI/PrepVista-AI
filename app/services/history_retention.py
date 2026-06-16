"""
PrepVista - History Retention
Caps retained finished interview history by the highest active premium plan.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger("prepvista.history_retention")

HISTORY_LIMITS = {
    "pro": 5,
    "career": 15,
}


def get_history_limit(plan: str | None) -> int | None:
    """Return the retained history limit for the given premium plan."""
    return HISTORY_LIMITS.get(plan or "")


async def enforce_history_retention(conn, user_id: str, highest_active_plan: str | None) -> int:
    """
    Delete the oldest finished sessions beyond the active plan limit.
    Free users are not pruned here because history is already locked for them.
    """
    limit = get_history_limit(highest_active_plan)
    if limit is None:
        return 0

    rows = await conn.fetch(
        """SELECT id
           FROM interview_sessions
           WHERE user_id = $1 AND state = 'FINISHED'
           ORDER BY COALESCE(finished_at, created_at) DESC, created_at DESC
           OFFSET $2""",
        user_id,
        limit,
    )
    if not rows:
        return 0

    session_ids = [row["id"] for row in rows]
    await conn.execute(
        "DELETE FROM interview_sessions WHERE id = ANY($1::uuid[])",
        session_ids,
    )
    logger.info(
        "history_retention_pruned",
        user_id=user_id,
        highest_active_plan=highest_active_plan,
        deleted_count=len(session_ids),
    )
    return len(session_ids)
