"""
PrepVista - Plan entitlement helpers
Keeps selected plan separate from purchased entitlements and enforces 30-day access windows.
"""

from __future__ import annotations

import asyncio
import structlog
from datetime import datetime, timedelta, timezone
from typing import Iterable

from app.services.launch_offer import get_launch_offer_state

logger = structlog.get_logger("prepvista.plan_access")

# Background task registry: prevents GC from collecting fire-and-forget tasks
_background_tasks: set = set()

PAID_PLANS = ("pro", "career")
PAID_PLAN_SET = set(PAID_PLANS)
ALL_PLANS = ("free", "pro", "career")
PLAN_HIERARCHY = {"free": 0, "pro": 1, "career": 2}
PLAN_ACCESS_WINDOW_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_dt(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def _expiry_from(activated_at: datetime) -> datetime:
    return activated_at + timedelta(days=PLAN_ACCESS_WINDOW_DAYS)


def normalize_plans(plans: Iterable[str]) -> list[str]:
    """Return unique plans in canonical order."""
    unique = {plan for plan in plans if plan in ALL_PLANS}
    ordered = [plan for plan in ALL_PLANS if plan in unique]
    return ordered or ["free"]


def _normalize_paid_plans(plans: Iterable[str]) -> list[str]:
    return [plan for plan in normalize_plans(plans) if plan in PAID_PLAN_SET]


def highest_plan(plans: Iterable[str]) -> str:
    """Return the highest tier from the given plans."""
    normalized = normalize_plans(plans)
    return max(normalized, key=lambda plan: PLAN_HIERARCHY.get(plan, 0))


def admin_override_state(selected_plan: str | None = None) -> dict:
    """Return the entitlement state for admin accounts with premium override."""
    current_plan = selected_plan if selected_plan in ALL_PLANS else "career"
    owned_plans = list(ALL_PLANS)
    return {
        "selected_plan": current_plan,
        "owned_plans": owned_plans,
        "highest_owned_plan": "career",
        "subscription_status": "active",
        "expired_plans": [],
    }


def _plan_status(plan: str, owned_plans: list[str], expired_plans: list[str], premium_override: bool) -> str:
    """Return a human-readable plan purchase state for the stats table."""
    if plan == "free":
        return "active"
    if premium_override or plan in owned_plans:
        return "active"
    if plan in expired_plans:
        return "expired"
    return "not_purchased"


async def sync_user_purchase_stats(
    conn,
    user_id: str,
    selected_plan: str,
    owned_plans: list[str],
    highest_owned_plan: str,
    subscription_status: str,
    expired_plans: list[str],
    premium_override: bool = False,
):
    """Upsert the Supabase-facing user purchase stats table."""
    profile = await conn.fetchrow(
        "SELECT email FROM profiles WHERE id = $1",
        user_id,
    )
    if not profile:
        return

    payment_counts_rows = await conn.fetch(
        """SELECT plan, COUNT(*) AS total
           FROM payments
           WHERE user_id = $1 AND status = 'verified'
           GROUP BY plan""",
        user_id,
    )
    payment_counts = {row["plan"]: int(row["total"]) for row in payment_counts_rows}

    pro_status = _plan_status("pro", owned_plans, expired_plans, premium_override)
    career_status = _plan_status("career", owned_plans, expired_plans, premium_override)

    await conn.execute(
        """INSERT INTO user_purchase_stats (
               user_id, email, selected_plan, highest_owned_plan, subscription_status,
               free_status, free_access, free_purchase_count,
               pro_status, pro_access, pro_purchase_count,
               career_status, career_access, career_purchase_count,
               expired_plans, updated_at
           )
           VALUES (
               $1, $2, $3, $4, $5,
               'active', TRUE, 0,
               $6, $7, $8,
               $9, $10, $11,
               $12, NOW()
           )
           ON CONFLICT (user_id)
           DO UPDATE SET
               email = EXCLUDED.email,
               selected_plan = EXCLUDED.selected_plan,
               highest_owned_plan = EXCLUDED.highest_owned_plan,
               subscription_status = EXCLUDED.subscription_status,
               free_status = EXCLUDED.free_status,
               free_access = EXCLUDED.free_access,
               free_purchase_count = EXCLUDED.free_purchase_count,
               pro_status = EXCLUDED.pro_status,
               pro_access = EXCLUDED.pro_access,
               pro_purchase_count = EXCLUDED.pro_purchase_count,
               career_status = EXCLUDED.career_status,
               career_access = EXCLUDED.career_access,
               career_purchase_count = EXCLUDED.career_purchase_count,
               expired_plans = EXCLUDED.expired_plans,
               updated_at = NOW()""",
        user_id,
        profile["email"],
        selected_plan,
        highest_owned_plan,
        subscription_status,
        pro_status,
        premium_override or "pro" in owned_plans,
        payment_counts.get("pro", 0),
        career_status,
        premium_override or "career" in owned_plans,
        payment_counts.get("career", 0),
        expired_plans,
    )


async def activate_plan_entitlement(
    conn,
    user_id: str,
    plan: str,
    *,
    source_order_id: str | None = None,
    activated_at: datetime | None = None,
) -> None:
    """Mark a paid plan active for a fresh 30-day access window."""
    if plan not in PAID_PLAN_SET:
        return

    started_at = _coerce_dt(activated_at) or _utcnow()
    expires_at = _expiry_from(started_at)
    await conn.execute(
        """INSERT INTO user_plan_entitlements (
               user_id, plan, status, source_order_id, activated_at, expires_at, created_at, updated_at
           )
           VALUES ($1, $2, 'active', $3, $4, $5, NOW(), NOW())
           ON CONFLICT (user_id, plan)
           DO UPDATE SET
               status = 'active',
               source_order_id = EXCLUDED.source_order_id,
               activated_at = EXCLUDED.activated_at,
               expires_at = EXCLUDED.expires_at,
               updated_at = NOW()""",
        user_id,
        plan,
        source_order_id,
        started_at,
        expires_at,
    )


async def ensure_plan_entitlements(conn, user_id: str, selected_plan: str | None = None) -> list[str]:
    """
    Backfill entitlements from verified payments for legacy users and return active owned plans.
    This keeps older purchases working with the 30-day access model.
    """
    del selected_plan

    payment_rows = await conn.fetch(
        """SELECT DISTINCT ON (plan) plan, COALESCE(verified_at, created_at) AS activated_at, razorpay_order_id
           FROM payments
           WHERE user_id = $1
             AND status = 'verified'
             AND plan IN ('pro', 'career')
           ORDER BY plan, COALESCE(verified_at, created_at) DESC""",
        user_id,
    )

    existing_rows = await conn.fetch(
        """SELECT plan, status, activated_at, expires_at
           FROM user_plan_entitlements
           WHERE user_id = $1""",
        user_id,
    )
    existing_by_plan = {row["plan"]: row for row in existing_rows}

    for row in payment_rows:
        plan = row["plan"]
        activated_at = _coerce_dt(row["activated_at"]) or _utcnow()
        expires_at = _expiry_from(activated_at)
        existing = existing_by_plan.get(plan)

        if not existing:
            await conn.execute(
                """INSERT INTO user_plan_entitlements (
                       user_id, plan, status, source_order_id, activated_at, expires_at, created_at, updated_at
                   )
                   VALUES ($1, $2, 'active', $3, $4, $5, NOW(), NOW())
                   ON CONFLICT (user_id, plan) DO NOTHING""",
                user_id,
                plan,
                row["razorpay_order_id"],
                activated_at,
                expires_at,
            )
            continue

        if existing["activated_at"] is None or existing["expires_at"] is None:
            await conn.execute(
                """UPDATE user_plan_entitlements
                   SET activated_at = COALESCE(activated_at, $3),
                       expires_at = COALESCE(expires_at, $4),
                       source_order_id = COALESCE(source_order_id, $5),
                       updated_at = NOW()
                   WHERE user_id = $1 AND plan = $2""",
                user_id,
                plan,
                activated_at,
                expires_at,
                row["razorpay_order_id"],
            )

    entitlement_rows = await conn.fetch(
        """SELECT plan, status, expires_at
           FROM user_plan_entitlements
           WHERE user_id = $1
           ORDER BY created_at ASC""",
        user_id,
    )

    now = _utcnow()
    active_paid_plans = []
    for row in entitlement_rows:
        if row["plan"] not in PAID_PLAN_SET:
            continue
        expires_at = _coerce_dt(row["expires_at"])
        if row["status"] == "active" and expires_at and expires_at > now:
            active_paid_plans.append(row["plan"])

    return normalize_plans(["free", *active_paid_plans])


async def sync_profile_plan_state(
    conn,
    user_id: str,
    selected_plan: str | None = None,
    premium_override: bool = False,
    is_org_student: bool = False,
) -> dict:
    """
    Ensure profile.plan and subscription_status match current active entitlements.
    Returns selected plan, active owned plans, highest active plan, and expired paid plans.
    """
    profile = await conn.fetchrow(
        "SELECT plan FROM profiles WHERE id = $1",
        user_id,
    )
    current_plan = selected_plan or (profile["plan"] if profile else "free")

    if is_org_student:
        plan_state = admin_override_state("career")
        current_plan = plan_state["selected_plan"]
        owned_plans = plan_state["owned_plans"]
        highest_owned = plan_state["highest_owned_plan"]
        subscription_status = plan_state["subscription_status"]
        expired_plans = plan_state["expired_plans"]
    elif premium_override:
        plan_state = admin_override_state(current_plan)
        current_plan = plan_state["selected_plan"]
        owned_plans = plan_state["owned_plans"]
        highest_owned = plan_state["highest_owned_plan"]
        subscription_status = plan_state["subscription_status"]
        expired_plans = plan_state["expired_plans"]
    else:
        await ensure_plan_entitlements(conn, user_id, current_plan)

        entitlement_rows = await conn.fetch(
            """SELECT plan, status, activated_at, expires_at
               FROM user_plan_entitlements
               WHERE user_id = $1
               ORDER BY created_at ASC""",
            user_id,
        )

        now = _utcnow()
        plans_to_expire = [
            row["plan"]
            for row in entitlement_rows
            if row["plan"] in PAID_PLAN_SET
            and row["status"] == "active"
            and _coerce_dt(row["expires_at"])
            and _coerce_dt(row["expires_at"]) <= now
        ]
        if plans_to_expire:
            await conn.execute(
                """UPDATE user_plan_entitlements
                   SET status = 'expired',
                       updated_at = NOW()
                   WHERE user_id = $1 AND plan = ANY($2::text[]) AND status = 'active'""",
                user_id,
                plans_to_expire,
            )
            entitlement_rows = await conn.fetch(
                """SELECT plan, status, activated_at, expires_at
                   FROM user_plan_entitlements
                   WHERE user_id = $1
                   ORDER BY created_at ASC""",
                user_id,
            )

            # Fire-and-forget expiry notification emails
            try:
                user_email_row = await conn.fetchval(
                    "SELECT email FROM profiles WHERE id = $1", user_id
                )
                if user_email_row:
                    from app.services.email_service import send_plan_expired_notification
                    for expired_plan in plans_to_expire:
                        task = asyncio.create_task(
                            send_plan_expired_notification(user_email_row, expired_plan)
                        )
                        _background_tasks.add(task)
                        task.add_done_callback(_background_tasks.discard)
            except Exception:
                logger.warning("expiry_notification_fire_failed", user_id=user_id)

        # Check for plans expiring within 3 days — send pre-expiry warning
        plans_expiring_soon = [
            (row["plan"], (_coerce_dt(row["expires_at"]) - now).days)
            for row in entitlement_rows
            if row["plan"] in PAID_PLAN_SET
            and row["status"] == "active"
            and _coerce_dt(row["expires_at"])
            and 0 < (_coerce_dt(row["expires_at"]) - now).days <= 3
        ]
        if plans_expiring_soon:
            try:
                user_email_row = await conn.fetchval(
                    "SELECT email FROM profiles WHERE id = $1", user_id
                )
                if user_email_row:
                    from app.services.email_service import send_plan_expiry_warning
                    for plan_name, days_left in plans_expiring_soon:
                        task = asyncio.create_task(
                            send_plan_expiry_warning(user_email_row, plan_name, days_left)
                        )
                        _background_tasks.add(task)
                        task.add_done_callback(_background_tasks.discard)
            except Exception:
                logger.warning("expiry_warning_fire_failed", user_id=user_id)

        launch_offer_state = await get_launch_offer_state(conn, user_id)
        active_paid_plans = []
        expired_paid_plans = []
        for row in entitlement_rows:
            plan = row["plan"]
            if plan not in PAID_PLAN_SET:
                continue
            status = row["status"]
            expires_at = _coerce_dt(row["expires_at"])
            if status == "active" and (not expires_at or expires_at > now):
                active_paid_plans.append(plan)
            elif status == "expired":
                expired_paid_plans.append(plan)

        owned_plans = normalize_plans(["free", *active_paid_plans, *launch_offer_state["active_plans"]])
        expired_plans = _normalize_paid_plans([*expired_paid_plans, *launch_offer_state["expired_plans"]])
        highest_owned = highest_plan(owned_plans)

        if current_plan not in owned_plans:
            current_plan = highest_owned if highest_owned in PAID_PLAN_SET else "free"

        subscription_status = "active" if (active_paid_plans or launch_offer_state["active_plans"]) else ("canceled" if expired_plans else "none")

    await conn.execute(
        """UPDATE profiles
           SET plan = $2,
               subscription_status = $3,
               updated_at = NOW()
           WHERE id = $1""",
        user_id,
        current_plan,
        subscription_status,
    )

    await sync_user_purchase_stats(
        conn,
        user_id,
        current_plan,
        owned_plans,
        highest_owned,
        subscription_status,
        expired_plans,
        premium_override=premium_override,
    )

    return {
        "selected_plan": current_plan,
        "owned_plans": owned_plans,
        "highest_owned_plan": highest_owned,
        "subscription_status": subscription_status,
        "expired_plans": expired_plans,
    }


async def set_entitlement_status(
    conn,
    user_id: str,
    plan: str,
    status: str,
    *,
    source_order_id: str | None = None,
    activated_at: datetime | None = None,
):
    """Update a plan entitlement status if the plan is paid."""
    if plan not in PAID_PLAN_SET:
        return

    normalized_status = (status or "").strip().lower() or "inactive"
    if normalized_status == "active":
        await activate_plan_entitlement(
            conn,
            user_id,
            plan,
            source_order_id=source_order_id or "system_update",
            activated_at=activated_at,
        )
        return

    await conn.execute(
        """INSERT INTO user_plan_entitlements (
               user_id, plan, status, source_order_id, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (user_id, plan)
           DO UPDATE SET
               status = EXCLUDED.status,
               source_order_id = COALESCE(EXCLUDED.source_order_id, user_plan_entitlements.source_order_id),
               updated_at = NOW()""",
        user_id,
        plan,
        normalized_status,
        source_order_id or "system_update",
    )


async def get_plan_expiry_map(conn, user_id: str, premium_override: bool = False) -> dict[str, datetime | None]:
    """Return the current stored expiry timestamp for each paid plan."""
    if premium_override:
        return {"pro": None, "career": None}

    rows = await conn.fetch(
        """SELECT plan, expires_at
           FROM user_plan_entitlements
           WHERE user_id = $1
             AND plan = ANY($2::text[])""",
        user_id,
        list(PAID_PLANS),
    )

    expiry_map: dict[str, datetime | None] = {"pro": None, "career": None}
    for row in rows:
        plan = row["plan"]
        if plan in expiry_map:
            expiry_map[plan] = _coerce_dt(row["expires_at"])

    launch_offer_state = await get_launch_offer_state(conn, user_id)
    for plan, expires_at in launch_offer_state["expiry_map"].items():
        if plan in expiry_map and expires_at:
            current = expiry_map[plan]
            if current is None or expires_at > current:
                expiry_map[plan] = expires_at

    return expiry_map
