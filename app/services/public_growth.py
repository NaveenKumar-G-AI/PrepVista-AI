"""
PrepVista - Public growth metrics
Keeps public-facing login/dashboard counters separate from internal analytics tables.
"""

from __future__ import annotations

from app.config import get_settings
from app.services.launch_offer import (
    LAUNCH_OFFER_CONSUMED_STATUSES,
    LAUNCH_OFFER_WINDOW_DAYS,
    TOTAL_LAUNCH_OFFER_SLOTS,
)

PUBLIC_COUNT_THRESHOLD = 10


def _display_label(value: int) -> str:
    count = max(0, int(value or 0))
    return "10+" if count >= PUBLIC_COUNT_THRESHOLD else str(count)


def _candidate_noun(value: int) -> str:
    return "candidate" if int(value or 0) == 1 else "candidates"


async def refresh_public_growth_metrics(conn) -> dict:
    """Recompute and persist public-facing total and active user counts."""
    settings = get_settings()
    admin_email = (settings.ADMIN_EMAIL or "").strip().lower()

    row = await conn.fetchrow(
        """
        WITH totals AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE COALESCE(is_admin, FALSE) = FALSE
                      AND ($1 = '' OR LOWER(COALESCE(email, '')) <> $1)
                )::INT AS total_users_count,
                COUNT(*) FILTER (
                    WHERE COALESCE(is_admin, FALSE) = FALSE
                      AND ($1 = '' OR LOWER(COALESCE(email, '')) <> $1)
                      AND last_seen_at IS NOT NULL
                      AND last_seen_at >= NOW() - INTERVAL '10 minutes'
                )::INT AS active_users_count
            FROM profiles
        ),
        upserted AS (
            INSERT INTO public_growth_metrics (
                id,
                total_users_count,
                active_users_count,
                updated_at
            )
            SELECT
                1,
                total_users_count,
                active_users_count,
                NOW()
            FROM totals
            ON CONFLICT (id) DO UPDATE
            SET total_users_count = EXCLUDED.total_users_count,
                active_users_count = EXCLUDED.active_users_count,
                updated_at = NOW()
            RETURNING total_users_count, active_users_count, updated_at
        )
        SELECT *
        FROM upserted
        """,
        admin_email,
    )

    total_users = int(row["total_users_count"]) if row else 0
    active_users = int(row["active_users_count"]) if row else 0
    launch_settings = await conn.fetchrow(
        """SELECT max_approved_slots
           FROM launch_offer_settings
           WHERE id = 1"""
    )
    max_slots = int(launch_settings["max_approved_slots"]) if launch_settings else TOTAL_LAUNCH_OFFER_SLOTS
    consumed_slots = await conn.fetchval(
        """SELECT COUNT(*)
           FROM launch_offer_grants
           WHERE status = ANY($1::text[])""",
        list(LAUNCH_OFFER_CONSUMED_STATUSES),
    )
    consumed_slots = int(consumed_slots or 0)
    remaining_slots = max(0, max_slots - consumed_slots)

    return {
        "total_users_count": total_users,
        "active_users_count": active_users,
        "total_users_label": _display_label(total_users),
        "active_users_label": _display_label(active_users),
        "login_message": (
            f"Join {_display_label(total_users)} {_candidate_noun(total_users)} already preparing with PrepVista for today's competitive placements. What about you?"
        ),
        "dashboard_message": (
            f"{_display_label(active_users)} {_candidate_noun(active_users)} are actively practicing right now to land their dream job. Your competition is high. What will you do: prepare or give excuses?"
        ),
        "launch_offer": {
            "max_slots": max_slots,
            "consumed_slots": consumed_slots,
            "remaining_slots": remaining_slots,
            "offer_duration_days": LAUNCH_OFFER_WINDOW_DAYS,
            "is_offer_available": remaining_slots > 0,
        },
        "updated_at": str(row["updated_at"]) if row and row["updated_at"] else None,
    }


async def get_public_growth_metrics(conn) -> dict:
    """Return the latest public-facing growth metrics, refreshing them first."""
    return await refresh_public_growth_metrics(conn)
