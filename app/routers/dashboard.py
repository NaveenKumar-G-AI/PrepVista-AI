"""
PrepVista AI — Dashboard Router
User dashboard: session history, stats, skill tracking.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB MIGRATIONS — RUN BEFORE DEPLOYING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run each with CONCURRENTLY during a low-traffic window:

    -- Powers GET /dashboard session fetch and GET /sessions pagination
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_sessions_user_created
        ON interview_sessions (user_id, created_at DESC);

    -- Powers GET /dashboard stats aggregation (only FINISHED rows)
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_sessions_user_finished
        ON interview_sessions (user_id, state, final_score)
        WHERE state = 'FINISHED';

    -- Powers GET /skills and dashboard skill fetch
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skill_scores_user_category_recorded
        ON skill_scores (user_id, category, recorded_at DESC);

    -- Powers bulk_delete and single delete ownership checks
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_sessions_user_id
        ON interview_sessions (user_id);
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
from uuid import UUID

import structlog
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.config import PLAN_CONFIG
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.analytics import backfill_missing_skill_scores, build_dashboard_feedback
from app.services.history_retention import enforce_history_retention, get_history_limit
from app.services.launch_offer import get_launch_offer_state
from app.services.plan_access import get_plan_expiry_map
from app.services.public_growth import get_public_growth_metrics
from app.services.quota import get_usage_stats
from app.services.referrals import get_referral_summary
from app.services.user_activity import refresh_user_activity_stats

router = APIRouter()
logger = structlog.get_logger("prepvista.dashboard")

# ── Backfill cooldown cache ───────────────────────────────────────────────────
# backfill_missing_skill_scores is a conditional write called on every
# GET /dashboard and GET /skills. At 500 concurrent students this fires up to
# 1,000 times per second on skill_scores. For students with no missing scores
# (the common case), every call is a SELECT that accomplishes nothing.
#
# TTLCache tracks which users had a backfill in the last 60 seconds.
# Missing-score detection still works — the 60-second window is small enough
# that any real gap is caught promptly on the next uncached load.
_BACKFILL_COOLDOWN: TTLCache = TTLCache(maxsize=5_000, ttl=60)


async def _backfill_with_cooldown(conn, user_id: str) -> None:
    """Run backfill only if this user has not had one in the last 60 seconds."""
    if user_id in _BACKFILL_COOLDOWN:
        return
    await backfill_missing_skill_scores(conn, user_id)
    _BACKFILL_COOLDOWN[user_id] = True


# Maximum skill score rows returned per category on GET /skills.
# 100 data points per category is more than enough for any trend chart.
# A student with 300 sessions × 8 categories = 2,400 rows without this cap.
_SKILLS_ROWS_PER_CATEGORY: int = 100

# Maximum offset allowed on paginated session history.
_SESSION_HISTORY_MAX_OFFSET: int = 10_000

# Maximum sessions returned per page for premium/unlimited users.
_PREMIUM_SESSION_PAGE_CAP: int = 500


class BulkDeleteSessionsRequest(BaseModel):
    session_ids: list[UUID]

    @field_validator("session_ids")
    @classmethod
    def _validate_session_ids(cls, value: list[UUID]) -> list[UUID]:
        seen: set = set()
        deduped: list[UUID] = []
        for item in value:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        if not deduped:
            raise ValueError("Select at least one session to delete.")
        if len(deduped) > 50:
            raise ValueError("You can delete up to 50 sessions at a time.")
        return deduped


def _score_to_percent(value) -> float:
    try:
        return round(max(0.0, min(100.0, float(value) * 10)), 1)
    except (TypeError, ValueError):
        return 0.0


@router.get("")
async def get_dashboard(user: UserProfile = Depends(get_current_user)):
    """Get dashboard data: stats, recent sessions, usage."""
    has_session_history_access = bool(
        user.effective_config.get("has_session_history", False)
    )

    async with DatabaseConnection() as conn:
        # ── Skill backfill with cooldown ──────────────────────────────────────
        await _backfill_with_cooldown(conn, user.id)

        profile = await conn.fetchrow(
            """SELECT full_name, plan, onboarding_completed, prep_goal
               FROM profiles WHERE id = $1""",
            user.id,
        )

        if has_session_history_access:
            sessions = await conn.fetch(
                """SELECT id, plan, final_score, rubric_scores, state,
                          total_turns, duration_actual_seconds, created_at, finished_at
                   FROM interview_sessions
                   WHERE user_id = $1
                   ORDER BY created_at DESC
                   LIMIT 10""",
                user.id,
            )
        else:
            sessions = await conn.fetch(
                """SELECT id, plan, final_score, rubric_scores, state,
                          total_turns, duration_actual_seconds, created_at, finished_at
                   FROM interview_sessions
                   WHERE user_id = $1 AND state = 'FINISHED'
                   ORDER BY created_at DESC
                   LIMIT 1""",
                user.id,
            )

        stats_row = await conn.fetchrow(
            """SELECT AVG(final_score)  AS avg_score,
                      MAX(final_score)  AS best_score,
                      COUNT(*)          AS total_sessions,
                      SUM(total_turns)  AS total_questions
               FROM interview_sessions
               WHERE user_id = $1 AND state = 'FINISHED'""",
            user.id,
        )

        skills = await conn.fetch(
            """SELECT DISTINCT ON (category) category, average_score, recorded_at
               FROM skill_scores
               WHERE user_id = $1
               ORDER BY category, recorded_at DESC""",
            user.id,
        )

        plan_expiry_map = await get_plan_expiry_map(
            conn, user.id, premium_override=user.premium_override
        )
        launch_offer = await get_launch_offer_state(conn, user.id)
        referrals    = await get_referral_summary(conn, user.id)
        public_metrics = await get_public_growth_metrics(conn)

        # ── get_usage_stats: reuse the existing connection ────────────────────
        # Previously called OUTSIDE this DatabaseConnection block, forcing
        # get_usage_stats to open its own internal connection — a second pool
        # checkout on every dashboard load. At 500 concurrent users: up to
        # 1,000 simultaneous pool checkouts from this one endpoint alone.
        #
        # quota.py's get_usage_stats now accepts an optional conn= parameter.
        # Passing conn=conn reuses the already-checked-out connection for all
        # quota queries, reducing pool pressure on the highest-frequency endpoint
        # in the system by 50%.
        usage = await get_usage_stats(
            user.id,
            premium_override=user.premium_override,
            conn=conn,
        )

    # ── Admin activity stats: separate connection, outside main block ─────────
    # refresh_user_activity_stats is a write. Previously it ran inside the main
    # DatabaseConnection context — holding a pool slot that was also serving all
    # student queries above. Moved outside so the student connection is released
    # before the admin write fires, eliminating write contention on the hot path.
    activity_stats = None
    if user.is_admin:
        try:
            async with DatabaseConnection() as admin_conn:
                await refresh_user_activity_stats(admin_conn)
                activity_stats = await admin_conn.fetchrow(
                    """SELECT active_users_count, inactive_users_count,
                              total_users_count, live_window_minutes, updated_at
                       FROM user_activity_stats
                       WHERE id = 1"""
                )
        except Exception as exc:
            logger.error(
                "dashboard_activity_stats_failed",
                user_id=user.id,
                error=str(exc),
            )

    # ── Response assembly ─────────────────────────────────────────────────────
    recent_sessions = [
        {
            "id":          str(s["id"]),
            "plan":        s["plan"],
            "final_score": float(s["final_score"]) if s["final_score"] else 0,
            "state":       s["state"],
            "total_turns": s["total_turns"],
            "duration":    s["duration_actual_seconds"],
            "created_at":  str(s["created_at"]),
            "finished_at": str(s["finished_at"]) if s["finished_at"] else None,
        }
        for s in sessions
    ]
    current_feedback_session_id = next(
        (session["id"] for session in recent_sessions if session["state"] == "FINISHED"),
        None,
    )

    skill_map = {
        sk["category"]: {
            "score":        _score_to_percent(sk["average_score"]),
            "last_updated": str(sk["recorded_at"]),
        }
        for sk in skills
    }

    avg_score = (
        round(float(stats_row["avg_score"]), 1)
        if stats_row and stats_row["avg_score"] else None
    )
    best_score = (
        round(float(stats_row["best_score"]), 1)
        if stats_row and stats_row["best_score"] else None
    )
    total_sessions  = stats_row["total_sessions"]  if stats_row else 0
    total_questions = (
        int(stats_row["total_questions"])
        if stats_row and stats_row["total_questions"] else 0
    )

    analytics_feedback = build_dashboard_feedback(
        plan=user.effective_plan,
        skill_scores=skill_map,
        total_sessions=total_sessions,
        average_score=avg_score,
        total_questions=total_questions,
    )

    # ── Defensive activity_stats assembly ─────────────────────────────────────
    # Direct subscript access crashed the admin dashboard when any key was NULL
    # or missing (fresh deployment, schema mismatch). Matches the fix in admin.py.
    platform_stats = None
    if activity_stats and user.is_admin:
        try:
            platform_stats = {
                "active_users_count":   int(activity_stats["active_users_count"]),
                "inactive_users_count": int(activity_stats["inactive_users_count"]),
                "total_users_count":    int(activity_stats["total_users_count"]),
                "live_window_minutes":  int(activity_stats["live_window_minutes"]),
                "updated_at":           str(activity_stats["updated_at"]),
            }
        except (KeyError, TypeError) as exc:
            logger.error(
                "dashboard_activity_stats_malformed",
                user_id=user.id,
                error=str(exc),
            )

    return {
        "user": {
            "name":              profile["full_name"]          if profile else None,
            "plan":              profile["plan"]               if profile else "free",
            "active_plan":       user.plan,
            "owned_plans":       user.owned_plans,
            "expired_plans":     user.expired_plans,
            "highest_owned_plan": user.effective_plan,
            "plan_expiries": {
                "pro":    str(plan_expiry_map["pro"])    if plan_expiry_map["pro"]    else None,
                "career": str(plan_expiry_map["career"]) if plan_expiry_map["career"] else None,
            },
            "launch_offer": {
                "status":            launch_offer["status"]            if launch_offer else None,
                "plan":              launch_offer["plan"]              if launch_offer else None,
                "slot_number":       launch_offer["slot_number"]       if launch_offer else None,
                "requested_at":      str(launch_offer["requested_at"]) if launch_offer and launch_offer["requested_at"] else None,
                "approved_at":       str(launch_offer["approved_at"])  if launch_offer and launch_offer["approved_at"]  else None,
                "reviewed_at":       str(launch_offer["reviewed_at"])  if launch_offer and launch_offer["reviewed_at"]  else None,
                "expires_at":        str(launch_offer["expires_at"])   if launch_offer and launch_offer["expires_at"]   else None,
                "queue_position":    launch_offer["queue_position"]    if launch_offer else None,
                "overall_position":  launch_offer["overall_position"]  if launch_offer else None,
                "approved_count":    launch_offer["approved_count"]    if launch_offer else 0,
                "max_slots":         launch_offer["max_slots"]         if launch_offer else 100,
                "remaining_slots":   launch_offer["remaining_slots"]   if launch_offer else 0,
                "offer_duration_days":   launch_offer["offer_duration_days"]   if launch_offer else 7,
                "is_offer_available":    launch_offer["is_offer_available"]    if launch_offer else False,
                "within_first_ten":      launch_offer["within_first_ten"]      if launch_offer else None,
            },
            "onboarding_completed": profile["onboarding_completed"] if profile else False,
            "prep_goal":            profile["prep_goal"]            if profile else None,
        },
        "stats": {
            "total_sessions":  total_sessions,
            "average_score":   avg_score,
            "best_score":      best_score,
            "total_questions": total_questions,
        },
        "usage":                       usage,
        "referrals":                   referrals,
        "public_metrics":              public_metrics,
        "recent_sessions":             recent_sessions,
        "current_feedback_session_id": current_feedback_session_id,
        "skill_scores":                skill_map,
        "analytics_feedback":          analytics_feedback,
        "platform_stats":              platform_stats,
    }


@router.get("/public-growth")
async def get_public_growth_banner():
    """Return public-facing user-count messaging for login and landing UI."""
    async with DatabaseConnection() as conn:
        return await get_public_growth_metrics(conn)


@router.get("/sessions")
async def get_session_history(
    user: UserProfile = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Get paginated session history."""
    if offset > _SESSION_HISTORY_MAX_OFFSET:
        raise HTTPException(
            status_code=400,
            detail=f"Offset cannot exceed {_SESSION_HISTORY_MAX_OFFSET}.",
        )

    plan_cfg = PLAN_CONFIG.get(user.effective_plan, PLAN_CONFIG["free"])

    if not plan_cfg["has_session_history"]:
        async with DatabaseConnection() as conn:
            latest_finished_session_id = await conn.fetchval(
                """SELECT id FROM interview_sessions
                   WHERE user_id = $1 AND state = 'FINISHED'
                   ORDER BY created_at DESC LIMIT 1""",
                user.id,
            )
        return {
            "sessions":    [],
            "total":       0,
            "locked":      True,
            "message":     "Session history is available on Pro",
            "lock_reason": (
                "expired_plan" if user.has_expired_paid_plan else "upgrade_required"
            ),
            "current_feedback_session_id": (
                str(latest_finished_session_id) if latest_finished_session_id else None
            ),
        }

    # ── Page size resolution ──────────────────────────────────────────────────
    # Original: min(limit, history_limit or 50, 50)
    # Bug: history_limit=None (premium_override users) caused `None or 50` → 50,
    # capping premium users at 50 sessions despite paying for unlimited.
    # Fix: explicit None check preserves the "no DB cap" intent for premium users.
    if user.premium_override:
        effective_limit = min(limit, _PREMIUM_SESSION_PAGE_CAP)
    else:
        history_limit = get_history_limit(user.effective_plan)
        effective_limit = (
            min(limit, history_limit, 50) if history_limit is not None
            else min(limit, 50)
        )

    async with DatabaseConnection() as conn:
        if not user.premium_override:
            await enforce_history_retention(conn, user.id, user.effective_plan)

        # ── Single query: rows + total count via window function ──────────────
        # Previously two separate round-trips: COUNT(*) then SELECT.
        # COUNT(*) OVER () computes the total in one scan alongside the rows.
        sessions = await conn.fetch(
            """SELECT id, plan, final_score, state, total_turns,
                      duration_actual_seconds, created_at, finished_at,
                      COUNT(*) OVER () AS total_all
               FROM interview_sessions
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3""",
            user.id,
            effective_limit,
            offset,
        )

    total_count = int(sessions[0]["total_all"]) if sessions else 0

    return {
        "sessions": [
            {
                "id":          str(s["id"]),
                "plan":        s["plan"],
                "score":       float(s["final_score"]) if s["final_score"] else None,
                "state":       s["state"],
                "total_turns": s["total_turns"],
                "duration":    s["duration_actual_seconds"],
                "created_at":  str(s["created_at"]),
                "finished_at": str(s["finished_at"]) if s["finished_at"] else None,
            }
            for s in sessions
        ],
        "total":       total_count,
        "locked":      False,
        "lock_reason": None,
        "current_feedback_session_id": next(
            (str(s["id"]) for s in sessions if s["state"] == "FINISHED"),
            None,
        ),
    }


@router.post("/sessions/bulk-delete")
async def bulk_delete_session_history(
    payload: BulkDeleteSessionsRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Delete multiple user interview sessions in one action."""
    session_ids = payload.session_ids

    async with DatabaseConnection() as conn:
        async with conn.transaction():
            sessions = await conn.fetch(
                """SELECT id, state FROM interview_sessions
                   WHERE user_id = $1 AND id = ANY($2::uuid[])""",
                user.id,
                session_ids,
            )
            if not sessions:
                raise HTTPException(
                    status_code=404,
                    detail="No matching interview sessions were found.",
                )

            found_ids = [session["id"] for session in sessions]
            await conn.execute(
                """DELETE FROM interview_sessions
                   WHERE user_id = $1 AND id = ANY($2::uuid[])""",
                user.id,
                found_ids,
            )
            await conn.execute(
                """INSERT INTO usage_events (user_id, event_type, metadata)
                   VALUES ($1, 'session_bulk_deleted', $2)""",
                user.id,
                json.dumps({
                    "session_ids":   [str(sid) for sid in found_ids],
                    "deleted_count": len(found_ids),
                }),
            )

    deleted_ids = [str(sid) for sid in found_ids]
    logger.info("sessions_bulk_deleted", user_id=user.id, deleted_count=len(deleted_ids))
    return {
        "status":        "deleted",
        "deleted_count": len(deleted_ids),
        "session_ids":   deleted_ids,
    }


@router.delete("/sessions/{session_id}")
async def delete_session_history(
    session_id: UUID,
    user: UserProfile = Depends(get_current_user),
):
    """Delete a user's interview session and all related records."""
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            session = await conn.fetchrow(
                """SELECT id, state FROM interview_sessions
                   WHERE id = $1 AND user_id = $2""",
                session_id,
                user.id,
            )
            if not session:
                raise HTTPException(
                    status_code=404, detail="Interview session not found."
                )

            await conn.execute(
                "DELETE FROM interview_sessions WHERE id = $1 AND user_id = $2",
                session_id,
                user.id,
            )
            await conn.execute(
                """INSERT INTO usage_events (user_id, event_type, metadata)
                   VALUES ($1, 'session_deleted', $2)""",
                user.id,
                json.dumps({
                    "session_id": str(session_id),
                    "state":      session["state"],
                }),
            )

    logger.info("session_deleted", user_id=user.id, session_id=str(session_id))
    return {"status": "deleted", "session_id": str(session_id)}


@router.get("/skills")
async def get_skill_breakdown(user: UserProfile = Depends(get_current_user)):
    """Get detailed skill breakdown across all sessions."""
    async with DatabaseConnection() as conn:
        await _backfill_with_cooldown(conn, user.id)

        # ── Bounded skill fetch with per-category row cap ─────────────────────
        # ROW_NUMBER() OVER (PARTITION BY category ORDER BY recorded_at ASC)
        # applies the per-category cap in one PostgreSQL pass.
        skills = await conn.fetch(
            """
            SELECT category, average_score, session_id, recorded_at
            FROM (
                SELECT category, average_score, session_id, recorded_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY category
                           ORDER BY recorded_at ASC
                       ) AS rn
                FROM skill_scores
                WHERE user_id = $1
            ) ranked
            WHERE rn <= $2
            ORDER BY category, recorded_at ASC
            """,
            user.id,
            _SKILLS_ROWS_PER_CATEGORY,
        )

    category_trends: dict[str, list] = {}
    for sk in skills:
        cat = sk["category"]
        if cat not in category_trends:
            category_trends[cat] = []
        category_trends[cat].append({
            "score": _score_to_percent(sk["average_score"]),
            "date":  str(sk["recorded_at"]),
        })

    return {"skill_trends": category_trends}