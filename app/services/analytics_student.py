"""
PrepVista AI - Analytics Student
Extracted from analytics.py - B2C coaching feedback, student history,
growth aggregation, and DB syncing.

Re-exported by analytics.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json
from datetime import datetime, date
from collections import defaultdict
import structlog

from app.config import PLAN_CONFIG
from app.services.analytics_helpers import (
    _to_float,
    _format_category_name,
    _safe_str,
    _validate_uuid_str,
    _safe_department,
    _safe_graduation_year,
    _iso_date,
    _linear_regression_slope,
    _percentile_rank,
    _sessions_to_threshold,
    _bucket_into_tier,
    _growth_metrics_from_series,
    _MAX_FEEDBACK_STR_LEN,
    _DEFAULT_TARGET_SCORE,
    FREE_NEXT_STEP_BY_CATEGORY,
    VALID_RUBRIC_CATEGORIES,
    _BACKFILL_SESSION_LIMIT,
    RUBRIC_CATEGORY_DISPLAY_ORDER,
    READINESS_TIER_AT_RISK,
    _MIN_SESSIONS_FOR_RISK_EVAL,
    READINESS_TIER_COLOR,
    _STUCK_MIN_SESSIONS,
)

logger = structlog.get_logger("prepvista.analytics")

def build_dashboard_feedback(
    plan: str,
    skill_scores: dict[str, dict],
    total_sessions: int,
    average_score: float | None,
    total_questions: int,
) -> dict:
    """Create beginner-friendly analytics coaching text, with stronger Free-plan guidance."""
    normalized_plan = str(plan or "free").lower().strip()
    sorted_skills = sorted(
        skill_scores.items(),
        key=lambda item: float(item[1].get("score") or 0),
        reverse=True,
    )
    strongest = sorted_skills[0] if sorted_skills else None
    weakest = sorted_skills[-1] if sorted_skills else None

    if normalized_plan != "free":
        strongest_name = _format_category_name(strongest[0]) if strongest else "your strongest category"
        weakest_name = _format_category_name(weakest[0]) if weakest else "the next category to improve"
        return {
            "coach_insight": (
                f"Your strongest signal right now is {strongest_name}, while {weakest_name} is the clearest place to improve."
                if strongest and weakest and strongest[0] != weakest[0]
                else "Keep using your latest interviews to sharpen structure, clarity, and depth across categories."
            ),
            "recommended_mode": "Career Deep Dive" if normalized_plan == "career" else "Technical Mock",
            "strongest_signal": (
                f"{strongest_name} is currently your strongest scoring signal."
                if strongest
                else "Complete more interviews to surface your strongest category."
            ),
            "improvement_signal": (
                f"{weakest_name} is the clearest next place to improve."
                if weakest
                else "Complete more interviews to surface your next improvement area."
            ),
            "next_step": "Run one more interview while your latest feedback is still fresh.",
        }

    if total_sessions == 0:
        return {
            "coach_insight": "You are in the first practice stage. The free plan will coach you to answer clearly, keep ideas simple, and add one useful detail each time.",
            "recommended_mode": "Core Confidence Mock",
            "strongest_signal": "Your strongest signal will appear after the first completed interview.",
            "improvement_signal": "Your first goal is simple: answer every question in 2-3 short sentences.",
            "next_step": "Finish one full free interview to unlock real beginner coaching patterns.",
        }

    strongest_name = _format_category_name(strongest[0]) if strongest else "Communication"
    weakest_name = _format_category_name(weakest[0]) if weakest else "Communication"
    weakest_next_step = FREE_NEXT_STEP_BY_CATEGORY.get((weakest[0] if weakest else "communication"), "Use 2-3 short sentences and add one concrete detail.")

    if strongest and weakest and strongest[0] != weakest[0]:
        coach_insight = (
            f"Your strongest beginner signal is {strongest_name}, but {weakest_name} is still holding your score back. "
            "Keep the answer short, clear, and grounded in one real detail there."
        )
    elif strongest:
        coach_insight = (
            f"Your {strongest_name} answers are becoming more consistent. Keep that same simple structure in the next round."
        )
    else:
        coach_insight = "Your finished interviews are starting to form beginner coaching patterns. Complete one more round to make the recommendations sharper."

    score_text = f"{round(average_score)}" if average_score is not None else "0"
    strongest_signal = (
        f"{strongest_name} is your strongest free-plan signal right now. Keep repeating the same clear answer style that already works there."
        if strongest
        else "Complete another interview to surface your strongest beginner signal."
    )
    improvement_signal = (
        f"{weakest_name} is the clearest next gain. {weakest_next_step}"
        if weakest
        else "The next improvement step is to answer every question with one clear example."
    )

    return {
        "coach_insight": coach_insight,
        "recommended_mode": "Core Confidence Mock",
        "strongest_signal": strongest_signal,
        "improvement_signal": improvement_signal,
        "next_step": (
            f"Current average: {score_text}/100 across {total_questions or 0} answered question signals. "
            f"Next round, focus on {weakest_name.lower() if weakest else 'clear structure'} first."
        ),
    }


def build_interview_neural_feedback(
    plan: str,
    question_evaluations: list[dict],
    strengths: list[str],
    weaknesses: list[str],
    final_score: float,
) -> dict | None:
    """Build interview-end neural feedback. Free gets the upgraded beginner-coach version."""
    normalized_plan = str(plan or "free").lower().strip()
    if normalized_plan != "free":
        return None

    category_scores: dict[str, list[float]] = defaultdict(list)
    for evaluation in question_evaluations:
        category = str(evaluation.get("rubric_category") or "communication").strip() or "communication"
        score = _to_float(evaluation.get("score"))
        if score is not None:
            category_scores[category].append(score)

    strongest_category = None
    weakest_category = None
    if category_scores:
        averages = {
            category: sum(scores) / len(scores)
            for category, scores in category_scores.items()
            if scores
        }
        if averages:
            strongest_category = max(averages, key=averages.get)
            weakest_category = min(averages, key=averages.get)

    strongest_name = _format_category_name(strongest_category or "communication")
    weakest_name = _format_category_name(weakest_category or "communication")
    summary = (
        "You already show a strong beginner foundation. The next step is making every answer shorter, clearer, and easier to follow."
        if final_score >= 70
        else "You show real understanding of your projects and tools. The biggest next gain is expressing that understanding in shorter, clearer answers."
        if final_score >= 50
        else "You are building the foundation now. Keep the answer simple, stay on the question, and add one useful detail each time."
    )

    return {
        "summary": _safe_str(summary),
        "strength_signal": _safe_str(strengths[0]) if strengths else f"Your strongest signal today was {strongest_name}.",
        "growth_focus": (
            _safe_str(weaknesses[0])
            if weaknesses
            else FREE_NEXT_STEP_BY_CATEGORY.get(weakest_category or "communication", "Use 2-3 short sentences and add one concrete detail.")
        ),
        "next_step": FREE_NEXT_STEP_BY_CATEGORY.get(
            weakest_category or "communication",
            "Use 2-3 short sentences and add one concrete detail.",
        ),
        "focus_category": _safe_str(weakest_name),
    }


# ════════════════════════════════════════════════════════════════
# SECTION: Skill-score persistence (derive_skill_score_rows fixed —
# see ✅ FIXED comment inline; sync/backfill unchanged)
# ════════════════════════════════════════════════════════════════


def derive_skill_score_rows(evaluations: list[dict]) -> list[dict]:
    """Aggregate per-question evaluations into category-level skill rows."""
    category_scores: dict[str, list[float]] = defaultdict(list)

    for evaluation in evaluations:
        raw_category = str(evaluation.get("rubric_category") or "technical_depth").strip() or "technical_depth"
        # ✅ SEC: Validate category against allowlist before accumulating.
        # Without this, any string from the evaluator (including malformed output
        # from a runaway model) gets persisted in skill_scores and returned in
        # analytics API responses. Unknown categories fall back to "technical_depth".
        category = raw_category if raw_category in VALID_RUBRIC_CATEGORIES else "technical_depth"
        if raw_category != category:
            logger.warning(
                "invalid_rubric_category_coerced",
                raw_category=raw_category[:64],
                coerced_to="technical_depth",
            )

        score = _to_float(evaluation.get("score"))
        if score is not None:
            category_scores[category].append(score)

        # ✅ FIXED: previously accumulated communication_score into a SEPARATE
        # `delivery_scores` list and unconditionally appended a second row
        # with category="delivery" below. "delivery" is itself a member of
        # VALID_RUBRIC_CATEGORIES, so if any evaluation in this session also
        # had rubric_category == "delivery", category_scores["delivery"]
        # would ALREADY be populated by the block above — producing TWO rows
        # with category="delivery" for the same session_id. executemany in
        # sync_session_skill_scores then violates the (session_id, category)
        # uniqueness skill_scores relies on, rolling back the whole sync for
        # that session (and silently breaking backfill, which only logs and
        # moves on). Fix: merge communication_score samples into the SAME
        # "delivery" bucket as any rubric_category="delivery" samples, so
        # there is at most one "delivery" row per session either way.
        communication_score = _to_float(evaluation.get("communication_score"))
        if communication_score is not None and communication_score > 0:
            category_scores["delivery"].append(communication_score)

    return [
        {
            "category": category,
            "average_score": round(sum(scores) / len(scores), 1),
            "question_count": len(scores),
        }
        for category, scores in category_scores.items()
        if scores
    ]


async def sync_session_skill_scores(conn, session_id: str, user_id: str, evaluations: list[dict] | None = None) -> int:
    """Replace persisted skill rows for a session with fresh aggregates."""
    # ✅ SEC: Validate UUIDs before passing to asyncpg. Non-UUID values cause raw
    # PostgreSQL errors that leak internal schema details in the error response.
    try:
        safe_session_id = _validate_uuid_str(session_id, "session_id")
        safe_user_id = _validate_uuid_str(user_id, "user_id")
    except ValueError as exc:
        logger.warning("sync_skill_scores_invalid_uuid", error=str(exc))
        return 0

    if evaluations is None:
        eval_rows = await conn.fetch(
            """SELECT rubric_category, score, communication_score
               FROM question_evaluations
               WHERE session_id = $1
               ORDER BY turn_number""",
            safe_session_id,
        )
        evaluations = [dict(row) for row in eval_rows]

    rows = derive_skill_score_rows(evaluations)

    if not rows:
        logger.debug(
            "sync_skill_scores_no_rows",
            session_id=safe_session_id,
            user_id=safe_user_id,
        )
        return 0

    # ✅ FIXED: DELETE + executemany now inside a transaction.
    # Previously: DELETE succeeded, executemany failed → skill_scores permanently
    # empty for that session with no recovery. The transaction rolls both back
    # atomically — either both succeed or neither happens.
    async with conn.transaction():
        await conn.execute("DELETE FROM skill_scores WHERE session_id = $1", safe_session_id)
        await conn.executemany(
            """INSERT INTO skill_scores (user_id, session_id, category, average_score, question_count)
               VALUES ($1, $2, $3, $4, $5)""",
            [
                (
                    safe_user_id,
                    safe_session_id,
                    row["category"],
                    row["average_score"],
                    row["question_count"],
                )
                for row in rows
            ],
        )

    logger.info(
        "session_skill_scores_synced",
        user_id=safe_user_id,
        session_id=safe_session_id,
        category_count=len(rows),
    )
    return len(rows)


async def backfill_missing_skill_scores(conn, user_id: str) -> int:
    """Fill analytics rows for older finished sessions that predate skill tracking.

    Processes up to _BACKFILL_SESSION_LIMIT sessions per call to avoid DB timeout.
    Per-session errors are logged and skipped — one bad session never stops the rest.
    """
    # ✅ SEC: Validate user_id before DB query
    try:
        safe_user_id = _validate_uuid_str(user_id, "user_id")
    except ValueError as exc:
        logger.warning("backfill_invalid_user_id", error=str(exc))
        return 0

    sessions = await conn.fetch(
        """SELECT s.id
           FROM interview_sessions s
           WHERE s.user_id = $1
             AND s.state = 'FINISHED'
             AND EXISTS (
                 SELECT 1
                 FROM question_evaluations qe
                 WHERE qe.session_id = s.id
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM skill_scores ss
                 WHERE ss.session_id = s.id
             )
           ORDER BY COALESCE(s.finished_at, s.created_at) ASC
           LIMIT $2""",
        # ✅ PERF: Added LIMIT — previously unlimited. A user with 200 old sessions
        # loaded all 200 rows then ran 200 sequential sync_session_skill_scores calls,
        # each doing DELETE + fetch evals + executemany. Guaranteed DB timeout.
        # Process in batches of _BACKFILL_SESSION_LIMIT — caller can loop if needed.
        safe_user_id,
        _BACKFILL_SESSION_LIMIT,
    )

    backfilled_sessions = 0
    failed_sessions = 0
    for session in sessions:
        session_id_str = str(session["id"])
        try:
            # ✅ FIXED: Per-session try/except — previously no error handling meant
            # one corrupt evaluation row stopped the entire backfill for the user.
            # All remaining sessions would silently never get synced.
            created_rows = await sync_session_skill_scores(conn, session_id_str, safe_user_id)
            if created_rows:
                backfilled_sessions += 1
        except Exception as exc:
            failed_sessions += 1
            logger.warning(
                "backfill_session_failed",
                user_id=safe_user_id,
                session_id=session_id_str,
                error=str(exc),
            )
            # Continue with the next session — never let one failure stop the rest

    if backfilled_sessions or failed_sessions:
        logger.info(
            "skill_scores_backfilled",
            user_id=safe_user_id,
            session_count=backfilled_sessions,
            failed_count=failed_sessions,
            limit=_BACKFILL_SESSION_LIMIT,
        )

    return backfilled_sessions


# ════════════════════════════════════════════════════════════════
# SECTION: Student growth & readiness (NEW)
# Serves Q1 (placement-ready now?), Q4 (growth, not snapshots),
# Q5 (zero-offer risk) for a single student's detail view.
# ════════════════════════════════════════════════════════════════


async def fetch_student_session_history(conn, user_id: str) -> list[dict]:
    """Chronological, scored, finished sessions for one student.

    ONE query with a window function for the 1-based session index used as
    the x-axis for trend-slope math (see _linear_regression_slope). Sessions
    without a final_score are excluded — they have not been graded yet and
    would distort the regression.

    ASSUMPTION: `interview_sessions` has a numeric `final_score` column and a
    `target_role` text column — see Phase 4 assumption ledger. Both are read
    here but the contract (return shape) is stable even if the underlying
    column names differ; only the SQL would need a one-line rename.
    """
    try:
        safe_user_id = _validate_uuid_str(user_id, "user_id")
    except ValueError as exc:
        logger.warning("student_session_history_invalid_user_id", error=str(exc))
        return []

    rows = await conn.fetch(
        """
        SELECT
            id AS session_id,
            final_score,
            target_role,
            COALESCE(finished_at, created_at) AS session_date,
            ROW_NUMBER() OVER (ORDER BY COALESCE(finished_at, created_at) ASC) AS session_index
        FROM interview_sessions
        WHERE user_id = $1
          AND state = 'FINISHED'
          AND final_score IS NOT NULL
        ORDER BY session_index ASC
        """,
        safe_user_id,
    )
    return [
        {
            "session_id": str(row["session_id"]),
            "session_index": row["session_index"],
            "session_date": row["session_date"],
            "final_score": _to_float(row["final_score"]),
            "target_role": row["target_role"],
        }
        for row in rows
    ]


async def fetch_student_category_history(conn, user_id: str) -> dict[str, list[dict]]:
    """Chronological skill_scores history for one student, grouped by category.

    ONE query (JOIN + per-category window function) — avoids a separate round
    trip per rubric category. Returned dict only contains categories the
    student has at least one scored session for; callers that need all 19
    categories (e.g. radar charts) should iterate RUBRIC_CATEGORY_DISPLAY_ORDER
    and treat a missing key as "no data yet" (see build_student_radar_data).
    """
    try:
        safe_user_id = _validate_uuid_str(user_id, "user_id")
    except ValueError as exc:
        logger.warning("student_category_history_invalid_user_id", error=str(exc))
        return {}

    rows = await conn.fetch(
        """
        SELECT
            ss.category,
            ss.average_score,
            ss.question_count,
            COALESCE(s.finished_at, s.created_at) AS session_date,
            ROW_NUMBER() OVER (
                PARTITION BY ss.category
                ORDER BY COALESCE(s.finished_at, s.created_at) ASC
            ) AS session_index
        FROM skill_scores ss
        JOIN interview_sessions s ON s.id = ss.session_id
        WHERE ss.user_id = $1
          AND s.state = 'FINISHED'
        ORDER BY ss.category ASC, session_index ASC
        """,
        safe_user_id,
    )

    history: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        history[row["category"]].append(
            {
                "session_index": row["session_index"],
                "session_date": row["session_date"],
                "average_score": _to_float(row["average_score"]),
                "question_count": row["question_count"],
            }
        )
    return dict(history)


def compute_student_overall_growth(
    session_history: list[dict], target_score: float = _DEFAULT_TARGET_SCORE
) -> dict:
    """Overall (cross-category) growth metrics from final_score history.

    [Q4] delta, trend_slope, sessions_to_threshold, is_stuck — see
    _growth_metrics_from_series for the formulas. Pure function: operates on
    fetch_student_session_history's output, no DB access.
    """
    scores = [
        s for s in (_to_float(row.get("final_score")) for row in session_history) if s is not None
    ]
    return _growth_metrics_from_series(scores, target_score)


def compute_student_category_growth(
    category_history: dict[str, list[dict]], target_score: float = _DEFAULT_TARGET_SCORE
) -> dict[str, dict]:
    """Per-category growth metrics for every rubric category the student has
    at least one scored session for. [Q4]

    Categories with zero recorded sessions are omitted — growth metrics are
    meaningless without at least one data point, and build_student_radar_data
    handles the "no data yet" case separately for display purposes.
    """
    result: dict[str, dict] = {}
    for category in RUBRIC_CATEGORY_DISPLAY_ORDER:
        rows = category_history.get(category) or []
        scores = [
            s for s in (_to_float(r.get("average_score")) for r in rows) if s is not None
        ]
        if not scores:
            continue
        result[category] = _growth_metrics_from_series(scores, target_score)
    return result


def compute_student_readiness(overall_growth: dict) -> dict:
    """Readiness tier + zero-offer-risk flag for one student. [Q1, Q5]

    Tiering: _bucket_into_tier(latest_score) — Ready >= 75, Almost Ready >=
    60, Developing >= 45, else At Risk; no scored sessions -> Not Started.

    at_risk_of_zero_offers is True (a HARD flag, belongs on the Q5 roster) iff:
      - the student has zero scored sessions, OR
      - the student's latest score is in the At Risk tier AND they have at
        least _MIN_SESSIONS_FOR_RISK_EVAL sessions AND overall is_stuck is True
        (flat/declining trend_slope over >= _STUCK_MIN_SESSIONS sessions).

    Other At Risk / plateaued situations produce a non-empty risk_reasons
    entry with at_risk_of_zero_offers=False — a "watch list" signal rather
    than an urgent one (e.g. At Risk but improving, or only one session so
    far). This mirrors compute_zero_offer_risk_roster's cohort-scale
    heuristic but uses the precise regression slope available for a single
    student's full history.
    """
    latest_score = overall_growth.get("latest_score")
    session_count = overall_growth.get("session_count", 0)
    delta = overall_growth.get("delta")
    slope = overall_growth.get("trend_slope")
    is_stuck = bool(overall_growth.get("is_stuck"))
    tier = _bucket_into_tier(latest_score)

    risk_reasons: list[str] = []
    at_risk = False

    if session_count == 0:
        at_risk = True
        risk_reasons.append("No completed mock interviews yet.")
    elif tier == READINESS_TIER_AT_RISK:
        if session_count >= _MIN_SESSIONS_FOR_RISK_EVAL and is_stuck:
            at_risk = True
            risk_reasons.append(
                f"Latest score ({latest_score}) is in the At Risk band and the "
                f"trend over {session_count} sessions is flat or declining "
                f"(slope {slope} pts/session)."
            )
        elif session_count >= _MIN_SESSIONS_FOR_RISK_EVAL:
            risk_reasons.append(
                f"Latest score ({latest_score}) is in the At Risk band, but the "
                f"trend is improving (slope {slope} pts/session) — keep monitoring."
            )
        else:
            risk_reasons.append(
                f"First completed interview scored in the At Risk band "
                f"({latest_score}). Encourage another attempt to establish a trend."
            )
    elif is_stuck:
        risk_reasons.append(
            f"Score has plateaued around {latest_score} across {session_count} "
            f"sessions (slope {slope} pts/session)."
        )

    return {
        "readiness_tier": tier,
        "readiness_color": READINESS_TIER_COLOR.get(tier, "gray"),
        "latest_score": latest_score,
        "delta": delta,
        "trend_slope": slope,
        "session_count": session_count,
        "at_risk_of_zero_offers": at_risk,
        "is_stuck": is_stuck,
        "risk_reasons": risk_reasons,
    }


def compute_percentile_shift(
    first_score: float | None,
    latest_score: float | None,
    cohort_latest_scores: list[float],
) -> dict | None:
    """How far a student has moved relative to where peers stand TODAY. [Q4]

        percentile_shift = percentile_rank(latest, cohort) - percentile_rank(first, cohort)

    Both percentiles are computed against the SAME (current) cohort
    distribution of latest scores, so the result isolates the student's own
    movement from cohort-distribution drift over time. This is a deliberate
    simplification: a fully historical version (the student's percentile
    *at the time* of their first session, against the cohort distribution
    *as it existed then*) would require persisting cohort-distribution
    snapshots over time — flagged as a future enhancement in Phase 4.

    Returns None if either score or the cohort distribution is unavailable
    (e.g. a B2C user with no institution/cohort context, or a student with
    only one session).
    """
    if first_score is None or latest_score is None or not cohort_latest_scores:
        return None
    first_pct = _percentile_rank(first_score, cohort_latest_scores)
    latest_pct = _percentile_rank(latest_score, cohort_latest_scores)
    if first_pct is None or latest_pct is None:
        return None
    return {
        "first_percentile": first_pct,
        "latest_percentile": latest_pct,
        "percentile_shift": round(latest_pct - first_pct, 1),
    }


def build_student_radar_data(
    category_history: dict[str, list[dict]],
    cohort_category_averages: dict[str, float | None] | None = None,
) -> dict:
    """Shape the latest per-category scores for a radar chart, optionally
    overlaid with cohort averages for the same categories. [viz: radar overlay]

    Returns:
        {
          "categories": ["Introduction", "Project Ownership", ...],  # 19 display
                                                                       # names, fixed order
          "series": [
            {"key": "student", "label": "Student", "values": [82.0, None, 75.5, ...]},
            {"key": "cohort_average", "label": "Cohort Average", "values": [70.1, ...]}  # only if provided
          ]
        }

    `values[i]` is None where the student has no completed session in that
    category yet. The frontend should render these as a gap (e.g. 0 or a
    dashed segment) rather than dropping the axis — every radar must show all
    19 axes so polygons stay comparable across students and the cohort.
    """
    categories_display = [_format_category_name(c) for c in RUBRIC_CATEGORY_DISPLAY_ORDER]

    student_values: list[float | None] = []
    for category in RUBRIC_CATEGORY_DISPLAY_ORDER:
        rows = category_history.get(category) or []
        student_values.append(_to_float(rows[-1].get("average_score")) if rows else None)

    series = [{"key": "student", "label": "Student", "values": student_values}]

    if cohort_category_averages is not None:
        cohort_values = [
            _to_float(cohort_category_averages.get(category))
            for category in RUBRIC_CATEGORY_DISPLAY_ORDER
        ]
        series.append({"key": "cohort_average", "label": "Cohort Average", "values": cohort_values})

    return {"categories": categories_display, "series": series}


def build_student_category_trend_lines(category_history: dict[str, list[dict]]) -> dict:
    """Shape per-category score history for a multi-line trend chart. [viz: multi-line category trends]

    Returns:
        {
          "series": [
            {
              "category": "technical_depth",
              "label": "Technical Depth",
              "points": [{"session_index": 1, "session_date": "2026-01-10", "score": 64.0}, ...]
            },
            ...
          ]
        }

    Categories with zero recorded sessions are omitted entirely — an empty
    line adds no information and clutters the legend (unlike the radar,
    where all 19 axes must be present for shape comparability).
    """
    series = []
    for category in RUBRIC_CATEGORY_DISPLAY_ORDER:
        rows = category_history.get(category) or []
        if not rows:
            continue
        points = [
            {
                "session_index": row.get("session_index"),
                "session_date": _iso_date(row.get("session_date")),
                "score": _to_float(row.get("average_score")),
            }
            for row in rows
        ]
        series.append({"category": category, "label": _format_category_name(category), "points": points})
    return {"series": series}


# ════════════════════════════════════════════════════════════════
# SECTION: Cohort analytics (NEW) — B2B / TPO console
# Serves Q1 (who's ready now), Q2 (which depts need intervention),
# Q3 (weakest skills cohort-wide), Q5 (zero-offer roster),
# Q6 (what to report upward). All three fetch_* functions below are
# single aggregate queries (window functions / CTEs) — no N+1 even
# at 500-seat cohort scale. The compute_* functions are pure and
# operate on the fetched snapshots in memory.
# ════════════════════════════════════════════════════════════════
