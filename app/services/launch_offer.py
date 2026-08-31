"""
PrepVista - Launch Offer Service
Manages the launch-offer lifecycle: eligibility checks, auto-approval,
state queries for plan_access integration, and admin-driven resets.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

logger = structlog.get_logger("prepvista.launch_offer")

# ── Constants ─────────────────────────────────────────────────────────────────
TOTAL_LAUNCH_OFFER_SLOTS: int = 100
LAUNCH_OFFER_WINDOW_DAYS: int = 7
LAUNCH_OFFER_CONSUMED_STATUSES: tuple[str, ...] = ("approved", "expired")
_FIRST_TEN_THRESHOLD: int = 10


class LaunchOfferConflictError(ValueError):
    """The grant cannot transition from its current state."""


class LaunchOfferCapacityError(RuntimeError):
    """No launch-offer slots remain."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


# ── Public API ────────────────────────────────────────────────────────────────


async def get_launch_offer_state(conn, user_id: str) -> dict:
    """
    Return the full launch-offer state for a user.

    Used by plan_access (to fold offer-granted plans into owned_plans)
    and by the dashboard (to render the offer widget).

    Returns a dict with keys:
        status, plan, slot_number,
        requested_at, approved_at, reviewed_at, expires_at,
        queue_position, overall_position,
        approved_count, max_slots, remaining_slots,
        offer_duration_days, is_offer_available, within_first_ten,
        active_plans, expired_plans, expiry_map
    """
    # Fetch the user's grant row (if any)
    grant = await conn.fetchrow(
        """SELECT id, status, plan, slot_number,
                  requested_at, approved_at, reviewed_at, expires_at
           FROM launch_offer_grants
           WHERE user_id = $1""",
        user_id,
    )

    # Fetch global settings
    settings = await conn.fetchrow(
        """SELECT max_approved_slots
           FROM launch_offer_settings
           WHERE id = 1"""
    )

    max_slots = int(settings["max_approved_slots"]) if settings else TOTAL_LAUNCH_OFFER_SLOTS
    # Compute approved count from grants table (works regardless of schema version)
    approved_count = await conn.fetchval(
        """SELECT COUNT(*) FROM launch_offer_grants
           WHERE status = ANY($1::text[]) AND slot_number IS NOT NULL""",
        list(LAUNCH_OFFER_CONSUMED_STATUSES),
    ) or 0
    remaining_slots = max(0, max_slots - int(approved_count))

    # Determine queue and overall positions
    queue_position: int | None = None
    overall_position: int | None = None
    if grant and grant["status"] == "pending":
        queue_position = await conn.fetchval(
            """SELECT COUNT(*) + 1
               FROM launch_offer_grants
               WHERE status = 'pending'
                 AND requested_at < $1""",
            grant["requested_at"],
        )
    if grant and grant["slot_number"] is not None:
        overall_position = int(grant["slot_number"])

    # Build plan-access integration fields
    now = _utcnow()
    active_plans: list[str] = []
    expired_plans: list[str] = []
    expiry_map: dict[str, datetime | None] = {}

    if grant and grant["plan"]:
        plan = grant["plan"]
        status = grant["status"]
        expires_at = _coerce_dt(grant["expires_at"])

        if status == "approved" and expires_at and expires_at <= now:
            await conn.execute(
                "SELECT set_config('app.slot_assign_active', 'true', true)"
            )
            await conn.execute(
                """UPDATE launch_offer_grants
                   SET status = 'expired', updated_at = NOW()
                   WHERE id = $1 AND status = 'approved'""",
                grant["id"],
            )
            grant = dict(grant)
            grant["status"] = "expired"
            status = "expired"

        if status == "approved" and (not expires_at or expires_at > now):
            active_plans.append(plan)
            expiry_map[plan] = expires_at
        elif status in ("expired",) or (status == "approved" and expires_at and expires_at <= now):
            expired_plans.append(plan)
            expiry_map[plan] = expires_at

    within_first_ten: bool | None = None
    if grant and grant["slot_number"] is not None:
        within_first_ten = int(grant["slot_number"]) <= _FIRST_TEN_THRESHOLD

    return {
        # Per-user grant fields
        "status": grant["status"] if grant else None,
        "plan": grant["plan"] if grant else None,
        "slot_number": int(grant["slot_number"]) if grant and grant["slot_number"] is not None else None,
        "requested_at": grant["requested_at"] if grant else None,
        "approved_at": grant["approved_at"] if grant else None,
        "reviewed_at": grant["reviewed_at"] if grant else None,
        "expires_at": grant["expires_at"] if grant else None,
        "queue_position": queue_position,
        "overall_position": overall_position,
        # Global offer fields
        "approved_count": approved_count,
        "max_slots": max_slots,
        "remaining_slots": remaining_slots,
        "offer_duration_days": LAUNCH_OFFER_WINDOW_DAYS,
        "is_offer_available": remaining_slots > 0,
        "within_first_ten": within_first_ten,
        # Plan-access integration
        "active_plans": active_plans,
        "expired_plans": expired_plans,
        "expiry_map": expiry_map,
    }


async def queue_launch_offer_if_eligible(
    conn,
    user_id: str,
    email: str,
    *,
    is_admin: bool = False,
) -> dict | None:
    """
    Auto-queue a new user for the launch offer. Called during signup/OAuth.

    Returns the grant row dict if created, or None if not eligible.
    Admins are never eligible for the launch offer.
    """
    if is_admin:
        return None

    # Check if already has a grant
    existing = await conn.fetchval(
        "SELECT id FROM launch_offer_grants WHERE user_id = $1",
        user_id,
    )
    if existing:
        return None

    # Check slot availability
    settings = await conn.fetchrow(
        """SELECT max_approved_slots, eligible_after
           FROM launch_offer_settings
           WHERE id = 1""",
    )
    if not settings:
        return None

    max_slots = int(settings["max_approved_slots"])
    approved_count = await conn.fetchval(
        """SELECT COUNT(*) FROM launch_offer_grants
           WHERE status = ANY($1::text[]) AND slot_number IS NOT NULL""",
        list(LAUNCH_OFFER_CONSUMED_STATUSES),
    ) or 0
    if int(approved_count) >= max_slots:
        return None

    now = _utcnow()
    eligible_after = _coerce_dt(settings["eligible_after"])
    if eligible_after and now < eligible_after:
        return None

    email_normalized = email.strip().lower()

    # Insert a pending grant
    await conn.execute(
        """INSERT INTO launch_offer_grants (
               user_id, email, email_normalized, status, requested_at, updated_at
           )
           VALUES ($1, $2, $3, 'pending', NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING""",
        user_id,
        email,
        email_normalized,
    )

    grant_id = await conn.fetchval(
        "SELECT id FROM launch_offer_grants WHERE user_id = $1",
        user_id,
    )
    if grant_id:
        try:
            grant = await approve_launch_offer_grant(conn, int(grant_id))
        except LaunchOfferCapacityError:
            return None
        if grant:
            logger.info(
                "launch_offer_auto_approved",
                user_id=user_id,
                slot=grant["slot_number"],
                plan=grant["plan"],
            )
            return {
                "status": grant["status"],
                "plan": grant["plan"],
                "slot_number": grant["slot_number"],
            }

    return None


async def approve_launch_offer_grant(
    conn,
    grant_id: int,
    admin_email: str | None = None,
) -> dict | None:
    """Atomically assign the next available Pro launch-offer slot."""
    settings = await conn.fetchrow(
        """SELECT max_approved_slots
           FROM launch_offer_settings
           WHERE id = 1
           FOR UPDATE"""
    )
    if not settings:
        raise LaunchOfferCapacityError("Launch-offer settings are unavailable")

    grant = await conn.fetchrow(
        """SELECT id, user_id, email, status, plan, slot_number,
                  approved_at, reviewed_at, expires_at
           FROM launch_offer_grants
           WHERE id = $1
           FOR UPDATE""",
        grant_id,
    )
    if not grant:
        return None
    if grant["status"] == "approved":
        return {
            **dict(grant),
            "id": int(grant["id"]),
            "user_id": str(grant["user_id"]),
            "slot_number": int(grant["slot_number"]),
        }
    if grant["status"] != "pending":
        raise LaunchOfferConflictError(
            f"A {grant['status']} launch offer cannot be approved"
        )

    max_slots = int(settings["max_approved_slots"])
    consumed_count = await conn.fetchval(
        """SELECT COUNT(*)
           FROM launch_offer_grants
           WHERE status = ANY($1::text[]) AND slot_number IS NOT NULL""",
        list(LAUNCH_OFFER_CONSUMED_STATUSES),
    ) or 0
    if int(consumed_count) >= max_slots:
        raise LaunchOfferCapacityError("All launch-offer slots have been assigned")

    slot_number = await conn.fetchval(
        """SELECT candidate
           FROM generate_series(1, $1::integer) AS candidate
           WHERE NOT EXISTS (
               SELECT 1 FROM launch_offer_grants
               WHERE slot_number = candidate
           )
           ORDER BY candidate
           LIMIT 1""",
        max_slots,
    )
    if slot_number is None:
        raise LaunchOfferCapacityError("No launch-offer slot is available")

    now = _utcnow()
    expires_at = now + timedelta(days=LAUNCH_OFFER_WINDOW_DAYS)
    await conn.execute("SELECT set_config('app.slot_assign_active', 'true', true)")
    updated = await conn.fetchrow(
        """UPDATE launch_offer_grants
           SET status = 'approved',
               plan = 'pro',
               slot_number = $2,
               granted_at = $3,
               approved_at = $3,
               reviewed_at = $3,
               approved_by_email = $4,
               expires_at = $5,
               updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id, user_id, email, status, plan, slot_number,
                     approved_at, reviewed_at, expires_at""",
        grant_id,
        int(slot_number),
        now,
        admin_email,
        expires_at,
    )
    if not updated:
        raise LaunchOfferConflictError("Launch offer changed while being approved")
    return {
        **dict(updated),
        "id": int(updated["id"]),
        "user_id": str(updated["user_id"]),
        "slot_number": int(updated["slot_number"]),
    }


async def reject_launch_offer_grant(
    conn,
    grant_id: int,
    admin_email: str,
) -> dict | None:
    """Reject a pending launch-offer request without consuming a slot."""
    grant = await conn.fetchrow(
        """SELECT id, user_id, email, status, plan, slot_number,
                  approved_at, reviewed_at, expires_at
           FROM launch_offer_grants
           WHERE id = $1
           FOR UPDATE""",
        grant_id,
    )
    if not grant:
        return None
    if grant["status"] == "rejected":
        return {
            **dict(grant),
            "id": int(grant["id"]),
            "user_id": str(grant["user_id"]),
        }
    if grant["status"] != "pending":
        raise LaunchOfferConflictError(
            f"A {grant['status']} launch offer cannot be rejected"
        )

    updated = await conn.fetchrow(
        """UPDATE launch_offer_grants
           SET status = 'rejected',
               reviewed_at = NOW(),
               approved_by_email = $2,
               updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id, user_id, email, status, plan, slot_number,
                     approved_at, reviewed_at, expires_at""",
        grant_id,
        admin_email,
    )
    if not updated:
        raise LaunchOfferConflictError("Launch offer changed while being rejected")
    return {
        **dict(updated),
        "id": int(updated["id"]),
        "user_id": str(updated["user_id"]),
    }


async def expire_launch_offer_grant(
    conn,
    user_id: str,
    plan: str,
    admin_email: str,
) -> dict | None:
    """
    Expire an active launch-offer grant for a user. Called by admin_grants
    when deactivating a tier.

    Returns the updated grant row or None if no matching grant found.
    """
    grant = await conn.fetchrow(
        """SELECT id, status, plan
           FROM launch_offer_grants
           WHERE user_id = $1 AND plan = $2 AND status = 'approved'""",
        user_id,
        plan,
    )
    if not grant:
        return None

    # Use the guard-safe path
    await conn.execute(
        "SELECT set_config('app.slot_assign_active', 'true', true)"
    )
    await conn.execute(
        """UPDATE launch_offer_grants
           SET status = 'expired',
               reviewed_at = NOW(),
               approved_by_email = $2,
               updated_at = NOW()
           WHERE id = $1""",
        grant["id"],
        admin_email,
    )

    logger.info(
        "launch_offer_expired_by_admin",
        user_id=user_id,
        plan=plan,
        admin=admin_email,
    )

    return {"id": int(grant["id"]), "plan": plan, "status": "expired"}


async def reset_launch_offer_data(
    conn,
    *,
    reset_settings: bool = True,
) -> dict:
    """
    Delete all launch-offer grants and optionally reset settings.
    Admin-only operation.
    """
    # Use the guard-safe path for the delete
    await conn.execute(
        "SELECT set_config('app.slot_assign_active', 'true', true)"
    )
    result = await conn.execute("DELETE FROM launch_offer_grants")
    deleted_grants = int(result.split()[-1]) if result else 0

    settings_reset = False
    if reset_settings:
        await conn.execute(
            """UPDATE launch_offer_settings
               SET max_approved_slots = $1,
                   updated_at = NOW()
               WHERE id = 1""",
            TOTAL_LAUNCH_OFFER_SLOTS,
        )
        settings_reset = True

    logger.info(
        "launch_offer_data_reset",
        deleted_grants=deleted_grants,
        settings_reset=settings_reset,
    )

    return {
        "deleted_grants": deleted_grants,
        "settings_reset": settings_reset,
    }
