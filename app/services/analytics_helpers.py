"""
PrepVista AI - Analytics Helpers
Extracted from analytics.py - math helpers, normalizers, and formatting.

Re-exported by analytics.py (barrel file) for backward compatibility.
"""
from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean, median, pstdev

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

# Fixed display/iteration order for the 19 valid rubric categories. Radar
# charts, cohort rollups, and growth heatmaps all need a STABLE axis order so
# series line up across students, sessions, and departments. Kept in sync
# with VALID_RUBRIC_CATEGORIES via the assertion below — if either set is
# edited without the other, this fails loudly at import time instead of
# silently dropping/duplicating a category in every chart.
RUBRIC_CATEGORY_DISPLAY_ORDER: tuple[str, ...] = (
    "introduction", "project_ownership", "technical_depth", "problem_solving",
    "behavioral", "communication", "delivery", "ownership", "workflow_process",
    "tool_method", "challenge_debugging", "validation_metrics", "tradeoff_decision",
    "communication_explain", "teamwork_pressure", "learning_growth", "role_fit",
    "closeout", "studies_background",
)
assert (
    len(RUBRIC_CATEGORY_DISPLAY_ORDER) == len(VALID_RUBRIC_CATEGORIES)
    and set(RUBRIC_CATEGORY_DISPLAY_ORDER) == VALID_RUBRIC_CATEGORIES
), "RUBRIC_CATEGORY_DISPLAY_ORDER must contain exactly the VALID_RUBRIC_CATEGORIES set"

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

# ── Readiness tiers ────────────────────────────────────
# Scores are on the existing 0-100 scale (see build_dashboard_feedback's
# "{round(average_score)}/100" usage below). Thresholds are named constants
# so a future TPO-facing config screen can retune them without touching the
# bucketing logic itself.
READINESS_TIER_READY = "Ready"
READINESS_TIER_ALMOST = "Almost Ready"
READINESS_TIER_DEVELOPING = "Developing"
READINESS_TIER_AT_RISK = "At Risk"
READINESS_TIER_NOT_STARTED = "Not Started"

# Ordered (threshold, tier) pairs, evaluated highest-first. A score >=
# threshold gets that tier; anything below the lowest threshold is AT_RISK.
_READINESS_TIER_THRESHOLDS: tuple[tuple[float, str], ...] = (
    (75.0, READINESS_TIER_READY),
    (60.0, READINESS_TIER_ALMOST),
    (45.0, READINESS_TIER_DEVELOPING),
)

READINESS_TIER_COLOR: dict[str, str] = {
    READINESS_TIER_READY: "green",
    READINESS_TIER_ALMOST: "yellow",
    READINESS_TIER_DEVELOPING: "orange",
    READINESS_TIER_AT_RISK: "red",
    READINESS_TIER_NOT_STARTED: "gray",
}

# ── Growth / trend tuning ──────────────────────────────
# Minimum data points before a linear-regression slope is meaningful.
_TREND_MIN_SESSIONS_FOR_SLOPE = 2
# Minimum sessions before "no improvement" becomes a "stuck student" signal
# rather than normal early-session noise.
_STUCK_MIN_SESSIONS = 3
# Slope (points per session) at/below which a trend counts as flat/declining.
_STUCK_SLOPE_THRESHOLD = 0.5
# Default "placement-ready" target score for time-to-threshold projections —
# matches the READY tier floor.
_DEFAULT_TARGET_SCORE = _READINESS_TIER_THRESHOLDS[0][0]
# A student needs at least this many scored sessions before "At Risk" +
# "not improving" becomes an actionable zero-offer-risk flag, vs. simply
# having just started.
_MIN_SESSIONS_FOR_RISK_EVAL = 2

# ── Cohort filter validation ───────────────────────────
# ✅ SEC: bound graduation_year filters to a sane range before they reach a
# `$N::int` query parameter.
_MIN_GRADUATION_YEAR = 1990
_MAX_GRADUATION_YEAR = 2100
# ✅ SEC: cap department filter length — same rationale as _safe_str below,
# applied to a query parameter instead of a response field.
_MAX_DEPARTMENT_LEN = 120

# ── Cohort activity heatmap window ─────────────────────
_COHORT_ACTIVITY_DEFAULT_DAYS = 90
_COHORT_ACTIVITY_MAX_DAYS = 365


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


def _safe_department(value: str | None) -> str | None:
    """Trim and length-cap a department filter; empty/None -> None (no filter).

    ✅ SEC: bounds an incoming query-string filter before it reaches a
    parameterized `$N::text` comparison. asyncpg already parameterizes (so
    this is not an injection fix), but it keeps pathological inputs from
    bloating query plans/logs — same spirit as _safe_str for response fields.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:_MAX_DEPARTMENT_LEN]


def _safe_graduation_year(value: int | str | None) -> int | None:
    """Coerce + range-check a graduation-year filter; out-of-range -> None.

    ✅ SEC: bounds the value passed into a `$N::int` filter so a malformed
    query-string param can't reach the DB as an absurd integer.
    """
    if value is None:
        return None
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    if _MIN_GRADUATION_YEAR <= year <= _MAX_GRADUATION_YEAR:
        return year
    return None


def _iso_date(value: object) -> str | None:
    """Format a date/datetime as an ISO-8601 date string (YYYY-MM-DD).

    Used for calendar-heatmap keys and chart point labels. Returns None for
    falsy input (NULL timestamps). Accepts anything with `.isoformat()`
    (date, datetime) and falls back to `str()` for anything else so an
    unexpected value degrades gracefully instead of raising.
    """
    if not value:
        return None
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()[:10]  # datetime.isoformat() includes a time component
    return str(value)


def _linear_regression_slope(values: list[float]) -> float | None:
    """Least-squares slope of `values` plotted against x = 1..n (session index).

        slope = (n*Sum(x*y) - Sum(x)*Sum(y)) / (n*Sum(x^2) - (Sum(x))^2)

    For consecutive integer x = 1..n, the denominator simplifies to
    n^2*(n^2-1)/12, which is strictly positive for n >= 2 — so once the
    `n < _TREND_MIN_SESSIONS_FOR_SLOPE` guard passes, there is no
    zero-division risk. Returns None if there isn't enough data for a
    meaningful trend.
    """
    n = len(values)
    if n < _TREND_MIN_SESSIONS_FOR_SLOPE:
        return None
    sum_x = n * (n + 1) / 2
    sum_y = sum(values)
    sum_xy = sum((i + 1) * y for i, y in enumerate(values))
    sum_x2 = n * (n + 1) * (2 * n + 1) / 6
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None
    return (n * sum_xy - sum_x * sum_y) / denom


def _percentile_rank(value: float, distribution: list[float]) -> float | None:
    """Mean-rank percentile of `value` within `distribution`.

        percentile = 100 * (count_below + 0.5 * count_equal) / total

    The tie-midpoint convention avoids the artificial 0%/100% extremes that a
    strict "count below / total" formula produces when `value` is the
    distribution's min/max. Returns None for an empty distribution.
    """
    total = len(distribution)
    if total == 0:
        return None
    below = sum(1 for v in distribution if v < value)
    equal = sum(1 for v in distribution if v == value)
    return round(100 * (below + 0.5 * equal) / total, 1)


def _sessions_to_threshold(
    latest: float | None, slope: float | None, target: float
) -> int | None:
    """Projected additional sessions to reach `target` at the current trend.

    Returns:
        0    - latest score already at/above target.
        int  - ceil((target - latest) / slope) additional sessions needed.
        None - unreachable at the current trend (flat/declining slope) or
               insufficient data (`latest` unknown).
    """
    if latest is None:
        return None
    if latest >= target:
        return 0
    if slope is None or slope <= 0:
        return None
    return math.ceil((target - latest) / slope)


def _bucket_into_tier(score: float | None) -> str:
    """Map a 0-100 score to a readiness tier.

    None (no scored sessions) -> READINESS_TIER_NOT_STARTED — a "no data
    yet" state, deliberately distinct from "scored low", since the two
    require different TPO interventions (Q1, Q5).
    """
    if score is None:
        return READINESS_TIER_NOT_STARTED
    for threshold, tier in _READINESS_TIER_THRESHOLDS:
        if score >= threshold:
            return tier
    return READINESS_TIER_AT_RISK


def _growth_metrics_from_series(scores: list[float], target_score: float) -> dict:
    """Shared growth-metric computation for one chronological score series
    (overall final_score history, or a single rubric category's history).

    See _linear_regression_slope, _sessions_to_threshold, and the _STUCK_*
    constants above for the underlying formulas.
    """
    session_count = len(scores)
    first_score = scores[0] if scores else None
    latest_score = scores[-1] if scores else None
    # delta is None (not 0) for a single session: with one data point there
    # is no "growth" to report yet, only a snapshot.
    delta = (
        round(latest_score - first_score, 1)
        if session_count >= 2 and first_score is not None and latest_score is not None
        else None
    )
    slope = _linear_regression_slope(scores)
    # "Stuck": enough sessions to be meaningful AND trend is flat/declining.
    is_stuck = (
        session_count >= _STUCK_MIN_SESSIONS
        and slope is not None
        and slope <= _STUCK_SLOPE_THRESHOLD
    )
    return {
        "session_count": session_count,
        "first_score": first_score,
        "latest_score": latest_score,
        "delta": delta,
        "trend_slope": round(slope, 3) if slope is not None else None,
        "sessions_to_threshold": _sessions_to_threshold(latest_score, slope, target_score),
        "is_stuck": is_stuck,
    }


# ════════════════════════════════════════════════════════════════
# SECTION: B2C coaching feedback (unchanged from prior version)
# ════════════════════════════════════════════════════════════════

