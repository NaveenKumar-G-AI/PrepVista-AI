"""
PrepVista AI - Super Admin Helpers
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

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr

from app.config import (
    COLLEGE_STUDENT_PLAN, ORG_DEFAULT_PAGE_SIZE, ORG_MAX_PAGE_SIZE,
    generate_org_code, get_org_category_config,
)
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

# ── Canonical rubric categories ───────────────────────
# Mirrors _RUBRIC_CATEGORIES in org_college.py — one source of truth per file.
# Phase 4 recommends extracting both to app.utils.org_analytics.
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
_TIER_AT_RISK      = "at_risk"       # everything else

# ── Performance thresholds ────────────────────────────
_READINESS_TARGET       = 75.0
_ZERO_OFFER_SCORE_HARD  = 40.0
_ZERO_OFFER_SCORE_SOFT  = 50.0
_ZERO_OFFER_SLOPE_FLOOR = -2.0
_STUCK_MIN_SESSIONS     = 3
_STUCK_SLOPE_THRESHOLD  = 0.5
_DIST_BUCKETS           = 10

# ── Renewal risk thresholds ───────────────────────────
# Four signals, OR logic — any single condition sufficient to push up a tier.
_RENEW_SCORE_HIGH  = 50.0   # org avg_score below this → high risk
_RENEW_SCORE_MED   = 65.0   # org avg_score below this → medium risk
_RENEW_SPS_HIGH    = 1.0    # sessions/student below this → high risk
_RENEW_SPS_MED     = 2.0    # sessions/student below this → medium risk
_RENEW_RISK_PCT_H  = 40.0   # zero_offer_risk_pct above this → high risk
_RENEW_RISK_PCT_M  = 20.0   # zero_offer_risk_pct above this → medium risk
_RENEW_DAYS_HIGH   = 30     # days_to_expiry at or below → high risk
_RENEW_DAYS_MED    = 60     # days_to_expiry at or below → medium risk

# ── CSV injection defence ─────────────────────────────
_CSV_INJECTION_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '\n')

# ── Field length caps ─────────────────────────────────
_MAX_SEARCH_LEN = 200
_MAX_EMAIL_LEN  = 254
_MAX_NAME_LEN   = 100
_MAX_CODE_LEN   = 50
_MAX_NOTES_LEN  = 1000

# ── Validation ────────────────────────────────────────
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ══════════════════════════════════════════════════════════════════════════════
# SECURITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _validate_uuid(value: str, label: str = "ID") -> str:
    """Validate a path parameter as a UUID before it reaches asyncpg.

    ✅ SEC: Without this, a non-UUID path param (e.g. '../admin' or 'DROP TABLE')
    causes asyncpg to raise a raw PostgreSQL error that leaks internal schema
    details in the 500 response body. Validate first, return 400 with a safe
    message — never let DB errors reach the client.
    """
    try:
        uuid.UUID(str(value))
        return str(value)
    except ValueError:
        raise HTTPException(400, f"Invalid {label} format.")


def _sanitize_csv_cell(value: object) -> str:
    """Sanitize a value before writing to a CSV cell (OWASP A1-injection defence).

    ✅ SEC: A cell value starting with =, +, -, @ etc. is treated as a formula
    by Excel/Google Sheets. Prepending a single quote forces text interpretation.
    """
    if value is None:
        return ""
    text = str(value).strip()
    if text and text[0] in _CSV_INJECTION_PREFIXES:
        return "'" + text
    return text


# ══════════════════════════════════════════════════════════════════════════════
# REQUEST MODELS  (all existing + no new required)
# ══════════════════════════════════════════════════════════════════════════════

def _safe_round(value: Any, decimals: int = 1) -> float | None:
    """Round a nullable numeric; return None if value is None or non-numeric."""
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None


def _readiness_tier(avg_score: float | None, total_sessions: int) -> str:
    """Classify a student into one of four readiness tiers (top-down, first match).

    ready:        avg ≥ 75 AND sessions ≥ 3
    almost_ready: avg ≥ 60 AND sessions ≥ 2
    developing:   avg ≥ 40 OR  sessions ≥ 1
    at_risk:      everything else
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
    """Return True if student is at risk of zero placement offers (OR logic).

    1. Zero sessions.
    2. avg_score < 40 (hard floor).
    3. avg_score < 50 with ≥ 3 sessions (not improving despite practice).
    4. trend_slope < −2.0 (actively declining).
    """
    if total_sessions == 0 or avg_score is None:
        return True
    if avg_score < _ZERO_OFFER_SCORE_HARD:
        return True
    if total_sessions >= 3 and avg_score < _ZERO_OFFER_SCORE_SOFT:
        return True
    if trend_slope is not None and trend_slope < _ZERO_OFFER_SLOPE_FLOOR:
        return True
    return False


def _extract_cat_scores(row: Any, prefix: str = "avg_") -> dict[str, float | None]:
    """Extract all 14 category averages from an asyncpg Record or dict."""
    return {cat: _safe_round(row[f"{prefix}{cat}"]) for cat in _RUBRIC_CATEGORIES}


def _cohort_category_averages(
    per_student_cat_scores: list[dict[str, float | None]],
) -> dict[str, float | None]:
    """Average per-student category dicts into cohort-level means (NULLs excluded)."""
    result: dict[str, float | None] = {}
    for cat in _RUBRIC_CATEGORIES:
        vals = [d[cat] for d in per_student_cat_scores if d.get(cat) is not None]
        result[cat] = _safe_round(_stats.mean(vals)) if vals else None
    return result


def _sorted_categories(
    cat_avgs: dict[str, float | None],
    ascending: bool = True,
) -> list[dict]:
    """Sort categories by avg_score, NULLs last. ascending=True → weakest first."""
    with_data    = [(c, cat_avgs[c]) for c in _RUBRIC_CATEGORIES if cat_avgs.get(c) is not None]
    without_data = [(c, None)        for c in _RUBRIC_CATEGORIES if cat_avgs.get(c) is None]
    with_data.sort(key=lambda x: x[1], reverse=(not ascending))  # type: ignore[arg-type]
    return [{"name": c, "avg_score": v} for c, v in with_data + without_data]


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


def _build_score_distribution(scores: list[float]) -> list[dict]:
    """Bucket scores into _DIST_BUCKETS equal-width bins over [0, 100].

    Last bin uses ≤ 100 to capture a perfect score. Empty list → all-zero buckets.
    """
    bucket_size = 100.0 / _DIST_BUCKETS
    result = []
    for i in range(_DIST_BUCKETS):
        lo, hi = i * bucket_size, (i + 1) * bucket_size
        if i < _DIST_BUCKETS - 1:
            count = sum(1 for s in scores if lo <= s < hi)
        else:
            count = sum(1 for s in scores if lo <= s <= hi)
        result.append({"range": f"{int(lo)}-{int(hi)}", "lo": lo, "hi": hi, "count": count})
    return result


def _days_to_expiry(access_expiry: Any) -> int | None:
    """Compute integer days between now and access_expiry. Handles naive/aware datetimes."""
    if access_expiry is None:
        return None
    try:
        now = datetime.now(timezone.utc)
        exp = access_expiry
        if hasattr(exp, "tzinfo") and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return int((exp - now).days)
    except Exception:
        return None


def _renewal_risk_label(
    avg_score: float | None,
    sessions_per_student: float,
    zero_risk_pct: float,
    days_to_expiry: int | None,
) -> str:
    """Classify a college's renewal risk from four signals (OR logic — high wins).

    high:   avg_score < 50  OR sps < 1.0  OR zero_risk_pct > 40  OR expiry ≤ 30d
    medium: avg_score < 65  OR sps < 2.0  OR zero_risk_pct > 20  OR expiry ≤ 60d
    low:    everything else (performing well, engaged, renewal not imminent)
    """
    expiry_high = days_to_expiry is not None and days_to_expiry <= _RENEW_DAYS_HIGH
    expiry_med  = days_to_expiry is not None and days_to_expiry <= _RENEW_DAYS_MED
    if (
        (avg_score is not None and avg_score < _RENEW_SCORE_HIGH)
        or sessions_per_student < _RENEW_SPS_HIGH
        or zero_risk_pct > _RENEW_RISK_PCT_H
        or expiry_high
    ):
        return "high"
    if (
        (avg_score is not None and avg_score < _RENEW_SCORE_MED)
        or sessions_per_student < _RENEW_SPS_MED
        or zero_risk_pct > _RENEW_RISK_PCT_M
        or expiry_med
    ):
        return "medium"
    return "low"


def _compute_org_perf_summary(
    perf_rows: list[Any],
    org_row: Any = None,
) -> dict:
    """Derive the performance_summary KPI block from per-student perf rows for one org.

    Returns the dict used by org detail, analytics, and performance endpoints.
    org_row is the organizations record (provides access_expiry for renewal signals).
    """
    tier_counts: dict[str, int] = {
        _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
    }
    zero_risk_count = 0
    scored_avgs: list[float] = []
    per_student_cats: list[dict[str, float | None]] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        if _zero_offer_risk(avg, sc, None):
            zero_risk_count += 1
        if avg is not None:
            scored_avgs.append(avg)
        per_student_cats.append(_extract_cat_scores(r))

    total           = len(perf_rows)
    cohort_cat_avgs = _cohort_category_averages(per_student_cats)
    global_avg      = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    weakest_3       = _sorted_categories(cohort_cat_avgs, ascending=True)[:3]
    total_sessions  = sum(int(r["session_count"] or 0) for r in perf_rows)
    sps             = _safe_round(total_sessions / total) if total > 0 else 0.0
    zero_risk_pct   = round(zero_risk_count / total * 100, 1) if total > 0 else 0.0
    dte             = _days_to_expiry(org_row["access_expiry"]) if org_row else None
    renewal_risk    = _renewal_risk_label(global_avg, float(sps or 0.0), zero_risk_pct, dte)

    return {
        "total_students":         total,
        "students_with_sessions": len(scored_avgs),
        "cohort_avg_score":       global_avg,
        "sessions_per_student":   sps,
        "readiness_tier_counts":  tier_counts,
        "zero_offer_risk_count":  zero_risk_count,
        "zero_offer_risk_pct":    zero_risk_pct,
        "weakest_3_categories":   weakest_3,
        "renewal_risk":           renewal_risk,
        "days_to_expiry":         dte,
    }


# ══════════════════════════════════════════════════════════════════════════════
# QUERY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_all_orgs_perf(conn) -> list:
    """Fetch one aggregated performance row per college org across the platform.

    Covers: avg_score, all 14 rubric category averages, session counts,
    student counts, and org metadata — from a single JOIN.

    ASSUMPTION: interview_sessions.rubric_scores is a JSONB column with keys
      matching _RUBRIC_CATEGORIES exactly (e.g. "structure_star" not "structure/star").
    ASSUMPTION: interview_sessions.state = 'FINISHED' marks a finished session.
    ASSUMPTION: organization_students.status = 'active' marks an enrolled student.

    One query regardless of the number of orgs or students. Zero N+1.
    """
    return await conn.fetch(
        """
        SELECT
            o.id           AS org_id,
            o.name,
            o.org_code,
            o.status       AS org_status,
            o.plan,
            o.seat_limit,
            o.seats_used,
            o.access_expiry,
            COUNT(DISTINCT os.user_id)                                            AS total_students,
            COUNT(DISTINCT os.user_id) FILTER (WHERE os.has_career_access)        AS access_students,
            COUNT(isess.id)                                                       AS total_sessions,
            ROUND(AVG(isess.final_score)::numeric, 1)                             AS avg_score,
            ROUND(AVG((isess.rubric_scores->>'communication')::numeric)::numeric, 1)   AS avg_communication,
            ROUND(AVG((isess.rubric_scores->>'technical_depth')::numeric)::numeric, 1) AS avg_technical_depth,
            ROUND(AVG((isess.rubric_scores->>'problem_solving')::numeric)::numeric, 1) AS avg_problem_solving,
            ROUND(AVG((isess.rubric_scores->>'confidence')::numeric)::numeric, 1)      AS avg_confidence,
            ROUND(AVG((isess.rubric_scores->>'structure_star')::numeric)::numeric, 1)  AS avg_structure_star,
            ROUND(AVG((isess.rubric_scores->>'vocabulary')::numeric)::numeric, 1)      AS avg_vocabulary,
            ROUND(AVG((isess.rubric_scores->>'vocal_delivery')::numeric)::numeric, 1)  AS avg_vocal_delivery,
            ROUND(AVG((isess.rubric_scores->>'leadership')::numeric)::numeric, 1)      AS avg_leadership,
            ROUND(AVG((isess.rubric_scores->>'teamwork')::numeric)::numeric, 1)        AS avg_teamwork,
            ROUND(AVG((isess.rubric_scores->>'adaptability')::numeric)::numeric, 1)    AS avg_adaptability,
            ROUND(AVG((isess.rubric_scores->>'reasoning')::numeric)::numeric, 1)       AS avg_reasoning,
            ROUND(AVG((isess.rubric_scores->>'conciseness')::numeric)::numeric, 1)     AS avg_conciseness,
            ROUND(AVG((isess.rubric_scores->>'professionalism')::numeric)::numeric, 1) AS avg_professionalism,
            ROUND(AVG((isess.rubric_scores->>'role_fit')::numeric)::numeric, 1)        AS avg_role_fit
        FROM organizations o
        LEFT JOIN organization_students os
               ON os.organization_id = o.id AND os.status = 'active'
        LEFT JOIN interview_sessions isess
               ON isess.user_id = os.user_id AND isess.state = 'FINISHED'
        WHERE o.category = 'college'
        GROUP BY o.id, o.name, o.org_code, o.status, o.plan,
                 o.seat_limit, o.seats_used, o.access_expiry
        ORDER BY avg_score DESC NULLS LAST
        """
    )


async def _fetch_org_perf_aggregate(conn, org_id: str) -> list:
    """Fetch one aggregated performance row per active student in a single org.

    Identical structure to org_college.py's _fetch_perf_aggregate.
    Returns one row per student with all 14 category averages, session counts,
    first/latest scores, and quality flag aggregates.

    One query. No N+1.
    """
    return await conn.fetch(
        """
        SELECT
            os.user_id,
            os.department_id,
            os.student_code,
            p.full_name,
            p.email,
            cd.department_name,
            cy.year_name,
            cb.batch_name,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED')
                AS session_count,
            ROUND(AVG(isess.final_score)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)
                AS avg_score,
            (ARRAY_AGG(isess.final_score ORDER BY isess.created_at ASC)
             FILTER (WHERE isess.state = 'FINISHED'))[1]   AS first_score,
            (ARRAY_AGG(isess.final_score ORDER BY isess.created_at DESC)
             FILTER (WHERE isess.state = 'FINISHED'))[1]   AS latest_score,
            ROUND(AVG((isess.rubric_scores->>'communication')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_communication,
            ROUND(AVG((isess.rubric_scores->>'technical_depth')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_technical_depth,
            ROUND(AVG((isess.rubric_scores->>'problem_solving')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_problem_solving,
            ROUND(AVG((isess.rubric_scores->>'confidence')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_confidence,
            ROUND(AVG((isess.rubric_scores->>'structure_star')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_structure_star,
            ROUND(AVG((isess.rubric_scores->>'vocabulary')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_vocabulary,
            ROUND(AVG((isess.rubric_scores->>'vocal_delivery')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_vocal_delivery,
            ROUND(AVG((isess.rubric_scores->>'leadership')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_leadership,
            ROUND(AVG((isess.rubric_scores->>'teamwork')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_teamwork,
            ROUND(AVG((isess.rubric_scores->>'adaptability')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_adaptability,
            ROUND(AVG((isess.rubric_scores->>'reasoning')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_reasoning,
            ROUND(AVG((isess.rubric_scores->>'conciseness')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_conciseness,
            ROUND(AVG((isess.rubric_scores->>'professionalism')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_professionalism,
            ROUND(AVG((isess.rubric_scores->>'role_fit')::numeric)
                  FILTER (WHERE isess.state = 'FINISHED'), 1)   AS avg_role_fit,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.star_usage_score >= 5.0)  AS star_usage_count,
            COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                AND aqf.evasiveness_score >= 5.0) AS evasiveness_count
        FROM organization_students os
        JOIN   profiles             p    ON p.id    = os.user_id
        LEFT JOIN college_departments cd ON cd.id   = os.department_id
        LEFT JOIN college_years       cy ON cy.id   = os.year_id
        LEFT JOIN college_batches     cb ON cb.id   = os.batch_id
        LEFT JOIN interview_sessions  isess ON isess.user_id = os.user_id
        LEFT JOIN answer_quality_flags aqf ON aqf.session_id = isess.id
        WHERE os.organization_id = $1 AND os.status = 'active'
        GROUP BY os.user_id, os.department_id, os.student_code,
                 p.full_name, p.email,
                 cd.department_name, cy.year_name, cb.batch_name
        ORDER BY p.full_name
        """,
        org_id,
    )


# ══════════════════════════════════════════════════════════════════════════════
# ROUTING UTILITY
# ══════════════════════════════════════════════════════════════════════════════

def _paginate(page: int, page_size: int) -> tuple[int, int]:
    ps     = min(max(1, page_size), ORG_MAX_PAGE_SIZE)
    offset = max(0, (max(1, page) - 1) * ps)
    return ps, offset


# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATION CRUD
# ══════════════════════════════════════════════════════════════════════════════
