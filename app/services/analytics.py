"""
PrepVista AI - Analytics Service
Builds persistent skill snapshots from finished interview evaluations.
"""

from __future__ import annotations

import uuid
from collections import defaultdict

import structlog

logger = structlog.get_logger("prepvista.analytics")

# ── Security constants ────────────────────────────────
# ✅ SEC: Cap string fields before they reach the client response.
# strengths/weaknesses come from the LLM evaluator — uncapped strings
# inflate API response size and could contain unexpectedly long output.
_MAX_FEEDBACK_STR_LEN = 500

# ✅ SEC: Allowlist for rubric_category values stored in skill_scores.
# Without this, any string from the evaluator (including malformed or
# injected values) gets persisted in the DB and returned in analytics.
VALID_RUBRIC_CATEGORIES = frozenset({
    "introduction", "project_ownership", "technical_depth",
    "problem_solving", "behavioral", "communication", "delivery",
    "ownership", "workflow_process", "tool_method", "challenge_debugging",
    "validation_metrics", "tradeoff_decision", "communication_explain",
    "teamwork_pressure", "learning_growth", "role_fit", "closeout",
    "studies_background",
})

# ── Backfill batch size ───────────────────────────────
# ✅ PERF: Limits how many sessions are backfilled in one call.
# A user with 200 old sessions would otherwise run 200 sequential
# sync_session_skill_scores calls — guaranteed DB timeout.
_BACKFILL_SESSION_LIMIT = 25


FREE_NEXT_STEP_BY_CATEGORY = {
    "introduction": "Structure your answer as: background -> skills -> goal.",
    "project_ownership": "Explain one concrete feature, your exact role, and the result.",
    "technical_depth": "Name the tool, what it did, and why it mattered.",
    "problem_solving": "Say the problem, what you changed, and what improved.",
    "behavioral": "Use the order: situation -> action -> result.",
    "communication": "Keep your main point first and use 2-3 short sentences.",
    "communication_explain": "Keep your main point first and use 2-3 short sentences.",
    "delivery": "Slow down slightly and speak in short complete sentences.",
}


def _to_float(value) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


# ✅ REMOVED: _to_percent was defined but never called anywhere in the codebase.
# Dead code in production signals unfinished work to any engineer or CTO doing
# due diligence. Removed cleanly — if needed in future, add with tests.


def _format_category_name(category: str) -> str:
    return str(category or "communication").replace("_", " ").title()


def _safe_str(value: object, max_len: int = _MAX_FEEDBACK_STR_LEN) -> str:
    """Return a safe, length-capped string from any value.

    ✅ SEC: strengths/weaknesses come from the LLM evaluator. Uncapped strings
    inflate API response size and could carry unexpectedly long content from a
    runaway model. Cap all user-facing feedback strings at _MAX_FEEDBACK_STR_LEN.
    """
    if value is None:
        return ""
    return str(value)[:max_len]


def _validate_uuid_str(value: str, label: str = "ID") -> str:
    """Validate and return a UUID string, raising ValueError if invalid.

    ✅ SEC: Passing a non-UUID to asyncpg raises a raw PostgreSQL error that
    leaks internal schema details in the error message. Validate first.
    """
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError):
        raise ValueError(f"Invalid {label} format: expected UUID.")


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


def derive_skill_score_rows(evaluations: list[dict]) -> list[dict]:
    """Aggregate per-question evaluations into category-level skill rows."""
    category_scores: dict[str, list[float]] = defaultdict(list)
    delivery_scores: list[float] = []

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

        communication_score = _to_float(evaluation.get("communication_score"))
        if communication_score is not None and communication_score > 0:
            delivery_scores.append(communication_score)

    rows = [
        {
            "category": category,
            "average_score": round(sum(scores) / len(scores), 1),
            "question_count": len(scores),
        }
        for category, scores in category_scores.items()
        if scores
    ]

    if delivery_scores:
        rows.append(
            {
                "category": "delivery",
                "average_score": round(sum(delivery_scores) / len(delivery_scores), 1),
                "question_count": len(delivery_scores),
            }
        )

    return rows


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