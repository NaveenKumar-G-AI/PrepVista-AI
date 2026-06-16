"""
PrepVista - Live user activity tracking
Keeps a small database snapshot of total, active, and inactive users.
"""

from __future__ import annotations

import structlog

from app.services.public_growth import refresh_public_growth_metrics

logger = structlog.get_logger("prepvista.user_activity")

LIVE_USER_WINDOW_MINUTES = 10
PRESENCE_UPDATE_THROTTLE_SECONDS = 60


async def refresh_user_activity_stats(conn) -> dict:
    """Recompute and persist live user counts."""
    row = await conn.fetchrow(
        """
        WITH totals AS (
            SELECT
                COUNT(*)::INT AS total_users_count,
                COUNT(*) FILTER (
                    WHERE last_seen_at IS NOT NULL
                      AND last_seen_at >= NOW() - ($1 * INTERVAL '1 minute')
                )::INT AS active_users_count
            FROM profiles
        ),
        upserted AS (
            INSERT INTO user_activity_stats (
                id,
                active_users_count,
                inactive_users_count,
                total_users_count,
                live_window_minutes,
                updated_at
            )
            SELECT
                1,
                active_users_count,
                GREATEST(total_users_count - active_users_count, 0),
                total_users_count,
                $1,
                NOW()
            FROM totals
            ON CONFLICT (id) DO UPDATE
            SET active_users_count = EXCLUDED.active_users_count,
                inactive_users_count = EXCLUDED.inactive_users_count,
                total_users_count = EXCLUDED.total_users_count,
                live_window_minutes = EXCLUDED.live_window_minutes,
                updated_at = NOW()
            RETURNING active_users_count, inactive_users_count, total_users_count, live_window_minutes, updated_at
        )
        SELECT *
        FROM upserted
        """,
        LIVE_USER_WINDOW_MINUTES,
    )

    result = dict(row) if row else {
        "active_users_count": 0,
        "inactive_users_count": 0,
        "total_users_count": 0,
        "live_window_minutes": LIVE_USER_WINDOW_MINUTES,
        "updated_at": None,
    }
    logger.debug(
        "user_activity_stats_refreshed",
        active_users=result["active_users_count"],
        inactive_users=result["inactive_users_count"],
        total_users=result["total_users_count"],
        live_window_minutes=result["live_window_minutes"],
    )
    try:
        await refresh_public_growth_metrics(conn)
    except Exception as exc:
        logger.warning("public_growth_refresh_failed", error=str(exc))
    return result


async def record_user_presence(conn, user_id: str) -> bool:
    """Touch the user's last_seen timestamp with throttling to avoid noisy writes."""
    row = await conn.fetchrow(
        """
        UPDATE profiles
        SET last_seen_at = NOW()
        WHERE id = $1
          AND (
              last_seen_at IS NULL
              OR last_seen_at < NOW() - ($2 * INTERVAL '1 second')
          )
        RETURNING id
        """,
        user_id,
        PRESENCE_UPDATE_THROTTLE_SECONDS,
    )

    if not row:
        return False

    return True
