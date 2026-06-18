"""
PrepVista - Admin Router
Admin-only oversight for users, launch-offer metrics, referrals, and feedback.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW DEPENDENCY REQUIRED BEFORE DEPLOYING THIS FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    pip install cachetools

cachetools provides the lightweight TTLCache used for the 30-second
admin overview cache. No Redis infrastructure required.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.launch_offer import (
    LAUNCH_OFFER_CONSUMED_STATUSES,
    LAUNCH_OFFER_WINDOW_DAYS,
    TOTAL_LAUNCH_OFFER_SLOTS,
    reset_launch_offer_data,
)
from app.services.user_activity import refresh_user_activity_stats

router = APIRouter()
logger = structlog.get_logger("prepvista.admin")

# ── 30-second in-memory cache for the admin overview ─────────────────────────
# The overview assembles data from 8 DB queries. Recomputing it on every admin
# page refresh (or every 30-second auto-poll) is wasteful — revenue figures,
# user counts, and plan stats do not need millisecond freshness.
#
# TTLCache(maxsize=1) holds exactly one snapshot (the last computed overview).
# After 30 seconds the entry expires and the next request recomputes it.
# Cache is keyed by the integer constant 0 — there is one shared overview for
# all admin accounts (admin data is not user-personalised).
#
# Thread/coroutine safety note: cachetools.TTLCache is NOT thread-safe by
# itself, but in an async FastAPI app all coroutines run on the same event-loop
# thread, so concurrent access cannot interleave within a single __getitem__
# or __setitem__ call. This is safe without an asyncio.Lock.
_OVERVIEW_CACHE: TTLCache = TTLCache(maxsize=1, ttl=30)
_OVERVIEW_CACHE_KEY: int = 0

# How many revenue rows to return. Caps the full-table scan that was previously
# unbounded and growing silently with every new paying user.
_REVENUE_ROWS_LIMIT: int = 500


def require_admin(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Allow admin-only endpoints for the configured admin account."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access only.")
    return user


def _serialize_dt(value: Any) -> str | None:
    return str(value) if value else None


def _paid_status(active_flag: Any, expired_flag: Any) -> str:
    if active_flag:
        return "active"
    if expired_flag:
        return "expired"
    return "not_purchased"


async def _fetch_settings_and_activity(conn: Any) -> tuple[Any, Any]:
    """Fetch launch-offer settings and activity stats concurrently on one connection."""
    settings_row, activity_stats = await asyncio.gather(
        conn.fetchrow(
            """SELECT eligible_after, max_approved_slots
               FROM launch_offer_settings
               WHERE id = 1"""
        ),
        refresh_user_activity_stats(conn),
    )
    return settings_row, activity_stats


async def _fetch_operational_data(
    conn: Any,
) -> tuple[Any, Any, Any]:
    """Fetch launch offers, referrals, and feedback concurrently on one connection."""
    launch_offer_rows, referral_rows, feedback_rows = await asyncio.gather(
        conn.fetch(
            """
            SELECT
                lg.id,
                lg.user_id,
                lg.email,
                p.full_name,
                lg.status,
                lg.slot_number,
                lg.plan,
                lg.requested_at,
                lg.approved_at,
                lg.reviewed_at,
                lg.approved_by_email,
                lg.expires_at
            FROM launch_offer_grants lg
            LEFT JOIN profiles p
              ON p.id = lg.user_id
            ORDER BY
                CASE lg.status
                    WHEN 'pending'  THEN 0
                    WHEN 'approved' THEN 1
                    WHEN 'expired'  THEN 2
                    ELSE 3
                END,
                lg.requested_at ASC,
                lg.id ASC
            """
        ),
        conn.fetch(
            """
            SELECT
                r.id,
                r.invited_email,
                r.status,
                r.reward_granted,
                r.created_at,
                r.joined_at,
                ref.full_name  AS referrer_name,
                ref.email      AS referrer_email,
                invited.full_name AS invited_user_name,
                invited.email     AS invited_user_email
            FROM referrals r
            JOIN  profiles ref     ON ref.id    = r.referrer_user_id
            LEFT JOIN profiles invited ON invited.id = r.invited_user_id
            ORDER BY r.created_at DESC
            LIMIT 200
            """
        ),
        conn.fetch(
            """
            SELECT id, email, full_name, feedback_text, created_at
            FROM feedback_entries
            ORDER BY created_at DESC
            LIMIT 200
            """
        ),
    )
    return launch_offer_rows, referral_rows, feedback_rows


async def _fetch_analytics_data(
    conn: Any,
) -> tuple[Any, Any, Any]:
    """Fetch users, plan usage, and revenue (with global totals) concurrently."""
    user_rows, plan_usage_rows, revenue_rows = await asyncio.gather(
        conn.fetch(
            """
            WITH entitlement_rollup AS (
                SELECT
                    user_id,
                    MAX(CASE WHEN plan = 'pro'    THEN status END)       AS pro_status,
                    MAX(CASE WHEN plan = 'pro'    THEN activated_at END) AS pro_activated_at,
                    MAX(CASE WHEN plan = 'pro'    THEN expires_at END)   AS pro_expires_at,
                    MAX(CASE WHEN plan = 'career' THEN status END)       AS career_status,
                    MAX(CASE WHEN plan = 'career' THEN activated_at END) AS career_activated_at,
                    MAX(CASE WHEN plan = 'career' THEN expires_at END)   AS career_expires_at
                FROM (
                    SELECT user_id, plan, status, activated_at, expires_at,
                           ROW_NUMBER() OVER (
                               PARTITION BY user_id, plan
                               ORDER BY created_at DESC NULLS LAST
                           ) AS rn
                    FROM user_plan_entitlements
                ) sub
                WHERE rn = 1
                GROUP BY user_id
            ),
            interview_rollup AS (
                SELECT
                    user_id,
                    MAX(CASE WHEN plan = 'free'   THEN total_interviews ELSE 0 END) AS free_interviews,
                    MAX(CASE WHEN plan = 'free'   THEN current_cycle_start END)     AS free_cycle_start,
                    MAX(CASE WHEN plan = 'free'   THEN current_cycle_end END)       AS free_cycle_end,
                    MAX(CASE WHEN plan = 'pro'    THEN total_interviews ELSE 0 END) AS pro_interviews,
                    MAX(CASE WHEN plan = 'career' THEN total_interviews ELSE 0 END) AS career_interviews
                FROM user_plan_interviews
                GROUP BY user_id
            ),
            payment_rollup AS (
                SELECT
                    user_id,
                    COUNT(*) FILTER (WHERE plan = 'pro'    AND status = 'verified')::INT AS pro_purchase_count,
                    COUNT(*) FILTER (WHERE plan = 'career' AND status = 'verified')::INT AS career_purchase_count
                FROM payments
                GROUP BY user_id
            )
            SELECT
                p.id,
                p.email,
                p.full_name,
                p.plan                AS selected_plan,
                p.subscription_status,
                p.is_admin,
                p.created_at,
                p.last_seen_at,
                er.pro_status,
                er.pro_activated_at,
                er.pro_expires_at,
                er.career_status,
                er.career_activated_at,
                er.career_expires_at,
                COALESCE(pr.pro_purchase_count,    0) AS pro_purchase_count,
                COALESCE(pr.career_purchase_count, 0) AS career_purchase_count,
                COALESCE(ir.free_interviews,       0) AS free_interviews,
                COALESCE(ir.pro_interviews,        0) AS pro_interviews,
                COALESCE(ir.career_interviews,     0) AS career_interviews,
                ir.free_cycle_start,
                ir.free_cycle_end,
                lg.id          AS launch_offer_id,
                lg.status      AS launch_offer_status,
                lg.plan        AS launch_offer_plan,
                lg.slot_number AS launch_offer_slot_number,
                lg.requested_at AS launch_offer_requested_at,
                lg.approved_at  AS launch_offer_approved_at,
                lg.reviewed_at  AS launch_offer_reviewed_at,
                lg.expires_at   AS launch_offer_expires_at
            FROM profiles p
            LEFT JOIN entitlement_rollup er ON er.user_id = p.id
            LEFT JOIN interview_rollup   ir ON ir.user_id = p.id
            LEFT JOIN payment_rollup     pr ON pr.user_id = p.id
            LEFT JOIN launch_offer_grants lg ON lg.user_id = p.id
            ORDER BY p.created_at DESC
            LIMIT 500
            """
        ),
        conn.fetch(
            """
            SELECT p.email, p.full_name, u.plan, u.total_interviews, u.last_interview_at
            FROM user_plan_interviews u
            JOIN profiles p ON p.id = u.user_id
            ORDER BY u.total_interviews DESC, u.last_interview_at DESC
            LIMIT 200
            """
        ),
        # ── revenue_rows: bounded + global totals via window function ─────────
        # The original query had NO LIMIT — it returned every row in
        # user_revenue_analytics on every admin load. At 5,000 paying users this
        # is a 5,000-row full-table scan transferred to Python on every page hit.
        # LIMIT _REVENUE_ROWS_LIMIT (500) caps this permanently.
        #
        # The global totals (previously a second full-table scan in a separate
        # fetchrow call) are now computed in the SAME scan using SUM() OVER ()
        # window aggregates. This eliminates one complete extra round-trip to
        # user_revenue_analytics, cutting the total query count from 9 → 8
        # while also removing a redundant sequential scan on the same table.
        conn.fetch(
            f"""
            SELECT
                user_id,
                email,
                full_name,
                pro_purchase_count,
                career_purchase_count,
                pro_revenue_paise,
                career_revenue_paise,
                total_revenue_paise,
                last_payment_date,
                -- Global aggregates computed in one pass alongside row data
                SUM(pro_revenue_paise)     OVER () AS global_pro_revenue,
                SUM(career_revenue_paise)  OVER () AS global_career_revenue,
                SUM(total_revenue_paise)   OVER () AS global_total_revenue
            FROM user_revenue_analytics
            ORDER BY total_revenue_paise DESC, last_payment_date DESC
            LIMIT {_REVENUE_ROWS_LIMIT}
            """
        ),
    )
    return user_rows, plan_usage_rows, revenue_rows


@router.get("/overview")
async def get_admin_overview(admin: UserProfile = Depends(require_admin)):
    """Return one admin snapshot for users, launch-offer metrics, referrals, and feedback."""

    # ── 30-second cache check ─────────────────────────────────────────────────
    # Serve a cached snapshot if one exists. This eliminates 100% of DB load on
    # repeat admin refreshes within the TTL window, which is the dominant access
    # pattern (admin tab open and polling). Any caller needing fresh data simply
    # waits up to 30 s for the cache to expire.
    cached: dict | None = _OVERVIEW_CACHE.get(_OVERVIEW_CACHE_KEY)
    if cached is not None:
        logger.info("admin_overview_served_from_cache", admin_email=admin.email)
        return cached

    t_start = time.monotonic()
    logger.info("admin_overview_requested", admin_email=admin.email)

    # ── Parallel query execution across 3 independent connection groups ────────
    # Each group uses its own DatabaseConnection so queries within a group run
    # on the same connection (preserving transaction isolation if needed) while
    # the three groups execute concurrently via asyncio.gather.
    #
    # Group 1 — settings + activity stats (fast, metadata reads)
    # Group 2 — launch offers + referrals + feedback (operational reads)
    # Group 3 — users + plan usage + revenue (analytics reads, heaviest)
    #
    # Total latency ≈ max(group_1_time, group_2_time, group_3_time)
    # vs original  ≈ sum(all_8_query_times)
    # Estimated reduction: 40–60% on P50, larger gains on P95/P99.
    async def _group1() -> tuple[Any, Any]:
        async with DatabaseConnection() as conn:
            return await _fetch_settings_and_activity(conn)

    async def _group2() -> tuple[Any, Any, Any]:
        async with DatabaseConnection() as conn:
            return await _fetch_operational_data(conn)

    async def _group3() -> tuple[Any, Any, Any]:
        async with DatabaseConnection() as conn:
            return await _fetch_analytics_data(conn)

    # ── Guard the data fetch ──────────────────────────────────────────────────
    # Every realistic failure mode for this endpoint surfaces here: a SQL/query
    # error, a connection-pool timeout, or a cross-region DB hiccup. Without this
    # guard the exception propagates as an opaque 500 with no context. We log the
    # full traceback (structlog .exception attaches exc_info — it lands in the
    # Render logs) with the admin's email, then raise HTTPException so FastAPI
    # returns a structured body the frontend's parseError() can surface. Raising
    # HTTPException (vs a raw JSONResponse) keeps the response inside the CORS
    # layer, so the 500 still carries Access-Control-Allow-Origin.
    try:
        (
            (settings_row, activity_stats),
            (launch_offer_rows, referral_rows, feedback_rows),
            (user_rows, plan_usage_rows, revenue_rows),
        ) = await asyncio.gather(_group1(), _group2(), _group3())
    except Exception as exc:
        logger.exception(
            "admin_overview_query_failed",
            admin_email=admin.email,
            error=str(exc),
            error_type=type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to load admin overview. The error has been logged.",
        ) from exc

    # ── Aggregations (PostgreSQL already pre-sorted the data) ─────────────────
    max_slots = int(settings_row["max_approved_slots"]) if settings_row else TOTAL_LAUNCH_OFFER_SLOTS
    approved_count = sum(1 for row in launch_offer_rows if row["status"] in LAUNCH_OFFER_CONSUMED_STATUSES)
    pending_rows = [row for row in launch_offer_rows if row["status"] == "pending"]
    rejected_count = sum(1 for row in launch_offer_rows if row["status"] == "rejected")

    launch_offer_items = [
        {
            "id": int(row["id"]),
            "user_id": str(row["user_id"]),
            "email": row["email"],
            "full_name": row["full_name"],
            "status": row["status"],
            "slot_number": row["slot_number"],
            "plan": row["plan"],
            "requested_at": _serialize_dt(row["requested_at"]),
            "approved_at": _serialize_dt(row["approved_at"]),
            "reviewed_at": _serialize_dt(row["reviewed_at"]),
            "approved_by_email": row["approved_by_email"],
            "expires_at": _serialize_dt(row["expires_at"]),
            "queue_position": None,
            "overall_position": row["slot_number"],
            "approval_preview_slot": None,
            "approval_preview_plan": None,
        }
        for row in launch_offer_rows
    ]

    # ── Global revenue totals from window-function columns ────────────────────
    # Extracted from the first revenue row (window functions compute the same
    # aggregate across all rows, so any row holds the correct global total).
    # Falls back to zero when the revenue table is empty (no payments yet).
    if revenue_rows:
        global_pro_revenue = int(revenue_rows[0]["global_pro_revenue"] or 0)
        global_career_revenue = int(revenue_rows[0]["global_career_revenue"] or 0)
        global_total_revenue = int(revenue_rows[0]["global_total_revenue"] or 0)
    else:
        global_pro_revenue = global_career_revenue = global_total_revenue = 0

    # ── Defensive platform_stats assembly ─────────────────────────────────────
    # refresh_user_activity_stats can return a dict with missing keys on fresh
    # deployments (no stats row yet) or after a stats-table schema change.
    # Guarding here ensures the entire dashboard remains fully functional even
    # if the activity stats subsystem is temporarily inconsistent.
    try:
        platform_stats = {
            "active_users_count":   int(activity_stats["active_users_count"]),
            "inactive_users_count": int(activity_stats["inactive_users_count"]),
            "total_users_count":    int(activity_stats["total_users_count"]),
            "live_window_minutes":  int(activity_stats["live_window_minutes"]),
            "updated_at":           _serialize_dt(activity_stats["updated_at"]),
        }
    except (KeyError, TypeError) as exc:
        logger.error(
            "admin_activity_stats_malformed",
            admin_email=admin.email,
            error=str(exc),
        )
        platform_stats = {
            "active_users_count":   0,
            "inactive_users_count": 0,
            "total_users_count":    0,
            "live_window_minutes":  0,
            "updated_at":           None,
        }

    # ── Assemble final response ───────────────────────────────────────────────
    response: dict = {
        "admin_email": admin.email,
        "launch_offer": {
            "eligible_after":    _serialize_dt(settings_row["eligible_after"]) if settings_row else None,
            "max_slots":         max_slots,
            "approved_count":    approved_count,
            "remaining_slots":   max(0, max_slots - approved_count),
            "offer_duration_days": LAUNCH_OFFER_WINDOW_DAYS,
            "pending_count":     len(pending_rows),
            "rejected_count":    rejected_count,
            "items":             launch_offer_items,
        },
        "platform_stats": platform_stats,
        "users": [
            {
                "id":                  str(row["id"]),
                "email":               row["email"],
                "full_name":           row["full_name"],
                "selected_plan":       row["selected_plan"],
                "subscription_status": row["subscription_status"],
                "is_admin":            bool(row["is_admin"]),
                "created_at":          _serialize_dt(row["created_at"]),
                "last_seen_at":        _serialize_dt(row["last_seen_at"]),
                "free_status":         "active",
                "free_interviews":     int(row["free_interviews"]),
                "free_cycle_start":    _serialize_dt(row["free_cycle_start"]),
                "free_cycle_end":      _serialize_dt(row["free_cycle_end"]),
                "pro_status":          row["pro_status"] or "not_purchased",
                "pro_activated_at":    _serialize_dt(row["pro_activated_at"]),
                "pro_expires_at":      _serialize_dt(row["pro_expires_at"]),
                "pro_interviews":      int(row["pro_interviews"]),
                "career_status":       row["career_status"] or "not_purchased",
                "career_activated_at": _serialize_dt(row["career_activated_at"]),
                "career_expires_at":   _serialize_dt(row["career_expires_at"]),
                "career_interviews":   int(row["career_interviews"]),
                "pro_purchase_count":      int(row["pro_purchase_count"]),
                "career_purchase_count":   int(row["career_purchase_count"]),
                "launch_offer": {
                    "id":          int(row["launch_offer_id"]) if row["launch_offer_id"] else None,
                    "status":      row["launch_offer_status"],
                    "plan":        row["launch_offer_plan"],
                    "slot_number": row["launch_offer_slot_number"],
                    "requested_at": _serialize_dt(row["launch_offer_requested_at"]),
                    "approved_at":  _serialize_dt(row["launch_offer_approved_at"]),
                    "reviewed_at":  _serialize_dt(row["launch_offer_reviewed_at"]),
                    "expires_at":   _serialize_dt(row["launch_offer_expires_at"]),
                },
            }
            for row in user_rows
        ],
        "referrals": [
            {
                "id":                str(row["id"]),
                "referrer_name":     row["referrer_name"],
                "referrer_email":    row["referrer_email"],
                "invited_email":     row["invited_email"],
                "invited_user_name": row["invited_user_name"],
                "invited_user_email":row["invited_user_email"],
                "status":            row["status"],
                "reward_granted":    bool(row["reward_granted"]),
                "created_at":        _serialize_dt(row["created_at"]),
                "joined_at":         _serialize_dt(row["joined_at"]),
            }
            for row in referral_rows
        ],
        "feedback": [
            {
                "id":            int(row["id"]),
                "email":         row["email"],
                "full_name":     row["full_name"],
                "feedback_text": row["feedback_text"],
                "created_at":    _serialize_dt(row["created_at"]),
            }
            for row in feedback_rows
        ],
        "plan_usage": [
            {
                "email":            r["email"],
                "full_name":        r["full_name"],
                "plan":             r["plan"],
                "total_interviews": r["total_interviews"],
                "last_interview_at":_serialize_dt(r["last_interview_at"]),
            }
            for r in plan_usage_rows
        ],
        "revenue_analytics": {
            "global_pro_revenue":    global_pro_revenue,
            "global_career_revenue": global_career_revenue,
            "global_total_revenue":  global_total_revenue,
            "user_metrics": [
                {
                    "user_id":               str(r["user_id"]),
                    "email":                 r["email"],
                    "full_name":             r["full_name"],
                    "pro_purchase_count":    int(r["pro_purchase_count"]),
                    "career_purchase_count": int(r["career_purchase_count"]),
                    "pro_revenue_paise":     int(r["pro_revenue_paise"]),
                    "career_revenue_paise":  int(r["career_revenue_paise"]),
                    "total_revenue_paise":   int(r["total_revenue_paise"]),
                    "last_payment_date":     _serialize_dt(r["last_payment_date"]),
                }
                for r in revenue_rows
            ],
        },
    }

    # ── Store in cache before returning ───────────────────────────────────────
    _OVERVIEW_CACHE[_OVERVIEW_CACHE_KEY] = response

    elapsed_ms = (time.monotonic() - t_start) * 1000
    logger.info(
        "admin_overview_served",
        admin_email=admin.email,
        elapsed_ms=round(elapsed_ms, 1),
        user_count=len(user_rows),
        launch_offer_count=len(launch_offer_rows),
        referral_count=len(referral_rows),
        feedback_count=len(feedback_rows),
        plan_usage_count=len(plan_usage_rows),
        revenue_row_count=len(revenue_rows),
    )
    return response


@router.post("/launch-offers/reset")
async def reset_launch_offers(
    admin: UserProfile = Depends(require_admin),
    reset_settings: bool = False,
    # ↑ SAFE DEFAULT: a param-less POST now performs grants-only deletion
    # (the recoverable variant). Pass ?reset_settings=true for a full reset
    # including settings. Previously this defaulted to True — meaning a
    # parameter-less call silently performed the most destructive variant.
):
    """Delete all launch-offer grants and optionally reset settings."""

    # ── Pre-action forensic audit log ─────────────────────────────────────────
    # Emitted as WARNING — destructive and irreversible. Captures who triggered
    # the reset, when, and with what scope BEFORE any data is deleted.
    # If a college coordinator reports that approved slots disappeared, this log
    # entry is the only record of who triggered the reset and what was requested.
    logger.warning(
        "admin_launch_offers_reset_initiated",
        admin_email=admin.email,
        reset_settings=reset_settings,
    )

    async with DatabaseConnection() as conn:
        result = await reset_launch_offer_data(conn, reset_settings=reset_settings)

    # ── Invalidate the admin overview cache on destructive reset ─────────────
    # Without this, the admin would see stale launch-offer counts in the
    # overview for up to 30 seconds after a reset. Clear it immediately so the
    # next overview load reflects the post-reset state.
    _OVERVIEW_CACHE.clear()

    logger.info(
        "admin_launch_offers_reset_complete",
        admin_email=admin.email,
        deleted_grants=result["deleted_grants"],
        settings_reset=result["settings_reset"],
        reset_settings_requested=reset_settings,
    )
    return {
        "status": "ok",
        "deleted_grants": result["deleted_grants"],
        "settings_reset": result["settings_reset"],
    }
