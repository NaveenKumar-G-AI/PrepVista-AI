"""
PrepVista - Quota Enforcement Service
Server-side interview quota tracking and selected-plan quota enforcement.
Admin users bypass quota limits via premium_override.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import HTTPException

from app.config import ADMIN_UNLIMITED_BY_PLAN, ADMIN_UNLIMITED_VALUES, PLAN_CONFIG
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile
from app.services.email_service import send_quota_low_warning
from app.services.plan_access import sync_profile_plan_state

logger = structlog.get_logger("prepvista.quota")
USAGE_PERIOD_DAYS = 30


def _coerce_dt(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def _period_needs_reset(period_start) -> bool:
    started_at = _coerce_dt(period_start)
    if not started_at:
        return True
    return datetime.now(timezone.utc) >= started_at + timedelta(days=USAGE_PERIOD_DAYS)


async def _ensure_current_usage_period(conn, user_id: str):
    """Reset the rolling quota window when the current usage period has expired."""
    profile = await conn.fetchrow(
        """SELECT plan, interviews_used_this_period, period_start,
                  referral_bonus_interviews, admin_bonus_interviews, org_student
           FROM profiles
           WHERE id = $1""",
        user_id,
    )
    if not profile:
        return None

    if not _period_needs_reset(profile["period_start"]):
        return profile

    # ── Quota reset: profiles UPDATE only ────────────────────────────────────
    # Previously this function also deleted support_messages >90 days old inside
    # the same call. That DELETE is an unrelated maintenance concern — coupling it
    # here means a transient FK constraint violation or lock on support_messages
    # silently prevents the quota reset from completing. The student then enters
    # a new interview period with their old used-count still showing, causing a
    # false quota-exceeded error on a fresh period.
    #
    # The support_messages cleanup is now separated into _archive_old_support_messages
    # and called as a best-effort operation after the quota reset commits.
    await conn.execute(
        """UPDATE profiles
           SET interviews_used_this_period = 0,
               admin_bonus_interviews      = 0,
               period_start               = NOW(),
               updated_at                 = NOW()
           WHERE id = $1""",
        user_id,
    )

    return await conn.fetchrow(
        """SELECT plan, interviews_used_this_period, period_start,
                  referral_bonus_interviews, admin_bonus_interviews, org_student
           FROM profiles
           WHERE id = $1""",
        user_id,
    )


async def _archive_old_support_messages(user_id: str) -> None:
    """
    Best-effort deletion of support messages older than 90 days.

    Called after a period reset commits — separated so that a failure here
    (FK constraint, lock timeout) never rolls back or delays the quota reset
    itself. Old message cleanup is a maintenance concern, not a quota concern.
    """
    try:
        async with DatabaseConnection() as conn:
            await conn.execute(
                """DELETE FROM support_messages
                   WHERE user_id = $1
                     AND created_at < NOW() - INTERVAL '90 days'""",
                user_id,
            )
    except Exception as exc:
        logger.warning(
            "support_message_archive_failed",
            user_id=user_id,
            error=str(exc),
        )


async def _resolve_selected_plan_usage(conn, user_id: str, selected_plan: str):
    """Return the current rolling window start and used count for the selected plan."""
    profile = await _ensure_current_usage_period(conn, user_id)
    if not profile:
        # ── BUGFIX: tuple length was 4 here, 5 on the normal return path ─────
        # Both callers unpack 5 values:
        #   _, _, used, referral_bonus_interviews, admin_bonus_interviews = await ...
        # Returning 4 values caused ValueError("not enough values to unpack") on
        # any user whose profile row was missing — a race condition between signup
        # and first quota check that crashed enforce_quota and get_usage_stats
        # silently as HTTP 500. Added the missing None as the 5th return value.
        return None, None, 0, 0, 0

    period_start = profile["period_start"]
    referral_bonus_interviews = profile["referral_bonus_interviews"] or 0
    admin_bonus_interviews = profile["admin_bonus_interviews"] or 0

    if selected_plan in {"pro", "career"}:
        entitlement = await conn.fetchrow(
            """SELECT activated_at, expires_at
               FROM user_plan_entitlements
               WHERE user_id = $1 AND plan = $2 AND status = 'active'""",
            user_id,
            selected_plan,
        )
        if entitlement and entitlement["activated_at"]:
            period_start = entitlement["activated_at"]

    if period_start:
        used = await conn.fetchval(
            """SELECT total_interviews
               FROM user_plan_interviews
               WHERE user_id = $1
                 AND plan = $2
                 AND current_cycle_start >= $3""",
            user_id,
            selected_plan,
            period_start,
        )
    else:
        used = 0

    return profile, period_start, int(used or 0), referral_bonus_interviews, admin_bonus_interviews


def _selected_plan_limit(plan: str):
    """Return the selected plan interview limit. None means unlimited."""
    return PLAN_CONFIG.get(plan, PLAN_CONFIG["free"]).get("interviews_per_month")


def _effective_limit(
    plan: str,
    referral_bonus_interviews: int,
    admin_bonus_interviews: int = 0,
):
    """Combine plan allowance with referral bonus interviews and temporary admin bonuses."""
    limit = _selected_plan_limit(plan)
    if limit is None:
        return None

    # Handle tier-isolated unlimited admin grants (enum-documented sentinel values)
    if admin_bonus_interviews in ADMIN_UNLIMITED_VALUES:
        expected_sentinel = ADMIN_UNLIMITED_BY_PLAN.get(plan)
        if admin_bonus_interviews != expected_sentinel:
            admin_bonus_interviews = 0

    return limit + max(0, referral_bonus_interviews or 0) + max(0, admin_bonus_interviews or 0)


async def enforce_quota(user: UserProfile):
    """Check if the currently selected plan still has interview capacity."""
    if user.premium_override or getattr(user, "is_org_student", False):
        logger.info("quota_bypassed_admin", user_id=user.id)
        return

    selected_plan = user.plan or "free"
    limit = _selected_plan_limit(selected_plan)

    if limit is None:
        logger.info("quota_unlimited_plan", user_id=user.id, plan=selected_plan)
        return

    period_reset_occurred = False
    async with DatabaseConnection() as conn:
        profile_before = await conn.fetchrow(
            "SELECT period_start FROM profiles WHERE id = $1", user.id
        )
        _, _, used, referral_bonus_interviews, admin_bonus_interviews = (
            await _resolve_selected_plan_usage(conn, user.id, selected_plan)
        )
        profile_after = await conn.fetchrow(
            "SELECT period_start FROM profiles WHERE id = $1", user.id
        )
        # Detect if _ensure_current_usage_period just reset the period so we
        # can fire the best-effort archive cleanup outside the connection.
        if (
            profile_before
            and profile_after
            and str(profile_before["period_start"]) != str(profile_after["period_start"])
        ):
            period_reset_occurred = True

    # Best-effort support message archive — outside connection, non-blocking.
    if period_reset_occurred:
        asyncio.create_task(_archive_old_support_messages(user.id))

    limit = _effective_limit(selected_plan, referral_bonus_interviews, admin_bonus_interviews)

    if used >= limit:
        logger.info(
            "quota_exceeded",
            user_id=user.id,
            plan=selected_plan,
            used=used,
            limit=limit,
        )
        raise HTTPException(
            status_code=402,
            detail={
                "error": "quota_exceeded",
                "message": (
                    f"You've used all {limit} interviews for your selected "
                    f"{selected_plan.title()} plan."
                ),
                "used": used,
                "limit": limit,
                "plan": selected_plan,
                "upgrade_url": "/pricing",
            },
        )

    logger.info(
        "quota_check_passed",
        user_id=user.id,
        plan=selected_plan,
        used=used,
        limit=limit,
    )

    # ── Fire-and-forget quota low warning when remaining ≤ 2 ─────────────────
    # asyncio and send_quota_low_warning moved to top-level imports — previously
    # inline inside this block, acquiring the import lock on every quota check
    # that hit the low-warning threshold. Not critical individually, but at
    # 500 concurrent quota checks the redundant lock acquisitions compound.
    remaining = limit - used
    if 0 < remaining <= 2:
        try:
            task = asyncio.create_task(
                send_quota_low_warning(user.email, selected_plan, used, limit)
            )
            task.add_done_callback(lambda t: None)
        except Exception:
            pass  # Non-critical — never disrupt interview flow


async def get_usage_stats(
    user_id: str,
    premium_override: bool = False,
    conn=None,
) -> dict:
    """
    Get current usage statistics for the selected plan plus highest entitlement.

    Parameters
    ----------
    user_id          : Target user ID.
    premium_override : True for admin / org-student users who bypass limits.
    conn             : Optional existing database connection to reuse.
                       When provided, no new pool checkout is made — the caller's
                       connection is used directly. When None (default), a new
                       DatabaseConnection is opened internally.

                       Callers that already hold an open connection (e.g.
                       dashboard.py's GET /dashboard) should pass conn=conn to
                       eliminate the second pool checkout that previously occurred
                       on every dashboard load — halving pool pressure on the
                       highest-frequency endpoint in the system.

    All existing callers that pass only user_id (and optionally premium_override)
    are completely unaffected — the function behaves identically when conn=None.
    """
    async def _run(conn) -> dict:
        profile = await _ensure_current_usage_period(conn, user_id)
        is_org_student = bool(profile.get("org_student")) if profile else False
        effective_premium_override = premium_override or is_org_student

        if not profile:
            selected_plan = "career" if effective_premium_override else "free"
            effective_plan = "career" if effective_premium_override else "free"
            limit = (
                None if effective_premium_override
                else _effective_limit(selected_plan, 0, 0)
            )
            is_unlimited = limit is None
            return {
                "plan": selected_plan,
                "effective_plan": effective_plan,
                "used": 0,
                "limit": limit,
                "remaining": None if is_unlimited else limit,
                "is_unlimited": is_unlimited,
                "referral_bonus_interviews": 0,
                "period_start": None,
            }

        plan_state = await sync_profile_plan_state(
            conn,
            user_id,
            profile["plan"],
            premium_override=effective_premium_override,
            is_org_student=is_org_student,
        )
        selected_plan = plan_state["selected_plan"]
        effective_plan = (
            "career" if effective_premium_override
            else plan_state["highest_owned_plan"]
        )
        _, period_start, used, referral_bonus_interviews, admin_bonus_interviews = (
            await _resolve_selected_plan_usage(conn, user_id, selected_plan)
        )
        limit = (
            None if effective_premium_override
            else _effective_limit(
                selected_plan, referral_bonus_interviews, admin_bonus_interviews
            )
        )
        is_unlimited = limit is None
        remaining = None if is_unlimited else max(0, limit - used)

        return {
            "plan": selected_plan,
            "effective_plan": effective_plan,
            "used": used,
            "limit": limit,
            "remaining": remaining,
            "is_unlimited": is_unlimited,
            "referral_bonus_interviews": referral_bonus_interviews,
            "period_start": str(period_start) if period_start else None,
        }

    if conn is not None:
        return await _run(conn)

    async with DatabaseConnection() as _conn:
        return await _run(_conn)


async def reset_period_usage(user_id: str):
    """Reset interview count for a new billing period."""
    async with DatabaseConnection() as conn:
        await conn.execute(
            """UPDATE profiles
               SET interviews_used_this_period = 0,
                   period_start               = NOW()
               WHERE id = $1""",
            user_id,
        )
    logger.info("quota_reset", user_id=user_id)