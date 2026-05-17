"""
PrepVista - Admin Router
Admin-only oversight for users, launch-offer metrics, referrals, and feedback.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.launch_offer import (
    LAUNCH_OFFER_WINDOW_DAYS,
    LAUNCH_OFFER_CONSUMED_STATUSES,
    TOTAL_LAUNCH_OFFER_SLOTS,
    reset_launch_offer_data,
)
from app.services.user_activity import refresh_user_activity_stats

router = APIRouter()


def require_admin(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Allow admin-only endpoints for the configured admin account."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access only.")
    return user


def _serialize_dt(value) -> str | None:
    return str(value) if value else None


def _paid_status(active_flag, expired_flag) -> str:
    if active_flag:
        return "active"
    if expired_flag:
        return "expired"
    return "not_purchased"


@router.get("/overview")
async def get_admin_overview(admin: UserProfile = Depends(require_admin)):
    """Return one admin snapshot for users, launch-offer metrics, referrals, and feedback."""
    async with DatabaseConnection() as conn:
        activity_stats = await refresh_user_activity_stats(conn)
        settings_row = await conn.fetchrow(
            """SELECT eligible_after, max_approved_slots
               FROM launch_offer_settings
               WHERE id = 1"""
        )

        user_rows = await conn.fetch(
            """
            WITH entitlement_rollup AS (
                SELECT
                    user_id,
                    MAX(CASE WHEN plan = 'pro' THEN status END) AS pro_status,
                    MAX(CASE WHEN plan = 'pro' THEN activated_at END) AS pro_activated_at,
                    MAX(CASE WHEN plan = 'pro' THEN expires_at END) AS pro_expires_at,
                    MAX(CASE WHEN plan = 'career' THEN status END) AS career_status,
                    MAX(CASE WHEN plan = 'career' THEN activated_at END) AS career_activated_at,
                    MAX(CASE WHEN plan = 'career' THEN expires_at END) AS career_expires_at
                FROM (
                    SELECT user_id, plan, status, activated_at, expires_at,
                           ROW_NUMBER() OVER(PARTITION BY user_id, plan ORDER BY created_at DESC) as rn
                    FROM user_plan_entitlements
                ) sub
                WHERE rn = 1
                GROUP BY user_id
            ),
            interview_rollup AS (
                SELECT
                    user_id,
                    MAX(CASE WHEN plan = 'free' THEN total_interviews ELSE 0 END) AS free_interviews,
                    MAX(CASE WHEN plan = 'free' THEN current_cycle_start END) AS free_cycle_start,
                    MAX(CASE WHEN plan = 'free' THEN current_cycle_end END) AS free_cycle_end,
                    MAX(CASE WHEN plan = 'pro' THEN total_interviews ELSE 0 END) AS pro_interviews,
                    MAX(CASE WHEN plan = 'career' THEN total_interviews ELSE 0 END) AS career_interviews
                FROM user_plan_interviews
                GROUP BY user_id
            ),
            payment_rollup AS (
                SELECT
                    user_id,
                    COUNT(*) FILTER (WHERE plan = 'pro' AND status = 'verified')::INT AS pro_purchase_count,
                    COUNT(*) FILTER (WHERE plan = 'career' AND status = 'verified')::INT AS career_purchase_count
                FROM payments
                GROUP BY user_id
            )
            SELECT
                p.id,
                p.email,
                p.full_name,
                p.plan AS selected_plan,
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
                COALESCE(pr.pro_purchase_count, 0) AS pro_purchase_count,
                COALESCE(pr.career_purchase_count, 0) AS career_purchase_count,
                COALESCE(ir.free_interviews, 0) AS free_interviews,
                COALESCE(ir.pro_interviews, 0) AS pro_interviews,
                COALESCE(ir.career_interviews, 0) AS career_interviews,
                ir.free_cycle_start,
                ir.free_cycle_end,
                lg.id AS launch_offer_id,
                lg.status AS launch_offer_status,
                lg.plan AS launch_offer_plan,
                lg.slot_number AS launch_offer_slot_number,
                lg.requested_at AS launch_offer_requested_at,
                lg.approved_at AS launch_offer_approved_at,
                lg.reviewed_at AS launch_offer_reviewed_at,
                lg.expires_at AS launch_offer_expires_at
            FROM profiles p
            LEFT JOIN entitlement_rollup er ON er.user_id = p.id
            LEFT JOIN interview_rollup ir ON ir.user_id = p.id
            LEFT JOIN payment_rollup pr ON pr.user_id = p.id
            LEFT JOIN launch_offer_grants lg ON lg.user_id = p.id
            ORDER BY p.created_at DESC
            LIMIT 500
            """
        )

        launch_offer_rows = await conn.fetch(
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
                    WHEN 'pending' THEN 0
                    WHEN 'approved' THEN 1
                    WHEN 'expired' THEN 2
                    ELSE 3
                END,
                lg.requested_at ASC,
                lg.id ASC
            """
        )

        referral_rows = await conn.fetch(
            """
            SELECT
                r.id,
                r.invited_email,
                r.status,
                r.reward_granted,
                r.created_at,
                r.joined_at,
                ref.full_name AS referrer_name,
                ref.email AS referrer_email,
                invited.full_name AS invited_user_name,
                invited.email AS invited_user_email
            FROM referrals r
            JOIN profiles ref
              ON ref.id = r.referrer_user_id
            LEFT JOIN profiles invited
              ON invited.id = r.invited_user_id
            ORDER BY r.created_at DESC
            LIMIT 200
            """
        )

        feedback_rows = await conn.fetch(
            """
            SELECT id, email, full_name, feedback_text, created_at
            FROM feedback_entries
            ORDER BY created_at DESC
            LIMIT 200
            """
        )

        plan_usage_rows = await conn.fetch(
            """
            SELECT p.email, p.full_name, u.plan, u.total_interviews, u.last_interview_at
            FROM user_plan_interviews u
            JOIN profiles p ON p.id = u.user_id
            ORDER BY u.total_interviews DESC, u.last_interview_at DESC
            LIMIT 200
            """
        )

        revenue_rows = await conn.fetch(
            """
            SELECT 
                user_id, email, full_name, 
                pro_purchase_count, career_purchase_count,
                pro_revenue_paise, career_revenue_paise, total_revenue_paise,
                last_payment_date
            FROM user_revenue_analytics
            ORDER BY total_revenue_paise DESC, last_payment_date DESC
            """
        )

        global_revenue = await conn.fetchrow(
            """
            SELECT 
                COALESCE(SUM(pro_revenue_paise), 0) AS global_pro_revenue,
                COALESCE(SUM(career_revenue_paise), 0) AS global_career_revenue,
                COALESCE(SUM(total_revenue_paise), 0) AS global_total_revenue
            FROM user_revenue_analytics
            """
        )

    max_slots = int(settings_row["max_approved_slots"]) if settings_row else TOTAL_LAUNCH_OFFER_SLOTS
    approved_count = sum(1 for row in launch_offer_rows if row["status"] in LAUNCH_OFFER_CONSUMED_STATUSES)
    pending_rows = [row for row in launch_offer_rows if row["status"] == "pending"]
    rejected_count = sum(1 for row in launch_offer_rows if row["status"] == "rejected")

    launch_offer_items = []
    for row in launch_offer_rows:
        launch_offer_items.append(
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
        )

    return {
        "admin_email": admin.email,
        "launch_offer": {
            "eligible_after": _serialize_dt(settings_row["eligible_after"]) if settings_row else None,
            "max_slots": max_slots,
            "approved_count": approved_count,
            "remaining_slots": max(0, max_slots - approved_count),
            "offer_duration_days": LAUNCH_OFFER_WINDOW_DAYS,
            "pending_count": len(pending_rows),
            "rejected_count": rejected_count,
            "items": launch_offer_items,
        },
        "platform_stats": {
            "active_users_count": int(activity_stats["active_users_count"]),
            "inactive_users_count": int(activity_stats["inactive_users_count"]),
            "total_users_count": int(activity_stats["total_users_count"]),
            "live_window_minutes": int(activity_stats["live_window_minutes"]),
            "updated_at": _serialize_dt(activity_stats["updated_at"]),
        },
        "users": [
            {
                "id": str(row["id"]),
                "email": row["email"],
                "full_name": row["full_name"],
                "selected_plan": row["selected_plan"],
                "subscription_status": row["subscription_status"],
                "is_admin": bool(row["is_admin"]),
                "created_at": _serialize_dt(row["created_at"]),
                "last_seen_at": _serialize_dt(row["last_seen_at"]),
                "free_status": "active",
                "free_interviews": int(row["free_interviews"]),
                "free_cycle_start": _serialize_dt(row["free_cycle_start"]),
                "free_cycle_end": _serialize_dt(row["free_cycle_end"]),
                "pro_status": row["pro_status"] or "not_purchased",
                "pro_activated_at": _serialize_dt(row["pro_activated_at"]),
                "pro_expires_at": _serialize_dt(row["pro_expires_at"]),
                "pro_interviews": int(row["pro_interviews"]),
                "career_status": row["career_status"] or "not_purchased",
                "career_activated_at": _serialize_dt(row["career_activated_at"]),
                "career_expires_at": _serialize_dt(row["career_expires_at"]),
                "career_interviews": int(row["career_interviews"]),
                "pro_purchase_count": int(row["pro_purchase_count"]),
                "career_purchase_count": int(row["career_purchase_count"]),
                "launch_offer": {
                    "id": int(row["launch_offer_id"]) if row["launch_offer_id"] else None,
                    "status": row["launch_offer_status"],
                    "plan": row["launch_offer_plan"],
                    "slot_number": row["launch_offer_slot_number"],
                    "requested_at": _serialize_dt(row["launch_offer_requested_at"]),
                    "approved_at": _serialize_dt(row["launch_offer_approved_at"]),
                    "reviewed_at": _serialize_dt(row["launch_offer_reviewed_at"]),
                    "expires_at": _serialize_dt(row["launch_offer_expires_at"]),
                },
            }
            for row in user_rows
        ],
        "referrals": [
            {
                "id": str(row["id"]),
                "referrer_name": row["referrer_name"],
                "referrer_email": row["referrer_email"],
                "invited_email": row["invited_email"],
                "invited_user_name": row["invited_user_name"],
                "invited_user_email": row["invited_user_email"],
                "status": row["status"],
                "reward_granted": bool(row["reward_granted"]),
                "created_at": _serialize_dt(row["created_at"]),
                "joined_at": _serialize_dt(row["joined_at"]),
            }
            for row in referral_rows
        ],
        "feedback": [
            {
                "id": int(row["id"]),
                "email": row["email"],
                "full_name": row["full_name"],
                "feedback_text": row["feedback_text"],
                "created_at": _serialize_dt(row["created_at"]),
            }
            for row in feedback_rows
        ],
        "plan_usage": [
            {
                "email": r["email"],
                "full_name": r["full_name"],
                "plan": r["plan"],
                "total_interviews": r["total_interviews"],
                "last_interview_at": _serialize_dt(r["last_interview_at"]),
            }
            for r in plan_usage_rows
        ],
        "revenue_analytics": {
            "global_pro_revenue": int(global_revenue["global_pro_revenue"]) if global_revenue else 0,
            "global_career_revenue": int(global_revenue["global_career_revenue"]) if global_revenue else 0,
            "global_total_revenue": int(global_revenue["global_total_revenue"]) if global_revenue else 0,
            "user_metrics": [
                {
                    "user_id": str(r["user_id"]),
                    "email": r["email"],
                    "full_name": r["full_name"],
                    "pro_purchase_count": int(r["pro_purchase_count"]),
                    "career_purchase_count": int(r["career_purchase_count"]),
                    "pro_revenue_paise": int(r["pro_revenue_paise"]),
                    "career_revenue_paise": int(r["career_revenue_paise"]),
                    "total_revenue_paise": int(r["total_revenue_paise"]),
                    "last_payment_date": _serialize_dt(r["last_payment_date"]),
                }
                for r in revenue_rows
            ]
        }
    }


@router.post("/launch-offers/reset")
async def reset_launch_offers(
    admin: UserProfile = Depends(require_admin),
    reset_settings: bool = True,
):
    """Delete all launch-offer grants and optionally reset settings."""
    async with DatabaseConnection() as conn:
        result = await reset_launch_offer_data(conn, reset_settings=reset_settings)
    return {
        "status": "ok",
        "deleted_grants": result["deleted_grants"],
        "settings_reset": result["settings_reset"],
    }
