"""
PrepVista AI - Org College Analytics
"""

from __future__ import annotations

import asyncio
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
from app.routers.org_college_helpers import (
    _build_answer_flag_aggregates, _build_dept_comparison, _build_radar_shape,
    _build_traffic_light, _build_diverging_bar, _build_score_distribution,
    _validate_uuid, _compute_slope, _paginate
)
from app.routers.org_college_helpers import (
    _TIER_READY, _TIER_ALMOST_READY, _TIER_DEVELOPING, _TIER_AT_RISK,
    _safe_round, _readiness_tier, _zero_offer_risk,
    _cohort_category_averages, _extract_cat_scores, _sorted_categories,
    _fetch_session_series, _compute_student_growth_map, _is_stuck,
    _compute_percentile, _time_to_threshold, _sanitize_csv_cell,
    _RUBRIC_CATEGORIES, _render_cohort_summary_export, _segment_filter_clause,
    _fetch_perf_aggregate
)

router = APIRouter()


async def _parallel(*query_fns):
    """Run independent read queries concurrently, each on its own pooled connection.

    The backend (Render, us-east) and the database (Supabase, ap-southeast-1) sit
    in different regions, so every query pays ~250ms of network round-trip. Run
    sequentially, N independent queries cost ~N*250ms; run concurrently they cost
    ~250ms total. Each callable receives a fresh asyncpg connection and must
    finish using it before returning (the connection is released on return).

    Order is preserved: results come back in the same order the callables are
    passed, so callers can unpack them positionally.
    """
    async def _run(fn):
        async with DatabaseConnection() as conn:
            return await fn(conn)
    return await asyncio.gather(*(_run(fn) for fn in query_fns))

@router.get("/dashboard")
async def college_dashboard(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Org overview dashboard.

    Existing fields preserved verbatim. New performance_summary block adds:
      - cohort_avg_score, students_with_sessions
      - readiness_tier_counts (all 4 tiers)
      - zero_offer_risk_count
      - weakest_3_categories (sorted by avg score ascending)

    All from one additional pre-aggregated query — page-load impact is minimal.
    """
    org_id = admin.organization_id
    # ✅ PERF: these five reads are independent, so run them concurrently (each on
    # its own pooled connection) instead of serially. Across the Render<->Supabase
    # region gap this collapses ~5x250ms of round-trips into ~one. See _parallel().
    # ✅ SEC: Explicit column lists prevent internal billing/payment fields from
    # leaking to college-admin scope via SELECT *.
    org, stats, seg_stats, recent, perf_rows = await _parallel(
        lambda conn: conn.fetchrow(
            """SELECT id, name, category, plan, seat_limit, seats_used,
                      access_expiry, status, created_at
               FROM organizations WHERE id = $1""",
            org_id,
        ),
        lambda conn: conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE status = 'active')                             AS total_students,
                 COUNT(*) FILTER (WHERE has_career_access = TRUE AND status = 'active') AS career_access_students
               FROM organization_students WHERE organization_id = $1""",
            org_id,
        ),
        lambda conn: conn.fetchrow(
            """SELECT
                 (SELECT COUNT(*) FROM college_departments WHERE organization_id = $1 AND status = 'active') AS dept_count,
                 (SELECT COUNT(*) FROM college_years      WHERE organization_id = $1 AND status = 'active') AS year_count,
                 (SELECT COUNT(*) FROM college_batches    WHERE organization_id = $1 AND status = 'active') AS batch_count""",
            org_id,
        ),
        lambda conn: conn.fetch(
            """SELECT os.id, os.student_code, os.has_career_access, os.added_at,
                      p.email, p.full_name
               FROM organization_students os JOIN profiles p ON p.id = os.user_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               ORDER BY os.added_at DESC LIMIT 10""",
            org_id,
        ),
        # NEW: lightweight per-student perf for dashboard KPIs
        lambda conn: conn.fetch(
            """SELECT
                 os.user_id,
                 COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED') AS session_count,
                 ROUND(AVG(isess.final_score)
                       FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_score,
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
                       FILTER (WHERE isess.state = 'FINISHED'), 1)  AS avg_role_fit
               FROM organization_students os
               LEFT JOIN interview_sessions isess ON isess.user_id = os.user_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY os.user_id""",
            org_id,
        ),
    )

    # Python-side KPI computation — zero additional DB round-trips
    tier_counts: dict[str, int] = {
        _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
    }
    zero_risk_count = 0
    scored_avgs: list[float] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        if _zero_offer_risk(avg, sc, None):
            zero_risk_count += 1
        if avg is not None:
            scored_avgs.append(avg)

    cohort_avg      = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    cohort_cat_avgs = _cohort_category_averages([_extract_cat_scores(r) for r in perf_rows])
    weakest_3       = _sorted_categories(cohort_cat_avgs, ascending=True)[:3]

    return {
        # ── Existing fields (preserved verbatim) ──────────────────────────────
        "organization":           dict(org)                           if org      else None,
        "total_students":         stats["total_students"]             if stats    else 0,
        "career_access_students": stats["career_access_students"]     if stats    else 0,
        "departments":            seg_stats["dept_count"]             if seg_stats else 0,
        "years":                  seg_stats["year_count"]             if seg_stats else 0,
        "batches":                seg_stats["batch_count"]            if seg_stats else 0,
        "seat_limit":             org["seat_limit"]                   if org      else 0,
        "seats_used":             org["seats_used"]                   if org      else 0,
        "recent_students":        [dict(r) for r in recent],
        # ── NEW: performance_summary ──────────────────────────────────────────
        "performance_summary": {
            "cohort_avg_score":       cohort_avg,
            "students_with_sessions": len(scored_avgs),
            "readiness_tier_counts":  tier_counts,
            "zero_offer_risk_count":  zero_risk_count,
            "weakest_3_categories":   weakest_3,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# STUDENT CRUD  (all existing contracts preserved)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analytics")
async def college_analytics(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Enrollment and performance analytics overview.

    Existing fields unchanged:
      total_students, career_access_students,
      department_stats, year_stats, batch_stats.

    New fields appended (non-breaking):
      category_averages, weakest_categories, readiness_distribution,
      zero_offer_risk_count, answer_flag_averages, cohort_avg_score,
      scored_students, viz_shapes (radar, traffic_light, department_comparison,
      diverging_bar, score_distribution).
    """
    org_id = admin.organization_id
    # ✅ PERF: these reads are independent — run them concurrently (each on its own
    # pooled connection) so the cross-region round-trips overlap. See _parallel().
    counts, dept_stats, year_stats, batch_stats, perf_rows = await _parallel(
        lambda conn: conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE status = 'active')                             AS total_students,
                 COUNT(*) FILTER (WHERE has_career_access = TRUE AND status = 'active') AS career_access_students
               FROM organization_students WHERE organization_id = $1""",
            org_id,
        ),
        lambda conn: conn.fetch(
            """SELECT cd.department_name, COUNT(os.id) AS total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) AS with_access
               FROM organization_students os
               JOIN college_departments cd ON cd.id = os.department_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cd.department_name ORDER BY total DESC""",
            org_id,
        ),
        lambda conn: conn.fetch(
            """SELECT cy.year_name, COUNT(os.id) AS total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) AS with_access
               FROM organization_students os
               JOIN college_years cy ON cy.id = os.year_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cy.year_name ORDER BY total DESC""",
            org_id,
        ),
        lambda conn: conn.fetch(
            """SELECT cb.batch_name, COUNT(os.id) AS total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) AS with_access
               FROM organization_students os
               JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cb.batch_name ORDER BY total DESC""",
            org_id,
        ),
        # ── one-shot performance aggregate query ──────────────────────────────
        lambda conn: _fetch_perf_aggregate(conn, org_id),
    )

    # ── Python-side analytics ─────────────────────────────────────────────────
    total = len(perf_rows)
    tier_counts: dict[str, int] = {
        _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
    }
    zero_risk_count = 0
    scored_avgs: list[float] = []
    per_student_cat_scores: list[dict[str, float | None]] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        if _zero_offer_risk(avg, sc, None):   # slope not available here; growth endpoint has it
            zero_risk_count += 1
        if avg is not None:
            scored_avgs.append(avg)
        per_student_cat_scores.append(_extract_cat_scores(r))

    cohort_cat_avgs = _cohort_category_averages(per_student_cat_scores)
    global_avg      = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    std_dev         = _safe_round(_stats.stdev(scored_avgs)) if len(scored_avgs) >= 2 else None

    # Top-quartile category averages (students scoring ≥ 75th percentile overall)
    if len(scored_avgs) >= 4:
        p75 = sorted(scored_avgs)[int(len(scored_avgs) * 0.75)]
        tq_rows = [r for r in perf_rows if r["avg_score"] is not None and float(r["avg_score"]) >= p75]
    else:
        tq_rows = list(perf_rows)
    top_q_cat_avgs = _cohort_category_averages([_extract_cat_scores(r) for r in tq_rows])

    flag_aggregates = _build_answer_flag_aggregates(perf_rows)
    dept_comparison = _build_dept_comparison(perf_rows)
    radar_shape     = _build_radar_shape(cohort_cat_avgs, top_q_cat_avgs)
    traffic_light   = _build_traffic_light(tier_counts, total)
    diverging_bar   = _build_diverging_bar(cohort_cat_avgs, global_avg)
    dist_buckets    = _build_score_distribution(scored_avgs)

    return {
        # ── Existing fields (preserved verbatim) ──────────────────────────────
        "total_students":         counts["total_students"]         if counts else 0,
        "career_access_students": counts["career_access_students"] if counts else 0,
        "department_stats":       [dict(d) for d in dept_stats],
        "year_stats":             [dict(y) for y in year_stats],
        "batch_stats":            [dict(b) for b in batch_stats],
        # ── New fields ────────────────────────────────────────────────────────
        "cohort_avg_score":       global_avg,
        "scored_students":        len(scored_avgs),
        "category_averages":      cohort_cat_avgs,
        "weakest_categories":     _sorted_categories(cohort_cat_avgs, ascending=True),
        "readiness_distribution": tier_counts,
        "zero_offer_risk_count":  zero_risk_count,
        "answer_flag_averages":   flag_aggregates,
        "viz_shapes": {
            "radar":              radar_shape,
            "traffic_light":      traffic_light,
            "department_comparison": dept_comparison,
            "diverging_bar":      diverging_bar,
            "score_distribution": {
                "buckets":        dist_buckets,
                "mean":           global_avg,
                "std_dev":        std_dev,
                "cohort_size":    total,
                "scored_students":len(scored_avgs),
            },
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS / PERFORMANCE  (new endpoint — Q1, Q2, Q3, Q6)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analytics/performance")
async def analytics_performance(
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Full cohort performance analytics with all 14 rubric category breakdowns.

    Returns every viz shape needed by the frontend performance dashboard tab:
      radar polygon, per-student summary (tier + percentile + risk),
      dept × category comparison matrix, score distribution, traffic-light
      grid, diverging bar, answer quality flag aggregates.

    Two SQL queries total. All derived metrics computed in Python.
    Supports optional filtering by department_id, year_id, batch_id.
    """
    org_id = admin.organization_id
    extra_clause, extra_params, _ = _segment_filter_clause(
        department_id, year_id, batch_id, start_idx=1
    )
    async with DatabaseConnection() as conn:
        perf_rows = await _fetch_perf_aggregate(conn, org_id, extra_clause, extra_params)

    total = len(perf_rows)
    scored_avgs: list[float] = [
        float(r["avg_score"]) for r in perf_rows if r["avg_score"] is not None
    ]
    global_avg = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    std_dev    = _safe_round(_stats.stdev(scored_avgs)) if len(scored_avgs) >= 2 else None

    # 75th-percentile threshold for top-quartile radar overlay
    p75_threshold = sorted(scored_avgs)[int(len(scored_avgs) * 0.75)] if len(scored_avgs) >= 4 else None

    student_summaries: list[dict] = []
    tier_counts: dict[str, int]   = {
        _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
    }
    zero_risk_count  = 0
    tq_rows: list    = []
    per_student_cats: list[dict[str, float | None]] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        risk = _zero_offer_risk(avg, sc, None)
        pct  = _compute_percentile(float(avg), scored_avgs) if avg is not None else None

        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        if risk:
            zero_risk_count += 1
        if p75_threshold is not None and avg is not None and float(avg) >= p75_threshold:
            tq_rows.append(r)

        cat_scores = _extract_cat_scores(r)
        per_student_cats.append(cat_scores)

        student_summaries.append({
            "user_id":          str(r["user_id"]),
            "name":             r["full_name"],
            "email":            r["email"],
            "student_code":     r["student_code"],
            "department_name":  r["department_name"],
            "year_name":        r["year_name"],
            "batch_name":       r["batch_name"],
            "session_count":    sc,
            "avg_score":        avg,
            "best_score":       _safe_round(r["best_score"]),
            "readiness_tier":   tier,
            "zero_offer_risk":  risk,
            "cohort_percentile":pct,
            "category_scores":  cat_scores,
        })

    cohort_cat_avgs = _cohort_category_averages(per_student_cats)
    top_q_cat_avgs  = _cohort_category_averages([_extract_cat_scores(r) for r in tq_rows])
    flag_aggregates = _build_answer_flag_aggregates(perf_rows)
    dept_comparison = _build_dept_comparison(perf_rows)
    radar_shape     = _build_radar_shape(cohort_cat_avgs, top_q_cat_avgs)
    traffic_light   = _build_traffic_light(tier_counts, total)
    diverging_bar   = _build_diverging_bar(cohort_cat_avgs, global_avg)
    dist_buckets    = _build_score_distribution(scored_avgs)

    return {
        "filters": {
            "department_id": department_id,
            "year_id":       year_id,
            "batch_id":      batch_id,
        },
        "summary": {
            "total_students":        total,
            "scored_students":       len(scored_avgs),
            "cohort_avg_score":      global_avg,
            "cohort_std_dev":        std_dev,
            "zero_offer_risk_count": zero_risk_count,
        },
        "category_averages":      cohort_cat_avgs,
        "weakest_categories":     _sorted_categories(cohort_cat_avgs, ascending=True),
        "readiness_distribution": tier_counts,
        "answer_flag_averages":   flag_aggregates,
        "department_comparison":  dept_comparison,
        "students":               student_summaries,
        "viz_shapes": {
            "radar":              radar_shape,
            "traffic_light":      traffic_light,
            "diverging_bar":      diverging_bar,
            "department_comparison": dept_comparison,
            "score_distribution": {
                "buckets":        dist_buckets,
                "mean":           global_avg,
                "std_dev":        std_dev,
                "cohort_size":    total,
                "scored_students":len(scored_avgs),
            },
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS / GROWTH  (new endpoint — Q4, Q5)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analytics/growth")
async def analytics_growth(
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Growth and trend analytics — the primary answer to 'is training working?'

    Returns:
      - Per-student: growth delta (first→latest), OLS slope, stuck flag,
        zero-offer risk (slope-enhanced), time-to-threshold, category deltas
        and category slopes for all 14 rubric categories.
      - Stuck student list (≥ 3 sessions, slope ≤ 0.5 pts/session).
      - Zero-offer risk list with slope-informed flag.
      - Growth heatmap viz shape (student × category delta matrix).
      - Cohort monthly trend (overall + all 14 categories) for multi-line chart.
      - Calendar activity heatmap (sessions/day, last 365 days).

    Three SQL queries total. All slope and delta computation is Python-side
    from bulk-fetched ordered session data — zero N+1.
    """
    org_id = admin.organization_id
    extra_clause, extra_params, _ = _segment_filter_clause(
        department_id, year_id, batch_id, start_idx=1
    )

    async with DatabaseConnection() as conn:
        # Query 1: Ordered session series for OLS slope computation
        series_rows = await _fetch_session_series(conn, org_id, extra_clause, extra_params)

        # Query 2: Cohort monthly category trend for multi-line chart
        month_params: list = [org_id] + extra_params
        monthly_rows = await conn.fetch(
            f"""
            SELECT
                TO_CHAR(DATE_TRUNC('month', isess.created_at), 'YYYY-MM') AS month,
                ROUND(AVG(isess.final_score)::numeric, 1)                              AS overall,
                ROUND(AVG((isess.rubric_scores->>'communication')::numeric)::numeric, 1)   AS communication,
                ROUND(AVG((isess.rubric_scores->>'technical_depth')::numeric)::numeric, 1) AS technical_depth,
                ROUND(AVG((isess.rubric_scores->>'problem_solving')::numeric)::numeric, 1) AS problem_solving,
                ROUND(AVG((isess.rubric_scores->>'confidence')::numeric)::numeric, 1)      AS confidence,
                ROUND(AVG((isess.rubric_scores->>'structure_star')::numeric)::numeric, 1)  AS structure_star,
                ROUND(AVG((isess.rubric_scores->>'vocabulary')::numeric)::numeric, 1)      AS vocabulary,
                ROUND(AVG((isess.rubric_scores->>'vocal_delivery')::numeric)::numeric, 1)  AS vocal_delivery,
                ROUND(AVG((isess.rubric_scores->>'leadership')::numeric)::numeric, 1)      AS leadership,
                ROUND(AVG((isess.rubric_scores->>'teamwork')::numeric)::numeric, 1)        AS teamwork,
                ROUND(AVG((isess.rubric_scores->>'adaptability')::numeric)::numeric, 1)    AS adaptability,
                ROUND(AVG((isess.rubric_scores->>'reasoning')::numeric)::numeric, 1)       AS reasoning,
                ROUND(AVG((isess.rubric_scores->>'conciseness')::numeric)::numeric, 1)     AS conciseness,
                ROUND(AVG((isess.rubric_scores->>'professionalism')::numeric)::numeric, 1) AS professionalism,
                ROUND(AVG((isess.rubric_scores->>'role_fit')::numeric)::numeric, 1)        AS role_fit
            FROM organization_students os
            JOIN interview_sessions isess ON isess.user_id = os.user_id
                                         AND isess.state = 'FINISHED'
            WHERE os.organization_id = $1
              AND os.status          = 'active'
              {extra_clause}
            GROUP BY DATE_TRUNC('month', isess.created_at)
            ORDER BY DATE_TRUNC('month', isess.created_at)
            """,
            *month_params,
        )

        # Query 3: Calendar activity heatmap — sessions per day, last 365 days
        cal_params: list = [org_id] + extra_params
        calendar_rows = await conn.fetch(
            f"""
            SELECT
                TO_CHAR(DATE_TRUNC('day', isess.created_at), 'YYYY-MM-DD') AS session_date,
                COUNT(*) AS session_count
            FROM organization_students os
            JOIN interview_sessions isess ON isess.user_id = os.user_id
                                         AND isess.state = 'FINISHED'
            WHERE os.organization_id = $1
              AND os.status          = 'active'
              AND isess.created_at   >= NOW() - INTERVAL '365 days'
              {extra_clause}
            GROUP BY DATE_TRUNC('day', isess.created_at)
            ORDER BY DATE_TRUNC('day', isess.created_at)
            """,
            *cal_params,
        )

    # Python-side: group session series by student, compute growth metrics
    growth_map = _compute_student_growth_map(series_rows)

    student_growth_list: list[dict] = []
    stuck_students:      list[dict] = []
    zero_risk_with_slope:list[dict] = []

    for uid, g in growth_map.items():
        sessions  = len(g["scores"])
        avg_score = _safe_round(_stats.mean(g["scores"])) if g["scores"] else None
        slope     = g["trend_slope"]
        is_stuck  = g["is_stuck"]
        zero_risk = _zero_offer_risk(avg_score, sessions, slope)

        entry = {
            "user_id":           uid,
            "sessions":          sessions,
            "first_score":       _safe_round(g["first_score"]),
            "latest_score":      _safe_round(g["latest_score"]),
            "overall_delta":     g["overall_delta"],
            "trend_slope":       slope,
            "is_stuck":          is_stuck,
            "zero_offer_risk":   zero_risk,
            "time_to_threshold": g["time_to_threshold"],
            "category_deltas":   {cat: _safe_round(v) for cat, v in g["category_deltas"].items()},
            "category_slopes":   g["category_slopes"],
        }
        student_growth_list.append(entry)
        if is_stuck:
            stuck_students.append(entry)
        if zero_risk:
            zero_risk_with_slope.append(entry)

    # Sort by overall_delta descending (most improved first); NULLs last
    student_growth_list.sort(
        key=lambda x: (x["overall_delta"] is None, -(x["overall_delta"] or 0))
    )

    # Monthly trend viz shape for multi-line chart
    months_list    = [r["month"] for r in monthly_rows]
    overall_series = [_safe_round(r["overall"]) for r in monthly_rows]
    cat_series     = [
        {"category": cat, "values": [_safe_round(r[cat]) for r in monthly_rows]}
        for cat in _RUBRIC_CATEGORIES
    ]

    total_cal_sessions = sum(int(r["session_count"]) for r in calendar_rows)
    active_days        = len(calendar_rows)

    return {
        "filters": {
            "department_id": department_id,
            "year_id":       year_id,
            "batch_id":      batch_id,
        },
        "summary": {
            "students_with_sessions": len(growth_map),
            "stuck_student_count":    len(stuck_students),
            "zero_offer_risk_count":  len(zero_risk_with_slope),
        },
        "student_growth":  student_growth_list,
        "stuck_students":  stuck_students,
        "zero_offer_risk": zero_risk_with_slope,
        "viz_shapes": {
            "growth_heatmap": {
                "students": [
                    {
                        "user_id":         e["user_id"],
                        "sessions":        e["sessions"],
                        "overall_delta":   e["overall_delta"],
                        "trend_slope":     e["trend_slope"],
                        "is_stuck":        e["is_stuck"],
                        "category_deltas": e["category_deltas"],
                    }
                    for e in student_growth_list
                ]
            },
            "monthly_trend": {
                "months":  months_list,
                "overall": overall_series,
                "series":  cat_series,
            },
            "calendar_heatmap": {
                "data": [
                    {"date": str(r["session_date"]), "session_count": int(r["session_count"])}
                    for r in calendar_rows
                ],
                "total_sessions": total_cal_sessions,
                "active_days":    active_days,
            },
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS / READINESS  (new endpoint — Q1, Q5, Q6)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analytics/readiness")
async def analytics_readiness(
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Readiness grid and zero-offer risk list — the primary TPO decision surface.

    Returns full tier breakdown (ready / almost_ready / developing / at_risk)
    with the complete student list per tier, plus zero-offer risk list with
    enough detail to drive a targeted training intervention email.

    One SQL query. All classification done in Python.
    """
    org_id = admin.organization_id
    extra_clause, extra_params, _ = _segment_filter_clause(
        department_id, year_id, batch_id, start_idx=1
    )
    async with DatabaseConnection() as conn:
        perf_rows = await _fetch_perf_aggregate(conn, org_id, extra_clause, extra_params)

    scored_avgs: list[float] = [
        float(r["avg_score"]) for r in perf_rows if r["avg_score"] is not None
    ]
    tier_buckets: dict[str, list[dict]] = {
        _TIER_READY: [], _TIER_ALMOST_READY: [], _TIER_DEVELOPING: [], _TIER_AT_RISK: [],
    }
    zero_risk_list: list[dict] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        risk = _zero_offer_risk(avg, sc, None)
        pct  = _compute_percentile(float(avg), scored_avgs) if avg is not None else None
        ttt  = _time_to_threshold(avg, None)   # slope not available without growth query

        entry = {
            "user_id":          str(r["user_id"]),
            "name":             r["full_name"],
            "email":            r["email"],
            "student_code":     r["student_code"],
            "department_name":  r["department_name"],
            "year_name":        r["year_name"],
            "batch_name":       r["batch_name"],
            "session_count":    sc,
            "avg_score":        avg,
            "readiness_tier":   tier,
            "cohort_percentile":pct,
            "time_to_threshold":ttt,
            "zero_offer_risk":  risk,
        }
        tier_buckets[tier].append(entry)
        if risk:
            zero_risk_list.append(entry)

    total      = len(perf_rows)
    tier_counts = {k: len(v) for k, v in tier_buckets.items()}

    return {
        "filters": {
            "department_id": department_id,
            "year_id":       year_id,
            "batch_id":      batch_id,
        },
        "summary": {
            "total_students":        total,
            "zero_offer_risk_count": len(zero_risk_list),
        },
        "readiness_distribution": tier_counts,
        "traffic_light":          _build_traffic_light(tier_counts, total),
        "tiers": {
            _TIER_READY:        tier_buckets[_TIER_READY],
            _TIER_ALMOST_READY: tier_buckets[_TIER_ALMOST_READY],
            _TIER_DEVELOPING:   tier_buckets[_TIER_DEVELOPING],
            _TIER_AT_RISK:      tier_buckets[_TIER_AT_RISK],
        },
        "zero_offer_risk": zero_risk_list,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STUDENT PERFORMANCE DETAIL  (new endpoint — Q1, Q4)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/students/{student_id}/performance")
async def student_performance(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Full performance profile for one student including growth trajectory.

    Returns:
      - All 14 rubric category averages, deltas, and per-category slopes.
      - Session history (chronological with per-session category breakdown).
      - Growth delta (first → latest), OLS trend slope, stuck flag.
      - Readiness tier, cohort percentile, time-to-threshold, zero-offer risk.

    Two SQL queries: student session history + cohort avg for percentile.
    """
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id

    async with DatabaseConnection() as conn:
        # Verify membership and fetch identity
        org_student = await conn.fetchrow(
            """SELECT os.*, p.email, p.full_name, p.plan,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id
               WHERE os.id = $1 AND os.organization_id = $2""",
            student_id, org_id,
        )
        if not org_student:
            raise HTTPException(404, "Student not found in your organization.")

        user_id = str(org_student["user_id"])

        # Query 1: Complete chronological session history with rubric scores
        # ASSUMPTION: interview_sessions has target_role, interview_type, duration_actual_seconds columns.
        session_rows = await conn.fetch(
            """SELECT isess.id, isess.final_score, isess.created_at, isess.target_role AS job_role, isess.interview_type,
                      isess.duration_actual_seconds AS duration_seconds, isess.rubric_scores, 
                      jsonb_build_object(
                          'filler_ratio', aqf.filler_word_ratio,
                          'star_usage', aqf.star_usage_score >= 5.0,
                          'evasiveness', aqf.evasiveness_score >= 5.0,
                          'tone_positivity', aqf.tone_score,
                          'specificity', aqf.answer_completeness_ratio,
                          'confidence_markers', aqf.confidence_signal_score,
                          'technical_accuracy', aqf.grammar_score,
                          'leadership_signals', aqf.vocabulary_richness >= 0.5,
                          'example_usage', aqf.repetition_ratio <= 0.2
                      ) AS quality_flags, isess.state
               FROM interview_sessions isess
               LEFT JOIN answer_quality_flags aqf ON aqf.session_id = isess.id
               WHERE isess.user_id = $1 AND isess.state = 'FINISHED'
               ORDER BY isess.created_at ASC""",
            user_id,
        )

        # Query 2: All cohort avg scores for percentile rank computation
        cohort_avgs = await conn.fetch(
            """SELECT ROUND(AVG(isess.final_score)::numeric, 1) AS avg_score
               FROM organization_students os
               JOIN interview_sessions isess ON isess.user_id = os.user_id
                                            AND isess.state = 'FINISHED'
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY os.user_id""",
            org_id,
        )

    # Build session history + extract category series
    sessions_list: list[dict] = []
    overall_scores: list[float] = []
    cat_series: dict[str, list[float]] = {cat: [] for cat in _RUBRIC_CATEGORIES}

    for i, s in enumerate(session_rows, 1):
        fs = float(s["final_score"]) if s["final_score"] is not None else None
        if fs is not None:
            overall_scores.append(fs)

        rs = s["rubric_scores"]
        session_cats: dict[str, float | None] = {}
        for cat in _RUBRIC_CATEGORIES:
            try:
                v = rs.get(cat) if rs and hasattr(rs, "get") else None
                session_cats[cat] = _safe_round(float(v)) if v is not None else None
                if session_cats[cat] is not None:
                    cat_series[cat].append(session_cats[cat])  # type: ignore[arg-type]
            except (TypeError, ValueError):
                session_cats[cat] = None

        sessions_list.append({
            "session_number":   i,
            "session_id":       str(s["id"]),
            "final_score":      _safe_round(fs),
            "created_at":       s["created_at"].isoformat() if s["created_at"] else None,
            "job_role":         s["job_role"],
            "interview_type":   s["interview_type"],
            "duration_seconds": s["duration_seconds"],
            "category_scores":  session_cats,
        })

    # Compute growth metrics
    slope  = _compute_slope(overall_scores)
    avg    = _safe_round(_stats.mean(overall_scores)) if overall_scores else None
    first  = _safe_round(overall_scores[0])  if overall_scores else None
    latest = _safe_round(overall_scores[-1]) if overall_scores else None
    delta  = _safe_round(latest - first) if (first is not None and latest is not None) else None
    tier   = _readiness_tier(avg, len(overall_scores))
    risk   = _zero_offer_risk(avg, len(overall_scores), slope)
    ttt    = _time_to_threshold(avg, slope)
    stuck  = _is_stuck(len(overall_scores), slope)

    # Cohort percentile
    all_cohort_avgs = [float(r["avg_score"]) for r in cohort_avgs if r["avg_score"] is not None]
    pct = _compute_percentile(float(avg), all_cohort_avgs) if avg is not None else None

    # Per-category aggregates
    cat_avgs:   dict[str, float | None] = {}
    cat_deltas: dict[str, float | None] = {}
    cat_slopes: dict[str, float | None] = {}
    for cat in _RUBRIC_CATEGORIES:
        vals = cat_series[cat]
        cat_avgs[cat]   = _safe_round(_stats.mean(vals)) if vals else None
        cat_deltas[cat] = _safe_round(vals[-1] - vals[0]) if len(vals) >= 2 else None
        cat_slopes[cat] = _compute_slope(vals)

    return {
        "student": dict(org_student),
        "performance": {
            "session_count":     len(overall_scores),
            "avg_score":         avg,
            "best_score":        _safe_round(max(overall_scores)) if overall_scores else None,
            "first_score":       first,
            "latest_score":      latest,
            "overall_delta":     delta,
            "trend_slope":       slope,
            "is_stuck":          stuck,
            "readiness_tier":    tier,
            "zero_offer_risk":   risk,
            "cohort_percentile": pct,
            "time_to_threshold": ttt,
            "category_averages": cat_avgs,
            "category_deltas":   cat_deltas,
            "category_slopes":   cat_slopes,
        },
        "sessions": sessions_list,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACCESS LOG
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/access-control")
async def access_control_summary(
    page:      int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Access control overview with paginated student lists.

    ✅ FIXED: Was LIMIT 100 hardcoded — silently truncated colleges with > 100
    students with no indication that data was missing. Replaced with proper
    pagination matching the rest of the file.
    """
    org_id   = admin.organization_id
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        org          = await conn.fetchrow(
            "SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id
        )
        total_seats  = org["seat_limit"] if org else 0
        used         = org["seats_used"] if org else 0
        access_count = await conn.fetchval(
            """SELECT COUNT(*) FROM organization_students
               WHERE organization_id=$1 AND has_career_access=TRUE AND status='active'""",
            org_id,
        )
        no_access = await conn.fetch(
            """SELECT os.id, os.student_code, p.email, p.full_name,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id
               WHERE os.organization_id=$1 AND os.has_career_access=FALSE AND os.status='active'
               ORDER BY os.added_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset,
        )
        with_access = await conn.fetch(
            """SELECT os.id, os.student_code, os.access_granted_at, os.access_expires_at,
                      p.email, p.full_name, cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id
               WHERE os.organization_id=$1 AND os.has_career_access=TRUE AND os.status='active'
               ORDER BY os.access_granted_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset,
        )
        recent_log = await conn.fetch(
            """SELECT oal.*, p1.email AS student_email
               FROM organization_access_log oal
               LEFT JOIN profiles p1 ON p1.id = oal.student_user_id
               WHERE oal.organization_id=$1
                 AND oal.action IN ('grant_access', 'revoke_access')
               ORDER BY oal.created_at DESC LIMIT 50""",
            org_id,
        )
    return {
        "total_seats":             total_seats,
        "used_seats":              used,
        "available_seats":         total_seats - used,
        "career_access_count":     access_count,
        "students_without_access": [dict(r) for r in no_access],
        "students_with_access":    [dict(r) for r in with_access],
        "recent_access_log":       [dict(r) for r in recent_log],
        "page":                    page,
        "page_size":               ps,
    }


# ══════════════════════════════════════════════════════════════════════════════
# COHORT SUMMARY EXPORT HELPER
# (shared by /reports/export?export_type=cohort_summary and /reports/cohort-export)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/reports/export")
async def export_student_reports(
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    export_format: str = "json",       # ✅ FIXED: renamed from 'format' — shadows Python built-in
    export_type:   str = "students",   # "students" (default, backward-compat) | "cohort_summary"
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Student or cohort-level export with full performance data.

    export_type=students (default — backward-compatible):
      One row per student. Original fields preserved in original column order.
      New columns appended: 14 rubric category averages, readiness tier,
      growth delta, OLS trend slope, stuck flag, zero-offer risk flag,
      cohort percentile, first/latest scores, sessions count.

    export_type=cohort_summary:
      One row per department + one per batch. Designed for NAAC/NIRF reporting.

    Two SQL queries for students export (aggregate + session series for slopes).
    One SQL query for cohort_summary.
    """
    org_id = admin.organization_id
    extra_clause, extra_params, _ = _segment_filter_clause(
        department_id, year_id, batch_id, start_idx=1
    )

    async with DatabaseConnection() as conn:
        if export_type == "cohort_summary":
            perf_rows = await _fetch_perf_aggregate(conn, org_id, extra_clause, extra_params)
            return _render_cohort_summary_export(perf_rows, export_format, org_id)

        # ── Default: student-level export ─────────────────────────────────────
        # Build WHERE clause (same f-string pattern as list_students)
        where  = ["os.organization_id = $1", "os.status != 'removed'"]
        params: list = [org_id] + extra_params
        for part in (extra_clause.strip().lstrip("AND").strip().split(" AND ") if extra_clause else []):
            p = part.strip()
            if p:
                where.append(p)
        w = " AND ".join(where)

        rows = await conn.fetch(
            f"""SELECT p.full_name, p.email, os.student_code,
                       cd.department_name, cy.year_name, cb.batch_name, os.section,
                       os.has_career_access, os.access_granted_at, os.status, os.added_at,
                       os.user_id,
                       -- Original stats (column names unchanged for backward compat)
                       COALESCE(si.total_interviews, 0) AS total_interviews,
                       si.avg_score,
                       si.best_score,
                       si.last_activity,
                       -- NEW: first/latest for delta
                       si.first_score,
                       si.latest_score,
                       -- NEW: all 14 category averages
                       si.avg_communication,
                       si.avg_technical_depth,
                       si.avg_problem_solving,
                       si.avg_confidence,
                       si.avg_structure_star,
                       si.avg_vocabulary,
                       si.avg_vocal_delivery,
                       si.avg_leadership,
                       si.avg_teamwork,
                       si.avg_adaptability,
                       si.avg_reasoning,
                       si.avg_conciseness,
                       si.avg_professionalism,
                       si.avg_role_fit,
                       -- NEW: quality flag aggregates
                       si.avg_filler_ratio,
                       si.star_usage_count
                FROM organization_students os
                JOIN profiles p ON p.id = os.user_id
                LEFT JOIN college_departments cd ON cd.id = os.department_id
                LEFT JOIN college_years       cy ON cy.id = os.year_id
                LEFT JOIN college_batches     cb ON cb.id = os.batch_id
                LEFT JOIN (
                    SELECT
                        isess.user_id,
                        COUNT(isess.id)                                                                       AS total_interviews,
                        ROUND(AVG(isess.final_score)::numeric, 1)                                             AS avg_score,
                        MAX(isess.final_score)                                                                AS best_score,
                        MAX(isess.created_at)                                                                 AS last_activity,
                        (ARRAY_AGG(isess.final_score ORDER BY isess.created_at ASC)  FILTER (WHERE isess.state = 'FINISHED'))[1] AS first_score,
                        (ARRAY_AGG(isess.final_score ORDER BY isess.created_at DESC) FILTER (WHERE isess.state = 'FINISHED'))[1] AS latest_score,
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
                        ROUND(AVG(aqf.filler_word_ratio)
                              FILTER (WHERE isess.state = 'FINISHED'), 3)   AS avg_filler_ratio,
                        COUNT(isess.id) FILTER (WHERE isess.state = 'FINISHED'
                              AND aqf.star_usage_score >= 5.0)  AS star_usage_count
                    FROM interview_sessions isess
                    LEFT JOIN answer_quality_flags aqf ON aqf.session_id = isess.id
                    GROUP BY isess.user_id
                ) si ON si.user_id = os.user_id
                WHERE {w} ORDER BY p.full_name""",
            *params,
        )

        # Query 2: Session series for OLS slope computation
        series_rows = await _fetch_session_series(conn, org_id, extra_clause, extra_params)

    growth_map = _compute_student_growth_map(series_rows)

    # Cohort avg scores for percentile computation
    all_cohort_avgs: list[float] = [
        float(r["avg_score"]) for r in rows if r["avg_score"] is not None
    ]

    if export_format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            # Original columns (unchanged order — backward compatible)
            "Name", "Email", "Student ID", "Department", "Year", "Batch", "Section",
            "Career Access", "Access Granted", "Status", "Joined",
            "Total Interviews", "Avg Score", "Best Score", "Last Activity",
            # New columns (appended)
            "Sessions Count", "First Score", "Latest Score", "Growth Delta",
            "Trend Slope (pts/session)", "Readiness Tier", "Zero Offer Risk",
            "Is Stuck", "Cohort Percentile (%)", "Sessions Needed to Ready",
            # 14 category scores
            "Avg Communication", "Avg Technical Depth", "Avg Problem Solving",
            "Avg Confidence", "Avg Structure/STAR", "Avg Vocabulary",
            "Avg Vocal Delivery", "Avg Leadership", "Avg Teamwork", "Avg Adaptability",
            "Avg Reasoning", "Avg Conciseness", "Avg Professionalism", "Avg Role Fit",
            # Quality flags
            "Avg Filler Ratio", "STAR Usage Sessions",
        ])
        for r in rows:
            uid    = str(r["user_id"])
            g      = growth_map.get(uid, {})
            sc     = int(r["total_interviews"] or 0)
            avg    = _safe_round(r["avg_score"])
            slope  = g.get("trend_slope")
            first  = _safe_round(r["first_score"])
            latest = _safe_round(r["latest_score"])
            delta  = _safe_round(latest - first) if (first is not None and latest is not None) else None
            tier   = _readiness_tier(avg, sc)
            risk   = _zero_offer_risk(avg, sc, slope)
            stuck  = _is_stuck(sc, slope)
            pct    = _compute_percentile(float(avg), all_cohort_avgs) if avg is not None else None
            ttt    = _time_to_threshold(avg, slope)
            # ✅ SEC: _sanitize_csv_cell() on every user-controlled field
            writer.writerow([
                _sanitize_csv_cell(r["full_name"]),
                _sanitize_csv_cell(r["email"]),
                _sanitize_csv_cell(r["student_code"]),
                _sanitize_csv_cell(r["department_name"]),
                _sanitize_csv_cell(r["year_name"]),
                _sanitize_csv_cell(r["batch_name"]),
                _sanitize_csv_cell(r["section"]),
                "Yes" if r["has_career_access"] else "No",
                _sanitize_csv_cell(r["access_granted_at"]),
                _sanitize_csv_cell(r["status"]),
                _sanitize_csv_cell(r["added_at"]),
                _sanitize_csv_cell(r["total_interviews"]),
                _sanitize_csv_cell(avg),
                _sanitize_csv_cell(_safe_round(r["best_score"])),
                _sanitize_csv_cell(r["last_activity"]),
                # New columns
                sc,
                _sanitize_csv_cell(first),
                _sanitize_csv_cell(latest),
                _sanitize_csv_cell(delta),
                _sanitize_csv_cell(slope),
                _sanitize_csv_cell(tier),
                "Yes" if risk  else "No",
                "Yes" if stuck else "No",
                _sanitize_csv_cell(pct),
                _sanitize_csv_cell(ttt),
                # 14 categories
                _sanitize_csv_cell(_safe_round(r["avg_communication"])),
                _sanitize_csv_cell(_safe_round(r["avg_technical_depth"])),
                _sanitize_csv_cell(_safe_round(r["avg_problem_solving"])),
                _sanitize_csv_cell(_safe_round(r["avg_confidence"])),
                _sanitize_csv_cell(_safe_round(r["avg_structure_star"])),
                _sanitize_csv_cell(_safe_round(r["avg_vocabulary"])),
                _sanitize_csv_cell(_safe_round(r["avg_vocal_delivery"])),
                _sanitize_csv_cell(_safe_round(r["avg_leadership"])),
                _sanitize_csv_cell(_safe_round(r["avg_teamwork"])),
                _sanitize_csv_cell(_safe_round(r["avg_adaptability"])),
                _sanitize_csv_cell(_safe_round(r["avg_reasoning"])),
                _sanitize_csv_cell(_safe_round(r["avg_conciseness"])),
                _sanitize_csv_cell(_safe_round(r["avg_professionalism"])),
                _sanitize_csv_cell(_safe_round(r["avg_role_fit"])),
                # Quality flags
                _sanitize_csv_cell(_safe_round(r["avg_filler_ratio"], 3)),
                _sanitize_csv_cell(r["star_usage_count"]),
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=students_report_{org_id[:8]}.csv"},
        )

    # ── JSON response (extended, all new fields appended) ────────────────────
    students_out: list[dict] = []
    for r in rows:
        uid    = str(r["user_id"])
        g      = growth_map.get(uid, {})
        sc     = int(r["total_interviews"] or 0)
        avg    = _safe_round(r["avg_score"])
        slope  = g.get("trend_slope")
        first  = _safe_round(r["first_score"])
        latest = _safe_round(r["latest_score"])
        delta  = _safe_round(latest - first) if (first is not None and latest is not None) else None
        students_out.append({
            # Original fields (unchanged)
            "full_name":        r["full_name"],
            "email":            r["email"],
            "student_code":     r["student_code"],
            "department_name":  r["department_name"],
            "year_name":        r["year_name"],
            "batch_name":       r["batch_name"],
            "section":          r["section"],
            "has_career_access":r["has_career_access"],
            "access_granted_at":r["access_granted_at"],
            "status":           r["status"],
            "added_at":         r["added_at"],
            "total_interviews": sc,
            "avg_score":        avg,
            "best_score":       _safe_round(r["best_score"]),
            "last_activity":    r["last_activity"],
            # New fields
            "first_score":      first,
            "latest_score":     latest,
            "growth_delta":     delta,
            "trend_slope":      slope,
            "readiness_tier":   _readiness_tier(avg, sc),
            "zero_offer_risk":  _zero_offer_risk(avg, sc, slope),
            "is_stuck":         _is_stuck(sc, slope),
            "cohort_percentile":_compute_percentile(float(avg), all_cohort_avgs) if avg is not None else None,
            "time_to_threshold":_time_to_threshold(avg, slope),
            "category_scores":  {cat: _safe_round(r[f"avg_{cat}"]) for cat in _RUBRIC_CATEGORIES},
            "avg_filler_ratio": _safe_round(r["avg_filler_ratio"], 3),
            "star_usage_count": int(r["star_usage_count"] or 0),
        })

    return {"students": students_out, "total": len(students_out)}


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS / COHORT-EXPORT  (new dedicated endpoint — Q2, Q6)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/reports/cohort-export")
async def export_cohort_report(
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    export_format: str = "json",
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Dedicated cohort-level aggregate report for NAAC/NIRF/management submissions.

    One row per department + one per batch. Each row contains:
      student count, session count, avg sessions/student, overall avg score,
      all 14 rubric category averages, readiness tier distribution (counts + %),
      zero-offer risk count.

    One SQL query. All aggregation is Python-side from bulk-fetched data.
    """
    org_id = admin.organization_id
    extra_clause, extra_params, _ = _segment_filter_clause(
        department_id, year_id, batch_id, start_idx=1
    )
    async with DatabaseConnection() as conn:
        perf_rows = await _fetch_perf_aggregate(conn, org_id, extra_clause, extra_params)

    return _render_cohort_summary_export(perf_rows, export_format, org_id)


# ══════════════════════════════════════════════════════════════════════════════
#  Command Centre — full cohort dataset for the embedded 67-chart dashboard.
#  Returns the org's real students in the exact shape the dashboard's data layer
#  (window.PVCC.load) consumes, so every one of the 67 charts renders on live data.
# ══════════════════════════════════════════════════════════════════════════════

# The dashboard's six canonical skills, mapped to real rubric categories (averaged;
# fallback = the session's final score). Values are scaled 0–10 → 0–100.
_CC_SKILLS = ['Technical Depth', 'Problem Solving', 'Communication', 'Behavioral', 'System Design', 'Specificity']
_CC_SKILL_MAP = {
    'Technical Depth': ['technical_depth'],
    'Problem Solving': ['problem_solving', 'reasoning'],
    'Communication': ['communication', 'vocal_delivery'],
    'Behavioral': ['structure_star', 'teamwork', 'leadership'],
    'System Design': ['reasoning', 'technical_depth'],
    'Specificity': ['conciseness', 'vocabulary'],
}


def _cc_coerce(v: Any) -> dict:
    """rubric_scores may arrive as a JSON string (text col) or dict (jsonb)."""
    if v is None:
        return {}
    if isinstance(v, dict):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return {}


def _cc_skills(rubric: dict, fallback: float) -> dict:
    """Map a session's rubric_scores (0–10 per category) to the 6 skills on 0–100."""
    out: dict[str, float] = {}
    for sk in _CC_SKILLS:
        vals = []
        for cat in _CC_SKILL_MAP[sk]:
            c = rubric.get(cat)
            if c is not None:
                try:
                    vals.append(float(c) * 10.0)
                except (TypeError, ValueError):
                    pass
        out[sk] = round(sum(vals) / len(vals)) if vals else round(fallback)
    return out


@router.get("/command-centre")
async def command_centre(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Live cohort dataset for the embedded Placement Command Centre dashboard."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow(
            "SELECT name, seat_limit FROM organizations WHERE id = $1", org_id
        )
        roster = await conn.fetch(
            """SELECT os.user_id, p.full_name, p.email, cd.department_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               WHERE os.organization_id = $1 AND os.status != 'removed'
               ORDER BY p.full_name NULLS LAST""",
            org_id,
        )
        user_ids = [r["user_id"] for r in roster]
        session_rows = []
        if user_ids:
            session_rows = await conn.fetch(
                """SELECT user_id, final_score, rubric_scores, created_at, target_role
                   FROM interview_sessions
                   WHERE user_id = ANY($1::uuid[]) AND state = 'FINISHED'
                   ORDER BY user_id, created_at ASC""",
                user_ids,
            )

    by_user: dict[str, list] = {}
    for s in session_rows:
        by_user.setdefault(str(s["user_id"]), []).append(s)

    now = datetime.now(timezone.utc)
    students: list[dict] = []
    depts_seen: dict[str, bool] = {}

    for idx, r in enumerate(roster):
        uid = str(r["user_id"])
        dept = ((r["department_name"] or "").strip()) or "Unassigned"
        depts_seen[dept] = True
        sess = by_user.get(uid, [])
        started = len(sess) > 0
        name = ((r["full_name"] or "") or (r["email"] or "Student").split("@")[0]).strip() or "Student"

        if started:
            first, last = sess[0], sess[-1]
            f_final = float(first["final_score"] or 0)
            l_final = float(last["final_score"] or 0)
            skills_first = _cc_skills(_cc_coerce(first["rubric_scores"]), f_final)
            skills_now = _cc_skills(_cc_coerce(last["rubric_scores"]), l_final)
            first_score = round(f_final)
            latest_score = round(l_final)
            n_sess = len(sess)
            slope = round((latest_score - first_score) / max(2, n_sess) * 3, 2)
            stuck = n_sess >= 3 and slope <= 0.35
            if latest_score >= 76:
                tier = "Ready"
            elif latest_score >= 66:
                tier = "Almost"
            elif latest_score >= 52 and not stuck:
                tier = "Developing"
            else:
                tier = "At Risk"
            at_risk = tier == "At Risk" or (stuck and latest_score < 60)
            last_dt = last["created_at"]
            last_active = max(0, (now - last_dt).days) if last_dt else 90
            stt = (
                math.ceil((76 - latest_score) / max(slope, 0.2))
                if (slope > 0.2 and latest_score < 76)
                else None
            )
            target_role = last["target_role"] or "Software Engineer"
        else:
            skills_first = {sk: 0 for sk in _CC_SKILLS}
            skills_now = dict(skills_first)
            first_score = latest_score = 0
            n_sess = 0
            slope = 0
            stuck = False
            tier = "At Risk"
            at_risk = True
            last_active = 90
            stt = None
            target_role = "Software Engineer"

        students.append({
            "id": idx,
            "name": name,
            "dept": dept,
            "sessions": n_sess,
            "started": started,
            "skillsFirst": skills_first,
            "skillsNow": skills_now,
            "firstScore": first_score,
            "latestScore": latest_score,
            "slope": slope,
            "stuck": stuck,
            "tier": tier,
            "atRisk": at_risk,
            "lastActive": last_active,
            "stt": stt,
            "targetRole": target_role,
            "inferredRole": target_role,
        })

    return {
        "college": (org["name"] if org and org["name"] else "Your Institution"),
        "batch": "All students",
        "seats": (org["seat_limit"] if org and org["seat_limit"] else len(roster)),
        "annualFee": 100000,
        "depts": [{"code": d, "name": d} for d in depts_seen],
        "students": students,
    }